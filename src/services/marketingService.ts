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
import { MarketingCampaign, MarketingAutomation, MarketingHistory, UserProfile } from '../types';
import { subDays, isBefore, parseISO } from 'date-fns';
import { getActiveTenantId } from './tenantService';

const CAMPAIGNS_COLLECTION = 'marketing_campaigns';
const AUTOMATIONS_COLLECTION = 'marketing_automations';
const HISTORY_COLLECTION = 'marketing_history';
const USERS_COLLECTION = 'usuarios';

export const marketingService = {
  // Campaigns
  async getCampaigns() {
    const q = query(collection(db, CAMPAIGNS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const campaigns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingCampaign));
    return campaigns.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async createCampaign(campaign: Omit<MarketingCampaign, 'id' | 'createdAt' | 'updatedAt' | 'impactedCount'>) {
    const docRef = await addDoc(collection(db, CAMPAIGNS_COLLECTION), {
      ...campaign,
      tenantId: getActiveTenantId(),
      impactedCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  // Automations
  async getAutomations() {
    const q = query(collection(db, AUTOMATIONS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const automations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingAutomation));
    return automations.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async createAutomation(automation: Omit<MarketingAutomation, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, AUTOMATIONS_COLLECTION), {
      ...automation,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateAutomation(id: string, data: Partial<MarketingAutomation>) {
    const docRef = doc(db, AUTOMATIONS_COLLECTION, id);
    await updateDoc(docRef, data);
  },

  // Inactive Clients Logic
  async getInactiveClients(days: number = 30) {
    const thresholdDate = subDays(new Date(), days);
    const q = query(
      collection(db, USERS_COLLECTION), 
      where('tenantId', '==', getActiveTenantId()),
      where('tipo', '==', 'cliente'),
      where('ativo', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const clients = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    
    return clients.filter(client => {
      if (!client.lastVisit) return true; // Never visited is technically inactive
      const lastVisitDate = parseISO(client.lastVisit);
      return isBefore(lastVisitDate, thresholdDate);
    });
  },

  // Simulate Message Sending
  async sendSimulatedMessage(data: Omit<MarketingHistory, 'id' | 'sentAt' | 'status'>) {
    const docRef = await addDoc(collection(db, HISTORY_COLLECTION), {
      tenantId: getActiveTenantId(),
      cliente_id: data.cliente_id,
      cliente_name: data.cliente_name,
      clientPhone: data.clientPhone,
      campanha_id: data.campanha_id,
      automacao_id: data.automacao_id,
      message: data.message,
      sentAt: serverTimestamp(),
      status: 'sent'
    });
    
    return docRef.id;
  },

  async getMarketingHistory() {
    const q = query(collection(db, HISTORY_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const history = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingHistory));
    return history.sort((a, b) => {
      const aTime = a.sentAt?.seconds || a.sentAt?.toMillis?.() || 0;
      const bTime = b.sentAt?.seconds || b.sentAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }
};
