import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Automation, AutomationLog } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'automations';
const LOGS_COLLECTION = 'automation_logs';

export const automationService = {
  async getAutomations() {
    const q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const automations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Automation));
    return automations.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async createAutomation(data: Omit<Automation, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateAutomation(id: string, data: Partial<Automation>) {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, data);
  },

  async getLogs() {
    const q = query(collection(db, LOGS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const logs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationLog));
    return logs.sort((a, b) => {
      const aTime = a.executedAt?.seconds || a.executedAt?.toMillis?.() || 0;
      const bTime = b.executedAt?.seconds || b.executedAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 50);
  },

  async logExecution(data: Omit<AutomationLog, 'id' | 'executedAt'>) {
    await addDoc(collection(db, LOGS_COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      executedAt: serverTimestamp()
    });
  }
};
