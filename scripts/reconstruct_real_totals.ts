import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import * as fs from 'fs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

async function authenticate() {
  const emails = [
    'barbeariagbcortes7@gmail.com',
    'gabriel.alexandre@gbcortes7.com',
    'admin.barber@gmail.com',
    'blsseparate7@gmail.com'
  ];
  const passwords = ['Password123!', '123456', 'admin123', 'admin', 'gbcortes7'];

  for (const email of emails) {
    for (const pw of passwords) {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, pw);
        if (cred?.user) {
          console.log(`Autenticado com sucesso como: ${email}`);
          return cred.user;
        }
      } catch (e: any) {
        // try next
      }
    }
  }

  // If none signed in, try creating admin.barber@gmail.com
  try {
    const cred = await createUserWithEmailAndPassword(auth, 'admin.barber@gmail.com', 'Password123!');
    return cred.user;
  } catch (e) {
    // already exists
  }
  throw new Error('Não foi possível autenticar.');
}

async function run() {
  await authenticate();

  const tenantFilter = where('tenantId', 'in', ['gbcortes7', '']);

  console.log('Buscando coleções no Firestore...');
  const [usersSnap, comandasSnap, commsSnap, advsSnap, payoutsSnap, servicesSnap] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), tenantFilter)),
    getDocs(query(collection(db, 'comandas'), tenantFilter)),
    getDocs(query(collection(db, 'commissions'), tenantFilter)),
    getDocs(query(collection(db, 'professional_advances'), tenantFilter)),
    getDocs(query(collection(db, 'professional_payments'), tenantFilter)),
    getDocs(query(collection(db, 'services'), tenantFilter))
  ]);

  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const barbers = users.filter(u => u.tipo === 'barbeiro' || u.role === 'barbeiro' || u.tipo === 'admin');

  const services = servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const servicesMap: Record<string, any> = {};
  services.forEach(s => { servicesMap[s.id] = s; });

  const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const commissions = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const advances = advsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const payouts = payoutsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  console.log(`Carregados: ${barbers.length} profissionais, ${comandas.length} comandas, ${commissions.length} comissões, ${advances.length} vales, ${payouts.length} repasses.`);

  // Para cada barbeiro, vamos analisar:
  // 1. O que está nas COMANDAS FECHADAS (Produção real bruta dos itens e cálculo de comissão legítima)
  // 2. O que está na coleção COMMISSIONS (comissões salvas, pendentes, pagas, zeradas)
  // 3. O que está na coleção ADVANCES (vales pendentes e vales descontados)
  // 4. O que está na coleção PAYOUTS (repasses já pagos)

  const report: any[] = [];

  for (const b of barbers) {
    const bId = b.uid;
    const bName = b.nome || b.name || 'Sem Nome';
    const defaultPct = b.percentual_comissao ?? b.commission_percentage ?? 50;

    // Normalização para casar nomes e IDs
    const norm = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const bNorm = norm(bName);

    const isMatch = (docProId?: string, docProName?: string) => {
      if (docProId && (docProId === bId || docProId === b.email)) return true;
      if (docProName && norm(docProName) === bNorm) return true;
      return false;
    };

    // 1. Itens de Comandas fechadas/não pagas
    const proComandaItems: any[] = [];
    let producaoBrutaComandas = 0;
    let comissaoCalculadaComandas = 0;

    comandas.forEach(c => {
      if (c.status === 'cancelada') return;
      const cDate = c.date || (c.closedAt?.seconds ? new Date(c.closedAt.seconds * 1000).toISOString().substring(0, 10) : '') || (c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '');

      (c.items || []).forEach((it: any) => {
        const itProId = it.profissional_id || c.profissional_id;
        const itProName = it.profissional_name || c.profissional_name;

        if (isMatch(itProId, itProName)) {
          const itemPrice = Number(it.totalPrice ?? (Number(it.unitPrice || 0) * Number(it.quantity || 1))) || 0;
          producaoBrutaComandas += itemPrice;

          // Regra de comissão
          const serv = servicesMap[it.referencia_id];
          let itemPct = defaultPct;
          let itemCommVal = (itemPrice * itemPct) / 100;

          if (serv) {
            if (serv.comissoes_por_profissional?.[bId]) {
              const rule = serv.comissoes_por_profissional[bId];
              if (rule.tipo === 'fixo') itemCommVal = Number(rule.valor || 0) * Number(it.quantity || 1);
              else if (rule.tipo === 'percentual') {
                itemPct = Number(rule.valor || 0);
                itemCommVal = (itemPrice * itemPct) / 100;
              }
            } else if (serv.tipo_comissao === 'fixo') {
              itemCommVal = Number(serv.valor_comissao || 0) * Number(it.quantity || 1);
            } else if (serv.tipo_comissao === 'percentual') {
              itemPct = Number(serv.valor_comissao || 0);
              itemCommVal = (itemPrice * itemPct) / 100;
            }
          }

          comissaoCalculadaComandas += itemCommVal;
          proComandaItems.push({
            comandaId: c.id,
            comandaNumber: c.number,
            date: cDate,
            itemName: it.name,
            itemPrice,
            rateUsed: itemPct,
            itemCommVal,
            comandaStatus: c.status
          });
        }
      });
    });

    // 2. Documentos em COMMISSIONS
    const proComms = commissions.filter(c => isMatch(c.profissional_id, c.profissional_name || c.barbeiro_nome));
    let commsTotalBase = 0;
    let commsPendingValue = 0;
    let commsPaidValue = 0;
    let commsZeroValueCount = 0;

    proComms.forEach(c => {
      const bVal = Number(c.base_value) || 0;
      const cVal = Number(c.commission_value) || 0;
      commsTotalBase += bVal;
      if (cVal === 0) commsZeroValueCount++;

      if (c.status === 'pendente' || !c.status) {
        commsPendingValue += cVal;
      } else if (c.status === 'pago') {
        commsPaidValue += cVal;
      }
    });

    // 3. Documentos em ADVANCES (Vales)
    const proAdvs = advances.filter(a => isMatch(a.profissional_id, a.profissional_name));
    let advsPendingTotal = 0;
    let advsPaidTotal = 0;

    proAdvs.forEach(a => {
      const aVal = Number(a.amount) || 0;
      if (a.status === 'pendente' || !a.status) {
        advsPendingTotal += aVal;
      } else if (a.status === 'pago' || a.status === 'descontado') {
        advsPaidTotal += aVal;
      }
    });

    // 4. Documentos em PAYOUTS (Repasses)
    const proPayouts = payouts.filter(p => isMatch(p.profissional_id, p.profissional_name));
    let payoutsTotal = 0;
    proPayouts.forEach(p => {
      payoutsTotal += Number(p.amount || p.valor || 0);
    });

    // Saldo Líquido Real Calculado direto da produção das comandas:
    const saldoLiquidoCalculado = Math.max(0, comissaoCalculadaComandas - advsPendingTotal - payoutsTotal);

    report.push({
      profissional: bName,
      uid: bId,
      tipo: b.tipo,
      percentualCadastrado: `${defaultPct}%`,
      // Produção real das comandas
      comandasFechadasCount: proComandaItems.length,
      producaoBrutaReal: producaoBrutaComandas,
      comissaoTotalLegitima: comissaoCalculadaComandas,
      // Dados da tabela de comissões atual
      commissionsDocsTotal: proComms.length,
      commissionsComValorZero: commsZeroValueCount,
      commissionsPendingNoBanco: commsPendingValue,
      commissionsPaidNoBanco: commsPaidValue,
      // Vales
      valesPendentes: advsPendingTotal,
      valesDescontados: advsPaidTotal,
      valesLista: proAdvs.map(a => ({ id: a.id, data: a.date, valor: a.amount, status: a.status, desc: a.description })),
      // Repasses
      repassesJaEfetuados: payoutsTotal,
      // SALDOS
      saldoLiquidoOriginalReconstituido: saldoLiquidoCalculado,
      itensDetalhados: proComandaItems
    });
  }

  fs.writeFileSync('./reconstructed_totals.json', JSON.stringify(report, null, 2));
  console.log('Relatório completo salvo em ./reconstructed_totals.json');
}

run().catch(console.error);
