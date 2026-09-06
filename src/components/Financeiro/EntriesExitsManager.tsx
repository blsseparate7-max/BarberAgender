import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Receipt
} from 'lucide-react';
import { format } from 'date-fns';
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
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals state
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<FinancialTransaction | null>(null);
  const [checkingCashId, setCheckingCashId] = useState<string | null>(null);
  const [closedCashAdvice, setClosedCashAdvice] = useState<{
    isOpen: boolean;
    transaction: FinancialTransaction;
    cashSession: DailyCash;
    action: 'edit' | 'delete';
  } | null>(null);

  // Available categories extracted from transactions
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(t => {
      if (t.category) cats.add(t.category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type filter
      if (typeFilter === 'income' && t.type !== 'income') return false;
      if (typeFilter === 'expense' && t.type !== 'expense') return false;

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
  }, [transactions, typeFilter, paymentMethodFilter, categoryFilter, searchQuery]);

  // Calculate Metrics on filtered period
  const metrics = useMemo(() => {
    let incomeTotal = 0;
    let expenseTotal = 0;
    filteredTransactions.forEach(t => {
      if (t.status === 'pago') {
        if (t.type === 'income') incomeTotal += t.amount || 0;
        if (t.type === 'expense') expenseTotal += t.amount || 0;
      }
    });
    return {
      income: incomeTotal,
      expense: expenseTotal,
      balance: incomeTotal - expenseTotal,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

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
    <div className="space-y-6">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Entradas</span>
            <p className="text-xl font-black text-emerald-600">
              + R$ {metrics.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100/80">
            <ArrowUpRight size={22} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Saídas</span>
            <p className="text-xl font-black text-red-500">
              - R$ {metrics.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center border border-red-100/80">
            <ArrowDownLeft size={22} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Saldo Líquido</span>
            <p className={`text-xl font-black ${metrics.balance >= 0 ? 'text-primary' : 'text-red-600'}`}>
              R$ {metrics.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
            metrics.balance >= 0 ? 'bg-slate-50 text-primary border-slate-200' : 'bg-red-50 text-red-600 border-red-200'
          }`}>
            <DollarSign size={22} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Total Lançamentos</span>
            <p className="text-xl font-black text-primary">
              {metrics.count} <span className="text-xs font-semibold text-muted">registros</span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center border border-slate-200">
            <Receipt size={22} />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {/* Header Toolbar */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-primary">Histórico de Entradas e Saídas</h3>
            <p className="text-xs text-muted font-medium mt-1">
              Gerencie movimentações financeiras, conciliações e sincronização com os caixas diários.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => onOpenNewTransaction('income')}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
            >
              <Plus size={15} />
              Nova Entrada
            </button>
            <button 
              onClick={() => onOpenNewTransaction('expense')}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
            >
              <Minus size={15} />
              Nova Saída
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="p-6 bg-slate-50/30 border-b border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Buscar por descrição, cliente, valor..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all shadow-2xs"
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

            {/* Category Select */}
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-accent shadow-2xs cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Payment Method Select */}
            <select
              value={paymentMethodFilter}
              onChange={(e) => {
                setPaymentMethodFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-accent shadow-2xs cursor-pointer"
            >
              <option value="all">Todas as Formas</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="debito">Cartão Débito</option>
              <option value="credito">Cartão Crédito</option>
              <option value="fiado">Fiado (Pendente)</option>
              <option value="outro">Outros</option>
            </select>
          </div>

          {/* Type Toggle Pills */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl p-1 shadow-2xs self-start lg:self-auto">
            {(['all', 'income', 'expense'] as const).map((filterType) => (
              <button
                key={filterType}
                onClick={() => {
                  setTypeFilter(filterType);
                  setCurrentPage(1);
                }}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  typeFilter === filterType
                    ? 'bg-primary text-white shadow-xs' 
                    : 'text-muted hover:text-primary bg-transparent'
                }`}
              >
                {filterType === 'all' ? 'Ver Tudo' : filterType === 'income' ? 'Entradas (+)' : 'Saídas (-)'}
              </button>
            ))}
          </div>
        </div>

        {/* Date Filter Range Info Banner */}
        <div className="px-8 py-3 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-slate-500" />
            <span>
              Filtrado pelo intervalo: <strong className="text-primary font-black">{format(new Date(dateRange.start + 'T00:00:00'), 'dd/MM/yyyy')}</strong> até <strong className="text-primary font-black">{format(new Date(dateRange.end + 'T00:00:00'), 'dd/MM/yyyy')}</strong>
            </span>
          </div>
          <span className="text-[11px] font-semibold">
            {filteredTransactions.length} de {transactions.length} registros exibidos
          </span>
        </div>

        {/* Table of Transactions */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Descrição & Origem</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Categoria</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">Método</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">Data</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
                <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedTransactions.map((t, index) => {
                const isComanda = Boolean(t.comanda_id);
                const isCheckingThis = checkingCashId === t.id;

                return (
                  <tr key={`trans-${t.id || index}-${index}`} className="hover:bg-slate-50/60 transition-colors">
                    {/* Descrição & Origem */}
                    <td className="px-8 py-5">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          t.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {t.type === 'income' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{t.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {t.cliente_name && (
                              <span className="text-[11px] text-muted font-medium">
                                Cliente: <strong className="text-slate-700">{t.cliente_name}</strong>
                              </span>
                            )}
                            {isComanda ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md text-[9px] font-black uppercase tracking-wider">
                                <Receipt size={10} />
                                Comanda
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md text-[9px] font-black uppercase tracking-wider">
                                Avulso
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Categoria */}
                    <td className="px-6 py-5">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100/80 border border-slate-200/50 px-2.5 py-1 rounded-lg">
                        {t.category || 'Geral'}
                      </span>
                    </td>

                    {/* Método */}
                    <td className="px-6 py-5 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 shadow-2xs">
                        <PaymentIcon method={t.paymentMethod} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{t.paymentMethod}</span>
                      </div>
                    </td>

                    {/* Data */}
                    <td className="px-6 py-5 text-center text-xs text-slate-600 font-bold">
                      {format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}
                    </td>

                    {/* Valor */}
                    <td className={`px-6 py-5 text-right text-sm font-black ${
                      t.type === 'income' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-5 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        t.status === 'pago' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {t.status === 'pago' ? 'Pago' : 'Pendente'}
                      </span>
                    </td>

                    {/* Ações */}
                    <td className="px-8 py-5 text-center">
                      {isCheckingThis ? (
                        <div className="flex justify-center items-center py-1">
                          <Loader2 size={16} className="animate-spin text-accent" />
                        </div>
                      ) : isComanda ? (
                        <button
                          onClick={() => {
                            if (onViewMovement) {
                              onViewMovement({ ...t, referencia_id: t.comanda_id });
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                          title="Consultar comanda de origem e opções de reabertura"
                        >
                          <ExternalLink size={12} />
                          Ver Comanda
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleInitiateEdit(t)}
                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-primary transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                            title="Editar esta movimentação"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleInitiateDelete(t)}
                            className="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                            title="Excluir movimentação e estornar do caixa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted italic text-sm">
                    Nenhuma movimentação financeira encontrada para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 border-t border-slate-100 rounded-b-[2.5rem]">
          <div className="flex items-center gap-3 text-xs text-muted font-bold">
            <span>
              Exibindo <strong className="text-primary font-black">
                {filteredTransactions.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}-
                {Math.min(filteredTransactions.length, currentPage * pageSize)}
              </strong> de <strong className="text-primary font-black">{filteredTransactions.length}</strong>
            </span>
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">Por pág:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-primary focus:outline-none focus:ring-1 focus:ring-accent shadow-2xs cursor-pointer"
              >
                {[10, 25, 50, 100].map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft size={14} />
              Anterior
            </button>
            
            <span className="px-3 text-xs font-black text-primary">
              Página {currentPage} de {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer flex items-center gap-1"
            >
              Próxima
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Closed Cash Advice Modal */}
      <AnimatePresence>
        {closedCashAdvice?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-amber-200 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-amber-50/70 border-b border-amber-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                    <Lock size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-amber-950">Caixa Fechado para este Dia</h3>
                    <p className="text-xs text-amber-700 font-medium">Conciliação financeira protegida</p>
                  </div>
                </div>
                <button 
                  onClick={() => setClosedCashAdvice(null)}
                  className="w-8 h-8 rounded-full bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    A movimentação que você deseja {closedCashAdvice.action === 'delete' ? 'excluir' : 'editar'}:
                  </p>
                  <div className="flex items-center justify-between font-bold text-sm text-primary pt-1 border-t border-slate-200/60">
                    <span>{closedCashAdvice.transaction.description}</span>
                    <span className={closedCashAdvice.transaction.type === 'income' ? 'text-emerald-600' : 'text-red-500'}>
                      {closedCashAdvice.transaction.type === 'income' ? '+' : '-'} R$ {closedCashAdvice.transaction.amount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted font-semibold">
                    Data do lançamento: <strong className="text-slate-700">{format(new Date(closedCashAdvice.transaction.date + 'T00:00:00'), 'dd/MM/yyyy')}</strong>
                  </p>
                </div>

                <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                  <div className="text-xs text-amber-900 leading-relaxed space-y-1">
                    <p className="font-bold">Por que não é possível alterar agora?</p>
                    <p className="text-amber-800/90 font-medium">
                      O caixa diário de <strong>{format(new Date(closedCashAdvice.transaction.date + 'T00:00:00'), 'dd/MM/yyyy')}</strong> já foi encerrado. Para evitar desvios e manter os saldos bancários e de gaveta sincronizados, é necessário reabrir o caixa antes de fazer alterações.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setClosedCashAdvice(null)}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => {
                      const cash = closedCashAdvice.cashSession;
                      setClosedCashAdvice(null);
                      onReopenCash(cash);
                    }}
                    className="flex-1 py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-2xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Lock size={14} />
                    Reabrir Caixa deste Dia
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Transaction Modal */}
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
            onRequireReopen={(cash) => {
              setEditingTransaction(null);
              onReopenCash(cash);
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete Transaction Modal */}
      <AnimatePresence>
        {deletingTransaction && (
          <DeleteTransactionModal
            transaction={deletingTransaction}
            onClose={() => setDeletingTransaction(null)}
            onSuccess={() => {
              setDeletingTransaction(null);
              loadData();
            }}
            onRequireReopen={(cash) => {
              setDeletingTransaction(null);
              onReopenCash(cash);
            }}
          />
        )}
      </AnimatePresence>
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
    category: transaction.category || '',
    paymentMethod: transaction.paymentMethod || 'pix',
    date: transaction.date || format(new Date(), 'yyyy-MM-dd')
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description.trim()) {
      toast.error("Informe uma descrição.");
      return;
    }
    if (!formData.amount || formData.amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      await financialService.updateTransactionWithCashCheck(
        transaction.id,
        {
          description: formData.description.trim(),
          amount: formData.amount,
          category: formData.category.trim() || 'Geral',
          paymentMethod: formData.paymentMethod as PaymentMethod,
          date: formData.date
        },
        transaction
      );
      toast.success("Movimentação atualizada e sincronizada com o caixa!");
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
                placeholder="Ex: Geral, Materiais..."
              />
              <datalist id="category-suggestions">
                {categories.map(cat => (
                  <option key={cat} value={cat} />
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
                {transaction.type === 'income' ? '+' : '-'} R$ {transaction.amount.toFixed(2)}
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Data:</span>
              <span className="text-primary font-bold">{format(new Date(transaction.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted font-bold">Método:</span>
              <span className="text-primary font-bold uppercase">{transaction.paymentMethod}</span>
            </div>
          </div>

          <div className="p-4 bg-amber-50/60 border border-amber-200/60 rounded-2xl text-xs text-amber-900 leading-relaxed font-medium">
            Esta operação removerá o lançamento do histórico financeiro e <strong>estornará automaticamente</strong> o valor correspondente do caixa de <strong>{format(new Date(transaction.date + 'T00:00:00'), 'dd/MM/yyyy')}</strong>.
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
