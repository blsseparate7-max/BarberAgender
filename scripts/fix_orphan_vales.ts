import { db } from '../src/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

const orphanFixes: Record<string, { uid: string; name: string }> = {
  '1ZaSAGRZVKFEcVyVeFRq': { uid: '317sdImqlYYfxbnsh3X6c34Cdm83', name: 'Luiz Miguel Marciano dos Santos' },
  'FMJMseacBfqtMOB6zpsD': { uid: 'K2TXxyN75MZj4s6euPw2POZLNbt2', name: 'Mateus Alexandre da Silva' },
  'KVPb42dMB6yinJsIvTLY': { uid: '317sdImqlYYfxbnsh3X6c34Cdm83', name: 'Luiz Miguel Marciano dos Santos' },
  'Q7O0s1YKFqlim3XE7TnO': { uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', name: 'Luiz Henrique Francisco' },
  'Sch2UMsTQg6G7G8ozvih': { uid: '317sdImqlYYfxbnsh3X6c34Cdm83', name: 'Luiz Miguel Marciano dos Santos' },
  'fpkK940QCA3XhISs2d27': { uid: '317sdImqlYYfxbnsh3X6c34Cdm83', name: 'Luiz Miguel Marciano dos Santos' },
  'qb8kjGuS5KGdnwsZGfB6': { uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', name: 'Luiz Henrique Francisco' },
};

async function fixOrphans() {
  console.log("Iniciando correção de vales órfãos em financial_transactions...");

  for (const [docId, info] of Object.entries(orphanFixes)) {
    try {
      const refTx = doc(db, 'financial_transactions', docId);
      const snapTx = await getDoc(refTx);

      if (snapTx.exists()) {
        await updateDoc(refTx, {
          profissional_id: info.uid,
          profissional_name: info.name,
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ [financial_transactions] Documento ${docId} atualizado para ${info.name} (${info.uid})`);
      } else {
        console.log(`⚠️ [financial_transactions] Doc ${docId} não existe em financial_transactions, checando professional_advances...`);
      }

      const refAdv = doc(db, 'professional_advances', docId);
      const snapAdv = await getDoc(refAdv);
      if (snapAdv.exists()) {
        await updateDoc(refAdv, {
          profissional_id: info.uid,
          profissional_name: info.name,
          updatedAt: new Date().toISOString()
        });
        console.log(`✅ [professional_advances] Documento ${docId} atualizado para ${info.name} (${info.uid})`);
      }
    } catch (err) {
      console.error(`❌ Erro ao atualizar doc ${docId}:`, err);
    }
  }

  console.log("Concluído!");
  process.exit(0);
}

fixOrphans();
