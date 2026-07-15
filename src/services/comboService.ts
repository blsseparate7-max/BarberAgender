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
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Combo } from '../types';
import { getActiveTenantId } from './tenantService';

const COMBOS_COLLECTION = 'combos';

export const comboService = {
  async getCombos(onlyActive = true) {
    let q = query(
      collection(db, COMBOS_COLLECTION),
      where('tenantId', '==', getActiveTenantId())
    );
    
    if (onlyActive) {
      q = query(q, where('active', '==', true));
    }

    const querySnapshot = await getDocs(q);
    const combos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Combo));
    return combos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  async getComboById(id: string) {
    const docRef = doc(db, COMBOS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Combo;
    }
    return null;
  },

  async createCombo(data: Partial<Combo>) {
    const docRef = await addDoc(collection(db, COMBOS_COLLECTION), {
      tenantId: getActiveTenantId(),
      nome: data.nome || '',
      descricao: data.descricao || '',
      preco: data.preco || 0,
      servicos_ids: data.servicos_ids || [],
      produtos_ids: data.produtos_ids || [],
      active: data.active !== undefined ? data.active : true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateCombo(id: string, data: Partial<Combo>) {
    const docRef = doc(db, COMBOS_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteCombo(id: string) {
    const docRef = doc(db, COMBOS_COLLECTION, id);
    await deleteDoc(docRef);
  }
};
