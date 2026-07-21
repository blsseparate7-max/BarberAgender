import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Calendar, DollarSign, Check, Trash2, Edit3, 
  X, AlertTriangle, Printer, Download, Share2, ArrowUpRight, 
  CreditCard, User, Tag, HelpCircle, Loader2, CheckCircle2, RefreshCw 
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfMonth, endOfMonth } from 'date-fns';
import { billService } from '../services/billService';
import { cashService } from '../services/cashService';
import { paymentMethodService } from '../services/paymentMethodService';
import { AccountPayable, PaymentMethodConfig, DailyCash } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { commissionService } from '../services/commissionService';
import { financialService } from '../services/financialService';
import { getActiveTenantId } from '../services/tenantService';

interface AccountsPayableManagerProps {
  userId: string;
  userName: string;
}

export const AccountsPayableManager: React.FC<AccountsPayableManagerProps> = ({ userId, userName }) => {
  const [payables, setPayables] = useState<AccountPayable[]>([]);
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

  // List of active barbers for professional advances (Vales)
  const [barbers, setBarbers] = useState<{ id: string; nome: string }[]>([]);

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [editingPayable, setEditingPayable] = useState<AccountPayable | null>(null);
  const [settlingPayable, setSettlingPayable] = useState<AccountPayable | null>(null);

  // Form Field States
  const [formData, setFormData] = useState({
    description: '',
    category: 'Aluguel',
    amount: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    supplier: '',
    recurrence: 'none' as AccountPayable['recurrence']
  });

  // States for Vale/Adiantamento Integration
  const [isValeType, setIsValeType] = useState(false);
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [valeSettleImmediately, setValeSettleImmediately] = useState(true);

  // Settlement States
  const [settleMethod, setSettleMethod] = useState('dinheiro');
  const [addMovementToCash, setAddMovementToCash] = useState(true);
  const [submittingSettle, setSubmittingSettle] = useState(false);
  const [submittingForm, setSubmittingForm] = useState(false);

  const categories = [
    'Aluguel', 'Água', 'Luz', 'Internet', 'Produtos', 'Comissões', 
    'Impostos', 'Salários', 'Marketing', 'Infraestrutura', 'Outros'
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
    let q = query(collection(db, 'accounts_payable'), orderBy('dueDate', 'asc'));
    
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
          supplier: d.supplier || '',
          description: d.description || ''
        } as AccountPayable;
      });
      setPayables(data);
      setLoading(false);
    }, (error) => {
      console.error("Error loading payables via real-time:", error);
      setLoading(false);
    });

    loadContextData();
    fetchBarbers();

    return () => unsubscribe();
  }, [dateRange]);

  const fetchBarbers = async () => {
    try {
      const q = query(
        collection(db, 'usuarios'), 
        where('tenantId', '==', getActiveTenantId()),
        where('tipo', 'in', ['barbeiro', 'gerente', 'admin'])
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, nome: doc.data().nome || 'Barbeiro' }));
      setBarbers(list);
    } catch (err) {
      console.error("Error fetching barbers for outlays:", err);
    }
  };

  const loadPayables = async () => {
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
    setEditingPayable(null);
    setIsValeType(false);
    setSelectedBarberId('');
    setValeSettleImmediately(true);
    setFormData({
      description: '',
      category: 'Aluguel',
      amount: '',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      supplier: '',
      recurrence: 'none'
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (payable: AccountPayable) => {
    setEditingPayable(payable);
    setIsValeType(false);
    setFormData({
      description: payable.description,
      category: payable.category,
      amount: payable.amount.toString(),
      dueDate: payable.dueDate,
      supplier: payable.supplier,
      recurrence: payable.recurrence
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.dueDate) return;

    try {
      setSubmittingForm(true);
      const parsedAmount = parseFloat(formData.amount);
      const todayStr = new Date().toISOString().split('T')[0];

      if (isValeType) {
        if (!selectedBarberId) {
          alert("Por favor, selecione o profissional.");
          setSubmittingForm(false);
          return;
        }

        const selectedBarber = barbers.find(b => b.id === selectedBarberId);
        if (!selectedBarber) {
          alert("Profissional selecionado inválido.");
          setSubmittingForm(false);
          return;
        }

        // 1. Register Professional Advance (Vale) in general ledger
        await commissionService.registerAdvance({
          profissional_id: selectedBarberId,
          profissional_name: selectedBarber.nome,
          amount: parsedAmount,
          date: formData.dueDate,
          description: formData.description || 'Vale / Adiantamento de comissão',
          status: 'pendente',
          responsible_id: userId,
          responsible_name: userName
        });

        // 2. Register as a paid or pending accounts payable (outlay)
        if (valeSettleImmediately) {
          // Create immediately paid financial transaction
          const transactionId = await financialService.createTransaction({
            type: 'expense',
            category: 'Comissões',
            amount: parsedAmount,
            net_amount: parsedAmount,
            fee_amount: 0,
            paymentMethod: 'pix', // Sair do financeiro (geralmente PIX / Conta Geral)
            date: formData.dueDate,
            settlement_date: formData.dueDate,
            status: 'pago',
            is_settled: true,
            responsavel_id: userId,
            responsavel_name: userName,
            description: `Vale p/ ${selectedBarber.nome} (${formData.description || 'Adiantamento'})`
          });

          // Create Paid AccountPayable
          await billService.createPayable({
            description: `Vale: ${selectedBarber.nome} - ${formData.description || 'Adiantamento'}`,
            category: 'Comissões',
            amount: parsedAmount,
            dueDate: formData.dueDate,
            supplier: selectedBarber.nome,
            recurrence: 'none',
            status: 'paid',
            paidAt: new Date().toISOString() as any,
            paymentMethod: 'pix',
            transactionId
          });
        } else {
          // Create Pending AccountPayable
          await billService.createPayable({
            description: `Vale Pendente: ${selectedBarber.nome} - ${formData.description || 'Adiantamento'}`,
            category: 'Comissões',
            amount: parsedAmount,
            dueDate: formData.dueDate,
            supplier: selectedBarber.nome,
            recurrence: 'none',
            status: 'pending'
          });
        }
      } else {
        // Standard Common Expense Flow
        const payload = {
          description: formData.description,
          category: formData.category,
          amount: parsedAmount,
          dueDate: formData.dueDate,
          supplier: formData.supplier,
          recurrence: formData.recurrence,
          status: 'pending' as const
        };

        if (editingPayable) {
          await billService.updatePayable(editingPayable.id, payload);
        } else {
          await billService.createPayable(payload);
        }
      }
      
      setIsFormOpen(false);
      loadPayables();
    } catch (error) {
      console.error("Error saving payable:", error);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Deseja realmente excluir esta conta a pagar?")) {
      try {
        await billService.deletePayable(id);
        loadPayables();
      } catch (error) {
        console.error("Error deleting payable:", error);
      }
    }
  };

  const handleOpenSettle = (payable: AccountPayable) => {
    setSettlingPayable(payable);
    setSettleMethod('dinheiro');
    setAddMovementToCash(!!activeCash);
    setIsSettleOpen(true);
  };

  const handleSettle = async () => {
    if (!settlingPayable) return;
    try {
      setSubmittingSettle(true);
      await billService.settlePayable(
        settlingPayable.id,
        settleMethod,
        addMovementToCash && !!activeCash,
        userId,
        userName
      );
      setIsSettleOpen(false);
      setSettlingPayable(null);
      loadPayables();
      loadContextData();
    } catch (error) {
      console.error("Error settling payable:", error);
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Calculations for projection stats
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const processedPayables = payables.map(p => {
    let currentStatus = p.status;
    if (p.status === 'pending' && isBefore(parseISO(p.dueDate), parseISO(todayStr))) {
      currentStatus = 'overdue';
    }
    return { ...p, calculatedStatus: currentStatus };
  });

  const stats = processedPayables.reduce(
    (acc, p) => {
      acc.total += p.amount;
      if (p.calculatedStatus === 'paid') {
        acc.paid += p.amount;
      } else if (p.calculatedStatus === 'overdue') {
        acc.overdue += p.amount;
        acc.pending += p.amount;
      } else {
        acc.pending += p.amount;
      }
      return acc;
    },
    { total: 0, paid: 0, pending: 0, overdue: 0 }
  );

  const filteredPayables = processedPayables.filter(p => {
    const matchesSearch = 
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || p.calculatedStatus === statusFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Action methods: Print, Download JSON, Share Info
  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(filteredPayables, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `Contas_A_Pagar_${dateRange.start}_a_${dateRange.end}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleShare = async () => {
    const text = `Gestão de Contas a Pagar (${dateRange.start} a ${dateRange.end}):\n` +
      `Total: R$ ${stats.total.toFixed(2)}\n` +
      `Pago: R$ ${stats.paid.toFixed(2)}\n` +
      `Pendente: R$ ${stats.pending.toFixed(2)}\n` +
      `Atrasado: R$ ${stats.overdue.toFixed(2)}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Relatório Contas a Pagar',
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
    <div className="space-y-8" id="accounts-payable-view">
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
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Pago / Liquidado</p>
            <p className="text-2xl font-black text-emerald-800">R$ {stats.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-emerald-600/70 font-bold mt-1 block">Rendido de baixas</span>
          </div>
          <div className="w-12 h-12 bg-white text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
            <Check size={20} />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Pendente</p>
            <p className="text-2xl font-black text-amber-800">R$ {stats.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-amber-600/70 font-bold mt-1 block">Contas a vencer</span>
          </div>
          <div className="w-12 h-12 bg-white text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100">
            <Calendar size={20} />
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Vencido / Atrasado</p>
            <p className="text-2xl font-black text-rose-800">R$ {stats.overdue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            <span className="text-[10px] text-rose-600/70 font-bold mt-1 block">Atenção imediata!</span>
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
            <h3 className="text-xl font-black text-primary">Contas a Pagar (Custos Fixos & Variáveis)</h3>
            <p className="text-xs text-muted font-medium mt-1">Planeje, projete seus custos e efetue baixas sincronizadas ao caixa.</p>
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
              Cadastrar Conta
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
              placeholder="Buscar por descrição ou fornecedor..."
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
              <option value="paid">Apenas Pagos</option>
              <option value="overdue">Apenas Vencidos</option>
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
              <p className="text-xs font-semibold">Carregando contas a pagar...</p>
            </div>
          ) : filteredPayables.length === 0 ? (
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
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Fornecedor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Recorrência</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-5 text-right w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredPayables.map((payable, index) => (
                  <tr key={`payable-row-${payable.id || index}`} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-primary">{payable.description}</p>
                      {payable.status === 'paid' && payable.paymentMethod && (
                        <p className="text-[9px] text-emerald-600 font-bold tracking-widest uppercase mt-0.5">
                          Liquidado via {payable.paymentMethod}
                        </p>
                      )}
                    </td>
                    <td className="px-8 py-6">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">
                        {payable.category}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-500">
                      {format(parseISO(payable.dueDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-500 font-semibold">
                      {payable.supplier || 'Não informado'}
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-400 font-medium capitalize">
                      {recurrences.find(r => r.value === payable.recurrence)?.label || 'Única'}
                    </td>
                    <td className="px-8 py-6 text-right text-sm font-black text-slate-800">
                      R$ {payable.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                        payable.calculatedStatus === 'paid' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                          : payable.calculatedStatus === 'overdue'
                          ? 'bg-rose-50 text-rose-600 border-rose-100 animate-pulse'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {payable.calculatedStatus === 'paid' ? 'Pago' : payable.calculatedStatus === 'overdue' ? 'Vencido' : 'Pendente'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {payable.calculatedStatus !== 'paid' && (
                          <button
                            onClick={() => handleOpenSettle(payable)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 border border-emerald-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                            title="Dar Baixa (Efetuar Pagamento)"
                          >
                            <Check size={14} className="stroke-[3]" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(payable)}
                          className="p-2 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                          title="Editar Lançamento"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(payable.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                          title="Excluir Lançamento"
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
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-primary text-base">{editingPayable ? 'Editar Conta a Pagar' : 'Cadastrar Conta a Pagar'}</h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Planejamento financeiro</p>
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
                {/* Outflow Type Toggle (Only on creation) */}
                {!editingPayable && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Lançamento</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => {
                          setIsValeType(false);
                          setFormData(prev => ({ ...prev, category: 'Aluguel' }));
                        }}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          !isValeType
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Tag size={13} />
                        <span>Despesa Comum</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsValeType(true);
                          setFormData(prev => ({ 
                            ...prev, 
                            category: 'Comissões', 
                            description: 'Vale antecipado de comissão' 
                          }));
                        }}
                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          isValeType
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <User size={13} />
                        <span>Lançar Vale</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Barber Selection (Only for Vale) */}
                {isValeType && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profissional Beneficiado *</label>
                    <div className="relative">
                      <select
                        required
                        value={selectedBarberId}
                        onChange={e => setSelectedBarberId(e.target.value)}
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer"
                      >
                        <option value="">Selecione o profissional...</option>
                        {barbers.map(b => (
                          <option key={b.id} value={b.id}>{b.nome}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-400">
                        <User size={14} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {isValeType ? 'Observações / Motivo do Vale *' : 'Descrição da Conta *'}
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder={isValeType ? 'Ex: Adiantamento semanal, Emergência, etc.' : 'Ex: Aluguel da Barbearia, Conta de Energia, etc.'}
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {isValeType ? 'Data do Vale *' : 'Vencimento *'}
                    </label>
                    <input 
                      type="date"
                      required
                      value={formData.dueDate}
                      onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                    />
                  </div>
                </div>

                {/* Standard Expense Only Fields */}
                {!isValeType ? (
                  <>
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

                    {/* Fornecedor */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor / Favorecido</label>
                      <input 
                        type="text"
                        placeholder="Ex: Companhia de Energia S/A, Distribuidora XYZ, etc."
                        value={formData.supplier}
                        onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                  </>
                ) : (
                  /* Vale Only Fields: Instant Financial Settlement */
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Liquidar Imediatamente?</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-[9px] font-black text-blue-700 uppercase tracking-wider">
                        Conta Geral do Financeiro
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-450 font-semibold leading-relaxed">
                      Se ativado, esta saída será registrada no financeiro geral como <strong className="text-slate-600">Paga/Liquidada via PIX</strong> imediatamente, sem transitar ou impactar o caixa físico aberto do dia.
                    </p>
                    <label className="flex items-center gap-2.5 pt-1.5 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={valeSettleImmediately}
                        onChange={e => setValeSettleImmediately(e.target.checked)}
                        className="w-4.5 h-4.5 text-primary border-slate-300 rounded focus:ring-primary cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-600 select-none">Efetuar baixa automática como Pago</span>
                    </label>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="w-full py-4 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/10"
                >
                  {submittingForm ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                  <span>{editingPayable ? 'Salvar Alterações' : 'Confirmar Cadastro'}</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: BAixar / Settle */}
      <AnimatePresence>
        {isSettleOpen && settlingPayable && (
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
                    <h4 className="font-black text-primary text-base">Liquidar Conta (Dar Baixa)</h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Registrar saída de fundos</p>
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
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{settlingPayable.description}</p>
                  <p className="text-3xl font-black text-slate-800">
                    R$ {settlingPayable.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  {settlingPayable.supplier && (
                    <p className="text-[10px] text-slate-400 font-bold mt-1">Fornecedor: {settlingPayable.supplier}</p>
                  )}
                </div>

                {/* Settle Method */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento Utilizada</label>
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
                    Se ativado, esta saída será lançada automaticamente no caixa operacional em andamento no sistema.
                  </p>
                  
                  <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      disabled={!activeCash}
                      checked={addMovementToCash && !!activeCash}
                      onChange={e => setAddMovementToCash(e.target.checked)}
                      className="w-4.5 h-4.5 text-primary border-slate-300 rounded focus:ring-primary cursor-pointer disabled:opacity-50"
                    />
                    <span className="text-xs font-bold text-slate-600 select-none">Consumir e registrar no Caixa</span>
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
                  <span>Confirmar Liquidação</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
