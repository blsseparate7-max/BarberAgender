import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';

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

export const settingsService = {
  async getProfile(): Promise<BarbershopProfile | null> {
    try {
      const tenantId = getActiveTenantId();
      const docRef = doc(db, 'settings', tenantId);
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
      const tenantId = getActiveTenantId();
      const docRef = doc(db, 'settings', tenantId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(docRef, {
          ...data,
          tenantId,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Error updating barbershop profile:", error);
      throw error;
    }
  }
};
