import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  deleteDoc,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { AgendaBlock } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'agenda_blocks';

export const agendaBlockService = {
  async createBlock(data: Omit<AgendaBlock, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async deleteBlock(id: string) {
    await deleteDoc(docRef(db, COLLECTION, id));
  },

  async getBlocks(filters: { date?: string; profissional_id?: string }) {
    let q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));

    if (filters.date) {
      q = query(q, where('date', '==', filters.date));
    }
    if (filters.profissional_id) {
      q = query(q, where('profissional_id', 'in', [filters.profissional_id, 'general']));
    }

    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgendaBlock));
  },

  subscribeToBlocks(filters: { date?: string; profissional_id?: string }, callback: (blocks: AgendaBlock[]) => void) {
    let q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));

    if (filters.date) {
      q = query(q, where('date', '==', filters.date));
    }
    if (filters.profissional_id) {
      q = query(q, where('profissional_id', 'in', [filters.profissional_id, 'general']));
    }

    return onSnapshot(q, (snapshot) => {
      const blocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgendaBlock));
      callback(blocks);
    });
  }
};

function docRef(db: any, COLLECTION: string, id: string): any {
  return doc(db, COLLECTION, id);
}
