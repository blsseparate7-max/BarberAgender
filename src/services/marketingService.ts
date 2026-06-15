
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  orderBy, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { MarketingCampaign, MarketingAutomation, MarketingHistory, UserProfile } from '../types';
import { subDays, format, isBefore, parseISO } from 'date-fns';

const CAMPAIGNS_COLLECTION = 'marketing_campaigns';
const AUTOMATIONS_COLLECTION = 'marketing_automations';
const HISTORY_COLLECTION = 'marketing_history';
const USERS_COLLECTION = 'usuarios';

export const marketingService = {
  // Campaigns
  async getCampaigns() {
    const q = query(collection(db, CAMPAIGNS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingCampaign));
  },

  async createCampaign(campaign: Omit<MarketingCampaign, 'id' | 'createdAt' | 'updatedAt' | 'impactedCount'>) {
    const docRef = await addDoc(collection(db, CAMPAIGNS_COLLECTION), {
      ...campaign,
      impactedCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  // Automations
  async getAutomations() {
    const q = query(collection(db, AUTOMATIONS_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingAutomation));
  },

  async createAutomation(automation: Omit<MarketingAutomation, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, AUTOMATIONS_COLLECTION), {
      ...automation,
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
      where('tipo', '==', 'cliente'),
      where('ativo', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const clients = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    
    // Filter clients whose last appointment was before threshold
    // Note: In a real app, we'd query the appointments collection for the last date
    // For this implementation, we'll assume 'lastVisit' is stored in the user profile or simulated
    return clients.filter(client => {
      if (!client.lastVisit) return true; // Never visited is technically inactive
      const lastVisitDate = parseISO(client.lastVisit);
      return isBefore(lastVisitDate, thresholdDate);
    });
  },

  // Simulate Message Sending
  async sendSimulatedMessage(data: Omit<MarketingHistory, 'id' | 'sentAt' | 'status'>) {
    const docRef = await addDoc(collection(db, HISTORY_COLLECTION), {
      cliente_id: data.cliente_id,
      cliente_name: data.cliente_name,
      clientPhone: data.clientPhone,
      campanha_id: data.campanha_id,
      automacao_id: data.automacao_id,
      message: data.message,
      sentAt: serverTimestamp(),
      status: 'sent'
    });
    
    // If it's a campaign, increment impacted count
    if (data.campanha_id) {
      const campaignRef = doc(db, CAMPAIGNS_COLLECTION, data.campanha_id);
      // We'd use increment(1) here in a real transaction
    }

    return docRef.id;
  },

  async getMarketingHistory() {
    const q = query(collection(db, HISTORY_COLLECTION), orderBy('sentAt', 'desc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MarketingHistory));
  }
};
