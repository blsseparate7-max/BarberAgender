import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Calendar, DollarSign, Check, Trash2, Edit3, 
  X, AlertTriangle, Printer, Download, Share2, ArrowDownLeft, 
  CreditCard, User, Tag, HelpCircle, Loader2, CheckCircle2, RefreshCw 
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns';
import { billService } from '../services/billService';
import { cashService } from '../services/cashService';
import { paymentMethodService } from '../services/paymentMethodService';
import { AccountReceivable, PaymentMethodConfig, DailyCash } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface AccountsReceivableManagerProps {
  userId: string;
  userName: string;
}

export const AccountsReceivableManager: React.FC<AccountsReceivableManagerProps> = ({ userId, userName }) => {
  const [receivables, setReceivables] = useState<AccountReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  // Active Cash session and Payment methods for settlement
  const [activeCash, setActiveCash] = useState<DailyCash | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [editingReceivable, setEditingReceivable] = useState<AccountReceivable | null>(null);
  const [settlingReceivable, setSettlingReceivable] = useState<AccountReceivable | null>(null);

  // Form Field States
  const [formData, setFormData] = useState({
    description: '',
    category: 'Aluguel de Cadeira',
    amount: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    clientOrPartner: '',
    recurrence: 'none' as AccountReceivable['recurrence']
  });

  // Settlement States
  const [settleMethod, setSettleMethod] = useState('dinheiro');
  const [addMovementToCash, setAddMovementToCash] = useState(true);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);

  const categories = [
    'Aluguel de Cadeira', 'Parcerias', 'Serviços Especiais', 
    'Vendas de Produtos', 'Assinaturas', 'Patrocínio', 'Outros'
  ];

  const recurrences = [
    { value: 'none', label: 'Única' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'biweekly', label: 'Quinzenal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'yearly', label: 'Anual' }
  ];

  useEffect(() => {
    setLoading(true);
    let q = query(collection(db, 'accounts_receivable'), orderBy('dueDate', 'asc'));
    
    if (dateRange.start && dateRange.end) {
      q = query(q, where('dueDate', '>=', dateRange.start), where('dueDate', '<=', dateRange.end));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          dueDate: d.dueDate || '',
          status: d.status || 'pending',
          amount: d.amount || 0,
          recurrence: d.recurrence || 'none',
          category: d.category || 'outros',
          clientOrPartner: d.clientOrPartner || '',
          description: d.description || ''
        } as AccountReceivable;
      });
      setReceivables(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading receivables via real-time:", error);
      setLoading(false);
    });

    loadContextData();

    return () => unsubscribe();
  }, [dateRange]);

  const loadReceivables = async () => {
    // Keep as legacy fallback, onSnapshot handles state updates now.
  };

  const loadContextData = async () => {
    try {
      const cash = await cashService.getCurrentCash();
      setActiveCash(cash);
      const methods = await paymentMethodService.getActivePaymentMethods();
      setPaymentMethods(methods);
    } catch (error) {
      console.error("Error loading context:", error);
    }
  };

  const handleOpenCreate = () => {
    setEditingReceivable(null);
    setFormData({
      description: '',
      category: 'Aluguel de Cadeira',
      amount: '',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      clientOrPartner: '',
      recurrence: 'none'
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (receivable: AccountReceivable) => {
    setEditingReceivable(receivable);
    setFormData({
      description: receivable.description,
      category: receivable.category,
      amount: receivable.amount.toString(),
      dueDate: receivable.dueDate,
      clientOrPartner: receivable.clientOrPartner,
      recurrence: receivable.recurrence
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.dueDate) return;

    try {
      setSubmittingForm(true);
      const parsedAmount = parseFloat(formData.amount);
      
      const payload = {
        description: formData.description,
        category: formData.category,
        amount: parsedAmount,
        dueDate: formData.dueDate,
        clientOrPartner: formData.clientOrPartner,
        recurrence: formData.recurrence,
        status: 'pending' as const
      };

      if (editingReceivable) {
        await billService.updateReceivable(editingReceivable.id, payload);
      } else {
        await billService.createReceivable(payload);
      }
      
      setIsFormOpen(false);
      loadReceivables();
    } catch (error) {
      console.error("Error saving receivable:", error);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja realmente excluir esta conta a receber?")) {
      try {
        await billService.deleteReceivable(id);
        loadReceivables();
      } catch (error) {
        console.error("Error deleting receivable:", error);
      }
    }
  };

  const handleOpenSettle = (receivable: AccountReceivable) => {
    setSettlingReceivable(receivable);
    setSettleMethod('dinheiro');
    setAddMovementToCash(!!activeCash);
    setIsSettleOpen(true);
  };

  const handleSettle = async () => {
    if (!settlingReceivable) return;
    try {
      setSubmittingSettle(true);
      await billService.settleReceivable(
        settlingReceivable.id,
        settleMethod,
        addMovementToCash && !!activeCash,
        userId,
        userName
      );
      setIsSettleOpen(false);
      setSettlingReceivable(null);
      loadReceivables();
      loadContextData();
    } catch (error) {
      console.error("Error settling receivable:", error);
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Calculations for projection stats
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const processedReceivables = receivables.map(r => {
    let currentStatus = r.status;
    if (r.status === 'pending' && isBefore(parseISO(r.dueDate), parseISO(todayStr))) {
      currentStatus = 'overdue';
    }
    return { ...r, calculatedStatus: currentStatus };
  });

  const stats = processedReceivables.reduce(
    (acc, r) => {
      acc.total += r.amount;
      if (r.calculatedStatus === 'paid') {
        acc.paid += r.amount;
      } else if (r.calculatedStatus === 'overdue') {
        acc.overdue += r.amount;
        acc.pending += r.amount;
      } else {
        acc.pending += r.amount;
      }
      return acc;
    },
    { total: 0, paid: 0, pending: 0, overdue: 0 }
  );

  const filteredReceivables = processedReceivables.filter(r => {
    const matchesSearch = 
      r.description.toLowerCase().includes(search.toLowerCase()) ||
      r.clientOrPartner.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || r.calculatedStatus === statusFilter;
    const matchesCategory = categoryFilter === 'all' || r.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Action methods: Print, Download JSON, Share Info
  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(filteredReceivables, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `Contas_A_Receber_${dateRange.start}_a_${dateRange.end}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleShare = async () => {
    const text = `Gestão de Contas a Receber (${dateRange.start} a ${dateRange.end}):\n` +
      `Total Previsto: R$ ${stats.total.toFixed(2)}\n` +
      `Recebido: R$ ${stats.paid.toFixed(2)}\n` +
      `Pendente: R$ ${stats.pending.toFixed(2)}\n` +
      `Atrasado: R$ ${stats.overdue.toFixed(2)}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Relatório Contas a Receber',
          text: text,
        });
      } catch (error) {
        console.log('Error sharing:', error);
      }
    } else {
      navigator.clipboard.writeText(text);
      alert("Resumo copiado para a área de transferência!");
    }
  };

  return (
    <div className="space-y-8" id="accounts-receivable-view">
      {/* Header Cards with Stats & Projections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Previsto</p>
            <p className="text-2xl font-black text-slate-800">R$ {stats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-slate-400 font-bold mt-1 block">Projeção do período</span>
          </div>
          <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center border border-slate-100">
            <DollarSign size={20} />
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Recebido / Liquidado</p>
            <p className="text-2xl font-black text-emerald-800">R$ {stats.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-emerald-600/70 font-bold mt-1 block">Arrecadado com sucesso</span>
          </div>
          <div className="w-12 h-12 bg-white text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
            <Check size={20} />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Pendente</p>
            <p className="text-2xl font-black text-amber-800">R$ {stats.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-amber-600/70 font-bold mt-1 block">Valores a vencer</span>
          </div>
          <div className="w-12 h-12 bg-white text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100">
            <Calendar size={20} />
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Inadimplente / Atrasado</p>
            <p className="text-2xl font-black text-rose-800">R$ {stats.overdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-rose-600/70 font-bold mt-1 block">Cobrança necessária</span>
          </div>
          <div className="w-12 h-12 bg-white text-rose-600 rounded-2xl flex items-center justify-center border border-rose-100">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        {/* Toolbar Header */}
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-black text-primary">Contas a Receber (Receitas Recorrentes & Avulsas)</h3>
            <p className="text-xs text-muted font-medium mt-1">Gere receita previsível e controle o faturamento externo de parcerias.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={handlePrint}
              className="p-2.5 bg-white text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Imprimir Relatório"
            >
              <Printer size={16} />
            </button>
            <button 
              onClick={handleDownload}
              className="p-2.5 bg-white text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Baixar Backup JSON"
            >
              <Download size={16} />
            </button>
            <button 
              onClick={handleShare}
              className="p-2.5 bg-white text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Compartilhar Dados"
            >
              <Share2 size={16} />
            </button>
            <button 
              onClick={handleOpenCreate}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-primary/10 cursor-pointer"
            >
              <Plus size={14} />
              Prever Recebimento
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="p-8 bg-slate-50/20 border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar por descrição ou cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary text-primary font-bold"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary text-slate-600 font-bold appearance-none cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="pending">Apenas Pendentes</option>
              <option value="paid">Apenas Recebidos</option>
              <option value="overdue">Apenas Atrasados</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="relative">
            <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary text-slate-600 font-bold appearance-none cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Date Picker Range */}
          <div className="flex items-center gap-2">
            <input 
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-600 font-semibold focus:outline-none"
            />
            <span className="text-slate-400 text-xs">até</span>
            <input 
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-600 font-semibold focus:outline-none"
            />
          </div>
        </div>

        {/* Content Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
              <Loader2 className="animate-spin text-primary" size={32} />
              <p className="text-xs font-semibold">Carregando contas a receber...</p>
            </div>
          ) : filteredReceivables.length === 0 ? (
            <div className="text-center py-24 text-muted font-bold italic text-sm">
              Nenhuma conta encontrada para o período e filtros selecionados.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/20">
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Conta / Detalhes</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Categoria</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Vencimento</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Cliente / Parceiro</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Recorrência</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-5 text-right w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredReceivables.map((receivable, index) => (
                  <tr key={`receivable-row-${receivable.id || index}`} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-primary">{receivable.description}</p>
                      {receivable.status === 'paid' && receivable.paymentMethod && (
                        <p className="text-[9px] text-emerald-600 font-bold tracking-widest uppercase mt-0.5">
                          Liquidado via {receivable.paymentMethod}
                        </p>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        {receivable.category}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">
                      {format(parseISO(receivable.dueDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-500 font-semibold">
                      {receivable.clientOrPartner || 'Não informado'}
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-400 font-medium capitalize">
                      {recurrences.find(r => r.value === receivable.recurrence)?.label || 'Única'}
                    </td>
                    <td className="px-8 py-6 text-right text-sm font-black text-slate-800">
                      R$ {receivable.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        receivable.calculatedStatus === 'paid' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : receivable.calculatedStatus === 'overdue'
                          ? 'bg-rose-50 text-rose-600 border-rose-100 animate-pulse'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {receivable.calculatedStatus === 'paid' ? 'Recebido' : receivable.calculatedStatus === 'overdue' ? 'Vencido' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {receivable.calculatedStatus !== 'paid' && (
                          <button
                            onClick={() => handleOpenSettle(receivable)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 border border-emerald-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                            title="Dar Baixa (Registrar Recebimento)"
                          >
                            <Check size={14} className="stroke-[3]" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(receivable)}
                          className="p-2 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                          title="Editar Previsão"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(receivable.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                          title="Excluir Previsão"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL: CREATE / EDIT */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center border border-primary/10">
                    <ArrowDownLeft size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-primary text-base">{editingReceivable ? 'Editar Conta a Receber' : 'Cadastrar Conta a Receber'}</h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Previsibilidade de faturamento</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="w-8 h-8 rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-8 space-y-6">
                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição da Conta *</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Repasse Cadeira Junho, Evento Corporativo, etc."
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor R$ *</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                    />
                  </div>

                  {/* Due Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimento / Previsão *</label>
                    <input 
                      type="date"
                      required
                      value={formData.dueDate}
                      onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Recurrence */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recorrência</label>
                    <select
                      value={formData.recurrence}
                      onChange={e => setFormData({ ...formData, recurrence: e.target.value as any })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer"
                    >
                      {recurrences.map(rec => (
                        <option key={rec.value} value={rec.value}>{rec.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cliente / Parceiro */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliente / Parceiro / Origem</label>
                  <input 
                    type="text"
                    placeholder="Ex: João Barbeiro, Empresa X, etc."
                    value={formData.clientOrPartner}
                    onChange={e => setFormData({ ...formData, clientOrPartner: e.target.value })}
                    className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="w-full py-4 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/10"
                >
                  {submittingForm ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  <span>{editingReceivable ? 'Salvar Alterações' : 'Confirmar Previsão'}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: BAixar / Settle */}
      <AnimatePresence>
        {isSettleOpen && settlingReceivable && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-primary text-base">Receber Conta (Dar Baixa)</h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Registrar entrada de fundos</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSettleOpen(false)}
                  className="w-8 h-8 rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-center">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{settlingReceivable.description}</p>
                  <p className="text-3xl font-black text-slate-800">
                    R$ {settlingReceivable.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  {settlingReceivable.clientOrPartner && (
                    <p className="text-[10px] text-slate-400 font-bold mt-1">De: {settlingReceivable.clientOrPartner}</p>
                  )}
                </div>

                {/* Settle Method */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Recebimento Utilizada</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'dinheiro', label: 'Dinheiro' },
                      { value: 'pix', label: 'PIX' },
                      { value: 'credito', label: 'C. Crédito' },
                      { value: 'debito', label: 'C. Débito' },
                      { value: 'outros', label: 'Outra forma' }
                    ].map(method => (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => setSettleMethod(method.value)}
                        className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                          settleMethod === method.value
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <CreditCard size={12} />
                        <span>{method.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cash Integration Checkbox */}
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Integrar ao Caixa do Dia</span>
                    {activeCash ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-[9px] font-black text-emerald-800 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Caixa Aberto
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                        Caixa Fechado
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                    Se ativado, este recebimento será adicionado automaticamente ao caixa operacional em andamento no sistema.
                  </p>
                  
                  <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      disabled={!activeCash}
                      checked={addMovementToCash && !!activeCash}
                      onChange={e => setAddMovementToCash(e.target.checked)}
                      className="w-4.5 h-4.5 text-primary border-slate-300 rounded focus:ring-primary cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-xs font-bold text-slate-600 select-none">Lançar entrada no Caixa</span>
                  </label>
                </div>

                {/* Confirm Action Button */}
                <button
                  type="button"
                  onClick={handleSettle}
                  disabled={submittingSettle}
                  className="w-full py-4 bg-emerald-600 text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/10"
                >
                  {submittingSettle ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  <span>Confirmar Recebimento</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
