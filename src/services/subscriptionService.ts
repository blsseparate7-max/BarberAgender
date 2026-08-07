import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { SubscriptionPlan, Subscription, SubscriptionUsage, SubscriptionStatus } from '../types';
import { format, addMonths } from 'date-fns';
import { getActiveTenantId } from './tenantService';
import { cashService } from './cashService';

const PLANS_COLLECTION = 'subscription_plans';
const SUBSCRIPTIONS_COLLECTION = 'subscriptions';
const USAGE_COLLECTION = 'subscription_usage';

export const subscriptionService = {
  // Plans
  async getPlans() {
    const q = query(collection(db, PLANS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const plans = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionPlan));
    return plans.sort((a, b) => (a.price || 0) - (b.price || 0));
  },

  async createPlan(plan: Omit<SubscriptionPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, PLANS_COLLECTION), {
      ...plan,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updatePlan(id: string, data: Partial<SubscriptionPlan>) {
    const docRef = doc(db, PLANS_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
  },

  // Subscriptions
  async getSubscriptions(cliente_id?: string) {
    let q = query(collection(db, SUBSCRIPTIONS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (cliente_id) {
      q = query(collection(db, SUBSCRIPTIONS_COLLECTION), where('cliente_id', '==', cliente_id));
    }
    const querySnapshot = await getDocs(q);
    let subscriptions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subscription));
    if (cliente_id) {
      const activeTenantId = getActiveTenantId();
      subscriptions = subscriptions.filter(s => !s.tenantId || s.tenantId === activeTenantId);
    }
    return subscriptions.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  subscribeToSubscriptions(cliente_id: string, callback: (subs: Subscription[]) => void) {
    let q = query(collection(db, SUBSCRIPTIONS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (cliente_id) {
      q = query(collection(db, SUBSCRIPTIONS_COLLECTION), where('cliente_id', '==', cliente_id));
    }
    return onSnapshot(q, (querySnapshot) => {
      let subscriptions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subscription));
      if (cliente_id) {
        const activeTenantId = getActiveTenantId();
        subscriptions = subscriptions.filter(s => !s.tenantId || s.tenantId === activeTenantId);
      }
      subscriptions.sort((a, b) => {
        const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      callback(subscriptions);
    }, (error) => {
      console.error("Erro no onSnapshot de subscriptions:", error);
    });
  },

  async createSubscription(data: { cliente_id: string; cliente_name: string; plano_id: string; autoRenew: boolean }) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const planRef = doc(db, PLANS_COLLECTION, data.plano_id);
      const planSnap = await transaction.get(planRef);
      
      if (!planSnap.exists()) throw new Error("Plano não encontrado");
      const plan = planSnap.data() as SubscriptionPlan;

      const startDate = new Date();
      const endDate = addMonths(startDate, 1);

      const subscriptionRef = doc(collection(db, SUBSCRIPTIONS_COLLECTION));
      const subscriptionData = {
        tenantId: activeTenantId,
        cliente_id: data.cliente_id,
        cliente_name: data.cliente_name,
        plano_id: data.plano_id,
        planName: plan.name,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        status: 'active',
        autoRenew: data.autoRenew,
        haircutsUsed: 0,
        beardsUsed: 0,
        services: plan.services || [],
        serviceUsages: {},
        lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
        discounts: plan.discounts || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(subscriptionRef, subscriptionData);

      // Also update client in usuarios collection to associate them with this tenant and activate their account
      const clientRef = doc(db, 'usuarios', data.cliente_id);
      transaction.set(clientRef, {
        tenantId: activeTenantId,
        ativo: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Create financial transaction
      const financialRef = doc(collection(db, 'financial_transactions'));
      transaction.set(financialRef, {
        tenantId: activeTenantId,
        type: 'income',
        amount: plan.price,
        date: format(startDate, 'yyyy-MM-dd'),
        category: 'Assinaturas',
        description: `Assinatura: ${plan.name} - ${data.cliente_name}`,
        paymentMethod: 'credito', // Standardized
        status: 'pago',
        cliente_id: data.cliente_id,
        cliente_name: data.cliente_name,
        responsavel_id: data.cliente_id, // Defaulting for subscriptions
        responsavel_name: data.cliente_name,
        net_amount: plan.price,
        fee_amount: 0,
        settlement_date: format(startDate, 'yyyy-MM-dd'),
        is_settled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return subscriptionRef.id;
    });
  },

  async createSubscriptionWithoutFinancial(data: { cliente_id: string; cliente_name: string; plano_id: string; autoRenew: boolean }) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const planRef = doc(db, PLANS_COLLECTION, data.plano_id);
      const planSnap = await transaction.get(planRef);
      
      if (!planSnap.exists()) throw new Error("Plano não encontrado");
      const plan = planSnap.data() as SubscriptionPlan;

      const startDate = new Date();
      const endDate = addMonths(startDate, 1);

      const subscriptionRef = doc(collection(db, SUBSCRIPTIONS_COLLECTION));
      const subscriptionData = {
        tenantId: activeTenantId,
        cliente_id: data.cliente_id,
        cliente_name: data.cliente_name,
        plano_id: data.plano_id,
        planName: plan.name,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        status: 'active',
        autoRenew: data.autoRenew,
        haircutsUsed: 0,
        beardsUsed: 0,
        services: plan.services || [],
        serviceUsages: {},
        lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
        discounts: plan.discounts || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(subscriptionRef, subscriptionData);

      // Also update client in usuarios collection to associate them with this tenant and activate their account
      const clientRef = doc(db, 'usuarios', data.cliente_id);
      transaction.set(clientRef, {
        tenantId: activeTenantId,
        ativo: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      return subscriptionRef.id;
    });
  },

  async updateSubscriptionStatus(id: string, status: SubscriptionStatus) {
    const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp()
    });
  },

  async updateSubscriptionDates(id: string, startDate: string, endDate: string) {
    const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    await updateDoc(docRef, {
      startDate,
      endDate,
      updatedAt: serverTimestamp()
    });
  },

  // Usage
  async registerUsage(
    subscriptionId: string, 
    type: 'haircut' | 'beard' | string, 
    agendamento_id?: string,
    profissional_id?: string,
    profissional_name?: string,
    valor_servico?: number,
    service_id?: string,
    service_name?: string
  ) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const subRef = doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId);
      const subSnap = await transaction.get(subRef);
      
      if (!subSnap.exists()) throw new Error("Assinatura não encontrada");
      const sub = subSnap.data() as Subscription;

      if (sub.status !== 'active') {
        throw new Error("Assinatura aguardando pagamento ou inativa. O clube de benefícios somente pode ser utilizado após a confirmação do pagamento (Pix/Boleto).");
      }

      const planRef = doc(db, PLANS_COLLECTION, sub.plano_id);
      const planSnap = await transaction.get(planRef);
      if (!planSnap.exists()) throw new Error("Plano não encontrado");
      const plan = planSnap.data() as SubscriptionPlan;

      // Check limits
      if (plan.services && plan.services.length > 0) {
        if (service_id) {
          const planService = plan.services.find(ps => ps.serviceId === service_id);
          if (planService && !planService.isUnlimited) {
            const currentUsed = (sub.serviceUsages && sub.serviceUsages[service_id]) || 0;
            if (currentUsed >= planService.limit) {
              throw new Error(`Limite mensal do serviço "${planService.name}" atingido`);
            }
          }
        }
      } else {
        // Legacy check limits fallback
        const isUnlimitedCuts = !plan.haircutsPerMonth || plan.haircutsPerMonth >= 999 || plan.haircutsPerMonth === 0;
        const isUnlimitedBeards = !plan.beardsPerMonth || plan.beardsPerMonth >= 999 || plan.beardsPerMonth === 0;

        if (!isUnlimitedCuts && type === 'haircut' && sub.haircutsUsed >= plan.haircutsPerMonth) {
          throw new Error("Limite de cortes mensais atingido");
        }
        if (!isUnlimitedBeards && type === 'beard' && sub.beardsUsed >= plan.beardsPerMonth) {
          throw new Error("Limite de barbas mensais atingido");
        }
      }

      // Register usage
      const usageRef = doc(collection(db, USAGE_COLLECTION));
      transaction.set(usageRef, {
        tenantId: activeTenantId,
        assinatura_id: subscriptionId,
        cliente_id: sub.cliente_id,
        cliente_name: sub.cliente_name || '',
        plano_id: sub.plano_id,
        plano_name: sub.planName || plan.name || '',
        type,
        date: format(new Date(), 'yyyy-MM-dd'),
        agendamento_id: agendamento_id || null,
        profissional_id: profissional_id || null,
        profissional_name: profissional_name || null,
        valor_servico: valor_servico || 0,
        service_id: service_id || null,
        service_name: service_name || null,
        createdAt: serverTimestamp()
      });

      // Update counters
      const updatedServiceUsages = { ...(sub.serviceUsages || {}) };
      if (service_id) {
        updatedServiceUsages[service_id] = (updatedServiceUsages[service_id] || 0) + 1;
      }

      transaction.update(subRef, {
        haircutsUsed: type === 'haircut' ? increment(1) : sub.haircutsUsed,
        beardsUsed: type === 'beard' ? increment(1) : sub.beardsUsed,
        serviceUsages: updatedServiceUsages,
        updatedAt: serverTimestamp()
      });

      return usageRef.id;
    });
  },

  async getUsageHistory(subscriptionId: string) {
    const q = query(
      collection(db, USAGE_COLLECTION), 
      where('tenantId', '==', getActiveTenantId()),
      where('assinatura_id', '==', subscriptionId)
    );
    const querySnapshot = await getDocs(q);
    const usage = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionUsage));
    return usage.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async getAllUsageHistory() {
    const q = query(
      collection(db, USAGE_COLLECTION), 
      where('tenantId', '==', getActiveTenantId())
    );
    const querySnapshot = await getDocs(q);
    const usage = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    return usage.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async getAllSubscriptionsSystem() {
    const q = query(collection(db, SUBSCRIPTIONS_COLLECTION));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subscription));
  },

  async renewSubscription(id: string) {
    const activeTenantId = getActiveTenantId();
    
    // Fetch subscription first
    const subRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    const subSnap = await getDoc(subRef);
    if (!subSnap.exists()) throw new Error("Assinatura não encontrada");
    const sub = subSnap.data() as Subscription;

    const planRef = doc(db, PLANS_COLLECTION, sub.plano_id);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) throw new Error("Plano do assinante não encontrado");
    const plan = planSnap.data() as SubscriptionPlan;

    // Fetch usages
    const usagesQuery = query(
      collection(db, USAGE_COLLECTION),
      where('tenantId', '==', activeTenantId),
      where('assinatura_id', '==', id)
    );
    const usagesSnap = await getDocs(usagesQuery);
    const allUsages = usagesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Filter cycle usages (falling inside sub.startDate and sub.endDate)
    const cycleUsages = allUsages.filter((u: any) => {
      if (!u.date) return false;
      return u.date >= sub.startDate && u.date <= sub.endDate;
    });

    // Calculate commissions for this completed cycle
    const commissionsToCreate: Array<{
      profissional_id: string;
      profissional_name: string;
      commission_value: number;
      commission_percentage: number;
    }> = [];

    if (cycleUsages.length > 0) {
      const planType = (plan as any).comissao_tipo || 'fixo';
      const poolPct = (plan as any).comissao_pool_porcentagem ?? 50;
      const planPool = plan.price * (poolPct / 100);

      // Group usages by professional
      const usagesByBarber: Record<string, { name: string; usages: any[] }> = {};
      cycleUsages.forEach((u: any) => {
        if (!u.profissional_id) return;
        if (!usagesByBarber[u.profissional_id]) {
          usagesByBarber[u.profissional_id] = {
            name: u.profissional_name || 'Profissional',
            usages: []
          };
        }
        usagesByBarber[u.profissional_id].usages.push(u);
      });

      if (planType === 'fixo') {
        const fixedVal = (plan as any).comissao_fixa_valor ?? 10.00;
        Object.entries(usagesByBarber).forEach(([barberId, data]) => {
          commissionsToCreate.push({
            profissional_id: barberId,
            profissional_name: data.name,
            commission_value: data.usages.length * fixedVal,
            commission_percentage: 100
          });
        });
      } else if (planType === 'pool_atendimentos') {
        Object.entries(usagesByBarber).forEach(([barberId, data]) => {
          const pctOfUsage = data.usages.length / cycleUsages.length;
          commissionsToCreate.push({
            profissional_id: barberId,
            profissional_name: data.name,
            commission_value: Number((planPool * pctOfUsage).toFixed(2)),
            commission_percentage: Number((poolPct * pctOfUsage).toFixed(2))
          });
        });
      } else if (planType === 'pool_pontos') {
        const wCorte = (plan as any).pontos_corte ?? 1;
        const wBarba = (plan as any).pontos_barba ?? 1;
        const wOutro = (plan as any).pontos_outros ?? 0.5;

        const getUsagePoints = (u: any) => {
          const customPoints = (plan as any).pontos_servicos;
          if (customPoints && u.service_id && typeof customPoints[u.service_id] === 'number') {
            return customPoints[u.service_id];
          }
          if (u.type === 'haircut') return wCorte;
          if (u.type === 'beard') return wBarba;
          return wOutro;
        };

        const totalPoints = cycleUsages.reduce((sum, u) => sum + getUsagePoints(u), 0);

        if (totalPoints > 0) {
          Object.entries(usagesByBarber).forEach(([barberId, data]) => {
            const barberPoints = data.usages.reduce((sum, u) => sum + getUsagePoints(u), 0);
            const pctOfPoints = barberPoints / totalPoints;
            commissionsToCreate.push({
              profissional_id: barberId,
              profissional_name: data.name,
              commission_value: Number((planPool * pctOfPoints).toFixed(2)),
              commission_percentage: Number((poolPct * pctOfPoints).toFixed(2))
            });
          });
        }
      }
    }

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentEndDate = new Date(sub.endDate + 'T12:00:00');
    
    let newStartDateStr = sub.endDate;
    if (currentEndDate < today) {
      newStartDateStr = todayStr;
    }
    const newStartDate = new Date(newStartDateStr + 'T12:00:00');
    const newEndDate = addMonths(newStartDate, 1);
    const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');

    return await runTransaction(db, async (transaction) => {
      // Update subscription
      transaction.update(subRef, {
        startDate: newStartDateStr,
        endDate: newEndDateStr,
        status: 'active',
        haircutsUsed: 0,
        beardsUsed: 0,
        serviceUsages: {},
        lastRenewalDate: todayStr,
        updatedAt: serverTimestamp()
      });

      // Create renewal financial transaction
      const financialRef = doc(collection(db, 'financial_transactions'));
      transaction.set(financialRef, {
        tenantId: activeTenantId,
        type: 'income',
        amount: plan.price,
        date: todayStr,
        category: 'Assinaturas',
        description: `Renovação de Assinatura: ${plan.name} - ${sub.cliente_name}`,
        paymentMethod: 'credito',
        status: 'pago',
        cliente_id: sub.cliente_id,
        cliente_name: sub.cliente_name,
        responsavel_id: sub.cliente_id,
        responsavel_name: sub.cliente_name,
        net_amount: plan.price,
        fee_amount: 0,
        settlement_date: todayStr,
        is_settled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Insert calculated commissions
      commissionsToCreate.forEach((comm) => {
        const commRef = doc(collection(db, 'commissions'));
        transaction.set(commRef, {
          tenantId: activeTenantId,
          profissional_id: comm.profissional_id,
          profissional_name: comm.profissional_name,
          servico_name: `Rateio Assinatura: ${plan.name} (Ciclo ${sub.startDate} a ${sub.endDate})`,
          base_value: plan.price,
          commission_percentage: comm.commission_percentage,
          commission_value: comm.commission_value,
          status: 'pendente',
          commission_type: 'assinatura',
          date: sub.endDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      return newEndDateStr;
    });
  },

  async createAsaasSubscription(data: { 
    cliente_id: string; 
    cliente_name: string; 
    plano_id: string;
    ownerEmail?: string;
    ownerCpfCnpj?: string;
    billingType?: 'PIX' | 'CREDIT_CARD';
  }) {
    const activeTenantId = getActiveTenantId();
    
    const planRef = doc(db, PLANS_COLLECTION, data.plano_id);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) throw new Error("Plano não encontrado");
    const plan = planSnap.data() as SubscriptionPlan;

    const startDate = new Date();
    const endDate = addMonths(startDate, 1);

    const subscriptionRef = doc(collection(db, SUBSCRIPTIONS_COLLECTION));
    const subId = subscriptionRef.id;

    let asaasInvoiceId = 'pay_' + Math.random().toString(36).substring(2, 9);
    let paymentUrl = '';
    let pixCopiaECola = '';
    let pixQrCodeUrl = '';

    // Try creating real Asaas charge/subscription
    try {
      const chargeRes = await fetch('/api/saas/payment/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: activeTenantId,
          tenantName: data.cliente_name,
          ownerEmail: data.ownerEmail || `${data.cliente_id}@barbearia.com`,
          ownerCpfCnpj: data.ownerCpfCnpj || '12345678909',
          planId: data.plano_id,
          planName: plan.name,
          amount: plan.price,
          billingType: data.billingType || 'PIX',
          isSubscription: true,
          externalReference: subId
        })
      });
      const chargeData = await chargeRes.json();
      if (chargeData.success) {
        if (chargeData.chargeId) asaasInvoiceId = chargeData.chargeId;
        paymentUrl = chargeData.paymentUrl || '';
        pixCopiaECola = chargeData.pixCopiaECola || '';
        pixQrCodeUrl = chargeData.pixQrCodeUrl || '';
      } else if (chargeData.error) {
        console.warn("Aviso ao criar cobrança Asaas:", chargeData.error);
      }
    } catch (e: any) {
      console.warn("Erro de conexão ao gerar cobrança Asaas:", e);
    }

    const subscriptionData = {
      tenantId: activeTenantId,
      cliente_id: data.cliente_id,
      cliente_name: data.cliente_name,
      plano_id: data.plano_id,
      planName: plan.name,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      status: 'pending',
      autoRenew: true,
      haircutsUsed: 0,
      beardsUsed: 0,
      lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
      discounts: plan.discounts || [],
      activationType: 'asaas',
      asaasPaymentStatus: 'pending',
      asaasInvoiceId,
      paymentUrl,
      pixCopiaECola,
      pixQrCodeUrl,
      billingType: data.billingType || 'PIX',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(subscriptionRef, subscriptionData);
    return { id: subId, paymentUrl, pixCopiaECola, pixQrCodeUrl };
  },

  async confirmAsaasSubscriptionPayment(id: string) {
    const activeTenantId = getActiveTenantId();
    
    const subRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    const subSnap = await getDoc(subRef);
    if (!subSnap.exists()) throw new Error("Assinatura não encontrada");
    const sub = subSnap.data() as Subscription;

    const planRef = doc(db, PLANS_COLLECTION, sub.plano_id);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) throw new Error("Plano não encontrado");
    const plan = planSnap.data() as SubscriptionPlan;

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentEndDate = sub.endDate ? new Date(sub.endDate + 'T12:00:00') : today;
    
    let newStartDateStr = sub.endDate || todayStr;
    if (!sub.endDate || currentEndDate < today) {
      newStartDateStr = todayStr;
    }
    const newStartDate = new Date(newStartDateStr + 'T12:00:00');
    const newEndDate = addMonths(newStartDate, 1);
    const newEndDateStr = format(newEndDate, 'yyyy-MM-dd');

    return await runTransaction(db, async (transaction) => {
      transaction.update(subRef, {
        status: 'active',
        asaasPaymentStatus: 'received',
        startDate: newStartDateStr,
        endDate: newEndDateStr,
        haircutsUsed: 0,
        beardsUsed: 0,
        serviceUsages: {},
        lastRenewalDate: todayStr,
        updatedAt: serverTimestamp()
      });

      // Create financial transaction
      const financialRef = doc(collection(db, 'financial_transactions'));
      transaction.set(financialRef, {
        tenantId: activeTenantId,
        type: 'income',
        amount: plan.price,
        date: format(new Date(), 'yyyy-MM-dd'),
        category: 'Assinaturas',
        description: `Assinatura Rull Confirmada: ${plan.name} - ${sub.cliente_name}`,
        paymentMethod: 'pix',
        status: 'pago',
        cliente_id: sub.cliente_id,
        cliente_name: sub.cliente_name,
        responsavel_id: sub.cliente_id,
        responsavel_name: sub.cliente_name,
        net_amount: plan.price,
        fee_amount: 0.99,
        settlement_date: format(new Date(), 'yyyy-MM-dd'),
        is_settled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }).then(async () => {
      // Check if open cash session exists and record cash movement
      try {
        const activeCash = await cashService.getCurrentCash();
        if (activeCash && activeCash.id) {
          await cashService.addMovement({
            caixa_id: activeCash.id,
            type: 'income',
            category: 'Assinaturas',
            description: `Assinatura Rull: ${plan.name} - ${sub.cliente_name}`,
            amount: plan.price,
            paymentMethod: 'pix',
            is_receivable: false,
            usuario_id: 'system',
            usuario_name: 'Webhook Asaas',
            date: todayStr
          });
        }
      } catch (cashErr) {
        console.warn("Nenhum caixa aberto para registrar o movimento de assinatura, ignorando:", cashErr);
      }
    });
  },

  async processReactiveRenewals() {
    const activeTenantId = getActiveTenantId();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    // Query active subscriptions of the current tenant
    const q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('tenantId', '==', activeTenantId),
      where('status', '==', 'active')
    );
    
    const querySnapshot = await getDocs(q);
    const results = { renewed: 0, expired: 0 };
    
    for (const d of querySnapshot.docs) {
      const sub = d.data() as Subscription;
      if (sub.endDate < todayStr) {
        // Expiration date has passed!
        if (sub.autoRenew) {
          try {
            // Trigger automatic renewal!
            await this.renewSubscription(d.id);
            results.renewed++;
          } catch (err) {
            console.error(`Erro ao renovar assinatura automática ${d.id}:`, err);
          }
        } else {
          try {
            // Mark as expired
            await updateDoc(doc(db, SUBSCRIPTIONS_COLLECTION, d.id), {
              status: 'expired',
              updatedAt: serverTimestamp()
            });
            results.expired++;
          } catch (err) {
            console.error(`Erro ao marcar assinatura como expirada ${d.id}:`, err);
          }
        }
      }
    }
    
    return results;
  },

  async deleteSubscription(id: string) {
    const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async toggleAutoRenew(id: string, autoRenew: boolean) {
    const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
    await updateDoc(docRef, {
      autoRenew,
      updatedAt: serverTimestamp()
    });
  },

  async checkAsaasPaymentStatus(paymentId: string) {
    try {
      const res = await fetch('/api/saas/payment/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId })
      });
      return await res.json();
    } catch (e) {
      console.error("Erro ao verificar status do pagamento Asaas:", e);
      return { success: false, error: 'Falha na comunicação' };
    }
  },

  async updateCreditCard(subscriptionId: string, creditCard: any, creditCardHolderInfo: any) {
    try {
      const res = await fetch('/api/saas/payment/update-credit-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId, creditCard, creditCardHolderInfo })
      });
      return await res.json();
    } catch (e) {
      console.error("Erro ao atualizar cartão de crédito:", e);
      return { success: false, error: 'Falha na comunicação' };
    }
  },

  async generatePix(subscriptionId: string) {
    try {
      const res = await fetch('/api/saas/payment/generate-pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId })
      });
      return await res.json();
    } catch (e) {
      console.error("Erro ao gerar PIX alternativo:", e);
      return { success: false, error: 'Falha na comunicação' };
    }
  }
};
