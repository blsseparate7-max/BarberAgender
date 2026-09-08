
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp,
  startAt,
  endAt,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment, FinancialTransaction, Commission, UserProfile } from '../types';
import { getActiveTenantId } from './tenantService';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { cashService } from './cashService';

// Helper to safely execute a query with date range, falling back to tenant-only query if composite index is missing
async function safeTenantDateDocs(collectionName: string, activeTenantId: string, startStr?: string, endStr?: string, extraConstraints: any[] = []) {
  if (!activeTenantId) return [];

  // If single date, we can do equality query which doesn't need a composite index
  if (startStr && endStr && startStr === endStr) {
    try {
      const snap = await getDocs(query(
        collection(db, collectionName),
        where('tenantId', '==', activeTenantId),
        where('date', '==', startStr),
        ...extraConstraints
      ));
      return snap.docs;
    } catch (err: any) {
      console.warn(`[safeTenantDateDocs] Single date query error for ${collectionName}:`, err?.message || err);
    }
  }

  // Try composite index range query first
  if (startStr && endStr) {
    try {
      const snap = await getDocs(query(
        collection(db, collectionName),
        where('tenantId', '==', activeTenantId),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        ...extraConstraints
      ));
      return snap.docs;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('requires an index') || msg.includes('failed-precondition') || msg.includes('INDEX_REQUISITE')) {
        console.warn(`[safeTenantDateDocs] Firestore composite index missing for ${collectionName} (tenantId + date). Falling back to client-side date filtering.`);
      } else {
        console.error(`Dashboard Query Error [${collectionName}]:`, err);
      }
    }
  }

  // Fallback: Query by tenantId (and extra constraints if any) then filter in-memory
  try {
    const snap = await getDocs(query(
      collection(db, collectionName),
      where('tenantId', '==', activeTenantId),
      ...extraConstraints
    ));
    if (startStr || endStr) {
      return snap.docs.filter(doc => {
        const data = doc.data();
        const d = data.date || (data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toISOString().split('T')[0] : '');
        if (startStr && d && d < startStr) return false;
        if (endStr && d && d > endStr) return false;
        return true;
      });
    }
    return snap.docs;
  } catch (fallbackErr) {
    console.error(`Dashboard Fallback Query Error [${collectionName}]:`, fallbackErr);
    return [];
  }
}

export const dashboardService = {
  async getAdminStats(startDate: Date, endDate: Date) {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

    const activeTenantId = getActiveTenantId();

    // Run independent queries in parallel with strict tenant and status/date bounds
    const [
      appointmentDocs,
      financialDocs,
      commissionDocs,
      openCash,
      comandasSnap,
      productsSnap,
      debtsSnap
    ] = await Promise.all([
      safeTenantDateDocs('appointments', activeTenantId, startStr, endStr),
      safeTenantDateDocs('financial_transactions', activeTenantId, startStr, endStr),
      safeTenantDateDocs('commissions', activeTenantId, startStr, endStr),
      cashService.getCurrentCash().catch(err => {
        console.error("Dashboard Query Error [cash_sessions]:", err);
        return null;
      }),
      getDocs(
        query(
          collection(db, 'comandas'),
          where('tenantId', '==', activeTenantId),
          where('status', 'in', ['aberta', 'aguardando_pagamento'])
        )
      ).catch(err => {
        console.error("Dashboard Query Error [comandas]:", err);
        return { docs: [] };
      }),
      getDocs(
        query(
          collection(db, 'products'),
          where('tenantId', '==', activeTenantId),
          where('status', '==', 'active')
        )
      ).catch(err => {
        console.error("Dashboard Query Error [products]:", err);
        return { docs: [] };
      }),
      getDocs(
        query(
          collection(db, 'client_debts'),
          where('tenantId', '==', activeTenantId),
          where('status', 'in', ['pendente', 'parcial', 'vencido'])
        )
      ).catch(err => {
        console.error("Dashboard Query Error [client_debts]:", err);
        return { docs: [] };
      })
    ]);

    const appointmentsSnap = { docs: appointmentDocs };
    const financialSnap = { docs: financialDocs };
    const commissionsSnap = { docs: commissionDocs };

    const appointments: Appointment[] = appointmentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.tenantId === activeTenantId);
    const completedAppointments = appointments.filter(a => a.status === 'concluído');

    const transactions: FinancialTransaction[] = financialSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction))
      .filter(t => t.tenantId === activeTenantId);

    const commissions: Commission[] = commissionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Commission))
      .filter(c => c.tenantId === activeTenantId);

    // Daily vs Monthly Stats
    const dailyRevenue = transactions
      .filter(t => t.date === todayStr && t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);
      
    const monthlyRevenue = transactions
      .filter(t => t.date >= monthStartStr && t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    const dailyAppointments = appointments.filter(a => a.date === todayStr).length;
    const monthlyAppointments = appointments.filter(a => a.date >= monthStartStr).length;

    const cashStatus = openCash ? 'open' : 'closed';

    const activeComandasCount = (comandasSnap.docs as any[])
      .map(doc => (typeof doc.data === 'function' ? doc.data() : doc))
      .filter(c => c.status !== 'fechada' && c.status !== 'cancelada').length;

    const lowStockCount = (productsSnap.docs as any[]).filter(d => {
      const p = typeof d.data === 'function' ? d.data() : d;
      return p.currentStock <= p.minStock && p.status === 'active';
    }).length;

    const debtsDocs = (debtsSnap.docs as any[])
      .map(d => (typeof d.data === 'function' ? d.data() : d))
      .filter((d: any) => ['pendente', 'parcial', 'vencido'].includes(d.status));
    const totalDebts = debtsDocs.reduce((acc: number, d: any) => acc + (d?.remainingAmount || 0), 0);
    const debtorClientsCount = new Set(debtsDocs.map((d: any) => d?.cliente_id)).size;

    // Calculations
    const totalRevenue = transactions
      .filter(t => t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);
      
    const totalExpenses = transactions
      .filter(t => t.type === 'expense' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    const pendingFiado = totalDebts;

    const totalCommissions = commissions.reduce((acc, c) => acc + c.commission_value, 0);
    const pendingCommissions = commissions.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.commission_value, 0);

    const ticketMedio = completedAppointments.length > 0 
      ? totalRevenue / completedAppointments.length 
      : 0;
    
    const uniqueClientsCount = new Set(appointments.map(a => a.cliente_id)).size;

    // Chart Data (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      const dStr = format(d, 'yyyy-MM-dd');
      const rev = transactions
        .filter(t => t.date === dStr && t.type === 'income' && t.status === 'pago')
        .reduce((acc, t) => acc + t.amount, 0);
      return { name: format(d, 'dd/MM'), revenue: rev };
    });

    // Top Services
    const serviceMap: Record<string, { count: number, revenue: number }> = {};
    completedAppointments.forEach(a => {
      if (!serviceMap[a.servico_name]) serviceMap[a.servico_name] = { count: 0, revenue: 0 };
      serviceMap[a.servico_name].count++;
      serviceMap[a.servico_name].revenue += a.price;
    });
    const topServices = Object.entries(serviceMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top Barbers
    const barberMap: Record<string, { count: number, revenue: number }> = {};
    completedAppointments.forEach(a => {
      if (!barberMap[a.profissional_name]) barberMap[a.profissional_name] = { count: 0, revenue: 0 };
      barberMap[a.profissional_name].count++;
      barberMap[a.profissional_name].revenue += a.price;
    });
    const topBarbers = Object.entries(barberMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      revenue: totalRevenue,
      expenses: totalExpenses,
      balance: totalRevenue - totalExpenses,
      pendingFiado,
      debtorClientsCount,
      totalCommissions,
      pendingCommissions,
      appointmentsCount: appointments.length,
      completedCount: completedAppointments.length,
      activeComandasCount,
      lowStockCount,
      totalClients: uniqueClientsCount,
      ticketMedio,
      topServices,
      topBarbers,
      dailyRevenue,
      monthlyRevenue,
      dailyAppointments,
      monthlyAppointments,
      cashStatus,
      chartData: last7Days,
      allAppointments: appointments,
      allTransactions: transactions,
      recentAppointments: appointments
        .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
        .slice(0, 5)
    };
  },

  async getBarberStats(profissional_id: string, startDate: Date, endDate: Date) {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    const activeTenantId = getActiveTenantId();

    const [appointmentDocs, commissionDocs] = await Promise.all([
      safeTenantDateDocs('appointments', activeTenantId, startStr, endStr, [where('profissional_id', '==', profissional_id)]),
      safeTenantDateDocs('commissions', activeTenantId, startStr, endStr, [where('profissional_id', '==', profissional_id)])
    ]);

    const appointmentsSnap = { docs: appointmentDocs };
    const commissionsSnap = { docs: commissionDocs };

    const appointments = appointmentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.date >= startStr && a.date <= endStr);
    const completed = appointments.filter(a => a.status === 'concluído');

    const commissions = commissionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Commission))
      .filter(c => c.date >= startStr && c.date <= endStr);

    const production = completed.reduce((acc, a) => acc + a.price, 0);
    const commissionTotal = commissions.reduce((acc, c) => acc + c.commission_value, 0);
    const commissionPending = commissions.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.commission_value, 0);

    return {
      production,
      commissionTotal,
      commissionPending,
      appointmentsCount: appointments.length,
      completedCount: completed.length,
      nextAppointments: appointments
        .filter(a => a.status === 'confirmado' || a.status === 'agendado' || a.status === 'em_atendimento')
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 5)
    };
  },

  async getClientStats(cliente_id: string) {
    const activeTenantId = getActiveTenantId();
    const userRef = doc(db, 'usuarios', cliente_id);
    const pointsDocId = `${activeTenantId}_${cliente_id}`;
    const pointsRef = doc(db, 'loyalty_points', pointsDocId);

    const [userSnap, appointmentsSnap, pointsSnap, subsSnap] = await Promise.all([
      getDoc(userRef),
      getDocs(
        query(
          collection(db, 'appointments'),
          where('tenantId', '==', activeTenantId),
          where('cliente_id', '==', cliente_id)
        )
      ),
      getDoc(pointsRef),
      getDocs(
        query(
          collection(db, 'subscriptions'),
          where('tenantId', '==', activeTenantId),
          where('cliente_id', '==', cliente_id)
        )
      )
    ]);

    const userData = userSnap.exists() ? userSnap.data() : null;
    const appointments = appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
    
    // Sort in memory by date desc, then by startTime desc
    appointments.sort((a, b) => {
      const dateCompare = (b.date || '').localeCompare(a.date || '');
      if (dateCompare !== 0) return dateCompare;
      return (b.startTime || '').localeCompare(a.startTime || '');
    });
    
    const completed = appointments.filter(a => a.status === 'concluído');
    const upcoming = appointments.filter(a => a.status === 'confirmado' || a.status === 'agendado' || a.status === 'em_atendimento');

    // Favorite Barber
    const barberCounts: Record<string, number> = {};
    completed.forEach(a => {
      barberCounts[a.profissional_name] = (barberCounts[a.profissional_name] || 0) + 1;
    });
    const favoriteBarber = Object.entries(barberCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Nenhum';

    const pointsData = pointsSnap.exists() ? pointsSnap.data() : { points: 0, cashback: 0 };
    const subscriptionsList = subsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

    return {
      totalCuts: completed.length,
      lastCut: completed[0]?.date || 'Nunca',
      favoriteBarber,
      upcoming: upcoming.slice(0, 3),
      history: completed.slice(0, 5),
      balance: userData?.saldo_atual ?? userData?.balance ?? 0,
      debt: userData?.total_em_aberto ?? userData?.debt ?? 0,
      points: pointsData?.points ?? 0,
      cashback: pointsData?.cashback ?? 0,
      subscriptions: subscriptionsList
    };
  }
};
