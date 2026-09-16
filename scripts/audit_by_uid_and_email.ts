import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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
      return;
    }
  }

  // 1. Fetch all users
  const usersSnap = await getDocs(collection(db, 'usuarios'));
  const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
  const tenantUsers = allUsers.filter(u => u.tenantId === 'gbcortes7' || (!u.tenantId && (u.tipo === 'barbeiro' || u.tipo === 'admin')));

  console.log(`=== USUÁRIOS NO TENANT gbcortes7 (Total: ${tenantUsers.length}) ===\n`);
  tenantUsers.forEach(u => {
    console.log(`UID: ${u.uid}`);
    console.log(`Nome: ${u.nome || u.name}`);
    console.log(`Email: ${u.email}`);
    console.log(`Tipo: ${u.tipo || u.role} | Ativo: ${u.ativo}`);
    console.log(`Percentual Comissão: ${u.percentual_comissao ?? u.commission_percentage ?? 'N/A'}%`);
    console.log(`TenantId: ${u.tenantId}`);
    console.log('--------------------------------------------------');
  });

  // 2. Fetch all comandas, commissions, and advances
  const [comandasSnap, commsSnap, advsSnap] = await Promise.all([
    getDocs(collection(db, 'comandas')),
    getDocs(collection(db, 'commissions')),
    getDocs(collection(db, 'professional_advances'))
  ]);

  const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const commissions = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const advances = advsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

  console.log(`\n=== TOTAIS CARREGADOS DO BANCO ===`);
  console.log(`Comandas: ${comandas.length}`);
  console.log(`Comissões: ${commissions.length}`);
  console.log(`Vales (professional_advances): ${advances.length}`);

  const report: any[] = [];

  for (const u of tenantUsers) {
    // Exact UID matches only
    const userComandasRoot = comandas.filter(c => c.profissional_id === u.uid);
    
    // Items where item.profissional_id === u.uid OR (no item.profissional_id and comanda.profissional_id === u.uid)
    const userItems: any[] = [];
    comandas.forEach(c => {
      (c.items || []).forEach((it: any) => {
        const itemProId = it.profissional_id || c.profissional_id;
        if (itemProId === u.uid) {
          userItems.push({
            comandaId: c.id,
            comandaNumber: c.comandaNumber || c.numero,
            comandaDate: c.data || c.date || (c.createdAt?.toDate ? c.createdAt.toDate().toISOString() : c.createdAt),
            comandaStatus: c.status,
            paymentStatus: c.paymentStatus,
            itemName: it.name || it.nome,
            itemPrice: Number(it.totalPrice || it.price || it.valor || (it.unitPrice * (it.quantity || 1)) || 0),
            itemType: it.type || it.tipo,
            generateCommission: it.generateCommission !== false,
            deductType: it.deductType
          });
        }
      });
    });

    const userComms = commissions.filter(c => c.profissional_id === u.uid);
    const userAdvs = advances.filter(a => a.profissional_id === u.uid);

    report.push({
      uid: u.uid,
      email: u.email,
      nome: u.nome || u.name,
      tipo: u.tipo || u.role,
      ativo: u.ativo,
      percentual: u.percentual_comissao ?? u.commission_percentage ?? 0,
      totalComandasComoPrincipal: userComandasRoot.length,
      totalItensAtendidos: userItems.length,
      itens: userItems,
      commissionsNoBanco: userComms,
      advancesNoBanco: userAdvs
    });
  }

  fs.writeFileSync('./detailed_uid_audit.json', JSON.stringify(report, null, 2));
  console.log('\nAudit gravado com sucesso em detailed_uid_audit.json');
}

run();
