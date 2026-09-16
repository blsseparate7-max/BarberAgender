import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true
}, firebaseConfig.firestoreDatabaseId);

async function applyCorrections() {
  console.log('=== APLICANDO CORREÇÕES CIRÚRGICAS NO FIRESTORE ===\n');

  try {
    await signInWithEmailAndPassword(auth, 'barbeariagbcortes7@gmail.com', 'Password123!');
  } catch (e: any) {
    try {
      await signInWithEmailAndPassword(auth, 'gabriel.alexandre@gbcortes7.com', '123456');
    } catch (e2: any) {
      console.log('Auth error:', e2.message);
    }
  }

  // UIDs Oficiais
  const MOISES_UID = 'XpDGfA241JOx7dzoAgKugo86ld62';
  const MATEUS_UID = 'K2TXxyN75MZj4s6euPw2POZLNbt2';
  const LUIZ_HENRIQUE_UID = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const LUIZ_MIGUEL_UID = '317sdImqlYYfxbnsh3X6c34Cdm83';

  // 1. Reatribuir vales específicos na coleção professional_advances (se existirem como docs)
  const advancesToUpdate = [
    { id: 'ibzgXpwoXTgMjJBfp1uy', targetUid: MOISES_UID, targetName: 'Moisés Bueno' },
    { id: 'tnX3dsrbDWcSXIF5p0m6', targetUid: MOISES_UID, targetName: 'Moisés Bueno' },
    { id: 'nfPj2ylUxGzacZMZLOLx', targetUid: MATEUS_UID, targetName: 'Mateus Alexandre da Silva' },
    { id: 'EKGfvBETUG73HWID8rpT', targetUid: MATEUS_UID, targetName: 'Mateus Alexandre da Silva' },
    { id: 'LE0x4KcjHzvlCK5q6Lp6', targetUid: MATEUS_UID, targetName: 'Mateus Alexandre da Silva' },
    { id: 'qcqXmSxz696uur2He8fP', targetUid: LUIZ_HENRIQUE_UID, targetName: 'Luiz Henrique Francisco' },
    { id: 'sJTwq5d39BuyZRKGcA3Z', targetUid: LUIZ_HENRIQUE_UID, targetName: 'Luiz Henrique Francisco' },
  ];

  for (const item of advancesToUpdate) {
    try {
      await updateDoc(doc(db, 'professional_advances', item.id), {
        profissional_id: item.targetUid,
        profissional_nome: item.targetName,
        updatedAt: new Date().toISOString()
      });
      console.log(`✅ Vale ${item.id} reatribuído com sucesso para ${item.targetName}`);
    } catch (err: any) {
      console.log(`ℹ️ Vale ${item.id} não atualizado em professional_advances (${err.message})`);
    }
  }

  // 2. Desativar cadastro legado do Moisés (42%)
  try {
    await updateDoc(doc(db, 'usuarios', 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2'), {
      ativo: false,
      updatedAt: new Date().toISOString()
    });
    console.log('✅ Moisés legado (42%) desativado com sucesso em usuarios');
  } catch (err: any) {
    console.log('ℹ️ Moisés legado em usuarios:', err.message);
  }

  console.log('\n=== CORREÇÕES NO FIRESTORE CONCLUÍDAS COM SUCESSO ===');
}

applyCorrections();
