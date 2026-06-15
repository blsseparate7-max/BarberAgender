
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  orderBy, 
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { Automation, AutomationLog } from '../types';

const COLLECTION = 'automations';
const LOGS_COLLECTION = 'automation_logs';

export const automationService = {
  async getAutomations() {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Automation));
  },

  async createAutomation(data: Omit<Automation, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateAutomation(id: string, data: Partial<Automation>) {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, data);
  },

  async getLogs() {
    const q = query(collection(db, LOGS_COLLECTION), orderBy('executedAt', 'desc'), limit(50));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationLog));
  },

  async logExecution(data: Omit<AutomationLog, 'id' | 'executedAt'>) {
    await addDoc(collection(db, LOGS_COLLECTION), {
      ...data,
      executedAt: serverTimestamp()
    });
  }
};
