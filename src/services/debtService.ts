
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  runTransaction,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { ClientDebt, DebtPayment, PaymentMethod } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION_DEBTS = 'client_debts';
const COLLECTION_PAYMENTS = 'debt_payments';

export const debtService = {
  async getClientDebts(cliente_id: string) {
    if (!cliente_id) return [];
    const q = query(
      collection(db, COLLECTION_DEBTS),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const querySnapshot = await getDocs(q);
    const debts = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ClientDebt));
    return debts.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  },

  async getDebtById(id: string) {
    if (!id) return null;
    const docRef = doc(db, COLLECTION_DEBTS, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ClientDebt;
    }
    return null;
  },

  /**
   * Quitação atômica e consolidada de dívidas ou recebimento de crédito em conta.
   * Garante:
   * 1. Abatimento de dívidas (específica ou FIFO).
   * 2. Criação de registros em debt_payments com método de pagamento.
   * 3. Atualização garantida no Caixa Diário (cash_movements e cash_sessions).
   * 4. Registro no DRE / fluxo financeiro (financial_transactions).
   * 5. Atualização atômica do saldo do cliente (saldo_atual, total_em_aberto, total_pago).
   * 6. Concessão de pontos / cashback de fidelidade.
   */
  async settleClientDebtsGlobal(data: {
    cliente_id: string;
    amount: number;
    paymentMethod: PaymentMethod;
    methodId?: string;
    methodName?: string;
    userId: string;
    userName: string;
    tenantId?: string;
    divida_id?: string;
    notes?: string;
  }) {
    const tenantId = data.tenantId || getActiveTenantId();
    const today = new Date().toISOString().split('T')[0];
    const amountToProcess = Math.max(0, data.amount || 0);

    if (amountToProcess <= 0) {
      throw new Error("O valor de recebimento deve ser maior que zero.");
    }

    // 1. Localizar caixa diário aberto no tenant
    let cashDoc: any = null;
    try {
      const cashQuery = query(
        collection(db, 'cash_sessions'),
        where('tenantId', '==', tenantId),
        where('status', 'in', ['open', 'reopened'])
      );
      const cashDocs = await getDocs(cashQuery);
      if (!cashDocs.empty) {
        const sortedDocs = [...cashDocs.docs].sort((a, b) => {
          const tA = a.data().openedAt?.seconds || 0;
          const tB = b.data().openedAt?.seconds || 0;
          return tB - tA;
        });
        cashDoc = sortedDocs[0];
      }
    } catch (cashErr) {
      console.warn("Aviso ao consultar caixa aberto:", cashErr);
    }

    // 2. Localizar dívidas ativas
    let targetDebts: ClientDebt[] = [];
    if (data.divida_id) {
      const singleDebtSnap = await getDoc(doc(db, COLLECTION_DEBTS, data.divida_id));
      if (singleDebtSnap.exists()) {
        targetDebts = [{ id: singleDebtSnap.id, ...singleDebtSnap.data() } as ClientDebt];
      }
    } else if (data.cliente_id) {
      const allDebts = await this.getClientDebts(data.cliente_id);
      targetDebts = allDebts.filter(d => !['pago', 'paga', 'quitado', 'cancelado'].includes(d.status) && (d.remainingAmount || 0) > 0.001);
      
      // Ordenar por mais antigas primeiro (FIFO)
      targetDebts.sort((a, b) => {
        const aDate = a.date || '';
        const bDate = b.date || '';
        if (aDate !== bDate) return aDate.localeCompare(bDate);
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return aTime - bTime;
      });
    }

    const clientRef = data.cliente_id ? doc(db, 'usuarios', data.cliente_id) : null;
    let clientName = 'Cliente';
    let totalDebtDeducted = 0;
    const settledDebts: { debtId: string; paidAmount: number; remainingAmount: number }[] = [];

    // 3. Execução Atômica
    await runTransaction(db, async (transaction) => {
      let clientData: any = {};
      if (clientRef) {
        const clientSnap = await transaction.get(clientRef);
        if (clientSnap.exists()) {
          clientData = clientSnap.data();
          clientName = clientData.nome || clientData.name || clientName;
        }
      }

      let remainingToPay = amountToProcess;
      totalDebtDeducted = 0;

      // Abater das dívidas
      for (const debt of targetDebts) {
        if (remainingToPay <= 0.001) break;
        const debtRef = doc(db, COLLECTION_DEBTS, debt.id);
        const debtSnap = await transaction.get(debtRef);
        if (!debtSnap.exists()) continue;

        const currentDebt = debtSnap.data() as ClientDebt;
        const currentRemaining = currentDebt.remainingAmount ?? currentDebt.amount ?? 0;
        if (currentRemaining <= 0.001) continue;

        const payForThis = Math.min(currentRemaining, remainingToPay);
        const newRemaining = Math.max(0, currentRemaining - payForThis);

        transaction.update(debtRef, {
          remainingAmount: newRemaining,
          status: newRemaining <= 0.001 ? 'pago' : 'parcial',
          updatedAt: serverTimestamp()
        });

        // Registrar comprovante do pagamento vinculado à dívida
        const pRef = doc(collection(db, COLLECTION_PAYMENTS));
        transaction.set(pRef, {
          id: pRef.id,
          tenantId,
          divida_id: debt.id,
          cliente_id: data.cliente_id,
          cliente_name: clientName,
          amount: payForThis,
          paymentMethod: data.paymentMethod || 'dinheiro',
          paymentMethodId: data.methodId || null,
          paymentMethodName: data.methodName || null,
          caixa_id: cashDoc?.id || null,
          date: today,
          is_deposit: false,
          description: `Quitação Fiado: ${debt.description || `Comanda #${debt.comanda_id?.substring(0, 8) || 'N/D'}`}`,
          createdAt: serverTimestamp()
        });

        settledDebts.push({ debtId: debt.id, paidAmount: payForThis, remainingAmount: newRemaining });
        totalDebtDeducted += payForThis;
        remainingToPay -= payForThis;
      }

      // Se sobrou valor após abater todas as dívidas ou se não havia dívidas cadastradas
      if (remainingToPay > 0.001) {
        const depositRef = doc(collection(db, COLLECTION_PAYMENTS));
        transaction.set(depositRef, {
          id: depositRef.id,
          tenantId,
          cliente_id: data.cliente_id,
          cliente_name: clientName,
          amount: remainingToPay,
          paymentMethod: data.paymentMethod || 'dinheiro',
          paymentMethodId: data.methodId || null,
          paymentMethodName: data.methodName || null,
          caixa_id: cashDoc?.id || null,
          date: today,
          is_deposit: true,
          description: 'Crédito / Pagamento em conta antecipado',
          createdAt: serverTimestamp()
        });
      }

      // Atualizar cadastro do cliente
      if (clientRef) {
        const currentOpen = clientData.total_em_aberto ?? clientData.saldo_devedor ?? 0;
        const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;
        const newOpen = Math.max(0, currentOpen - totalDebtDeducted);
        const newBal = currentBal + amountToProcess;

        transaction.update(clientRef, {
          saldo_atual: newBal,
          balance: newBal,
          total_pago: increment(amountToProcess),
          totalPaid: increment(amountToProcess),
          total_em_aberto: newOpen,
          saldo_devedor: newOpen,
          updatedAt: serverTimestamp()
        });
      }

      // 4. Gravar no Caixa Diário se houver caixa aberto
      if (cashDoc) {
        const caixa_id = cashDoc.id;
        const movementRef = doc(collection(db, 'cash_movements'));
        const isDebtPayment = totalDebtDeducted > 0;
        
        transaction.set(movementRef, {
          id: movementRef.id,
          tenantId,
          caixa_id,
          type: 'income',
          category: isDebtPayment ? 'Recebimento de Dívida' : 'Recebimento em Conta',
          description: isDebtPayment 
            ? `Recebimento Fiado - ${clientName}` 
            : `Recebimento em Conta - ${clientName}`,
          amount: amountToProcess,
          paymentMethod: data.paymentMethod || 'dinheiro',
          paymentMethodId: data.methodId || null,
          is_receivable: false,
          referencia_id: data.divida_id || data.cliente_id,
          usuario_id: data.userId || '',
          usuario_name: data.userName || 'Sistema',
          date: today,
          createdAt: serverTimestamp()
        });

        const cashRef = doc(db, 'cash_sessions', caixa_id);
        transaction.update(cashRef, {
          total_income: increment(amountToProcess),
          totalIncome: increment(amountToProcess),
          expected_balance: increment(amountToProcess),
          expectedBalance: increment(amountToProcess),
          updatedAt: serverTimestamp()
        });
      }

      // 5. Gravar transação financeira para DRE e relatórios
      const finRef = doc(collection(db, 'financial_transactions'));
      transaction.set(finRef, {
        id: finRef.id,
        tenantId,
        type: 'income',
        status: 'pago',
        category: totalDebtDeducted > 0 ? 'Recebimento Fiado' : 'Crédito Cliente',
        amount: amountToProcess,
        description: totalDebtDeducted > 0 
          ? `Recebimento Fiado - ${clientName}` 
          : `Recebimento em Conta - ${clientName}`,
        date: today,
        paymentMethod: data.paymentMethod || 'dinheiro',
        cliente_id: data.cliente_id,
        cliente_name: clientName,
        created_at: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    });

    // 6. Quitação de dívidas concluída com sucesso (Modelo A: pontos já computados no fechamento da comanda)
    return {
      success: true,
      cashUpdated: !!cashDoc,
      caixa_id: cashDoc?.id || null,
      settledDebts,
      totalPaid: amountToProcess,
      debtDeducted: totalDebtDeducted
    };
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
    return this.settleClientDebtsGlobal({
      cliente_id: data.cliente_id,
      divida_id: data.divida_id,
      amount: data.amount,
      paymentMethod: data.paymentMethod || 'dinheiro',
      userId: data.userId,
      userName: data.userName
    });
  },

  async addManualDebt(data: {
    cliente_id: string;
    cliente_name: string;
    amount: number;
    description: string;
    date?: string;
    dueDate?: string;
    tenantId?: string;
  }) {
    const debtRef = collection(db, COLLECTION_DEBTS);
    const newDebtId = doc(debtRef).id;
    const activeTenant = data.tenantId || getActiveTenantId();
    const todayStr = data.date || new Date().toISOString().split('T')[0];

    await setDoc(doc(db, COLLECTION_DEBTS, newDebtId), {
      id: newDebtId,
      cliente_id: data.cliente_id,
      cliente_name: data.cliente_name || 'Cliente',
      amount: data.amount,
      remainingAmount: data.amount,
      status: 'pendente',
      description: data.description.trim() || 'Fiado / Débito Avulso',
      date: todayStr,
      dueDate: data.dueDate || null,
      tenantId: activeTenant,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    const clientRef = doc(db, 'usuarios', data.cliente_id);
    const clientSnap = await getDoc(clientRef);
    if (clientSnap.exists()) {
      const clientData = clientSnap.data();
      const currentOpen = clientData.total_em_aberto || 0;
      const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;
      const newBal = currentBal - data.amount;
      await updateDoc(clientRef, {
        total_em_aberto: currentOpen + data.amount,
        balance: newBal,
        saldo_atual: newBal,
        updatedAt: serverTimestamp()
      });
    }

    return newDebtId;
  },

  async getDebtPayments(divida_id: string) {
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('divida_id', '==', divida_id)
    );
    const querySnapshot = await getDocs(q);
    const payments = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as DebtPayment));
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
    const debts = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ClientDebt));
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
        referencia_id: dividaId || clienteId,
        usuario_id: userId,
        usuario_name: userName,
        date: today,
        createdAt: serverTimestamp()
      });

      const cashRef = doc(db, 'cash_sessions', caixa_id);
      await updateDoc(cashRef, {
        total_expense: increment(amount),
        totalExpense: increment(amount),
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

    // Mark payment as reverted
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
    if (!cliente_id) return [];
    const q = query(
      collection(db, COLLECTION_PAYMENTS),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const querySnapshot = await getDocs(q);
    const payments = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as DebtPayment));
    return payments.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  }
};

