
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
  runTransaction,
  increment
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
          const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;
          const reduction = (debt.remainingAmount || debt.amount || 0);
          const newBal = currentBal + reduction;
          await updateDoc(clientRef, {
            total_em_aberto: Math.max(0, currentOpen - reduction),
            balance: newBal,
            saldo_atual: newBal,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.warn("Erro ao sincronizar saldo do cliente após cancelar débito:", err);
      }
    }
  },

  async updateDebt(divida_id: string, newAmount: number, newDescription: string) {
    const docRef = doc(db, COLLECTION_DEBTS, divida_id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Dívida não encontrada");
    const debt = snap.data() as ClientDebt;

    const oldAmount = debt.amount || 0;
    const oldRemaining = debt.remainingAmount ?? oldAmount;
    const paidSoFar = oldAmount - oldRemaining;

    if (newAmount < paidSoFar) {
      throw new Error(`O novo valor (R$ ${newAmount.toFixed(2)}) não pode ser menor do que o montante já pago (R$ ${paidSoFar.toFixed(2)}).`);
    }

    const newRemaining = Math.max(0, newAmount - paidSoFar);
    const diffRemaining = newRemaining - oldRemaining;

    await updateDoc(docRef, {
      amount: newAmount,
      remainingAmount: newRemaining,
      description: newDescription.trim(),
      status: newRemaining <= 0.001 ? 'pago' : paidSoFar > 0 ? 'parcial' : 'pendente',
      updatedAt: serverTimestamp()
    });

    if (debt.cliente_id && Math.abs(diffRemaining) > 0.001) {
      try {
        const clientRef = doc(db, 'usuarios', debt.cliente_id);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          const currentOpen = clientData.total_em_aberto || 0;
          const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;
          const newOpen = Math.max(0, currentOpen + diffRemaining);
          const newBal = currentBal - diffRemaining;
          await updateDoc(clientRef, {
            total_em_aberto: newOpen,
            balance: newBal,
            saldo_atual: newBal,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.warn("Erro ao atualizar saldo do cliente após edição de fiado:", err);
      }
    }
  },

  async revertPayment(paymentId: string, reason: string = 'Estorno manual', userId: string = '', userName: string = '') {
    const paymentRef = doc(db, COLLECTION_PAYMENTS, paymentId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) throw new Error("Registro de pagamento não encontrado");
    const payment = paymentSnap.data() as DebtPayment;

    const amount = payment.amount || 0;
    const dividaId = payment.divida_id;
    const clienteId = payment.cliente_id;

    if (dividaId) {
      const debtRef = doc(db, COLLECTION_DEBTS, dividaId);
      const debtSnap = await getDoc(debtRef);
      if (debtSnap.exists()) {
        const debt = debtSnap.data() as ClientDebt;
        const newRemaining = (debt.remainingAmount || 0) + amount;
        await updateDoc(debtRef, {
          remainingAmount: newRemaining,
          status: newRemaining >= debt.amount ? 'pendente' : 'parcial',
          updatedAt: serverTimestamp()
        });
      }
    }

    if (clienteId) {
      try {
        const clientRef = doc(db, 'usuarios', clienteId);
        const clientSnap = await getDoc(clientRef);
        if (clientSnap.exists()) {
          const clientData = clientSnap.data();
          const currentOpen = clientData.total_em_aberto || 0;
          const currentPaid = clientData.total_pago ?? clientData.totalPaid ?? 0;
          const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;

          await updateDoc(clientRef, {
            total_em_aberto: currentOpen + amount,
            total_pago: Math.max(0, currentPaid - amount),
            totalPaid: Math.max(0, currentPaid - amount),
            balance: currentBal - amount,
            saldo_atual: currentBal - amount,
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.warn("Erro ao atualizar saldo do cliente após estorno de pagamento:", err);
      }
    }

    // 4. Register expense / reversal in cash session and financial transactions
    const today = new Date().toISOString().split('T')[0];
    const cashQuery = query(
      collection(db, 'cash_sessions'),
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['open', 'reopened'])
    );
    const cashDocs = await getDocs(cashQuery);
    if (!cashDocs.empty) {
      const sortedDocs = [...cashDocs.docs].sort((a, b) => {
        const tA = a.data().openedAt?.seconds || 0;
        const tB = b.data().openedAt?.seconds || 0;
        return tB - tA;
      });
      const activeCash = sortedDocs[0];
      const caixa_id = activeCash.id;

      await setDoc(doc(collection(db, 'cash_movements')), {
        id: doc(collection(db, 'cash_movements')).id,
        tenantId: getActiveTenantId(),
        caixa_id,
        type: 'expense',
        category: 'Estorno de Recebimento de Dívida',
        description: `Estorno Pagamento Fiado - Motivo: ${reason}`,
        amount,
        paymentMethod: payment.paymentMethod || 'dinheiro',
        referencia_id: dividaId,
        usuario_id: userId,
        usuario_name: userName,
        date: today,
        createdAt: serverTimestamp()
      });

      const cashRef = doc(db, 'cash_sessions', caixa_id);
      await updateDoc(cashRef, {
        total_expenses: increment(amount),
        expected_balance: increment(-amount),
        expectedBalance: increment(-amount),
        updatedAt: serverTimestamp()
      });
    }

    // Also create financial_transaction for accounting
    await setDoc(doc(collection(db, 'financial_transactions')), {
      id: doc(collection(db, 'financial_transactions')).id,
      tenantId: getActiveTenantId(),
      type: 'expense',
      status: 'pago',
      category: 'Estorno Fiado',
      amount,
      description: `Estorno Pagamento Fiado - ${reason}`,
      date: today,
      paymentMethod: payment.paymentMethod || 'dinheiro',
      cliente_id: clienteId,
      created_at: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    // Delete payment record
    await setDoc(paymentRef, {
      ...payment,
      status: 'estornado',
      estornadoMotivo: reason,
      estornadoAt: serverTimestamp()
    }, { merge: true });
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
      saldo_atual: 0,
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
