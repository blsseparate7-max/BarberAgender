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
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { AgendaBlock, Appointment } from '../types';
import { getActiveTenantId } from './tenantService';
import { parse, isBefore, isAfter } from 'date-fns';

const COLLECTION = 'agenda_blocks';

export const agendaBlockService = {
  async createBlock(data: Omit<AgendaBlock, 'id' | 'createdAt'>) {
    const tenantId = getActiveTenantId();

    // QA Safety Check: Verify if there are active appointments in this block's timeframe
    const appQuery = query(
      collection(db, 'appointments'),
      where('tenantId', '==', tenantId),
      where('date', '==', data.date),
      where('status', 'in', ['agendado', 'confirmado', 'em_atendimento'])
    );
    const appSnap = await getDocs(appQuery);
    const appointments = appSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));

    const blockStart = parse(data.startTime, 'HH:mm', new Date());
    const blockEnd = parse(data.endTime, 'HH:mm', new Date());

    const conflictingAppointments = appointments.filter(app => {
      // If block is for general or specific professional
      if (data.profissional_id !== 'general' && app.profissional_id !== data.profissional_id) {
        return false;
      }
      const appStart = parse(app.startTime, 'HH:mm', new Date());
      const appEnd = parse(app.endTime, 'HH:mm', new Date());
      return isBefore(appStart, blockEnd) && isAfter(appEnd, blockStart);
    });

    if (conflictingAppointments.length > 0) {
      throw new Error(`Não é possível aplicar este bloqueio: existem ${conflictingAppointments.length} cliente(s) agendado(s) neste intervalo (${conflictingAppointments.map(a => a.startTime).join(', ')}). Remova ou reagende os horários primeiro.`);
    }

    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      tenantId,
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
