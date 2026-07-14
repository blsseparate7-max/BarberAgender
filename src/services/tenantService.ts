import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface TenantProfile {
  id: string;
  name: string;
  logoUrl?: string;
  accentColor: string; // e.g. Hex code #6366F1 or #F59E0B
  phone?: string;
  email?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export function getActiveTenantId(): string {
  if (typeof window === 'undefined') return 'barber-elite';

  // 1. Try URL parameters first
  const params = new URLSearchParams(window.location.search);
  const urlTenant = params.get('tenant') || params.get('tenantId');
  if (urlTenant) {
    const cleanTenant = urlTenant.trim().toLowerCase();
    localStorage.setItem('barberelite_tenant_id', cleanTenant);
    return cleanTenant;
  }

  // 2. Try localStorage
  const saved = localStorage.getItem('barberelite_tenant_id');
  if (saved) return saved.trim().toLowerCase();

  // 3. Default fallback
  return 'barber-elite';
}

export const tenantService = {
  async getTenant(tenantId: string): Promise<TenantProfile | null> {
    try {
      const docRef = doc(db, 'tenants', tenantId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as TenantProfile;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching tenant ${tenantId}:`, error);
      return null;
    }
  },

  async getOrCreateTenant(tenantId: string, defaultName?: string): Promise<TenantProfile> {
    try {
      const tenant = await this.getTenant(tenantId);
      if (tenant) return tenant;

      // Auto-create with default values if it doesn't exist
      const newTenant: TenantProfile = {
        id: tenantId,
        name: defaultName || (tenantId === 'barber-elite' ? 'BarberElite Premium' : `Barbearia ${tenantId.toUpperCase()}`),
        accentColor: '#6366F1', // default indigo
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        phone: '(11) 99999-9999',
        email: `${tenantId}@barberelite.com`,
        address: {
          street: 'Av. Paulista, 1000',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310-100'
        }
      };

      // Only persist if it is a real user-created tenant (not the default barber-elite fallback)
      if (tenantId !== 'barber-elite') {
        await setDoc(doc(db, 'tenants', tenantId), {
          ...newTenant,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      return newTenant;
    } catch (error) {
      console.error(`Error in getOrCreateTenant for ${tenantId}:`, error);
      // Return safe fallback
      return {
        id: tenantId,
        name: tenantId === 'barber-elite' ? 'BarberElite Premium' : `Barbearia ${tenantId}`,
        accentColor: '#6366F1',
        isActive: true
      };
    }
  },

  async updateTenant(tenantId: string, data: Partial<TenantProfile>): Promise<void> {
    try {
      const docRef = doc(db, 'tenants', tenantId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Error updating tenant ${tenantId}:`, error);
      throw error;
    }
  },

  async listTenants(): Promise<TenantProfile[]> {
    try {
      const q = query(collection(db, 'tenants'), where('isActive', '==', true));
      const snap = await getDocs(q);
      return snap.docs.map(d => d.data() as TenantProfile);
    } catch (error) {
      console.error('Error listing tenants:', error);
      return [];
    }
  }
};
