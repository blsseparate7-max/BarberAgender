import { db } from './src/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

async function run() {
  console.log("=== CHECKING TENANT GBCORTES7 ===");
  const tenantsSnap = await getDocs(collection(db, 'tenants'));
  tenantsSnap.forEach(doc => {
    if (doc.id === 'gbcortes7') {
      console.log(`Tenant: ${doc.id}, Data:`, JSON.stringify(doc.data(), null, 2));
    }
  });

  console.log("\n=== CHECKING PRIVATE SETTINGS FOR GBCORTES7 ===");
  try {
    const privSnap = await getDocs(collection(db, 'tenants', 'gbcortes7', 'private_settings'));
    privSnap.forEach(doc => {
      console.log(`Private Setting Doc: ${doc.id}, Data:`, JSON.stringify({ ...doc.data(), apiKey: doc.data().apiKey ? doc.data().apiKey.substring(0, 10) + '...' : undefined }, null, 2));
    });
  } catch (err: any) {
    console.log("Could not read private settings directly:", err.message);
  }

  console.log("\n=== CHECKING USER mgbolado27@gmail.com ===");
  const usersSnap = await getDocs(collection(db, 'usuarios'));
  let targetUserId = '';
  usersSnap.forEach(doc => {
    const data = doc.data();
    if (data.email && data.email.toLowerCase().includes('mgbolado27')) {
      console.log(`User ID: ${doc.id}, Name: ${data.nome}, Email: ${data.email}, Tipo: ${data.tipo}, TenantId: ${data.tenantId}, Data:`, JSON.stringify(data, null, 2));
      targetUserId = doc.id;
    }
  });

  console.log("\n=== CHECKING SUBSCRIPTIONS ===");
  const subsSnap = await getDocs(collection(db, 'subscriptions'));
  subsSnap.forEach(doc => {
    const data = doc.data();
    if (data.tenantId === 'gbcortes7' || data.cliente_id === targetUserId || (data.email && data.email.toLowerCase().includes('mgbolado27'))) {
      console.log(`Subscription ID: ${doc.id}, Client Name: ${data.cliente_name || data.usuario_name}, Client ID: ${data.cliente_id}, Email: ${data.email || data.usuario_email}, Plan ID: ${data.plano_id || data.planId}, Status: ${data.status}, TenantId: ${data.tenantId}, Data:`, JSON.stringify(data, null, 2));
    }
  });

  console.log("\n=== CHECKING CLIENT_SUBSCRIPTIONS (IF ANY) ===");
  try {
    const clientSubsSnap = await getDocs(collection(db, 'client_subscriptions'));
    clientSubsSnap.forEach(doc => {
      const data = doc.data();
      if (data.tenantId === 'gbcortes7' || data.cliente_id === targetUserId || (data.email && data.email.toLowerCase().includes('mgbolado27'))) {
        console.log(`Client Sub ID: ${doc.id}, Client: ${data.cliente_name}, Status: ${data.status || data.asaasPaymentStatus}, Data:`, JSON.stringify(data, null, 2));
      }
    });
  } catch (err: any) {
    console.log("Could not query client_subscriptions:", err.message);
  }

  console.log("\n=== CHECKING COMANDAS ===");
  const comandasSnap = await getDocs(collection(db, 'comandas'));
  comandasSnap.forEach(doc => {
    const data = doc.data();
    if (data.tenantId === 'gbcortes7' && (data.cliente_id === targetUserId || (data.cliente_email && data.cliente_email.toLowerCase().includes('mgbolado27')))) {
      console.log(`Comanda ID: ${doc.id}, Number: ${data.number}, Client: ${data.cliente_name}, Price: ${data.totalAmount}, Status: ${data.status}, Data:`, JSON.stringify(data, null, 2));
    }
  });
}

run().catch(console.error);
