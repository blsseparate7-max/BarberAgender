import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { ProfessionalSchedule, WorkingHours } from '../types';

const COLLECTION = 'professional_schedules';

export const professionalScheduleService = {
  async getSchedule(profissional_id: string): Promise<ProfessionalSchedule | null> {
    const docRef = doc(db, COLLECTION, profissional_id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as ProfessionalSchedule;
    }
    return null;
  },

  async saveSchedule(profissional_id: string, schedule: Omit<ProfessionalSchedule, 'profissional_id'>) {
    const docRef = doc(db, COLLECTION, profissional_id);
    await setDoc(docRef, {
      ...schedule,
      profissional_id,
      updatedAt: serverTimestamp()
    });
  },

  async getAllSchedules(): Promise<ProfessionalSchedule[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(doc => doc.data() as ProfessionalSchedule);
  },

  async seedDefaultSchedule(profissional_id: string) {
    const defaultWorkingHours: WorkingHours[] = [
      { dayOfWeek: 1, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 2, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 3, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 4, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 5, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 6, isOpen: true, startTime: '09:00', endTime: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 0, isOpen: false, startTime: '09:00', endTime: '19:00' },
    ];

    await this.saveSchedule(profissional_id, {
      workingHours: defaultWorkingHours,
      exceptions: [],
      vacations: []
    });
  }
};
