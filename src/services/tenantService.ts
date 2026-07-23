import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  collection, 
  getDocs, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface SaaSPlan {
  id: string;
  name: string;
  maxBarbers: number;
  priceMonthly: number;
  description: string;
  features: string[];
  popular?: boolean;
  active: boolean;
  createdAt?: any;
}

export interface TenantProfile {
  id: string;
  name: string;
  logoUrl?: string;
  accentColor: string; // e.g. Hex code #6366F1 or #F59E0B
  secondaryColor?: string; // e.g. Second brand color
  phone?: string;
  email?: string;
  cnpjCpf?: string;
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  isActive: boolean;
  createdAt?: any;
  updatedAt?: any;
  instagram?: string;
  facebook?: string;
  whatsapp?: string;
  aboutText?: string;
  coverImage?: string;

  // Configurações de SaaS, Planos e Período de Teste (Trial)
  planId?: string;
  planName?: string;
  maxProfessionals?: number; // Limite máximo de profissionais ativos permitidos
  pricePerProfessional?: number; // Valor cobrado por profissional/mês (ex: 39.90)
  monthlyFeeOverride?: number; // Valor mensal fixo customizado
  planStatus?: 'trial' | 'active' | 'pending' | 'suspended' | 'canceled';
  trialDays?: number; // ex: 30
  trialStartDate?: string; // ISO date string
  trialEndDate?: string; // ISO date string
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  dueDateDay?: number; // Dia de vencimento da fatura mensal (1 a 31)
  notes?: string;
}

export function getActiveTenantId(): string {
  if (typeof window === 'undefined') return '';

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
  return '';
}

export const tenantService = {
  async getTenant(tenantId: string): Promise<TenantProfile | null> {
    if (!tenantId) return null;
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

  async getOrCreateTenant(tenantId: string, defaultName?: string): Promise<TenantProfile | null> {
    if (!tenantId) return null;
    try {
      const tenant = await this.getTenant(tenantId);
      if (tenant) return tenant;

      // Only return temporary object if a custom defaultName is explicitly provided
      if (defaultName) {
        const newTenant: TenantProfile = {
          id: tenantId,
          name: defaultName,
          accentColor: '#6366F1', // default indigo
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return newTenant;
      }

      return null;
    } catch (error) {
      console.error(`Error in getOrCreateTenant for ${tenantId}:`, error);
      return null;
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

  async createTenant(tenantData: Partial<TenantProfile> & { id: string; name: string }): Promise<TenantProfile> {
    try {
      const tenantId = tenantData.id.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
      const docRef = doc(db, 'tenants', tenantId);
      const newTenant: TenantProfile = {
        id: tenantId,
        name: tenantData.name,
        accentColor: tenantData.accentColor || '#10B981',
        secondaryColor: tenantData.secondaryColor || '#3B82F6',
        isActive: tenantData.isActive !== false,
        maxProfessionals: tenantData.maxProfessionals ?? 5,
        pricePerProfessional: tenantData.pricePerProfessional ?? 39.90,
        monthlyFeeOverride: tenantData.monthlyFeeOverride ?? undefined,
        planId: tenantData.planId || undefined,
        planName: tenantData.planName || undefined,
        planStatus: tenantData.planStatus || 'active',
        trialDays: tenantData.trialDays || undefined,
        trialStartDate: tenantData.trialStartDate || undefined,
        trialEndDate: tenantData.trialEndDate || undefined,
        ownerName: tenantData.ownerName || '',
        ownerEmail: tenantData.ownerEmail || '',
        ownerPhone: tenantData.ownerPhone || '',
        dueDateDay: tenantData.dueDateDay || 10,
        phone: tenantData.phone || '',
        email: tenantData.email || '',
        cnpjCpf: tenantData.cnpjCpf || '',
        address: tenantData.address || undefined,
        notes: tenantData.notes || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await setDoc(docRef, {
        ...newTenant,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return newTenant;
    } catch (error) {
      console.error('Error creating tenant:', error);
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
  },

  async listAllTenantsSystem(): Promise<TenantProfile[]> {
    try {
      const snap = await getDocs(collection(db, 'tenants'));
      return snap.docs.map(d => d.data() as TenantProfile);
    } catch (error) {
      console.error('Error listing all tenants system:', error);
      return [];
    }
  },

  async listPlans(): Promise<SaaSPlan[]> {
    try {
      const snap = await getDocs(collection(db, 'saas_plans'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as SaaSPlan));
    } catch (error) {
      console.error('Error listing saas plans:', error);
      return [];
    }
  },

  async createPlan(plan: Omit<SaaSPlan, 'id'> & { id?: string }): Promise<SaaSPlan> {
    try {
      const id = plan.id || Math.random().toString(36).substring(2, 9);
      const docRef = doc(db, 'saas_plans', id);
      const newPlan: SaaSPlan = {
        id,
        name: plan.name,
        maxBarbers: plan.maxBarbers,
        priceMonthly: plan.priceMonthly,
        description: plan.description || '',
        features: plan.features || [],
        popular: !!plan.popular,
        active: plan.active !== false,
        createdAt: new Date()
      };
      await setDoc(docRef, {
        ...newPlan,
        createdAt: serverTimestamp()
      });
      return newPlan;
    } catch (error) {
      console.error('Error creating saas plan:', error);
      throw error;
    }
  },

  async updatePlan(planId: string, data: Partial<SaaSPlan>): Promise<void> {
    try {
      const docRef = doc(db, 'saas_plans', planId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Error updating saas plan ${planId}:`, error);
      throw error;
    }
  },

  async deletePlan(planId: string): Promise<void> {
    try {
      const docRef = doc(db, 'saas_plans', planId);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error deleting saas plan ${planId}:`, error);
      throw error;
    }
  },

  async getPlatformSettings(): Promise<any> {
    try {
      const docRef = doc(db, 'saas_settings', 'platform');
      const snap = await getDoc(docRef);
      return snap.exists() ? snap.data() : { pixKey: '43999227226', pixName: 'BarberElite Pay', pixCity: 'LONDRINA', qrCodeUrl: '' };
    } catch (error) {
      console.error('Error fetching platform settings:', error);
      return { pixKey: '43999227226', pixName: 'BarberElite Pay', pixCity: 'LONDRINA', qrCodeUrl: '' };
    }
  },

  async savePlatformSettings(data: any): Promise<void> {
    try {
      const docRef = doc(db, 'saas_settings', 'platform');
      await setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
      console.error('Error saving platform settings:', error);
      throw error;
    }
  }
};
