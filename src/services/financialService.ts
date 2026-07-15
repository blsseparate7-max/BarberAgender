import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { FinancialTransaction, FinancialCategory, TransactionType } from '../types';
import { getActiveTenantId } from './tenantService';

const TRANSACTIONS_COLLECTION = 'financial_transactions';
const CATEGORIES_COLLECTION = 'financial_categories';

export const financialService = {
  // --- Transactions ---
  async getTransactions(startDate?: string, endDate?: string, type?: TransactionType) {
    let q;
    if (startDate && endDate) {
      q = query(collection(db, TRANSACTIONS_COLLECTION), where('date', '>=', startDate), where('date', '<=', endDate));
    } else {
      q = query(collection(db, TRANSACTIONS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    }
    
    const querySnapshot = await getDocs(q);
    const activeTenantId = getActiveTenantId();
    let transactions = querySnapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) } as FinancialTransaction))
      .filter(t => t.tenantId === activeTenantId);

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
