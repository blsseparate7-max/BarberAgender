import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, deleteField, setDoc } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function migrate() {
  console.log("=== INICIANDO MIGRAÇÃO E PURGAÇÃO DA CHAVE DO DOCUMENTO PÚBLICO ===");
  // Vamos ler o documento atual de gbcortes7
  const tenantRef = doc(db, "tenants", "gbcortes7");
  const snap = await getDoc(tenantRef);
  
  if (!snap.exists()) {
    console.error("Tenant gbcortes7 não encontrado!");
    process.exit(1);
  }

  const data = snap.data();
  console.log("Tenant encontrado:", data.name);
  console.log("Status atual do objeto asaas no tenant:", data.asaas);

  const rawKey = data.asaas?.apiKey;
  const env = data.asaas?.environment || 'production';
  const lastFour = rawKey ? rawKey.slice(-4) : '';

  // 1. Purgar a apiKey física do documento público do tenant
  // Manter apenas hasKey: true, lastFour, environment, etc.
  const sanitizedAsaas = {
    ...(data.asaas || {}),
    hasKey: !!rawKey,
    lastFour: lastFour,
    environment: env
  };
  delete (sanitizedAsaas as any).apiKey;

  await updateDoc(tenantRef, {
    asaas: sanitizedAsaas,
    asaasApiKey: deleteField() // remover se existir legado
  });

  console.log("Documento público de gbcortes7 sanitizado com sucesso! Chave em texto puro removida da raiz pública.");
  console.log("Novo objeto público asaas:", sanitizedAsaas);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Erro ao purgar chave pública:", err);
  process.exit(1);
});
