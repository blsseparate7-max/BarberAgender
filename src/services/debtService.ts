
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
import { getActiveTenantId } from './tenantService';
import { comandaService } from './comandaService';

const COLLECTION_DEBTS = 'client_debts';
const COLLECTION_PAYMENTS = 'debt_payments';

export const debtService = {
  async getClientDebts(cliente_id: string) {
    const q = query(
      collection(db, COLLECTION_DEBTS),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const querySnapshot = await getDocs(q);
    const debts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
    return debts.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
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
    await comandaService.payDebt(
      data.divida_id,
      data.amount,
      data.paymentMethod || 'dinheiro',
      '',
      data.userId,
      data.userName
    );
    return data.divida_id;
  },

  async getDebtPayments(divida_id: string) {
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('divida_id', '==', divida_id)
    );
    const querySnapshot = await getDocs(q);
    const payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DebtPayment));
    return payments.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  },

  async getPendingDebts() {
    const q = query(
      collection(db, COLLECTION_DEBTS),
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['pendente', 'parcial'])
    );
    const querySnapshot = await getDocs(q);
    const debts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
    return debts.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  },

  async cancelDebt(divida_id: string, reason: string = 'Ajuste manual') {
    const docRef = doc(db, COLLECTION_DEBTS, divida_id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const debt = snap.data() as ClientDebt;
    
    await updateDoc(docRef, {
      status: 'pago',
      remainingAmount: 0,
      description: debt.description ? `${debt.description} (Cancelado/Ajustado: ${reason})` : `Cancelado/Ajustado: ${reason}`,
      updatedAt: serverTimestamp()
    });

    if (debt.cliente_id) {
      try {
        const clientRef = doc(db, 'usuarios', debt.cliente_id);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          const currentOpen = clientData.total_em_aberto || 0;
          await updateDoc(clientRef, {
            total_em_aberto: Math.max(0, currentOpen - (debt.remainingAmount || debt.amount || 0)),
            balance: 0,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.warn("Erro ao sincronizar saldo do cliente após cancelar débito:", err);
      }
    }
  },

  async clearClientDebts(cliente_id: string, reason: string = 'Ajuste administrativo') {
    const debts = await this.getClientDebts(cliente_id);
    for (const debt of debts) {
      if (!['pago', 'paga', 'quitado', 'cancelado'].includes(debt.status)) {
        await this.cancelDebt(debt.id, reason);
      }
    }
    const clientRef = doc(db, 'usuarios', cliente_id);
    await updateDoc(clientRef, {
      total_em_aberto: 0,
      balance: 0,
      updatedAt: serverTimestamp()
    });
  },

  async getDebtPaymentsByClient(cliente_id: string) {
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const querySnapshot = await getDocs(q);
    const payments = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DebtPayment));
    return payments.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  }
};
