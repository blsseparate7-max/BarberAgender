import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';

export interface TeamGoal {
  id?: string;
  tenantId: string;
  titulo: string;
  periodo: 'dia' | 'semana' | 'mes';
  tipo: 'faturamento' | 'atendimentos';
  valorMeta: number;
  valorBonus: number;
  profissional_id?: string; // empty/null = all barbers (team goal)
  createdAt?: any;
}

const COLLECTION = 'team_goals';

export const teamGoalService = {
  async getGoals(tenantId?: string): Promise<TeamGoal[]> {
    const tid = tenantId || getActiveTenantId();
    if (!tid) return [];
    const q = query(collection(db, COLLECTION), where('tenantId', '==', tid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamGoal));
  },

  subscribeToGoals(callback: (goals: TeamGoal[]) => void, tenantId?: string) {
    const tid = tenantId || getActiveTenantId();
    if (!tid) {
      callback([]);
      return () => {};
    }
    const q = query(collection(db, COLLECTION), where('tenantId', '==', tid));
    return onSnapshot(q, (snapshot) => {
      const goals = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TeamGoal));
      callback(goals);
    }, (err) => {
      console.error("Error subscribing to team goals:", err);
      callback([]);
    });
  },

  async createGoal(data: Omit<TeamGoal, 'id' | 'tenantId' | 'createdAt'>): Promise<string> {
    const tid = getActiveTenantId();
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      tenantId: tid,
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateGoal(id: string, data: Partial<TeamGoal>): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, data);
  },

  async deleteGoal(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  }
};
