
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
  async getCommissions(filters: { profissional_id?: string; status?: CommissionStatus; startDate?: string; endDate?: string; tenantId?: string }) {
    const activeTenant = filters.tenantId || getActiveTenantId();
    let queryConstraints: any[] = [];
    if (activeTenant) {
      queryConstraints.push(where('tenantId', '==', activeTenant));
    }
    if (filters.profissional_id) {
      queryConstraints.push(where('profissional_id', '==', filters.profissional_id));
    }

    let querySnapshot = await getDocs(query(collection(db, COMMISSIONS_COLLECTION), ...queryConstraints));
    let results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));

    if (results.length === 0 && filters.profissional_id && activeTenant) {
      try {
        const fallbackSnap = await getDocs(query(collection(db, COMMISSIONS_COLLECTION), where('profissional_id', '==', filters.profissional_id)));
        if (!fallbackSnap.empty) {
          results = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));
        }
      } catch (e) {
        console.warn("Fallback query for commissions failed:", e);
      }
    }

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

  async getAdvances(filters: { profissional_id?: string; profissional_name?: string; startDate?: string; endDate?: string; tenantId?: string }) {
    const activeTenant = filters.tenantId || getActiveTenantId();
    let queryConstraints: any[] = [];
    if (activeTenant) {
      queryConstraints.push(where('tenantId', '==', activeTenant));
    }
    if (filters.profissional_id) {
      queryConstraints.push(where('profissional_id', '==', filters.profissional_id));
    }

    let snap = await getDocs(query(collection(db, ADVANCES_COLLECTION), ...queryConstraints));
    let results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalAdvance));

    if (results.length === 0 && filters.profissional_id) {
      try {
        const fallbackSnap = await getDocs(query(collection(db, ADVANCES_COLLECTION), where('profissional_id', '==', filters.profissional_id)));
        if (!fallbackSnap.empty) {
          results = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalAdvance));
        }
      } catch (e) {
        console.warn("Fallback query for advances failed:", e);
      }
    }

    // Try to get target professional name if filters.profissional_id is set
    let targetProName = (filters.profissional_name || '').toLowerCase().trim();
    let targetProFirstName = targetProName.split(' ')[0] || '';
    if (filters.profissional_id) {
      try {
        const userDoc = await getDoc(doc(db, 'usuarios', filters.profissional_id));
        if (userDoc.exists()) {
          targetProName = (userDoc.data().nome || '').toLowerCase().trim();
          targetProFirstName = targetProName.split(' ')[0] || '';
        } else {
          const uSnap = await getDocs(query(collection(db, 'usuarios'), where('uid', '==', filters.profissional_id)));
          if (!uSnap.empty) {
            targetProName = (uSnap.docs[0].data().nome || '').toLowerCase().trim();
            targetProFirstName = targetProName.split(' ')[0] || '';
          }
        }
      } catch (e) {
        console.warn("Could not fetch user doc for advance name matching:", e);
      }
    }

    const nameParts = targetProName.split(' ').filter(p => p.length >= 3);

    // Merge vales/adiantamentos registered in accounts_payable
    try {
      let payablesQuery;
      if (activeTenant) {
        payablesQuery = query(
          collection(db, 'accounts_payable'),
          where('tenantId', '==', activeTenant)
        );
      } else {
        payablesQuery = query(collection(db, 'accounts_payable'));
      }

      let payablesSnap = await getDocs(payablesQuery);
      if (payablesSnap.empty && activeTenant) {
        payablesSnap = await getDocs(query(collection(db, 'accounts_payable')));
      }

      payablesSnap.docs.forEach(docSnap => {
        const p = docSnap.data() as any;
        const category = (p.category || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const supplier = (p.supplier || '').toLowerCase();
        const proName = (p.profissional_name || '').toLowerCase();
        const isVale = category.includes('adiantamento') || category.includes('vale') || category.includes('comissão') || category.includes('comissoes') || desc.includes('adiantamento') || desc.includes('vale');

        let matchesPro = true;
        if (filters.profissional_id) {
          matchesPro = p.profissional_id === filters.profissional_id ||
            (targetProName && (supplier.includes(targetProName) || proName.includes(targetProName) || desc.includes(targetProName) || (targetProFirstName.length > 2 && desc.includes(targetProFirstName))));
        }

        if ((isVale || p.profissional_id) && matchesPro) {
          const pDate = p.paidAt ? p.paidAt.split('T')[0] : (p.dueDate || '');
          const pAmount = p.amount || 0;

          // Check if already in results
          const isDuplicate = results.some(r => 
            r.id === docSnap.id || 
            (Math.abs(r.amount - pAmount) < 0.01 && r.date === pDate)
          );

          if (!isDuplicate) {
            results.push({
              id: docSnap.id,
              tenantId: p.tenantId || activeTenant,
              profissional_id: p.profissional_id || filters.profissional_id || '',
              profissional_name: p.profissional_name || p.supplier || 'Profissional',
              amount: pAmount,
              date: pDate || new Date().toISOString().split('T')[0],
              description: p.description || 'Adiantamento / Vale',
              status: p.status === 'paid' ? 'pago' : 'pendente',
              responsible_id: '',
              responsible_name: '',
              createdAt: p.createdAt,
              updatedAt: p.updatedAt
            } as ProfessionalAdvance);
          }
        }
      });
    } catch (err) {
      console.warn("Could not fetch payables as advances:", err);
    }

    // Merge vales/adiantamentos registered in cash_movements
    try {
      let cashQuery;
      if (activeTenant) {
        cashQuery = query(
          collection(db, 'cash_movements'),
          where('tenantId', '==', activeTenant)
        );
      } else {
        cashQuery = query(collection(db, 'cash_movements'));
      }

      let cashSnap = await getDocs(cashQuery);
      if (cashSnap.empty && activeTenant) {
        cashSnap = await getDocs(query(collection(db, 'cash_movements')));
      }

      cashSnap.docs.forEach(docSnap => {
        const c = docSnap.data() as any;
        const category = (c.category || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        const cProName = (c.profissional_name || '').toLowerCase();
        const isVale = c.type === 'sangria' || category.includes('vale') || category.includes('adiantamento') || desc.includes('vale') || desc.includes('adiantamento');

        let matchesPro = true;
        if (filters.profissional_id) {
          matchesPro = c.profissional_id === filters.profissional_id || c.barber_id === filters.profissional_id ||
            (targetProName && (desc.includes(targetProName) || cProName.includes(targetProName) || (targetProFirstName.length > 2 && desc.includes(targetProFirstName))));
        }

        if (isVale && matchesPro) {
          const cDate = c.date || (c.createdAt ? new Date(c.createdAt.seconds * 1000).toISOString().split('T')[0] : '');
          const cAmount = c.amount || 0;

          const isDuplicate = results.some(r => 
            r.id === docSnap.id || 
            (Math.abs(r.amount - cAmount) < 0.01 && r.date === cDate)
          );

          if (!isDuplicate) {
            results.push({
              id: docSnap.id,
              tenantId: c.tenantId || activeTenant,
              profissional_id: c.profissional_id || filters.profissional_id || '',
              profissional_name: c.profissional_name || targetProName || 'Profissional',
              amount: cAmount,
              date: cDate || new Date().toISOString().split('T')[0],
              description: c.description || 'Vale / Sangria de Caixa',
              status: 'pendente',
              responsible_id: c.usuario_id || '',
              responsible_name: c.usuario_name || '',
              createdAt: c.createdAt,
              updatedAt: c.updatedAt
            } as ProfessionalAdvance);
          }
        }
      });
    } catch (err) {
      console.warn("Could not fetch cash_movements as advances:", err);
    }

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

  async registerBonus(data: {
    profissional_id: string;
    profissional_name: string;
    amount: number;
    description: string;
    date?: string;
    responsible_id?: string;
    responsible_name?: string;
  }) {
    const todayString = data.date || new Date().toISOString().split('T')[0];
    const docRef = await addDoc(collection(db, COMMISSIONS_COLLECTION), {
      tenantId: getActiveTenantId(),
      profissional_id: data.profissional_id,
      profissional_name: data.profissional_name,
      servico_name: `Bônus / Gratificação: ${data.description || 'Desempenho'}`,
      commission_type: 'bonus',
      base_value: 0,
      commission_percentage: 100,
      commission_value: data.amount,
      status: 'pendente',
      date: todayString,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      responsavel_id: data.responsible_id || '',
      responsavel_name: data.responsible_name || 'Admin'
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

  async getPayouts(profissional_id?: string, tenantId?: string) {
    const activeTenant = tenantId || getActiveTenantId();
    let queryConstraints: any[] = [];
    if (activeTenant) {
      queryConstraints.push(where('tenantId', '==', activeTenant));
    }
    if (profissional_id) {
      queryConstraints.push(where('profissional_id', '==', profissional_id));
    }

    let querySnapshot = await getDocs(query(collection(db, PAYOUTS_COLLECTION), ...queryConstraints));
    let results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalPayment));

    if (results.length === 0 && profissional_id && activeTenant) {
      try {
        const fallbackSnap = await getDocs(query(collection(db, PAYOUTS_COLLECTION), where('profissional_id', '==', profissional_id)));
        if (!fallbackSnap.empty) {
          results = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalPayment));
        }
      } catch (e) {
        console.warn("Fallback query for payouts failed:", e);
      }
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

  // Novo Drill Down completo com alinhamento de saldo real pendente (todas do período de comissões não pagas vs vales não pagos)
  async getProfessionalSummary(startDate: string, endDate: string) {
    const [barbers, commissions, advances, allPendingComms, allPendingAdvs] = await Promise.all([
      getDocs(query(collection(db, 'usuarios'), where('tenantId', '==', getActiveTenantId()), where('tipo', 'in', ['barbeiro', 'gerente']))),
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

  async getCommissionStats(profissional_id?: string, startDate?: string, endDate?: string, tenantId?: string) {
    const commissions = await this.getCommissions({ profissional_id, startDate, endDate, tenantId });
    
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
