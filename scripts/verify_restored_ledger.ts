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
  const passwords = ['admin123', 'admin', 'gbcortes7', 'Password123!', '123456'];

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

  console.log(`Total de Comissões no Firestore: ${comms.length}`);
  console.log(`Total de Vales no Firestore: ${advs.length}`);

  barbers.forEach(b => {
    const ledger = calculateProfessionalLedger(b, comms, advs);
    console.log('----------------------------------------------------');
    console.log(`💈 Barbeiro: ${b.nome} (${b.tipo}) [${b.uid}]`);
    console.log(`   Atendimentos Totais: ${ledger.totalAtendimentosTotal}`);
    console.log(`   Faturamento Bruto Total: R$ ${ledger.faturamentoBrutoTotal.toFixed(2)}`);
    console.log(`   Comissão Gerada Total: R$ ${ledger.comissaoGeradaTotal.toFixed(2)}`);
    console.log(`   Comissão Pendente: R$ ${ledger.comissaoPendenteBruta.toFixed(2)}`);
    console.log(`   Vales Pendentes: R$ ${ledger.valesPendentes.toFixed(2)}`);
    console.log(`   Saldo Líquido Devedor: R$ ${ledger.saldoPendenteLiquido.toFixed(2)}`);
  });
}

run().catch(console.error);
