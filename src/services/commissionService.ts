
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  limit,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Commission, CommissionPayout, CommissionStatus, ProfessionalAdvance, ProfessionalPayment } from '../types';
import { getActiveTenantId } from './tenantService';

const COMMISSIONS_COLLECTION = 'commissions';
const PAYOUTS_COLLECTION = 'professional_payments';
const ADVANCES_COLLECTION = 'professional_advances';

export const commissionService = {
  async getCommissions(filters: { profissional_id?: string; status?: CommissionStatus; startDate?: string; endDate?: string }) {
    let q = query(collection(db, COMMISSIONS_COLLECTION), where('tenantId', '==', getActiveTenantId()));

    if (filters.profissional_id) {
      q = query(q, where('profissional_id', '==', filters.profissional_id));
    }

    const querySnapshot = await getDocs(q);
    let results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));

    // Filter in memory
    if (filters.status) {
      results = results.filter(c => c.status === filters.status);
    }
    if (filters.startDate && filters.endDate) {
      results = results.filter(c => c.date >= filters.startDate! && c.date <= filters.endDate!);
    }

    // Sort in memory by date desc, then by seconds desc, then by ID
    results.sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      if (timeB !== timeA) return timeB - timeA;
      
      return (b.id || '').localeCompare(a.id || '');
    });

    return results;
  },

  async getAdvances(filters: { profissional_id?: string; startDate?: string; endDate?: string }) {
    let q = query(collection(db, ADVANCES_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (filters.profissional_id) {
      q = query(q, where('profissional_id', '==', filters.profissional_id));
    }
    const snap = await getDocs(q);
    let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalAdvance));

    if (filters.startDate && filters.endDate) {
      results = results.filter(a => a.date >= filters.startDate! && a.date <= filters.endDate!);
    }

    results.sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      if (timeB !== timeA) return timeB - timeA;
      
      return (b.id || '').localeCompare(a.id || '');
    });

    return results;
  },

  async registerAdvance(data: Omit<ProfessionalAdvance, 'id' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, ADVANCES_COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      status: 'pendente',
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async createCommission(data: Omit<Commission, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, COMMISSIONS_COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async getPayouts(profissional_id?: string) {
    let q = query(collection(db, PAYOUTS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (profissional_id) {
      q = query(q, where('profissional_id', '==', profissional_id));
    }
    const querySnapshot = await getDocs(q);
    let results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalPayment));

    results.sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      if (timeB !== timeA) return timeB - timeA;
      
      return (b.id || '').localeCompare(a.id || '');
    });

    return results;
  },

  // Novo Drill Down completo com alinhamento de saldo real pendente (todas do período de comissões não pagas vs vales não pagos)
  async getProfessionalSummary(startDate: string, endDate: string) {
    const [barbers, commissions, advances, allPendingComms, allPendingAdvs] = await Promise.all([
      getDocs(query(collection(db, 'usuarios'), where('tenantId', '==', getActiveTenantId()), where('tipo', '==', 'barbeiro'))),
      this.getCommissions({ startDate, endDate }),
      this.getAdvances({ startDate, endDate }),
      this.getCommissions({ status: 'pendente' }),
      this.getAdvances({})
    ]);

    const barbersList = barbers.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any));

    return barbersList.map(barber => {
      const proComms = commissions.filter(c => c.profissional_id === barber.uid);
      const proAdvances = advances.filter(a => a.profissional_id === barber.uid);

      const production = proComms.reduce((acc, c) => acc + (c.base_value || 0), 0);
      const commissionGenerated = proComms.reduce((acc, c) => acc + (c.commission_value || 0), 0);
      const vales = proAdvances.reduce((acc, a) => acc + (a.amount || 0), 0);

      // Sincronização matemática exata com o ledger de fechamento geral do profissional
      const pendingCommsAll = allPendingComms.filter(c => c.profissional_id === barber.uid);
      const pendingAdvsAll = allPendingAdvs.filter(a => a.profissional_id === barber.uid && a.status !== 'pago' && a.status !== 'deduzido');

      const totalPendingComms = pendingCommsAll.reduce((acc, c) => acc + (c.commission_value || 0), 0);
      const totalPendingAdvs = pendingAdvsAll.reduce((acc, a) => acc + (a.amount || 0), 0);
      const balance = totalPendingComms - totalPendingAdvs;

      return {
        id: barber.uid,
        nome: barber.nome,
        production,
        commissionGenerated,
        vales,
        paid: 0,
        balance
      };
    });
  },

  async registerPayout(data: Omit<ProfessionalPayment, 'id' | 'createdAt'> & { commission_ids: string[]; advance_ids?: string[] }) {
    const batch = writeBatch(db);
    
    // 1. Create payout record
    const payoutRef = doc(collection(db, PAYOUTS_COLLECTION));
    batch.set(payoutRef, {
      ...data,
      tenantId: getActiveTenantId(),
      id: payoutRef.id,
      createdAt: serverTimestamp(),
    });

    // 2. Update all commissions to 'pago' status
    data.commission_ids.forEach(id => {
      const commissionRef = doc(db, COMMISSIONS_COLLECTION, id);
      batch.update(commissionRef, {
        status: 'pago',
        repasse_id: payoutRef.id,
        updatedAt: serverTimestamp()
      });
    });

    // 3. Update all advances/vales associated with this repasse
    if (data.advance_ids && data.advance_ids.length > 0) {
      data.advance_ids.forEach(id => {
        const advanceRef = doc(db, ADVANCES_COLLECTION, id);
        batch.update(advanceRef, {
          status: 'pago',
          repasse_id: payoutRef.id
        });
      });
    }

    await batch.commit();
    return payoutRef.id;
  },

  async getCommissionStats(profissional_id?: string, startDate?: string, endDate?: string) {
    const commissions = await this.getCommissions({ profissional_id, startDate, endDate });
    
    const pending = commissions
      .filter(c => c.status === 'pendente')
      .reduce((acc, c) => acc + c.commission_value, 0);
      
    const paid = commissions
      .filter(c => c.status === 'pago')
      .reduce((acc, c) => acc + c.commission_value, 0);
      
    const totalBase = commissions
      .reduce((acc, c) => acc + c.base_value, 0);

    return {
      pending,
      paid,
      total: pending + paid,
      totalBase,
      count: commissions.length
    };
  }
};
