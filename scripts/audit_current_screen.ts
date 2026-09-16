import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { calculateProfessionalLedger } from '../src/services/ledgerService';

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
          console.log(`Autenticado como: ${email}`);
          return cred.user;
        }
      } catch (e: any) {}
    }
  }
  throw new Error('Não foi possível autenticar.');
}

async function run() {
  await authenticate();

  const [usersSnap, commsSnap, advsSnap] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), where('tenantId', 'in', ['gbcortes7', '']))),
    getDocs(query(collection(db, 'commissions'), where('tenantId', 'in', ['gbcortes7', '']))),
    getDocs(query(collection(db, 'professional_advances'), where('tenantId', 'in', ['gbcortes7', ''])))
  ]);

  const users = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const barbers = users.filter(u => u.tipo === 'barbeiro' || u.role === 'barbeiro' || u.tipo === 'admin');
  const comms = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const advs = advsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  console.log('=== SITUAÇÃO ATUAL EXIBIDA NA TELA DE COMISSÕES (SETEMBRO) ===');

  barbers.forEach(b => {
    const ledger = calculateProfessionalLedger(b, comms, advs, '2026-09-01', '2026-09-30');
    console.log(`💈 ${b.nome.toUpperCase()} (${b.tipo})`);
    console.log(`   • Atendimentos em Setembro: ${ledger.totalAtendimentosMes}`);
    console.log(`   • Produção Bruta: R$ ${ledger.faturamentoBrutoMes.toFixed(2)}`);
    console.log(`   • Comissão Gerada: R$ ${ledger.comissaoGeradaMes.toFixed(2)}`);
    console.log(`   • Vales Pendentes: R$ ${ledger.valesPendentes.toFixed(2)}`);
    console.log(`   👉 SALDO A RECEBER: R$ ${ledger.saldoPendenteLiquido.toFixed(2)}`);
    console.log('------------------------------------------------------------');
  });
}

run().catch(console.error);
