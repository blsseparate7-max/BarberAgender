
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

export const dashboardService = {
  async getAdminStats(startDate: Date, endDate: Date) {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

    const activeTenantId = getActiveTenantId();

    // 1. Fetch Appointments in period
    let appointments: Appointment[] = [];
    try {
      const appointmentsQuery = query(
        collection(db, 'appointments'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const appointmentsSnap = await getDocs(appointmentsQuery);
      appointments = appointmentsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
        .filter(a => a.tenantId === activeTenantId);
    } catch (error) {
      console.error("Dashboard Query Error [appointments]:", error);
      throw error;
    }
    const completedAppointments = appointments.filter(a => a.status === 'concluído');

    // 2. Fetch Financial Transactions in period
    let transactions: FinancialTransaction[] = [];
    try {
      const financialQuery = query(
        collection(db, 'financial_transactions'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const financialSnap = await getDocs(financialQuery);
      transactions = financialSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction))
        .filter(t => t.tenantId === activeTenantId);
    } catch (error) {
      console.error("Dashboard Query Error [financial_transactions]:", error);
      throw error;
    }

    // 3. Fetch Commissions in period
    let commissions: Commission[] = [];
    try {
      const commissionsQuery = query(
        collection(db, 'commissions'),
        where('date', '>=', startStr),
        where('date', '<=', endStr)
      );
      const commissionsSnap = await getDocs(commissionsQuery);
      commissions = commissionsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Commission))
        .filter(c => c.tenantId === activeTenantId);
    } catch (error) {
      console.error("Dashboard Query Error [commissions]:", error);
      throw error;
    }

    // 4. Daily vs Monthly Stats
    const dailyRevenue = transactions
      .filter(t => t.date === todayStr && t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);
      
    const monthlyRevenue = transactions
      .filter(t => t.date >= monthStartStr && t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    const dailyAppointments = appointments.filter(a => a.date === todayStr).length;
    const monthlyAppointments = appointments.filter(a => a.date >= monthStartStr).length;

    // 5. Cash Status
    let openCash = null;
    try {
      openCash = await cashService.getCurrentCash();
    } catch (error) {
      console.error("Dashboard Query Error [cash_sessions]:", error);
      throw error;
    }
    const cashStatus = openCash ? 'open' : 'closed';

    // 6. Active Comandas
    let activeComandasCount = 0;
    try {
      const comandasQuery = query(
        collection(db, 'comandas'),
        where('tenantId', '==', getActiveTenantId())
      );
      const comandasSnap = await getDocs(comandasQuery);
      activeComandasCount = comandasSnap.docs
        .map(doc => doc.data() as any)
        .filter(c => c.status !== 'fechada' && c.status !== 'cancelada').length;
    } catch (error) {
      console.error("Dashboard Query Error [comandas]:", error);
      throw error;
    }

    // 7. Inventory Alerts
    let lowStockCount = 0;
    try {
      const productsSnap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', getActiveTenantId())));
      lowStockCount = productsSnap.docs.filter(d => {
        const p = d.data();
        return p.currentStock <= p.minStock && p.status === 'active';
      }).length;
    } catch (error) {
      console.error("Dashboard Query Error [products]:", error);
      throw error;
    }

    // 8. Clients with debt
    let totalDebts = 0;
    let debtorClientsCount = 0;
    try {
      const debtsSnap = await getDocs(query(collection(db, 'client_debts'), where('tenantId', '==', getActiveTenantId()), where('status', 'in', ['pendente', 'parcial', 'vencido'])));
      totalDebts = debtsSnap.docs.reduce((acc, d) => acc + (d.data().remainingAmount || 0), 0);
      debtorClientsCount = new Set(debtsSnap.docs.map(d => d.data().cliente_id)).size;
    } catch (error) {
      console.error("Dashboard Query Error [client_debts]:", error);
      throw error;
    }

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
      recentAppointments: appointments
        .sort((a, b) => b.startTime.localeCompare(a.startTime))
        .slice(0, 5)
    };
  },

  async getBarberStats(profissional_id: string, startDate: Date, endDate: Date) {
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    const activeTenantId = getActiveTenantId();

    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('tenantId', '==', activeTenantId),
      where('profissional_id', '==', profissional_id),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const appointmentsSnap = await getDocs(appointmentsQuery);
    const appointments = appointmentsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
    const completed = appointments.filter(a => a.status === 'concluído');

    const commissionsQuery = query(
      collection(db, 'commissions'),
      where('tenantId', '==', activeTenantId),
      where('profissional_id', '==', profissional_id),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );
    const commissionsSnap = await getDocs(commissionsQuery);
    const commissions = commissionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Commission));

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
    const userRef = doc(db, 'usuarios', cliente_id);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : null;

    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const appointmentsSnap = await getDocs(appointmentsQuery);
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

    // Fetch loyalty points/cashback
    const activeTenantId = getActiveTenantId();
    const pointsDocId = `${activeTenantId}_${cliente_id}`;
    const pointsRef = doc(db, 'loyalty_points', pointsDocId);
    const pointsSnap = await getDoc(pointsRef);
    const pointsData = pointsSnap.exists() ? pointsSnap.data() : { points: 0, cashback: 0 };

    // Fetch subscriptions
    const subsQuery = query(
      collection(db, 'subscriptions'),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    const subsSnap = await getDocs(subsQuery);
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
