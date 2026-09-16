import { db } from '../src/firebase';
import { doc, updateDoc } from 'firebase/firestore';

async function fixLuizMiguelValesInFirestore() {
  const valeIds = [
    '1ZaSAGRZVKFEcVyVeFRq',
    'KVPb42dMB6yinJsIvTLY',
    'Sch2UMsTQg6G7G8ozvih',
    'fpkK940QCA3XhISs2d27'
  ];

  const lmUid = '317sdImqlYYfxbnsh3X6c34Cdm83';
  const lmName = 'Luiz Miguel Marciano dos Santos';

  console.log("=== ATUALIZANDO OS 4 VALES DO LUIZ MIGUEL NO FIRESTORE ===");

  for (const id of valeIds) {
    try {
      const docRef = doc(db, 'financial_transactions', id);
      await updateDoc(docRef, {
        profissional_id: lmUid,
        profissional_name: lmName
      });
      console.log(`✅ Vale ${id} atualizado com sucesso no Firestore!`);
    } catch (e: any) {
      console.error(`❌ Erro ao atualizar vale ${id}:`, e?.message || e);
    }
  }

  // Also check if there are documents in 'professional_advances' collection
  for (const id of valeIds) {
    try {
      const docRef = doc(db, 'professional_advances', id);
      await updateDoc(docRef, {
        profissional_id: lmUid,
        profissional_name: lmName
      });
      console.log(`✅ Advance ${id} atualizado com sucesso em professional_advances!`);
    } catch (e: any) {
      // Might not exist in professional_advances, ignore
    }
  }

  console.log("=== CONCLUÍDO ===");
  process.exit(0);
}

fixLuizMiguelValesInFirestore();
