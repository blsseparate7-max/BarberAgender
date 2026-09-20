import { 
  collection, 
  query, 
  where, 
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';
import { 
  Appointment, 
  FinancialTransaction, 
  Commission, 
  UserProfile, 
  Comanda, 
  InventoryMovement, 
  Product,
  AccountPayable,
  AccountReceivable,
  ClientDebt
} from '../types';
import { format } from 'date-fns';
import { normalizeDate, isDateInRange, calculateStandardFinancialMetrics } from '../utils/financialCalculations';

export interface ReportFilter {
  startDate: string;
  endDate: string;
  profissional_id?: string;
  cliente_id?: string;
  status?: string;
  paymentMethod?: string;
  servico_id?: string;
}

// Helper seguro e robusto para buscar documentos delimitados por data no Firestore
async function safeReportDateDocs(collectionName: string, activeTenantId: string, startDate?: string, endDate?: string, extraConstraints: any[] = []) {
  if (!activeTenantId) return [];

  // Se for data única, consulta por igualdade
  if (startDate && endDate && startDate === endDate) {
    try {
      const snap = await getDocs(query(
        collection(db, collectionName),
        where('tenantId', '==', activeTenantId),
        where('date', '==', startDate),
        ...extraConstraints
      ));
      if (!snap.empty) {
        return snap.docs;
      }
    } catch (err: any) {
      console.warn(`[safeReportDateDocs] Consulta de data única para ${collectionName}:`, err?.message || err);
    }
  }

  // Tenta consulta por intervalo de data
  if (startDate && endDate) {
    try {
      const snap = await getDocs(query(
        collection(db, collectionName),
        where('tenantId', '==', activeTenantId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        ...extraConstraints
      ));
      return snap.docs;
    } catch (err: any) {
      console.warn(`[safeReportDateDocs] Fallback para ${collectionName}:`, err?.message || err);
    }
  }

  // Fallback robusto sem limitação arbitrária que corte movimentações do mês atual
  try {
    const snap = await getDocs(query(
      collection(db, collectionName),
      where('tenantId', '==', activeTenantId),
      ...extraConstraints
    ));
    if (startDate || endDate) {
      return snap.docs.filter(doc => {
        const data = doc.data();
        const d = normalizeDate(data.date || data.dueDate || data.createdAt);
        return isDateInRange(d, startDate, endDate);
      });
    }
    return snap.docs;
  } catch (fallbackErr) {
    console.error(`[safeReportDateDocs] Erro de fallback para ${collectionName}:`, fallbackErr);
    return [];
  }
}

export const reportService = {
  async getGeneralReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    const currentTenantId = getActiveTenantId();

    const [financialDocs, appointmentsDocs, comandasDocs, debtsSnap] = await Promise.all([
      safeReportDateDocs('financial_transactions', currentTenantId, startDate, endDate),
      safeReportDateDocs('appointments', currentTenantId, startDate, endDate),
      safeReportDateDocs('comandas', currentTenantId, startDate, endDate),
      getDocs(query(collection(db, 'client_debts'), where('tenantId', '==', currentTenantId)))
    ]);

    const transactions = financialDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction))
      .filter(t => isDateInRange(t.date || (t as any).createdAt, startDate, endDate));

    const appointments = appointmentsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => isDateInRange(a.date || (a as any).createdAt, startDate, endDate));

    const comandas = comandasDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as Comanda))
      .filter(c => isDateInRange(c.date || (c as any).createdAt, startDate, endDate));

    const debts = debtsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));

    // Cálculos unificados através do padrão consolidado
    const metrics = calculateStandardFinancialMetrics(transactions, debts);

    const pendingAmount = comandas
      .filter(c => c.status !== 'fechada' && c.status !== 'cancelada')
      .reduce((acc, c) => acc + (c.pendingAmount || 0), 0);

    const completedAppts = appointments.filter(a => a.status === 'concluído');
    const ticketMedio = completedAppts.length > 0 ? metrics.totalEntradasBruto / completedAppts.length : 0;

    const uniqueClients = new Set(appointments.map(a => a.cliente_id).filter(Boolean)).size;

    return {
      grossRevenue: metrics.totalEntradasBruto,
      totalExpenses: metrics.totalSaidasPagas,
      netRevenue: metrics.saldoOperacionalLiquido,
      totalEntradasLiquido: metrics.totalEntradasLiquido,
      totalTaxasCartao: metrics.totalTaxasCartao,
      pendingAmount: metrics.fiadosPendentes || pendingAmount,
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
    const currentTenantId = getActiveTenantId();
    
    const docs = await safeReportDateDocs('appointments', currentTenantId, startDate, endDate);
    let data = docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => (!startDate || a.date >= startDate) && (!endDate || a.date <= endDate));

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
    const currentTenantId = getActiveTenantId();
    
    const [clientsSnap, apptsDocs] = await Promise.all([
      getDocs(query(collection(db, 'usuarios'), where('tenantId', '==', currentTenantId), limit(250))),
      safeReportDateDocs('appointments', currentTenantId, startDate, endDate)
    ]);

    const clients = clientsSnap.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as unknown as UserProfile))
      .filter(u => u.tipo === 'cliente');

    const appts = apptsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.status === 'concluído' && (!startDate || a.date >= startDate) && (!endDate || a.date <= endDate));

    const newClients = clients.filter(c => {
      const createdDate = c.createdAt?.toDate ? format(c.createdAt.toDate(), 'yyyy-MM-dd') : null;
      return createdDate && (!startDate || createdDate >= startDate) && (!endDate || createdDate <= endDate);
    });

    const recurringClientsCount = new Set(appts.map(a => a.cliente_id).filter(Boolean)).size;
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
    const currentTenantId = getActiveTenantId();
    
    const [apptsDocs, commissionsDocs] = await Promise.all([
      safeReportDateDocs('appointments', currentTenantId, startDate, endDate),
      safeReportDateDocs('commissions', currentTenantId, startDate, endDate)
    ]);

    const appts = apptsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(a => a.status === 'concluído' && (!startDate || a.date >= startDate) && (!endDate || a.date <= endDate));

    const commissions = commissionsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as Commission))
      .filter(c => (!startDate || c.date >= startDate) && (!endDate || c.date <= endDate));

    const profMap: Record<string, any> = {};

    appts.forEach(a => {
      if (!a.profissional_id) return;
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
      profMap[a.profissional_id].producao += (a.price || 0);
    });

    commissions.forEach(c => {
      const pId = c.profissional_id || (c as any).barbeiro_id;
      if (!pId) return;
      if (!profMap[pId]) {
        profMap[pId] = {
          id: pId,
          nome: c.profissional_name,
          atendimentos: 0,
          producao: 0,
          comissao: 0,
          comissaoPendente: 0
        };
      }
      profMap[pId].comissao += (c.commission_value || 0);
      if (c.status === 'pendente') {
        profMap[pId].comissaoPendente += (c.commission_value || 0);
      }
    });

    return Object.values(profMap);
  },

  async getInventoryReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    const currentTenantId = getActiveTenantId();
    
    const [prodSnap, movementsDocs] = await Promise.all([
      getDocs(query(collection(db, 'products'), where('tenantId', '==', currentTenantId), limit(150))),
      safeReportDateDocs('inventory_movements', currentTenantId, startDate, endDate)
    ]);

    const products = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));

    const movements = movementsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as InventoryMovement))
      .filter(m => (!startDate || m.date >= startDate) && (!endDate || m.date <= endDate));

    const stats = {
      totalProducts: products.length,
      lowStockCount: products.filter(p => (p.currentStock || 0) <= (p.minStock || 0)).length,
      totalSales: movements.filter(m => m.type === 'venda').length,
      totalConsumption: movements.filter(m => m.type === 'consumo_interno').length
    };

    return { stats, products, movements };
  },

  async getFinanceiroReport(filter: ReportFilter) {
    const { startDate, endDate } = filter;
    const currentTenantId = getActiveTenantId();
    
    // 1. Transactions delimitadas por data
    const [transactionsDocs, debtsSnap] = await Promise.all([
      safeReportDateDocs('financial_transactions', currentTenantId, startDate, endDate),
      getDocs(query(collection(db, 'client_debts'), where('tenantId', '==', currentTenantId)))
    ]);

    const transactions = transactionsDocs
      .map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction))
      .filter(t => isDateInRange(t.date || (t as any).createdAt, startDate, endDate));

    const debts = debtsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
    const metrics = calculateStandardFinancialMetrics(transactions, debts);

    const income = metrics.totalEntradasBruto;
    const expense = metrics.totalSaidasPagas;
    const sangria = metrics.totalSangriasRetiradas;

    const byMethod: Record<string, number> = {};
    Object.values(metrics.byMethod).forEach(m => {
      if (m.amount > 0) {
        byMethod[m.label] = m.amount;
      }
    });

    // 2. Accounts Payable
    const payablesSnap = await getDocs(
      query(collection(db, 'accounts_payable'), where('tenantId', '==', currentTenantId))
    );
    const payables = payablesSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as AccountPayable))
      .filter(p => isDateInRange(p.dueDate || (p as any).paymentDate || (p as any).date, startDate, endDate));

    const totalPayablesAmount = payables.reduce((acc, p) => acc + (p.amount || 0), 0);
    const paidPayablesAmount = payables.filter(p => (p.status as string) === 'paid' || (p.status as string) === 'pago').reduce((acc, p) => acc + (p.amount || 0), 0);
    const pendingPayablesAmount = payables.filter(p => (p.status as string) === 'pending' || (p.status as string) === 'pendente').reduce((acc, p) => acc + (p.amount || 0), 0);
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const overduePayablesAmount = payables
      .filter(p => ((p.status as string) === 'pending' || (p.status as string) === 'pendente') && normalizeDate(p.dueDate) < todayStr)
      .reduce((acc, p) => acc + (p.amount || 0), 0);

    const payablesByCategory: Record<string, number> = {};
    const payablesBySupplier: Record<string, number> = {};

    payables.forEach(p => {
      const cat = p.category || 'Outros';
      const supplier = p.supplier || 'Sem Fornecedor';
      payablesByCategory[cat] = (payablesByCategory[cat] || 0) + (p.amount || 0);
      payablesBySupplier[supplier] = (payablesBySupplier[supplier] || 0) + (p.amount || 0);
    });

    // 3. Accounts Receivable
    const receivablesSnap = await getDocs(
      query(collection(db, 'accounts_receivable'), where('tenantId', '==', currentTenantId))
    );
    const receivables = receivablesSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as AccountReceivable))
      .filter(r => isDateInRange(r.dueDate || (r as any).date, startDate, endDate));

    const totalReceivablesAmount = receivables.reduce((acc, r) => acc + (r.amount || 0), 0);
    const paidReceivablesAmount = receivables.filter(r => (r.status as string) === 'paid' || (r.status as string) === 'pago').reduce((acc, r) => acc + (r.amount || 0), 0);
    const pendingReceivablesAmount = receivables.filter(r => (r.status as string) === 'pending' || (r.status as string) === 'pendente').reduce((acc, r) => acc + (r.amount || 0), 0);

    return {
      stats: { 
        income, 
        expense, 
        sangria, 
        balance: metrics.saldoOperacionalLiquido,
        totalPayablesAmount,
        paidPayablesAmount,
        pendingPayablesAmount,
        overduePayablesAmount,
        totalReceivablesAmount,
        paidReceivablesAmount,
        pendingReceivablesAmount
      },
      transactions,
      byMethod,
      payables,
      payablesByCategory,
      payablesBySupplier,
      receivables
    };
  },

  async getComissoesReport(filter: ReportFilter) {
    const { startDate, endDate, profissional_id } = filter;
    const currentTenantId = getActiveTenantId();
    
    const docs = await safeReportDateDocs('commissions', currentTenantId, startDate, endDate);
    let data = docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Commission))
      .filter(c => (!startDate || c.date >= startDate) && (!endDate || c.date <= endDate));

    if (profissional_id && profissional_id !== 'all') {
      data = data.filter(c => c.profissional_id === profissional_id || (c as any).barbeiro_id === profissional_id);
    }

    const stats = {
      total: data.reduce((acc, c) => acc + (c.commission_value || 0), 0),
      pago: data.filter(c => c.status === 'pago').reduce((acc, c) => acc + (c.commission_value || 0), 0),
      pendente: data.filter(c => c.status === 'pendente').reduce((acc, c) => acc + (c.commission_value || 0), 0),
      count: data.length
    };

    return { stats, data };
  },

  async getComandasReport(filter: ReportFilter) {
    const { startDate, endDate, status } = filter;
    const currentTenantId = getActiveTenantId();
    
    const docs = await safeReportDateDocs('comandas', currentTenantId, startDate, endDate);
    let data = docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Comanda))
      .filter(c => (!startDate || c.date >= startDate) && (!endDate || c.date <= endDate));

    if (status && status !== 'all') {
      data = data.filter(c => c.status === status);
    }

    const stats = {
      total: data.length,
      abertas: data.filter(c => c.status === 'aberta').length,
      fechadas: data.filter(c => c.status === 'fechada').length,
      nao_pagas: data.filter(c => c.status === 'nao_paga').length,
      parciais: data.filter(c => c.status === 'parcialmente_paga').length,
      totalValor: data.reduce((acc, c) => acc + (c.totalAmount || 0), 0),
      totalPago: data.reduce((acc, c) => acc + (c.paidAmount || 0), 0)
    };

    return { stats, data };
  }
};
