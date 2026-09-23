import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Filter, Calendar, DollarSign, Check, Trash2, Edit3, 
  X, AlertTriangle, Printer, Download, Share2, ArrowUpRight, 
  CreditCard, User, Tag, HelpCircle, Loader2, CheckCircle2, RefreshCw, ShoppingCart,
  Repeat, Layers, CalendarCheck, TrendingUp, AlertCircle
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
  const [activeTab, setActiveTab] = useState<'all' | 'recurring'>('all');

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

  // Scope Choice Modal for Recurring / Installments
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [scopeTargetAction, setScopeTargetAction] = useState<'edit' | 'delete'>('edit');
  const [targetScopePayable, setTargetScopePayable] = useState<AccountPayable | null>(null);
  const [chosenScope, setChosenScope] = useState<'single' | 'future' | 'series'>('single');

  // Form Field States
  const [formData, setFormData] = useState({
    description: '',
    category: 'Aluguel',
    amount: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    supplier: '',
    billingType: 'single' as 'single' | 'recurring' | 'installments',
    recurrence: 'none' as AccountPayable['recurrence'],
    totalInstallments: '12',
    paymentMethod: 'pix',
    notes: ''
  });

  // States for Vale/Adiantamento Integration
  const [payableType, setPayableType] = useState<'operacional' | 'fornecedor' | 'vale'>('operacional');
  const isValeType = payableType === 'vale';
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
    const activeTenantId = getActiveTenantId();
    let q = query(
      collection(db, 'accounts_payable'), 
      where('tenantId', '==', activeTenantId), 
      orderBy('dueDate', 'asc')
    );

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
  }, []);

  const fetchBarbers = async () => {
    try {
      const activeTenantId = getActiveTenantId();
      const constraints = [where('tipo', 'in', ['barbeiro', 'gerente', 'admin'])];
      if (activeTenantId === 'gbcortes7') {
        constraints.push(where('tenantId', 'in', [activeTenantId, '']));
      } else {
        constraints.push(where('tenantId', '==', activeTenantId));
      }
      const q = query(
        collection(db, 'usuarios'), 
        ...constraints
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({ id: doc.id, nome: doc.data().nome || 'Barbeiro' }));
      setBarbers(list);
    } catch (err) {
      console.error("Error fetching barbers for outlays:", err);
    }
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
    setPayableType('operacional');
    setSelectedBarberId('');
    setValeSettleImmediately(true);
    setFormData({
      description: '',
      category: 'Aluguel',
      amount: '',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      supplier: '',
      billingType: 'single',
      recurrence: 'none',
      totalInstallments: '12',
      paymentMethod: 'pix',
      notes: ''
    });
    setIsFormOpen(true);
  };

  const triggerEditFlow = (payable: AccountPayable) => {
    if (payable.seriesId || payable.totalInstallments || payable.isRecurring) {
      setTargetScopePayable(payable);
      setScopeTargetAction('edit');
      setChosenScope('single');
      setScopeModalOpen(true);
    } else {
      executeEditForm(payable, 'single');
    }
  };

  const triggerDeleteFlow = (payable: AccountPayable) => {
    if (payable.seriesId || payable.totalInstallments || payable.isRecurring) {
      setTargetScopePayable(payable);
      setScopeTargetAction('delete');
      setChosenScope('single');
      setScopeModalOpen(true);
    } else {
      if (window.confirm("Deseja realmente excluir esta conta a pagar?")) {
        billService.deletePayable(payable.id, 'single');
      }
    }
  };

  const executeEditForm = (payable: AccountPayable, scope: 'single' | 'future' | 'series') => {
    setEditingPayable(payable);
    setChosenScope(scope);

    if (payable.profissional_id) {
      setPayableType('vale');
    } else if (payable.supplier) {
      setPayableType('fornecedor');
    } else {
      setPayableType('operacional');
    }

    const cleanDesc = payable.description.replace(/\s*\(\d+\/\d+\)$/, '').replace(/\s*\[Recorrente\]$/, '');

    setFormData({
      description: cleanDesc,
      category: payable.category || 'Aluguel',
      amount: payable.amount.toString(),
      dueDate: payable.dueDate,
      supplier: payable.supplier || '',
      billingType: payable.totalInstallments ? 'installments' : payable.isRecurring ? 'recurring' : 'single',
      recurrence: payable.recurrence || 'none',
      totalInstallments: payable.totalInstallments ? payable.totalInstallments.toString() : '12',
      paymentMethod: payable.paymentMethod || 'pix',
      notes: payable.notes || ''
    });

    setIsFormOpen(true);
  };

  const handleConfirmScopeAction = async () => {
    if (!targetScopePayable) return;
    setScopeModalOpen(false);

    if (scopeTargetAction === 'edit') {
      executeEditForm(targetScopePayable, chosenScope);
    } else {
      const confirmText = chosenScope === 'series' 
        ? "Deseja realmente excluir TODA a série recorrente / parcelamento?" 
        : chosenScope === 'future' 
        ? "Deseja realmente excluir esta e todas as parcelas FUTURAS?" 
        : "Deseja realmente excluir apenas esta parcela?";

      if (window.confirm(confirmText)) {
        await billService.deletePayable(targetScopePayable.id, chosenScope);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount || !formData.dueDate) return;

    try {
      setSubmittingForm(true);
      const parsedAmount = parseFloat(formData.amount);

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

        if (valeSettleImmediately) {
          const transactionId = await financialService.createTransaction({
            type: 'expense',
            category: 'Comissões',
            amount: parsedAmount,
            net_amount: parsedAmount,
            fee_amount: 0,
            paymentMethod: 'pix',
            date: formData.dueDate,
            settlement_date: formData.dueDate,
            status: 'pago',
            is_settled: true,
            responsavel_id: userId,
            responsavel_name: userName,
            description: `Vale p/ ${selectedBarber.nome} (${formData.description || 'Adiantamento'})`
          });

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
            transactionId,
            profissional_id: selectedBarberId,
            profissional_name: selectedBarber.nome
          });
        } else {
          await billService.createPayable({
            description: `Vale Pendente: ${selectedBarber.nome} - ${formData.description || 'Adiantamento'}`,
            category: 'Comissões',
            amount: parsedAmount,
            dueDate: formData.dueDate,
            supplier: selectedBarber.nome,
            recurrence: 'none',
            status: 'pending',
            profissional_id: selectedBarberId,
            profissional_name: selectedBarber.nome
          });
        }
      } else {
        // Common Expense Flow
        const isInstallmentChoice = formData.billingType === 'installments';
        const isRecurringChoice = formData.billingType === 'recurring';

        const payload: any = {
          description: formData.description,
          category: formData.category,
          amount: parsedAmount,
          dueDate: formData.dueDate,
          supplier: formData.supplier,
          recurrence: isRecurringChoice ? (formData.recurrence === 'none' ? 'monthly' : formData.recurrence) : 'none',
          totalInstallments: isInstallmentChoice ? parseInt(formData.totalInstallments || '12') : undefined,
          isRecurring: isRecurringChoice,
          paymentMethod: formData.paymentMethod,
          notes: formData.notes,
          status: 'pending'
        };

        if (editingPayable) {
          await billService.updatePayable(editingPayable.id, payload, chosenScope);
        } else {
          await billService.createPayable(payload);
        }
      }
      
      setIsFormOpen(false);
    } catch (error) {
      console.error("Error saving payable:", error);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleOpenSettle = (payable: AccountPayable) => {
    setSettlingPayable(payable);
    setSettleMethod(payable.paymentMethod || 'dinheiro');
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
      loadContextData();
    } catch (error) {
      console.error("Error settling payable:", error);
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Calculations for general table view
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const currentMonthStr = format(new Date(), 'yyyy-MM');

  const processedPayables = payables.map(p => {
    let currentStatus = p.status;
    if (p.status === 'pending' && isBefore(parseISO(p.dueDate), parseISO(todayStr))) {
      currentStatus = 'overdue';
    }
    return { ...p, calculatedStatus: currentStatus };
  });

  const rangeFilteredPayables = processedPayables.filter(p => {
    if (dateRange.start && dateRange.end) {
      return p.dueDate >= dateRange.start && p.dueDate <= dateRange.end;
    }
    return true;
  });

  const stats = rangeFilteredPayables.reduce(
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

  const filteredPayables = rangeFilteredPayables.filter(p => {
    const matchesSearch = 
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.supplier.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || p.calculatedStatus === statusFilter;
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Recurring Sub-tab Data Calculations
  const recurringItems = processedPayables.filter(p => 
    p.isRecurring || 
    (p.recurrence && p.recurrence !== 'none') || 
    (p.totalInstallments && p.totalInstallments > 1) || 
    p.seriesId
  );

  const currentMonthRecurring = recurringItems.filter(p => p.dueDate && p.dueDate.startsWith(currentMonthStr));
  const recurringTotalMonth = currentMonthRecurring.reduce((acc, p) => acc + p.amount, 0);
  const recurringPaidMonth = currentMonthRecurring.filter(p => p.calculatedStatus === 'paid').reduce((acc, p) => acc + p.amount, 0);
  const recurringPendingMonth = currentMonthRecurring.filter(p => p.calculatedStatus !== 'paid').reduce((acc, p) => acc + p.amount, 0);

  // Group recurring items by series
  type ProcessedPayable = AccountPayable & { calculatedStatus: string };
  const seriesGroupMap = new Map<string, ProcessedPayable[]>();
  recurringItems.forEach(item => {
    const key = item.seriesId || `${item.supplier}_${item.category}_${item.description.replace(/\s*\(\d+\/\d+\)$/, '').replace(/\s*\[Recorrente\]$/, '')}`;
    if (!seriesGroupMap.has(key)) {
      seriesGroupMap.set(key, []);
    }
    seriesGroupMap.get(key)!.push(item);
  });

  const seriesGroups = Array.from(seriesGroupMap.entries()).map(([key, items]) => {
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const first = items[0];
    const totalCount = first.totalInstallments || items.length;
    const paidCount = items.filter(i => i.calculatedStatus === 'paid').length;
    const nextPending = items.find(i => i.calculatedStatus !== 'paid') || items[items.length - 1];

    return {
      seriesKey: key,
      title: first.description.replace(/\s*\(\d+\/\d+\)$/, '').replace(/\s*\[Recorrente\]$/, ''),
      supplier: first.supplier || 'Não informado',
      category: first.category || 'Aluguel',
      recurrence: first.recurrence || 'monthly',
      paymentMethod: first.paymentMethod || 'pix',
      totalAmountSeries: items.reduce((acc, i) => acc + i.amount, 0),
      monthlyAmount: first.amount,
      totalCount,
      paidCount,
      remainingCount: Math.max(0, totalCount - paidCount),
      nextPending,
      items
    };
  });

  // Action methods: Print, Download JSON, Share Info
  const handlePrint = () => { window.print(); };

  const handleDownload = () => {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(filteredPayables, null, 2))}`;
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
        await navigator.share({ title: 'Relatório Contas a Pagar', text: text });
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
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/60">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-primary shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar size={15} />
            <span>📋 Todos os Lançamentos</span>
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'recurring'
                ? 'bg-white text-primary shadow-sm border border-slate-200/50'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Repeat size={15} className="text-amber-500" />
            <span>🔄 Contas Recorrentes & Parcelamentos ({seriesGroups.length})</span>
          </button>
        </div>

        <button 
          onClick={handleOpenCreate}
          className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg shadow-primary/10 cursor-pointer"
        >
          <Plus size={15} />
          <span>Cadastrar Conta</span>
        </button>
      </div>

      {/* SUB-TAB 1: ALL PAYABLES GENERAL VIEW */}
      {activeTab === 'all' && (
        <div className="space-y-8 animate-fadeIn">
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
              </div>
            </div>

            {/* Filters Panel */}
            <div className="p-8 bg-slate-50/20 border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
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

              <div className="relative">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary text-slate-600 font-bold appearance-none cursor-pointer"
                >
                  <option value="all">Todas as Categorias</option>
                  {categories.map((cat, catIdx) => (
                    <option key={`ap-cat-flt-${cat}-${catIdx}`} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

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
                      <tr key={`payable-row-${payable.id || 'p'}-${index}`} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-primary">{payable.description}</p>
                            {payable.seriesId && (
                              <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-black rounded-md flex items-center gap-1" title="Faz parte de uma série/recorrência">
                                <Repeat size={10} />
                                <span>Série</span>
                              </span>
                            )}
                          </div>
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
                          {payable.totalInstallments ? `${payable.installmentNumber}/${payable.totalInstallments}x` : recurrences.find(r => r.value === payable.recurrence)?.label || 'Única'}
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
                              onClick={() => triggerEditFlow(payable)}
                              className="p-2 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                              title="Editar Lançamento"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => triggerDeleteFlow(payable)}
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
        </div>
      )}

      {/* SUB-TAB 2: DEDICATED RECURRING & INSTALLMENTS VIEW */}
      {activeTab === 'recurring' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Recurring Monthly KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo Recorrente no Mês</p>
                <p className="text-2xl font-black text-slate-800">R$ {recurringTotalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <span className="text-[10px] text-slate-400 font-bold mt-1 block">Aluguel, Fixos e Parcela do mês</span>
              </div>
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100">
                <Repeat size={20} />
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Pago das Recorrentes (Mês)</p>
                <p className="text-2xl font-black text-emerald-800">R$ {recurringPaidMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <span className="text-[10px] text-emerald-600/70 font-bold mt-1 block">Quitações efetuadas</span>
              </div>
              <div className="w-12 h-12 bg-white text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
                <CheckCircle2 size={20} />
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Pendente Recorrente (Mês)</p>
                <p className="text-2xl font-black text-rose-800">R$ {recurringPendingMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <span className="text-[10px] text-rose-600/70 font-bold mt-1 block">Ainda a pagar neste mês</span>
              </div>
              <div className="w-12 h-12 bg-white text-rose-600 rounded-2xl flex items-center justify-center border border-rose-100">
                <CalendarCheck size={20} />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100/50 p-6 rounded-3xl shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Contratos / Séries Ativas</p>
                <p className="text-2xl font-black text-blue-800">{seriesGroups.length}</p>
                <span className="text-[10px] text-blue-600/70 font-bold mt-1 block">Séries de cobrança ativas</span>
              </div>
              <div className="w-12 h-12 bg-white text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100">
                <Layers size={20} />
              </div>
            </div>
          </div>

          {/* Series Cards */}
          {seriesGroups.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-[2.5rem] p-16 text-center text-muted font-bold italic text-sm">
              Nenhuma conta recorrente ou parcelamento cadastrado. Clique em "Cadastrar Conta" para adicionar.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {seriesGroups.map((group, gIdx) => {
                const progressPct = group.totalCount > 0 ? Math.round((group.paidCount / group.totalCount) * 100) : 0;
                return (
                  <div key={`series-card-${group.seriesKey}-${gIdx}`} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[9px] font-black rounded-lg uppercase tracking-wider">
                            {group.category}
                          </span>
                          <h4 className="text-base font-black text-primary mt-2">{group.title}</h4>
                          <p className="text-xs text-slate-500 font-semibold mt-0.5">Fornecedor: {group.supplier}</p>
                        </div>
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black rounded-xl uppercase tracking-wider">
                          {group.totalCount > 1 ? `${group.paidCount}/${group.totalCount}x` : 'Mensal'}
                        </span>
                      </div>

                      {/* Progress Bar for Installments */}
                      {group.totalCount > 1 && (
                        <div className="mt-4 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>Progresso das Parcelas</span>
                            <span>{progressPct}% ({group.paidCount} de {group.totalCount})</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Next Pending Due Date */}
                      {group.nextPending && (
                        <div className="mt-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Próximo Vencimento</p>
                            <p className="text-sm font-black text-primary mt-0.5">
                              {format(parseISO(group.nextPending.dueDate), 'dd/MM/yyyy')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Mensal</p>
                            <p className="text-sm font-black text-slate-800 mt-0.5">
                              R$ {group.monthlyAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      {group.nextPending && group.nextPending.calculatedStatus !== 'paid' && (
                        <button
                          onClick={() => handleOpenSettle(group.nextPending)}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Check size={14} />
                          <span>Pagar Próxima</span>
                        </button>
                      )}
                      <button
                        onClick={() => triggerEditFlow(group.nextPending || group.items[0])}
                        className="px-3 py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title="Editar Série"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => triggerDeleteFlow(group.nextPending || group.items[0])}
                        className="px-3 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title="Excluir Série"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: SCOPE CHOICE FOR EDIT / DELETE RECURRING SERIES */}
      <AnimatePresence>
        {scopeModalOpen && targetScopePayable && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100">
                    <Repeat size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-primary text-base">
                      {scopeTargetAction === 'edit' ? 'Editar Recorrência / Série' : 'Excluir Recorrência / Série'}
                    </h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Escolha a abrangência da alteração</p>
                  </div>
                </div>
                <button 
                  onClick={() => setScopeModalOpen(false)}
                  className="w-8 h-8 rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  Esta conta faz parte de uma série/parcelamento (<strong className="text-primary">{targetScopePayable.description}</strong>). O que deseja alterar?
                </p>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setChosenScope('single')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                      chosenScope === 'single'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input type="radio" checked={chosenScope === 'single'} readOnly className="mt-1 text-primary" />
                    <div>
                      <p className="text-xs font-black">🎯 Apenas esta conta/parcela</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Muda somente o vencimento do dia {format(parseISO(targetScopePayable.dueDate), 'dd/MM/yyyy')}.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChosenScope('future')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                      chosenScope === 'future'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input type="radio" checked={chosenScope === 'future'} readOnly className="mt-1 text-primary" />
                    <div>
                      <p className="text-xs font-black">⏩ Esta e todas as parcelas futuras</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Aplica as alterações nesta parcela e em todos os vencimentos posteriores pendentes.</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChosenScope('series')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                      chosenScope === 'series'
                        ? 'border-primary bg-primary/5 text-primary shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <input type="radio" checked={chosenScope === 'series'} readOnly className="mt-1 text-primary" />
                    <div>
                      <p className="text-xs font-black">🔄 Toda a série do contrato</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Altera todas as parcelas pendentes da série inteira.</p>
                    </div>
                  </button>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setScopeModalOpen(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmScopeAction}
                    className="flex-1 py-3 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-md shadow-primary/10"
                  >
                    Continuar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CREATE / EDIT */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/20 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center border border-primary/10">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <h4 className="font-black text-primary text-base">{editingPayable ? 'Editar Conta a Pagar' : 'Cadastrar Conta a Pagar'}</h4>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Planejamento financeiro e recorrência</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsFormOpen(false)}
                  className="w-8 h-8 rounded-full border border-slate-100 hover:bg-slate-50 text-slate-400 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto">
                {/* Outflow Type Toggle */}
                {!editingPayable && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Conta / Destino</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => {
                          setPayableType('operacional');
                          setFormData(prev => ({ ...prev, category: 'Aluguel', supplier: '' }));
                        }}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          payableType === 'operacional'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Tag size={13} className="hidden sm:block" />
                        <span>Operacional</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayableType('fornecedor');
                          setFormData(prev => ({ ...prev, category: 'Produtos' }));
                        }}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          payableType === 'fornecedor'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <ShoppingCart size={13} className="hidden sm:block" />
                        <span>Fornecedor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayableType('vale');
                          setFormData(prev => ({ 
                            ...prev, 
                            category: 'Comissões', 
                            description: 'Vale antecipado de comissão',
                            supplier: ''
                          }));
                        }}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          payableType === 'vale'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <User size={13} className="hidden sm:block" />
                        <span>Lançar Vale</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Barber Selection (Vale Only) */}
                {isValeType && (
                  <div className="space-y-1.5 animate-fadeIn">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profissional Beneficiado *</label>
                    <select
                      required
                      value={selectedBarberId}
                      onChange={e => setSelectedBarberId(e.target.value)}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer"
                    >
                      <option value="">Selecione o profissional...</option>
                      {barbers.map((b, bIdx) => (
                        <option key={`ap-barber-opt-${b.id || bIdx}-${bIdx}`} value={b.id}>{b.nome}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Recurrence Mode Options (For Operational/Fornecedor) */}
                {!isValeType && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modalidade de Cobrança</label>
                    <div className="grid grid-cols-3 gap-2 bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, billingType: 'single', recurrence: 'none' }))}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                          formData.billingType === 'single'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span>Única</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, billingType: 'recurring', recurrence: 'monthly' }))}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                          formData.billingType === 'recurring'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span>🔄 Recorrente (Fixo)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, billingType: 'installments', recurrence: 'monthly' }))}
                        className={`py-2 px-2 text-center rounded-xl text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                          formData.billingType === 'installments'
                            ? 'bg-white text-primary shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span>🔢 Parcelado</span>
                      </button>
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
                    placeholder={isValeType ? 'Ex: Adiantamento emergencial' : 'Ex: Aluguel da Barbearia, Compra Cadeira, etc.'}
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
                      {formData.billingType === 'installments' ? 'Vencimento 1ª Parcela *' : 'Vencimento *'}
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

                {!isValeType && (
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
                          {categories.map((cat, catIdx) => (
                            <option key={`ap-cat-opt-${cat}-${catIdx}`} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* Frequency / Installments Count */}
                      {formData.billingType === 'recurring' ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frequência</label>
                          <select
                            value={formData.recurrence}
                            onChange={e => setFormData({ ...formData, recurrence: e.target.value as any })}
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none cursor-pointer"
                          >
                            <option value="weekly">Semanal</option>
                            <option value="biweekly">Quinzenal</option>
                            <option value="monthly">Mensal</option>
                            <option value="quarterly">Trimestral</option>
                            <option value="yearly">Anual</option>
                          </select>
                        </div>
                      ) : formData.billingType === 'installments' ? (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nº de Parcelas</label>
                          <input 
                            type="number"
                            min="2"
                            max="72"
                            required
                            value={formData.totalInstallments}
                            onChange={e => setFormData({ ...formData, totalInstallments: e.target.value })}
                            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none"
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Preferred Payment Method */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Forma de Pagamento Pretendida / Prevista</label>
                      <select
                        value={formData.paymentMethod}
                        onChange={e => setFormData({ ...formData, paymentMethod: e.target.value })}
                        className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-slate-600 focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="pix">PIX</option>
                        <option value="boleto">Boleto Bancário</option>
                        <option value="cartao_credito">Cartão de Crédito</option>
                        <option value="transferencia">Transferência Bancária (TED/DOC)</option>
                        <option value="dinheiro">Dinheiro Espécie</option>
                      </select>
                    </div>

                    {/* Supplier */}
                    {payableType === 'fornecedor' && (
                      <div className="space-y-1.5 animate-fadeIn">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor / Favorecido</label>
                        <input 
                          type="text"
                          required
                          placeholder="Ex: Distribuidora XYZ"
                          value={formData.supplier}
                          onChange={e => setFormData({ ...formData, supplier: e.target.value })}
                          className="w-full bg-slate-50/50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-primary focus:outline-none"
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={submittingForm}
                  className="w-full py-4 bg-primary text-white font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-primary/10 mt-4"
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
                    ].map((method, mIdx) => (
                      <button
                        key={`ap-settle-mth-${method.value}-${mIdx}`}
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
