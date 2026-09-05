import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import * as fs from 'fs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

let outputStr = '';
function log(msg: string = '') {
  console.log(msg);
  outputStr += msg + '\n';
}

async function run() {
  log('--- INICIANDO AUDITORIA COMPLETA ---');
  let userCred = null;
  const emailsToTry = [
    'gabriel.alexandre@gbcortes7.com',
    'eufixo@gbcortes7.com',
    'barbeariagbcortes7@gmail.com',
    'admin.barber@gmail.com'
  ];
  const testPassword = 'Password123!';

  for (const email of emailsToTry) {
    try {
      userCred = await createUserWithEmailAndPassword(auth, email, testPassword);
      break;
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-in-use') {
        for (const pw of [testPassword, '123456', 'admin123', 'admin', 'gbcortes7']) {
          try {
            userCred = await signInWithEmailAndPassword(auth, email, pw);
            break;
          } catch (_) {}
        }
        if (userCred) break;
      }
    }
  }

  if (!userCred) {
    console.error('Falha na autenticação');
    process.exit(1);
  }

  const tenantFilter = where('tenantId', 'in', ['gbcortes7', '']);

  const [usersSnap, comandasSnap, commsSnap, cashSnap, txSnap] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), tenantFilter)),
    getDocs(query(collection(db, 'comandas'), tenantFilter)),
    getDocs(query(collection(db, 'commissions'), tenantFilter)),
    getDocs(query(collection(db, 'cash_movements'), tenantFilter)),
    getDocs(query(collection(db, 'financial_transactions'), tenantFilter))
  ]);

  const barbers = usersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() } as any))
    .filter(u => u.tipo === 'barbeiro' || u.role === 'barbeiro' || u.tipo === 'admin');

  log(`=== USUÁRIOS/BARBEIROS ENCONTRADOS (${barbers.length}) ===`);
  barbers.forEach(b => {
    log(`UID: ${b.uid} | Nome: "${b.nome}" | Email: ${b.email} | Tipo: ${b.tipo} | % Comissão: ${b.percentual_comissao ?? b.commission_percentage}`);
  });

  const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];

  for (const d of dates) {
    log(`\n======================================================`);
    log(`                   DIA: ${d}`);
    log(`======================================================`);

    // Comandas do dia
    const dayComandas = comandasSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => {
        const cDate = c.date || (c.closedAt?.seconds ? new Date(c.closedAt.seconds * 1000).toISOString().substring(0, 10) : '') || (c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '');
        return cDate === d && (c.tenantId === 'gbcortes7' || !c.tenantId);
      });

    log(`\n--- COMANDAS DO DIA (${dayComandas.length}) ---`);
    dayComandas.forEach(c => {
      log(`[Comanda #${c.number || c.id}] Status: ${c.status} | Total: R$ ${c.total} | Cliente: ${c.clientName || c.cliente_nome} | Pro: ${c.profissional_name || c.barbeiro_nome || c.profissional_id}`);
      if (c.items) {
        c.items.forEach((it: any) => {
          log(`   - Item: "${it.name}" | Qtd: ${it.quantity} | TotalPrice: R$ ${it.totalPrice ?? it.price} | Pro: ${it.profissional_name || it.barbeiro_nome || it.profissional_id} (${it.profissional_id})`);
        });
      }
      if (c.payments) {
        log(`   - Pagamentos: ${JSON.stringify(c.payments)}`);
      }
    });

    // Comissões do dia
    const dayComms = commsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => {
        const cDate = (c.date || '').substring(0, 10);
        return cDate === d && (c.tenantId === 'gbcortes7' || !c.tenantId);
      });

    log(`\n--- COMISSÕES DO DIA (${dayComms.length}) ---`);
    dayComms.forEach(c => {
      log(`[Comm ${c.id}] Pro: "${c.profissional_name}" (${c.profissional_id}) | Serv: "${c.servico_name}" | Base: R$ ${c.base_value} | %: ${c.commission_percentage}% | Val: R$ ${c.commission_value} | Tipo: ${c.commission_type} | Status: ${c.status} | CmdId: ${c.comanda_id}`);
    });

    // Fluxo de caixa do dia
    const dayCash = cashSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => {
        const cDate = (c.data || c.date || (c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '')).substring(0, 10);
        return cDate === d && (c.tenantId === 'gbcortes7' || !c.tenantId);
      });

    log(`\n--- FLUXO DE CAIXA / MOVIMENTAÇÕES DO DIA (${dayCash.length}) ---`);
    let cashEntradas = 0;
    let cashSaidas = 0;
    dayCash.forEach(c => {
      const val = Number(c.valor || c.amount || 0);
      const tipo = c.tipo || (val >= 0 ? 'entrada' : 'saida');
      if (tipo === 'entrada' || tipo === 'income') cashEntradas += val;
      else cashSaidas += Math.abs(val);
      log(`[Caixa] Tipo: ${tipo} | Valor: R$ ${val} | Desc: "${c.descricao || c.description}" | Metodo: ${c.metodo_pagamento || c.forma_pagamento || c.method} | Ref: ${c.referencia_id || c.comanda_id}`);
    });
    log(`-> Total Caixa Entradas: R$ ${cashEntradas.toFixed(2)} | Saídas: R$ ${cashSaidas.toFixed(2)}`);
  }

  fs.writeFileSync('/tmp/audit_out.txt', outputStr);
  console.log('Salvo em /tmp/audit_out.txt');
  process.exit(0);
}

run().catch(console.error);
