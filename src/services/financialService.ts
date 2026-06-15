
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
  Timestamp,
  getDoc,
  setDoc,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { FinancialTransaction, DailyCash, FinancialCategory, TransactionType } from '../types';
import { format } from 'date-fns';

const TRANSACTIONS_COLLECTION = 'financial_transactions';
const DAILY_CASH_COLLECTION = 'cash_sessions';
const CATEGORIES_COLLECTION = 'financial_categories';

export const financialService = {
  // --- Transactions ---
  async getTransactions(startDate?: string, endDate?: string, type?: TransactionType) {
    let q = query(collection(db, TRANSACTIONS_COLLECTION), orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
    
    if (startDate && endDate) {
      q = query(q, where('date', '>=', startDate), where('date', '<=', endDate));
    }
    
    if (type) {
      q = query(q, where('type', '==', type));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction));
  },

  async createTransaction(data: Omit<FinancialTransaction, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, TRANSACTIONS_COLLECTION), {
      ...data,
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
    let q = query(collection(db, CATEGORIES_COLLECTION), where('active', '==', true));
    if (type) {
      q = query(q, where('type', '==', type));
    }
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialCategory));
  },

  async createCategory(name: string, type: TransactionType) {
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
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
