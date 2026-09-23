import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Minus, 
  Calendar, 
  Search, 
  Filter, 
  Pencil, 
  Trash2, 
  Lock, 
  AlertTriangle, 
  X, 
  Loader2, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CreditCard, 
  Smartphone, 
  Wallet, 
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Receipt,
  Tag,
  Settings,
  PieChart as PieIcon,
  BarChart3,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Layers,
  Repeat
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { parseDate } from '../../lib/utils';
import { FinancialTransaction, DailyCash, TransactionType, PaymentMethod, FinancialCategory } from '../../types';
import { financialService } from '../../services/financialService';
import { toast } from 'sonner';

interface EntriesExitsManagerProps {
  transactions: FinancialTransaction[];
  currentCash: DailyCash | null;
  dateRange: { start: string; end: string };
  loadData: () => void;
  isAdmin: boolean;
  isGerente: boolean;
  onOpenNewTransaction: (type: TransactionType) => void;
  onReopenCash: (cash: DailyCash) => void;
  onViewMovement?: (movement: any) => void;
}

function PaymentIcon({ method }: { method: any }) {
  const m = String(method || '').toLowerCase();
  if (m.includes('pix')) return <Smartphone size={15} className="text-emerald-500" />;
  if (m.includes('dinheiro') || m.includes('money') || m.includes('especie')) return <Wallet size={15} className="text-emerald-500" />;
  if (m.includes('debito') || m.includes('débito')) return <CreditCard size={15} className="text-blue-500" />;
  if (m.includes('credito') || m.includes('crédito') || m.includes('cartao') || m.includes('cartão')) return <CreditCard size={15} className="text-indigo-500" />;
  return <DollarSign size={15} className="text-slate-400" />;
}

const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#3b82f6', '#10b981', 
  '#64748b', '#84cc16'
];

export function EntriesExitsManager({
  transactions,
  currentCash,
  dateRange,
  loadData,
  isAdmin,
  isGerente,
  onOpenNewTransaction,
  onReopenCash,
  onViewMovement
}: EntriesExitsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'income' | 'expense' | 'sangria'>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showAnalytics, setShowAnalytics] = useState(true);

  // Modals state
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<FinancialTransaction | null>(null);
  const [checkingCashId, setCheckingCashId] = useState<string | null>(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [closedCashAdvice, setClosedCashAdvice] = useState<{
    isOpen: boolean;
    transaction: FinancialTransaction;
    cashSession: DailyCash;
    action: 'edit' | 'delete';
  } | null>(null);

  // Extract unique categories from current transactions
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  // Filtered transactions based on search and selected filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Quick Filter Tab
      if (quickFilter === 'income' && t.type !== 'income') return false;
      if (quickFilter === 'expense' && t.type !== 'expense') return false;
      if (quickFilter === 'sangria') {
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const isSangriaOrVale = desc.includes('sangria') || desc.includes('vale') || cat.includes('sangria') || cat.includes('vale');
        if (!isSangriaOrVale) return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== 'all' && t.paymentMethod !== paymentMethodFilter) return false;

      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

      // Search text query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = (t.description || '').toLowerCase().includes(q);
        const clientMatch = (t.cliente_name || '').toLowerCase().includes(q);
        const catMatch = (t.category || '').toLowerCase().includes(q);
        const methodMatch = (t.paymentMethod || '').toLowerCase().includes(q);
        const amountMatch = (t.amount || 0).toString().includes(q);
        return descMatch || clientMatch || catMatch || methodMatch || amountMatch;
      }

      return true;
    });
  }, [transactions, quickFilter, paymentMethodFilter, categoryFilter, searchQuery]);

  // Comprehensive Metrics on current filtered dataset
  const metrics = useMemo(() => {
    let incomeTotal = 0;
    let expenseTotal = 0;
    let sangriasValesTotal = 0;

    transactions.forEach(t => {
      if (t.status === 'pago') {
        if (t.type === 'income') {
          incomeTotal += t.amount || 0;
        } else if (t.type === 'expense') {
          expenseTotal += t.amount || 0;
          const desc = (t.description || '').toLowerCase();
          const cat = (t.category || '').toLowerCase();
          if (desc.includes('sangria') || desc.includes('vale') || cat.includes('sangria') || cat.includes('vale')) {
            sangriasValesTotal += t.amount || 0;
          }
        }
      }
    });

    const balance = incomeTotal - expenseTotal;
    const marginPct = incomeTotal > 0 ? (balance / incomeTotal) * 100 : 0;

    return {
      income: incomeTotal,
      expense: expenseTotal,
      balance,
      marginPct,
      sangriasVales: sangriasValesTotal,
      count: filteredTransactions.length,
      totalCountAll: transactions.length
    };
  }, [transactions, filteredTransactions]);

  // Chart 1 Data: Daily Comparison (Entradas vs Saídas)
  const dailyChartData = useMemo(() => {
    const map = new Map<string, { dateLabel: string; rawDate: string; income: number; expense: number }>();

    transactions.forEach(t => {
      if (t.status === 'pago') {
        const rawDate = t.date ? t.date.substring(0, 10) : '';
        if (!rawDate) return;

        let dateLabel = rawDate;
        try {
          dateLabel = format(parseISO(rawDate), 'dd/MM');
        } catch (e) {
          dateLabel = rawDate;
        }

        if (!map.has(rawDate)) {
          map.set(rawDate, { dateLabel, rawDate, income: 0, expense: 0 });
        }

        const entry = map.get(rawDate)!;
        if (t.type === 'income') {
          entry.income += t.amount || 0;
        } else {
          entry.expense += t.amount || 0;
        }
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
      .map(d => ({
        ...d,
        incomeFormatted: d.income.toFixed(2),
        expenseFormatted: d.expense.toFixed(2)
      }));
  }, [transactions]);

  // Chart 2 Data: Expenses Breakdown by Category (Donut PieChart)
  const expenseCategoryData = useMemo(() => {
    const catMap = new Map<string, number>();
    let totalExpense = 0;

    transactions.forEach(t => {
      if (t.type === 'expense' && t.status === 'pago') {
        const catName = t.category ? t.category.trim() : 'Geral';
        catMap.set(catName, (catMap.get(catName) || 0) + (t.amount || 0));
        totalExpense += t.amount || 0;
      }
    });

    const result = Array.from(catMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: totalExpense > 0 ? (value / totalExpense) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    return result;
  }, [transactions]);

  // Paginated transactions
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage, pageSize]);

  // Cash Validation before Edit
  const handleInitiateEdit = async (transaction: FinancialTransaction) => {
    if (transaction.comanda_id) {
      toast.info("Lançamentos de comanda devem ser consultados e reabertos pela comanda.");
      if (onViewMovement) {
        onViewMovement({ ...transaction, referencia_id: transaction.comanda_id });
      }
      return;
    }

    setCheckingCashId(transaction.id);
    try {
      const statusResult = await financialService.checkCashStatusForDate(transaction.date);
      if (statusResult.exists && statusResult.status === 'closed' && statusResult.cashSession) {
        setClosedCashAdvice({
          isOpen: true,
          transaction,
          cashSession: statusResult.cashSession,
          action: 'edit'
        });
        return;
      }
      setEditingTransaction(transaction);
    } catch (err) {
      console.error("Erro ao verificar status do caixa:", err);
      toast.error("Erro ao verificar status do caixa.");
    } finally {
      setCheckingCashId(null);
    }
  };

  // Cash Validation before Delete
  const handleInitiateDelete = async (transaction: FinancialTransaction) => {
    if (transaction.comanda_id) {
      toast.info("Lançamentos de comanda devem ser consultados e reabertos pela comanda.");
      if (onViewMovement) {
        onViewMovement({ ...transaction, referencia_id: transaction.comanda_id });
      }
      return;
    }

    setCheckingCashId(transaction.id);
    try {
      const statusResult = await financialService.checkCashStatusForDate(transaction.date);
      if (statusResult.exists && statusResult.status === 'closed' && statusResult.cashSession) {
        setClosedCashAdvice({
          isOpen: true,
          transaction,
          cashSession: statusResult.cashSession,
          action: 'delete'
        });
        return;
      }
      setDeletingTransaction(transaction);
    } catch (err) {
      console.error("Erro ao verificar status do caixa:", err);
      toast.error("Erro ao verificar status do caixa.");
    } finally {
      setCheckingCashId(null);
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn" id="entries-exits-view">
      {/* Top Indicators KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600/90 block mb-1">
              Entradas Acumuladas
            </span>
            <p className="text-2xl font-black text-emerald-600">
              + R$ {metrics.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 font-bold mt-1 block">Receitas brutas de caixa</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <ArrowUpRight size={22} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600/90 block mb-1">
              Saídas Acumuladas
            </span>
            <p className="text-2xl font-black text-rose-600">
              - R$ {metrics.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 font-bold mt-1 block">Despesas, Sangrias & Vales</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
            <ArrowDownLeft size={22} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
              Saldo Líquido
            </span>
            <p className={`text-2xl font-black ${metrics.balance >= 0 ? 'text-primary' : 'text-rose-600'}`}>
              R$ {metrics.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <span className={`text-[10px] font-black mt-1 block ${metrics.marginPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Margem: {metrics.marginPct.toFixed(1)}% de retenção
            </span>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
            metrics.balance >= 0 ? 'bg-slate-50 text-primary border-slate-200' : 'bg-rose-50 text-rose-600 border-rose-200'
          }`}>
            <DollarSign size={22} />
          </div>
        </div>

        <div className="bg-amber-50/60 border border-amber-100/80 rounded-3xl p-6 shadow-xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block mb-1">
              Sangrias & Vales
            </span>
            <p className="text-2xl font-black text-amber-900">
              R$ {metrics.sangriasVales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-amber-700 font-bold mt-1 block">Retiradas diretas de caixa</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white text-amber-600 flex items-center justify-center border border-amber-200 shadow-2xs">
            <TrendingDown size={22} />
          </div>
        </div>
      </div>

      {/* Visual Analytics / Charts Section (Collapsible) */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-primary">Painel de Análise & Raio-X Financeiro</h3>
              <p className="text-xs text-muted font-medium">Visualização comparativa de movimentações e composição por despesas</p>
            </div>
          </div>
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:text-primary hover:bg-slate-50 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            {showAnalytics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>{showAnalytics ? 'Ocultar Gráficos' : 'Exibir Gráficos'}</span>
          </button>
        </div>

        <AnimatePresence>
          {showAnalytics && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 border-b border-slate-100"
            >
              {/* Chart 1: Daily Income vs Expense Comparison */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-primary flex items-center gap-2">
                      <BarChart3 size={16} className="text-emerald-500" />
                      Fluxo Diário: Entradas x Saídas
                    </h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">Comparativo dia a dia no período</p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Entradas
                    </span>
                    <span className="flex items-center gap-1 text-rose-600">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Saídas
                    </span>
                  </div>
                </div>

                {dailyChartData.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted font-bold text-xs italic">
                    Nenhum lançamento no período para gerar o gráfico.
                  </div>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip 
                          formatter={(val: any) => [`R$ ${parseFloat(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                          contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '11px', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="income" name="Entradas" fill="#10b981" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="expense" name="Saídas" fill="#ef4444" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Chart 2: Expenses Breakdown by Category */}
              <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-black text-primary flex items-center gap-2">
                      <PieIcon size={16} className="text-rose-500" />
                      Raio-X de Saídas por Categoria
                    </h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">Onde o dinheiro está sendo gasto</p>
                  </div>
                  <span className="text-xs font-black text-rose-600">
                    Total: R$ {metrics.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {expenseCategoryData.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-muted font-bold text-xs italic">
                    Nenhuma saída/despesa registrada no período.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div className="h-56 w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={expenseCategoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {expenseCategoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(val: any, name: any, props: any) => [
                              `R$ ${parseFloat(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${props.payload.percentage.toFixed(1)}%)`,
                              'Saída'
                            ]}
                            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {expenseCategoryData.map((item, idx) => (
                        <div key={`exp-cat-legend-${idx}`} className="flex items-center justify-between text-xs p-2 rounded-xl bg-white border border-slate-100">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span 
                              className="w-3 h-3 rounded-full shrink-0" 
                              style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }} 
                            />
                            <span className="font-bold text-primary truncate">{item.name}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-black text-slate-800">R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <span className="text-[9px] font-bold text-slate-400">{item.percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Extrat Container */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {/* Header Toolbar & Action Buttons */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-black text-primary">Lançamentos Financeiros de Entradas e Saídas</h3>
            <p className="text-xs text-muted font-medium mt-1">
              Registro completo de movimentações, sangrias, aportes e quitações do caixa.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsCategoryManagerOpen(true)}
              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:text-primary hover:bg-slate-50 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
            >
              <Tag size={15} className="text-amber-500" />
              <span>⚙️ Categorias de Despesas</span>
            </button>
            <button 
              onClick={() => onOpenNewTransaction('income')}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-md shadow-emerald-600/10 cursor-pointer active:scale-95"
            >
              <Plus size={15} />
              Nova Entrada (+ R$)
            </button>
            <button 
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition-all flex items-center gap-2 shadow-md shadow-rose-600/10 cursor-pointer active:scale-95"
            >
              <Minus size={15} />
              Nova Saída (- R$)
            </button>
          </div>
        </div>

        {/* Quick Filter Navigation Pills */}
        <div className="px-8 py-4 bg-slate-50/40 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => { setQuickFilter('all'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              quickFilter === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>📋 Todos ({metrics.totalCountAll})</span>
          </button>
          <button
            onClick={() => { setQuickFilter('income'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              quickFilter === 'income'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200'
            }`}
          >
            <ArrowUpRight size={14} />
            <span>🟢 Entradas (+ R$ {metrics.income.toFixed(2)})</span>
          </button>
          <button
            onClick={() => { setQuickFilter('expense'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              quickFilter === 'expense'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-200'
            }`}
          >
            <ArrowDownLeft size={14} />
            <span>🔴 Saídas (- R$ {metrics.expense.toFixed(2)})</span>
          </button>
          <button
            onClick={() => { setQuickFilter('sangria'); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              quickFilter === 'sangria'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-amber-800 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            <TrendingDown size={14} />
            <span>💸 Sangrias e Vales (R$ {metrics.sangriasVales.toFixed(2)})</span>
          </button>
        </div>

        {/* Detailed Search and Dropdown Filters */}
        <div className="p-6 bg-slate-50/20 border-b border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Buscar por descrição, cliente, categoria ou valor..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all shadow-2xs"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {availableCategories.map((cat, cIdx) => (
                <option key={`cat-filter-${cat || cIdx}-${cIdx}`} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={paymentMethodFilter}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs cursor-pointer"
            >
              <option value="all">Todas as Formas de Pagamento</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debito">Cartão Débito</option>
              <option value="credito">Cartão Crédito</option>
              <option value="fiado">Fiado (Pendente)</option>
              <option value="outro">Outros</option>
            </select>
          </div>
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto">
          {paginatedTransactions.length === 0 ? (
            <div className="text-center py-20 text-muted font-bold italic text-sm">
              Nenhuma movimentação financeira encontrada para os filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo / Movimentação</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor (R$)</th>
                  <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-4 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTransactions.map((t, idx) => {
                  const isIncome = t.type === 'income';
                  const isPaid = t.status === 'pago';

                  return (
                    <tr key={`trans-row-${t.id || idx}-${idx}`} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                            isIncome
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                              : 'bg-rose-50 text-rose-600 border-rose-100'
                          }`}>
                            {isIncome ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                          </div>
                          <div>
                            <p className="text-xs font-black text-primary">{t.description || 'Movimentação sem descrição'}</p>
                            {t.cliente_name && (
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Cliente: {t.cliente_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                          {t.category || 'Geral'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-xs font-bold text-slate-500">
                        {t.date ? format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 capitalize">
                          <PaymentIcon method={t.paymentMethod} />
                          <span>{t.paymentMethod}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right font-black text-sm">
                        <span className={isIncome ? 'text-emerald-600' : 'text-rose-600'}>
                          {isIncome ? '+' : '-'} R$ {(t.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                          isPaid 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                            : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {isPaid ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleInitiateEdit(t)}
                            disabled={checkingCashId === t.id}
                            className="p-2 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all cursor-pointer shadow-2xs"
                            title="Editar Lançamento"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleInitiateDelete(t)}
                            disabled={checkingCashId === t.id}
                            className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-xl transition-all cursor-pointer shadow-2xs"
                            title="Excluir Lançamento"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-bold">
              Página {currentPage} de {totalPages} ({filteredTransactions.length} registros)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 disabled:opacity-40 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Category Management */}
      <AnimatePresence>
        {isCategoryManagerOpen && (
          <CategoryManagerModal
            onClose={() => setIsCategoryManagerOpen(false)}
            onCategoryUpdated={() => {
              loadData();
            }}
          />
        )}
      </AnimatePresence>

      {/* MODAL: Edit Transaction */}
      <AnimatePresence>
        {editingTransaction && (
          <EditTransactionModal
            transaction={editingTransaction}
            categories={availableCategories}
            onClose={() => setEditingTransaction(null)}
            onSuccess={() => {
              setEditingTransaction(null);
              loadData();
            }}
            onRequireReopen={(cashSession) => {
              setEditingTransaction(null);
              onReopenCash(cashSession);
            }}
          />
        )}
      </AnimatePresence>

      {/* MODAL: Delete Transaction */}
      <AnimatePresence>
        {deletingTransaction && (
          <DeleteTransactionModal
            transaction={deletingTransaction}
            onClose={() => setDeletingTransaction(null)}
            onSuccess={() => {
              setDeletingTransaction(null);
              loadData();
            }}
            onRequireReopen={(cashSession) => {
              setDeletingTransaction(null);
              onReopenCash(cashSession);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------
// SUB-MODAL: Category Management (Tipos & Categorias de Despesas)
// ----------------------------------------------------
function CategoryManagerModal({
  onClose,
  onCategoryUpdated
}: {
  onClose: () => void;
  onCategoryUpdated: () => void;
}) {
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('expense');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const cats = await financialService.getCategories();
      setCategories(cats);
    } catch (e) {
      console.error("Erro ao carregar categorias:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setSubmitting(true);
    try {
      await financialService.createCategory(newCatName.trim(), newCatType);
      toast.success(`Categoria "${newCatName}" criada com sucesso!`);
      setNewCatName('');
      fetchCategories();
      onCategoryUpdated();
    } catch (err) {
      console.error("Erro ao criar categoria:", err);
      toast.error("Erro ao cadastrar categoria.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (catId: string, name: string) => {
    if (!window.confirm(`Deseja desativar a categoria "${name}"?`)) return;
    try {
      await financialService.deleteCategory(catId);
      toast.success("Categoria desativada.");
      fetchCategories();
      onCategoryUpdated();
    } catch (err) {
      toast.error("Erro ao remover categoria.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-primary">Categorias de Despesas e Entradas</h3>
              <p className="text-xs text-muted font-medium">Cadastre categorias para organizar saídas e relatórios</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-primary rounded-xl hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
            <label className="text-[10px] font-black text-primary uppercase tracking-widest block">Cadastrar Nova Categoria</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Ex: Aluguel, Publicidade..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="sm:col-span-2 bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
              />
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value as TransactionType)}
                className="bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="expense">🔴 Saída / Despesa</option>
                <option value="income">🟢 Entrada / Receita</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting || !newCatName.trim()}
              className="w-full py-2.5 bg-primary text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              <span>Adicionar Categoria</span>
            </button>
          </form>

          {/* List of Registered Categories */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Categorias Personalizadas Ativas</h4>
            {loading ? (
              <div className="py-8 flex items-center justify-center text-muted gap-2 text-xs">
                <Loader2 size={16} className="animate-spin" />
                <span>Carregando...</span>
              </div>
            ) : categories.length === 0 ? (
              <div className="py-6 text-center text-muted text-xs font-bold italic">
                Nenhuma categoria personalizada criada ainda. As categorias padrão do sistema serão usadas.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/50">
                {categories.map((cat) => (
                  <div key={cat.id} className="p-3.5 flex items-center justify-between hover:bg-white transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${cat.type === 'expense' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span className="text-xs font-bold text-primary">{cat.name}</span>
                      <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                        {cat.type === 'expense' ? 'Despesa' : 'Receita'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Desativar Categoria"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 text-right">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-MODAL: Edit Transaction
// ----------------------------------------------------
function EditTransactionModal({
  transaction,
  categories,
  onClose,
  onSuccess,
  onRequireReopen
}: {
  transaction: FinancialTransaction;
  categories: string[];
  onClose: () => void;
  onSuccess: () => void;
  onRequireReopen: (cash: DailyCash) => void;
}) {
  const [formData, setFormData] = useState({
    description: transaction.description || '',
    amount: transaction.amount || 0,
    date: transaction.date || format(new Date(), 'yyyy-MM-dd'),
    category: transaction.category || 'Geral',
    paymentMethod: transaction.paymentMethod || 'dinheiro'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || formData.amount <= 0) {
      toast.error("Preencha descrição e valor válidos!");
      return;
    }

    setIsSubmitting(true);
    try {
      await financialService.updateTransactionWithCashCheck(
        transaction.id,
        {
          description: formData.description.trim(),
          amount: formData.amount,
          date: formData.date,
          category: formData.category.trim() || 'Geral',
          paymentMethod: formData.paymentMethod
        },
        transaction
      );
      toast.success("Movimentação atualizada com sucesso!");
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao atualizar transação:", err);
      if (err.cashClosed && err.cashSession) {
        toast.error(err.message || "O caixa desta data está fechado.");
        onRequireReopen(err.cashSession);
      } else {
        toast.error(err.message || "Erro ao atualizar movimentação.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-primary">Editar Movimentação</h3>
            <p className="text-xs text-muted font-medium">Os valores e categorias serão sincronizados com o caixa</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-primary rounded-xl hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descrição</label>
            <input
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
              placeholder="Ex: Compra de materiais, Aluguel..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor (R$)</label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={isNaN(formData.amount) ? '' : formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-10 pr-4 text-xs font-black text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data</label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
              <input
                type="text"
                list="category-suggestions"
                required
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all"
                placeholder="Ex: Geral, Aluguel..."
              />
              <datalist id="category-suggestions">
                {categories.map((cat, cIdx) => (
                  <option key={`cat-sug-${cat || cIdx}-${cIdx}`} value={cat} />
                ))}
              </datalist>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Forma de Pagamento</label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value as any }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all cursor-pointer"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">PIX</option>
                <option value="debito">Cartão Débito</option>
                <option value="credito">Cartão Crédito</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-muted flex items-center gap-2">
            <Sparkles size={14} className="text-accent shrink-0" />
            <span>A alteração do valor ajustará automaticamente o saldo esperado do caixa de {formData.date}.</span>
          </div>

          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-primary hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ----------------------------------------------------
// SUB-MODAL: Delete Transaction Confirmation
// ----------------------------------------------------
function DeleteTransactionModal({
  transaction,
  onClose,
  onSuccess,
  onRequireReopen
}: {
  transaction: FinancialTransaction;
  onClose: () => void;
  onSuccess: () => void;
  onRequireReopen: (cash: DailyCash) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await financialService.deleteTransaction(transaction);
      toast.success("Movimentação removida e saldo do caixa estornado com sucesso!");
      onSuccess();
    } catch (err: any) {
      console.error("Erro ao excluir transação:", err);
      if (err.cashClosed && err.cashSession) {
        toast.error(err.message || "O caixa desta data está fechado.");
        onRequireReopen(err.cashSession);
      } else {
        toast.error(err.message || "Erro ao remover movimentação.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-red-200 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-6 bg-red-50/80 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center shadow-sm">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-red-950">Excluir Movimentação</h3>
              <p className="text-xs text-red-700 font-medium">Confirmação de estorno contábil</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-red-400 hover:text-red-700 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Descrição:</span>
              <strong className="text-primary font-black">{transaction.description}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Valor:</span>
              <strong className={`font-black ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                {transaction.type === 'income' ? '+' : '-'} R$ {(transaction.amount || 0).toFixed(2)}
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Data:</span>
              <span className="text-primary font-bold">{transaction.date ? format(new Date(transaction.date + 'T00:00:00'), 'dd/MM/yyyy') : '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Método:</span>
              <span className="text-primary font-bold uppercase">{transaction.paymentMethod}</span>
            </div>
          </div>

          <div className="p-4 bg-amber-50/60 border border-amber-200/60 rounded-2xl text-xs text-amber-900 leading-relaxed font-medium">
            Esta operação removerá o lançamento do histórico financeiro e <strong>estornará automaticamente</strong> o valor correspondente do caixa de <strong>{transaction.date ? format(new Date(transaction.date + 'T00:00:00'), 'dd/MM/yyyy') : 'hoje'}</strong>.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar Exclusão'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
