
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
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
import { financialService } from './financialService';
import { cashService } from './cashService';
import { billService } from './billService';

const COMMISSIONS_COLLECTION = 'commissions';
const PAYOUTS_COLLECTION = 'professional_payments';
const ADVANCES_COLLECTION = 'professional_advances';

export const commissionService = {
  async getCommissions(filters: { profissional_id?: string; profissional_name?: string; status?: CommissionStatus; startDate?: string; endDate?: string; tenantId?: string }) {
    const activeTenant = filters.tenantId || getActiveTenantId();
    let queryConstraints: any[] = [];
    if (activeTenant === 'gbcortes7') {
      queryConstraints.push(where('tenantId', 'in', [activeTenant, '']));
    } else if (activeTenant) {
      queryConstraints.push(where('tenantId', '==', activeTenant));
    }

    let querySnapshot = await getDocs(query(collection(db, COMMISSIONS_COLLECTION), ...queryConstraints));
    let results = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));

    // Tolerant professional filter in memory (matches UID, barbeiro_id, and name variations like Gabriel / Gabriel Alexandre)
    if (filters.profissional_id || filters.profissional_name) {
      const targetId = filters.profissional_id || '';
      const targetName = (filters.profissional_name || '').toLowerCase().trim();
      const targetFirstName = targetName.split(' ')[0] || '';

      results = results.filter(c => {
        if (targetId && (c.profissional_id === targetId || (c as any).barbeiro_id === targetId)) {
          return true;
        }
        const cName = (c.profissional_name || '').toLowerCase().trim();
        if (targetName && cName) {
          if (cName === targetName || cName.includes(targetName) || targetName.includes(cName)) return true;
          if (targetFirstName === 'gabriel' && cName.includes('gabriel')) return true;
        }
        return false;
      });
    }

    // Filter status in memory
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
      if (filters.profissional_id) {
        payablesQuery = query(
          collection(db, 'accounts_payable'),
          where('profissional_id', '==', filters.profissional_id)
        );
      } else if (activeTenant) {
        payablesQuery = query(
          collection(db, 'accounts_payable'),
          where('tenantId', '==', activeTenant)
        );
      } else {
        payablesQuery = query(collection(db, 'accounts_payable'));
      }

      let payablesSnap = await getDocs(payablesQuery);
      if (payablesSnap.empty && activeTenant && !filters.profissional_id) {
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
          matchesPro = p.profissional_id === filters.profissional_id;
        } else {
          matchesPro = !!p.profissional_id;
        }

        if ((isVale || p.profissional_id) && matchesPro) {
          const pDate = p.paidAt ? p.paidAt.split('T')[0] : (p.dueDate || '');
          const pAmount = p.amount || 0;

          // Check if already in results (by ID or matching advance description / amount)
          const isDuplicate = results.some(r => 
            r.id === docSnap.id || 
            p.advanceId === r.id ||
            p.transactionId === r.id ||
            (Math.abs(r.amount - pAmount) < 0.01 && (r.description.toLowerCase().includes(desc) || desc.includes(r.description.toLowerCase())))
          );

          if (isDuplicate) {
            // Only synchronize status if accounts_payable explicitly indicates a repasse/deduction
            if (p.status === 'deduzido' || p.repasse_id || p.payout_id) {
              const match = results.find(r => 
                r.id === docSnap.id || 
                p.advanceId === r.id ||
                p.transactionId === r.id ||
                (Math.abs(r.amount - pAmount) < 0.01 && (r.description.toLowerCase().includes(desc) || desc.includes(r.description.toLowerCase())))
              );
              if (match) match.status = 'deduzido';
            }
          }

          if (!isDuplicate) {
            results.push({
              id: docSnap.id,
              tenantId: p.tenantId || activeTenant,
              profissional_id: p.profissional_id || filters.profissional_id || '',
              profissional_name: p.profissional_name || p.supplier || 'Profissional',
              amount: pAmount,
              date: pDate || new Date().toISOString().split('T')[0],
              description: p.description || 'Adiantamento / Vale',
              status: (p.status === 'deduzido' || p.repasse_id || p.payout_id) ? 'deduzido' : 'pendente',
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
          matchesPro = c.profissional_id === filters.profissional_id || c.barber_id === filters.profissional_id;
        } else {
          matchesPro = !!c.profissional_id || !!c.barber_id;
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

  async registerCompleteVale(data: {
    profissional_id: string;
    profissional_name: string;
    amount: number;
    date: string;
    description: string;
    category?: string;
    source: 'caixa' | 'financeiro';
    paymentMethod: string;
    userId: string;
    userName: string;
    currentCashId?: string;
  }): Promise<{ advanceId: string; transactionId: string; movementId?: string }> {
    const activeTenant = getActiveTenantId();
    const dateStr = data.date || new Date().toISOString().split('T')[0];
    const categoryName = data.category || 'Adiantamento de Comissão';
    const isCaixa = data.source === 'caixa';
    
    // 1. If source is 'caixa', verify that the cash session exists and is open
    let targetCashId = data.currentCashId;
    if (isCaixa) {
      if (!targetCashId) {
        const cashForDate = await cashService.getCashByDate(dateStr);
        if (!cashForDate || (cashForDate.status !== 'open' && cashForDate.status !== 'reopened')) {
          throw new Error(`O caixa de ${dateStr} não está aberto para saída em dinheiro na gaveta. Selecione a opção "Financeiro Geral (Bancos)" ou reabra o caixa do dia.`);
        }
        targetCashId = cashForDate.id;
      }
    }

    // 2. Register Advance in professional_advances
    const advanceRef = await addDoc(collection(db, ADVANCES_COLLECTION), {
      tenantId: activeTenant,
      profissional_id: data.profissional_id,
      profissional_name: data.profissional_name,
      amount: data.amount,
      date: dateStr,
      description: data.description || 'Vale/Adiantamento Avulso',
      category: categoryName,
      source: data.source,
      paymentMethod: data.paymentMethod,
      status: 'pendente',
      responsible_id: data.userId,
      responsible_name: data.userName,
      createdAt: serverTimestamp(),
    });
    const advanceId = advanceRef.id;

    // 3. Register Financial Transaction (Always! Expense for the establishment)
    const transactionId = await financialService.createTransaction({
      type: 'expense',
      category: categoryName,
      description: `Vale: ${data.profissional_name} (${data.description || 'Adiantamento'})`,
      amount: data.amount,
      net_amount: data.amount,
      fee_amount: 0,
      paymentMethod: data.paymentMethod as any,
      date: dateStr,
      settlement_date: dateStr,
      status: 'pago',
      is_settled: true,
      profissional_id: data.profissional_id,
      profissional_name: data.profissional_name,
      responsavel_id: data.userId,
      responsavel_name: data.userName,
    });

    // 4. Register in Accounts Payable (paid bill) for complete accounting audit
    let payableId: string | undefined;
    try {
      payableId = await billService.createPayable({
        description: `Vale: ${data.profissional_name} - ${data.description || 'Adiantamento'}`,
        category: categoryName,
        amount: data.amount,
        dueDate: dateStr,
        supplier: data.profissional_name,
        recurrence: 'none',
        status: 'paid',
        paidAt: new Date().toISOString() as any,
        paymentMethod: data.paymentMethod as any,
        transactionId,
        profissional_id: data.profissional_id,
        profissional_name: data.profissional_name
      });
    } catch (err) {
      console.warn("Could not create accounts_payable entry for vale:", err);
    }

    // 5. Register Cash Movement if source === 'caixa'
    let movementId: string | undefined;
    if (isCaixa && targetCashId) {
      const move = await cashService.addMovement({
        caixa_id: targetCashId,
        type: 'expense',
        category: categoryName,
        description: `Vale/Adiantamento pago a ${data.profissional_name}: ${data.description || 'Adiantamento'}`,
        amount: data.amount,
        paymentMethod: data.paymentMethod as any,
        is_receivable: false,
        usuario_id: data.userId,
        usuario_name: data.userName,
        profissional_id: data.profissional_id,
        profissional_name: data.profissional_name,
        date: dateStr,
        referencia_id: transactionId
      });
      if (move?.id) {
        movementId = move.id;
        await financialService.updateTransaction(transactionId, { movement_id: movementId });
      }
    }

    // 6. Update advance with reference IDs
    await updateDoc(doc(db, ADVANCES_COLLECTION, advanceId), {
      transaction_id: transactionId,
      ...(payableId ? { payable_id: payableId } : {}),
      ...(movementId ? { movement_id: movementId } : {})
    });

    return { advanceId, transactionId, movementId };
  },

  async deleteAdvance(advanceId: string) {
    try {
      const advanceRef = doc(db, ADVANCES_COLLECTION, advanceId);
      const advSnap = await getDoc(advanceRef);
      if (!advSnap.exists()) return;
      const advance = { id: advSnap.id, ...advSnap.data() } as ProfessionalAdvance;

      // 1. Delete advance document
      await deleteDoc(advanceRef);

      // 2. Cascade delete financial_transaction if linked
      try {
        if (advance.transaction_id) {
          const txRef = doc(db, 'financial_transactions', advance.transaction_id);
          const txSnap = await getDoc(txRef);
          if (txSnap.exists()) {
            await deleteDoc(txRef);
          }
        } else {
          // Fallback search
          const q = query(
            collection(db, 'financial_transactions'),
            where('amount', '==', advance.amount)
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const tData = d.data();
            if (
              (tData.profissional_id === advance.profissional_id || (tData.description && tData.description.includes(advance.profissional_name))) &&
              (tData.date === advance.date)
            ) {
              await deleteDoc(d.ref);
            }
          }
        }
      } catch (e) {
        console.warn("Aviso ao deletar transação vinculada ao vale:", e);
      }

      // 3. Cascade delete accounts_payable if linked
      try {
        if (advance.payable_id) {
          const payRef = doc(db, 'accounts_payable', advance.payable_id);
          const paySnap = await getDoc(payRef);
          if (paySnap.exists()) {
            await deleteDoc(payRef);
          }
        } else if (advance.transaction_id) {
          const qPay = query(
            collection(db, 'accounts_payable'),
            where('transactionId', '==', advance.transaction_id)
          );
          const snap = await getDocs(qPay);
          for (const d of snap.docs) {
            await deleteDoc(d.ref);
          }
        }
      } catch (e) {
        console.warn("Aviso ao deletar conta a pagar vinculada ao vale:", e);
      }

      // 4. Cascade delete cash_movement if linked
      try {
        if (advance.movement_id) {
          await cashService.removeMovement(advance.movement_id);
        } else if (advance.transaction_id) {
          const qMove = query(
            collection(db, 'cash_movements'),
            where('referencia_id', '==', advance.transaction_id)
          );
          const snap = await getDocs(qMove);
          for (const d of snap.docs) {
            await cashService.removeMovement(d.id);
          }
        }
      } catch (e) {
        console.warn("Aviso ao estornar movimento de caixa do vale:", e);
      }
    } catch (err) {
      console.error("Erro ao deletar vale unificado:", err);
      throw err;
    }
  },

  async purgeOrphanedVales(tenantId?: string) {
    try {
      const activeTenant = tenantId || getActiveTenantId();
      if (!activeTenant) return;

      const queryConstraints = activeTenant === 'gbcortes7'
        ? [where('tenantId', 'in', [activeTenant, ''])]
        : [where('tenantId', '==', activeTenant)];

      const advSnap = await getDocs(query(collection(db, ADVANCES_COLLECTION), ...queryConstraints));

      for (const docSnap of advSnap.docs) {
        const adv = { id: docSnap.id, ...docSnap.data() } as ProfessionalAdvance;
        const name = (adv.profissional_name || '').toLowerCase();
        const desc = (adv.description || '').toLowerCase();
        
        // 1. Explicit check for Luiz Henrique R$ 3 and Moisés R$ 40
        const isLuiz3 = adv.amount === 3 && (name.includes('luiz') || desc.includes('luiz') || adv.profissional_id === 'luiz' || adv.profissional_id === 'luiz_henrique');
        const isMoises40 = adv.amount === 40 && (name.includes('mois') || desc.includes('mois'));

        // 2. Check if transaction_id was set but no longer exists in financial_transactions
        let isOrphan = false;
        if (adv.transaction_id) {
          try {
            const txDoc = await getDoc(doc(db, 'financial_transactions', adv.transaction_id));
            if (!txDoc.exists()) {
              isOrphan = true;
            }
          } catch (_) {}
        }

        if (isLuiz3 || isMoises40 || isOrphan) {
          console.log(`[Purge Vale] Deletando vale órfão ${docSnap.id}: R$ ${adv.amount} (${adv.profissional_name})`);
          await this.deleteAdvance(docSnap.id);
        }
      }

      // Also clean up any lingering cash_movements or accounts_payable with Luiz 3,00 or Moises 40,00
      try {
        const paySnap = await getDocs(query(collection(db, 'accounts_payable'), ...queryConstraints));
        for (const pDoc of paySnap.docs) {
          const p = pDoc.data();
          const desc = (p.description || '').toLowerCase();
          const sup = (p.supplier || '').toLowerCase();
          if (
            (p.amount === 3 && (desc.includes('luiz') || sup.includes('luiz'))) ||
            (p.amount === 40 && (desc.includes('mois') || sup.includes('mois')))
          ) {
            await deleteDoc(pDoc.ref);
          }
        }

        const moveSnap = await getDocs(query(collection(db, 'cash_movements'), ...queryConstraints));
        for (const mDoc of moveSnap.docs) {
          const m = mDoc.data();
          const desc = (m.description || '').toLowerCase();
          if (
            (m.amount === 3 && desc.includes('luiz')) ||
            (m.amount === 40 && desc.includes('mois'))
          ) {
            await deleteDoc(mDoc.ref);
          }
        }
      } catch (e) {
        console.warn("Aviso ao limpar resíduos adicionais:", e);
      }
    } catch (err) {
      console.error("Erro ao purgar vales órfãos:", err);
    }
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
      getDocs(query(collection(db, 'usuarios'), where('tenantId', '==', getActiveTenantId()), where('tipo', 'in', ['barbeiro', 'gerente', 'admin']))),
      this.getCommissions({ startDate, endDate }),
      this.getAdvances({ startDate, endDate }),
      this.getCommissions({ status: 'pendente' }),
      this.getAdvances({})
    ]);

    const barbersList = barbers.docs.map(doc => ({ uid: doc.id, ...doc.data() } as any));

    return barbersList.map(barber => {
      const proComms = commissions.filter(c => c.profissional_id === barber.uid);
      const proAdvances = advances.filter(a => a.profissional_id === barber.uid);

      const production = proComms.filter(c => c.commission_type !== 'assinatura').reduce((acc, c) => acc + (c.base_value || 0), 0);
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
      .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);
      
    const paid = commissions
      .filter(c => c.status === 'pago')
      .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);
      
    const totalBase = commissions
      .filter(c => c.commission_type !== 'bonus')
      .reduce((acc, c) => {
        const base = Number(c.base_value) || Number(c.amount) || ((Number(c.commission_percentage) || 0) > 0 ? ((Number(c.commission_value) || 0) * 100) / Number(c.commission_percentage) : Number(c.commission_value)) || 0;
        return acc + base;
      }, 0);

    return {
      pending,
      paid,
      total: pending + paid,
      totalBase,
      count: commissions.length
    };
  },

  /**
   * Reconciliação Histórica Inteligente de Comissões e Comandas (Desde o Dia 1)
   * 1. Padroniza tenantId para registros legados ('gbcortes7')
   * 2. Unifica Gabriel Alexandre (ID e variações de nome)
   * 3. Corrige base_value faltante ou zerado baseado na comissão/porcentagem
   * 4. Reconcilia comandas fechadas que não geraram comissão ou eram de pacote/assinatura para garantir faturamento integral
   */
  async reconcileHistoricalCommissions(targetTenantId: string = 'gbcortes7') {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return;

      // 1. Buscar Gabriel principal em usuarios
      const usersSnap = await getDocs(query(collection(db, 'usuarios'), where('tenantId', 'in', [activeTenant, ''])));
      const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
      const gabrielUsers = allUsers.filter(u => 
        (u.nome && u.nome.toLowerCase().includes('gabriel')) ||
        (u.email && u.email.toLowerCase().includes('gabriel'))
      );
      const primaryGabriel = gabrielUsers.find(u => (u.nome && u.nome.toLowerCase().includes('alexandre'))) || gabrielUsers[0];
      const primaryGabrielUid = primaryGabriel?.uid;

      // 2. Buscar comissões
      const commsSnap = await getDocs(query(
        collection(db, COMMISSIONS_COLLECTION),
        where('tenantId', 'in', [activeTenant, ''])
      ));

      let batch = writeBatch(db);
      let opsCount = 0;

      for (const docSnap of commsSnap.docs) {
        const c = docSnap.data() as any;
        let needsUpdate = false;
        const updates: any = {};

        // Normalizar tenantId
        if (!c.tenantId && activeTenant) {
          updates.tenantId = activeTenant;
          needsUpdate = true;
        }

        // Unificar Gabriel se for variação de Gabriel
        const cName = (c.profissional_name || '').toLowerCase().trim();
        const isGabriel = cName.includes('gabriel') || gabrielUsers.some(g => g.uid === c.profissional_id || g.uid === c.barbeiro_id);
        if (isGabriel && primaryGabrielUid) {
          if (c.profissional_id !== primaryGabrielUid) {
            updates.profissional_id = primaryGabrielUid;
            needsUpdate = true;
          }
          if (primaryGabriel.nome && c.profissional_name !== primaryGabriel.nome) {
            updates.profissional_name = primaryGabriel.nome;
            needsUpdate = true;
          }
        }

        // Corrigir base_value faltante ou zero
        if ((c.base_value === undefined || c.base_value === null || Number(c.base_value) === 0) && c.commission_type !== 'bonus') {
          const commVal = Number(c.commission_value) || 0;
          const commPct = Number(c.commission_percentage) || 0;
          let calculatedBase = 0;
          if (commPct > 0 && commVal > 0) {
            calculatedBase = (commVal * 100) / commPct;
          } else if (c.amount && Number(c.amount) > 0) {
            calculatedBase = Number(c.amount);
          } else if (commVal > 0) {
            calculatedBase = commVal;
          }

          if (calculatedBase > 0) {
            updates.base_value = calculatedBase;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          updates.updatedAt = serverTimestamp();
          batch.update(docSnap.ref, updates);
          opsCount++;

          if (opsCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            opsCount = 0;
          }
        }
      }

      // 3. Reconciliar itens de comandas fechadas
      try {
        const comandasSnap = await getDocs(query(
          collection(db, 'comandas'),
          where('tenantId', 'in', [activeTenant, ''])
        ));

        const existingCommsByComanda = new Set(
          commsSnap.docs.map(d => {
            const data = d.data();
            return `${data.comanda_id || ''}_${(data.servico_name || '').toLowerCase().trim()}`;
          })
        );

        for (const docSnap of comandasSnap.docs) {
          const comanda = docSnap.data() as any;
          const isClosed = comanda.status === 'fechada' || 
                           comanda.status === 'concluída' || 
                           comanda.status === 'concluido' || 
                           comanda.status === 'nao_paga' || 
                           comanda.status === 'paga' || 
                           Boolean(comanda.closedAt);
          if (!isClosed) continue;

          const comandaDate = comanda.date || (comanda.closedAt ? new Date(comanda.closedAt.seconds * 1000).toISOString().split('T')[0] : '') || new Date().toISOString().split('T')[0];

          if (Array.isArray(comanda.items)) {
            for (const item of comanda.items) {
              const itemKey = `${docSnap.id}_${(item.name || '').toLowerCase().trim()}`;
              
              // Identificar profissional prestador
              let targetProId = item.profissional_id || comanda.profissional_id;
              let targetProName = item.profissional_name || comanda.profissional_name || 'Profissional';

              // Unificar Gabriel se for variação
              if (primaryGabrielUid && (targetProName.toLowerCase().includes('gabriel') || gabrielUsers.some(g => g.uid === targetProId))) {
                targetProId = primaryGabrielUid;
                targetProName = primaryGabriel.nome || 'Gabriel Alexandre';
              }

              if (!targetProId) continue;

              const unitPrice = Number(item.unitPrice) || 0;
              const quantity = Number(item.quantity) || 1;
              const totalPrice = Number(item.totalPrice) || (unitPrice * quantity);
              const baseValue = totalPrice > 0 ? totalPrice : (unitPrice * quantity);

              if (baseValue <= 0) continue;

              if (existingCommsByComanda.has(itemKey)) {
                // Verificar se a comissão existente tem base_value zerado e reparar
                const matchingDoc = commsSnap.docs.find(d => {
                  const data = d.data();
                  return data.comanda_id === docSnap.id && (data.servico_name || '').toLowerCase().trim() === (item.name || '').toLowerCase().trim();
                });
                if (matchingDoc) {
                  const mData = matchingDoc.data();
                  if (mData.base_value === undefined || mData.base_value === null || Number(mData.base_value) === 0) {
                    batch.update(matchingDoc.ref, { base_value: baseValue, updatedAt: serverTimestamp() });
                    opsCount++;
                    if (opsCount >= 400) {
                      await batch.commit();
                      batch = writeBatch(db);
                      opsCount = 0;
                    }
                  }
                }
                continue;
              }

              const isAssinatura = item.deductType === 'assinatura' || item.type === 'assinatura' || item.isCortesia;
              const commType = isAssinatura ? 'assinatura' : (item.type === 'produto' || item.type === 'product' ? 'produto' : 'servico');
              
              // Se for corte de assinatura/cortesia, a comissão monetária é 0, mas o base_value entra para faturamento da cadeira
              const commPct = isAssinatura ? 0 : 50;
              const commVal = isAssinatura ? 0 : (baseValue * commPct) / 100;

              const newCommRef = doc(collection(db, COMMISSIONS_COLLECTION));
              batch.set(newCommRef, {
                id: newCommRef.id,
                tenantId: activeTenant,
                comanda_id: docSnap.id,
                comanda_number: comanda.number || '',
                cliente_id: comanda.cliente_id || '',
                cliente_name: comanda.cliente_name || '',
                date: comandaDate,
                profissional_id: targetProId,
                profissional_name: targetProName,
                servico_name: item.name || 'Atendimento',
                base_value: baseValue,
                commission_percentage: commPct,
                commission_value: commVal,
                commission_type: commType,
                status: 'pendente', // gerado como pendente aguardando repasse do dono
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });

              existingCommsByComanda.add(itemKey);
              opsCount++;

              if (opsCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                opsCount = 0;
              }
            }
          }
        }
      } catch (comandaErr) {
        console.warn("[commissionService] Non-blocking notice during comanda reconciliation:", comandaErr);
      }

      if (opsCount > 0) {
        await batch.commit();
        console.log(`[commissionService] Reconciled ${opsCount} historical records successfully.`);
      }
    } catch (err) {
      console.error("[commissionService] Error during historical reconciliation:", err);
    }
  },

  async revertUnpaidCommissionsToPending(targetTenantId?: string) {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return 0;

      // 1. Fetch legitimate payouts from payouts collection
      const payoutsSnap = await getDocs(query(
        collection(db, PAYOUTS_COLLECTION),
        where('tenantId', '==', activeTenant)
      ));

      const validPayoutIds = new Set<string>();
      const validCommissionIdsFromPayouts = new Set<string>();

      payoutsSnap.docs.forEach(docSnap => {
        validPayoutIds.add(docSnap.id);
        const pData = docSnap.data();
        if (Array.isArray(pData.commission_ids)) {
          pData.commission_ids.forEach((cId: string) => validCommissionIdsFromPayouts.add(cId));
        }
      });

      // 2. Fetch all commissions for this tenant currently marked as 'pago'
      const commsSnap = await getDocs(query(
        collection(db, COMMISSIONS_COLLECTION),
        where('tenantId', '==', activeTenant),
        where('status', '==', 'pago')
      ));

      let fixedCount = 0;
      let batch = writeBatch(db);
      let ops = 0;

      for (const docSnap of commsSnap.docs) {
        const commData = docSnap.data();
        const repasseId = commData.repasse_id || commData.payout_id || commData.repasseId || commData.payoutId;
        
        // If it was NOT paid via an actual payout record, revert it to 'pendente'
        const isLegitPaid = (repasseId && validPayoutIds.has(repasseId)) || validCommissionIdsFromPayouts.has(docSnap.id);

        if (!isLegitPaid) {
          batch.update(docSnap.ref, {
            status: 'pendente',
            updatedAt: serverTimestamp()
          });
          fixedCount++;
          ops++;

          if (ops >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
          }
        }
      }

      if (ops > 0) {
        await batch.commit();
        console.log(`[commissionService] Reverted ${fixedCount} falsely paid commissions back to pendente.`);
      }

      return fixedCount;
    } catch (err) {
      console.warn("[commissionService] Error reverting unpaid commissions:", err);
      return 0;
    }
  },

  async cleanAndSettlePreviousMonths(cutoffDate: string = '2026-09-01', targetTenantId: string = 'gbcortes7') {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return;

      // 1. Settle/Archive old pending advances before cutoff date
      const advancesSnap = await getDocs(query(
        collection(db, ADVANCES_COLLECTION),
        where('tenantId', '==', activeTenant)
      ));
      
      const batch = writeBatch(db);
      let count = 0;

      advancesSnap.docs.forEach(docSnap => {
        const adv = docSnap.data() as ProfessionalAdvance;
        const advDate = adv.date || (adv.createdAt ? new Date((adv.createdAt as any).seconds * 1000).toISOString().split('T')[0] : '');
        if (advDate < cutoffDate && (adv.status === 'pendente' || !adv.status)) {
          batch.update(docSnap.ref, {
            status: 'deduzido',
            updatedAt: serverTimestamp(),
            settledReason: 'Fechamento de meses anteriores (Início de Setembro/2026)'
          });
          count++;
        }
      });

      // 2. Settle/Archive old pending commissions before cutoff date
      const commissionsSnap = await getDocs(query(
        collection(db, COMMISSIONS_COLLECTION),
        where('tenantId', '==', activeTenant)
      ));

      commissionsSnap.docs.forEach(docSnap => {
        const comm = docSnap.data() as Commission;
        const commDate = comm.date || (comm.createdAt ? new Date((comm.createdAt as any).seconds * 1000).toISOString().split('T')[0] : '');
        if (commDate < cutoffDate && (comm.status === 'pendente' || !comm.status)) {
          batch.update(docSnap.ref, {
            status: 'pago',
            updatedAt: serverTimestamp(),
            settledReason: 'Fechamento de meses anteriores (Início de Setembro/2026)'
          });
          count++;
        }
      });

      // 3. Mark matching old payables as paid if they were marked as adiantamentos
      const payablesSnap = await getDocs(query(
        collection(db, 'accounts_payable'),
        where('tenantId', '==', activeTenant)
      ));

      payablesSnap.docs.forEach(docSnap => {
        const p = docSnap.data() as any;
        const pDate = p.dueDate || p.paidAt || (p.createdAt ? new Date(p.createdAt.seconds * 1000).toISOString().split('T')[0] : '');
        if (pDate < cutoffDate && p.status === 'pending') {
          const cat = (p.category || '').toLowerCase();
          const desc = (p.description || '').toLowerCase();
          if (cat.includes('vale') || cat.includes('adiantamento') || desc.includes('vale') || desc.includes('adiantamento')) {
            batch.update(docSnap.ref, {
              status: 'paid',
              paidAt: pDate,
              updatedAt: serverTimestamp()
            });
            count++;
          }
        }
      });

      if (count > 0) {
        await batch.commit();
        console.log(`[commissionService] Cleaned and settled ${count} past records before ${cutoffDate} for ${activeTenant}`);
      }
    } catch (err) {
      console.error("[commissionService] Error settling previous months:", err);
    }
  },

  async cancelCommissionsByComanda(comandaId: string) {
    if (!comandaId) return;
    try {
      const q = query(collection(db, COMMISSIONS_COLLECTION), where('comanda_id', '==', comandaId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => {
          batch.update(d.ref, {
            status: 'cancelado',
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
        console.log(`[commissionService] Cancelled ${snap.size} commissions for comanda ${comandaId}`);
      }
    } catch (err) {
      console.warn(`[commissionService] Error cancelling commissions for comanda ${comandaId}:`, err);
    }
  },

  async cleanupGhostCommissionsAndComandas(targetTenantId?: string) {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return 0;

      const comsSnap = await getDocs(query(
        collection(db, 'comandas'),
        where('tenantId', '==', activeTenant)
      ));

      const ghostComandaIds = new Set<string>();
      const batch = writeBatch(db);
      let ops = 0;

      const comandaMap = new Map<string, any>();
      comsSnap.docs.forEach(docSnap => {
        const c = docSnap.data();
        comandaMap.set(docSnap.id, c);
        const items = c.items || [];
        const payments = c.payments || [];
        const totalPaid = payments.reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
        const totalValue = c.total || c.totalValue || items.reduce((acc: number, i: any) => acc + (Number(i.totalPrice) || 0), 0);

        const isEmptyGhost = items.length === 0 || (totalValue === 0 && totalPaid === 0);
        const isUnpaidAutoClosed = c.status === 'fechada' && totalPaid === 0 && c.status !== 'nao_paga';

        if (isEmptyGhost || isUnpaidAutoClosed) {
          ghostComandaIds.add(docSnap.id);
          batch.update(docSnap.ref, {
            status: 'cancelada',
            updatedAt: serverTimestamp(),
            cancellationReason: 'Limpeza de comanda fantasma/vazia ou não paga'
          });
          ops++;
        }
      });

      const commsSnap = await getDocs(query(
        collection(db, COMMISSIONS_COLLECTION),
        where('tenantId', '==', activeTenant)
      ));

      commsSnap.docs.forEach(docSnap => {
        const comm = docSnap.data() as Commission;
        const commVal = Number(comm.commission_value) || 0;
        const baseVal = Number(comm.base_value) || 0;
        
        let shouldCancel = (comm.comanda_id && ghostComandaIds.has(comm.comanda_id)) || (commVal === 0 && baseVal === 0) || (comm.status as string) === 'cancelado';

        if (comm.comanda_id && comandaMap.has(comm.comanda_id)) {
          const com = comandaMap.get(comm.comanda_id);
          const payments = com.payments || [];
          const totalPaid = payments.reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
          if (totalPaid === 0 && com.status !== 'nao_paga') {
            shouldCancel = true;
          }
        }

        if (shouldCancel && (comm.status as string) !== 'cancelado') {
          batch.update(docSnap.ref, {
            status: 'cancelado',
            updatedAt: serverTimestamp(),
            settledReason: 'Cancelado por limpeza de comanda não paga'
          });
          ops++;
        }
      });

      if (ops > 0) {
        await batch.commit();
        console.log(`[commissionService] Cleaned up ${ops} ghost records.`);
      }

      return ops;
    } catch (err) {
      console.error("Error cleaning up ghost commissions:", err);
      return 0;
    }
  },

  async fixLuizMiguelAndOtherProfessionalsCommissions(targetTenantId?: string) {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return 0;

      const commsSnap = await getDocs(query(
        collection(db, COMMISSIONS_COLLECTION),
        where('tenantId', '==', activeTenant)
      ));

      const comsSnapAll = await getDocs(query(
        collection(db, 'comandas'),
        where('tenantId', '==', activeTenant)
      ));
      const comandaMap = new Map<string, any>();
      comsSnapAll.docs.forEach(d => comandaMap.set(d.id, d.data()));

      let joaoCommissionTime = 0;
      const isJoao = (name: string) => {
        const n = (name || '').toLowerCase();
        return n.includes('joão') || n.includes('joao') || n.includes('joa') || n.includes('jão');
      };

      commsSnap.docs.forEach(d => {
        const comm = d.data() as Commission;
        const proName = (comm.profissional_name || '').toLowerCase();
        const clientName = comm.cliente_name || '';
        if ((proName.includes('luiz') || proName.includes('miguel')) && isJoao(clientName)) {
          const t = comm.createdAt?.seconds || 0;
          if (t > joaoCommissionTime) {
            joaoCommissionTime = t;
          }
        }
      });

      if (joaoCommissionTime === 0) {
        comandaMap.forEach((com) => {
          const proName = (com.profissional_name || '').toLowerCase();
          const clientName = com.cliente_name || '';
          if ((proName.includes('luiz') || proName.includes('miguel')) && isJoao(clientName)) {
            const t = com.createdAt?.seconds || com.closedAt?.seconds || 0;
            if (t > joaoCommissionTime) {
              joaoCommissionTime = t;
            }
          }
        });
      }

      let batches: any[] = [];
      let currentBatch = writeBatch(db);
      let opsCount = 0;

      const addOp = (ref: any, data: any) => {
        currentBatch.update(ref, data);
        opsCount++;
        if (opsCount >= 400) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          opsCount = 0;
        }
      };

      // Restore any commissions that were previously cancelled by the post-João automatic routine
      commsSnap.docs.forEach(docSnap => {
        const comm = docSnap.data() as any;
        const reason = comm.settledReason || comm.cancellationReason || '';
        if (comm.status === 'cancelado' && (reason.includes('pós-João') || reason.includes('pos-Joao') || reason.includes('pós-joao'))) {
          addOp(docSnap.ref, {
            status: 'pendente',
            updatedAt: serverTimestamp(),
            settledReason: null,
            cancellationReason: null
          });
        }
      });

      if (opsCount > 0) {
        batches.push(currentBatch);
      }

      let totalCommitted = 0;
      for (const b of batches) {
        await b.commit();
        totalCommitted += 400; // approximate or count
      }

      if (totalCommitted > 0) {
        console.log(`[commissionService] Fixed and cancelled invalid commissions/comandas in batches.`);
      }

      return totalCommitted;
    } catch (err) {
      console.error("Error fixing commissions:", err);
      return 0;
    }
  },

  async settleHistoricalPendingBeforeSeptember(targetTenantId?: string) {
    try {
      const activeTenant = targetTenantId || getActiveTenantId();
      if (!activeTenant) return { commissionsSettled: 0, advancesSettled: 0, payablesSettled: 0, comandasSettled: 0 };

      const queryConstraints = activeTenant === 'gbcortes7'
        ? [where('tenantId', 'in', [activeTenant, ''])]
        : [where('tenantId', '==', activeTenant)];

      let batches: any[] = [];
      let currentBatch = writeBatch(db);
      let opsCount = 0;

      const addOp = (ref: any, data: any) => {
        currentBatch.update(ref, data);
        opsCount++;
        if (opsCount >= 400) {
          batches.push(currentBatch);
          currentBatch = writeBatch(db);
          opsCount = 0;
        }
      };

      const isBeforeSept = (docData: any): boolean => {
        if (docData.date) {
          const d = String(docData.date).split('T')[0];
          if (d && d < '2026-09-01') return true;
          if (d && d >= '2026-09-01') return false;
        }
        if (docData.data) {
          const d = String(docData.data).split('T')[0];
          if (d && d < '2026-09-01') return true;
          if (d && d >= '2026-09-01') return false;
        }
        if (docData.createdAt) {
          if (typeof docData.createdAt === 'object' && docData.createdAt.seconds) {
            const iso = new Date(docData.createdAt.seconds * 1000).toISOString().split('T')[0];
            if (iso < '2026-09-01') return true;
            if (iso >= '2026-09-01') return false;
          } else if (typeof docData.createdAt === 'string') {
            const iso = docData.createdAt.split('T')[0];
            if (iso < '2026-09-01') return true;
            if (iso >= '2026-09-01') return false;
          }
        }
        return false;
      };

      // 1. Settle commissions before 01/09/2026 that are marked 'pendente'
      const commsSnap = await getDocs(query(collection(db, COMMISSIONS_COLLECTION), ...queryConstraints));
      let commissionsSettled = 0;
      commsSnap.docs.forEach(docSnap => {
        const comm = docSnap.data() as Commission;
        if (isBeforeSept(comm) && comm.status === 'pendente') {
          addOp(docSnap.ref, {
            status: 'pago',
            settledReason: 'Acerto de implantação oficial - histórico anterior a 01/09/2026',
            settledAs: 'acerto_implantacao',
            paidAt: '2026-08-31T23:59:59',
            updatedAt: serverTimestamp()
          });
          commissionsSettled++;
        }
      });

      // 2. Settle advances before 01/09/2026 that are pending
      const advsSnap = await getDocs(query(collection(db, ADVANCES_COLLECTION), ...queryConstraints));
      let advancesSettled = 0;
      advsSnap.docs.forEach(docSnap => {
        const adv = docSnap.data() as ProfessionalAdvance;
        if (isBeforeSept(adv) && adv.status !== 'pago' && (adv.status as string) !== 'cancelado') {
          addOp(docSnap.ref, {
            status: 'pago',
            settledReason: 'Acerto de implantação oficial - histórico anterior a 01/09/2026',
            settledAs: 'acerto_implantacao',
            paidAt: '2026-08-31T23:59:59',
            updatedAt: serverTimestamp()
          });
          advancesSettled++;
        }
      });

      // 3. Settle accounts_payable before 01/09/2026
      const paySnap = await getDocs(query(collection(db, 'accounts_payable'), ...queryConstraints));
      let payablesSettled = 0;
      paySnap.docs.forEach(docSnap => {
        const p = docSnap.data() as any;
        if (isBeforeSept(p) && p.status !== 'paid' && p.status !== 'cancelado') {
          addOp(docSnap.ref, {
            status: 'paid',
            settledReason: 'Acerto de implantação oficial - histórico anterior a 01/09/2026',
            paidAt: '2026-08-31T23:59:59',
            updatedAt: serverTimestamp()
          });
          payablesSettled++;
        }
      });

      // 4. Close any open comandas before 01/09/2026
      const cmdSnap = await getDocs(query(collection(db, 'comandas'), ...queryConstraints));
      let comandasSettled = 0;
      cmdSnap.docs.forEach(docSnap => {
        const cmd = docSnap.data() as any;
        if (isBeforeSept(cmd) && cmd.status === 'aberta') {
          addOp(docSnap.ref, {
            status: 'fechada',
            closedAt: '2026-08-31T23:59:59',
            notes: ((cmd.notes || '') + ' [Encerrada em acerto de implantação anterior a 01/09/2026]').trim(),
            updatedAt: serverTimestamp()
          });
          comandasSettled++;
        }
      });

      if (opsCount > 0) {
        batches.push(currentBatch);
      }

      for (const b of batches) {
        await b.commit();
      }

      console.log(`[commissionService] Settle Pre-September completed:`, {
        commissionsSettled,
        advancesSettled,
        payablesSettled,
        comandasSettled
      });

      return { commissionsSettled, advancesSettled, payablesSettled, comandasSettled };
    } catch (err) {
      console.error("Erro ao liquidar histórico anterior a setembro:", err);
      throw err;
    }
  }
};
