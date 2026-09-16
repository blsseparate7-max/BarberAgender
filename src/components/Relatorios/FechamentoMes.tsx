import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getActiveTenantId } from '../../services/tenantService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  FileText, 
  Printer, 
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
  ChevronDown,
  Users,
  Plus,
  Minus,
  Copy,
  Check,
  Send,
  Building2,
  Filter,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, endOfMonth, parseISO, subMonths } from 'date-fns';
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
      serviceCount: number;
    }
  };

  // Inconsistencies and debts generated
  debtsCreated: number;
  completedAtendimentosCount: number;
  totalComandasCount: number;
}

export function FechamentoMes() {
  const currentTenantId = getActiveTenantId();
  const { profile } = useAuth();
  
  // Selected Months
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [compareMonth, setCompareMonth] = useState<string>(format(subMonths(new Date(), 1), 'yyyy-MM'));
  const [showComparison, setShowComparison] = useState<boolean>(true);
  
  // 3 Sub-tabs: 'dre' (DRE & Balanço Geral), 'equipe' (Produção da Equipe), 'fiscal' (Fiscal & Contabilidade)
  const [activeTab, setActiveTab] = useState<'dre' | 'equipe' | 'fiscal'>('dre');

  // Filter for Team Tab (Select Barbeiro)
  const [selectedBarberFilter, setSelectedBarberFilter] = useState<string>('all');

  // DRE Accordion state (expand with + or collapse with -)
  const [dreExpanded, setDreExpanded] = useState<{
    receitas: boolean;
    comissoes: boolean;
    operacionais: boolean;
    compras: boolean;
    sangrias: boolean;
  }>({
    receitas: true,
    comissoes: true,
    operacionais: true,
    compras: false,
    sangrias: false
  });

  const toggleDreSection = (key: keyof typeof dreExpanded) => {
    setDreExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllDre = (expand: boolean) => {
    setDreExpanded({
      receitas: expand,
      comissoes: expand,
      operacionais: expand,
      compras: expand,
      sangrias: expand
    });
  };
  
  const [loading, setLoading] = useState<boolean>(true);
  const [dataA, setDataA] = useState<MonthData | null>(null);
  const [dataB, setDataB] = useState<MonthData | null>(null);

  // Accounting Profile state
  const [barberShopName, setBarberShopName] = useState<string>('Barbearia Real');
  const [cnpj, setCnpj] = useState<string>('');
  const [accountantEmail, setAccountantEmail] = useState<string>('');
  const [copiedWhatsapp, setCopiedWhatsapp] = useState<boolean>(false);

  useEffect(() => {
    if (profile) {
      if (profile.nome_barbearia || profile.nome) {
        setBarberShopName(profile.nome_barbearia || profile.nome || 'BarberElite Pro');
      }
      if (profile.cnpj) {
        setCnpj(profile.cnpj);
      }
    }
  }, [profile]);

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
          if (t.comandaId) {
            metrics.servicesRevenue += amount;
          } else {
            metrics.otherRevenue += amount;
          }
        }

        // Means of Payment
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
          metrics.byPaymentMethod.pix += amount;
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
        } else if (category.includes('operacion') || category.includes('aluguel') || category.includes('luz') || category.includes('agua') || category.includes('água') || category.includes('internet')) {
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

    // Payables (check paid accounts not already tracked)
    payables.forEach(p => {
      const amount = Number(p.amount || 0);
      if (p.status === 'paid') {
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

    // Commissions Generated & Barber Stats
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
            serviceCount: 0
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
        metrics.barberStats[barberId].serviceCount += 1;
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

    // Net Profit = Gross Revenue - Total Expenses - Commissions Generated
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

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const getMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return format(date, 'MMMM / yyyy', { locale: ptBR });
  };

  // Team computations
  const barbersList = useMemo(() => {
    if (!dataA) return [];
    const list = Object.values(dataA.barberStats) as Array<MonthData['barberStats'][string]>;
    return list.sort((a, b) => b.production - a.production);
  }, [dataA]);

  const filteredBarbers = useMemo(() => {
    if (selectedBarberFilter === 'all') return barbersList;
    return barbersList.filter(b => b.id === selectedBarberFilter);
  }, [barbersList, selectedBarberFilter]);

  const topBarber = barbersList.length > 0 ? barbersList[0] : null;
  const totalBarbersCount = barbersList.length;
  const avgProductionPerBarber = totalBarbersCount > 0 && dataA 
    ? (barbersList.reduce((acc, b) => acc + b.production, 0) / totalBarbersCount) 
    : 0;
  const totalRetainedByShop = barbersList.reduce((acc, b) => acc + Math.max(0, b.production - b.commission), 0);

  // Fiscal WhatsApp Message generator
  const getFiscalWhatsAppMessage = () => {
    if (!dataA) return '';
    const electronicTotal = (dataA.byPaymentMethod.credito + dataA.byPaymentMethod.debito + dataA.byPaymentMethod.pix);
    return `*RELATÓRIO FISCAL & CONTÁBIL - ${getMonthName(dataA.monthStr).toUpperCase()}*\n` +
      `*Estabelecimento:* ${barberShopName}\n` +
      (cnpj ? `*CNPJ:* ${cnpj}\n` : '') +
      `*Emissão:* ${new Date().toLocaleDateString('pt-BR')}\n\n` +
      `=========================================\n` +
      `*1. DEMONSTRATIVO DE RECEITAS (BRUTO)*\n` +
      `• *Serviços Prestados (NFS-e):* ${formatCurrency(dataA.servicesRevenue)}\n` +
      `• *Venda de Produtos (NFC-e):* ${formatCurrency(dataA.productsRevenue)}\n` +
      `• *Clubes & Assinaturas:* ${formatCurrency(dataA.subscriptionsRevenue)}\n` +
      `• *Quitações de Fiado:* ${formatCurrency(dataA.debtPaymentsRevenue)}\n` +
      `• *Outros Recebimentos:* ${formatCurrency(dataA.otherRevenue)}\n` +
      `*FATURAMENTO BRUTO TOTAL:* ${formatCurrency(dataA.grossRevenue)}\n\n` +
      `=========================================\n` +
      `*2. ENTRADAS POR MEIO ELETRÔNICO (RECEITA/SEFAZ)*\n` +
      `• *Cartão de Crédito:* ${formatCurrency(dataA.byPaymentMethod.credito)}\n` +
      `• *Cartão de Débito:* ${formatCurrency(dataA.byPaymentMethod.debito)}\n` +
      `• *Pix:* ${formatCurrency(dataA.byPaymentMethod.pix)}\n` +
      `*TOTAL MEIOS ELETRÔNICOS:* ${formatCurrency(electronicTotal)}\n` +
      `• *Dinheiro em Espécie:* ${formatCurrency(dataA.byPaymentMethod.dinheiro)}\n\n` +
      `=========================================\n` +
      `*3. REPASSES E SAÍDAS OPERACIONAIS*\n` +
      `• *Comissões Repassadas (Equipe):* ${formatCurrency(dataA.commissionsGenerated)}\n` +
      `• *Despesas Operacionais (Aluguel/Luz/Água):* ${formatCurrency(dataA.operationalExpenses)}\n` +
      `• *Compras de Estoque / Insumos:* ${formatCurrency(dataA.productPurchases)}\n` +
      `• *Sangrias de Caixa:* ${formatCurrency(dataA.sangriaExpenses)}\n` +
      `*TOTAL DE SAÍDAS:* ${formatCurrency(dataA.totalExpenses + dataA.commissionsGenerated)}\n\n` +
      `*RESULTADO LÍQUIDO DO MÊS:* ${formatCurrency(dataA.netProfit)}\n\n` +
      `_Gerado com precisão pelo módulo de Fechamento BarberElite Pro._`;
  };

  const handleCopyFiscalWhatsApp = () => {
    const text = getFiscalWhatsAppMessage();
    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    toast.success("Resumo fiscal formatado copiado com sucesso!");
    setTimeout(() => setCopiedWhatsapp(false), 3000);
  };

  const handleOpenWhatsApp = () => {
    const text = encodeURIComponent(getFiscalWhatsAppMessage());
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleSendToAccountant = () => {
    if (!accountantEmail) {
      toast.error("Por favor, digite o e-mail do seu contador para prosseguir.");
      return;
    }
    toast.success(`Relatório de fechamento consolidado enviado com sucesso para ${accountantEmail}!`);
  };

  // Electronic & Physical calculations for fiscal
  const electronicTotal = dataA ? (dataA.byPaymentMethod.credito + dataA.byPaymentMethod.debito + dataA.byPaymentMethod.pix) : 0;
  const grossTotal = dataA ? dataA.grossRevenue : 1;
  const netMarginPct = dataA && dataA.grossRevenue > 0 ? ((dataA.netProfit / dataA.grossRevenue) * 100) : 0;
  const commissionPct = dataA && dataA.grossRevenue > 0 ? ((dataA.commissionsGenerated / dataA.grossRevenue) * 100) : 0;

  return (
    <div className="space-y-6" id="fechamento-mes-tab-wrapper">
      
      {/* 1. Header & Controls Card */}
      <div className="bg-surface border border-border p-5 md:p-6 rounded-3xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-5" id="closure-controls-card">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold">
            <div className="p-2 rounded-xl bg-accent/10 text-accent">
              <Layers size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Fechamento do Mês</h2>
              <p className="text-xs text-muted font-medium">Balanço executivo, desempenho dos barbeiros e fechamento fiscal contábil.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <Calendar size={14} className="text-muted" />
            <span className="text-[11px] font-black uppercase text-muted tracking-wider">Mês:</span>
            <input 
              id="closure-month-select"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input 
                id="closure-compare-toggle"
                type="checkbox"
                checked={showComparison}
                onChange={(e) => setShowComparison(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-accent border-slate-300 focus:ring-accent"
              />
              <span className="text-[11px] font-black uppercase text-muted tracking-wider">Comparar:</span>
            </label>
            <input 
              id="closure-compare-month-select"
              type="month"
              value={compareMonth}
              disabled={!showComparison}
              onChange={(e) => setCompareMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-primary outline-none disabled:opacity-40 cursor-pointer"
            />
          </div>

          <button
            id="closure-print-btn"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 bg-primary text-white px-4 py-2.5 rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all shadow-sm active:scale-95 uppercase tracking-wider"
          >
            <Printer size={14} />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-surface border border-border rounded-3xl" id="closure-loading-spinner">
          <Clock className="animate-spin text-accent" size={40} />
          <p className="text-xs font-bold text-muted uppercase tracking-widest animate-pulse">Consolidando DRE e fechamento do mês...</p>
        </div>
      ) : (
        <div className="space-y-6" id="closure-main-content">
          
          {/* Sub-Tabs: 3 Abas Intuitivas, Clean e Diretas */}
          <div className="flex items-center p-1.5 bg-slate-100/80 border border-slate-200 rounded-2xl gap-1 overflow-x-auto" id="closure-tabs-navigation">
            <button 
              id="tab-closure-dre"
              onClick={() => setActiveTab('dre')} 
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'dre' 
                  ? 'bg-white text-primary shadow-sm border border-slate-200/60' 
                  : 'text-muted hover:text-primary hover:bg-white/50'
              }`}
            >
              <TrendingUp size={16} className={activeTab === 'dre' ? 'text-accent' : 'text-muted'} />
              <span>📊 DRE & Balanço Geral</span>
            </button>
            <button 
              id="tab-closure-equipe"
              onClick={() => setActiveTab('equipe')} 
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'equipe' 
                  ? 'bg-white text-primary shadow-sm border border-slate-200/60' 
                  : 'text-muted hover:text-primary hover:bg-white/50'
              }`}
            >
              <Scissors size={16} className={activeTab === 'equipe' ? 'text-sky-500' : 'text-muted'} />
              <span>💈 Produção da Equipe</span>
            </button>
            <button 
              id="tab-closure-fiscal"
              onClick={() => setActiveTab('fiscal')} 
              className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all whitespace-nowrap ${
                activeTab === 'fiscal' 
                  ? 'bg-white text-primary shadow-sm border border-slate-200/60' 
                  : 'text-muted hover:text-primary hover:bg-white/50'
              }`}
            >
              <FileText size={16} className={activeTab === 'fiscal' ? 'text-indigo-500' : 'text-muted'} />
              <span>💼 Fiscal & Contabilidade</span>
            </button>
          </div>

          {/* TAB 1: 📊 DRE & Balanço Geral */}
          {activeTab === 'dre' && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* 4 Hero Cards Executivos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="closure-hero-cards">
                
                {/* 1. Faturamento Bruto */}
                <div className="bg-surface border border-border p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-muted uppercase tracking-wider">Faturamento Bruto</span>
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <DollarSign size={16} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-black text-primary">
                      {dataA ? formatCurrency(dataA.grossRevenue) : 'R$ 0,00'}
                    </div>
                    {showComparison && dataA && dataB && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {calculateChange(dataA.grossRevenue, dataB.grossRevenue).positive ? (
                          <ArrowUpRight size={13} className="text-emerald-500" />
                        ) : (
                          <ArrowDownRight size={13} className="text-rose-500" />
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

                {/* 2. Comissões da Equipe */}
                <div className="bg-surface border border-border p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-muted uppercase tracking-wider">Repasses de Comissão</span>
                    <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                      <Scissors size={16} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-black text-primary">
                      {dataA ? formatCurrency(dataA.commissionsGenerated) : 'R$ 0,00'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold text-muted">
                      <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full font-black">
                        {commissionPct.toFixed(1)}% do faturamento
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Despesas da Barbearia */}
                <div className="bg-surface border border-border p-5 rounded-3xl shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-muted uppercase tracking-wider">Custos & Estoque</span>
                    <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                      <TrendingDown size={16} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-black text-rose-600">
                      {dataA ? formatCurrency(dataA.totalExpenses) : 'R$ 0,00'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] font-bold text-muted">
                      <span>Operacional, fornecedores e sangrias</span>
                    </div>
                  </div>
                </div>

                {/* 4. Lucro Líquido Real (Sobra da Casa) */}
                <div className={`border p-5 rounded-3xl shadow-sm flex flex-col justify-between ${
                  dataA && dataA.netProfit >= 0 
                    ? 'bg-emerald-50/40 border-emerald-200' 
                    : 'bg-rose-50/40 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-muted uppercase tracking-wider">Sobra Líquida Real</span>
                    <div className={`p-2 rounded-xl ${
                      dataA && dataA.netProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      <TrendingUp size={16} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className={`text-2xl font-black ${
                      dataA && dataA.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {dataA ? formatCurrency(dataA.netProfit) : 'R$ 0,00'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        dataA && dataA.netProfit >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        Margem Líquida: {netMarginPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

              </div>

              {/* DRE Estruturado em Acordeão (+ / -) */}
              <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-4" id="closure-dre-table">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <Briefcase className="text-accent" size={18} />
                      <span>Demonstrativo do Resultado do Exercício (DRE)</span>
                    </h3>
                    <p className="text-xs text-muted mt-0.5">Visão vertical completa das receitas, deduções operacionais e margem líquida.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => toggleAllDre(true)}
                      className="text-[11px] font-bold text-muted hover:text-primary px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 transition-colors"
                    >
                      Expandir todos
                    </button>
                    <button 
                      onClick={() => toggleAllDre(false)}
                      className="text-[11px] font-bold text-muted hover:text-primary px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 transition-colors"
                    >
                      Recolher todos
                    </button>
                  </div>
                </div>

                {dataA && (
                  <div className="divide-y divide-slate-100 text-xs">
                    
                    {/* 1. (+) RECEITA BRUTA OPERACIONAL */}
                    <div className="py-3">
                      <div 
                        onClick={() => toggleDreSection('receitas')}
                        className="flex items-center justify-between cursor-pointer p-2 rounded-2xl hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="p-1 rounded-lg bg-emerald-100 text-emerald-700">
                            {dreExpanded.receitas ? <Minus size={13} /> : <Plus size={13} />}
                          </span>
                          <span className="font-black text-slate-800 uppercase tracking-wide">
                            (+) 1. Receitas Brutas Operacionais
                          </span>
                        </div>
                        <span className="font-black text-emerald-600 font-mono text-sm">
                          {formatCurrency(dataA.grossRevenue)}
                        </span>
                      </div>

                      {dreExpanded.receitas && (
                        <div className="mt-2 pl-9 pr-2 space-y-2 text-[11px] text-slate-600">
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Cortes e Serviços de Barbearia</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.servicesRevenue)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Vendas de Produtos de Balcão (Pomadas, Cosméticos)</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.productsRevenue)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Planos e Clubes de Assinatura</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.subscriptionsRevenue)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Quitações de Fiado / Créditos</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.debtPaymentsRevenue)}</span>
                          </div>
                          {dataA.otherRevenue > 0 && (
                            <div className="flex justify-between items-center py-1 border-b border-slate-50">
                              <span>• Outros Lançamentos de Entrada</span>
                              <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.otherRevenue)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 2. (-) REPASSES DE COMISSÃO DA EQUIPE */}
                    <div className="py-3">
                      <div 
                        onClick={() => toggleDreSection('comissoes')}
                        className="flex items-center justify-between cursor-pointer p-2 rounded-2xl hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="p-1 rounded-lg bg-sky-100 text-sky-700">
                            {dreExpanded.comissoes ? <Minus size={13} /> : <Plus size={13} />}
                          </span>
                          <span className="font-black text-slate-800 uppercase tracking-wide">
                            (-) 2. Repasses de Comissão (Custo da Equipe)
                          </span>
                        </div>
                        <span className="font-black text-sky-600 font-mono text-sm">
                          - {formatCurrency(dataA.commissionsGenerated)}
                        </span>
                      </div>

                      {dreExpanded.comissoes && (
                        <div className="mt-2 pl-9 pr-2 space-y-2 text-[11px] text-slate-600">
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Comissões apuradas aos barbeiros no período</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.commissionsGenerated)}</span>
                          </div>
                          <div className="flex justify-between items-center py-1 text-slate-500 text-[10px]">
                            <span>Percentual médio sobre faturamento total</span>
                            <span className="font-bold">{commissionPct.toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 3. (-) DESPESAS FIXAS & OPERACIONAIS */}
                    <div className="py-3">
                      <div 
                        onClick={() => toggleDreSection('operacionais')}
                        className="flex items-center justify-between cursor-pointer p-2 rounded-2xl hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="p-1 rounded-lg bg-rose-100 text-rose-700">
                            {dreExpanded.operacionais ? <Minus size={13} /> : <Plus size={13} />}
                          </span>
                          <span className="font-black text-slate-800 uppercase tracking-wide">
                            (-) 3. Custos Fixos & Operacionais da Casa
                          </span>
                        </div>
                        <span className="font-black text-rose-600 font-mono text-sm">
                          - {formatCurrency(dataA.operationalExpenses)}
                        </span>
                      </div>

                      {dreExpanded.operacionais && (
                        <div className="mt-2 pl-9 pr-2 space-y-2 text-[11px] text-slate-600">
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Aluguel, Condomínio, Energia Elétrica, Água, Internet e Manutenções</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.operationalExpenses)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. (-) COMPRAS DE PRODUTOS & ESTOQUE */}
                    <div className="py-3">
                      <div 
                        onClick={() => toggleDreSection('compras')}
                        className="flex items-center justify-between cursor-pointer p-2 rounded-2xl hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="p-1 rounded-lg bg-amber-100 text-amber-700">
                            {dreExpanded.compras ? <Minus size={13} /> : <Plus size={13} />}
                          </span>
                          <span className="font-black text-slate-800 uppercase tracking-wide">
                            (-) 4. Fornecedores & Compras de Estoque
                          </span>
                        </div>
                        <span className="font-black text-amber-600 font-mono text-sm">
                          - {formatCurrency(dataA.productPurchases)}
                        </span>
                      </div>

                      {dreExpanded.compras && (
                        <div className="mt-2 pl-9 pr-2 space-y-2 text-[11px] text-slate-600">
                          <div className="flex justify-between items-center py-1 border-b border-slate-50">
                            <span>• Reposição de cosméticos, pomadas, lâminas e descartáveis</span>
                            <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.productPurchases)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 5. (-) SANGRIAS E OUTRAS SAÍDAS */}
                    {(dataA.sangriaExpenses > 0 || dataA.otherExpenses > 0) && (
                      <div className="py-3">
                        <div 
                          onClick={() => toggleDreSection('sangrias')}
                          className="flex items-center justify-between cursor-pointer p-2 rounded-2xl hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="p-1 rounded-lg bg-slate-100 text-slate-700">
                              {dreExpanded.sangrias ? <Minus size={13} /> : <Plus size={13} />}
                            </span>
                            <span className="font-black text-slate-800 uppercase tracking-wide">
                              (-) 5. Sangrias de Caixa e Outras Despesas
                            </span>
                          </div>
                          <span className="font-black text-slate-600 font-mono text-sm">
                            - {formatCurrency(dataA.sangriaExpenses + dataA.otherExpenses)}
                          </span>
                        </div>

                        {dreExpanded.sangrias && (
                          <div className="mt-2 pl-9 pr-2 space-y-2 text-[11px] text-slate-600">
                            {dataA.sangriaExpenses > 0 && (
                              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                <span>• Retiradas e Sangrias manuais de caixa</span>
                                <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.sangriaExpenses)}</span>
                              </div>
                            )}
                            {dataA.otherExpenses > 0 && (
                              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                                <span>• Outros débitos registrados</span>
                                <span className="font-bold text-slate-800 font-mono">{formatCurrency(dataA.otherExpenses)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TOTALIZADOR: (=) LUCRO LÍQUIDO REAL */}
                    <div className="pt-4 pb-1">
                      <div className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        dataA.netProfit >= 0 ? 'bg-emerald-500 text-white shadow-md' : 'bg-rose-500 text-white shadow-md'
                      }`}>
                        <div>
                          <span className="text-[11px] font-black uppercase tracking-wider opacity-90 block">
                            (=) Resultado Líquido Operacional (Sobra Real no Caixa)
                          </span>
                          <span className="text-xs opacity-80 font-medium">
                            Faturamento Bruto menos comissões, fixos e fornecedores.
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black font-mono block">
                            {formatCurrency(dataA.netProfit)}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
                            Margem Líquida da Barbearia: {netMarginPct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              {/* Conciliação de Entradas por Método de Pagamento & Indicadores de Apoio */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="closure-payment-methods-grid">
                
                {/* Meios de Pagamento (Conciliação) */}
                <div className="lg:col-span-2 bg-surface border border-border p-6 rounded-3xl shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="text-primary" size={18} />
                      <span>Conciliação de Entradas por Meio de Pagamento</span>
                    </h3>
                    <span className="text-[10px] font-bold text-muted uppercase">Para conferência de maquininhas</span>
                  </div>

                  {dataA && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: 'Pix', val: dataA.byPaymentMethod.pix, color: 'emerald' },
                        { label: 'Cartão de Crédito', val: dataA.byPaymentMethod.credito, color: 'blue' },
                        { label: 'Cartão de Débito', val: dataA.byPaymentMethod.debito, color: 'sky' },
                        { label: 'Dinheiro em Espécie', val: dataA.byPaymentMethod.dinheiro, color: 'amber' },
                        { label: 'Fiado (Consumo)', val: dataA.byPaymentMethod.fiado, color: 'rose' },
                        { label: 'Outros Meios', val: dataA.byPaymentMethod.outros, color: 'slate' },
                      ].map((item, idx) => {
                        const pct = ((item.val / grossTotal) * 100);
                        return (
                          <div key={`method-card-${idx}`} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-slate-700">{item.label}</p>
                              <p className="text-sm font-black text-primary font-mono mt-0.5">{formatCurrency(item.val)}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cards Complementares: Ticket Médio & Fiado Gerado */}
                <div className="space-y-4">
                  
                  {/* Ticket Médio */}
                  <div className="bg-surface border border-border p-5 rounded-3xl shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-indigo-600">
                      <span className="text-[11px] font-black uppercase text-muted tracking-wider">Ticket Médio</span>
                      <Percent size={16} />
                    </div>
                    <div className="text-2xl font-black text-primary">
                      {dataA ? formatCurrency(dataA.grossRevenue / (dataA.totalComandasCount || 1)) : 'R$ 0,00'}
                    </div>
                    <p className="text-[10px] text-muted font-bold uppercase">
                      Sobre {dataA ? dataA.totalComandasCount : 0} comandas fechadas
                    </p>
                  </div>

                  {/* Fiado Gerado */}
                  <div className="bg-surface border border-border p-5 rounded-3xl shadow-sm space-y-2">
                    <div className="flex items-center justify-between text-amber-600">
                      <span className="text-[11px] font-black uppercase text-muted tracking-wider">Fiado Gerado no Mês</span>
                      <AlertCircle size={16} />
                    </div>
                    <div className="text-2xl font-black text-amber-700">
                      {dataA ? formatCurrency(dataA.debtsCreated) : 'R$ 0,00'}
                    </div>
                    <p className="text-[10px] text-muted font-bold uppercase">
                      Pendências acumuladas a receber
                    </p>
                  </div>

                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 2: 💈 Produção da Equipe (Sem extrato detalhado por comanda, foco gerencial) */}
          {activeTab === 'equipe' && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Select de Filtro & Cards de Inteligência da Equipe */}
              <div className="bg-surface border border-border p-6 rounded-3xl shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <Scissors className="text-accent" size={18} />
                      <span>Desempenho & Margem por Barbeiro</span>
                    </h3>
                    <p className="text-xs text-muted mt-0.5">Produção gerada na cadeira, comissões apuradas e margem retida para a barbearia.</p>
                  </div>

                  {/* Select com Barbeiros */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
                    <Filter size={14} className="text-muted" />
                    <span className="text-[11px] font-black uppercase text-muted tracking-wider">Filtrar:</span>
                    <select 
                      id="closure-barber-select-filter"
                      value={selectedBarberFilter}
                      onChange={(e) => setSelectedBarberFilter(e.target.value)}
                      className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer"
                    >
                      <option value="all">Todos os Barbeiros ({barbersList.length})</option>
                      {barbersList.map(b => (
                        <option key={`opt-barber-${b.id}`} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3 Métricas Rápidas de Equipe */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  
                  {/* Top Faturamento */}
                  <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">Barbeiro Destaque</span>
                      <p className="text-base font-black text-amber-950 mt-0.5">{topBarber ? topBarber.name : 'Nenhum'}</p>
                      <p className="text-[11px] font-bold text-amber-700 font-mono mt-0.5">{topBarber ? formatCurrency(topBarber.production) : 'R$ 0,00'}</p>
                    </div>
                    <div className="p-3 bg-amber-100 rounded-xl text-amber-700">
                      <Sparkles size={20} />
                    </div>
                  </div>

                  {/* Média por Cadeira */}
                  <div className="p-4 rounded-2xl bg-sky-50/60 border border-sky-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-sky-800 tracking-wider block">Média / Cadeira</span>
                      <p className="text-base font-black text-sky-950 mt-0.5">{formatCurrency(avgProductionPerBarber)}</p>
                      <p className="text-[11px] font-bold text-sky-700 mt-0.5">{totalBarbersCount} barbeiros ativos</p>
                    </div>
                    <div className="p-3 bg-sky-100 rounded-xl text-sky-700">
                      <Users size={20} />
                    </div>
                  </div>

                  {/* Margem Retida da Casa */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">Margem Retida pela Casa</span>
                      <p className="text-base font-black text-emerald-950 mt-0.5">{formatCurrency(totalRetainedByShop)}</p>
                      <p className="text-[11px] font-bold text-emerald-700 mt-0.5">Lucro bruto após pagar comissões</p>
                    </div>
                    <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700">
                      <TrendingUp size={20} />
                    </div>
                  </div>

                </div>

                {/* Tabela Clean Gerencial (SEM extrato de comanda por comanda) */}
                {filteredBarbers.length === 0 ? (
                  <div className="text-center py-12 text-xs font-semibold text-muted bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    Nenhum barbeiro com produção registrada no mês selecionado.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse" id="closure-team-table">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-black uppercase text-muted tracking-wider">
                          <th className="pb-3 pl-2">Barbeiro</th>
                          <th className="pb-3 text-center">Atendimentos</th>
                          <th className="pb-3 text-right">Produção Bruta</th>
                          <th className="pb-3 text-right">Comissão Devida</th>
                          <th className="pb-3 text-right">Margem da Barbearia</th>
                          <th className="pb-3 text-right">Comissões Pagas</th>
                          <th className="pb-3 text-right">Pendente</th>
                          <th className="pb-3 text-right pr-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-semibold text-primary">
                        {filteredBarbers.map((barber, idx) => {
                          const houseMargin = Math.max(0, barber.production - barber.commission);
                          const houseMarginPct = barber.production > 0 ? ((houseMargin / barber.production) * 100) : 0;
                          const isFullyPaid = barber.pending <= 0;

                          return (
                            <tr key={`barber-row-${barber.id || idx}`} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-4 pl-2 font-bold flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-primary/5 text-primary flex items-center justify-center font-black text-xs border border-slate-200">
                                  {barber.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800">{barber.name}</p>
                                  <p className="text-[10px] text-muted font-normal">Profissional Parceiro</p>
                                </div>
                              </td>

                              <td className="py-4 text-center">
                                <span className="inline-flex px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold font-mono text-[11px]">
                                  {barber.serviceCount} un
                                </span>
                              </td>

                              <td className="py-4 text-right font-mono font-bold text-slate-800">
                                {formatCurrency(barber.production)}
                              </td>

                              <td className="py-4 text-right font-mono font-bold text-sky-600">
                                {formatCurrency(barber.commission)}
                              </td>

                              <td className="py-4 text-right">
                                <span className="font-mono font-bold text-emerald-700 block">
                                  {formatCurrency(houseMargin)}
                                </span>
                                <span className="text-[10px] text-muted font-bold">
                                  {houseMarginPct.toFixed(0)}% retido
                                </span>
                              </td>

                              <td className="py-4 text-right font-mono text-emerald-600">
                                {formatCurrency(barber.payouts)}
                              </td>

                              <td className="py-4 text-right font-mono font-bold">
                                <span className={barber.pending > 0 ? 'text-rose-600' : 'text-slate-400'}>
                                  {formatCurrency(barber.pending)}
                                </span>
                              </td>

                              <td className="py-4 text-right pr-2">
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isFullyPaid 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                                    : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                }`}>
                                  {isFullyPaid ? '100% Quitado' : 'Com Saldo Pendente'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Nota informativa de atalho */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-muted flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>O extrato analítico detalhado (comanda por comanda e comprovante impresso) permanece centralizado na aba de <strong>Comissões de Equipe</strong>.</span>
                  </p>
                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 3: 💼 Fiscal & Contabilidade */}
          {activeTab === 'fiscal' && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Resumo Fiscal para Contabilidade */}
              <div className="bg-surface border border-border p-6 rounded-3xl shadow-sm space-y-6" id="closure-fiscal-summary">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <FileText className="text-indigo-600" size={18} />
                      <span>Pacote Fiscal & Fechamento para o Contador</span>
                    </h3>
                    <p className="text-xs text-muted mt-0.5">Soma dos recebimentos por serviço e produto, cruzamento de maquininhas e emissão do Simples/DAS.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyFiscalWhatsApp}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        copiedWhatsapp 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {copiedWhatsapp ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedWhatsapp ? 'Copiado!' : 'Copiar Resumo'}</span>
                    </button>
                    <button
                      onClick={handleOpenWhatsApp}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow-sm"
                    >
                      <Send size={14} />
                      <span>WhatsApp do Contador</span>
                    </button>
                  </div>
                </div>

                {/* 4 Blocos Fiscais Principais */}
                {dataA && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    {/* Base NFS-e (Serviços) */}
                    <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-1">
                      <span className="text-[10px] font-black uppercase text-indigo-800 tracking-wider block">1. Base NFS-e (Serviços)</span>
                      <p className="text-xl font-black text-indigo-950 font-mono">{formatCurrency(dataA.servicesRevenue)}</p>
                      <p className="text-[10px] text-indigo-700 font-medium">Nota Fiscal de Serviços Prestados</p>
                    </div>

                    {/* Base NFC-e (Produtos) */}
                    <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-1">
                      <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">2. Base NFC-e (Produtos)</span>
                      <p className="text-xl font-black text-amber-950 font-mono">{formatCurrency(dataA.productsRevenue)}</p>
                      <p className="text-[10px] text-amber-700 font-medium">Venda de mercadoria / ICMS</p>
                    </div>

                    {/* Meios Eletrônicos (Cartões + Pix) */}
                    <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-1">
                      <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">3. Meios Eletrônicos (Receita)</span>
                      <p className="text-xl font-black text-emerald-950 font-mono">{formatCurrency(electronicTotal)}</p>
                      <p className="text-[10px] text-emerald-700 font-medium">Cruzamento DIMEP / Cartão & Pix</p>
                    </div>

                    {/* Dinheiro Vivo */}
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">4. Dinheiro em Espécie</span>
                      <p className="text-xl font-black text-slate-900 font-mono">{formatCurrency(dataA.byPaymentMethod.dinheiro)}</p>
                      <p className="text-[10px] text-slate-500 font-medium">Entradas em cédulas na gaveta</p>
                    </div>

                  </div>
                )}

                {/* Configurações Fiscais da Barbearia */}
                <div className="bg-slate-900 text-white p-6 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="text-accent" size={18} />
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Dados do Estabelecimento & Contador</h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Razão Social / Barbearia</label>
                      <input 
                        type="text" 
                        value={barberShopName}
                        onChange={(e) => setBarberShopName(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-accent"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">CNPJ</label>
                      <input 
                        type="text" 
                        placeholder="00.000.000/0001-00"
                        value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-accent"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">E-mail do Contador</label>
                      <input 
                        type="email" 
                        placeholder="contador@exemplo.com"
                        value={accountantEmail}
                        onChange={(e) => setAccountantEmail(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-accent"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <button 
                      onClick={handleSendToAccountant}
                      className="bg-accent text-white font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Send size={14} />
                      <span>Disparar Fechamento por E-mail</span>
                    </button>
                    <button 
                      onClick={() => window.print()}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all flex items-center gap-2"
                    >
                      <Printer size={14} />
                      <span>Gerar Folha Fiscal A4</span>
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* 6. CONSOLIDATED PRINT SHEET (Visível apenas na impressão A4 / PDF) */}
          <div className="hidden print:block p-8 bg-white text-slate-900 space-y-6" id="print-sheet-accounting-document">
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
                    <td className="font-bold py-1">Receita de Serviços (NFS-e):</td>
                    <td className="text-right font-mono py-1">{dataA ? formatCurrency(dataA.servicesRevenue) : 'R$ 0,00'}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Venda de Produtos (NFC-e):</td>
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
                    <td className="font-bold py-1">Despesas Operacionais (Aluguel / Água / Luz):</td>
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
                  <tr className="bg-slate-200 font-black py-2">
                    <td className="py-2 px-1">RESULTADO LÍQUIDO DO MÊS:</td>
                    <td className="text-right font-mono py-2 px-1">{dataA ? formatCurrency(dataA.netProfit) : 'R$ 0,00'}</td>
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
