import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { FinancialTransaction, FinancialCategory, TransactionType } from '../types';
import { getActiveTenantId } from './tenantService';
import { cashService } from './cashService';

const TRANSACTIONS_COLLECTION = 'financial_transactions';
const CATEGORIES_COLLECTION = 'financial_categories';

export const financialService = {
  // --- Transactions ---
  async getTransactions(startDate?: string, endDate?: string, type?: TransactionType) {
    const activeTenantId = getActiveTenantId();
    const q = query(collection(db, TRANSACTIONS_COLLECTION), where('tenantId', '==', activeTenantId));
    
    const querySnapshot = await getDocs(q);
    let transactions = querySnapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) } as FinancialTransaction))
      .filter(t => t.tenantId === activeTenantId);

    if (startDate && endDate) {
      transactions = transactions.filter(t => t.date >= startDate && t.date <= endDate);
    }

    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    return transactions.sort((a, b) => {
      const aDate = a.date || '';
      const bDate = b.date || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async createTransaction(data: Omit<FinancialTransaction, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, TRANSACTIONS_COLLECTION), {
      ...data,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateTransaction(id: string, data: Partial<FinancialTransaction>) {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  async checkCashStatusForDate(date: string) {
    const cashSession = await cashService.getCashByDate(date);
    if (!cashSession) return { exists: false, status: 'none', cashSession: null };
    return { exists: true, status: cashSession.status, cashSession };
  },

  async deleteTransaction(transaction: FinancialTransaction) {
    if (transaction.comanda_id) {
      throw new Error("Esta movimentação é fruto do fechamento de uma Comanda. Para cancelá-la com integridade contábil, estoques e comissões, reabra a Comanda correspondente.");
    }

    const cashSession = await cashService.getCashByDate(transaction.date);
    if (cashSession && cashSession.status === 'closed') {
      const err: any = new Error(`O caixa de ${transaction.date} está fechado. É necessário reabrir o caixa deste dia para remover a movimentação.`);
      err.cashClosed = true;
      err.cashSession = cashSession;
      throw err;
    }

    // Delete financial transaction
    const txRef = doc(db, TRANSACTIONS_COLLECTION, transaction.id);
    await deleteDoc(txRef);

    // Look for matching professional advance (vale) and cascade delete
    try {
      // 1. By transaction_id
      const qAdv = query(
        collection(db, 'professional_advances'),
        where('transaction_id', '==', transaction.id)
      );
      const snapAdv = await getDocs(qAdv);
      for (const d of snapAdv.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Fallback matching if not linked by transaction_id
      if (
        transaction.category?.toLowerCase().includes('vale') || 
        transaction.category?.toLowerCase().includes('adiantamento') || 
        transaction.description?.toLowerCase().includes('vale') ||
        transaction.profissional_id
      ) {
        let advQueryConstraints: any[] = [];
        if (transaction.profissional_id) {
          advQueryConstraints.push(where('profissional_id', '==', transaction.profissional_id));
        }
        advQueryConstraints.push(where('amount', '==', transaction.amount));
        const fallbackAdvSnap = await getDocs(query(collection(db, 'professional_advances'), ...advQueryConstraints));
        for (const d of fallbackAdvSnap.docs) {
          const advData = d.data();
          if (advData.date === transaction.date || !advData.transaction_id || advData.transaction_id === transaction.id) {
            await deleteDoc(d.ref);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao remover vale vinculado à transação:", e);
    }

    // Look for matching accounts_payable and delete
    try {
      const qPay = query(
        collection(db, 'accounts_payable'),
        where('transactionId', '==', transaction.id)
      );
      const snapPay = await getDocs(qPay);
      for (const d of snapPay.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      console.warn("Aviso ao remover conta a pagar vinculada à transação:", e);
    }

    // Look for matching cash movement
    try {
      if (transaction.movement_id) {
        await cashService.removeMovement(transaction.movement_id);
      } else {
        const qMove = query(
          collection(db, 'cash_movements'),
          where('referencia_id', '==', transaction.id)
        );
        const snap = await getDocs(qMove);
        if (!snap.empty) {
          for (const d of snap.docs) {
            await cashService.removeMovement(d.id);
          }
        } else if (cashSession && (cashSession.status === 'open' || cashSession.status === 'reopened')) {
          const sessionMovements = await cashService.getMovementsByCashId(cashSession.id);
          const match = sessionMovements.find(m => 
            m.amount === transaction.amount && 
            m.type === transaction.type &&
            m.description === transaction.description
          );
          if (match) {
            await cashService.removeMovement(match.id);
          }
        }
      }
    } catch (e) {
      console.warn("Aviso ao remover movimento de caixa vinculado:", e);
    }

    return { success: true };
  },

  async updateTransactionWithCashCheck(
    id: string, 
    updatedData: Partial<FinancialTransaction>, 
    originalTransaction: FinancialTransaction
  ) {
    if (originalTransaction.comanda_id) {
      throw new Error("Esta movimentação pertence a uma Comanda fechada. Reabra a Comanda para alterar valores.");
    }

    // Check cash status of original date
    const cashSession = await cashService.getCashByDate(originalTransaction.date);
    if (cashSession && cashSession.status === 'closed') {
      const err: any = new Error(`O caixa de ${originalTransaction.date} está fechado. É necessário reabrir o caixa deste dia para alterar a movimentação.`);
      err.cashClosed = true;
      err.cashSession = cashSession;
      throw err;
    }

    // If date changed to another date, check target date
    if (updatedData.date && updatedData.date !== originalTransaction.date) {
      const targetCash = await cashService.getCashByDate(updatedData.date);
      if (targetCash && targetCash.status === 'closed') {
        const err: any = new Error(`O caixa do dia de destino (${updatedData.date}) está fechado. É necessário reabri-lo.`);
        err.cashClosed = true;
        err.cashSession = targetCash;
        throw err;
      }
    }

    // Update financial transaction
    const txRef = doc(db, TRANSACTIONS_COLLECTION, id);
    await updateDoc(txRef, {
      ...updatedData,
      updatedAt: serverTimestamp(),
    });

    // Update linked cash movement if exists
    try {
      let linkedMoveId = originalTransaction.movement_id;
      if (!linkedMoveId) {
        const qMove = query(
          collection(db, 'cash_movements'),
          where('referencia_id', '==', id)
        );
        const snap = await getDocs(qMove);
        if (!snap.empty) {
          linkedMoveId = snap.docs[0].id;
        } else if (cashSession && (cashSession.status === 'open' || cashSession.status === 'reopened')) {
          const sessionMovements = await cashService.getMovementsByCashId(cashSession.id);
          const match = sessionMovements.find(m => 
            m.amount === originalTransaction.amount && 
            m.type === originalTransaction.type &&
            m.description === originalTransaction.description
          );
          if (match) linkedMoveId = match.id;
        }
      }

      if (linkedMoveId) {
        await cashService.updateMovement(
          linkedMoveId,
          {
            description: updatedData.description ?? originalTransaction.description,
            category: updatedData.category ?? originalTransaction.category,
            amount: updatedData.amount ?? originalTransaction.amount,
            paymentMethod: updatedData.paymentMethod ?? originalTransaction.paymentMethod,
          },
          originalTransaction.amount
        );
      }
    } catch (e) {
      console.warn("Aviso ao sincronizar movimento de caixa vinculado:", e);
    }

    return { success: true };
  },

  // --- Categories ---
  async getCategories(type?: TransactionType) {
    let q = query(
      collection(db, CATEGORIES_COLLECTION),
      where('tenantId', '==', getActiveTenantId()),
      where('active', '==', true)
    );
    if (type) {
      q = query(q, where('type', '==', type));
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialCategory));
  },

  async createCategory(name: string, type: TransactionType) {
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
      tenantId: getActiveTenantId(),
      name,
      type,
      active: true,
    });
    return docRef.id;
  },

  // --- Reports & Stats ---
  async getFinancialStats(startDate: string, endDate: string) {
    const transactions = await this.getTransactions(startDate, endDate);
    
    const income = transactions
      .filter(t => t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);
      
    const expense = transactions
      .filter(t => t.type === 'expense' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);
      
    const pendingFiado = transactions
      .filter(t => t.paymentMethod === 'fiado' && t.status === 'pendente')
      .reduce((acc, t) => acc + t.amount, 0);

    return {
      income,
      expense,
      balance: income - expense,
      pendingFiado
    };
  }
};
