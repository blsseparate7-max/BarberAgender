import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const barbers = [
  { id: '317sdImqlYYfxbnsh3X6c34Cdm83', name: 'Luiz Miguel Marciano dos Santos' },
  { id: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', name: 'Luiz Henrique Francisco' },
  { id: 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2', name: 'Moises Bueno' }
];

async function run() {
  for (const b of barbers) {
    console.log(`\n--- BARBEIRO: ${b.name} (${b.id}) ---`);
    const docSnap = await getDoc(doc(db, 'usuarios', b.id));
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('Ativo:', data.ativo);
      console.log('Tipo:', data.tipo);
      console.log('Horário de Trabalho:', JSON.stringify(data.horario_de_trabalho, null, 2));
    } else {
      console.log('Não encontrado!');
    }
  }
}

run().catch(console.error);
