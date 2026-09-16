import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

async function investigate() {
  console.log('=== INVESTIGAÇÃO DA ABA APURAÇÃO DE COMISSÕES (01/09 A 14/09/2026) ===\n');

  try {
    await signInWithEmailAndPassword(auth, 'barbeariagbcortes7@gmail.com', 'Password123!');
  } catch (e: any) {
    try {
      await signInWithEmailAndPassword(auth, 'gabriel.alexandre@gbcortes7.com', '123456');
    } catch (e2: any) {
      console.error('Auth error:', e2.message);
    }
  }

  // 1. Fetch Barbers
  const usuariosSnap = await getDocs(query(collection(db, 'usuarios'), where('tenantId', 'in', ['gbcortes7', ''])));
  const barbers = usuariosSnap.docs
    .map(d => ({ uid: d.id, ...d.data() } as any))
    .filter(u => ['barbeiro', 'gerente', 'admin'].includes(u.tipo));

  console.log('BARBEIROS CADASTRADOS:');
  barbers.forEach(b => console.log(`  - ${b.nome} | UID: ${b.uid} | Tipo: ${b.tipo} | Ativo: ${b.ativo !== false}`));
  console.log('');

  // 2. Fetch all collections for tenant gbcortes7
  const commsSnap = await getDocs(query(collection(db, 'commissions'), where('tenantId', 'in', ['gbcortes7', ''])));
  const comms = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const advsSnap = await getDocs(query(collection(db, 'professional_advances'), where('tenantId', 'in', ['gbcortes7', ''])));
  const advs = advsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const payablesSnap = await getDocs(query(collection(db, 'accounts_payable'), where('tenantId', 'in', ['gbcortes7', ''])));
  const payables = payablesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const cashMovsSnap = await getDocs(query(collection(db, 'cash_movements'), where('tenantId', 'in', ['gbcortes7', ''])));
  const cashMovs = cashMovsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  const comandasSnap = await getDocs(query(collection(db, 'comandas'), where('tenantId', 'in', ['gbcortes7', ''])));
  const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  console.log(`TOTAL DE DOCS CARREGADOS:
  - Commissions: ${comms.length}
  - Professional Advances: ${advs.length}
  - Accounts Payable: ${payables.length}
  - Cash Movements: ${cashMovs.length}
  - Comandas: ${comandas.length}\n`);

  // Analyze per barber
  for (const barber of barbers) {
    console.log(`================================================================`);
    console.log(`BARBEIRO: ${barber.nome} (UID: ${barber.uid})`);
    console.log(`================================================================`);

    // Comissões do barbeiro entre 01/09 e 14/09
    const barberCommsAll = comms.filter(c => {
      if (c.status === 'cancelado' || c.status === 'estornado') return false;
      if (c.profissional_id === barber.uid || c.barbeiro_id === barber.uid) return true;
      const cName = (c.profissional_name || c.barbeiro_nome || '').toLowerCase();
      const bName = barber.nome.toLowerCase();
      if (cName && bName && (cName.includes(bName) || bName.includes(cName))) return true;
      return false;
    });

    const barberCommsPeriod = barberCommsAll.filter(c => {
      const d = (c.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    console.log(`\n--- COMISSÕES DO PERÍODO (01/09 a 14/09) ---`);
    console.log(`Total de comissões no período: ${barberCommsPeriod.length}`);
    let sumBrutaPeriod = 0;
    let sumBasePeriod = 0;
    let commsByStatus: Record<string, number> = {};
    barberCommsPeriod.forEach(c => {
      const val = Number(c.commission_value) || 0;
      const base = Number(c.base_value) || Number(c.amount) || 0;
      sumBrutaPeriod += val;
      sumBasePeriod += base;
      const st = c.status || 'sem_status';
      commsByStatus[st] = (commsByStatus[st] || 0) + val;
    });
    console.log(`Produção Bruta (Serviços): R$ ${sumBasePeriod.toFixed(2)}`);
    console.log(`Comissão Bruta Gerada: R$ ${sumBrutaPeriod.toFixed(2)}`);
    console.log(`Comissões por status:`, commsByStatus);

    // Vales na coleção professional_advances
    console.log(`\n--- VALES EM 'professional_advances' ---`);
    const barberAdvs = advs.filter(a => {
      if (a.profissional_id === barber.uid || a.barber_id === barber.uid) return true;
      const pName = (a.profissional_name || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      const bName = barber.nome.toLowerCase();
      const bFirstName = bName.split(' ')[0];
      if (pName && (pName.includes(bName) || bName.includes(pName))) return true;
      if (!a.profissional_id && desc.includes(bFirstName)) return true;
      return false;
    });

    const barberAdvsPeriod = barberAdvs.filter(a => {
      const d = (a.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    console.log(`Total em professional_advances (01/09 a 14/09): ${barberAdvsPeriod.length}`);
    barberAdvsPeriod.forEach(a => {
      console.log(`  - DocID: ${a.id} | Data: ${a.date} | Valor: R$ ${a.amount} | Status: ${a.status} | ProfID: ${a.profissional_id} | ProfNome: ${a.profissional_name} | Desc: "${a.description}"`);
    });

    // Vales na coleção accounts_payable
    console.log(`\n--- VALES EM 'accounts_payable' ---`);
    const barberPayables = payables.filter(p => {
      if (p.status === 'cancelado' || p.is_deleted === true) return false;
      const cat = (p.category || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const sup = (p.supplier || '').toLowerCase();
      const isRepasse = cat.includes('repasse') || desc.includes('repasse') || desc.includes('pagamento de comiss');
      const isVale = (p.type === 'vale' || cat.includes('adiantamento') || cat.includes('vale') || desc.includes('adiantamento') || desc.includes('vale')) && !isRepasse;
      if (!isVale) return false;

      if (p.profissional_id === barber.uid || p.barber_id === barber.uid) return true;
      const bName = barber.nome.toLowerCase();
      const bFirstName = bName.split(' ')[0];
      if (sup.includes(bName) || desc.includes(bName) || desc.includes(bFirstName)) return true;
      return false;
    });

    const barberPayablesPeriod = barberPayables.filter(p => {
      const d = p.paidAt ? p.paidAt.substring(0, 10) : (p.dueDate || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });
    console.log(`Total em accounts_payable (01/09 a 14/09): ${barberPayablesPeriod.length}`);
    barberPayablesPeriod.forEach(p => {
      console.log(`  - DocID: ${p.id} | Data: ${p.paidAt || p.dueDate} | Valor: R$ ${p.amount} | Status: ${p.status} | ProfID: ${p.profissional_id} | Supplier: "${p.supplier}" | Desc: "${p.description}"`);
    });

    // Vales na coleção cash_movements
    console.log(`\n--- VALES EM 'cash_movements' ---`);
    const barberCashMovs = cashMovs.filter(c => {
      if (c.is_deleted === true || c.status === 'cancelado' || c.status === 'excluido') return false;
      const cat = (c.category || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      const isRepasse = cat.includes('repasse') || desc.includes('repasse') || desc.includes('pagamento de comiss');
      const isVale = (cat.includes('vale') || cat.includes('adiantamento') || desc.includes('vale') || desc.includes('adiantamento')) && !isRepasse;
      if (!isVale) return false;

      if (c.profissional_id === barber.uid || c.barber_id === barber.uid) return true;
      const bName = barber.nome.toLowerCase();
      const bFirstName = bName.split(' ')[0];
      const cProName = (c.profissional_name || '').toLowerCase();
      if (cProName.includes(bName) || desc.includes(bName) || desc.includes(bFirstName)) return true;
      return false;
    });

    const barberCashMovsPeriod = barberCashMovs.filter(c => {
      const d = c.date || (c.createdAt ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '');
      return d >= '2026-09-01' && d <= '2026-09-14';
    });
    console.log(`Total em cash_movements (01/09 a 14/09): ${barberCashMovsPeriod.length}`);
    barberCashMovsPeriod.forEach(c => {
      console.log(`  - DocID: ${c.id} | Data: ${c.date} | Valor: R$ ${c.amount} | Status: ${c.status} | ProfID: ${c.profissional_id} | Desc: "${c.description}"`);
    });

    console.log('\n');
  }
}

investigate();
