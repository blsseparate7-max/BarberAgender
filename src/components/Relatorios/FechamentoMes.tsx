import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  setDoc,
  getDoc
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
  CreditCard, 
  Percent, 
  CheckCircle2, 
  AlertCircle,
  Users,
  Send,
  Building2,
  Sparkles,
  RefreshCw,
  Lock,
  Unlock,
  Copy,
  Check,
  MessageCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, endOfMonth, parseISO, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { normalizeDate, isDateInRange, calculateStandardFinancialMetrics } from '../../utils/financialCalculations';
import { FinancialTransaction, ClientDebt } from '../../types';

interface MonthData {
  monthStr: string; // e.g. "2026-09"
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

  // Means of Payment
  byPaymentMethod: {
    pix: number;
    dinheiro: number;
    credito: number;
    debito: number;
    fiado: number;
    outros: number;
  };

  // Team summary
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

  pendingCommissionsCount: number;
  pendingCommissionsValue: number;
  completedAtendimentosCount: number;
  totalComandasCount: number;
  isSealed?: boolean;
}

export function FechamentoMes() {
  const currentTenantId = getActiveTenantId();
  const { profile } = useAuth();
  
  // Selected Month
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState<boolean>(true);
  const [dataA, setDataA] = useState<MonthData | null>(null);

  // Accounting Profile state
  const [barberShopName, setBarberShopName] = useState<string>('Barbearia Real');
  const [cnpj, setCnpj] = useState<string>('');
  const [accountantEmail, setAccountantEmail] = useState<string>('');
  const [copiedWhatsapp, setCopiedWhatsapp] = useState<boolean>(false);
  const [isSealing, setIsSealing] = useState<boolean>(false);

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
    loadMonthData();
  }, [selectedMonth, currentTenantId]);

  const loadMonthData = async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const monthData = await fetchMonthMetricsBounded(selectedMonth);
      setDataA(monthData);
    } catch (err: any) {
      console.error("Erro ao carregar fechamento mensal:", err);
      toast.error("Erro ao carregar dados do fechamento mensal: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // LIGHTWEIGHT FETCH: Direct Date-Bounded Queries on Firestore
  const fetchMonthMetricsBounded = async (monthStr: string): Promise<MonthData> => {
    const startDate = `${monthStr}-01`;
    const endDate = format(endOfMonth(parseISO(`${startDate}T12:00:00`)), 'yyyy-MM-dd');

    // Safe helper query with date range constraints
    const safeDateQuery = async (collectionName: string) => {
      try {
        const snap = await getDocs(query(
          collection(db, collectionName),
          where('tenantId', '==', currentTenantId),
          where('date', '>=', startDate),
          where('date', '<=', endDate)
        ));
        if (!snap.empty) {
          return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
      } catch (err) {
        // Fallback for missing composite index
      }
      
      const fallbackSnap = await getDocs(query(
        collection(db, collectionName),
        where('tenantId', '==', currentTenantId)
      ));
      return fallbackSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(doc => {
          const d = normalizeDate(doc.date || doc.dueDate || doc.createdAt);
          return isDateInRange(d, startDate, endDate);
        });
    };

    const isDocActive = (doc: any) => {
      if (!doc) return false;
      if (doc.is_deleted || doc.isDeleted) return false;
      const st = String(doc.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'estornado' || st === 'excluido' || st === 'cancelled') return false;
      return true;
    };

    const [transactionsRaw, comandasRaw, commissionsRaw, debtsSnap] = await Promise.all([
      safeDateQuery('financial_transactions'),
      safeDateQuery('comandas'),
      safeDateQuery('commissions'),
      getDocs(query(collection(db, 'client_debts'), where('tenantId', '==', currentTenantId)))
    ]);

    const transactions = transactionsRaw.filter(isDocActive);
    const comandas = comandasRaw.filter(isDocActive);
    const commissions = commissionsRaw.filter(isDocActive);

    const debts = debtsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
    const stdMetrics = calculateStandardFinancialMetrics(transactions as FinancialTransaction[], debts);

    // Check if month is sealed in tenant_month_closures
    let isSealed = false;
    try {
      const closureDoc = await getDoc(doc(db, 'tenant_month_closures', `${currentTenantId}_${monthStr}`));
      if (closureDoc.exists() && closureDoc.data()?.status === 'sealed') {
        isSealed = true;
      }
    } catch (e) {
      // Ignore
    }

    const metrics: MonthData = {
      monthStr,
      grossRevenue: stdMetrics.totalEntradasBruto,
      totalExpenses: stdMetrics.totalSaidasPagas,
      commissionsGenerated: 0,
      netProfit: stdMetrics.saldoOperacionalLiquido,
      servicesRevenue: stdMetrics.byCategory.servicos?.total || 0,
      productsRevenue: stdMetrics.byCategory.produtos?.total || 0,
      subscriptionsRevenue: stdMetrics.byCategory.assinaturas?.total || 0,
      debtPaymentsRevenue: 0,
      otherRevenue: stdMetrics.byCategory.pacotes?.total || 0,
      operationalExpenses: stdMetrics.totalDespesasOperacionais,
      productPurchases: 0,
      sangriaExpenses: stdMetrics.totalSangriasRetiradas,
      otherExpenses: 0,
      byPaymentMethod: {
        pix: stdMetrics.byMethod.pix?.amount || 0,
        dinheiro: stdMetrics.byMethod.dinheiro?.amount || 0,
        credito: stdMetrics.byMethod.credito?.amount || 0,
        debito: stdMetrics.byMethod.debito?.amount || 0,
        fiado: (stdMetrics.byMethod as any).fiado?.amount || 0,
        outros: (stdMetrics.byMethod.online?.amount || 0) + (stdMetrics.byMethod.outros?.amount || 0)
      },
      barberStats: {},
      pendingCommissionsCount: 0,
      pendingCommissionsValue: 0,
      completedAtendimentosCount: 0,
      totalComandasCount: comandas.length,
      isSealed
    };

    // Fine-grained breakdown of transactions
    transactions.forEach((t: any) => {
      const amount = Number(t.amount || 0);
      const isPaid = t.status === 'pago';

      if (t.type === 'income' && isPaid) {
        const desc = (t.description || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        if (desc.includes('fiado') || desc.includes('débito') || t.isDebtPayment || category.includes('fiado')) {
          metrics.debtPaymentsRevenue += amount;
        }
      }

      if ((t.type === 'expense' || t.type === 'saida') && isPaid) {
        const desc = (t.description || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        if (desc.includes('produto') || desc.includes('estoque') || category.includes('produto') || category.includes('estoque')) {
          metrics.productPurchases += amount;
        }
      }
    });

    // Process Commissions
    commissions.forEach((c: any) => {
      const commVal = Number(c.commission_value || 0);
      const baseVal = Number(c.base_value || c.service_price || 0);
      metrics.commissionsGenerated += commVal;

      if (c.status === 'pendente') {
        metrics.pendingCommissionsCount++;
        metrics.pendingCommissionsValue += commVal;
      }

      const bId = c.profissional_id || c.barbeiro_id || 'unassigned';
      const bName = c.profissional_name || c.barbeiro_nome || 'Profissional';

      if (!metrics.barberStats[bId]) {
        metrics.barberStats[bId] = {
          id: bId,
          name: bName,
          production: 0,
          commission: 0,
          payouts: 0,
          pending: 0,
          serviceCount: 0
        };
      }

      metrics.barberStats[bId].production += baseVal;
      metrics.barberStats[bId].commission += commVal;
      metrics.barberStats[bId].serviceCount += 1;
      if (c.status === 'pendente') {
        metrics.barberStats[bId].pending += commVal;
      } else {
        metrics.barberStats[bId].payouts += commVal;
      }
    });

    comandas.forEach((c: any) => {
      if (c.status === 'fechada') {
        metrics.completedAtendimentosCount++;
      }
    });

    return metrics;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const getMonthName = (monthStr: string) => {
    try {
      const date = parseISO(`${monthStr}-01T12:00:00`);
      return format(date, 'MMMM / yyyy', { locale: ptBR });
    } catch {
      return monthStr;
    }
  };

  const handleToggleSealMonth = async () => {
    if (!currentTenantId || !dataA) return;
    setIsSealing(true);
    try {
      const newStatus = dataA.isSealed ? 'open' : 'sealed';
      await setDoc(doc(db, 'tenant_month_closures', `${currentTenantId}_${selectedMonth}`), {
        tenantId: currentTenantId,
        monthStr: selectedMonth,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: profile?.nome || profile?.email || 'Admin'
      }, { merge: true });

      setDataA(prev => prev ? { ...prev, isSealed: newStatus === 'sealed' } : null);
      toast.success(newStatus === 'sealed' ? "Fechamento do mês auditado e selado com sucesso!" : "Fechamento reaberto para edições.");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao alterar status do fechamento.");
    } finally {
      setIsSealing(false);
    }
  };

  const handleCopyWhatsappSummary = () => {
    if (!dataA) return;
    const text = `💈 *FECHAMENTO MENSAL DE CONTAS - ${getMonthName(dataA.monthStr).toUpperCase()}*
📍 Barbearia: ${barberShopName}
${cnpj ? `📄 CNPJ: ${cnpj}\n` : ''}
----------------------------------------
💰 *Faturamento Bruto:* ${formatCurrency(dataA.grossRevenue)}
✂️ *Comissões da Equipe:* ${formatCurrency(dataA.commissionsGenerated)}
📉 *Despesas Operacionais:* ${formatCurrency(dataA.totalExpenses)}
📊 *Resultado Líquido:* ${formatCurrency(dataA.netProfit)}
----------------------------------------
📥 *Entradas por Meio de Pagamento:*
• Pix: ${formatCurrency(dataA.byPaymentMethod.pix)}
• Cartão de Crédito: ${formatCurrency(dataA.byPaymentMethod.credito)}
• Cartão de Débito: ${formatCurrency(dataA.byPaymentMethod.debito)}
• Dinheiro: ${formatCurrency(dataA.byPaymentMethod.dinheiro)}
• Fiados/Dívidas: ${formatCurrency(dataA.byPaymentMethod.fiado)}
----------------------------------------
🔍 *Status de Fechamento:* ${dataA.isSealed ? '🟢 Auditado e Concluído' : '🟡 Em Aberto / Acompanhamento'}

_Relatório emitido via BarberElite Pro_`;

    navigator.clipboard.writeText(text);
    setCopiedWhatsapp(true);
    toast.success("Resumo copiado! Cole direto no WhatsApp do seu contador.");
    setTimeout(() => setCopiedWhatsapp(false), 3000);
  };

  const handleSendToAccountant = () => {
    if (!accountantEmail) {
      toast.error("Informe o e-mail do seu contador para disparar o fechamento.");
      return;
    }

    const mailtoUrl = `mailto:${accountantEmail}?subject=${encodeURIComponent(`Fechamento Contábil ${selectedMonth} - ${barberShopName}`)}&body=${encodeURIComponent(`Prezado Contador,

Segue o resumo do Fechamento Mensal de Contas referente a ${getMonthName(selectedMonth)}:

Barbearia: ${barberShopName}
Faturamento Bruto: ${formatCurrency(dataA?.grossRevenue || 0)}
Comissões da Equipe: ${formatCurrency(dataA?.commissionsGenerated || 0)}
Despesas Operacionais: ${formatCurrency(dataA?.totalExpenses || 0)}
Resultado Líquido: ${formatCurrency(dataA?.netProfit || 0)}

Entradas por Pix: ${formatCurrency(dataA?.byPaymentMethod.pix || 0)}
Entradas em Cartão: ${formatCurrency((dataA?.byPaymentMethod.credito || 0) + (dataA?.byPaymentMethod.debito || 0))}
Entradas em Dinheiro: ${formatCurrency(dataA?.byPaymentMethod.dinheiro || 0)}

Atenciosamente,
${barberShopName}`)}`;

    window.open(mailtoUrl, '_blank');
    toast.success("Interface de e-mail iniciada com o relatório formatado!");
  };

  return (
    <div className="space-y-6" id="fechamento-mes-tab-wrapper">
      
      {/* HEADER & SELETOR DE MÊS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-primary/20 text-accent text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-accent/30 flex items-center gap-1">
              <Sparkles size={12} />
              Dashboard Executivo
            </span>
            {dataA?.isSealed ? (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck size={12} />
                Fechamento Auditado
              </span>
            ) : (
              <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-500/30 flex items-center gap-1">
                <Unlock size={12} />
                Em Acompanhamento
              </span>
            )}
          </div>
          <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
            Fechamento do Mês
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            Resumo sintético para gestão, conferência da equipe e pacote fiscal contábil.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-2xl">
            <Calendar size={16} className="text-accent" />
            <span className="text-xs font-bold text-slate-300">Período:</span>
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white font-black text-xs outline-none cursor-pointer"
            />
          </div>

          <button 
            onClick={loadMonthData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all border border-slate-700 active:scale-95"
            title="Atualizar dados do mês"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-accent" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-slate-50 border border-slate-200 rounded-3xl">
          <RefreshCw className="animate-spin text-primary" size={36} />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">Consolidando fechamento sintético do mês...</p>
        </div>
      ) : !dataA ? (
        <div className="p-12 text-center bg-slate-50 border border-slate-200 rounded-3xl">
          <p className="text-slate-500 font-bold text-sm">Nenhum dado encontrado para o mês selecionado.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* 1. CARDS DE KPIS SINTÉTICOS DO MÊS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Faturamento Bruto */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Faturamento Bruto</span>
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(dataA.grossRevenue)}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span>{dataA.completedAtendimentosCount} comandas finalizadas</span>
              </div>
            </div>

            {/* Card 2: Comissões Produzidas */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Comissões da Equipe</span>
                <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Scissors size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-purple-700 tracking-tight">{formatCurrency(dataA.commissionsGenerated)}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span>{Object.keys(dataA.barberStats).length} profissionais atuantes</span>
              </div>
            </div>

            {/* Card 3: Despesas Totais */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Despesas Operacionais</span>
                <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <TrendingDown size={18} />
                </div>
              </div>
              <p className="text-2xl font-black text-rose-600 tracking-tight">{formatCurrency(dataA.totalExpenses)}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span>Compras + Contas + Sangrias</span>
              </div>
            </div>

            {/* Card 4: Resultado Líquido */}
            <div className={`border p-5 rounded-3xl shadow-sm transition-all ${
              dataA.netProfit >= 0 
                ? 'bg-slate-900 border-slate-800 text-white' 
                : 'bg-rose-950 border-rose-900 text-white'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Resultado Líquido</span>
                <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-400">
                  <TrendingUp size={18} />
                </div>
              </div>
              <p className="text-2xl font-black tracking-tight">{formatCurrency(dataA.netProfit)}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <span>Margem Líquida: {dataA.grossRevenue > 0 ? ((dataA.netProfit / dataA.grossRevenue) * 100).toFixed(1) : 0}%</span>
              </div>
            </div>

          </div>

          {/* 2. MEIOS DE PAGAMENTO & ORIGEM DE RECEITAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Entradas por Meio de Pagamento */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="text-primary" size={18} />
                  <h3 className="font-bold text-slate-900 text-sm">Entradas por Meio de Pagamento</h3>
                </div>
                <span className="text-xs font-black text-slate-500">{getMonthName(selectedMonth)}</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">PIX (Instantâneo)</span>
                  <span className="text-xs font-mono font-black text-emerald-600">{formatCurrency(dataA.byPaymentMethod.pix)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Cartão de Crédito</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.byPaymentMethod.credito)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Cartão de Débito</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.byPaymentMethod.debito)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Dinheiro em Espécie</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.byPaymentMethod.dinheiro)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-100 rounded-2xl">
                  <span className="text-xs font-bold text-amber-800">Fiados / Dívidas de Clientes</span>
                  <span className="text-xs font-mono font-black text-amber-700">{formatCurrency(dataA.byPaymentMethod.fiado)}</span>
                </div>
              </div>
            </div>

            {/* Origem das Receitas */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="text-primary" size={18} />
                  <h3 className="font-bold text-slate-900 text-sm">Origem do Faturamento</h3>
                </div>
                <span className="text-xs font-black text-slate-500">Distribuição</span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Serviços da Cadeira</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.servicesRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Vendas de Produtos</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.productsRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Clubes de Assinatura (VIP)</span>
                  <span className="text-xs font-mono font-black text-emerald-600">{formatCurrency(dataA.subscriptionsRevenue)}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                  <span className="text-xs font-bold text-slate-700">Quitações de Fiados do Período</span>
                  <span className="text-xs font-mono font-black text-slate-900">{formatCurrency(dataA.debtPaymentsRevenue)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* 3. CHECKLIST DE AUDITORIA E MÊS SELADO */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-emerald-600" size={20} />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Checklist de Validação & Auditoria do Mês</h3>
                  <p className="text-[11px] text-slate-500">Verifique a consistência antes de fechar e enviar ao contador.</p>
                </div>
              </div>

              <button
                onClick={handleToggleSealMonth}
                disabled={isSealing}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                  dataA.isSealed 
                    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' 
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                }`}
              >
                {dataA.isSealed ? <Unlock size={14} /> : <Lock size={14} />}
                <span>{dataA.isSealed ? 'Reabrir Mês' : 'Aprovar e Selar Mês'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Status das Comissões</span>
                  {dataA.pendingCommissionsCount === 0 ? (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={10} /> 100% Quitadas
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle size={10} /> {dataA.pendingCommissionsCount} pendentes
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {dataA.pendingCommissionsCount === 0 
                    ? 'Todas as comissões da equipe foram pagas.' 
                    : `Saldo pendente: ${formatCurrency(dataA.pendingCommissionsValue)}`}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Comandas Concluídas</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} /> Ok
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {dataA.completedAtendimentosCount} comandas encerradas e faturadas.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Auditoria Fiscal</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    Pronto p/ Envio
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Valores prontos para o escritório de contabilidade.
                </p>
              </div>
            </div>
          </div>

          {/* 4. DISPARO CONTÁBIL & EXPORTAÇÃO */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-5 border border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-accent/20 text-accent flex items-center justify-center">
                <Send size={20} />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight text-white">Central de Disparo para o Contador</h3>
                <p className="text-xs text-slate-400 font-medium">Exporte ou envie o fechamento contábil consolidado em 1 clique.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">E-mail do Escritório de Contabilidade:</label>
                <div className="flex gap-2">
                  <input 
                    type="email" 
                    placeholder="contador@escritorio.com" 
                    value={accountantEmail}
                    onChange={(e) => setAccountantEmail(e.target.value)}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-accent"
                  />
                  <button 
                    onClick={handleSendToAccountant}
                    className="px-4 py-2 bg-accent hover:brightness-110 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-md"
                  >
                    <Send size={14} />
                    <span>Enviar</span>
                  </button>
                </div>
              </div>

              <div className="flex items-end gap-3 pt-2 md:pt-0">
                <button 
                  onClick={handleCopyWhatsappSummary}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md"
                >
                  {copiedWhatsapp ? <Check size={16} /> : <MessageCircle size={16} />}
                  <span>{copiedWhatsapp ? 'Copiado!' : 'Enviar no WhatsApp'}</span>
                </button>

                <button 
                  onClick={() => window.print()}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-700 active:scale-95"
                >
                  <Printer size={16} />
                  <span>Imprimir Folha A4</span>
                </button>
              </div>
            </div>
          </div>

          {/* 5. IMPRESSÃO A4 (VISÍVEL APENAS AO IMPRIMIR/GERAR PDF) */}
          <div className="hidden print:block p-8 bg-white text-slate-900 space-y-6" id="print-sheet-accounting-document">
            <div className="border-b-2 border-slate-800 pb-4 text-center">
              <h1 className="text-2xl font-black uppercase tracking-tight">{barberShopName}</h1>
              {cnpj && <p className="text-xs font-bold">CNPJ: {cnpj}</p>}
              <p className="text-sm font-bold text-slate-600 mt-1">RELATÓRIO FISCAL E FECHAMENTO DE CONTAS</p>
              <p className="text-xs font-bold">MÊS DE REFERÊNCIA: {getMonthName(dataA.monthStr).toUpperCase()}</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase border-b border-slate-300 pb-1">1. Consolidação de Receitas (Bruto)</h2>
              <table className="w-full text-left text-xs">
                <tbody>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Serviços:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.servicesRevenue)}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Venda de Produtos:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.productsRevenue)}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Clubes de Assinatura:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.subscriptionsRevenue)}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Receita de Quitações de Fiado:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.debtPaymentsRevenue)}</td>
                  </tr>
                  <tr className="bg-slate-100 font-black py-2">
                    <td className="py-2 px-1">TOTAL FATURADO NO PERÍODO:</td>
                    <td className="text-right font-mono py-2 px-1">{formatCurrency(dataA.grossRevenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase border-b border-slate-300 pb-1">2. Saídas, Comissões e Despesas</h2>
              <table className="w-full text-left text-xs">
                <tbody>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Comissões da Equipe:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.commissionsGenerated)}</td>
                  </tr>
                  <tr className="border-b border-slate-200 py-1">
                    <td className="font-bold py-1">Despesas Operacionais:</td>
                    <td className="text-right font-mono py-1">{formatCurrency(dataA.totalExpenses)}</td>
                  </tr>
                  <tr className="bg-slate-200 font-black py-2">
                    <td className="py-2 px-1">RESULTADO LÍQUIDO DO MÊS:</td>
                    <td className="text-right font-mono py-2 px-1">{formatCurrency(dataA.netProfit)}</td>
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
