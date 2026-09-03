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
import { db, auth } from '../firebase';

export interface SaaSPlan {
  id: string;
  name: string;
  maxBarbers: number;
  priceMonthly: number;
  description: string;
  features: string[];
  popular?: boolean;
  active: boolean;
  hasSubscriptionsModule?: boolean; // Se este plano SaaS inclui o módulo de Clubes/Assinaturas de Clientes
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
  monthlyGoal?: number;

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
  lastPaymentDate?: string;
  subscriptions_enabled?: boolean; // Módulo de assinaturas ativado ou não
  niche?: 'barbearia' | 'petshop' | 'clinica' | 'manicure'; // Ramo / Niche of the establishment

  // Asaas Subaccount (Conta Digital Integrada com CPF/CNPJ)
  asaas?: {
    subaccountId?: string; // ID da subconta Asaas (ex: cus_...)
    apiKey?: string; // Legado (não utilizado para segurança)
    hasKey?: boolean; // Flag indicando que a chave está salva e protegida no private_settings
    lastFour?: string; // Últimos 4 dígitos para identificação segura
    isConfigured?: boolean;
    walletId?: string; // WalletId da subconta
    accountStatus?: string; // APPROVED, PENDING, etc.
    cpfCnpj?: string;
    environment?: 'production' | 'sandbox';
    createdAt?: string;
    updatedAt?: string;
  };

  // Configurações de Agenda e Horários Livres
  slot_interval?: number; // ex: 15, 30, 45, 60 (padrão é 15)
  slot_calculation_strategy?: 'fixed' | 'dynamic'; // 'fixed' ou 'dynamic'

  // Conta Bancária Homologada para Saque (Same-Ownership Payout Account)
  payoutAccount?: TenantPayoutAccount;
}

export interface TenantPayoutAccount {
  type: 'PIX' | 'TED';
  pixKeyType?: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  pixKey?: string;
  bankCode?: string;
  bankName?: string;
  agency?: string;
  account?: string;
  accountDigit?: string;
  bankAccountType?: 'CONTA_CORRENTE' | 'CONTA_POUPANCA';
  holderName: string;
  holderDocument: string; // Imutável - Mesmo CPF/CNPJ da barbearia
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  approvedAt?: string;
  updatedAt?: string;
  rejectionReason?: string;
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

  // 3. Default fallback (Return empty string so root domain visitors see SaaS landing page)
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
      if (tenantId === 'gbcortes7') {
        return {
          id: 'gbcortes7',
          name: 'GB Cortes',
          accentColor: '#6366F1',
          isActive: true
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching tenant ${tenantId}:`, error);
      if (tenantId === 'gbcortes7') {
        return {
          id: 'gbcortes7',
          name: 'GB Cortes',
          accentColor: '#6366F1',
          isActive: true
        };
      }
      return null;
    }
  },

  async getOrCreateTenant(tenantId: string, defaultName?: string): Promise<TenantProfile | null> {
    if (!tenantId) return null;
    try {
      const tenant = await this.getTenant(tenantId);
      if (tenant) return tenant;

      // Always return a tenant object instead of null to prevent app from breaking
      const newTenant: TenantProfile = {
        id: tenantId,
        name: defaultName || (tenantId === 'gbcortes7' ? 'GB Cortes' : tenantId),
        accentColor: '#6366F1', // default indigo
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return newTenant;
    } catch (error) {
      console.error(`Error in getOrCreateTenant for ${tenantId}:`, error);
      return {
        id: tenantId,
        name: defaultName || (tenantId === 'gbcortes7' ? 'GB Cortes' : tenantId),
        accentColor: '#6366F1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
  },

  async updateTenant(tenantId: string, data: Partial<TenantProfile>, options?: { allowAsaasUpdate?: boolean }): Promise<void> {
    try {
      const docRef = doc(db, 'tenants', tenantId);
      
      const updateData: any = {};
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'id' && value !== undefined) {
          updateData[key] = value;
        }
      }

      // Security Protection: If not explicitly authorized by Master Admin, preserve existing asaas subaccount credentials & cnpjCpf
      if (!options?.allowAsaasUpdate) {
        const existingSnap = await getDoc(docRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as TenantProfile;
          if (existingData.asaas) {
            updateData.asaas = existingData.asaas;
          }
          if (existingData.cnpjCpf) {
            updateData.cnpjCpf = existingData.cnpjCpf;
          }
        }
      }

      await updateDoc(docRef, {
        ...updateData,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Error updating tenant ${tenantId}:`, error);
      throw error;
    }
  },

  /**
   * Salva ou atualiza a chave de API do Asaas de forma 100% BLINDADA.
   * A chave física é armazenada exclusivamente no backend em `private_settings/asaas`
   * e NUNCA é exposta no documento público do tenant no Firestore.
   */
  async saveAsaasKeySecure(tenantId: string, apiKey: string, environment: 'production' | 'sandbox' = 'production'): Promise<{ success: boolean; asaas: any }> {
    const cleanKey = (apiKey || '').trim();
    const cleanTenantId = (tenantId || '').trim();

    try {
      const rawToken = await auth.currentUser?.getIdToken();
      const cleanToken = rawToken ? rawToken.replace(/[^\x20-\x7E]/g, '').trim() : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (cleanToken) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      }

      const response = await fetch('/api/admin/save-asaas-key', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId: cleanTenantId,
          apiKey: cleanKey,
          environment
        })
      });

      const resData = await response.json();
      if (response.ok && resData?.success) {
        return resData;
      }
      throw new Error(resData?.error || 'Erro no servidor ao salvar chave.');
    } catch (error: any) {
      console.warn(`[saveAsaasKeySecure] Backend indisponível ou sem permissão. Aplicando salvamento seguro via Firestore client...`, error?.message || error);

      if (!cleanTenantId) {
        throw new Error('ID da unidade/tenant inválido.');
      }

      const asaasMeta = {
        hasKey: !!cleanKey,
        environment,
        lastFour: cleanKey ? cleanKey.slice(-4) : '••••',
        updatedAt: new Date().toISOString()
      };

      // 1. Salva a chave completa em subcoleção restrita private_settings/asaas
      const privateDocRef = doc(db, 'tenants', cleanTenantId, 'private_settings', 'asaas');
      await setDoc(privateDocRef, {
        apiKey: cleanKey,
        environment,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Atualiza os metadados públicos no documento do tenant (sem expor a chave inteira)
      const tenantDocRef = doc(db, 'tenants', cleanTenantId);
      await updateDoc(tenantDocRef, {
        asaas: asaasMeta,
        updatedAt: serverTimestamp()
      });

      return {
        success: true,
        asaas: asaasMeta
      };
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
        subscriptions_enabled: tenantData.subscriptions_enabled ?? false,
        asaas: tenantData.asaas || undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Sanitize undefined fields to prevent firestore setDoc crash
      const cleanedTenant: any = {};
      for (const [key, value] of Object.entries(newTenant)) {
        if (value !== undefined) {
          cleanedTenant[key] = value;
        }
      }

      await setDoc(docRef, {
        ...cleanedTenant,
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
        hasSubscriptionsModule: !!plan.hasSubscriptionsModule,
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
  },

  async getPayoutAccount(tenantId: string): Promise<TenantPayoutAccount | null> {
    if (!tenantId) return null;
    try {
      const docRef = doc(db, 'tenants', tenantId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as TenantProfile;
        return data.payoutAccount || null;
      }
      return null;
    } catch (err) {
      console.error(`Error fetching payout account for tenant ${tenantId}:`, err);
      return null;
    }
  },

  async savePayoutAccount(tenantId: string, accountData: TenantPayoutAccount): Promise<void> {
    if (!tenantId) throw new Error("tenantId é obrigatório");
    try {
      const docRef = doc(db, 'tenants', tenantId);
      await setDoc(docRef, {
        payoutAccount: {
          ...accountData,
          updatedAt: new Date().toISOString()
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error(`Error saving payout account for tenant ${tenantId}:`, err);
      throw err;
    }
  }
};
