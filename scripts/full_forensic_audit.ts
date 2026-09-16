import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import * as fs from 'fs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

async function run() {
  try {
    await signInWithEmailAndPassword(auth, 'barbeariagbcortes7@gmail.com', 'Password123!');
  } catch (e: any) {
    try {
      await signInWithEmailAndPassword(auth, 'gabriel.alexandre@gbcortes7.com', '123456');
    } catch (e2: any) {
      console.error('Auth error:', e2.message);
    }
  }

  const collectionsToInspect = [
    'comandas',
    'commissions',
    'professional_advances',
    'cash_movements',
    'bills',
    'financial_transactions',
    'caixa',
    'usuarios'
  ];

  const results: Record<string, any[]> = {};

  for (const colName of collectionsToInspect) {
    try {
      const snap = await getDocs(collection(db, colName));
      results[colName] = snap.docs.map(d => {
        const data = d.data();
        // Convert Timestamps to ISO string for clean serialization
        const formatted: any = { id: d.id };
        for (const [key, val] of Object.entries(data)) {
          if (val && typeof val === 'object' && 'toDate' in val && typeof (val as any).toDate === 'function') {
            formatted[key] = (val as any).toDate().toISOString();
          } else {
            formatted[key] = val;
          }
        }
        return formatted;
      });
      console.log(`Fetched ${results[colName].length} docs from '${colName}'`);
    } catch (err: any) {
      console.log(`Error reading collection '${colName}':`, err.message);
      results[colName] = [];
    }
  }

  fs.writeFileSync('./full_forensic_data.json', JSON.stringify(results, null, 2));
  console.log('Saved full forensic snapshot to full_forensic_data.json');
}

run();
