import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  increment,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { SubscriptionPlan, Subscription, SubscriptionUsage, SubscriptionStatus } from '../types';
import { format, addMonths } from 'date-fns';
import { getActiveTenantId } from './tenantService';

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
      q = query(q, where('cliente_id', '==', cliente_id));
    }
    const querySnapshot = await getDocs(q);
    const subscriptions = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subscription));
    return subscriptions.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
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
        lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
        discounts: plan.discounts || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(subscriptionRef, subscriptionData);

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
        lastRenewalDate: format(startDate, 'yyyy-MM-dd'),
        discounts: plan.discounts || [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      transaction.set(subscriptionRef, subscriptionData);
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

  // Usage
  async registerUsage(
    subscriptionId: string, 
    type: 'haircut' | 'beard', 
    agendamento_id?: string,
    profissional_id?: string,
    profissional_name?: string,
    valor_servico?: number
  ) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const subRef = doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId);
      const subSnap = await transaction.get(subRef);
      
      if (!subSnap.exists()) throw new Error("Assinatura não encontrada");
      const sub = subSnap.data() as Subscription;

      const planRef = doc(db, PLANS_COLLECTION, sub.plano_id);
      const planSnap = await transaction.get(planRef);
      if (!planSnap.exists()) throw new Error("Plano não encontrado");
      const plan = planSnap.data() as SubscriptionPlan;

      // Check limits
      const isUnlimitedCuts = !plan.haircutsPerMonth || plan.haircutsPerMonth >= 999 || plan.haircutsPerMonth === 0;
      const isUnlimitedBeards = !plan.beardsPerMonth || plan.beardsPerMonth >= 999 || plan.beardsPerMonth === 0;

      if (!isUnlimitedCuts && type === 'haircut' && sub.haircutsUsed >= plan.haircutsPerMonth) {
        throw new Error("Limite de cortes mensais atingido");
      }
      if (!isUnlimitedBeards && type === 'beard' && sub.beardsUsed >= plan.beardsPerMonth) {
        throw new Error("Limite de barbas mensais atingido");
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
        createdAt: serverTimestamp()
      });

      // Update counters
      transaction.update(subRef, {
        haircutsUsed: type === 'haircut' ? increment(1) : sub.haircutsUsed,
        beardsUsed: type === 'beard' ? increment(1) : sub.beardsUsed,
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
    return await runTransaction(db, async (transaction) => {
      const subRef = doc(db, SUBSCRIPTIONS_COLLECTION, id);
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists()) throw new Error("Assinatura não encontrada");
      const sub = subSnap.data() as Subscription;

      const planRef = doc(db, PLANS_COLLECTION, sub.plano_id);
      const planSnap = await transaction.get(planRef);
      if (!planSnap.exists()) throw new Error("Plano do assinante não encontrado");
      const plan = planSnap.data() as SubscriptionPlan;

      const today = new Date();
      const currentEndDate = new Date(sub.endDate + 'T12:00:00');
      
      let baseDate = today;
      if (currentEndDate > today) {
        baseDate = currentEndDate;
      }
      
      const newEndDate = addMonths(baseDate, 1);

      // Update subscription
      transaction.update(subRef, {
        endDate: format(newEndDate, 'yyyy-MM-dd'),
        status: 'active',
        haircutsUsed: 0,
        beardsUsed: 0,
        lastRenewalDate: format(today, 'yyyy-MM-dd'),
        updatedAt: serverTimestamp()
      });

      // Create renewal financial transaction
      const financialRef = doc(collection(db, 'financial_transactions'));
      transaction.set(financialRef, {
        tenantId: activeTenantId,
        type: 'income',
        amount: plan.price,
        date: format(today, 'yyyy-MM-dd'),
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
        settlement_date: format(today, 'yyyy-MM-dd'),
        is_settled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return format(newEndDate, 'yyyy-MM-dd');
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
  }
};
