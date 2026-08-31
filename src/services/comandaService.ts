
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
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Comanda, ComandaItem, ComandaPayment, ComandaLog, ComandaStatus, ClientDebt, FinancialTransaction, CashMovement, PaymentMethod, PaymentMethodConfig } from '../types';
import { format, addMonths } from 'date-fns';
import { paymentMethodService } from './paymentMethodService';
import { cashService } from './cashService';
import { commissionService } from './commissionService';
import { inventoryService } from './inventoryService';
import { userService } from './userService';
import { loyaltyService } from './loyaltyService';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'comandas';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const comandaService = {
  async getComandas(status?: ComandaStatus) {
    let q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (status) {
      q = query(q, where('status', '==', status));
    }
    const querySnapshot = await getDocs(q);
    const comandas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comanda));
    return comandas.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  },

  subscribeToComandas(statuses: ComandaStatus[], callback: (comandas: Comanda[]) => void) {
    const q = query(
      collection(db, COLLECTION), 
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', statuses)
    );
    
    return onSnapshot(q, (snapshot) => {
      const comandas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comanda));
      comandas.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      callback(comandas);
    }, (error) => {
      console.error("Erro na inscrição de comandas em tempo real:", error);
    });
  },

  async getComandaById(id: string) {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Comanda;
    }
    return null;
  },

  async openComanda(data: Partial<Comanda>, userId: string, userName: string) {
    const docRef = doc(collection(db, COLLECTION));
    const number = Math.floor(1000 + Math.random() * 9000).toString();
    
    const items = data.items || [];
    const subtotalServices = items
      .filter(i => (i.type === 'servico' || i.type === 'assinatura') && !i.isCortesia)
      .reduce((acc, i) => acc + i.totalPrice, 0);
    
    const subtotalProducts = items
      .filter(i => (i.type === 'produto' || i.type === 'product' || i.type === 'pacote') && !i.isCortesia)
      .reduce((acc, i) => acc + i.totalPrice, 0);

    const totalAmount = subtotalServices + subtotalProducts;

    const linkedAppId = data.agendamento_id || (data as any).agendamentoId || (data as any).appointment_id || (data as any).appointmentId || '';

    const newComanda: Comanda = {
      id: docRef.id,
      tenantId: getActiveTenantId(),
      number,
      cliente_id: data.cliente_id || '',
      cliente_name: data.cliente_name || '',
      profissional_id: data.profissional_id || '',
      profissional_name: data.profissional_name || '',
      agendamento_id: linkedAppId,
      origin: data.origin || 'balcao',
      status: data.status || 'aberta',
      subtotalServices,
      subtotalProducts,
      discount: 0,
      tip: 0,
      totalAmount,
      paidAmount: 0,
      pendingAmount: totalAmount,
      items,
      payments: [],
      observations: data.observations || '',
      logs: [{
        userId,
        userName,
        date: new Date().toISOString(),
        action: 'Comanda criada',
        details: `Origem: ${data.origin || 'balcao'}`
      }],
      openedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(docRef, newComanda);

      if (linkedAppId) {
        try {
          await updateDoc(doc(db, 'appointments', linkedAppId), {
            comanda_id: docRef.id,
            comanda_number: number,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn("Could not link comanda_id on appointment:", err);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION);
    }
    return newComanda;
  },

  async addLog(id: string, userId: string, userName: string, action: string, details?: string) {
    const docRef = doc(db, COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const comanda = snap.data() as Comanda;

    const newLog: ComandaLog = {
      userId,
      userName,
      date: new Date().toISOString(),
      action,
      details
    };

    await updateDoc(docRef, {
      logs: [...(comanda.logs || []), newLog],
      updatedAt: serverTimestamp()
    });
  },

  async updateComandaItems(id: string, items: ComandaItem[], discount: number, tip: number, userId: string, userName: string) {
    const docRef = doc(db, COLLECTION, id);
    const comandaSnap = await getDoc(docRef);
    if (!comandaSnap.exists()) throw new Error("Comanda não encontrada");
    const comanda = comandaSnap.data() as Comanda;

    // Recalcular subtotais (cortesia não entra no subtotal financeiro)
    const subtotalServices = items
      .filter(i => (i.type === 'servico' || i.type === 'assinatura') && !i.isCortesia)
      .reduce((acc, i) => acc + i.totalPrice, 0);
    
    const subtotalProducts = items
      .filter(i => (i.type === 'produto' || i.type === 'product' || i.type === 'pacote') && !i.isCortesia)
      .reduce((acc, i) => acc + i.totalPrice, 0);

    const totalAmount = subtotalServices + subtotalProducts + tip - discount;
    const pendingAmount = totalAmount - comanda.paidAmount;

    // Comparar itens para log
    let action = 'Comanda atualizada';
    let details = '';
    
    const oldItemsCount = comanda.items?.length || 0;
    if (items.length > oldItemsCount) {
      const newItem = items[items.length - 1];
      action = 'Item adicionado';
      details = `${newItem.name} (R$ ${newItem.unitPrice.toFixed(2)})`;
    } else if (items.length < oldItemsCount) {
      action = 'Item removido';
      details = 'Um ou mais itens foram removidos';
    } else if (discount !== comanda.discount) {
      action = 'Desconto alterado';
      details = `De R$ ${comanda.discount.toFixed(2)} para R$ ${discount.toFixed(2)}`;
    } else if (tip !== comanda.tip) {
      action = 'Gorjeta alterada';
      details = `De R$ ${comanda.tip.toFixed(2)} para R$ ${tip.toFixed(2)}`;
    } else {
      // Check for cortesia toggle
      const changedIdx = items.findIndex((item, idx) => item.isCortesia !== comanda.items[idx]?.isCortesia);
      if (changedIdx !== -1) {
        const item = items[changedIdx];
        action = item.isCortesia ? 'Item marcado como Cortesia' : 'Cortesia removida';
        details = item.name;
      }
    }

    const newLog: ComandaLog = {
      userId,
      userName,
      date: new Date().toISOString(),
      action,
      details
    };

    await updateDoc(docRef, {
      items,
      subtotalServices,
      subtotalProducts,
      discount,
      tip,
      totalAmount,
      pendingAmount,
      logs: [...(comanda.logs || []), newLog],
      updatedAt: serverTimestamp()
    });
  },

  async addPayment(id: string, payment: Omit<ComandaPayment, 'id' | 'netAmount' | 'feeAmount' | 'settlementDate'>, userId: string, userName: string) {
    const docRef = doc(db, COLLECTION, id);
    
    // 1. Pre-fetch non-transactional data
    const methods = await paymentMethodService.getPaymentMethods();
    const today = new Date().toISOString().split('T')[0];
    const cashQuery = query(
      collection(db, 'cash_sessions'),
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['open', 'reopened'])
    );
    const cashDocs = await getDocs(cashQuery);
    let cashDoc = null;
    if (!cashDocs.empty) {
      const sortedDocs = [...cashDocs.docs].sort((a, b) => {
        const tA = a.data().openedAt?.seconds || 0;
        const tB = b.data().openedAt?.seconds || 0;
        return tB - tA;
      });
      cashDoc = sortedDocs[0];
    }    await runTransaction(db, async (transaction) => {
      // 2. Transactional Reads
      const comandaSnap = await transaction.get(docRef);
      if (!comandaSnap.exists()) throw new Error("Comanda não encontrada");
      const comanda = comandaSnap.data() as Comanda;

      if (['fechada', 'cancelada', 'nao_paga'].includes(comanda.status)) {
        throw new Error("Esta comanda já está fechada ou cancelada. Não é possível registrar novos pagamentos.");
      }

      // 2.1 Read client snap
      let clientSnap = null;
      if (comanda.cliente_id) {
        clientSnap = await transaction.get(doc(db, 'usuarios', comanda.cliente_id));
      }

      // 2.2 Read appointment snap
      const linkedAppId = comanda.agendamento_id || (comanda as any).agendamentoId || (comanda as any).appointment_id || (comanda as any).appointmentId;
      let appSnap = null;
      if (linkedAppId) {
        try {
          appSnap = await transaction.get(doc(db, 'appointments', linkedAppId));
        } catch (e) {
          console.warn("Appointment not found during payment closure", e);
        }
      }

      // 2.3 Read product snaps for all items
      const productExistsMap: Record<string, boolean> = {};
      for (const item of comanda.items) {
        if ((item.type === 'produto' || item.type === 'product') && !productExistsMap[item.referencia_id]) {
          const pSnap = await transaction.get(doc(db, 'products', item.referencia_id));
          productExistsMap[item.referencia_id] = pSnap.exists();
        }
      }

      // 2.4 Calculate if it will be closed to pre-fetch barber data
      const payments = [...(comanda.payments || []), { amount: payment.amount } as any];
      const paidAmount = payments.reduce((acc, p) => acc + p.amount, 0);
      const pendingAmount = comanda.totalAmount - paidAmount;
      const willBeClosed = pendingAmount <= 0;

      const methodConfig = methods.find(m => m.id === payment.metodo_pagamento_id || m.type === payment.method) || (payment.method === 'resgate' ? {
        id: 'resgate',
        name: 'Resgate de Cashback',
        type: 'resgate' as PaymentMethod,
        feePercentage: 0,
        settlementDays: 0,
        goesToClientAccount: false,
        active: true,
        createdAt: ''
      } : null);
      if (!methodConfig) throw new Error("Método de pagamento não configurado");

      if (methodConfig.goesToClientAccount) {
        if (!comanda.cliente_id || comanda.cliente_id === 'avulso') {
          throw new Error("Não é possível lançar como fiado para cliente avulso. Vincule um cliente cadastrado.");
        }
      }

      const barberDataMap: Record<string, any> = {};
      const servicesMap: Record<string, any> = {};
      const productsMap: Record<string, any> = {};
      const plansMap: Record<string, any> = {};
      if (willBeClosed) {
        const barberIds = Array.from(new Set(comanda.items.map(i => i.profissional_id || comanda.profissional_id).filter(Boolean)));
        for (const bId of barberIds) {
          if (bId) {
            const bSnap = await transaction.get(doc(db, 'usuarios', bId));
            if (bSnap.exists()) {
              barberDataMap[bId] = bSnap.data();
            }
          }
        }
        const serviceIds = Array.from(new Set(comanda.items.filter(i => i.type === 'servico' && i.referencia_id).map(i => i.referencia_id)));
        for (const sId of serviceIds) {
          if (sId) {
            const sSnap = await transaction.get(doc(db, 'services', sId));
            if (sSnap.exists()) {
              servicesMap[sId] = sSnap.data();
            }
          }
        }
        const productIds = Array.from(new Set(comanda.items.filter(i => (i.type === 'produto' || i.type === 'product') && i.referencia_id).map(i => i.referencia_id)));
        for (const pId of productIds) {
          if (pId) {
            const pSnap = await transaction.get(doc(db, 'products', pId));
            if (pSnap.exists()) {
              productsMap[pId] = pSnap.data();
            }
          }
        }
        const planItems = comanda.items.filter(i => i.type === 'assinatura' && i.referencia_id);
        for (const pItem of planItems) {
          const pSnap = await transaction.get(doc(db, 'subscription_plans', pItem.referencia_id));
          if (pSnap.exists()) {
            plansMap[pItem.referencia_id] = pSnap.data();
          }
        }
      }

      // 3. calculations
      const feeAmount = (payment.amount * methodConfig.feePercentage) / 100;
      const netAmount = payment.amount - feeAmount;
      
      const settlementDate = new Date();
      settlementDate.setDate(settlementDate.getDate() + methodConfig.settlementDays);
      const settlementDateStr = settlementDate.toISOString().split('T')[0];

      const newPayment: ComandaPayment = {
        ...payment,
        id: `pay-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        netAmount,
        feeAmount,
        settlementDate: settlementDateStr
      };

      const finalPayments = [...(comanda.payments || []), newPayment];
      const finalPaidAmount = finalPayments.reduce((acc, p) => acc + p.amount, 0);
      const finalPendingAmount = comanda.totalAmount - finalPaidAmount;
      
      let status = comanda.status;
      if (finalPendingAmount <= 0) {
        status = 'fechada';
      } else if (finalPaidAmount > 0) {
        status = 'parcialmente_paga';
      }

      const newLog = {
        userId,
        userName,
        date: new Date().toISOString(),
        action: 'Pagamento registrado',
        details: `${methodConfig.name} - R$ ${payment.amount.toFixed(2)}${status === 'fechada' ? ' (Comanda Fechada)' : ''}`
      };

      // 4. Transactional Writes
      transaction.update(docRef, {
        payments: finalPayments,
        paidAmount: finalPaidAmount,
        pendingAmount: finalPendingAmount,
        status,
        logs: [...(comanda.logs || []), newLog],
        updatedAt: serverTimestamp(),
        closedAt: (comanda.status !== 'fechada' && status === 'fechada') ? serverTimestamp() : comanda.closedAt // Maintain closedAt if already closed
      });

      // Update Client Statistics for the payment (not just the closure)
      if (comanda.cliente_id && !methodConfig.goesToClientAccount && clientSnap?.exists()) {
        const clientRef = doc(db, 'usuarios', comanda.cliente_id);
        transaction.update(clientRef, {
          total_pago: increment(payment.amount),
          totalPaid: increment(payment.amount), // Legacy
          saldo_atual: increment(payment.amount),
          balance: increment(payment.amount), // Legacy
          updatedAt: serverTimestamp()
        });
      }

      if (!methodConfig.goesToClientAccount) {
        const financialRef = doc(collection(db, 'financial_transactions'));
        const isReceivable = !!methodConfig.goesToReceivables;
        
        // Calculate item proportions for accurate DRE & Cash Flow
        const comandaItems = comanda.items || [];
        const rawTotal = comandaItems.reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * (i.quantity || 1)) || 0), 0) || 1;
        const servTotal = comandaItems.filter(i => (i.type === 'servico' || !i.type) && !i.isCortesia).reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * (i.quantity || 1)) || 0), 0);
        const prodTotal = comandaItems.filter(i => (i.type === 'produto' || i.type === 'product') && !i.isCortesia).reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * (i.quantity || 1)) || 0), 0);
        const pacTotal = comandaItems.filter(i => i.type === 'pacote' && !i.isCortesia).reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * (i.quantity || 1)) || 0), 0);
        const assTotal = comandaItems.filter(i => i.type === 'assinatura' && !i.isCortesia).reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * (i.quantity || 1)) || 0), 0);

        // Calculate proportional amounts for this specific payment
        const payRatio = payment.amount / (comanda.totalAmount || rawTotal || 1);
        const serviceAmount = Number((servTotal * payRatio).toFixed(2));
        const productAmount = Number((prodTotal * payRatio).toFixed(2));
        const packageAmount = Number((pacTotal * payRatio).toFixed(2));
        const subscriptionAmount = Number((assTotal * payRatio).toFixed(2));

        let categoryName = 'Serviços';
        if (prodTotal > 0 && servTotal === 0 && pacTotal === 0 && assTotal === 0) {
          categoryName = 'Produtos';
        } else if (pacTotal > 0 && servTotal === 0 && prodTotal === 0 && assTotal === 0) {
          categoryName = 'Pacotes';
        } else if (assTotal > 0 && servTotal === 0 && prodTotal === 0 && pacTotal === 0) {
          categoryName = 'Assinaturas';
        } else if (servTotal > 0 && (prodTotal > 0 || pacTotal > 0 || assTotal > 0)) {
          categoryName = 'Serviços/Produtos';
        }

        const financialTx: FinancialTransaction = {
          id: financialRef.id,
          tenantId: comanda.tenantId || getActiveTenantId(),
          type: 'income',
          category: categoryName,
          description: `Pagamento Comanda #${comanda.number} - ${comanda.cliente_name}`,
          amount: payment.amount,
          net_amount: netAmount,
          fee_amount: feeAmount,
          service_amount: serviceAmount,
          product_amount: productAmount,
          package_amount: packageAmount,
          subscription_amount: subscriptionAmount,
          paymentMethod: payment.method,
          metodo_pagamento_id: methodConfig.id,
          date: today,
          settlement_date: settlementDateStr,
          status: 'pago',
          is_settled: !isReceivable,
          comanda_id: comanda.id,
          cliente_id: comanda.cliente_id,
          cliente_name: comanda.cliente_name,
          profissional_id: comanda.profissional_id,
          profissional_name: comanda.profissional_name,
          responsavel_id: userId,
          responsavel_name: userName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        transaction.set(financialRef, financialTx);

        if (!cashDoc && ['fiado', 'resgate'].indexOf(payment.method) === -1) {
          throw new Error("O caixa do dia está fechado. Por favor, abra o caixa antes de registrar este pagamento.");
        }

        if (cashDoc) {
          const caixa_id = cashDoc.id;
          const movementRef = doc(collection(db, 'cash_movements'));
          const movement: CashMovement = {
            id: movementRef.id,
            caixa_id,
            type: 'income',
            category: 'Venda',
            description: `Comanda #${comanda.number}`,
            amount: isReceivable ? netAmount : payment.amount,
            paymentMethod: payment.method,
            is_receivable: isReceivable,
            settlement_date: settlementDateStr,
            referencia_id: comanda.id,
            usuario_id: userId,
            usuario_name: userName,
            date: today,
            createdAt: serverTimestamp()
          };
          transaction.set(movementRef, movement);
          
          const cashRef = doc(db, 'cash_sessions', caixa_id);
          if (isReceivable) {
            transaction.update(cashRef, {
              total_receivables: increment(netAmount),
              totalReceivables: increment(netAmount),
              updatedAt: serverTimestamp()
            });
          } else {
            transaction.update(cashRef, {
              total_income: increment(payment.amount),
              totalIncome: increment(payment.amount),
              expected_balance: increment(payment.amount),
              expectedBalance: increment(payment.amount),
              updatedAt: serverTimestamp()
            });
          }
        }
      }

      if (methodConfig.goesToClientAccount) {
        const debtRef = doc(collection(db, 'client_debts'));
        const debt: ClientDebt = {
          id: debtRef.id,
          tenantId: getActiveTenantId(),
          cliente_id: comanda.cliente_id,
          cliente_name: comanda.cliente_name,
          comanda_id: comanda.id,
          amount: payment.amount,
          remainingAmount: payment.amount,
          status: 'pendente',
          date: today,
          dueDate: (comanda as any).fiadoDueDate || (comanda as any).dueDate || today,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        transaction.set(debtRef, debt);

        if (comanda.cliente_id && clientSnap?.exists()) {
          const clientRef = doc(db, 'usuarios', comanda.cliente_id);
          transaction.update(clientRef, {
            total_em_aberto: increment(payment.amount),
            updatedAt: serverTimestamp()
          });
        }
      }

      if (status === 'fechada') {
        this.applyComandaClosureWrites(
          comanda, 
          transaction, 
          barberDataMap, 
          userId, 
          userName, 
          clientSnap?.exists() || false, 
          0,
          appSnap?.exists() || false,
          productExistsMap,
          servicesMap,
          productsMap,
          plansMap
        );
      }
    });

    try {
      const updatedSnap = await getDoc(docRef);
      if (updatedSnap.exists() && updatedSnap.data().status === 'fechada') {
        const uData = updatedSnap.data();
        const apptId = uData.agendamento_id || uData.agendamentoId || uData.appointment_id || uData.appointmentId;
        await this.closeLinkedAppointments(id, apptId);

        if (uData.cliente_id) {
          try {
            await loyaltyService.addPoints(
              uData.cliente_id,
              0,
              uData.paidAmount || uData.totalAmount || 0,
              `Cashback - Comanda #${uData.number}`,
              'appointment'
            );
          } catch (loyaltyErr) {
            console.warn("Could not calculate/credit cashback for closed comanda:", loyaltyErr);
          }
        }
      }
    } catch (err) {
      console.warn("Error in post-payment appointment closure sync:", err);
    }
  },

  async closeLinkedAppointments(comandaId: string, agendamentoId?: string) {
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;

      if (agendamentoId) {
        batch.update(doc(db, 'appointments', agendamentoId), {
          status: 'concluído',
          updatedAt: serverTimestamp()
        });
        updatedCount++;
      }

      const comandaSnap = await getDoc(doc(db, 'comandas', comandaId));
      if (comandaSnap.exists()) {
        const cData = comandaSnap.data();
        const linkedId = cData.agendamento_id || cData.agendamentoId || cData.appointment_id || cData.appointmentId;
        if (linkedId && linkedId !== agendamentoId) {
          batch.update(doc(db, 'appointments', linkedId), {
            status: 'concluído',
            updatedAt: serverTimestamp()
          });
          updatedCount++;
        }
      }

      const apptsQuery = query(
        collection(db, 'appointments'),
        where('comanda_id', '==', comandaId)
      );
      const apptsSnap = await getDocs(apptsQuery);
      if (!apptsSnap.empty) {
        apptsSnap.forEach((docSnap) => {
          if (docSnap.data().status !== 'concluído') {
            batch.update(docSnap.ref, {
              status: 'concluído',
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
      }

      if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully completed ${updatedCount} linked appointments for comanda ${comandaId}`);
      }
    } catch (err) {
      console.warn("Error auto-closing linked appointments for comanda:", err);
    }
  },

  async cancelLinkedAppointments(comandaId: string, agendamentoId?: string) {
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;

      if (agendamentoId) {
        batch.update(doc(db, 'appointments', agendamentoId), {
          status: 'cancelado',
          updatedAt: serverTimestamp()
        });
        updatedCount++;
      }

      const comandaSnap = await getDoc(doc(db, 'comandas', comandaId));
      if (comandaSnap.exists()) {
        const cData = comandaSnap.data();
        const linkedId = cData.agendamento_id || cData.agendamentoId || cData.appointment_id || cData.appointmentId;
        if (linkedId && linkedId !== agendamentoId) {
          batch.update(doc(db, 'appointments', linkedId), {
            status: 'cancelado',
            updatedAt: serverTimestamp()
          });
          updatedCount++;
        }
      }

      const apptsQuery = query(
        collection(db, 'appointments'),
        where('comanda_id', '==', comandaId)
      );
      const apptsSnap = await getDocs(apptsQuery);
      if (!apptsSnap.empty) {
        apptsSnap.forEach((docSnap) => {
          if (docSnap.data().status !== 'cancelado') {
            batch.update(docSnap.ref, {
              status: 'cancelado',
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
      }

      if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully canceled ${updatedCount} linked appointments for comanda ${comandaId}`);
      }
    } catch (err) {
      console.warn("Error auto-canceling linked appointments for comanda:", err);
    }
  },

  async deleteLinkedAppointments(comandaId: string, agendamentoId?: string) {
    try {
      const batch = writeBatch(db);
      let deletedCount = 0;

      if (agendamentoId) {
        batch.delete(doc(db, 'appointments', agendamentoId));
        deletedCount++;
      }

      const comandaSnap = await getDoc(doc(db, 'comandas', comandaId));
      if (comandaSnap.exists()) {
        const cData = comandaSnap.data();
        const linkedId = cData.agendamento_id || cData.agendamentoId || cData.appointment_id || cData.appointmentId;
        if (linkedId && linkedId !== agendamentoId) {
          batch.delete(doc(db, 'appointments', linkedId));
          deletedCount++;
        }
      }

      const apptsQuery = query(
        collection(db, 'appointments'),
        where('comanda_id', '==', comandaId)
      );
      const apptsSnap = await getDocs(apptsQuery);
      if (!apptsSnap.empty) {
        apptsSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          deletedCount++;
        });
      }

      if (deletedCount > 0) {
        await batch.commit();
        console.log(`Successfully deleted ${deletedCount} linked appointments for comanda ${comandaId}`);
      }
    } catch (err) {
      console.warn("Error auto-deleting linked appointments for comanda:", err);
    }
  },

  async markAbsentLinkedAppointments(comandaId: string, agendamentoId?: string) {
    try {
      const batch = writeBatch(db);
      let updatedCount = 0;

      if (agendamentoId) {
        batch.update(doc(db, 'appointments', agendamentoId), {
          status: 'faltou',
          updatedAt: serverTimestamp()
        });
        updatedCount++;
      }

      const comandaSnap = await getDoc(doc(db, 'comandas', comandaId));
      if (comandaSnap.exists()) {
        const cData = comandaSnap.data();
        const linkedId = cData.agendamento_id || cData.agendamentoId || cData.appointment_id || cData.appointmentId;
        if (linkedId && linkedId !== agendamentoId) {
          batch.update(doc(db, 'appointments', linkedId), {
            status: 'faltou',
            updatedAt: serverTimestamp()
          });
          updatedCount++;
        }
      }

      const apptsQuery = query(
        collection(db, 'appointments'),
        where('comanda_id', '==', comandaId)
      );
      const apptsSnap = await getDocs(apptsQuery);
      if (!apptsSnap.empty) {
        apptsSnap.forEach((docSnap) => {
          if (docSnap.data().status !== 'faltou') {
            batch.update(docSnap.ref, {
              status: 'faltou',
              updatedAt: serverTimestamp()
            });
            updatedCount++;
          }
        });
      }

      if (updatedCount > 0) {
        await batch.commit();
        console.log(`Successfully marked ${updatedCount} linked appointments as faltou for comanda ${comandaId}`);
      }
    } catch (err) {
      console.warn("Error auto-marking absent linked appointments for comanda:", err);
    }
  },

  async applyComandaClosureWrites(
    comanda: Comanda, 
    transaction: any, 
    barberDataMap: Record<string, any>, 
    userId: string, 
    userName: string, 
    clientExists: boolean = false,
    finalPendingAmountLeft: number = 0,
    appointmentExists: boolean = false,
    productExistsMap: Record<string, boolean> = {},
    servicesMap: Record<string, any> = {},
    productsMap: Record<string, any> = {},
    plansMap: Record<string, any> = {},
    subscriptionsMap: Record<string, any> = {}
  ) {
    // 1. Update Appointment if exists
    const apptId = comanda.agendamento_id || (comanda as any).agendamentoId || (comanda as any).appointment_id || (comanda as any).appointmentId;
    if (apptId) {
      const appointmentRef = doc(db, 'appointments', apptId);
      transaction.update(appointmentRef, {
        status: 'concluído',
        updatedAt: serverTimestamp()
      });
    }

    // 2. Update Client Statistics and History (Total Spent)
    if (comanda.cliente_id && clientExists) {
      const clientRef = doc(db, 'usuarios', comanda.cliente_id);
      transaction.update(clientRef, {
        tenantId: comanda.tenantId || getActiveTenantId(),
        ativo: true,
        total_gasto: increment(comanda.totalAmount),
        totalSpent: increment(comanda.totalAmount), // Legacy
        saldo_atual: increment(-comanda.totalAmount),
        balance: increment(-comanda.totalAmount), // Legacy
        total_em_aberto: increment(finalPendingAmountLeft > 0 ? finalPendingAmountLeft : 0),
        appointmentsCount: increment(1),
        lastServiceAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2.1 Loyalty Points & Cashback
      // We'll use a fixed calculation or attempt to fetch config if we were in a context allowing it.
      // Since this is inside a transaction, we can't easily do 'await' for a NEW doc here without pre-fetching.
      // However, we can use a standard logic: 1 point per Real, 5% cashback (matching default config)
      // If a service is deducted via subscription, calculate points based on its original price so points are still credited
      const originalSubscriptionAmount = (comanda.items || [])
        .filter(item => item.deductType === 'assinatura')
        .reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);

      const effectiveAmountForPoints = (comanda.totalAmount || 0) + originalSubscriptionAmount;
      const pointsToAdd = Math.floor(effectiveAmountForPoints); // 1 point per Real
      const cashbackToAdd = ((comanda.totalAmount || 0) * 5) / 100; // 5% cashback on actual paid amount
      const activeTenantId = comanda.tenantId || getActiveTenantId();
      const pointsDocId = `${activeTenantId}_${comanda.cliente_id}`;

      const pointsRef = doc(db, 'loyalty_points', pointsDocId);
      // We use set with merge: true to create if not exists
      transaction.set(pointsRef, {
        cliente_id: comanda.cliente_id,
        tenantId: activeTenantId,
        points: increment(pointsToAdd),
        cashback: increment(cashbackToAdd),
        updatedAt: serverTimestamp()
      }, { merge: true });

      const historyRef = doc(collection(db, 'loyalty_history'));
      transaction.set(historyRef, {
        cliente_id: comanda.cliente_id,
        tenantId: activeTenantId,
        type: 'earn',
        source: comanda.origin === 'agenda' ? 'appointment' : 'purchase',
        points: pointsToAdd,
        cashback: cashbackToAdd,
        description: `Comanda #${comanda.number}`,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp()
      });
    }

    // 3. Generate Commissions and Update Inventory
    for (const item of comanda.items) {
      // 3.1 Commissions
      const targetBarberId = item.profissional_id || comanda.profissional_id;
      const targetBarberName = item.profissional_name || comanda.profissional_name;

      if (item.generateCommission && targetBarberId && item.deductType !== 'assinatura') {
        const barberData = barberDataMap[targetBarberId];
        const defaultPercentage = barberData?.commission_percentage || 0; // Default to 0 if not set

        const itemData = (item.type === 'produto' || item.type === 'product') 
          ? (productsMap[item.referencia_id] || {})
          : (servicesMap[item.referencia_id] || {});
        const tipoComissao = itemData.tipo_comissao || 'padrao';
        const valorComissao = itemData.valor_comissao !== undefined ? itemData.valor_comissao : 0;

        let commission_percentage = defaultPercentage;
        let commission_value = 0;

        // Rule: Cortesia uses unitPrice as base if commission enabled, else useTotalPrice.
        // If deductType is 'pacote' and a packageUnitPrice is set, use that as the base instead.
        const base_value = item.isCortesia 
          ? ((item.deductType === 'pacote' && item.packageUnitPrice !== undefined && item.packageUnitPrice !== null)
              ? (item.packageUnitPrice * item.quantity)
              : (item.unitPrice * item.quantity))
          : item.totalPrice;

        // Check if there's a specific professional-level override for this item
        const proOverride = itemData.comissoes_por_profissional?.[targetBarberId];
        const effectiveRule = proOverride || { tipo: tipoComissao, valor: valorComissao };

        if (effectiveRule.tipo === 'percentual') {
          commission_percentage = effectiveRule.valor;
          commission_value = (base_value * commission_percentage) / 100;
        } else if (effectiveRule.tipo === 'fixo') {
          commission_percentage = 0;
          commission_value = effectiveRule.valor * item.quantity;
        } else {
          // 'padrao'
          commission_percentage = defaultPercentage;
          commission_value = (base_value * commission_percentage) / 100;
        }

        if (commission_value > 0) {
          const isAssinatura = item.type === 'assinatura' || item.name?.toLowerCase().includes('assinatura') || item.name?.toLowerCase().includes('plano') || item.name?.toLowerCase().includes('pacote');
          let commDate = new Date().toISOString().split('T')[0];
          if (isAssinatura && item.metadata?.subscriptionId && subscriptionsMap[item.metadata.subscriptionId]?.endDate) {
            commDate = subscriptionsMap[item.metadata.subscriptionId].endDate;
          }

          const commissionRef = doc(collection(db, 'commissions'));
          transaction.set(commissionRef, {
            id: commissionRef.id,
            profissional_id: targetBarberId,
            profissional_name: targetBarberName,
            agendamento_id: comanda.agendamento_id || '',
            comanda_id: comanda.id,
            comanda_number: comanda.number,
            cliente_id: comanda.cliente_id,
            cliente_name: comanda.cliente_name,
            servico_name: item.name,
            base_value,
            commission_percentage,
            commission_value,
            status: 'pendente',
            commission_type: isAssinatura ? 'assinatura' : ((item.type === 'produto' || item.type === 'product') ? 'venda' : 'servico'),
            tenantId: comanda.tenantId || '',
            date: commDate,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else if (item.generateCommission && !targetBarberId && item.deductType !== 'assinatura') {
        // Log inconsistency if commission should be generated but no barber is linked
        const logRef = doc(collection(db, 'inconsistency_logs'));
        transaction.set(logRef, {
          id: logRef.id,
          type: 'MISSING_BARBER_FOR_COMMISSION',
          description: `Comissão deveria ser gerada para item ${item.name} na comanda #${comanda.number}, mas não foi encontrado barbeiro vinculado.`,
          data: { comandaId: comanda.id, itemId: item.id, itemType: item.type },
          createdAt: serverTimestamp()
        });
      }

      // 3.2 Inventory
      if (item.type === 'produto' || item.type === 'product') {
        const productRef = doc(db, 'products', item.referencia_id);
        const exists = productExistsMap[item.referencia_id] || false;
        if (exists) {
          transaction.update(productRef, {
            currentStock: increment(-item.quantity),
            updatedAt: serverTimestamp()
          });
        }

        const movementRef = doc(collection(db, 'inventory_movements'));
        transaction.set(movementRef, {
          id: movementRef.id,
          tenantId: comanda.tenantId || getActiveTenantId(),
          produto_id: item.referencia_id,
          productName: item.name,
          type: 'venda',
          quantity: item.quantity,
          reason: `Venda Comanda #${comanda.number}`,
          referencia_id: comanda.id,
          profissional_id: userId,
          profissional_name: userName,
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        });
      }
    }

    // 3.3 Tip Commission (if active - usually 100% to professional)
    if (comanda.tip > 0 && comanda.profissional_id) {
      const tipCommissionRef = doc(collection(db, 'commissions'));
      transaction.set(tipCommissionRef, {
        id: tipCommissionRef.id,
        profissional_id: comanda.profissional_id,
        profissional_name: comanda.profissional_name,
        comanda_id: comanda.id,
        comanda_number: comanda.number,
        cliente_id: comanda.cliente_id,
        cliente_name: comanda.cliente_name,
        servico_name: 'Gorjeta',
        base_value: comanda.tip,
        commission_percentage: 100,
        commission_value: comanda.tip,
        status: 'pendente',
        commission_type: 'gorjeta',
        tenantId: comanda.tenantId || '',
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    // 3.4 Active Subscription creation or renewal (if any item is of type 'assinatura')
    const activeTenantId = comanda.tenantId || getActiveTenantId();
    for (const item of comanda.items) {
      if (item.type === 'assinatura') {
        const plan = plansMap?.[item.referencia_id];
        if (plan && comanda.cliente_id) {
          const subscriptionIdToRenew = item.metadata?.subscriptionId;
          const today = new Date();
          const todayStr = format(today, 'yyyy-MM-dd');

          if (subscriptionIdToRenew) {
            // Update existing subscription for renewal
            const subRef = doc(db, 'subscriptions', subscriptionIdToRenew);
            const assinaturasRef = doc(db, 'assinaturas', subscriptionIdToRenew);
            
            const existingSub = subscriptionsMap[subscriptionIdToRenew];
            const currentEndDateStr = existingSub?.endDate || todayStr;
            const currentEndDate = new Date(currentEndDateStr + 'T12:00:00');
            
            let newStartDateStr = currentEndDateStr;
            if (currentEndDate < today) {
              newStartDateStr = todayStr;
            }
            const newStartDate = new Date(newStartDateStr + 'T12:00:00');
            const newEndDate = addMonths(newStartDate, 1);
            const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');

            const renewalData = {
              startDate: newStartDateStr,
              endDate: newEndDateStr,
              status: 'active',
              haircutsUsed: 0,
              beardsUsed: 0,
              serviceUsages: {},
              lastRenewalDate: todayStr,
              updatedAt: serverTimestamp()
            };

            transaction.update(subRef, renewalData);
            transaction.update(assinaturasRef, renewalData);
          } else {
            const startDate = new Date();
            const endDate = addMonths(startDate, 1);
            
            const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            
            const subscriptionData = {
              id: subId,
              tenantId: activeTenantId,
              cliente_id: comanda.cliente_id,
              cliente_name: comanda.cliente_name,
              plano_id: item.referencia_id,
              planName: plan.name || item.name || 'Assinatura',
              startDate: format(startDate, 'yyyy-MM-dd'),
              endDate: format(endDate, 'yyyy-MM-dd'),
              status: 'active',
              autoRenew: item.metadata?.autoRenew ?? true,
              haircutsUsed: 0,
              beardsUsed: 0,
              services: plan.services || [],
              serviceUsages: {},
              lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
              discounts: plan.discounts || [],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            
            // Write to both 'subscriptions' and 'assinaturas' collections for maximum compatibility
            transaction.set(doc(db, 'subscriptions', subId), subscriptionData);
            transaction.set(doc(db, 'assinaturas', subId), subscriptionData);
          }
        }
      }
    }
  },

  async closeComanda(id: string, userId: string, userName: string, status: ComandaStatus = 'fechada', dueDate?: string) {
    const docRef = doc(db, COLLECTION, id);
    
    await runTransaction(db, async (transaction) => {
      // 1. Transactional Reads
      const comandaSnap = await transaction.get(docRef);
      if (!comandaSnap.exists()) throw new Error("Comanda não encontrada");
      const comanda = comandaSnap.data() as Comanda;

      if (['fechada', 'cancelada', 'nao_paga'].includes(comanda.status)) {
        throw new Error("Esta comanda já está fechada ou cancelada.");
      }

      // 2. Read client snap
      let clientSnap = null;
      if (comanda.cliente_id) {
        clientSnap = await transaction.get(doc(db, 'usuarios', comanda.cliente_id));
      }

      // 3. Read appointment snap
      const linkedAppId = comanda.agendamento_id || (comanda as any).agendamentoId || (comanda as any).appointment_id || (comanda as any).appointmentId;
      let appSnap = null;
      if (linkedAppId) {
        try {
          appSnap = await transaction.get(doc(db, 'appointments', linkedAppId));
        } catch (e) {
          console.warn("Appointment not found during closure", e);
        }
      }

      // 4. Read product snaps for all items
      const productExistsMap: Record<string, boolean> = {};
      for (const item of comanda.items) {
        if ((item.type === 'produto' || item.type === 'product') && !productExistsMap[item.referencia_id]) {
          const pSnap = await transaction.get(doc(db, 'products', item.referencia_id));
          productExistsMap[item.referencia_id] = pSnap.exists();
        }
      }

      // 5. Read barber snaps if status will be closed or nao_paga
      const finalStatus = (status === 'fechada' && comanda.pendingAmount > 0) ? 'nao_paga' : status;
      const isClosing = finalStatus === 'fechada' || finalStatus === 'nao_paga';

      const barberDataMap: Record<string, any> = {};
      const servicesMap: Record<string, any> = {};
      const productsMap: Record<string, any> = {};
      const plansMap: Record<string, any> = {};
      const subscriptionsMap: Record<string, any> = {};
      if (isClosing) {
        const barberIds = Array.from(new Set(comanda.items.filter(i => i.generateCommission).map(i => i.profissional_id || comanda.profissional_id).filter(Boolean)));
        for (const bId of barberIds) {
          if (bId) {
            const bSnap = await transaction.get(doc(db, 'usuarios', bId));
            if (bSnap.exists()) {
              barberDataMap[bId] = bSnap.data();
            }
          }
        }
        const serviceIds = Array.from(new Set(comanda.items.filter(i => i.generateCommission && i.type === 'servico' && i.referencia_id).map(i => i.referencia_id)));
        for (const sId of serviceIds) {
          if (sId) {
            const sSnap = await transaction.get(doc(db, 'services', sId));
            if (sSnap.exists()) {
              servicesMap[sId] = sSnap.data();
            }
          }
        }
        const productIds = Array.from(new Set(comanda.items.filter(i => i.generateCommission && (i.type === 'produto' || i.type === 'product') && i.referencia_id).map(i => i.referencia_id)));
        for (const pId of productIds) {
          if (pId) {
            const pSnap = await transaction.get(doc(db, 'products', pId));
            if (pSnap.exists()) {
              productsMap[pId] = pSnap.data();
            }
          }
        }
        const planItems = comanda.items.filter(i => i.type === 'assinatura' && i.referencia_id);
        for (const pItem of planItems) {
          const pSnap = await transaction.get(doc(db, 'subscription_plans', pItem.referencia_id));
          if (pSnap.exists()) {
            plansMap[pItem.referencia_id] = pSnap.data();
          }
          if (pItem.metadata?.subscriptionId) {
            const subId = pItem.metadata.subscriptionId;
            const subSnap = await transaction.get(doc(db, 'subscriptions', subId));
            if (subSnap.exists()) {
              subscriptionsMap[subId] = subSnap.data();
            }
          }
        }
      }
      
      // Se fechar sem pagamento total e não for cancelada, o resto vira fiado (não paga)
      if (status === 'fechada' && comanda.pendingAmount > 0) {
        if (!comanda.cliente_id || comanda.cliente_id === 'avulso') {
          throw new Error("Não é possível fechar comanda com saldo pendente para cliente avulso. Por favor, registre o pagamento integral ou vincule um cliente cadastrado.");
        }
        const pending = comanda.pendingAmount;
        const debtRef = doc(collection(db, 'client_debts'));
        transaction.set(debtRef, {
          id: debtRef.id,
          tenantId: getActiveTenantId(),
          cliente_id: comanda.cliente_id,
          cliente_name: comanda.cliente_name,
          comanda_id: comanda.id,
          amount: pending,
          remainingAmount: pending,
          status: 'pendente',
          date: new Date().toISOString().split('T')[0],
          dueDate: dueDate || (comanda as any).fiadoDueDate || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      const logAction = finalStatus === 'cancelada' ? 'Comanda cancelada' : finalStatus === 'ausente' ? 'Cliente marcado ausente' : 'Comanda fechada';
      const newLog = {
        userId,
        userName,
        date: new Date().toISOString(),
        action: logAction,
        details: comanda.pendingAmount > 0 ? `Saldo pendente de R$ ${comanda.pendingAmount.toFixed(2)} virou fiado` : 'Fechamento total'
      };

      transaction.update(docRef, {
        status: finalStatus,
        closedAt: serverTimestamp(),
        logs: [...(comanda.logs || []), newLog],
        updatedAt: serverTimestamp()
      });

      if (finalStatus === 'fechada' || finalStatus === 'nao_paga') {
        this.applyComandaClosureWrites(
          comanda, 
          transaction, 
          barberDataMap, 
          userId, 
          userName, 
          clientSnap?.exists() || false, 
          comanda.pendingAmount,
          appSnap?.exists() || false,
          productExistsMap,
          servicesMap,
          productsMap,
          plansMap,
          subscriptionsMap
        );
      } else if (finalStatus === 'cancelada' || finalStatus === 'ausente') {
        const linkedAppId = comanda.agendamento_id || (comanda as any).agendamentoId || (comanda as any).appointment_id || (comanda as any).appointmentId;
        if (linkedAppId) {
          const appointmentRef = doc(db, 'appointments', linkedAppId);
          transaction.update(appointmentRef, {
            status: finalStatus === 'ausente' ? 'faltou' : 'cancelado',
            updatedAt: serverTimestamp()
          });
        }
      }
    });

    try {
      const comandaSnapPost = await getDoc(docRef);
      const postData = comandaSnapPost.exists() ? comandaSnapPost.data() : null;
      const linkedAppIdPost = postData ? (postData.agendamento_id || postData.agendamentoId || postData.appointment_id || postData.appointmentId) : undefined;

      if (status === 'fechada' || status === 'nao_paga' || postData?.status === 'fechada' || postData?.status === 'nao_paga') {
        await this.closeLinkedAppointments(id, linkedAppIdPost);
      } else if (status === 'cancelada' || postData?.status === 'cancelada') {
        await this.cancelLinkedAppointments(id, linkedAppIdPost);
      } else if (status === 'ausente' || postData?.status === 'ausente') {
        await this.markAbsentLinkedAppointments(id, linkedAppIdPost);
      }
    } catch (e) {
      console.error("Error updating linked appointments inside closeComanda:", e);
    }
  },

  async payDebt(debtId: string, amount: number, method: PaymentMethod, methodId: string, userId: string, userName: string) {
    const debtRef = doc(db, 'client_debts', debtId);
    
    // 1. Pre-fetch non-transactional data
    const today = new Date().toISOString().split('T')[0];
    const cashQuery = query(
      collection(db, 'cash_sessions'),
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['open', 'reopened'])
    );
    const cashDocs = await getDocs(cashQuery);
    let cashDoc = null;
    if (!cashDocs.empty) {
      const sortedDocs = [...cashDocs.docs].sort((a, b) => {
        const tA = a.data().openedAt?.seconds || 0;
        const tB = b.data().openedAt?.seconds || 0;
        return tB - tA;
      });
      cashDoc = sortedDocs[0];
    }

    await runTransaction(db, async (transaction) => {
      // 2. Transactional Reads
      const debtSnap = await transaction.get(debtRef);
      if (!debtSnap.exists()) throw new Error("Dívida não encontrada");
      const debt = debtSnap.data() as ClientDebt;

      const clientRef = doc(db, 'usuarios', debt.cliente_id);
      const clientSnapOnPay = await transaction.get(clientRef);

      const newRemaining = Math.max(0, debt.remainingAmount - amount);
      
      // 3. Transactional Writes
      transaction.update(debtRef, {
        remainingAmount: newRemaining,
        status: newRemaining <= 0.001 ? 'pago' : 'parcial',
        updatedAt: serverTimestamp()
      });

      if (clientSnapOnPay.exists()) {
        const clientData = clientSnapOnPay.data();
        const currentEmAberto = clientData.total_em_aberto ?? clientData.saldo_devedor ?? 0;
        const newEmAberto = Math.max(0, currentEmAberto - amount);

        transaction.update(clientRef, {
          saldo_atual: increment(amount),
          balance: increment(amount), // Legacy
          total_pago: increment(amount),
          totalPaid: increment(amount), // Legacy
          total_em_aberto: newEmAberto,
          saldo_devedor: newEmAberto,
          updatedAt: serverTimestamp()
        });
      }

      const paymentRef = doc(collection(db, 'debt_payments'));
      transaction.set(paymentRef, {
        id: paymentRef.id,
        tenantId: getActiveTenantId(),
        divida_id: debtId,
        cliente_id: debt.cliente_id,
        amount,
        paymentMethod: method,
        date: today,
        createdAt: serverTimestamp()
      });

      if (cashDoc) {
        const caixa_id = cashDoc.id;
        const movementRef = doc(collection(db, 'cash_movements'));
        transaction.set(movementRef, {
          id: movementRef.id,
          tenantId: getActiveTenantId(),
          caixa_id,
          type: 'income',
          category: 'Recebimento de Dívida',
          description: `Recebimento Dívida - ${debt.cliente_name}`,
          amount: amount,
          paymentMethod: method,
          is_receivable: false,
          referencia_id: debt.id,
          usuario_id: userId,
          usuario_name: userName,
          date: today,
          createdAt: serverTimestamp()
        });
        
        const cashRef = doc(db, 'cash_sessions', caixa_id);
        transaction.update(cashRef, {
          total_income: increment(amount),
          totalIncome: increment(amount),
          expected_balance: increment(amount),
          expectedBalance: increment(amount),
          updatedAt: serverTimestamp()
        });
      }

      // Also create financial_transaction entry for accounting
      const finRef = doc(collection(db, 'financial_transactions'));
      transaction.set(finRef, {
        id: finRef.id,
        tenantId: getActiveTenantId(),
        type: 'income',
        status: 'pago',
        category: 'Recebimento Fiado',
        amount: amount,
        description: `Recebimento Fiado - ${debt.cliente_name}`,
        date: today,
        paymentMethod: method,
        cliente_id: debt.cliente_id,
        cliente_name: debt.cliente_name,
        created_at: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    });
  },

  async updateComandaClient(id: string, clientData: { id: string, name: string }, userId: string, userName: string) {
    const docRef = doc(db, COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const comanda = snap.data() as Comanda;

    const systemLog: ComandaLog = {
      userId,
      userName,
      date: new Date().toISOString(),
      action: 'Troca de Cliente',
      details: `De: ${comanda.cliente_name} Para: ${clientData.name}`
    };

    await updateDoc(docRef, {
      cliente_id: clientData.id,
      cliente_name: clientData.name,
      logs: [...(comanda.logs || []), systemLog],
      updatedAt: serverTimestamp()
    });
  },

  async updateComandaBarber(id: string, barberData: { id: string, name: string }, userId: string, userName: string) {
    const docRef = doc(db, COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const comanda = snap.data() as Comanda;

    const systemLog: ComandaLog = {
      userId,
      userName,
      date: new Date().toISOString(),
      action: 'Troca de Profissional',
      details: `De: ${comanda.profissional_name} Para: ${barberData.name}`
    };

    // Also update professional_id/name on all items that don't have a specific overridden professional
    const updatedItems = comanda.items.map(item => ({
      ...item,
      profissional_id: item.profissional_id === comanda.profissional_id ? barberData.id : item.profissional_id,
      profissional_name: item.profissional_name === comanda.profissional_name ? barberData.name : item.profissional_name
    }));

    await updateDoc(docRef, {
      profissional_id: barberData.id,
      profissional_name: barberData.name,
      items: updatedItems,
      logs: [...(comanda.logs || []), systemLog],
      updatedAt: serverTimestamp()
    });
  },

  async reopenComanda(id: string, reason: string, userId: string, userName: string) {
    const docRef = doc(db, COLLECTION, id);
    const initialSnap = await getDoc(docRef);
    if (!initialSnap.exists()) throw new Error("Comanda não encontrada");
    const initialComanda = initialSnap.data() as Comanda;

    // RULE: Check if the cash session for that comanda date is open
    // We get the date from createdAt (Firestore Timestamp) or openedAt
    const comandaDate = initialComanda.createdAt?.toDate ? initialComanda.createdAt.toDate() : new Date();
    const dateStr = comandaDate.toISOString().split('T')[0];

    const cashQuery = query(
      collection(db, 'cash_sessions'), 
      where('date', '==', dateStr),
      where('status', 'in', ['open', 'reopened'])
    );
    const cashSnapshot = await getDocs(cashQuery);
    
    if (cashSnapshot.empty) {
      throw new Error(`Para reabrir esta comanda, é necessário reabrir o caixa do dia correspondente (${dateStr.split('-').reverse().join('/')})`);
    }

    // 1. Fetch all related documents before transaction
    const clientDebtDocs = await getDocs(query(collection(db, 'client_debts'), where('comanda_id', '==', id)));
    const debtIds = clientDebtDocs.docs.map(d => d.id);

    const relatedQueries: Promise<any>[] = [
      getDocs(query(collection(db, 'financial_transactions'), where('comanda_id', '==', id))),
      getDocs(query(collection(db, 'cash_movements'), where('referencia_id', '==', id))),
      getDocs(query(collection(db, 'commissions'), where('comanda_id', '==', id))),
      getDocs(query(collection(db, 'inventory_movements'), where('referencia_id', '==', id))),
      getDocs(query(collection(db, 'appointments'), where('comanda_id', '==', id))),
    ];

    if (debtIds.length > 0) {
      relatedQueries.push(getDocs(query(collection(db, 'debt_payments'), where('divida_id', 'in', debtIds))));
      relatedQueries.push(getDocs(query(collection(db, 'cash_movements'), where('referencia_id', 'in', debtIds))));
    } else {
      relatedQueries.push(Promise.resolve({ docs: [] }));
      relatedQueries.push(Promise.resolve({ docs: [] }));
    }

    const [financialTxs, cashMovements, commissions, inventoryMovements, linkedAppointments, debtPayments, debtCashMovements] = await Promise.all(relatedQueries);

    await runTransaction(db, async (transaction) => {
      // 2. Transactional Reads
      const comandaSnap = await transaction.get(docRef);
      if (!comandaSnap.exists()) throw new Error("Comanda não encontrada");
      const comanda = comandaSnap.data() as Comanda;

      if (comanda.status !== 'fechada' && comanda.status !== 'nao_paga' && comanda.status !== 'parcialmente_paga') {
        throw new Error("Somente comandas fechadas, não pagas ou parcialmente pagas podem ser reabertas.");
      }

      // Pre-fetch related users, products, cash_sessions, appointment
      const clientRef = comanda.cliente_id ? doc(db, 'usuarios', comanda.cliente_id) : null;
      const clientSnap = clientRef ? await transaction.get(clientRef) : null;

      const appointmentRef = comanda.agendamento_id ? doc(db, 'appointments', comanda.agendamento_id) : null;
      
      const allCashMovements = [...cashMovements.docs, ...debtCashMovements.docs];
      const cashIds = Array.from(new Set(allCashMovements.map(d => d.data().caixa_id))) as string[];
      const cashSnaps = await Promise.all(cashIds.filter(id => id).map(cid => transaction.get(doc(db, 'cash_sessions', cid))));
      const cashMap = Object.fromEntries(cashSnaps.map(s => [s.id, s.data()]));

      const productIds = Array.from(new Set(inventoryMovements.docs.map(d => d.data().produto_id))) as string[];
      const productSnaps = await Promise.all(productIds.filter(id => id).map(pid => transaction.get(doc(db, 'products', pid))));
      const productsMap = Object.fromEntries(productSnaps.map(s => [s.id, s.data()]));

      // 3. Reversion Logic
      
      // Commissions
      commissions.docs.forEach(d => {
        const comm = d.data();
        if (comm.status === 'pago') {
          const logRef = doc(collection(db, 'inconsistency_logs'));
          transaction.set(logRef, {
            id: logRef.id,
            type: 'commission_reopen_paid',
            comanda_id: id,
            comanda_number: comanda.number,
            profissional_id: comm.profissional_id,
            profissional_name: comm.profissional_name,
            amount: comm.commission_value,
            date: new Date().toISOString(),
            createdAt: serverTimestamp()
          });
        } else {
          transaction.delete(d.ref);
        }
      });

      // Inventory
      inventoryMovements.docs.forEach(d => {
        const movement = d.data();
        if (productsMap[movement.produto_id]) {
          const pRef = doc(db, 'products', movement.produto_id);
          transaction.update(pRef, {
            currentStock: increment(movement.quantity),
            updatedAt: serverTimestamp()
          });
        }
        transaction.delete(d.ref);
      });

      // Finance & Cash
      financialTxs.docs.forEach(d => transaction.delete(d.ref));
      allCashMovements.forEach(d => {
        const movement = d.data() as CashMovement;
        const cashData = cashMap[movement.caixa_id];
        if (cashData) {
          const cashRef = doc(db, 'cash_sessions', movement.caixa_id);
          if (movement.is_receivable) {
            transaction.update(cashRef, {
              total_receivables: increment(-movement.amount),
              totalReceivables: increment(-movement.amount),
              updatedAt: serverTimestamp()
            });
          } else {
            transaction.update(cashRef, {
              total_income: increment(-movement.amount),
              totalIncome: increment(-movement.amount),
              expected_balance: increment(-movement.amount),
              expectedBalance: increment(-movement.amount),
              updatedAt: serverTimestamp()
            });
          }
        }
        transaction.delete(d.ref);
      });

      // Client Debts & their payments
      clientDebtDocs.docs.forEach(d => {
        transaction.delete(d.ref);
      });
      debtPayments.docs.forEach(d => transaction.delete(d.ref));

      // Client Stats
      if (clientSnap?.exists()) {
        // Recalculate how much to revert
        // We revert total_gasto, saldo_atual
        // AND we revert total_pago based on actual cash payments made
        // AND total_em_aberto based on current debts related to this comanda
        
        const cashPaidOnComanda = comanda.payments
          .filter(p => {
            const method = p.metodo_pagamento_id || p.method;
            // This is hard to check accurately without fetching methods again, 
            // but we can look at the payments list in comanda
            return p.method !== 'fiado'; // Fallback
          })
          .reduce((acc, p) => acc + p.amount, 0);

        // Sum of debts being deleted
        const totalDebtsAmount = clientDebtDocs.docs.reduce((acc, d) => acc + d.data().amount, 0);
        const totalDebtsPaidAmount = debtPayments.docs.reduce((acc, d) => acc + d.data().amount, 0);
        // Note: remaining debts = totalDebtsAmount - totalDebtsPaidAmount (already handled by balance increment in payDebt?)
        // Actually when we reopen, we are deleting the debts entirely.
        // So we must revert whatever total_em_aberto contribution they had (which is their current remainingAmount)
        const currentOpenAmountFromThisComanda = clientDebtDocs.docs.reduce((acc, d) => acc + d.data().remainingAmount, 0);

        if (clientSnap?.exists()) {
          transaction.update(clientRef!, {
            total_gasto: increment(-comanda.totalAmount),
            totalSpent: increment(-comanda.totalAmount), // Legacy
            saldo_atual: increment(comanda.totalAmount - cashPaidOnComanda), // Revert spending but NOT the cash paid
            balance: increment(comanda.totalAmount - cashPaidOnComanda), // Legacy
            total_pago: increment(-cashPaidOnComanda),
            totalPaid: increment(-cashPaidOnComanda), // Legacy
            total_em_aberto: increment(-currentOpenAmountFromThisComanda),
            appointmentsCount: increment(-1),
            updatedAt: serverTimestamp()
          });
        }
      }

      // Appointment
      linkedAppointments.docs.forEach((docSnap) => {
        if (docSnap.data().status !== 'em_atendimento') {
          transaction.update(docSnap.ref, {
            status: 'em_atendimento',
            updatedAt: serverTimestamp()
          });
        }
      });

      if (appointmentRef) {
        transaction.update(appointmentRef, {
          status: 'em_atendimento',
          updatedAt: serverTimestamp()
        });
      }

      // Comanda Update
      const reopenLog = {
        userId,
        userName,
        date: new Date().toISOString(),
        reason,
        previousStatus: comanda.status
      };

      const systemLog = {
        userId,
        userName,
        date: new Date().toISOString(),
        action: 'Comanda reaberta',
        details: reason
      };

      transaction.update(docRef, {
        status: 'aguardando_pagamento',
        closedAt: null,
        paidAmount: 0,
        pendingAmount: comanda.totalAmount,
        payments: [],
        reopenHistory: [...(comanda.reopenHistory || []), reopenLog],
        logs: [...(comanda.logs || []), systemLog],
        updatedAt: serverTimestamp()
      });
    });
  }
};
