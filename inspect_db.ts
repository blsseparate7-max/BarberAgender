import { db } from './src/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function run() {
  console.log("=== CHECKING PLANS ===");
  const plansSnap = await getDocs(collection(db, 'subscription_plans'));
  plansSnap.forEach(doc => {
    console.log(`Plan ID: ${doc.id}, Name: ${doc.data().name}, TenantId: ${doc.data().tenantId}`);
  });

  console.log("\n=== CHECKING SUBSCRIPTIONS ===");
  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  subsSnap.forEach(doc => {
    console.log(`Sub ID: ${doc.id}, Client: ${doc.data().cliente_name}, Client ID: ${doc.data().cliente_id}, Plan ID: ${doc.data().plano_id}, Status: ${doc.data().status}, TenantId: ${doc.data().tenantId}`);
  });

  console.log("\n=== CHECKING COMANDAS FOR JOSE PAULO ===");
  const comandasSnap = await getDocs(collection(db, 'comandas'));
  comandasSnap.forEach(doc => {
    const data = doc.data();
    if (data.cliente_name && data.cliente_name.toLowerCase().includes('jos')) {
      console.log(`Comanda ID: ${doc.id}, Number: ${data.number}, Client: ${data.cliente_name}, Status: ${data.status}, Items:`, JSON.stringify(data.items));
    }
  });
}

run().catch(console.error);
