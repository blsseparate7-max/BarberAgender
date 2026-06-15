
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
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { ClientDebt, DebtPayment, PaymentMethod } from '../types';

const COLLECTION_DEBTS = 'client_debts';
const COLLECTION_PAYMENTS = 'debt_payments';

export const debtService = {
  async getClientDebts(cliente_id: string) {
    const q = query(
      collection(db, COLLECTION_DEBTS),
      where('cliente_id', '==', cliente_id),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
  },

  async getDebtById(id: string) {
    const docRef = doc(db, COLLECTION_DEBTS, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ClientDebt;
    }
    return null;
  },

  async registerPayment(data: { 
    divida_id: string, 
    cliente_id: string, 
    amount: number, 
    paymentMethod: PaymentMethod,
    caixa_id?: string,
    userId: string,
    userName: string
  }) {
    const debtRef = doc(db, COLLECTION_DEBTS, data.divida_id);
    const paymentRef = doc(collection(db, COLLECTION_PAYMENTS));

    await runTransaction(db, async (transaction) => {
      const debtSnap = await transaction.get(debtRef);
      if (!debtSnap.exists()) throw new Error("Dívida não encontrada");
      
      const debt = debtSnap.data() as ClientDebt;
      const newRemaining = debt.remainingAmount - data.amount;
      
      if (newRemaining < 0) throw new Error("Valor do pagamento maior que a dívida");

      const status = newRemaining === 0 ? 'pago' : 'parcial';

      transaction.update(debtRef, {
        remainingAmount: newRemaining,
        status,
        updatedAt: serverTimestamp()
      });

      const newPayment: DebtPayment = {
        id: paymentRef.id,
        divida_id: data.divida_id,
        cliente_id: data.cliente_id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      };

      transaction.set(paymentRef, newPayment);
    });

    return paymentRef.id;
  },

  async getDebtPayments(divida_id: string) {
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('divida_id', '==', divida_id),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DebtPayment));
  },

  async getPendingDebts() {
    const q = query(
      collection(db, COLLECTION_DEBTS),
      where('status', 'in', ['pendente', 'parcial']),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
  },

  async getDebtPaymentsByClient(cliente_id: string) {
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('cliente_id', '==', cliente_id),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DebtPayment));
  }
};
