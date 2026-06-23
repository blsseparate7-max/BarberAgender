import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { AccountPayable, AccountReceivable } from '../types';
import { financialService } from './financialService';
import { cashService } from './cashService';

const PAYABLES_COLLECTION = 'accounts_payable';
const RECEIVABLES_COLLECTION = 'accounts_receivable';

export const billService = {
  // --- Accounts Payable (Contas a Pagar) ---
  async getPayables(startDate?: string, endDate?: string) {
    let q = query(collection(db, PAYABLES_COLLECTION), orderBy('dueDate', 'asc'));
    
    if (startDate && endDate) {
      q = query(q, where('dueDate', '>=', startDate), where('dueDate', '<=', endDate));
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dueDate: data.dueDate || '',
        status: data.status || 'pending',
        amount: data.amount || 0,
        recurrence: data.recurrence || 'none',
        category: data.category || 'outros',
        supplier: data.supplier || '',
        description: data.description || ''
      } as AccountPayable;
    });
  },

  async createPayable(data: Omit<AccountPayable, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = doc(collection(db, PAYABLES_COLLECTION));
    const newPayable: AccountPayable = {
      ...data,
      id: docRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, newPayable);
    return docRef.id;
  },

  async updatePayable(id: string, data: Partial<AccountPayable>) {
    const docRef = doc(db, PAYABLES_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  },

  async deletePayable(id: string) {
    const docRef = doc(db, PAYABLES_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async settlePayable(id: string, paymentMethod: string, addMovementToCash: boolean, userId: string, userName: string) {
    const docRef = doc(db, PAYABLES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Conta a pagar não encontrada.");
    
    const payable = docSnap.data() as AccountPayable;
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. Create a Financial Transaction of type 'expense'
    const transactionId = await financialService.createTransaction({
      type: 'expense',
      category: payable.category || 'Despesas Gerais',
      amount: payable.amount,
      net_amount: payable.amount,
      fee_amount: 0,
      paymentMethod: (paymentMethod || 'dinheiro') as any,
      date: todayStr,
      settlement_date: todayStr,
      status: 'pago',
      is_settled: true,
      responsavel_id: userId,
      responsavel_name: userName,
      description: `Baixa de Conta: ${payable.description || 'Sem Descrição'} (${payable.supplier || 'Sem Fornecedor'})`
    });

    // 2. Add to Cash Movement if selected and there is an open cash session
    let movementId = '';
    if (addMovementToCash) {
      try {
        const activeCash = await cashService.getCurrentCash();
        if (activeCash) {
          const mvt = await cashService.addMovement({
            caixa_id: activeCash.id,
            type: 'expense',
            category: payable.category || 'Despesas Gerais',
            amount: payable.amount,
            description: `Pgto Conta: ${payable.description || 'Sem Descrição'}`,
            paymentMethod: (paymentMethod || 'dinheiro') as any,
            is_receivable: false,
            usuario_id: userId,
            usuario_name: userName,
            date: todayStr
          });
          movementId = mvt.id;
        }
      } catch (err) {
        console.warn("Could not register cash movement (maybe cash is closed):", err);
      }
    }

    // 3. Update the Payable status
    await updateDoc(docRef, {
      status: 'paid',
      paidAt: serverTimestamp(),
      paymentMethod,
      transactionId,
      movementId: movementId || null,
      updatedAt: serverTimestamp()
    });

    return { transactionId, movementId };
  },

  // --- Accounts Receivable (Contas a Receber) ---
  async getReceivables(startDate?: string, endDate?: string) {
    let q = query(collection(db, RECEIVABLES_COLLECTION), orderBy('dueDate', 'asc'));
    
    if (startDate && endDate) {
      q = query(q, where('dueDate', '>=', startDate), where('dueDate', '<=', endDate));
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dueDate: data.dueDate || '',
        status: data.status || 'pending',
        amount: data.amount || 0,
        recurrence: data.recurrence || 'none',
        category: data.category || 'outros',
        clientOrPartner: data.clientOrPartner || '',
        description: data.description || ''
      } as AccountReceivable;
    });
  },

  async createReceivable(data: Omit<AccountReceivable, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = doc(collection(db, RECEIVABLES_COLLECTION));
    const newReceivable: AccountReceivable = {
      ...data,
      id: docRef.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(docRef, newReceivable);
    return docRef.id;
  },

  async updateReceivable(id: string, data: Partial<AccountReceivable>) {
    const docRef = doc(db, RECEIVABLES_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  },

  async deleteReceivable(id: string) {
    const docRef = doc(db, RECEIVABLES_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async settleReceivable(id: string, paymentMethod: string, addMovementToCash: boolean, userId: string, userName: string) {
    const docRef = doc(db, RECEIVABLES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error("Conta a receber não encontrada.");
    
    const receivable = docSnap.data() as AccountReceivable;
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. Create a Financial Transaction of type 'income'
    const transactionId = await financialService.createTransaction({
      type: 'income',
      category: receivable.category || 'Receitas Diversas',
      amount: receivable.amount,
      net_amount: receivable.amount,
      fee_amount: 0,
      paymentMethod: (paymentMethod || 'dinheiro') as any,
      date: todayStr,
      settlement_date: todayStr,
      status: 'pago',
      is_settled: true,
      responsavel_id: userId,
      responsavel_name: userName,
      description: `Recebimento de Conta: ${receivable.description || 'Sem Descrição'} (${receivable.clientOrPartner || 'Sem Cliente'})`
    });

    // 2. Add to Cash Movement if selected and there is an open cash session
    let movementId = '';
    if (addMovementToCash) {
      try {
        const activeCash = await cashService.getCurrentCash();
        if (activeCash) {
          const mvt = await cashService.addMovement({
            caixa_id: activeCash.id,
            type: 'income',
            category: receivable.category || 'Receitas Diversas',
            amount: receivable.amount,
            description: `Rec. Conta: ${receivable.description || 'Sem Descrição'}`,
            paymentMethod: (paymentMethod || 'dinheiro') as any,
            is_receivable: false,
            usuario_id: userId,
            usuario_name: userName,
            date: todayStr
          });
          movementId = mvt.id;
        }
      } catch (err) {
        console.warn("Could not register cash movement (maybe cash is closed):", err);
      }
    }

    // 3. Update the Receivable status
    await updateDoc(docRef, {
      status: 'paid',
      receivedAt: serverTimestamp(),
      paymentMethod,
      transactionId,
      movementId: movementId || null,
      updatedAt: serverTimestamp()
    });

    return { transactionId, movementId };
  }
};
