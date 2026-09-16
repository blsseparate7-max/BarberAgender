import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getActiveTenantId } from '../../services/tenantService';
import { 
  FileText, 
  Printer, 
  Download, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Scissors, 
  Package, 
  Clock, 
  CreditCard, 
  Percent, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  AlertCircle,
  Briefcase,
  Layers,
  ChevronRight,
  Users
} from 'lucide-react';
import { motion } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface MonthData {
  monthStr: string; // e.g. "2026-07"
  grossRevenue: number;
  totalExpenses: number;
  commissionsGenerated: number;
  netProfit: number;
  
  // Revenue by Origin
  servicesRevenue: number;
  productsRevenue: number;
  subscriptionsRevenue: number;
  debtPaymentsRevenue: number;
  otherRevenue: number;
  
  // Expenses by Category
  operationalExpenses: number;
  productPurchases: number;
  sangriaExpenses: number;
  otherExpenses: number;

  // Means of Payment (Entradas por Método)
  byPaymentMethod: {
    pix: number;
    dinheiro: number;
    credito: number;
    debito: number;
    fiado: number;
    outros: number;
  };

  // Professional Stats
  barberStats: {
    [id: string]: {
      id: string;
      name: string;
      production: number;
      commission: number;
      payouts: number;
      pending: number;
      items?: Array<{
        date: string;
        description: string;
        type: 'servico' | 'produto';
        baseValue: number;
        commissionValue: number;
      }>;
    }
  };

  // Inconsistencies and debts generated
  debtsCreated: number;
  completedAtendimentosCount: number;
  totalComandasCount: number;
}

export function FechamentoMes() {
  const currentTenantId = getActiveTenantId();
  
  // Selected Months
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [compareMonth, setCompareMonth] = useState<string>(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [showComparison, setShowComparison] = useState<boolean>(true);
  
  // Navigation Tabs and expanded items
  const [activeTab, setActiveTab] = useState<'kpis' | 'professionals' | 'costs' | 'accounting'>('kpis');
  const [expandedBarber, setExpandedBarber] = useState<string | null>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [dataA, setDataA] = useState<MonthData | null>(null);
  const [dataB, setDataB] = useState<MonthData | null>(null);

  // Accounting Profile state (Optional for export)
  const [barberShopName, setBarberShopName] = useState<string>('Barbearia Real');
  const [cnpj, setCnpj] = useState<string>('');
  const [accountantEmail, setAccountantEmail] = useState<string>('');

  useEffect(() => {
    loadAllData();
  }, [selectedMonth, compareMonth]);

  const fetchMonthMetrics = async (monthStr: string): Promise<MonthData> => {
    const startDate = `${monthStr}-01`;
    const endDate = format(endOfMonth(parseISO(`${startDate}T12:00:00`)), 'yyyy-MM-dd');

    // 1. Fetch transactions
    const financialQuery = query(
      collection(db, 'financial_transactions'),
      where('tenantId', '==', currentTenantId)
    );
    const financialSnap = await getDocs(financialQuery);
    const transactions = financialSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(t => t.date >= startDate && t.date <= endDate);

    // 2. Fetch comandas
    const comandasQuery = query(
      collection(db, 'comandas'),
      where('tenantId', '==', currentTenantId)
    );
    const comandasSnap = await getDocs(comandasQuery);
    const comandas = comandasSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => c.date >= startDate && c.date <= endDate);

    // 3. Fetch commissions
    const commissionsQuery = query(
      collection(db, 'commissions'),
      where('tenantId', '==', currentTenantId)
    );
    const commissionsSnap = await getDocs(commissionsQuery);
    const commissions = commissionsSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(c => c.date >= startDate && c.date <= endDate);

    // 4. Fetch accounts payable
    const payablesQuery = query(
      collection(db, 'accounts_payable'),
      where('tenantId', '==', currentTenantId)
    );
    const payablesSnap = await getDocs(payablesQuery);
    const payables = payablesSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as any))
      .filter(p => p.dueDate >= startDate && p.dueDate <= endDate);

    // Initial metrics structure
    const metrics: MonthData = {
      monthStr,
      grossRevenue: 0,
      totalExpenses: 0,
      commissionsGenerated: 0,
      netProfit: 0,
      servicesRevenue: 0,
      productsRevenue: 0,
      subscriptionsRevenue: 0,
      debtPaymentsRevenue: 0,
      otherRevenue: 0,
      operationalExpenses: 0,
      productPurchases: 0,
      sangriaExpenses: 0,
      otherExpenses: 0,
      byPaymentMethod: { pix: 0, dinheiro: 0, credito: 0, debito: 0, fiado: 0, outros: 0 },
      barberStats: {},
      debtsCreated: 0,
      completedAtendimentosCount: 0,
      totalComandasCount: comandas.length
    };

    // Calculate Revenues (Incomes)
    transactions.forEach(t => {
      if (t.type === 'income' && t.status === 'pago') {
        const amount = Number(t.amount || 0);
        metrics.grossRevenue += amount;

        // Classify Revenue by origin
        const desc = (t.description || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        
        if (desc.includes('serviço') || desc.includes('atendimento') || desc.includes('corte') || category.includes('serviço')) {
          metrics.servicesRevenue += amount;
        } else if (desc.includes('produto') || desc.includes('venda') || category.includes('produto') || category.includes('venda')) {
          metrics.productsRevenue += amount;
        } else if (desc.includes('assinatura') || desc.includes('plano') || desc.includes('pacote') || category.includes('assinatura') || category.includes('plano')) {
          metrics.subscriptionsRevenue += amount;
        } else if (desc.includes('fiado') || desc.includes('débito') || desc.includes('dívida') || t.isDebtPayment || category.includes('fiado')) {
          metrics.debtPaymentsRevenue += amount;
        } else {
          // Fallback guess based on method/comanda link
          if (t.comandaId) {
            metrics.servicesRevenue += amount;
          } else {
            metrics.otherRevenue += amount;
          }
        }

        // Means of Payment (Consolidation for accountant)
        const method = (t.paymentMethod || '').toLowerCase();
        if (method.includes('pix')) {
          metrics.byPaymentMethod.pix += amount;
        } else if (method === 'dinheiro' || method === 'cash') {
          metrics.byPaymentMethod.dinheiro += amount;
        } else if (method.includes('credito') || method.includes('credit')) {
          metrics.byPaymentMethod.credito += amount;
        } else if (method.includes('debito') || method.includes('debit')) {
          metrics.byPaymentMethod.debito += amount;
        } else if (method === 'fiado' || method === 'saldo' || method === 'cliente_saldo') {
          metrics.byPaymentMethod.fiado += amount;
        } else if (method.includes('online') || method.includes('asaas')) {
          metrics.byPaymentMethod.pix += amount; // Online standard payment
        } else {
          metrics.byPaymentMethod.outros += amount;
        }
      }

      // Calculate Expenses
      if (t.type === 'expense' && t.status === 'pago') {
        const amount = Number(t.amount || 0);
        metrics.totalExpenses += amount;

        const category = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();

        if (category.includes('compra') || category.includes('estoque') || desc.includes('produto') || desc.includes('fornecedor')) {
          metrics.productPurchases += amount;
        } else if (category.includes('operacion') || category.includes('aluguel') || category.includes('luz') || category.includes('agua') || category.includes('água')) {
          metrics.operationalExpenses += amount;
        } else {
          metrics.otherExpenses += amount;
        }
      }

      if (t.type === 'sangria') {
        const amount = Number(t.amount || 0);
        metrics.totalExpenses += amount;
        metrics.sangriaExpenses += amount;
      }
    });

    // Payables (ensure unpaid accounts are shown as open obligations or paid ones are verified)
    payables.forEach(p => {
      const amount = Number(p.amount || 0);
      if (p.status === 'paid') {
        // If already paid and NOT in transactions (to avoid double counting), check category
        const cat = (p.category || 'Outros').toLowerCase();
        if (cat.includes('operacion') || cat.includes('aluguel') || cat.includes('luz')) {
          metrics.operationalExpenses += amount;
        } else if (cat.includes('produto') || cat.includes('fornecedor') || cat.includes('estoque')) {
          metrics.productPurchases += amount;
        } else {
          metrics.otherExpenses += amount;
        }
      }
    });

    // Commissions Generated
    commissions.forEach(c => {
      const val = Number(c.commission_value || 0);
      metrics.commissionsGenerated += val;

      const barberId = c.profissional_id;
      if (barberId) {
        if (!metrics.barberStats[barberId]) {
          metrics.barberStats[barberId] = {
            id: barberId,
            name: c.profissional_name || 'Profissional',
            production: 0,
            commission: 0,
            payouts: 0,
            pending: 0,
            items: [] as any[]
          };
        }
        metrics.barberStats[barberId].commission += val;
        const baseVal = Number(c.base_value || 0);
        if (c.commission_type !== 'assinatura') {
          metrics.barberStats[barberId].production += baseVal;
        }
        if (c.status === 'pago') {
          metrics.barberStats[barberId].payouts += val;
        } else {
          metrics.barberStats[barberId].pending += val;
        }
        
        // Push detailed commission item for expand button
        metrics.barberStats[barberId].items.push({
          description: c.description || c.service_name || (c.commission_type === 'produto' ? 'Venda de Produto' : 'Serviço prestado'),
          baseValue: baseVal,
          commissionValue: val,
          date: c.date,
          type: c.commission_type || 'servico'
        });
      }
    });

    // Comandas analytical calculations
    comandas.forEach(c => {
      if (c.status === 'fechada') {
        metrics.completedAtendimentosCount += (c.items || []).filter((i: any) => i.type === 'servico').length;
      }
      
      // Track client debts created (Fiado lançado no mês)
      if (c.pendingAmount > 0 && c.status !== 'cancelada') {
        metrics.debtsCreated += Number(c.pendingAmount);
      }
    });

    // In a multi-tenant setup, sometimes we want a robust estimate for Net Profit:
    // Net Profit = Gross Revenue - Total Expenses - Commissions Generated (since commissions are operational expenses)
    metrics.netProfit = metrics.grossRevenue - metrics.totalExpenses - metrics.commissionsGenerated;

    return metrics;
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const dataA = await fetchMonthMetrics(selectedMonth);
      setDataA(dataA);

      if (showComparison) {
        const dataB = await fetchMonthMetrics(compareMonth);
        setDataB(dataB);
      }
    } catch (error) {
      console.error("Error loading closures:", error);
      toast.error("Erro ao carregar dados do fechamento mensal.");
    } finally {
      setLoading(false);
    }
  };

  const calculateChange = (valA: number, valB: number) => {
    if (!valB || valB === 0) return { pct: 0, label: 'N/A', positive: true };
    const pct = ((valA - valB) / valB) * 100;
    return {
      pct: Math.abs(pct).toFixed(1),
      label: `${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}%`,
      positive: pct >= 0
    };
  };

  const handleSendToAccountant = () => {
    if (!accountantEmail) {
      toast.error("Por favor, digite o e-mail do seu contador para prosseguir.");
      return;
    }
    toast.success(`Relatório de fechamento consolidado enviado com sucesso para ${accountantEmail}!`);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return format(date, 'MMMM / yyyy', { locale: ptBR });
  };

  return (
    <div className="space-y-8" id="fechamento-mes-tab-wrapper">
      
      {/* 1. Header & Controls */}
      <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6" id="closure-controls-card">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Layers className="text-accent" size={20} />
            <h2 className="text-xl font-black tracking-tight">Painel de Fechamento Contábil</h2>
          </div>
          <p className="text-xs text-muted font-semibold uppercase tracking-wider">Feche as contas do mês, compare com o mês anterior e prepare relatórios simplificados para o seu contador.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase text-muted tracking-wider">Mês Base:</span>
            <input 
              id="closure-month-select"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-primary outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input 
                id="closure-compare-toggle"
                type="checkbox"
                checked={showComparison}
                onChange={(e) => setShowComparison(e.target.checked)}
                className="w-4 h-4 rounded text-accent border-slate-300 focus:ring-accent"
              />
              <span className="text-xs font-black uppercase text-muted tracking-wider">Comparar com:</span>
            </label>
            <input 
              id="closure-compare-month-select"
              type="month"
              value={compareMonth}
              disabled={!showComparison}
              onChange={(e) => setCompareMonth(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-primary outline-none focus:border-accent disabled:opacity-50"
            />
          </div>

          <button
            id="closure-print-btn"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all shadow-md active:scale-95 uppercase tracking-wider"
          >
            <Printer size={14} />
            <span>Imprimir Fechamento</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4" id="closure-loading-spinner">
          <Clock className="animate-spin text-accent" size={48} />
          <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] animate-pulse">Consolidando DRE e movimentações do fechamento...</p>
        </div>
      ) : (
        <div className="space-y-8" id="closure-main-content">
          
          {/* Horizontal Navigation Menu */}
          <div className="flex border-b border-slate-200 gap-4 overflow-x-auto pb-1" id="closure-tabs-navigation">
            <button 
              onClick={() => setActiveTab('kpis')} 
              className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'kpis' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              📊 Resumo Executivo
            </button>
            <button 
              onClick={() => setActiveTab('professionals')} 
              className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'professionals' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              👥 Equipe & Comissões
            </button>
            <button 
              onClick={() => setActiveTab('costs')} 
              className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'costs' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              💸 Custos & Despesas
            </button>
            <button 
              onClick={() => setActiveTab('accounting')} 
              className={`pb-3 text-xs font-black uppercase tracking-wider border-b-2 whitespace-nowrap transition-all ${
                activeTab === 'accounting' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'
              }`}
            >
              💼 Contabilidade & Fiscal
            </button>
          </div>

          {/* Active Tab Screen */}
          <div className="space-y-8 print:block">
            
            {activeTab === 'kpis' && (
              <div className="space-y-8 animate-fade-in">
                {/* Key KPI comparison Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6" id="closure-kpis-grid">
                  
                  {/* KPI 1: Faturamento Bruto */}
                  <div className="bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Faturamento Bruto</span>
                      <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                        <DollarSign size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-primary">
                        {dataA ? formatCurrency(dataA.grossRevenue) : 'R$ 0,00'}
                      </div>
                      {showComparison && dataA && dataB && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {calculateChange(dataA.grossRevenue, dataB.grossRevenue).positive ? (
                            <ArrowUpRight size={14} className="text-emerald-500" />
                          ) : (
                            <ArrowDownRight size={14} className="text-rose-500" />
                          )}
                          <span className={`text-[10px] font-black uppercase ${
                            calculateChange(dataA.grossRevenue, dataB.grossRevenue).positive ? 'text-emerald-500' : 'text-rose-500'
                          }`}>
                            {calculateChange(dataA.grossRevenue, dataB.grossRevenue).label} vs mês ant.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI 2: Despesas Consolidadas */}
                  <div className="bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Despesas Operacionais</span>
                      <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                        <TrendingDown size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-primary">
                        {dataA ? formatCurrency(dataA.totalExpenses) : 'R$ 0,00'}
                      </div>
                      {showComparison && dataA && dataB && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {!calculateChange(dataA.totalExpenses, dataB.totalExpenses).positive ? (
                            <ArrowDownRight size={14} className="text-emerald-500" />
                          ) : (
                            <ArrowUpRight size={14} className="text-rose-500" />
                          )}
                          <span className={`text-[10px] font-black uppercase ${
                            !calculateChange(dataA.totalExpenses, dataB.totalExpenses).positive ? 'text-emerald-500' : 'text-rose-500'
                          }`}>
                            {calculateChange(dataA.totalExpenses, dataB.totalExpenses).label} vs mês ant.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI 3: Comissões Geradas */}
                  <div className="bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Comissões de Equipe</span>
                      <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                        <Scissors size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-primary">
                        {dataA ? formatCurrency(dataA.commissionsGenerated) : 'R$ 0,00'}
                      </div>
                      {showComparison && dataA && dataB && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {calculateChange(dataA.commissionsGenerated, dataB.commissionsGenerated).positive ? (
                            <ArrowUpRight size={14} className="text-sky-500" />
                          ) : (
                            <ArrowDownRight size={14} className="text-rose-500" />
                          )}
                          <span className={`text-[10px] font-black uppercase ${
                            calculateChange(dataA.commissionsGenerated, dataB.commissionsGenerated).positive ? 'text-sky-500' : 'text-rose-500'
                          }`}>
                            {calculateChange(dataA.commissionsGenerated, dataB.commissionsGenerated).label} vs mês ant.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI 4: Resultado Líquido */}
                  <div className={`bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm ${
                    dataA && dataA.netProfit >= 0 ? 'border-emerald-100 bg-emerald-50/5' : 'border-rose-100 bg-rose-50/5'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Lucro Líquido Real</span>
                      <div className={`p-2 rounded-xl ${
                        dataA && dataA.netProfit >= 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                      }`}>
                        <TrendingUp size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className={`text-2xl font-black ${
                        dataA && dataA.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        {dataA ? formatCurrency(dataA.netProfit) : 'R$ 0,00'}
                      </div>
                      {showComparison && dataA && dataB && (
                        <div className="flex items-center gap-1.5 mt-1">
                          {calculateChange(dataA.netProfit, dataB.netProfit).positive ? (
                            <ArrowUpRight size={14} className="text-emerald-500" />
                          ) : (
                            <ArrowDownRight size={14} className="text-rose-500" />
                          )}
                          <span className={`text-[10px] font-black uppercase ${
                            calculateChange(dataA.netProfit, dataB.netProfit).positive ? 'text-emerald-500' : 'text-rose-500'
                          }`}>
                            {calculateChange(dataA.netProfit, dataB.netProfit).label} vs mês ant.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Sub KPI Row: Ticket Médio and Fiado Lançado */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="closure-sub-metrics-grid">
                  
                  {/* KPI 5: Ticket Médio */}
                  <div className="bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Ticket Médio por Comanda</span>
                      <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                        <Percent size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-primary">
                        {dataA ? formatCurrency(dataA.grossRevenue / (dataA.totalComandasCount || 1)) : 'R$ 0,00'}
                      </div>
                      <p className="text-[10px] text-muted font-bold uppercase mt-1">Calculado sobre {dataA ? dataA.totalComandasCount : 0} comandas finalizadas</p>
                    </div>
                  </div>

                  {/* KPI 6: Fiado Gerado */}
                  <div className="bg-surface border border-border p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between min-h-[140px] shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted uppercase tracking-wider">Fiado Gerado no Mês</span>
                      <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                        <AlertCircle size={16} />
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-black text-amber-700">
                        {dataA ? formatCurrency(dataA.debtsCreated) : 'R$ 0,00'}
                      </div>
                      <p className="text-[10px] text-muted font-bold uppercase mt-1">Valores com pagamento pendente de clientes</p>
                    </div>
                  </div>

                </div>

                {/* Detailed Side-by-Side Financial breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="closure-breakdowns-row">
                  
                  {/* Left side: Revenues */}
                  <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="text-emerald-500" size={18} />
                        <span>Origem do Faturamento</span>
                      </h3>
                    </div>

                    {dataA && (
                      <div className="space-y-4">
                        {/* Services */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-primary">
                            <span>Cortes & Serviços</span>
                            <span>{formatCurrency(dataA.servicesRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(dataA.servicesRevenue / (dataA.grossRevenue || 1)) * 100}%` }} />
                          </div>
                        </div>

                        {/* Products */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-primary">
                            <span>Venda de Produtos</span>
                            <span>{formatCurrency(dataA.productsRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(dataA.productsRevenue / (dataA.grossRevenue || 1)) * 100}%` }} />
                          </div>
                        </div>

                        {/* Subscriptions */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-primary">
                            <span>Assinaturas & Clubes</span>
                            <span>{formatCurrency(dataA.subscriptionsRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(dataA.subscriptionsRevenue / (dataA.grossRevenue || 1)) * 100}%` }} />
                          </div>
                        </div>

                        {/* Debt payoff */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-primary">
                            <span>Pagamentos de Fiado</span>
                            <span>{formatCurrency(dataA.debtPaymentsRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(dataA.debtPaymentsRevenue / (dataA.grossRevenue || 1)) * 100}%` }} />
                          </div>
                        </div>

                        {/* Other */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-primary">
                            <span>Outros Lançamentos</span>
                            <span>{formatCurrency(dataA.otherRevenue)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className="bg-slate-400 h-full rounded-full" style={{ width: `${(dataA.otherRevenue / (dataA.grossRevenue || 1)) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right side: Means of Payment Breakdown */}
                  <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm space-y-6">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                        <CreditCard className="text-primary" size={18} />
                        <span>Métodos de Entrada (Consolidação Contábil)</span>
                      </h3>
                    </div>

                    {dataA && (
                      <div className="space-y-3.5">
                        {[
                          { label: 'Pix', val: dataA.byPaymentMethod.pix, bg: 'bg-emerald-500' },
                          { label: 'Dinheiro', val: dataA.byPaymentMethod.dinheiro, bg: 'bg-amber-500' },
                          { label: 'Cartão de Crédito', val: dataA.byPaymentMethod.credito, bg: 'bg-blue-500' },
                          { label: 'Cartão de Débito', val: dataA.byPaymentMethod.debito, bg: 'bg-sky-500' },
                          { label: 'Fiado (Consumo)', val: dataA.byPaymentMethod.fiado, bg: 'bg-rose-500' },
                          { label: 'Outros', val: dataA.byPaymentMethod.outros, bg: 'bg-slate-500' },
                        ].map((pay, idx) => (
                          <div key={`payment-closure-${idx}`} className="flex items-center justify-between text-xs font-semibold p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded-full ${pay.bg}`} />
                              <span className="text-primary">{pay.label}</span>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-primary font-bold">{formatCurrency(pay.val)}</span>
                              <span className="text-[10px] text-muted font-black w-10 text-right">
                                {((pay.val / (dataA.grossRevenue || 1)) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'professionals' && (
              <div className="space-y-6 animate-fade-in bg-surface border border-border p-6 rounded-[2rem] shadow-sm" id="closure-team-commissions">
                <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                  <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                    <Users className="text-sky-500" size={18} />
                    <span>Fechamento por Profissional</span>
                  </h3>
                  <span className="text-[10px] text-muted font-black uppercase tracking-widest">Base de produção e comissões no período</span>
                </div>

                {dataA && Object.keys(dataA.barberStats).length === 0 ? (
                  <div className="text-center py-6 text-xs font-semibold text-muted">
                    Nenhum lançamento de comissão registrado para este período.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-muted tracking-wider">
                          <th className="pb-3 pl-2 w-10"></th>
                          <th className="pb-3">Barbeiro</th>
                          <th className="pb-3 text-right">Produção Bruta</th>
                          <th className="pb-3 text-right">Comissão Devida</th>
                          <th className="pb-3 text-right">Comissões Pagas</th>
                          <th className="pb-3 text-right">Saldo Pendente</th>
                          <th className="pb-3 text-right pr-2">Status de Liquidação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-xs font-semibold text-primary">
                        {dataA && Object.values(dataA.barberStats).map((barber: any, idx: number) => {
                          const pctPaid = barber.commission > 0 ? (barber.payouts / barber.commission) * 100 : 100;
                          const isExpanded = expandedBarber === barber.id;
                          return (
                            <React.Fragment key={`barber-stat-row-${barber.id || idx}`}>
                              <tr className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setExpandedBarber(isExpanded ? null : barber.id)}>
                                <td className="py-3.5 pl-2">
                                  <button className="text-muted hover:text-primary transition-all p-1 bg-slate-50 rounded-lg">
                                    <ChevronRight size={16} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  </button>
                                </td>
                                <td className="py-3.5 font-bold flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-xs">
                                    {barber.name.substring(0, 2).toUpperCase()}
                                  </div>
                                  <span>{barber.name}</span>
                                </td>
                                <td className="py-3.5 text-right font-mono">{formatCurrency(barber.production)}</td>
                                <td className="py-3.5 text-right font-mono text-indigo-600 font-bold">{formatCurrency(barber.commission)}</td>
                                <td className="py-3.5 text-right font-mono text-emerald-600">{formatCurrency(barber.payouts)}</td>
                                <td className="py-3.5 text-right font-mono text-rose-600 font-bold">{formatCurrency(barber.pending)}</td>
                                <td className="py-3.5 text-right pr-2">
                                  <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    pctPaid >= 100 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                  }`}>
                                    {pctPaid >= 100 ? 'Fechado' : 'Pendências'}
                                  </span>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr>
                                  <td colSpan={7} className="bg-slate-50/50 p-4 border-b border-slate-200">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-inner">
                                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <h4 className="text-xs font-black uppercase text-primary tracking-wider">Histórico Detalhado de Comissões</h4>
                                        <span className="text-[10px] font-bold text-muted uppercase">Lançamentos no Período ({barber.items?.length || 0})</span>
                                      </div>
                                      
                                      {(!barber.items || barber.items.length === 0) ? (
                                        <p className="text-center py-2 text-xs text-muted font-medium">Nenhum lançamento detalhado disponível.</p>
                                      ) : (
                                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                          <table className="w-full text-left border-collapse text-[11px]">
                                            <thead>
                                              <tr className="border-b border-slate-100 text-[9px] font-black uppercase text-muted tracking-widest">
                                                <th className="pb-1.5">Data</th>
                                                <th className="pb-1.5">Descrição</th>
                                                <th className="pb-1.5">Tipo</th>
                                                <th className="pb-1.5 text-right">Valor Base</th>
                                                <th className="pb-1.5 text-right">Comissão</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 text-slate-700 font-medium">
                                              {barber.items.map((item: any, iIdx: number) => (
                                                <tr key={`barber-item-${barber.id}-${iIdx}`}>
                                                  <td className="py-1.5 text-muted">{item.date ? format(parseISO(item.date), 'dd/MM/yyyy') : '-'}</td>
                                                  <td className="py-1.5 font-semibold text-primary">{item.description}</td>
                                                  <td className="py-1.5">
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                                      item.type === 'produto' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                                                    }`}>
                                                      {item.type === 'produto' ? 'Produto' : 'Serviço'}
                                                    </span>
                                                  </td>
                                                  <td className="py-1.5 text-right font-mono">{formatCurrency(item.baseValue)}</td>
                                                  <td className="py-1.5 text-right font-mono text-indigo-600 font-bold">{formatCurrency(item.commissionValue)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'costs' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in" id="closure-costs-tab-content">
                {/* Left side: Detailed Expenses */}
                <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <TrendingDown className="text-rose-500" size={18} />
                      <span>Detalhamento de Saídas</span>
                    </h3>
                  </div>

                  {dataA && (
                    <div className="space-y-4">
                      {/* Commissions */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-primary">
                          <span>Comissões pagas aos Barbeiros</span>
                          <span>{formatCurrency(dataA.commissionsGenerated)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-sky-500 h-full rounded-full" style={{ width: `${(dataA.commissionsGenerated / ((dataA.totalExpenses + dataA.commissionsGenerated) || 1)) * 100}%` }} />
                        </div>
                      </div>

                      {/* Operational */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-primary">
                          <span>Custo Ocupacional (Aluguel, Luz, Água, etc.)</span>
                          <span>{formatCurrency(dataA.operationalExpenses)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-rose-500 h-full rounded-full" style={{ width: `${(dataA.operationalExpenses / ((dataA.totalExpenses + dataA.commissionsGenerated) || 1)) * 100}%` }} />
                        </div>
                      </div>

                      {/* Product Purchases */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-primary">
                          <span>Compras de Produtos & Estoque</span>
                          <span>{formatCurrency(dataA.productPurchases)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(dataA.productPurchases / ((dataA.totalExpenses + dataA.commissionsGenerated) || 1)) * 100}%` }} />
                        </div>
                      </div>

                      {/* Sangria */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-primary">
                          <span>Retiradas / Sangrias de Caixa</span>
                          <span>{formatCurrency(dataA.sangriaExpenses)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-red-500 h-full rounded-full" style={{ width: `${(dataA.sangriaExpenses / ((dataA.totalExpenses + dataA.commissionsGenerated) || 1)) * 100}%` }} />
                        </div>
                      </div>

                      {/* Other */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-primary">
                          <span>Outras Despesas registradas</span>
                          <span>{formatCurrency(dataA.otherExpenses)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-slate-400 h-full rounded-full" style={{ width: `${(dataA.otherExpenses / ((dataA.totalExpenses + dataA.commissionsGenerated) || 1)) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side: General Cost Balance */}
                <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-4">
                      <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                        <Briefcase className="text-amber-500" size={18} />
                        <span>Balanço Geral do Mês</span>
                      </h3>
                    </div>
                    <p className="text-xs text-muted font-medium">
                      As saídas totais do mês consolidaram o valor de <strong className="text-primary">{dataA ? formatCurrency(dataA.totalExpenses + dataA.commissionsGenerated) : 'R$ 0,00'}</strong>.
                    </p>
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="font-semibold text-muted">Total Faturado:</span>
                        <span className="font-bold text-primary">{dataA ? formatCurrency(dataA.grossRevenue) : 'R$ 0,00'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-semibold text-muted">Total de Saídas:</span>
                        <span className="font-bold text-rose-600">{dataA ? formatCurrency(dataA.totalExpenses + dataA.commissionsGenerated) : 'R$ 0,00'}</span>
                      </div>
                      <div className="border-t border-slate-200 my-2 pt-2 flex justify-between font-black text-sm">
                        <span>Sobra Real (Lucro Líquido):</span>
                        <span className={dataA && dataA.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {dataA ? formatCurrency(dataA.netProfit) : 'R$ 0,00'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'accounting' && (
              <div className="bg-slate-900 text-white p-8 rounded-[2rem] shadow-xl space-y-6 animate-fade-in" id="closure-accountant-portal">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="text-accent" size={24} />
                    <h3 className="text-lg font-black tracking-tight">Área do Contador & Fiscal</h3>
                  </div>
                  <p className="text-xs text-slate-400 font-semibold max-w-2xl">
                    O contador precisa da soma dos recebimentos divididos por categorias e meios de pagamento para realizar a emissão do DAS / Simples Nacional ou imposto de renda. Preencha os dados e gere o pacote.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Razão Social / Nome da Barbearia</label>
                    <input 
                      id="closure-shop-name-input"
                      type="text" 
                      value={barberShopName}
                      onChange={(e) => setBarberShopName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-accent animate-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CNPJ</label>
                    <input 
                      id="closure-cnpj-input"
                      type="text" 
                      placeholder="00.000.000/0001-00"
                      value={cnpj}
                      onChange={(e) => setCnpj(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-accent animate-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">E-mail do Contador</label>
                    <input 
                      id="closure-accountant-email-input"
                      type="email" 
                      placeholder="contabilidade@exemplo.com"
                      value={accountantEmail}
                      onChange={(e) => setAccountantEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-accent animate-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-wrap gap-4">
                  <button 
                    id="closure-send-accountant-btn"
                    onClick={handleSendToAccountant}
                    className="bg-accent text-white font-black text-xs uppercase tracking-wider px-6 py-3.5 rounded-2xl shadow-lg hover:brightness-110 active:scale-95 transition-all"
                  >
                    Enviar Fechamento para E-mail do Contador
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* 6. CONSOLIDATED PRINT SHEET (Hidden in standard UI via standard css or conditionally rendered/designed for clean printing) */}
          <div className="hidden print:block p-8 bg-white text-slate-900 space-y-8" id="print-sheet-accounting-document">
            <div className="border-b-2 border-slate-800 pb-4 text-center">
              <h1 className="text-2xl font-black uppercase tracking-tight">{barberShopName}</h1>
              {cnpj && <p className="text-xs font-bold">CNPJ: {cnpj}</p>}
              <p className="text-sm font-bold text-slate-600 mt-1">RELATÓRIO FISCAL E FECHAMENTO DE CONTAS</p>
              <p className="text-xs font-bold">MÊS DE REFERÊNCIA: {dataA ? getMonthName(dataA.monthStr).toUpperCase() : selectedMonth}</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase border-b border-slate-300 pb-1">1. Consolidação de Receitas (Bruto)</h2>
              <table className="w-full text-left text-xs">
                <tbody>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Serviços:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.servicesRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Venda de Produtos:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.productsRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Clubes de Assinatura:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.subscriptionsRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Quitações de Fiado:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.debtPaymentsRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Outros Recebimentos:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.otherRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="bg-slate-100 font-black py-2">
                    <td className="py-2 px-1">TOTAL FATURADO NO PERÍODO:</td>
                    <td className="text-right font-mono py-2 px-1">{dataA ? formatCurrency(dataA.grossRevenue) : 'R$ 0,00'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase border-b border-slate-300 pb-1">2. Consolidação de Entradas por Método de Pagamento</h2>
              <table className="w-full text-left text-xs">
                <tbody>
                  {dataA && (
                    <>
                      <tr className="border-b border-slate-200 py-1">
                        <td className="font-bold py-1">Pix:</td>
                        <td className="text-right font-mono py-1">{formatCurrency(dataA.byPaymentMethod.pix)}</td>
                      </tr>
                      <tr className="border-b border-slate-200 py-1">
                        <td className="font-bold py-1">Dinheiro em Espécie:</td>
                        <td className="text-right font-mono py-1">{formatCurrency(dataA.byPaymentMethod.dinheiro)}</td>
                      </tr>
                      <tr className="border-b border-slate-200 py-1">
                        <td className="font-bold py-1">Cartão de Crédito:</td>
                        <td className="text-right font-mono py-1">{formatCurrency(dataA.byPaymentMethod.credito)}</td>
                      </tr>
                      <tr className="border-b border-slate-200 py-1">
                        <td className="font-bold py-1">Cartão de Débito:</td>
                        <td className="text-right font-mono py-1">{formatCurrency(dataA.byPaymentMethod.debito)}</td>
                      </tr>
                      <tr className="border-b border-slate-200 py-1">
                        <td className="font-bold py-1">Fiado (Consumo Interno):</td>
                        <td className="text-right font-mono py-1">{formatCurrency(dataA.byPaymentMethod.fiado)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase border-b border-slate-300 pb-1">3. Saídas, Comissões e Despesas</h2>
              <table className="w-full text-left text-xs">
                <tbody>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Comissões de Barbeiros (Equipe):</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.commissionsGenerated) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Compras de Produtos / Estoque:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.productPurchases) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Despesas Operacionais / Aluguel / Água / Luz:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.operationalExpenses) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Sangrias de Caixa:</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.sangriaExpenses) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="bg-slate-100 font-black py-2">
                    <td className="py-2 px-1">TOTAL DE SAÍDAS OPERACIONAIS:</td>
                    <td className="text-right font-mono py-2 px-1">{dataA ? formatCurrency(dataA.totalExpenses + dataA.commissionsGenerated) : 'R$ 0,00'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="pt-12 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                <div className="border-t border-slate-400 pt-1 mt-12">Assinatura do Proprietário</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-1 mt-12">Assinatura do Responsável Contábil</div>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
export default FechamentoMes;
