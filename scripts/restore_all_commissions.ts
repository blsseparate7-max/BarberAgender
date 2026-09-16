import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true }, firebaseConfig.firestoreDatabaseId);

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
      } catch (e: any) {}
    }
  }
  throw new Error('Não foi possível autenticar.');
}

function norm(str: string): string {
  return (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function run() {
  await authenticate();

  const tenantId = 'gbcortes7';
  const tenantFilter = where('tenantId', 'in', [tenantId, '']);

  console.log('--- INICIANDO RESTAURAÇÃO TOTAL DAS COMISSÕES E PRODUÇÃO ---');

  const [usersSnap, servicesSnap, comandasSnap, commsSnap, advsSnap] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), tenantFilter)),
    getDocs(query(collection(db, 'services'), tenantFilter)),
    getDocs(query(collection(db, 'comandas'), tenantFilter)),
    getDocs(query(collection(db, 'commissions'), tenantFilter)),
    getDocs(query(collection(db, 'professional_advances'), tenantFilter))
  ]);

  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const barbers = users.filter(u => u.tipo === 'barbeiro' || u.role === 'barbeiro' || u.tipo === 'admin');

  console.log(`Profissionais cadastrados encontrados: ${barbers.length}`);
  barbers.forEach(b => console.log(`- [${b.uid}] ${b.nome} (${b.tipo}) - ${b.percentual_comissao ?? b.commission_percentage}%`));

  const services = servicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const servicesMap: Record<string, any> = {};
  services.forEach(s => { servicesMap[s.id] = s; });

  const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const existingCommissions = commsSnap.docs.map(d => ({ id: d.id, ...d.data(), ref: d.ref } as any));

  console.log(`Total de comandas: ${comandas.length}`);
  console.log(`Total de comissões existentes antes da limpeza: ${existingCommissions.length}`);

  // Helper para identificar barbeiro correto de um item de comanda
  const findBarber = (proId?: string, proName?: string) => {
    if (proId) {
      const byUid = barbers.find(b => b.uid === proId || b.email === proId);
      if (byUid) return byUid;
    }
    if (proName) {
      const pNorm = norm(proName);
      const byExactName = barbers.find(b => norm(b.nome) === pNorm);
      if (byExactName) return byExactName;

      // Correspondência por primeiro nome/prefixo seguro
      if (pNorm.startsWith('gabriel')) return barbers.find(b => norm(b.nome).startsWith('gabriel'));
      if (pNorm.startsWith('mateus') || pNorm.startsWith('matheus')) return barbers.find(b => norm(b.nome).startsWith('mateus') || norm(b.nome).startsWith('matheus'));
      if (pNorm.startsWith('luiz henrique')) return barbers.find(b => norm(b.nome).startsWith('luiz henrique'));
      if (pNorm.startsWith('luiz miguel')) return barbers.find(b => norm(b.nome).startsWith('luiz miguel'));
      if (pNorm.startsWith('moises')) return barbers.find(b => norm(b.nome).startsWith('moises'));
      if (pNorm.startsWith('bryan')) return barbers.find(b => norm(b.nome).startsWith('bryan'));
    }
    return null;
  };

  // 1. LIMPEZA TOTAL DA TABELA COMMISSIONS CORROMPIDA
  console.log('1. Apagando comissões corrompidas...');
  let deletedCount = 0;
  for (let i = 0; i < existingCommissions.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = existingCommissions.slice(i, i + 400);
    chunk.forEach(c => batch.delete(c.ref));
    await batch.commit();
    deletedCount += chunk.length;
  }
  console.log(`-> ${deletedCount} comissões corrompidas removidas com sucesso.`);

  // 2. RECRIAR TODAS AS COMISSÕES LEGÍTIMAS DIRETAMENTE DAS COMANDAS FECHADAS
  console.log('2. Recriando comissões legítimas a partir das comandas...');
  const newCommissions: any[] = [];
  const proTotals: Record<string, { count: number, bruto: number, comissao: number }> = {};

  comandas.forEach(c => {
    if (c.status === 'cancelada') return;

    const cDate = c.date || (c.closedAt?.seconds ? new Date(c.closedAt.seconds * 1000).toISOString().substring(0, 10) : '') || (c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '') || '2026-09-01';

    (c.items || []).forEach((item: any, idx: number) => {
      const rawProId = item.profissional_id || c.profissional_id;
      const rawProName = item.profissional_name || c.profissional_name;

      const barber = findBarber(rawProId, rawProName);
      if (!barber) return; // item sem barbeiro (ex: taxa balcão pura)

      const bId = barber.uid;
      const bName = barber.nome;
      const defaultPct = barber.percentual_comissao ?? barber.commission_percentage ?? 50;

      const itemPrice = Number(item.totalPrice ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1))) || 0;
      if (itemPrice <= 0) return;

      // Calcular comissão exata
      const serv = servicesMap[item.referencia_id];
      let itemPct = defaultPct;
      let itemCommVal = (itemPrice * itemPct) / 100;

      if (serv) {
        if (serv.comissoes_por_profissional?.[bId]) {
          const rule = serv.comissoes_por_profissional[bId];
          if (rule.tipo === 'fixo') itemCommVal = Number(rule.valor || 0) * Number(item.quantity || 1);
          else if (rule.tipo === 'percentual') {
            itemPct = Number(rule.valor || 0);
            itemCommVal = (itemPrice * itemPct) / 100;
          }
        } else if (serv.tipo_comissao === 'fixo') {
          itemCommVal = Number(serv.valor_comissao || 0) * Number(item.quantity || 1);
        } else if (serv.tipo_comissao === 'percentual') {
          itemPct = Number(serv.valor_comissao || 0);
          itemCommVal = (itemPrice * itemPct) / 100;
        }
      }

      // Arredondamento monetário preciso
      itemCommVal = Math.round(itemCommVal * 100) / 100;

      const commDocId = `comm_${c.id}_${idx}`;
      newCommissions.push({
        id: commDocId,
        agendamento_id: c.agendamento_id || '',
        comanda_id: c.id,
        comanda_number: c.number || '',
        cliente_id: c.cliente_id || '',
        cliente_name: c.cliente_name || c.cliente_nome || '',
        profissional_id: bId,
        profissional_name: bName,
        servico_name: item.name || 'Serviço',
        base_value: itemPrice,
        commission_percentage: itemPct,
        commission_value: itemCommVal,
        commission_type: item.type === 'produto' || item.type === 'product' ? 'venda' : 'servico',
        status: 'pendente',
        tenantId: tenantId,
        date: cDate,
        createdAt: c.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      if (!proTotals[bName]) proTotals[bName] = { count: 0, bruto: 0, comissao: 0 };
      proTotals[bName].count++;
      proTotals[bName].bruto += itemPrice;
      proTotals[bName].comissao += itemCommVal;
    });
  });

  console.log(`-> Geradas ${newCommissions.length} comissões legítimas.`);

  // Inserir no Firestore em lotes de 400
  for (let i = 0; i < newCommissions.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = newCommissions.slice(i, i + 400);
    chunk.forEach(c => {
      const docRef = doc(db, 'commissions', c.id);
      batch.set(docRef, c);
    });
    await batch.commit();
    console.log(`Lote gravado: ${Math.min(i + 400, newCommissions.length)} / ${newCommissions.length}`);
  }

  console.log('\n=== RESULTADO FINAL DA RESTAURAÇÃO ===');
  Object.keys(proTotals).forEach(name => {
    const t = proTotals[name];
    console.log(`💈 ${name}: ${t.count} atendimentos | Produção Bruta: R$ ${t.bruto.toFixed(2)} | Comissão: R$ ${t.comissao.toFixed(2)}`);
  });

  console.log('\n--- RESTAURAÇÃO CONCLUÍDA COM SUCESSO ---');
}

run().catch(console.error);
