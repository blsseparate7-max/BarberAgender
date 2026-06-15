
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface BarbershopProfile {
  name: string;
  email: string;
  phone: string;
  cnpj?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  logoUrl?: string;
  updatedAt?: any;
}

const SETTINGS_ID = 'barbershop_profile';

export const settingsService = {
  async getProfile(): Promise<BarbershopProfile | null> {
    try {
      const docRef = doc(db, 'settings', SETTINGS_ID);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as BarbershopProfile;
      }
      return null;
    } catch (error) {
      console.error("Error fetching barbershop profile:", error);
      return null;
    }
  },

  async updateProfile(data: Partial<BarbershopProfile>): Promise<void> {
    try {
      const docRef = doc(db, 'settings', SETTINGS_ID);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error updating barbershop profile:", error);
      throw error;
    }
  }
};
