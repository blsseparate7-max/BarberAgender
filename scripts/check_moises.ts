import { db } from '../src/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function checkMoisesAndUsers() {
  const querySnapshot = await getDocs(collection(db, 'usuarios'));
  console.log("=== USUÁRIOS NO FIRESTORE ===");
  querySnapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    console.log(`- ID: ${docSnap.id} | Nome: "${data.nome || data.name}" | Email: "${data.email}" | Role: "${data.role || data.cargo}" | Status: "${data.status || data.ativo}"`);
  });
  process.exit(0);
}

checkMoisesAndUsers();
