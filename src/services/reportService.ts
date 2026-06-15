
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp,
  startAt,
  endAt
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Appointment, 
  FinancialTransaction, 
  Commission, 
  UserProfile, 
  Comanda, 
  ClientDebt, 
  InventoryMovement, 
  Product,
  DailyCash
} from '../types';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, parseISO, isWithinInterval } from 'date-fns';

export interface ReportFilter {
  startDate: string;
  endDate: string;
  profissional_id?: string;
  cliente_id?: string;
  status?: string;
  paymentMethod?: string;
  servico_id?: string;
}

export const reportService = {
  async getGeneralReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;

    // Fetch transactions
    const financialQuery = query(
      collection(db, 'financial_transactions'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const financialSnap = await getDocs(financialQuery);
    const transactions = financialSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction));

    // Fetch appointments
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const appointmentsSnap = await getDocs(appointmentsQuery);
    const appointments = appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));

    // Fetch comandas
    const comandasQuery = query(
      collection(db, 'comandas'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const comandasSnap = await getDocs(comandasQuery);
    const comandas = comandasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comanda));

    // Calculations
    const grossRevenue = transactions
      .filter(t => t.type === 'income' && t.status === 'pago')
      .reduce((acc, t) => acc + t.amount, 0);

    const totalExpenses = transactions
      .filter(t => t.type === 'expense' || t.type === 'sangria')
      .reduce((acc, t) => acc + t.amount, 0);

    const pendingAmount = comandas
      .filter(c => c.status !== 'fechada' && c.status !== 'cancelada')
      .reduce((acc, c) => acc + c.pendingAmount, 0);

    const completedAppts = appointments.filter(a => a.status === 'concluído');
    const ticketMedio = completedAppts.length > 0 ? grossRevenue / completedAppts.length : 0;

    const uniqueClients = new Set(appointments.map(a => a.cliente_id)).size;

    return {
      grossRevenue,
      totalExpenses,
      netRevenue: grossRevenue - totalExpenses,
      pendingAmount,
      ticketMedio,
      totalAtendimentos: appointments.length,
      completedAtendimentos: completedAppts.length,
      totalClients: uniqueClients,
      totalComandas: comandas.length,
      transactionsCount: transactions.length
    };
  },

  async getAppointmentsReport(filter: ReportFilter) {
    const { startDate, endDate, profissional_id, status } = filter;
    const q = query(
      collection(db, 'appointments'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const snap = await getDocs(q);
    let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));

    if (profissional_id && profissional_id !== 'all') {
      data = data.filter(a => a.profissional_id === profissional_id);
    }
    
    if (status && status !== 'all') {
      data = data.filter(a => a.status === status);
    }

    const stats = {
      total: data.length,
      confirmados: data.filter(a => a.status === 'confirmado').length,
      concluidos: data.filter(a => a.status === 'concluído').length,
      cancelados: data.filter(a => a.status === 'cancelado').length,
      faltas: data.filter(a => a.status === 'faltou').length,
      agendados: data.filter(a => a.status === 'agendado').length,
      recorrentes: data.filter(a => a.origin === 'recorrente').length
    };

    return { data, stats };
  },

  async getClientsReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    
    // Fetch all clients to identify new ones in period
    const clientsSnap = await getDocs(collection(db, 'usuarios'));
    const allUsers = clientsSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as unknown as UserProfile));
    const clients = allUsers.filter(u => u.tipo === 'cliente');

    // Appointments in period
    const apptsQuery = query(
      collection(db, 'appointments'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const apptsSnap = await getDocs(apptsQuery);
    const appts = apptsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.status === 'concluído');

    const newClients = clients.filter(c => {
      const createdDate = c.createdAt?.toDate ? format(c.createdAt.toDate(), 'yyyy-MM-dd') : null;
      return createdDate && createdDate >= startDate && createdDate <= endDate;
    });

    const recurringClientsCount = new Set(appts.map(a => a.cliente_id)).size;
    
    const debtorClients = clients.filter(c => (c.total_em_aberto || 0) > 0);

    return {
      stats: {
        totalClients: clients.length,
        newClients: newClients.length,
        recurringClients: recurringClientsCount,
        debtorClients: debtorClients.length,
        debtTotal: debtorClients.reduce((acc, c) => acc + (c.total_em_aberto || 0), 0)
      },
      debtors: debtorClients.map(c => ({
        uid: c.uid,
        nome: c.nome,
        divida: c.total_em_aberto || 0,
        telefone: c.telefone || c.phone
      }))
    };
  },

  async getProfessionalsReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    
    const apptsSnap = await getDocs(query(
      collection(db, 'appointments'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    ));
    const appts = apptsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.status === 'concluído');

    const commissionsSnap = await getDocs(query(
      collection(db, 'commissions'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    ));
    const commissions = commissionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));

    const profMap: Record<string, any> = {};

    appts.forEach(a => {
      if (!profMap[a.profissional_id]) {
        profMap[a.profissional_id] = {
          id: a.profissional_id,
          nome: a.profissional_name,
          atendimentos: 0,
          producao: 0,
          comissao: 0,
          comissaoPendente: 0
        };
      }
      profMap[a.profissional_id].atendimentos++;
      profMap[a.profissional_id].producao += a.price;
    });

    commissions.forEach(c => {
      if (!profMap[c.profissional_id]) {
        profMap[c.profissional_id] = {
          id: c.profissional_id,
          nome: c.profissional_name,
          atendimentos: 0,
          producao: 0,
          comissao: 0,
          comissaoPendente: 0
        };
      }
      profMap[c.profissional_id].comissao += c.commission_value;
      if (c.status === 'pendente') {
        profMap[c.profissional_id].comissaoPendente += c.commission_value;
      }
    });

    return Object.values(profMap);
  },

  async getInventoryReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    
    const prodSnap = await getDocs(collection(db, 'products'));
    const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    const movementsSnap = await getDocs(query(
      collection(db, 'inventory_movements'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    ));
    const movements = movementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryMovement));

    const stats = {
      totalProducts: products.length,
      lowStockCount: products.filter(p => p.currentStock <= p.minStock).length,
      totalSales: movements.filter(m => m.type === 'venda').length,
      totalConsumption: movements.filter(m => m.type === 'consumo_interno').length
    };

    return { stats, products, movements };
  },

  async getFinanceiroReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    
    const transactionsSnap = await getDocs(query(
      collection(db, 'financial_transactions'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    ));
    const transactions = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction));

    const income = transactions.filter(t => t.type === 'income' && t.status === 'pago').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense' && t.status === 'pago').reduce((acc, t) => acc + t.amount, 0);
    const sangria = transactions.filter(t => t.type === 'sangria').reduce((acc, t) => acc + t.amount, 0);

    const byMethod: Record<string, number> = {};
    transactions.filter(t => t.type === 'income' && t.status === 'pago').forEach(t => {
      byMethod[t.paymentMethod] = (byMethod[t.paymentMethod] || 0) + t.amount;
    });

    return {
      stats: { income, expense, sangria, balance: income - expense - sangria },
      transactions,
      byMethod
    };
  },

  async getComissoesReport(filter: ReportFilter) {
    const { startDate, endDate, profissional_id } = filter;
    
    const q = query(
      collection(db, 'commissions'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const snap = await getDocs(q);
    let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));

    if (profissional_id && profissional_id !== 'all') {
      data = data.filter(c => c.profissional_id === profissional_id);
    }

    const stats = {
      total: data.reduce((acc, c) => acc + c.commission_value, 0),
      pago: data.filter(c => c.status === 'pago').reduce((acc, c) => acc + c.commission_value, 0),
      pendente: data.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.commission_value, 0),
      count: data.length
    };

    return { stats, data };
  },

  async getComandasReport(filter: ReportFilter) {
    const { startDate, endDate, status } = filter;
    
    const q = query(
      collection(db, 'comandas'),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const snap = await getDocs(q);
    let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comanda));

    if (status && status !== 'all') {
      data = data.filter(c => c.status === status);
    }

    const stats = {
      total: data.length,
      abertas: data.filter(c => c.status === 'aberta').length,
      fechadas: data.filter(c => c.status === 'fechada').length,
      nao_pagas: data.filter(c => c.status === 'nao_paga').length,
      parciais: data.filter(c => c.status === 'parcialmente_paga').length,
      totalValor: data.reduce((acc, c) => acc + c.totalAmount, 0),
      totalPago: data.reduce((acc, c) => acc + c.paidAmount, 0)
    };

    return { stats, data };
  }
};
