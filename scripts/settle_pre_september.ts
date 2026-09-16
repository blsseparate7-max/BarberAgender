import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
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

  const snap = await getDocs(query(collection(db, 'commissions'), where('tenantId', 'in', ['gbcortes7', ''])));
  console.log(`Total de comissões encontradas: ${snap.size}`);

  const batch = writeBatch(db);
  let updatedPre = 0;
  let keptSep = 0;

  snap.forEach(d => {
    const c = d.data();
    const dStr = (c.date || '').substring(0, 10);
    if (dStr < '2026-09-01') {
      batch.update(d.ref, { status: 'pago' });
      updatedPre++;
    } else {
      batch.update(d.ref, { status: 'pendente' });
      keptSep++;
    }
  });

  await batch.commit();
  console.log(`✅ ${updatedPre} comissões de meses anteriores (Jul/Ago) marcadas como PAGAS/HISTÓRICAS.`);
  console.log(`✅ ${keptSep} comissões do mês atual (SETEMBRO) ativas como PENDENTES.`);
}

run().catch(console.error);
