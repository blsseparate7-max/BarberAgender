import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Filter, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowDownLeft,
  Clock, 
  CreditCard, 
  Wallet, 
  Search,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ArrowRightLeft,
  Lock,
  Unlock,
  FileText,
  Download,
  Minus,
  X,
  User,
  PieChart,
  BarChart3,
  Receipt,
  Smartphone,
  History,
  RefreshCcw,
  UserCheck,
  UserMinus,
  Briefcase,
  Edit2,
  Percent,
  Save,
  Sparkles,
  Award,
  Play,
  Pause,
  Activity,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  addDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  FinancialTransaction, 
  DailyCash, 
  FinancialCategory, 
  PaymentMethod, 
  PaymentMethodConfig,
  TransactionType, 
  ClientDebt, 
  DebtPayment,
  Commission,
  Product
} from '../types';
import { financialService } from '../services/financialService';
import { cashService } from '../services/cashService';
import { debtService } from '../services/debtService';
import { commissionService } from '../services/commissionService';
import { userService } from '../services/userService';
import { comandaService } from '../services/comandaService';
import { paymentMethodService } from '../services/paymentMethodService';
import { inventoryService } from '../services/inventoryService';
import { subscriptionService } from '../services/subscriptionService';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { parseDate } from '../lib/utils';
import { ProfessionalCommissions } from '../components/Financeiro/ProfessionalCommissions';
import { DREGerencial } from '../components/Financeiro/DREGerencial';
import { InputModal } from '../components/InputModal';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  BarChart, 
  Bar, 
  Cell 
} from 'recharts';

export function Financeiro({ activeSubTab }: { activeSubTab?: string }) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'dre' | 'daily-cash' | 'cash-history' | 'entries' | 'exits' | 'entries-exits' | 'client-accounts' | 'professional-accounts' | 'receivables' | 'commissions' | 'payment-methods' | 'inconsistencies' | 'inventory-finance' | 'subscriptions'>('overview');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>('income');
  const [isSangriaModalOpen, setIsSangriaModalOpen] = useState(false);
  const [isReforcoModalOpen, setIsReforcoModalOpen] = useState(false);
  const [sangriaData, setSangriaData] = useState({ amount: '', description: '' });
  const [reforcoData, setReforcoData] = useState({ amount: '', description: '' });
  const [inconsistencyLogs, setInconsistencyLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDebtPayment, setConfirmDebtPayment] = useState<ClientDebt | null>(null);
  const [selectedClientAccount, setSelectedClientAccount] = useState<string | null>(null);
  const [selectedProAccount, setSelectedProAccount] = useState<string | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<'all' | 'debtors' | 'creditors'>('all');
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethodConfig | null>(null);

  // Estados para Gestão de Assinantes e Transações
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [subSearchTerm, setSubSearchTerm] = useState('');
  const [subFilter, setSubFilter] = useState<'all' | 'active' | 'expired' | 'canceled' | 'paused' | 'pending'>('all');
  const [isNewSubscriptionModalOpen, setIsNewSubscriptionModalOpen] = useState(false);
  const [selectedSubForUsage, setSelectedSubForUsage] = useState<any | null>(null);

  const [newSubClientId, setNewSubClientId] = useState('');
  const [newSubPlanId, setNewSubPlanId] = useState('');
  const [newSubAutoRenew, setNewSubAutoRenew] = useState(true);

  const handleUpdateStatus = async (subId: string, newStatus: any) => {
    try {
      setLoadingSubscriptions(true);
      await subscriptionService.updateSubscriptionStatus(subId, newStatus);
      toast.success(`Assinatura atualizada para o estado: ${
        newStatus === 'active' ? 'Ativa' : newStatus === 'paused' ? 'Pausada' : 'Cancelada'
      }`);
      const subs = await subscriptionService.getSubscriptions();
      setSubscriptions(subs);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao atualizar status.");
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  const handleRegisterUsage = async (subId: string, type: 'haircut' | 'beard') => {
    try {
      setLoadingSubscriptions(true);
      await subscriptionService.registerUsage(subId, type);
      toast.success(`Consumo de ${type === 'haircut' ? 'Corte' : 'Barba'} registrado com sucesso!`);
      setSelectedSubForUsage(null);
      const subs = await subscriptionService.getSubscriptions();
      setSubscriptions(subs);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao registrar consumo. Verifique as regras do plano!");
    } finally {
      setLoadingSubscriptions(false);
    }
  };

  useEffect(() => {
    if (activeSubTab) {
      const tabMap: Record<string, typeof activeTab> = {
        'financeiro-caixa': 'daily-cash',
        'financeiro-historico': 'cash-history',
        'financeiro-comissoes': 'commissions',
        'financeiro-movimentacoes': 'entries-exits',
        'financeiro-fiados': 'client-accounts',
        'financeiro-contas-receber': 'client-accounts',
        'financeiro-contas-pagar': 'entries-exits',
        'financeiro-fluxo': 'overview',
        'financeiro-assinaturas': 'subscriptions'
      };
      
      const targetTab = tabMap[activeSubTab];
      if (targetTab) {
        setActiveTab(targetTab);
      }

      if (activeSubTab === 'financeiro-entradas') {
        setActiveTab('entries-exits');
        setTransactionType('income');
        setIsTransactionModalOpen(true);
      } else if (activeSubTab === 'financeiro-saidas') {
        setActiveTab('entries-exits');
        setTransactionType('expense');
        setIsTransactionModalOpen(true);
      }
    }
  }, [activeSubTab]);

  const [stats, setStats] = useState({ income: 0, expense: 0, balance: 0, pendingFiado: 0, disponivel: 0, aReceberCartoes: 0 });
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [currentCash, setCurrentCash] = useState<DailyCash | null>(null);
  const [cashHistory, setCashHistory] = useState<DailyCash[]>([]);

  // Subscrição em tempo real do status do caixa e transações
  useEffect(() => {
    const unsubscribeCash = cashService.subscribeToCurrentCash((cash) => {
      setCurrentCash(cash);
    });

    // Real-time transactions for the current period
    const q = query(
      collection(db, 'financial_transactions'),
      where('date', '>=', dateRange.start),
      where('date', '<=', dateRange.end),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialTransaction));
      setTransactions(txs);
      
      // Also update stats locally to avoid a separate fetch
      const income = txs
        .filter(t => t.type === 'income' && t.status === 'pago')
        .reduce((acc, t) => acc + t.amount, 0);
        
      const expense = txs
        .filter(t => t.type === 'expense' && t.status === 'pago')
        .reduce((acc, t) => acc + t.amount, 0);
        
      const pendingFiado = txs
        .filter(t => t.paymentMethod === 'fiado' && t.status === 'pendente')
        .reduce((acc, t) => acc + t.amount, 0);

      const aReceberCartoes = txs
        .filter(t => t.type === 'income' && t.status === 'pago' && (t.is_settled === false || t.paymentMethod === 'credito' || t.paymentMethod === 'debito'))
        .reduce((acc, t) => acc + (t.net_amount || t.amount), 0);

      const disponivel = txs
        .filter(t => t.type === 'income' && t.status === 'pago' && t.is_settled !== false && t.paymentMethod !== 'credito' && t.paymentMethod !== 'debito')
        .reduce((acc, t) => acc + t.amount, 0) - expense;

      setStats({
        income,
        expense,
        balance: income - expense,
        pendingFiado,
        disponivel,
        aReceberCartoes
      });
      setLoading(false);
    });

    return () => {
      unsubscribeCash();
      unsubscribeTransactions();
    };
  }, [dateRange.start, dateRange.end]);

  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [pendingDebts, setPendingDebts] = useState<ClientDebt[]>([]);

  // Modal states
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashToReopen, setCashToReopen] = useState<DailyCash | null>(null);
  const [reopenReason, setReopenReason] = useState('');

  const handleReopenCash = async (cash: DailyCash) => {
    if (!isAdmin && !isGerente) {
      toast.error("Apenas administradores podem reabrir o caixa.");
      return;
    }
    setCashToReopen(cash);
    setReopenReason('');
  };

  const confirmReopenCash = async () => {
    if (!cashToReopen || !reopenReason) return;
    
    try {
      await cashService.reopenCash(cashToReopen.id, {
        userId: user?.uid || '',
        userName: profile?.nome || 'Usuário',
        reason: reopenReason
      });
      toast.success("Caixa reaberto com sucesso!");
      setCashToReopen(null);
      loadData();
    } catch (error) {
      toast.error("Erro ao reabrir caixa.");
    }
  };

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const memoizedPaymentMethods = React.useMemo(() => paymentMethods, [paymentMethods]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'immediate' | 'cards' | 'internal'>('all');

  const filteredPaymentMethods = React.useMemo(() => {
    return paymentMethods.filter(method => {
      if (paymentMethodFilter === 'immediate') {
        return method.recebe_na_hora || method.prazo_recebimento === 0;
      }
      if (paymentMethodFilter === 'cards') {
        return method.tipo === 'credito' || method.tipo === 'debito' || (method.taxa_percentual || 0) > 0;
      }
      if (paymentMethodFilter === 'internal') {
        return method.tipo === 'fiado' || method.tipo === 'assinatura' || method.vai_para_conta_cliente || method.tipo === 'outros';
      }
      return true;
    });
  }, [paymentMethods, paymentMethodFilter]);

  const [professionals, setProfessionals] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);

  useEffect(() => {
    paymentMethodService.getActivePaymentMethods().then(setPaymentMethods);
  }, []);

  useEffect(() => {
    loadData();
  }, [dateRange.start, dateRange.end, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'accounts-receivable') {
        const debts = await debtService.getPendingDebts();
        setPendingDebts(debts);
      }

      if (activeTab === 'cash-history') {
        const history = await cashService.getCashHistory(dateRange.start, dateRange.end);
        setCashHistory(history);
      }

      if (activeTab === 'commissions' || activeTab === 'professional-accounts' || activeTab === 'dre') {
        const filters: any = {
          startDate: dateRange.start,
          endDate: dateRange.end
        };

        // If not staff, force filter by current user to avoid permission error
        if (!isAdmin && !isGerente && profile?.tipo === 'barbeiro') {
          filters.profissional_id = user?.uid;
        }

        const comms = await commissionService.getCommissions(filters);
        setCommissions(comms);

        if (activeTab === 'professional-accounts') {
          const [barbers, allPayouts, allAdvances] = await Promise.all([
            userService.getAllBarbers(),
            commissionService.getPayouts(),
            commissionService.getAdvances({})
          ]);
          setProfessionals(barbers);
          setPayouts(allPayouts);
          setAdvances(allAdvances);
        }
      }

      if (activeTab === 'payment-methods') {
        const methods = await paymentMethodService.getPaymentMethods();
        setPaymentMethods(methods);
      }

      if (activeTab === 'client-accounts') {
        const allClients = await userService.getAllClients();
        setClients(allClients);
      }

      if (activeTab === 'subscriptions') {
        setLoadingSubscriptions(true);
        const [subs, plans, allClients] = await Promise.all([
          subscriptionService.getSubscriptions(),
          subscriptionService.getPlans(),
          userService.getAllClients()
        ]);
        setSubscriptions(subs);
        setSubscriptionPlans(plans);
        setClients(allClients);
        setLoadingSubscriptions(false);
      }

      if (activeTab === 'inventory-finance') {
        const prodList = await inventoryService.getProducts();
        setProducts(prodList);
      }

      if (activeTab === 'inconsistencies') {
        const q = query(
          collection(db, 'inconsistency_logs'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        setInconsistencyLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    } catch (error) {
      console.error("Erro ao carregar dados financeiros:", error);
    } finally {
      setLoading(false);
    }
  };

  const { execute: executeOpenCash, isLoading: isOpeningCash } = useAsyncAction(async (openingBalance: number) => {
    if (!user) return;
    await cashService.openCash({
      opening_balance: openingBalance,
      userId: user.uid,
      userName: user.displayName || 'Sistema'
    });
    loadData();
    setIsCashModalOpen(false);
  });

  const { execute: executeCloseCash, isLoading: isClosingCash } = useAsyncAction(async (closingBalance: number) => {
    if (!currentCash || !user) return;
    await cashService.closeCash(currentCash.id, {
      actual_balance: closingBalance,
      userId: user.uid,
      userName: user.displayName || 'Sistema'
    });
    loadData();
    setIsCashModalOpen(false);
  });

  const { execute: executeDebtPayment, isLoading: isPayingDebt } = useAsyncAction(async (amountStr: string) => {
    if (!user || !confirmDebtPayment) return;
    
    const paymentAmount = parseFloat(amountStr);
    if (isNaN(paymentAmount) || paymentAmount <= 0 || paymentAmount > confirmDebtPayment.remainingAmount) {
      toast.error("Valor inválido.");
      return;
    }

    try {
      await debtService.registerPayment({
        divida_id: confirmDebtPayment.id,
        cliente_id: confirmDebtPayment.cliente_id,
        amount: paymentAmount,
        paymentMethod: 'dinheiro',
        userId: user.uid,
        userName: profile?.nome || 'Sistema'
      });
      
      if (currentCash) {
        await cashService.addMovement({
          caixa_id: currentCash.id,
          type: 'income',
          amount: paymentAmount,
          description: `Recebimento de Fiado - ${confirmDebtPayment.cliente_name}`,
          category: 'Recebimento Fiado',
          paymentMethod: 'dinheiro',
          is_receivable: false,
          usuario_id: user.uid,
          usuario_name: profile?.nome || 'Sistema',
          date: new Date().toISOString().split('T')[0]
        });
      }

      toast.success(`Pagamento de R$ ${paymentAmount.toFixed(2)} registrado!`);
      loadData();
      setConfirmDebtPayment(null);
    } catch (error) {
      console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento.");
    }
  });

  const { execute: executeMarkAsPaid, isLoading: isMarkingPaid } = useAsyncAction(async (transaction: FinancialTransaction) => {
    await financialService.updateTransaction(transaction.id, { status: 'pago' });
    loadData();
  });

  const handleSangria = async () => {
    if (!currentCash || !user || !sangriaData.amount) return;
    const amount = parseFloat(sangriaData.amount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await cashService.addMovement({
        caixa_id: currentCash.id,
        type: 'sangria',
        category: 'Sangria de Caixa',
        description: sangriaData.description || 'Sangria manual',
        amount,
        paymentMethod: 'dinheiro',
        is_receivable: false,
        usuario_id: user.uid,
        usuario_name: profile?.nome || 'Admin',
        date: new Date().toISOString().split('T')[0]
      });
      toast.success("Sangria registrada com sucesso!");
      setIsSangriaModalOpen(false);
      setSangriaData({ amount: '', description: '' });
      loadData();
    } catch (error) {
      toast.error("Erro ao registrar sangria.");
    }
  };

  const handleReforco = async () => {
    if (!currentCash || !user || !reforcoData.amount) return;
    const amount = parseFloat(reforcoData.amount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await cashService.addMovement({
        caixa_id: currentCash.id,
        type: 'reforco',
        category: 'Reforço de Caixa',
        description: reforcoData.description || 'Reforço manual',
        amount,
        paymentMethod: 'dinheiro',
        is_receivable: false,
        usuario_id: user.uid,
        usuario_name: profile?.nome || 'Admin',
        date: new Date().toISOString().split('T')[0]
      });
      toast.success("Reforço registrado com sucesso!");
      setIsReforcoModalOpen(false);
      setReforcoData({ amount: '', description: '' });
      loadData();
    } catch (error) {
      toast.error("Erro ao registrar reforço.");
    }
  };

  const handleSettleReceivable = async (id: string) => {
    try {
      await financialService.updateTransaction(id, { is_settled: true });
      toast.success("Recebível liquidado e conciliado com sucesso!");
      loadData();
    } catch (error) {
      toast.error("Erro ao conciliar recebível.");
    }
  };

  const handleExportTransactions = () => {
    if (transactions.length === 0) {
      toast.error("Não há transações para exportar.");
      return;
    }

    try {
      const headers = ['Data', 'Tipo', 'Descrição', 'Valor', 'Categoria', 'Método', 'Status', 'Cliente'];
      const rows = transactions.map(t => [
        format(new Date(t.date), 'dd/MM/yyyy'),
        t.type === 'income' ? 'Entrada' : 'Saída',
        t.description,
        t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        t.category,
        t.paymentMethod,
        t.status,
        t.cliente_name || ''
      ]);

      const csvContent = [headers, ...rows]
        .map(e => e.join(";"))
        .join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `financeiro_relatorio_${dateRange.start}_${dateRange.end}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Relatório exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao gerar relatório.");
    }
  };

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary">Gestão Financeira</h1>
          <p className="text-muted text-sm font-medium mt-1">Controle de entradas, saídas e fluxo de caixa estratégico.</p>
        </div>
        
        {/* Filtro Global de Período para abas temporais */}
        {['overview', 'dre', 'cash-history', 'entries-exits', 'commissions', 'professional-accounts'].includes(activeTab) && (
          <div className="flex items-center bg-white border border-slate-200 rounded-[1.25rem] px-4 py-2.5 shadow-sm self-start lg:self-auto">
            <div className="flex items-center gap-2">
              <Calendar className="text-slate-400" size={16} />
              <div className="flex items-center gap-1.5">
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  className="bg-transparent text-xs font-extrabold text-primary focus:outline-none cursor-pointer"
                />
                <span className="text-xs text-slate-300 font-bold">|</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  className="bg-transparent text-xs font-extrabold text-primary focus:outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={() => {
              setTransactionType('expense');
              setIsTransactionModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-red-600 px-5 py-3 rounded-2xl font-bold text-sm hover:bg-red-50 transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <TrendingDown size={18} />
            <span className="hidden sm:inline">Nova Saída</span>
          </button>
          <button 
            onClick={() => {
              setTransactionType('income');
              setIsTransactionModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95 cursor-pointer"
          >
            <TrendingUp size={18} />
            <span>Nova Entrada</span>
          </button>
        </div>
      </header>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Disponível Hoje" 
          value={stats.disponivel} 
          icon={<Wallet size={20} />} 
          color="emerald"
          subtitle="Dinheiro/PIX imediato (líquido)"
        />
        <StatCard 
          title="A Receber Cartões" 
          value={stats.aReceberCartoes} 
          icon={<CreditCard size={20} />} 
          color="blue"
          subtitle="Previsão amanhã/futura (D+1+)"
        />
        <StatCard 
          title="Fiados Pendentes" 
          value={stats.pendingFiado} 
          icon={<Clock size={20} />} 
          color="amber"
          subtitle="Contas de clientes em aberto"
        />
        <StatCard 
          title="Saídas Gerais" 
          value={stats.expense} 
          icon={<TrendingDown size={20} />} 
          color="red"
          subtitle="Total de saídas no período"
        />
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto custom-scrollbar no-scrollbar gap-2 py-1 scroll-smooth">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} label="Fluxo de Caixa" icon={<PieChart size={16} />} />
        <TabButton active={activeTab === 'dre'} onClick={() => setActiveTab('dre')} label="DRE Gerencial" icon={<BarChart3 size={16} />} />
        <TabButton active={activeTab === 'daily-cash'} onClick={() => setActiveTab('daily-cash')} label="Caixa" icon={<Receipt size={16} />} />
        <TabButton active={activeTab === 'cash-history'} onClick={() => setActiveTab('cash-history')} label="Histórico de Caixas" icon={<History size={16} />} />
        <TabButton active={activeTab === 'entries-exits'} onClick={() => setActiveTab('entries-exits')} label="Entradas e Saídas" icon={<ArrowRightLeft size={16} />} />
        <TabButton active={activeTab === 'commissions'} onClick={() => setActiveTab('commissions')} label="Comissões" icon={<Percent size={16} />} />
        <TabButton active={activeTab === 'client-accounts'} onClick={() => setActiveTab('client-accounts')} label="Conta do Cliente" icon={<User size={16} />} />
        <TabButton active={activeTab === 'inventory-finance'} onClick={() => setActiveTab('inventory-finance')} label="Estoque" icon={<BarChart3 size={16} />} />
        <TabButton active={activeTab === 'professional-accounts'} onClick={() => setActiveTab('professional-accounts')} label="Conta do Profissional" icon={<Briefcase size={16} />} />
        {(isAdmin || isGerente) && (
          <TabButton active={activeTab === 'subscriptions'} onClick={() => setActiveTab('subscriptions')} label="Assinaturas" icon={<Sparkles className="text-purple-500 scale-110" size={16} />} />
        )}
        {(isAdmin || isGerente) && (
          <TabButton active={activeTab === 'payment-methods'} onClick={() => setActiveTab('payment-methods')} label="Métodos de Pagamento" icon={<CreditCard size={16} />} />
        )}
        {(isAdmin || isGerente) && (
          <TabButton active={activeTab === 'inconsistencies'} onClick={() => setActiveTab('inconsistencies')} label="Inconsistências" icon={<AlertTriangle size={16} />} />
        )}
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <Loader2 className="animate-spin text-accent" size={48} />
            <p className="text-muted font-bold animate-pulse">Processando inteligência financeira...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Visual Cash Flow Chart & Trend */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                      <h3 className="font-bold text-xl text-primary flex items-center gap-2">
                        <PieChart size={20} className="text-accent" />
                        Fluxo de Caixa Operacional
                      </h3>
                      <p className="text-xs text-muted font-medium mt-1">Comparativo de receitas e despesas diárias consolidadas pelo período selecionado.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 bg-emerald-500 rounded-full" />
                      <span className="text-[10px] uppercase font-black text-slate-500 mr-4">Receitas</span>
                      <span className="w-3 h-3 bg-red-400 rounded-full" />
                      <span className="text-[10px] uppercase font-black text-slate-500">Despesas</span>
                    </div>
                  </div>

                  <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={(() => {
                          const dailyMap: Record<string, { date: string, rawDate: string, receitas: number, despesas: number }> = {};
                          transactions.forEach(t => {
                            const dateStr = t.date;
                            if (!dailyMap[dateStr]) {
                              dailyMap[dateStr] = {
                                rawDate: dateStr,
                                date: format(new Date(dateStr + 'T00:00:00'), 'dd/MM'),
                                receitas: 0,
                                despesas: 0
                              };
                            }
                            if (t.type === 'income') {
                              dailyMap[dateStr].receitas += t.amount;
                            } else if (t.type === 'expense' || t.type === 'sangria') {
                              dailyMap[dateStr].despesas += t.amount;
                            }
                          });
                          const list = Object.values(dailyMap).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
                          return list.length > 0 ? list : [
                            { date: 'Sem dados', rawDate: '', receitas: 0, despesas: 0 }
                          ];
                        })()}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="date" tickLine={false} axisLine={false} style={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                        <YAxis tickLine={false} axisLine={false} style={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                        <Tooltip 
                          contentStyle={{ background: '#0F172A', borderRadius: '16px', border: 'none', color: '#fff' }}
                          labelStyle={{ fontWeight: 800, fontSize: 11 }}
                          itemStyle={{ fontSize: 12, fontWeight: 700 }}
                        />
                        <Area type="monotone" dataKey="receitas" name="Receitas" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReceitas)" />
                        <Area type="monotone" dataKey="despesas" name="Despesas / Sangrias" stroke="#f87171" strokeWidth={2} fillOpacity={1} fill="url(#colorDespesas)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Latest Actions / Logs */}
                  <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                        <BarChart3 size={18} className="text-secondary" />
                        Últimas Movimentações
                      </h3>
                      <button onClick={() => setActiveTab('entries-exits')} className="text-xs text-accent font-extrabold hover:bg-accent/5 px-3 py-1.5 rounded-lg transition-all">Ver todas</button>
                    </div>
                    <div className="space-y-4">
                      {transactions.slice(0, 5).map((t, index) => (
                        <TransactionItem key={`trans-overview-${t.id || index}-${index}`} transaction={t} />
                      ))}
                      {transactions.length === 0 && (
                        <div className="text-center py-10 text-muted italic text-sm">Nenhuma transação recente.</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Ledger Performance Indicators */}
                  <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                    <h3 className="font-bold text-lg text-primary mb-8 flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-500" />
                      Indicadores de Performance e Saúde Financeira
                    </h3>

                    <div className="space-y-6">
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-primary">Margem Operacional Estimada (EBITDA)</p>
                          <p className="text-[10px] text-muted font-semibold">Faturamento total deduzido de despesas diretas.</p>
                        </div>
                        <p className="text-base font-black text-slate-800">
                          R$ {(stats.income - stats.expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-primary">Rentabilidade Esperada no Período</p>
                          <p className="text-[10px] text-muted font-semibold">Proporção líquida das receitas convertidas livremente.</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600">
                          {stats.income > 0 ? (((stats.income - stats.expense) / stats.income) * 100).toFixed(1) + '%' : '100.0%'}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-primary">Taxa de Liquidação Imediata (Dinheiro/PIX)</p>
                          <p className="text-[10px] text-muted font-semibold">Volume de recursos disponíveis à vista instantaneamente.</p>
                        </div>
                        <p className="text-sm font-black text-blue-600">
                          R$ {stats.disponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-primary">Crédito Inadimplente Estimado (Fiados)</p>
                          <p className="text-[10px] text-muted font-semibold">Total pendente de recebimento direto com clientes.</p>
                        </div>
                        <p className="text-sm font-black text-amber-600">
                          R$ {stats.pendingFiado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'dre' && (
              <motion.div 
                key="dre"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <DREGerencial 
                  transactions={transactions} 
                  commissions={commissions} 
                  dateRange={dateRange}
                />
              </motion.div>
            )}

            {activeTab === 'daily-cash' && (
              <motion.div 
                key="daily-cash"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                {currentCash ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                          <h3 className="font-bold text-xl text-primary flex items-center gap-2">
                            <ArrowRightLeft size={20} className="text-accent" />
                            Movimentações do Dia
                          </h3>
                        </div>
                        <CashMovementList caixaId={currentCash.id} />
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-[2.5rem] p-8 relative overflow-hidden group shadow-sm">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 group-hover:scale-110 transition-transform" />
                        <div className="flex items-center gap-4 mb-6">
                          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                            <Unlock size={24} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-emerald-900">Caixa Aberto</p>
                            <p className="text-[10px] text-emerald-600/70 font-black uppercase tracking-widest">{format(parseDate(currentCash.openedAt), 'HH:mm')} • {currentCash.openedByName}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-emerald-700/60 font-bold uppercase tracking-widest">Saldo Inicial</span>
                            <span className="font-black text-emerald-900 text-sm">R$ {currentCash.openingBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-emerald-700/60 font-bold uppercase tracking-widest">Entradas Disponíveis (Dinheiro/Pix)</span>
                            <span className="font-black text-emerald-600 text-sm">+R$ {currentCash.totalIncome?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-emerald-700/60 font-bold uppercase tracking-widest">Saídas/Sangria</span>
                            <span className="font-black text-red-600 text-sm">-R$ {((currentCash.totalExpense || 0) + (currentCash.total_sangria || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          {(currentCash.total_receivables || currentCash.totalReceivables || 0) > 0 && (
                            <div className="flex justify-between items-center text-xs pt-2 border-t border-emerald-200/30">
                              <span className="text-blue-700/60 font-bold uppercase tracking-widest">A Receber amanhã (D+1)</span>
                              <span className="font-black text-blue-600 text-sm">R$ {(currentCash.total_receivables || currentCash.totalReceivables || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          <div className="pt-4 border-t border-emerald-200/50 flex justify-between items-center">
                            <span className="text-emerald-900 font-bold text-sm">Saldo Esperado (Disponível)</span>
                            <span className="font-black text-emerald-900 text-xl">R$ {currentCash.expectedBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setIsCashModalOpen(true)}
                          className="w-full mt-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                        >
                          Fechar o Caixa
                        </button>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-sm">
                        <h3 className="font-bold text-lg text-primary mb-6 flex items-center gap-2">
                          <Download size={18} className="text-muted" />
                          Ações Rápidas
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          <button 
                            onClick={() => setIsSangriaModalOpen(true)}
                            className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-[1.25rem] text-xs font-bold text-primary transition-all border border-slate-100"
                          >
                            <TrendingDown size={16} className="text-red-500" />
                            <span>Registrar Sangria</span>
                          </button>
                          <button 
                            onClick={() => setIsReforcoModalOpen(true)}
                            className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-[1.25rem] text-xs font-bold text-primary transition-all border border-slate-100"
                          >
                            <Plus size={16} className="text-emerald-500" />
                            <span>Reforço de Caixa</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 space-y-10 group">
                    <div className="relative">
                      <div className="absolute inset-0 bg-slate-200 rounded-full blur-3xl opacity-20 group-hover:opacity-30 transition-opacity" />
                      <div className="bg-white border-2 border-slate-100 w-32 h-32 rounded-[2.5rem] flex items-center justify-center text-slate-300 relative z-10 shadow-xl group-hover:scale-105 transition-transform duration-500">
                        <Lock size={56} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-3xl font-black text-primary">Caixa Fechado</h2>
                      <p className="text-muted max-w-sm font-medium">O caixa ainda não foi aberto para o dia de hoje. Inicie uma nova jornada financeira.</p>
                    </div>
                    <button 
                      onClick={() => setIsCashModalOpen(true)}
                      className="px-10 py-5 bg-primary text-white rounded-[2rem] font-black text-sm hover:bg-slate-800 transition-all shadow-2xl shadow-primary/20 active:scale-95 flex items-center gap-3"
                    >
                      <Unlock size={20} />
                      Abrir Caixa Diário
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'entries-exits' && (
              <motion.div 
                key="entries-exits"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm"
              >
                {/* Advanced Unified Entries & Exits Filter toolbar */}
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-xl font-bold text-primary">Histórico de Entradas e Saídas</h3>
                    <p className="text-xs text-muted font-medium mt-1">Lançamentos financeiros de caixas fechados e conciliações gerais.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={() => {
                        setTransactionType('income');
                        setIsTransactionModalOpen(true);
                      }}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Plus size={14} />
                      Nova Entrada
                    </button>
                    <button 
                      onClick={() => {
                        setTransactionType('expense');
                        setIsTransactionModalOpen(true);
                      }}
                      className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Minus size={14} />
                      Nova Saída
                    </button>
                  </div>
                </div>

                <div className="p-8 bg-slate-50/30 border-b border-slate-100 flex flex-wrap items-center justify-between gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-100/80 border border-slate-200/50 rounded-2xl px-4 py-2.5 shadow-sm text-xs font-semibold text-primary">
                      <Calendar className="text-slate-500" size={14} />
                      <span>Filtrado por Período Geral: <strong className="font-extrabold">{format(new Date(dateRange.start + 'T00:00:00'), 'dd/MM/yyyy')}</strong> até <strong className="font-extrabold">{format(new Date(dateRange.end + 'T00:00:00'), 'dd/MM/yyyy')}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
                    {['all', 'income', 'expense'].map((filterType) => (
                      <button
                        key={filterType}
                        onClick={() => {
                          (window as any)._txFilterType = filterType;
                          loadData();
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          ((window as any)._txFilterType || 'all') === filterType
                            ? 'bg-primary text-white' 
                            : 'text-muted hover:text-primary bg-transparent'
                        }`}
                      >
                        {filterType === 'all' ? 'Ver Tudo' : filterType === 'income' ? 'Entradas' : 'Saídas'}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Descrição</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Categoria</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Método</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Data</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions
                        .filter(t => {
                          const currentF = (window as any)._txFilterType || 'all';
                          if (currentF === 'income') return t.type === 'income';
                          if (currentF === 'expense') return t.type === 'expense';
                          return true;
                        })
                        .map((t, index) => (
                        <tr key={`trans-rows-${t.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6">
                            <p className="text-sm font-bold text-primary">{t.description}</p>
                            {t.cliente_name && <p className="text-[10px] text-muted font-bold">Cliente: {t.cliente_name}</p>}
                          </td>
                          <td className="px-8 py-6">
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">{t.category}</span>
                          </td>
                          <td className="px-8 py-6 text-center">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.paymentMethod}</span>
                          </td>
                          <td className="px-8 py-6 text-center text-xs text-slate-500 font-bold">
                            {format(new Date(t.date + 'T00:00:00'), 'dd/MM/yyyy')}
                          </td>
                          <td className={`px-8 py-6 text-right text-sm font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                            {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-6 text-center">
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                              t.status === 'pago' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                            }`}>
                              {t.status === 'pago' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-16 text-muted italic text-sm">Nenhum lançamento no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'inventory-finance' && (
              <motion.div 
                key="inventory-finance"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                {/* Financial overview of stock asset valuation */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Valor de Custo (Estoque Ativo)</p>
                    <p className="text-2xl font-black text-primary">
                      R$ {products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.costPrice || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-muted font-medium">Investimento de capital imobilizado</p>
                  </div>
                  <div className="bg-white border border-slate-200 p-6 rounded-3xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Potencial de Venda (Faturamento)</p>
                    <p className="text-2xl font-black text-emerald-600">
                      R$ {products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.salePrice || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-emerald-600/70 font-semibold">Faturamento bruto estimado</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-emerald-800 font-bold uppercase tracking-widest">Lucro Bruto Estimado</p>
                    <p className="text-2xl font-black text-emerald-700">
                      R$ {products.reduce((acc, p) => acc + ((p.currentStock || 0) * ((p.salePrice || 0) - (p.costPrice || 0))), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] text-emerald-700/70 font-semibold">Retorno projetado sob vendas</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl space-y-1 shadow-sm">
                    <p className="text-[10px] text-blue-800 font-bold uppercase tracking-widest">Markup Médio Geral (%)</p>
                    <p className="text-2xl font-black text-blue-800">
                      {(() => {
                        const totalCost = products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.costPrice || 0)), 0);
                        const totalSale = products.reduce((acc, p) => acc + ((p.currentStock || 0) * (p.salePrice || 0)), 0);
                        return totalCost > 0 ? (((totalSale - totalCost) / totalCost) * 100).toFixed(1) + '%' : '0.0%';
                      })()}
                    </p>
                    <p className="text-[10px] text-blue-700/70 font-semibold">Margem multiplicadora média</p>
                  </div>
                </div>

                {/* Stock Level Alarms and alerts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base text-primary mb-6 flex items-center gap-2">
                        <AlertTriangle className="text-amber-500" size={18} />
                        Alertas de Estoque Crítico
                      </h3>
                      <div className="space-y-3">
                        {products.filter(p => (p.currentStock || 0) <= (p.minStock || 0)).slice(0, 4).map((p, index) => (
                          <div key={`inv-alert-${p.id || index}-${index}`} className="flex items-center justify-between p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl">
                            <div>
                              <p className="text-xs font-bold text-amber-950">{p.name}</p>
                              <p className="text-[9px] text-amber-600 font-bold uppercase tracking-widest mb-1">Mínimo: {p.minStock || 0} unid.</p>
                            </div>
                            <span className="bg-amber-600 text-white rounded-lg px-2 py-0.5 text-[10px] font-extrabold">
                              {p.currentStock || 0} Unid
                            </span>
                          </div>
                        ))}
                        {products.filter(p => (p.currentStock || 0) <= (p.minStock || 0)).length === 0 && (
                          <div className="text-center py-10 text-muted font-bold text-xs italic">Nenhum alerta de produto pendente.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Asset Spread List */}
                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                    <h3 className="font-bold text-base text-primary mb-6 flex items-center gap-2">
                      <BarChart3 size={18} className="text-accent" />
                      Análise de Margens por Produto
                    </h3>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 pb-3">
                            <th className="pb-3 text-[10px] font-black text-muted uppercase tracking-widest">Produto</th>
                            <th className="pb-3 text-right text-[10px] font-black text-muted uppercase tracking-widest">Qtd</th>
                            <th className="pb-3 text-right text-[10px] font-black text-muted uppercase tracking-widest">Custo Un.</th>
                            <th className="pb-3 text-right text-[10px] font-black text-muted uppercase tracking-widest">Venda Un.</th>
                            <th className="pb-3 text-right text-[10px] font-black text-muted uppercase tracking-widest">Markup/Margem</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {products.slice(0, 6).map((p, index) => (
                            <tr key={`raw-prod-${p.id || index}-${index}`} className="hover:bg-slate-50/50">
                              <td className="py-4 font-bold text-primary">{p.name}</td>
                              <td className="py-4 text-right font-bold text-slate-600">{p.currentStock || 0}</td>
                              <td className="py-4 text-right text-muted">R$ {(p.costPrice || 0).toFixed(2)}</td>
                              <td className="py-4 text-right font-black text-slate-700">R$ {(p.salePrice || 0).toFixed(2)}</td>
                              <td className="py-4 text-right text-emerald-600 font-extrabold">
                                {p.costPrice && p.costPrice > 0 ? (((p.salePrice - p.costPrice) / p.costPrice) * 100).toFixed(0) + '%' : '100%'} Mup
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'cash-history' && (
              <motion.div 
                key="cash-history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm"
              >
                <div className="p-8 border-b border-slate-100 bg-slate-50/30">
                  <h3 className="font-bold text-xl text-primary">Histórico de Fechamentos de Caixa</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Data</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Responsável</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Saldo Inicial</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Entradas</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Saídas</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Saldo Final</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Diferença</th>
                        <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                        {(isAdmin || isGerente) && <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {cashHistory.map((cash, index) => (
                        <tr key={`cash-hist-${cash.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-6 text-sm font-bold text-primary">{format(new Date(cash.date), 'dd/MM/yyyy')}</td>
                          <td className="px-8 py-6">
                            <p className="text-sm font-bold text-primary">{cash.openedByName}</p>
                            {cash.closedByName && <p className="text-[10px] text-muted font-bold">Fechado por: {cash.closedByName}</p>}
                          </td>
                          <td className="px-8 py-6 text-sm font-medium text-slate-600 text-right">R$ {cash.openingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-8 py-6 text-sm font-black text-emerald-600 text-right">+ R$ {cash.totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-8 py-6 text-sm font-black text-red-600 text-right">- R$ {(cash.totalExpense + cash.totalSangria).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-8 py-6 text-sm font-black text-primary text-right">R$ {cash.closingBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '---'}</td>
                          <td className="px-8 py-6 text-right">
                            <span className={`text-sm font-black ${cash.difference && cash.difference > 0 ? 'text-emerald-600' : cash.difference && cash.difference < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                              {cash.difference ? (cash.difference > 0 ? '+' : '') + `R$ ${cash.difference.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'}
                            </span>
                          </td>
                          <td className="px-8 py-6 text-center">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                              cash.status === 'open' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              {cash.status === 'open' ? 'Aberto' : 'Fechado'}
                            </span>
                          </td>
                          {(isAdmin || isGerente) && (
                            <td className="px-8 py-6 text-center">
                              {cash.status === 'closed' && (
                                <button
                                  onClick={() => handleReopenCash(cash)}
                                  className="p-2 text-slate-400 hover:text-accent hover:bg-accent/10 rounded-xl transition-all"
                                  title="Reabrir Caixa"
                                >
                                  <RefreshCcw size={16} />
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'commissions' && (
              <motion.div 
                key="commissions"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <ProfessionalCommissions 
                  parentDateRange={dateRange}
                  setParentDateRange={setDateRange}
                />
              </motion.div>
            )}

            {activeTab === 'professional-accounts' && (
              <motion.div 
                key="professional-accounts"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <ProfessionalCommissions 
                  parentDateRange={dateRange}
                  setParentDateRange={setDateRange}
                />
              </motion.div>
            )}

            {activeTab === 'receivables' && (
              <motion.div 
                key="receivables"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm"
              >
                <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div>
                    <h3 className="text-2xl font-black text-primary">Controle de Recebíveis (Cartões)</h3>
                    <p className="text-sm text-muted font-medium mt-1">Valores com prazos de recebimento pendentes de liquidação.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl text-right">
                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Pendente de Liquidação</p>
                      <p className="text-3xl font-black text-blue-900">
                        R$ {transactions
                          .filter(t => t.is_settled === false && (t.paymentMethod === 'credito' || t.paymentMethod === 'debito'))
                          .reduce((acc, t) => acc + (t.net_amount || t.amount), 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                     <thead>
                       <tr className="bg-slate-50/20">
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Origem</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Método</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Previsão</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor Bruto</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Taxa</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Vlr Líquido</th>
                         <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                         <th className="px-8 py-5 text-right w-10"></th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-50">
                       {transactions
                        .filter(t => (t.paymentMethod === 'credito' || t.paymentMethod === 'debito'))
                        .map((t, index) => (
                          <tr key={`receivable-${t.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-primary">{t.description}</p>
                              <p className="text-[10px] text-muted font-bold tracking-widest uppercase">{t.cliente_name}</p>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-2">
                                <CreditCard size={14} className="text-blue-500" />
                                <span className="text-[10px] font-black text-primary uppercase tracking-widest">{t.paymentMethod}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-sm font-bold text-slate-500">
                              {t.settlement_date ? format(new Date(t.settlement_date), 'dd/MM/yyyy') : '---'}
                            </td>
                            <td className="px-8 py-6 text-right text-xs text-muted font-bold">R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-8 py-6 text-center text-[10px] font-black text-red-400">-{t.fee_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '---'}</td>
                            <td className="px-8 py-6 text-right text-sm font-black text-primary">R$ {(t.net_amount || t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-8 py-6 text-center">
                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                t.is_settled ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                              }`}>
                                {t.is_settled ? 'Liquidado' : 'Pendente'}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right">
                              {!t.is_settled && (
                                <button 
                                  onClick={() => handleSettleReceivable(t.id)}
                                  className="p-2 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer" 
                                  title="Conciliar / Marcar como Recebido"
                                >
                                  <CheckCircle2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'accounts-receivable' && (
              <motion.div 
                key="accounts-receivable"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-8"
              >
                <div className="bg-amber-50 border border-amber-100 p-10 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-10 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full -mr-32 -mt-32 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-6 relative z-10">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-amber-600 shadow-lg shadow-amber-500/10 border border-amber-100">
                      <AlertCircle size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-amber-900">Contas a Receber</h3>
                      <p className="text-sm text-amber-700/70 max-w-md font-medium mt-1">Gestão estratégica de débitos pendentes e recuperação de crédito.</p>
                    </div>
                  </div>
                  <div className="text-right relative z-10">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Total em Aberto</p>
                    <p className="text-5xl font-black text-amber-900 tracking-tighter">R$ {stats.pendingFiado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingDebts.map((debt, index) => (
                    <div key={`debt-card-${debt.id || index}-${index}`} className="bg-white border border-slate-200 rounded-[2rem] p-8 hover:border-accent/30 transition-all group shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-accent/5 group-hover:text-accent transition-all border border-slate-100 shadow-inner">
                            <User size={24} />
                          </div>
                          <div>
                            <p className="font-bold text-primary group-hover:text-accent transition-colors">{debt.cliente_name}</p>
                            <p className="text-[10px] text-muted uppercase tracking-widest font-black mt-0.5">{format(parseDate(debt.createdAt), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <button className="p-2 text-slate-300 hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
                          <MoreVertical size={18} />
                        </button>
                      </div>
                      
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8 shadow-inner text-center">
                        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Dívida Pendente</p>
                        <p className="text-3xl font-black text-emerald-600 tracking-tight">R$ {debt.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>

                      <button 
                        onClick={() => setConfirmDebtPayment(debt)}
                        disabled={isPayingDebt}
                        className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/10 active:scale-95 mt-auto"
                      >
                        {isPayingDebt ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                        <span>Registrar Pagamento</span>
                      </button>
                    </div>
                  ))}
                  {pendingDebts.length === 0 && (
                    <div className="col-span-full text-center py-24 text-muted font-bold italic text-sm bg-slate-50/50 border border-dashed border-slate-200 rounded-[2.5rem]">
                      Nenhum fiado pendente encontrado.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            {activeTab === 'inconsistencies' && (
              <motion.div 
                key="inconsistencies"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm"
              >
                <div className="p-8 border-b border-slate-100 bg-slate-50/30">
                  <h3 className="font-bold text-xl text-primary flex items-center gap-2">
                    <AlertTriangle className="text-red-500" size={24} />
                    Alertas de Inconsistência Financeira
                  </h3>
                  <p className="text-sm text-muted mt-1 font-medium">Situações que exigem revisão manual (ex: comanda reaberta com comissão já paga).</p>
                </div>
                <div className="p-8 space-y-4">
                  {inconsistencyLogs.map((log, index) => (
                    <div key={`log-incons-${log.id || index}-${index}`} className="bg-red-50 border border-red-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-red-600 shadow-sm border border-red-100">
                          <AlertCircle size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-red-900">Comissão Já Paga - Reabertura</p>
                          <p className="text-xs text-red-700/70 font-medium">
                            Profissional: <span className="font-bold">{log.profissional_name}</span> • 
                            Comanda: <span className="font-bold">#{log.comanda_number}</span>
                          </p>
                          <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mt-1">
                            {format(parseDate(log.date), "dd/MM/yyyy 'às' HH:mm")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-red-600 font-black uppercase tracking-widest mb-1">Valor a Ajustar</p>
                        <p className="text-2xl font-black text-red-700">R$ {log.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ))}
                  {inconsistencyLogs.length === 0 && (
                    <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                      <CheckCircle2 size={48} className="text-emerald-300 mx-auto mb-4" />
                      <p className="text-muted text-sm font-bold">Nenhuma inconsistência encontrada. Tudo em dia!</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            {activeTab === 'client-accounts' && (
              <motion.div 
                key="client-accounts"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                  <div className="p-8 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-slate-50/30">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <input 
                          type="text" 
                          placeholder="Buscar cliente..."
                          value={clientSearchTerm}
                          onChange={(e) => setClientSearchTerm(e.target.value)}
                          className="bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary w-full sm:w-64 shadow-sm"
                        />
                      </div>
                      <select 
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-2xl py-3 px-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-sm font-bold"
                      >
                        <option value="all">Todos os Clientes</option>
                        <option value="debtors">Somente Devedores</option>
                        <option value="creditors">Somente com Crédito</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50">
                          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Cliente</th>
                          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Saldo Atual</th>
                          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Total Gasto</th>
                          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Total Pago</th>
                          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {clients
                          .filter(c => 
                            c.nome.toLowerCase().includes(clientSearchTerm.toLowerCase()) &&
                            (clientFilter === 'all' || 
                             (clientFilter === 'debtors' && (c.balance || 0) < 0) || 
                             (clientFilter === 'creditors' && (c.balance || 0) > 0))
                          )
                          .map((client, index) => (
                          <tr key={`client-row-${client.uid || index}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-accent/10 group-hover:text-accent transition-all">
                                  <User size={20} />
                                </div>
                                <div>
                                  <p className="font-bold text-primary">{client.nome}</p>
                                  <p className="text-[10px] text-muted font-bold">{client.phone || 'Sem telefone'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <span className={`text-sm font-black ${(client.balance || 0) < 0 ? 'text-red-600' : (client.balance || 0) > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                R$ {(client.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="px-8 py-6 text-right text-sm font-medium text-slate-600">
                              R$ {(client.totalSpent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-8 py-6 text-right text-sm font-medium text-slate-600">
                              R$ {(client.totalPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => setSelectedClientAccount(client.uid)}
                                  className="p-2 text-muted hover:text-accent transition-all bg-white rounded-lg border border-slate-100 shadow-sm"
                                  title="Ver Detalhes Financeiros"
                                >
                                  <Wallet size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'subscriptions' && (
              <motion.div 
                key="subscriptions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Header Superior Didático */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-purple-50 p-6 rounded-3xl border border-purple-100">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={18} className="text-purple-600 animate-pulse" />
                      <h3 className="text-xl font-bold text-primary">Gestão de Assinantes</h3>
                    </div>
                    <p className="text-sm text-slate-500 max-w-3xl leading-relaxed font-semibold">
                      Gerencie as assinaturas recorrentes dos clientes vip da barbearia. Acompanhe o faturamento recorrente estimado (MRR),
                      registre de forma simplificada o consumo de serviços, altere status de assinaturas e visualize todo o histórico financeiro gerado pelas mensalidades.
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsNewSubscriptionModalOpen(true)}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-2xl shadow-md shadow-purple-200 transition-all text-sm active:scale-95"
                  >
                    <Plus size={16} />
                    Nova Assinatura
                  </button>
                </div>

                {/* Subsections: Metrics Bento Grid */}
                {(() => {
                  const activeSubs = subscriptions.filter(s => s.status === 'active');
                  const computedMRR = activeSubs.reduce((acc, sub) => {
                    const plan = subscriptionPlans.find(p => p.id === sub.plano_id);
                    return acc + (plan?.price || 0);
                  }, 0);
                  const periodSubRevenue = transactions
                    .filter(t => t.category === 'Assinaturas' && t.type === 'income' && t.status === 'pago')
                    .reduce((acc, t) => acc + (t.amount || 0), 0);
                  const avgSubTicket = activeSubs.length > 0 ? (computedMRR / activeSubs.length) : 0;

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                        <div className="p-4 bg-purple-50 text-purple-600 rounded-xl">
                          <DollarSign size={24} />
                        </div>
                        <div>
                          <p className="text-xs text-muted font-bold">MRR Estimado</p>
                          <p className="text-xl font-black text-primary">
                            R$ {computedMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Soma recorrente mensal ativa</p>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                        <div className="p-4 bg-purple-50 text-purple-600 rounded-xl">
                          <UserCheck size={24} />
                        </div>
                        <div>
                          <p className="text-xs text-muted font-bold">Membros Ativos</p>
                          <p className="text-xl font-black text-primary">
                            {activeSubs.length} <span className="text-xs text-muted font-normal">de {subscriptions.length}</span>
                          </p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Assinaturas no status: Ativa</p>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                        <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl">
                          <TrendingUp size={24} />
                        </div>
                        <div>
                          <p className="text-xs text-muted font-bold">Arrecadado no Período</p>
                          <p className="text-xl font-black text-emerald-600">
                            R$ {periodSubRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Mensalidades recebidas nas datas selecionadas</p>
                        </div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center gap-4">
                        <div className="p-4 bg-slate-50 text-slate-600 rounded-xl">
                          <Award size={24} />
                        </div>
                        <div>
                          <p className="text-xs text-muted font-bold">Ticket Médio Recorrente</p>
                          <p className="text-xl font-black text-primary">
                            R$ {avgSubTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Média estimada por membro ativo</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Main Double-Panel Section */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Left Column: Management of Subscribers (8cols) */}
                  <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/20">
                      <div className="flex items-center gap-2">
                        <UserCheck className="text-purple-600" size={18} />
                        <h4 className="font-bold text-primary">Carteira de Assinantes</h4>
                      </div>

                      {/* Filters */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
                          <input 
                            type="text" 
                            placeholder="Buscar associado..."
                            value={subSearchTerm}
                            onChange={(e) => setSubSearchTerm(e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500 transition-all text-primary w-full sm:w-48 shadow-inner font-semibold"
                          />
                        </div>
                        <select
                          value={subFilter}
                          onChange={(e: any) => setSubFilter(e.target.value)}
                          className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 text-slate-700 font-semibold"
                        >
                          <option value="all">Todos Status</option>
                          <option value="active">Ativos</option>
                          <option value="paused">Pausados</option>
                          <option value="canceled">Cancelados</option>
                          <option value="expired">Expirados</option>
                        </select>
                      </div>
                    </div>

                    {/* Subscriber List Cards */}
                    <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                      {loadingSubscriptions ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <Loader2 className="animate-spin text-purple-600" size={32} />
                          <p className="text-xs text-muted font-bold">Buscando assinantes base de dados...</p>
                        </div>
                      ) : (() => {
                        const filteredSubs = subscriptions.filter(sub => {
                          const matchesSearch = sub.cliente_name.toLowerCase().includes(subSearchTerm.toLowerCase()) || 
                            (sub.planName && sub.planName.toLowerCase().includes(subSearchTerm.toLowerCase()));
                          const matchesFilter = subFilter === 'all' || sub.status === subFilter;
                          return matchesSearch && matchesFilter;
                        });

                        if (filteredSubs.length === 0) {
                          return (
                            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                              <UserMinus size={36} className="text-slate-300 mx-auto mb-3" />
                              <p className="text-xs text-muted font-bold">Nenhum associado encontrado nesta seleção.</p>
                            </div>
                          );
                        }

                        return filteredSubs.map((sub, idx) => {
                          const plan = subscriptionPlans.find(p => p.id === sub.plano_id);
                          const totalHaircuts = Number(plan?.haircutsPerMonth || 0);
                          const totalBeards = Number(plan?.beardsPerMonth || 0);
                          const hairProgress = totalHaircuts > 0 ? (Number(sub.haircutsUsed || 0) / totalHaircuts) * 100 : 0;
                          const beardProgress = totalBeards > 0 ? (Number(sub.beardsUsed || 0) / totalBeards) * 100 : 0;

                          return (
                            <div 
                              key={`sub-member-${sub.id || idx}-${idx}`} 
                              className="p-5 border border-slate-100 rounded-2xl bg-white hover:border-purple-200 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                              <div className="space-y-3 flex-1">
                                <div className="flex items-center flex-wrap gap-2">
                                  <span className="font-bold text-primary text-sm md:text-base leading-tight">
                                    {sub.cliente_name}
                                  </span>
                                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
                                    {sub.planName || "Plano Ativo"}
                                  </span>
                                  {sub.autoRenew && (
                                    <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded" title="Renovação automática ativa">
                                      Auto-Renova
                                    </span>
                                  )}
                                  
                                  {/* Badges de Status */}
                                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ml-auto md:ml-0 ${
                                    sub.status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                    sub.status === 'paused' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                    sub.status === 'canceled' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                    'bg-slate-100 text-slate-500'
                                  }`}>
                                    {sub.status === 'active' ? 'Ativa' :
                                     sub.status === 'paused' ? 'Pausada' :
                                     sub.status === 'canceled' ? 'Cancelada' : 'Expirada'}
                                  </span>
                                </div>

                                {/* Progress bars: Limits of consumption */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                  {totalHaircuts > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                                        <span>Cortes no Mês</span>
                                        <span className="font-bold text-slate-700">{sub.haircutsUsed} de {totalHaircuts}</span>
                                      </div>
                                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-purple-600 rounded-full transition-all duration-300" 
                                          style={{ width: `${Math.min(hairProgress, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {totalBeards > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                                        <span>Barbas no Mês</span>
                                        <span className="font-bold text-slate-700">{sub.beardsUsed} de {totalBeards}</span>
                                      </div>
                                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div 
                                          className="h-full bg-indigo-600 rounded-full transition-all duration-300" 
                                          style={{ width: `${Math.min(beardProgress, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-4 text-xs text-slate-400 font-semibold">
                                  <span>Vencimento: <span className="font-bold text-slate-600">{sub.endDate ? format(new Date(sub.endDate + 'T00:00:00'), 'dd/MM/yyyy') : 'N/A'}</span></span>
                                  <span>Início: <span className="font-bold text-slate-500">{sub.startDate ? format(new Date(sub.startDate + 'T00:00:00'), 'dd/MM/yyyy') : 'N/A'}</span></span>
                                </div>
                              </div>

                              {/* Interactive Actions bar */}
                              <div className="flex md:flex-col items-stretch justify-center gap-2 pl-0 md:pl-4 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0">
                                {sub.status === 'active' && (
                                  <button
                                    onClick={() => setSelectedSubForUsage(sub)}
                                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 shadow-inner"
                                  >
                                    <Activity size={14} />
                                    Lançar Uso
                                  </button>
                                )}

                                <div className="flex gap-1 justify-end">
                                  {sub.status === 'active' ? (
                                    <button
                                      onClick={() => handleUpdateStatus(sub.id, 'paused')}
                                      className="p-2 hover:bg-amber-50 text-amber-600 hover:text-amber-700 rounded-xl transition-all border border-slate-100 active:scale-95 flex-1 flex justify-center items-center font-bold"
                                      title="Pausar Temporariamente"
                                    >
                                      <Pause size={14} />
                                    </button>
                                  ) : (sub.status === 'paused' || sub.status === 'canceled') ? (
                                    <button
                                      onClick={() => handleUpdateStatus(sub.id, 'active')}
                                      className="p-2 hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 rounded-xl transition-all border border-slate-100 active:scale-95 flex-1 flex justify-center items-center font-bold"
                                      title="Reativar Assinatura"
                                    >
                                      <Play size={14} />
                                    </button>
                                  ) : null}

                                  {sub.status !== 'canceled' && (
                                    <button
                                      onClick={() => {
                                        if (confirm("Tem certeza que deseja cancelar em definitivo esta assinatura? O cliente perderá acesso aos limites vip de consumo imediatamente.")) {
                                          handleUpdateStatus(sub.id, 'canceled');
                                        }
                                      }}
                                      className="p-2 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-xl transition-all border border-slate-100 active:scale-95 flex-1 flex justify-center items-center font-bold"
                                      title="Cancelar Assinatura"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* Right Column: Collection History (4cols) */}
                  <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col">
                    <div className="p-6 border-b border-slate-100 bg-slate-50/20">
                      <div className="flex items-center gap-2">
                        <History className="text-purple-600" size={18} />
                        <h4 className="font-bold text-primary">Mensalidades Recebidas</h4>
                      </div>
                      <p className="text-[10px] text-muted leading-tight mt-1 font-semibold">Lançados de faturamento da categoria 'Assinaturas' no período</p>
                    </div>

                    <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                      {(() => {
                        const filteredTxs = transactions.filter(t => t.category === 'Assinaturas');
                        if (filteredTxs.length === 0) {
                          return (
                            <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                              <Receipt size={32} className="text-slate-300 mx-auto mb-2" />
                              <p className="text-xs text-muted font-bold">Nenhum faturamento de assinatura no período ativo.</p>
                            </div>
                          );
                        }

                        return filteredTxs.map((tx, idx) => (
                          <div 
                            key={`sub-tx-${tx.id || idx}-${idx}`} 
                            className="p-4 border border-slate-5 border-slate-100 rounded-xl bg-slate-50/20 flex flex-col gap-2 hover:border-slate-200 transition-all"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5">
                                <p className="font-bold text-primary text-xs leading-snug line-clamp-2">
                                  {tx.description}
                                </p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">
                                  {tx.paymentMethod === 'credito' ? '💳 Crédito' :
                                   tx.paymentMethod === 'debito' ? '💳 Débito' :
                                   tx.paymentMethod === 'pix' ? '📱 Pix' :
                                   tx.paymentMethod === 'dinheiro' ? '💵 Dinheiro' : 'Outros'} • {format(new Date(tx.date + 'T00:00:00'), 'dd/MM/yyyy')}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-black text-xs text-emerald-600">
                                  + R$ {(tx.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                                <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  PAGO
                                </span>
                              </div>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>

                {/* MODAL: Nova Assinatura Manual (Vincular) */}
                <AnimatePresence>
                  {isNewSubscriptionModalOpen && (
                    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
                      {/* Backdrop */}
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsNewSubscriptionModalOpen(false)}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                      />

                      {/* Modal Content */}
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-md w-full relative z-10"
                      >
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-purple-50">
                          <div className="flex items-center gap-2">
                            <Sparkles className="text-purple-600" size={18} />
                            <h4 className="font-black text-primary text-base">Nova Assinatura Recorrente</h4>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setIsNewSubscriptionModalOpen(false)}
                            className="p-1 rounded-lg hover:bg-purple-100 text-slate-500 transition-all"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        <form onSubmit={(e) => {
                          e.preventDefault();
                          if (!newSubClientId || !newSubPlanId) {
                            toast.error("Por favor, selecione um cliente e um plano!");
                            return;
                          }
                          const clientObj = clients.find(c => c.uid === newSubClientId || c.id === newSubClientId);
                          const clientName = clientObj ? (clientObj.name || clientObj.displayName || "Cliente") : "Cliente";
                          
                          setLoadingSubscriptions(true);
                          subscriptionService.createSubscription({
                            cliente_id: newSubClientId,
                            cliente_name: clientName,
                            plano_id: newSubPlanId,
                            autoRenew: newSubAutoRenew
                          }).then(() => {
                            toast.success("Assinatura criada com sucesso e faturamento registrado!");
                            setIsNewSubscriptionModalOpen(false);
                            setNewSubClientId('');
                            setNewSubPlanId('');
                            return Promise.all([
                              subscriptionService.getSubscriptions(),
                              subscriptionService.getPlans()
                            ]);
                          }).then(([subs, plans]) => {
                            setSubscriptions(subs);
                            setSubscriptionPlans(plans);
                          }).catch((err: any) => {
                            console.error(err);
                            toast.error(err.message || "Erro ao conectar e criar assinatura.");
                          }).finally(() => {
                            setLoadingSubscriptions(false);
                          });
                        }} className="p-6 space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Selecione o Cliente</label>
                            <select
                              value={newSubClientId}
                              onChange={(e) => setNewSubClientId(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500 text-slate-800 font-semibold"
                              required
                            >
                              <option value="">-- Escolha um Cliente --</option>
                              {clients.map((c, idx) => (
                                <option key={`sub-client-${c.uid || c.id || idx}-${idx}`} value={c.uid || c.id}>
                                  {c.name || c.displayName || "Sem Nome"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Plano de Assinatura</label>
                            <select
                              value={newSubPlanId}
                              onChange={(e) => setNewSubPlanId(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-500 text-slate-800 font-semibold"
                              required
                            >
                              <option value="">-- Escolha o Plano --</option>
                              {subscriptionPlans.map((p, idx) => (
                                <option key={`sub-plan-${p.id || idx}-${idx}`} value={p.id}>
                                  {p.name} - R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                                </option>
                              ))}
                            </select>
                            {(() => {
                              const selectedPlanObj = subscriptionPlans.find(plan => plan.id === newSubPlanId);
                              if (selectedPlanObj) {
                                return (
                                  <p className="text-[10px] text-purple-600 font-semibold bg-purple-50 p-2.5 rounded-lg mt-1 leading-relaxed">
                                    Benefícios: {selectedPlanObj.haircutsPerMonth} cortes de cabelo e {selectedPlanObj.beardsPerMonth} barbas por mês inclusos.
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <input
                              type="checkbox"
                              id="autoRenew"
                              checked={newSubAutoRenew}
                              onChange={(e) => setNewSubAutoRenew(e.target.checked)}
                              className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <label htmlFor="autoRenew" className="text-xs text-slate-600 font-bold cursor-pointer">
                              Renovar plano automaticamente no vencimento
                            </label>
                          </div>

                          <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-100 flex items-start gap-2.5 mt-2">
                            <AlertCircle className="text-amber-500 mt-0.5 shrink-0" size={14} />
                            <p className="text-[10px] text-amber-700 leading-relaxed font-bold">
                              Atenção: Ao confirmar a criação da assinatura, o sistema lançará automaticamente um débito correspondente à primeira mensalidade como Entrada (Categoria: Assinaturas) no Caixa de hoje, e atualizará a data de vencimento do cliente para daqui 1 mês.
                            </p>
                          </div>

                          <div className="flex gap-3 pt-4">
                            <button
                              type="button"
                              onClick={() => setIsNewSubscriptionModalOpen(false)}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl text-xs transition-all"
                            >
                              Fechar
                            </button>
                            <button
                              type="submit"
                              disabled={loadingSubscriptions}
                              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1 shadow-md shadow-purple-100"
                            >
                              {loadingSubscriptions ? (
                                <Loader2 className="animate-spin" size={14} />
                              ) : (
                                <Sparkles size={14} />
                              )}
                              Ativar Membro
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                {/* MODAL: Lançar Consumo de Serviço */}
                <AnimatePresence>
                  {selectedSubForUsage && (
                    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
                      {/* Backdrop */}
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedSubForUsage(null)}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
                      />

                      {/* Modal Content */}
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden max-w-sm w-full relative z-10"
                      >
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-purple-50">
                          <div className="flex items-center gap-2">
                            <Activity className="text-purple-600 animate-pulse" size={18} />
                            <h4 className="font-black text-primary text-base">Registrar Consumo de Membro</h4>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setSelectedSubForUsage(null)}
                            className="p-1 rounded-lg hover:bg-purple-100 text-slate-500 transition-all"
                          >
                            <X size={18} />
                          </button>
                        </div>

                        <div className="p-6 space-y-4">
                          <div className="text-center space-y-1">
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Assinante</p>
                            <p className="text-base font-black text-primary">{selectedSubForUsage.cliente_name}</p>
                            <p className="text-xs text-purple-600 font-bold">Plano: {selectedSubForUsage.planName}</p>
                          </div>

                          <div className="border border-slate-100 bg-slate-50/40 p-4 rounded-2xl text-center flex flex-col gap-3">
                            <p className="text-xs font-bold text-slate-500">QUAL SERVIÇO FOI REALIZADO HOJE?</p>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <button
                                onClick={() => handleRegisterUsage(selectedSubForUsage.id, 'haircut')}
                                className="p-4 bg-white hover:bg-purple-50 hover:border-purple-300 border border-slate-200 rounded-xl text-primary font-bold transition-all text-xs flex flex-col items-center justify-center gap-2 active:scale-95 shadow-sm"
                              >
                                <span className="text-2xl">✂️</span>
                                <div>
                                  <p>Corte de Cabelo</p>
                                  <p className="text-[10px] text-purple-600 font-bold">Cobrar da Assinatura ({
                                    (() => {
                                      const plan = subscriptionPlans.find(p => p.id === selectedSubForUsage.plano_id);
                                      return plan ? (plan.haircutsPerMonth - selectedSubForUsage.haircutsUsed) : 0;
                                    })()
                                  } restam)</p>
                                </div>
                              </button>

                              <button
                                onClick={() => handleRegisterUsage(selectedSubForUsage.id, 'beard')}
                                className="p-4 bg-white hover:bg-purple-50 hover:border-purple-300 border border-slate-200 rounded-xl text-primary font-bold transition-all text-xs flex flex-col items-center justify-center gap-2 active:scale-95 shadow-sm"
                              >
                                <span className="text-2xl">🪒</span>
                                <div>
                                  <p>Barba / Toalha</p>
                                  <p className="text-[10px] text-purple-600 font-bold">Cobrar da Assinatura ({
                                    (() => {
                                      const plan = subscriptionPlans.find(p => p.id === selectedSubForUsage.plano_id);
                                      return plan ? (plan.beardsPerMonth - selectedSubForUsage.beardsUsed) : 0;
                                    })()
                                  } restam)</p>
                                </div>
                              </button>
                            </div>
                          </div>

                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSubForUsage(null)}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl text-xs transition-all"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {activeTab === 'payment-methods' && (
              <motion.div 
                key="payment-methods"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6"
              >
                {/* Header com Descrição Didática */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="space-y-1">
                    <h3 className="text-xl font-bold text-primary">Métodos de Pagamento</h3>
                    <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
                      Gerencie as taxas e o comportamento financeiro de cada forma de recebimento. As opções ativas impactam diretamente no cálculo de comissões, faturamento líquido e entradas de balanço no caixa diário.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingPaymentMethod(null);
                      setIsPaymentMethodModalOpen(true);
                    }}
                    className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-sm active:scale-95 shrink-0"
                  >
                    <Plus size={18} />
                    <span>Novo Método</span>
                  </button>
                </div>

                {/* Painel de KPIs Analítico */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Métodos Ativos</span>
                      <span className="text-2xl font-black text-primary mt-1 block">
                        {paymentMethods.filter(m => m.status === 'active').length} de {paymentMethods.length}
                      </span>
                    </div>
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm shrink-0">
                      <CheckCircle2 size={20} />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Taxa Média</span>
                      <span className="text-2xl font-black text-primary mt-1 block">
                        {(paymentMethods.filter(m => m.status === 'active').reduce((acc, curr) => acc + (curr.taxa_percentual || 0), 0) / (paymentMethods.filter(m => m.status === 'active').length || 1)).toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 border border-rose-100 shadow-sm shrink-0">
                      <Percent size={20} />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Recebidos na Hora</span>
                      <span className="text-2xl font-black text-primary mt-1 block">
                        {paymentMethods.filter(m => m.status === 'active' && m.recebe_na_hora).length} canais
                      </span>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100 shadow-sm shrink-0">
                      <Clock size={20} />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Custo p/ R$ 1.000 Venda</span>
                      <span className="text-2xl font-black text-primary mt-1 block text-slate-700">
                        R$ {(paymentMethods.filter(m => m.status === 'active').reduce((acc, curr) => acc + (1000 * ((curr.taxa_percentual || 0) / 100)), 0) / (paymentMethods.filter(m => m.status === 'active').length || 1)).toFixed(2)}
                      </span>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 border border-blue-100 shadow-sm shrink-0">
                      <CreditCard size={20} />
                    </div>
                  </div>
                </div>

                {/* Filtros de Tipo */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3 mt-8">
                  <div className="flex flex-wrap gap-1.5">
                    <button 
                      onClick={() => setPaymentMethodFilter('all')} 
                      className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                        paymentMethodFilter === 'all' 
                          ? 'bg-primary text-white shadow-md shadow-primary/10' 
                          : 'bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      Todos
                    </button>
                    <button 
                      onClick={() => setPaymentMethodFilter('immediate')} 
                      className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                        paymentMethodFilter === 'immediate' 
                          ? 'bg-primary text-white shadow-md shadow-primary/10' 
                          : 'bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      ⚡ Liquidez Imediata (D+0)
                    </button>
                    <button 
                      onClick={() => setPaymentMethodFilter('cards')} 
                      className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                        paymentMethodFilter === 'cards' 
                          ? 'bg-primary text-white shadow-md shadow-primary/10' 
                          : 'bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      💳 Cartões & Taxas
                    </button>
                    <button 
                      onClick={() => setPaymentMethodFilter('internal')} 
                      className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                        paymentMethodFilter === 'internal' 
                          ? 'bg-primary text-white shadow-md shadow-primary/10' 
                          : 'bg-slate-50 border border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      ⚙️ Controle Interno
                    </button>
                  </div>

                  <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                    Mostrando <strong className="text-primary">{filteredPaymentMethods.length}</strong> canais
                  </span>
                </div>

                {/* Grid de Cards dos Métodos de Pagamento */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pt-2">
                  {filteredPaymentMethods.map((method, index) => (
                    <PaymentMethodCard 
                      key={`pay-method-${method.id || index}-${index}`} 
                      method={method} 
                      onEdit={() => {
                        setEditingPaymentMethod(method);
                        setIsPaymentMethodModalOpen(true);
                      }}
                      onToggleStatus={async () => {
                        await paymentMethodService.updatePaymentMethod(method.id, { 
                          status: method.status === 'active' ? 'inactive' : 'active' 
                        });
                        loadData();
                      }}
                    />
                  ))}
                  {filteredPaymentMethods.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-50 border border-dashed border-slate-200 rounded-[2rem]">
                      <CreditCard className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-500 font-bold">Nenhum método {paymentMethodFilter !== 'all' ? 'nesta categoria' : 'cadastrado'}.</p>
                      {paymentMethodFilter === 'all' && (
                        <button 
                          onClick={() => paymentMethodService.seedDefaultMethods().then(loadData)}
                          className="mt-4 text-xs font-black text-accent hover:underline uppercase tracking-wider"
                        >
                          Carregar padrões do sistema
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isTransactionModalOpen && (
          <TransactionModal 
            type={transactionType}
            currentCash={currentCash}
            onClose={() => setIsTransactionModalOpen(false)}
            onSuccess={loadData}
          />
        )}
        {isCashModalOpen && (
          <CashModal 
            currentCash={currentCash}
            onOpen={executeOpenCash}
            onCloseCash={executeCloseCash}
            onClose={() => setIsCashModalOpen(false)}
            loading={isOpeningCash || isClosingCash}
          />
        )}
        <InputModal
          isOpen={!!confirmDebtPayment}
          onClose={() => setConfirmDebtPayment(null)}
          onConfirm={(amount) => executeDebtPayment(amount)}
          title="Receber Pagamento"
          description={`Quanto ${confirmDebtPayment?.cliente_name} está pagando? Saldo total: R$ ${confirmDebtPayment?.remainingAmount.toFixed(2)}`}
          defaultValue={confirmDebtPayment?.remainingAmount.toString()}
          type="number"
          confirmLabel="Receber"
        />
        {selectedClientAccount && (
          <ClientAccountDetailsModal 
            cliente_id={selectedClientAccount}
            onClose={() => setSelectedClientAccount(null)}
            onPaymentSuccess={loadData}
            paymentMethods={memoizedPaymentMethods}
          />
        )}
        {selectedProAccount && (
          <ProfessionalAccountDetailsModal 
            profissional_id={selectedProAccount}
            onClose={() => setSelectedProAccount(null)}
            onSuccess={loadData}
            paymentMethods={memoizedPaymentMethods}
            defaultStartDate={dateRange.start}
            defaultEndDate={dateRange.end}
          />
        )}
        {isPaymentMethodModalOpen && (
          <PaymentMethodModal 
            method={editingPaymentMethod}
            onClose={() => setIsPaymentMethodModalOpen(false)}
            onSuccess={loadData}
          />
        )}

        {/* Global Sangria/Reforço Modals */}
        <InputModal
          isOpen={isSangriaModalOpen}
          onClose={() => setIsSangriaModalOpen(false)}
          onConfirm={handleSangria}
          title="Nova Sangria"
          description="Retirada de valores do caixa para despesas ou segurança."
          type="number"
          confirmLabel="Registrar Sangria"
          onChange={(val) => setSangriaData(prev => ({ ...prev, amount: val }))}
        />

        <InputModal
          isOpen={isReforcoModalOpen}
          onClose={() => setIsReforcoModalOpen(false)}
          onConfirm={handleReforco}
          title="Reforço de Caixa"
          description="Entrada de valores extras no caixa (troco, etc)."
          type="number"
          confirmLabel="Registrar Reforço"
          onChange={(val) => setReforcoData(prev => ({ ...prev, amount: val }))}
        />

        {/* Reopen Cash Modal */}
        {cashToReopen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-primary/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-slate-100"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-100">
                  <RefreshCcw size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-primary">Reabrir Caixa</h3>
                  <p className="text-sm text-muted font-medium">Data: {format(new Date(cashToReopen.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-2 px-1">Justificativa da Reabertura</label>
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Descreva o motivo da reabertura..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent min-h-[120px] transition-all font-medium"
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button
                    onClick={() => setCashToReopen(null)}
                    className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-primary rounded-2xl font-bold text-sm transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmReopenCash}
                    disabled={!reopenReason}
                    className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirmar Reabertura
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ProfessionalFinancialCardProps {
  professional: any;
  commissions: any[];
  payouts: any[];
  advances?: any[];
  onOpenDetails: () => void;
  startDate: string;
  endDate: string;
  key?: string | number;
}

function ProfessionalFinancialCard({ 
  professional, 
  commissions, 
  payouts, 
  advances = [], 
  onOpenDetails, 
  startDate, 
  endDate 
}: ProfessionalFinancialCardProps) {
  // Filter by selected period
  const valesInPeriod = advances.filter((a: any) => a.date >= startDate && a.date <= endDate);
  const payoutsInPeriod = payouts.filter((p: any) => p.date >= startDate && p.date <= endDate);

  const totalComm = commissions.reduce((acc: number, c: any) => acc + c.commission_value, 0);
  const totalPaid = payoutsInPeriod.reduce((acc: number, p: any) => acc + p.amount, 0);
  const totalVales = valesInPeriod.reduce((acc: number, a: any) => acc + a.amount, 0);
  const balance = totalComm - totalPaid - totalVales;

  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 hover:border-accent/30 transition-all shadow-sm group">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-accent/5 group-hover:text-accent transition-all border border-slate-100 shadow-inner">
          <Briefcase size={28} />
        </div>
        <div>
          <h4 className="font-bold text-primary group-hover:text-accent transition-colors">{professional.nome}</h4>
          <p className="text-[10px] text-muted font-black uppercase tracking-widest">{professional.cargo || 'Profissional'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50 text-center">
          <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Comissões</p>
          <p className="text-lg font-black text-primary">R$ {totalComm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-amber-50/30 rounded-2xl p-4 border border-amber-100/30 text-center">
          <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-1 font-bold">Vales</p>
          <p className="text-lg font-black text-amber-700">R$ {totalVales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50 text-center mb-6">
        <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Repasses Pagos</p>
        <p className="text-lg font-black text-emerald-600">R$ {totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
      </div>

      {valesInPeriod.length > 0 && (
        <div className="mb-6 p-4 bg-amber-50/40 border border-amber-100/50 rounded-2xl">
          <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest mb-2 flex items-center gap-1">
            <AlertCircle size={10} className="text-amber-600" /> Detalhamento de Vales no Período
          </p>
          <div className="space-y-1.5 max-h-[100px] overflow-y-auto custom-scrollbar pr-1">
            {valesInPeriod.map((val: any, idx: number) => {
              let formattedDate = 'Vale';
              try {
                if (val.date) {
                  const parts = val.date.split('-');
                  formattedDate = `${parts[2]}/${parts[1]}`;
                }
              } catch (e) {}
              return (
                <div key={`card-vale-${val.id || idx}`} className="flex justify-between items-center text-[11px] font-medium text-slate-700">
                  <span className="truncate max-w-[150px]">{val.description || 'Vale / Adiantamento'} ({formattedDate})</span>
                  <span className="font-extrabold text-amber-700">R$ {val.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`p-6 rounded-3xl border mb-8 text-center ${balance > 0 ? 'bg-primary text-white border-primary shadow-lg shadow-primary/10' : 'bg-emerald-50 border-emerald-100'}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${balance > 0 ? 'text-white/60' : 'text-emerald-600'}`}>
          Saldo no Período {balance > 0 ? 'a Pagar' : 'Quitado'}
        </p>
        <p className={`text-3xl font-black ${balance > 0 ? 'text-white' : 'text-emerald-950'}`}>
          R$ {Math.abs(balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
      </div>

      <button 
        onClick={onOpenDetails}
        className="w-full py-4 bg-slate-100 text-primary rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
      >
        <FileText size={18} />
        Ver Detalhes e Razão
      </button>
    </div>
  );
}

function ClientAccountDetailsModal({ 
  cliente_id, 
  onClose, 
  onPaymentSuccess,
  paymentMethods
}: { 
  cliente_id: string, 
  onClose: () => void, 
  onPaymentSuccess: () => void,
  paymentMethods: PaymentMethodConfig[]
}) {
  const [client, setClient] = useState<any>(null);
  const [debts, setDebts] = useState<ClientDebt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteVal, setNewNoteVal] = useState('');
  const [newNoteType, setNewNoteType] = useState<'neutral' | 'credit' | 'debit'>('neutral');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'debts' | 'payments' | 'notes'>('debts');
  const [isPaying, setIsPaying] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedDebt, setSelectedDebt] = useState<ClientDebt | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('');

  const { user } = useAuth();

  useEffect(() => {
    loadInfo();
  }, [cliente_id]);

  useEffect(() => {
    // Realtime digital notes/ledger listener
    const q = query(
      collection(db, 'client_ledger_notes'),
      where('cliente_id', '==', cliente_id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setNotes(data);
    });
    return () => unsubscribe();
  }, [cliente_id]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [u, d, p] = await Promise.all([
        userService.getUserProfile(cliente_id),
        debtService.getClientDebts(cliente_id),
        debtService.getDebtPaymentsByClient(cliente_id)
      ]);
      setClient(u);
      setDebts(d);
      setPayments(p);
    } catch (error) {
      toast.error("Erro ao carregar dados do cliente");
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = debts.reduce((acc, d) => d.status !== 'pago' ? acc + d.remainingAmount : acc, 0);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    try {
      const numVal = parseFloat(newNoteVal) || 0;
      await addDoc(collection(db, 'client_ledger_notes'), {
        cliente_id,
        text: newNoteText,
        type: newNoteType,
        value: numVal,
        createdAt: serverTimestamp(),
        authorName: user?.displayName || 'Admin'
      });

      // Optionally update client's visual balance locally or via dynamic adjustments
      if (numVal > 0) {
        if (newNoteType === 'debit') {
          await userService.updateUserProfile(cliente_id, {
            balance: (client?.balance || 0) - numVal
          });
        } else if (newNoteType === 'credit') {
          await userService.updateUserProfile(cliente_id, {
            balance: (client?.balance || 0) + numVal
          });
        }
      }

      setNewNoteText('');
      setNewNoteVal('');
      setNewNoteType('neutral');
      toast.success("Anotação adicionada ao Caderno Digital!");
      loadInfo();
    } catch (error) {
      toast.error("Erro ao salvar anotação");
    }
  };

  const handlePayment = async () => {
    if (!selectedDebt || !paymentAmount || !selectedMethod) return;
    
    setIsPaying(true);
    try {
      const amount = parseFloat(paymentAmount);
      const method = paymentMethods.find(m => m.id === selectedMethod);
      
      if (!method) throw new Error("Método inválido");

      await comandaService.payDebt(
        selectedDebt.id,
        amount,
        method.type as any,
        method.id,
        user?.uid || '',
        user?.displayName || 'Sistema'
      );

      toast.success("Pagamento registrado com sucesso!");
      loadInfo();
      onPaymentSuccess();
      setSelectedDebt(null);
      setPaymentAmount('');
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar pagamento");
    } finally {
      setIsPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-sm font-bold text-muted animate-pulse">Carregando conta do cliente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center shadow-sm border border-accent/20">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary">{client?.nome}</h3>
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Conta Financeira do Cliente & Diário</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm cursor-pointer">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Saldo do Cliente</p>
              <p className={`text-xl font-black ${(client?.balance || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                R$ {(client?.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Em Aberto (Fiado)</p>
              <p className="text-xl font-black text-amber-700">
                R$ {totalOutstanding.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Total Gasto</p>
              <p className="text-xl font-black text-primary">
                R$ {(client?.totalSpent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Total Pago</p>
              <p className="text-xl font-black text-primary">
                R$ {(client?.totalPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Modal Tabs */}
            <div className="flex gap-6 border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('debts')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'debts' ? 'text-primary' : 'text-muted'
                }`}
              >
                Comandas e Dívidas
                {activeTab === 'debts' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('payments')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'payments' ? 'text-primary' : 'text-muted'
                }`}
              >
                Histórico de Pagamentos
                {activeTab === 'payments' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('notes')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'notes' ? 'text-primary' : 'text-muted'
                }`}
              >
                Caderno de Anotações (Fluxo)
                {activeTab === 'notes' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
            </div>

            {activeTab === 'debts' && (
              <div className="grid grid-cols-1 gap-4">
                {debts.map((debt, index) => (
                  <div key={`client-debt-${debt.id || index}-${index}`} className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:shadow-md transition-all shadow-sm">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          debt.status === 'pago' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}>
                          {debt.status === 'pago' ? 'Liquidado' : debt.status === 'parcial' ? 'Parcial' : 'Pendente'}
                        </span>
                        <span className="text-[10px] text-muted font-bold">{format(new Date(debt.date), "dd 'de' MMMM, yyyy", { locale: ptBR })}</span>
                      </div>
                      <p className="text-sm font-bold text-primary">Comanda #{debt.comanda_id?.substring(0, 8) || 'N/A'}</p>
                      <p className="text-xs text-muted">Original: R$ {debt.amount.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Saldo Devedor</p>
                        <p className={`text-lg font-black ${debt.status === 'pago' ? 'text-emerald-600' : 'text-red-600'}`}>
                          R$ {debt.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {debt.status !== 'pago' && (
                        <button 
                          onClick={() => {
                            setSelectedDebt(debt);
                            setPaymentAmount(debt.remainingAmount.toString());
                          }}
                          className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/10 active:scale-95 cursor-pointer"
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {debts.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-muted font-bold italic text-sm">
                    Nenhum fiado registrado para este cliente.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="grid grid-cols-1 gap-4">
                {payments.map((payment, index) => (
                  <div key={`client-pay-${payment.id || index}-${index}`} className="bg-white border border-slate-100 rounded-2xl p-6 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100">
                        <DollarSign size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">Pagamento de Dívida</p>
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
                          {payment.paymentMethod} • {format(new Date(payment.date), "dd/MM/yyyy")}
                        </p>
                      </div>
                    </div>
                    <p className="text-lg font-black text-emerald-600">
                      + R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-muted font-bold italic text-sm">
                    Nenhum pagamento registrado ainda.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-6">
                <form onSubmit={handleAddNote} className="bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-4">
                  <h4 className="font-bold text-sm text-primary">Escrever nova nota ou ajuste de saldo:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input 
                      type="text"
                      placeholder="Descrição da anotação/evento..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="md:col-span-2 bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary font-bold"
                    />
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="Valor opcional (R$)"
                      value={newNoteVal}
                      onChange={(e) => setNewNoteVal(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary font-bold"
                    />
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-widest mr-2">Tipo de Impacto:</span>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('neutral')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'neutral' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-muted'}`}
                      >
                        Anotação Simples
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('debit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'debit' ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-slate-200 text-red-500'}`}
                      >
                        Débito (Fiado Avulso)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('credit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'credit' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-emerald-600'}`}
                      >
                        Crédito (Abono/Entrada)
                      </button>
                    </div>

                    <button 
                      type="submit"
                      className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} />
                      Salvar Nota
                    </button>
                  </div>
                </form>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {notes.map((n, index) => (
                    <div key={`ledger-note-${n.id || index}-${index}`} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:border-slate-200 transition-all">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">{n.text}</p>
                        <p className="text-[10px] text-muted font-medium">
                          Por: {n.authorName} • {n.createdAt ? format(new Date(n.createdAt.seconds * 1000), 'dd/MM/yyyy HH:mm') : 'Agora'}
                        </p>
                      </div>
                      <div className="text-right">
                        {n.value > 0 && (
                          <span className={`text-sm font-black px-3 py-1 rounded-lg ${
                            n.type === 'credit' ? 'text-emerald-700 bg-emerald-50' : n.type === 'debit' ? 'text-red-700 bg-red-50' : 'text-slate-600 bg-slate-50'
                          }`}>
                            {n.type === 'credit' ? '+' : n.type === 'debit' ? '-' : ''} R$ {(n.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <div className="text-center py-12 text-muted italic text-xs font-bold bg-slate-50 border border-dashed border-slate-100 rounded-2xl">
                      Caderno de anotações vazio. Escreva sua primeira nota acima.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {selectedDebt && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h4 className="font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <DollarSign size={18} className="text-emerald-500" />
                    Receber Pagamento
                  </h4>
                  <button onClick={() => setSelectedDebt(null)} className="text-muted hover:text-primary cursor-pointer">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Valor do Pagamento</label>
                    <input 
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-xl font-black focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Forma de Recebimento</label>
                    <div className="grid grid-cols-2 gap-2">
                      {paymentMethods.filter(m => !m.goesToClientAccount).map((method, index) => (
                        <button
                          key={`pay-filter-${method.id || index}-${index}`}
                          type="button"
                          onClick={() => setSelectedMethod(method.id)}
                          className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border-2 cursor-pointer ${
                            selectedMethod === method.id 
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                              : 'bg-white border-slate-100 text-muted hover:border-slate-200'
                          }`}
                        >
                          {method.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handlePayment}
                    disabled={isPaying || !paymentAmount || !selectedMethod}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {isPaying ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                    <span>Confirmar Recebimento</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ProfessionalAccountDetailsModal({ 
  profissional_id, 
  onClose, 
  onSuccess,
  paymentMethods,
  defaultStartDate,
  defaultEndDate
}: { 
  profissional_id: string, 
  onClose: () => void, 
  onSuccess: () => void,
  paymentMethods: PaymentMethodConfig[],
  defaultStartDate?: string,
  defaultEndDate?: string
}) {
  const [pro, setPro] = useState<any>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'commissions' | 'advances' | 'payouts'>('commissions');
  
  // Date range state for filtering this professional's financial logs
  const [modalDateRange, setModalDateRange] = useState({
    start: defaultStartDate || format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: defaultEndDate || format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  // Advance generation state
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDesc, setAdvanceDesc] = useState('');
  const [isSavingAdvance, setIsSavingAdvance] = useState(false);

  // Receipt voucher state
  const [selectedPayoutForReceipt, setSelectedPayoutForReceipt] = useState<any>(null);

  const { user } = useAuth();

  useEffect(() => {
    loadInfo();
  }, [profissional_id, modalDateRange.start, modalDateRange.end]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [p, c, a, pay] = await Promise.all([
        userService.getUserProfile(profissional_id),
        commissionService.getCommissions({ 
          profissional_id, 
          startDate: modalDateRange.start, 
          endDate: modalDateRange.end 
        }),
        commissionService.getAdvances({ 
          profissional_id,
          startDate: modalDateRange.start,
          endDate: modalDateRange.end
        }),
        commissionService.getPayouts(profissional_id)
      ]);
      setPro(p);
      setCommissions(c);
      setAdvances(a);
      
      // Filter payouts to the period
      const filteredPayouts = pay.filter(
        payout => payout.date >= modalDateRange.start && payout.date <= modalDateRange.end
      );
      setPayouts(filteredPayouts);
    } catch (error) {
      toast.error("Erro ao carregar conta do profissional");
    } finally {
      setLoading(false);
    }
  };

  // Only count pending commissions of the filtered period for the active pending balance
  const pendingCommissions = commissions.filter(c => c.status === 'pendente');
  const pendingCommAmount = pendingCommissions.reduce((acc, c) => acc + (c.commission_value || 0), 0);
  const totalAdvances = advances.reduce((acc, a) => acc + (a.amount || 0), 0);
  const totalPayoutVal = payouts.reduce((acc, p) => acc + (p.amount || 0), 0);
  const balanceToPay = pendingCommAmount - totalAdvances;

  const handleRegisterAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceAmount || parseFloat(advanceAmount) <= 0) return;
    setIsSavingAdvance(true);
    try {
      const amount = parseFloat(advanceAmount);
      await addDoc(collection(db, 'professional_advances'), {
        profissional_id,
        profissional_name: pro?.nome || 'Profissional',
        amount,
        description: advanceDesc || 'Vale/Adiantamento Avulso',
        date: format(new Date(), 'yyyy-MM-dd'),
        createdAt: serverTimestamp(),
        authorName: user?.displayName || 'Admin'
      });

      // Update local wallet if desired
      toast.success("Vale registrado com sucesso para o Profissional!");
      setAdvanceAmount('');
      setAdvanceDesc('');
      loadInfo();
      onSuccess();
    } catch (error) {
      toast.error("Erro ao registrar vale");
    } finally {
      setIsSavingAdvance(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-sm font-bold text-muted animate-pulse">Carregando dados profissionais...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center shadow-sm border border-accent/20">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary">{pro?.nome}</h3>
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Conta e Razão do Profissional</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 self-end md:self-auto">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Calendar size={14} className="text-muted" />
              <input 
                type="date" 
                value={modalDateRange.start}
                onChange={(e) => setModalDateRange({...modalDateRange, start: e.target.value})}
                className="bg-transparent text-[10px] text-primary focus:outline-none font-bold outline-none"
              />
              <span className="text-slate-300">|</span>
              <input 
                type="date" 
                value={modalDateRange.end}
                onChange={(e) => setModalDateRange({...modalDateRange, end: e.target.value})}
                className="bg-transparent text-[10px] text-primary focus:outline-none font-bold outline-none"
              />
            </div>
            <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm cursor-pointer">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Comissões Pendentes</p>
              <p className="text-xl font-black text-slate-800">
                R$ {pendingCommAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-amber-700 font-bold uppercase tracking-widest">Total Vales (Adiantado)</p>
              <p className="text-xl font-black text-amber-700">
                R$ {totalAdvances.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-emerald-800 font-bold uppercase tracking-widest font-black">Histórico Repassado</p>
              <p className="text-xl font-black text-emerald-700">
                R$ {totalPayoutVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className={`p-5 rounded-3xl text-right border ${balanceToPay > 0 ? 'bg-primary text-white border-primary' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${balanceToPay > 0 ? 'text-white/60' : 'text-muted'}`}>Saldo a Pagar</p>
              <p className="text-xl font-black">
                R$ {balanceToPay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex gap-6 border-b border-slate-100">
              <button 
                onClick={() => setActiveTab('commissions')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'commissions' ? 'text-primary' : 'text-muted'
                }`}
              >
                Comissões em Aberto
                {activeTab === 'commissions' && <motion.div layoutId="proModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('advances')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'advances' ? 'text-primary' : 'text-muted'
                }`}
              >
                Vales registrados
                {activeTab === 'advances' && <motion.div layoutId="proModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
              <button 
                onClick={() => setActiveTab('payouts')}
                className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                  activeTab === 'payouts' ? 'text-primary' : 'text-muted'
                }`}
              >
                Vouchers de Encerramento (Pagos)
                {activeTab === 'payouts' && <motion.div layoutId="proModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
              </button>
            </div>

            {activeTab === 'commissions' && (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="p-4 text-[10px] font-black text-muted uppercase tracking-widest">Descrição</th>
                        <th className="p-4 text-center text-[10px] font-black text-muted uppercase tracking-widest">Taxa/Métrica</th>
                        <th className="p-4 text-right text-[10px] font-black text-muted uppercase tracking-widest">Total Comanda</th>
                        <th className="p-4 text-right text-[10px] font-black text-muted uppercase tracking-widest">Sua Comissão</th>
                        <th className="p-4 text-center text-[10px] font-black text-muted uppercase tracking-widest">Data</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {pendingCommissions.map((c, index) => (
                        <tr key={`pro-comm-${c.id || index}-${index}`} className="hover:bg-slate-50/50">
                          <td className="p-4 font-bold text-primary">{c.servico_name || 'Serviço Prestado'}</td>
                          <td className="p-4 text-center font-bold text-slate-500">{c.commission_percentage || 50}%</td>
                          <td className="p-4 text-right text-muted">R$ {(c.base_value || 0).toFixed(2)}</td>
                          <td className="p-4 text-right font-black text-emerald-600">R$ {(c.commission_value || 0).toFixed(2)}</td>
                          <td className="p-4 text-center text-muted font-bold">{c.date ? format(new Date(c.date + 'T00:00:00'), 'dd/MM/yyyy') : '---'}</td>
                        </tr>
                      ))}
                      {pendingCommissions.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-10 font-bold text-muted italic">Nenhuma comissão pendente encontrada para o período selecionado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'advances' && (
              <div className="space-y-6">
                <form onSubmit={handleRegisterAdvance} className="bg-amber-50/50 border border-amber-100 p-6 rounded-3xl space-y-4">
                  <h4 className="font-bold text-sm text-amber-950 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Lançar Novo Vale / Adiantamento ao Profissional
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input 
                      type="number"
                      step="0.01"
                      required
                      placeholder="Valor do vale em R$ (Ex: 50.00)"
                      value={advanceAmount}
                      onChange={(e) => setAdvanceAmount(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 text-primary font-bold"
                    />
                    <input 
                      type="text"
                      placeholder="Identificador do vale (Ex: Vale almoço / Gasolina)"
                      value={advanceDesc}
                      onChange={(e) => setAdvanceDesc(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 text-primary font-bold"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button 
                      type="submit"
                      disabled={isSavingAdvance}
                      className="px-6 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {isSavingAdvance ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                      Registrar Vale
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  {advances.map((a, index) => (
                    <div key={`pro-adv-${a.id || index}-${index}`} className="bg-white border border-slate-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-xs font-bold text-primary">{a.description || 'Vale / Adiantamento avulso'}</p>
                        <p className="text-[10px] text-muted font-bold">Lançador: {a.authorName || 'Sistema'} • {a.date ? format(new Date(a.date + 'T00:00:00'), 'dd/MM/yyyy') : '---'}</p>
                      </div>
                      <p className="text-sm font-black text-red-500">- R$ {(a.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  ))}
                  {advances.length === 0 && (
                    <div className="text-center py-10 text-muted italic font-bold">Nenhum vale registrado ainda.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'payouts' && (
              <div className="space-y-4">
                {payouts.map((pay, index) => (
                  <div key={`pro-pay-${pay.id || index}-${index}`} className="bg-white border border-slate-100 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100">
                        <FileText size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-primary">Encerramento Financeiro Pago</p>
                        <p className="text-[10px] text-muted font-bold">Pago em: {format(new Date(pay.date + 'T00:00:00'), 'dd/MM/yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm font-black text-emerald-600">R$ {(pay.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <button 
                        onClick={() => setSelectedPayoutForReceipt(pay)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-primary text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileText size={12} />
                        Gerar Recibo
                      </button>
                    </div>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <div className="text-center py-12 text-muted italic font-bold">Nenhum fechamento histórico pago encontrado.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Printable Payout Receipt Modal */}
      <AnimatePresence>
        {selectedPayoutForReceipt && (
          <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-8 border border-slate-100 text-slate-800 space-y-8 flex flex-col justify-between"
            >
              <div className="border-b border-dashed border-slate-200 pb-6 space-y-4 text-center">
                <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full text-slate-600 uppercase tracking-widest">Recibo de Comissão & Repasse</span>
                <h3 className="font-sans font-black text-3xl tracking-tight text-primary">BARBEARIA DESIGN</h3>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest">Ponto Comercial Barber Shop - Razão do Profissional</p>
              </div>

              <div className="space-y-4 text-sm font-medium">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-muted font-bold">Profissional Beneficiário</span>
                  <span className="font-extrabold text-primary">{pro?.nome}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-muted font-bold">Data de Liquidação</span>
                  <span className="font-extrabold text-primary">{format(new Date(selectedPayoutForReceipt.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-muted font-bold">Identificação do Voucher</span>
                  <span className="font-mono text-xs font-black text-slate-500 uppercase">{selectedPayoutForReceipt.id?.substring(0, 10) || 'N/A'}</span>
                </div>
                
                <div className="bg-slate-50 p-6 rounded-2xl text-center border border-slate-100">
                  <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Valor Total Repassado</p>
                  <p className="text-3xl font-black text-emerald-600">R$ {(selectedPayoutForReceipt.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="space-y-12">
                <p className="text-[10px] text-slate-400 font-bold text-center italic">
                  E por ser verdade firmamos o presente recibo dando quitação geral e irrestrita sobre as comissões apuradas no referido período.
                </p>
                
                <div className="grid grid-cols-2 gap-8 text-center text-[10px] font-black uppercase tracking-widest text-muted">
                  <div className="border-t border-slate-200 pt-3">Assinatura Barberia</div>
                  <div className="border-t border-slate-200 pt-3">Assinatura do Profissional</div>
                </div>
              </div>

              <div className="flex justify-between gap-4 pt-4">
                <button 
                  onClick={() => setSelectedPayoutForReceipt(null)} 
                  className="flex-1 py-3 bg-slate-100 text-primary font-bold rounded-xl text-xs hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Fechar
                </button>
                <button 
                  onClick={() => window.print()} 
                  className="flex-1 py-3 bg-primary text-white font-bold rounded-xl text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <FileText size={14} />
                  Imprimir Recibo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CashMovementList({ caixaId }: { caixaId: string }) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = cashService.subscribeToMovementsByCashId(caixaId, (data) => {
      setMovements(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [caixaId]);

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-accent" /></div>;

  return (
    <div className="space-y-4">
      {movements.map((m, index) => (
        <div key={`movement-${m.id || index}-${index}`} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              m.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
            }`}>
              {m.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
            </div>
            <div>
              <p className="text-sm font-bold text-primary">{m.description}</p>
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">{m.category} • {format(parseDate(m.createdAt), 'HH:mm')}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-sm font-black ${m.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
              {m.type === 'income' ? '+' : '-'} R$ {m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      ))}
      {movements.length === 0 && (
        <div className="text-center py-10 text-muted italic text-sm">Nenhuma movimentação neste caixa.</div>
      )}
    </div>
  );
}

function TransactionTable({ transactions }: { transactions: FinancialTransaction[] }) {
  return (
    <table className="w-full text-left border-collapse">
      <thead>
        <tr className="bg-slate-50/50">
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Data</th>
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Descrição</th>
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Categoria</th>
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Pagamento</th>
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
          <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {transactions.map((t, index) => (
          <tr key={`trans-table-${t.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
            <td className="px-8 py-6 text-sm text-muted font-bold">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
            <td className="px-8 py-6">
              <p className="text-sm font-bold text-primary">{t.description}</p>
              {t.cliente_name && <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Cliente: {t.cliente_name}</p>}
            </td>
            <td className="px-8 py-6">
              <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
                {t.category}
              </span>
            </td>
            <td className="px-8 py-6">
              <div className="flex items-center gap-2.5 text-muted">
                <PaymentIcon method={t.paymentMethod} />
                <span className="text-[10px] font-black uppercase tracking-widest">{t.paymentMethod}</span>
              </div>
            </td>
            <td className="px-8 py-6 text-right">
              <span className={`text-sm font-black ${t.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </td>
            <td className="px-8 py-6 text-center">
              <StatusBadge status={t.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatCard({ title, value, icon, color, subtitle }: { title: string, value: number, icon: React.ReactNode, color: string, subtitle: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    red: 'bg-red-50 border-red-100 text-red-600',
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600'
  };

  return (
    <div className={`p-8 rounded-[2rem] border ${colors[color]} space-y-6 shadow-sm relative overflow-hidden group`}>
      <div className="absolute top-0 right-0 w-24 h-24 bg-white/20 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform" />
      <div className="flex items-center justify-between relative z-10">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-white/50">
          {icon}
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</span>
      </div>
      <div className="relative z-10">
        <p className="text-3xl font-black text-primary tracking-tighter">R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        <p className="text-[10px] font-bold opacity-60 mt-1.5 uppercase tracking-wide">{subtitle}</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap flex items-center gap-2.5 ${
        active ? 'text-accent' : 'text-muted hover:text-primary'
      }`}
    >
      {icon}
      {label}
      {active && (
        <motion.div 
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full"
        />
      )}
    </button>
  );
}

function TransactionItem({ transaction }: { transaction: FinancialTransaction, key?: React.Key }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-accent/20 transition-all shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border ${
          transaction.type === 'income' ? 'bg-emerald-100 text-emerald-600 border-emerald-200' : 'bg-red-100 text-red-600 border-red-200'
        }`}>
          {transaction.type === 'income' ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
        </div>
        <div>
          <p className="text-sm font-bold text-primary group-hover:text-accent transition-colors">{transaction.description}</p>
          <p className="text-[10px] text-muted uppercase tracking-widest font-black mt-0.5">{transaction.category} • {format(new Date(transaction.date), 'dd/MM')}</p>
          {transaction.cliente_name && <p className="text-[8px] text-muted uppercase tracking-widest font-bold mt-0.5">Cliente: {transaction.cliente_name}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-black ${transaction.type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
          {transaction.type === 'income' ? '+' : '-'} R$ {transaction.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </p>
        <p className="text-[8px] text-muted uppercase tracking-widest font-black mt-0.5">{transaction.paymentMethod}</p>
      </div>
    </div>
  );
}

function PaymentIcon({ method }: { method: PaymentMethod }) {
  switch (method) {
    case 'pix': return <Smartphone size={16} className="text-emerald-500" />;
    case 'dinheiro': return <Wallet size={16} className="text-emerald-500" />;
    case 'credito':
    case 'debito': return <CreditCard size={16} className="text-blue-500" />;
    case 'fiado': return <Clock size={16} className="text-amber-500" />;
    default: return <DollarSign size={16} />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pago: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    pendente: 'bg-amber-50 text-amber-600 border-amber-100',
    cancelado: 'bg-red-50 text-red-600 border-red-100'
  };
  const labels: Record<string, string> = {
    pago: 'Pago',
    pendente: 'Pendente',
    cancelado: 'Cancelado'
  };
  return (
    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function TransactionModal({ type, currentCash, onClose, onSuccess }: { type: TransactionType, currentCash: DailyCash | null, onClose: () => void, onSuccess: () => void }) {
  const { user, profile } = useAuth();
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [formData, setFormData] = useState({
    description: '',
    amount: 0,
    category: '',
    paymentMethod: 'pix' as PaymentMethod,
    date: format(new Date(), 'yyyy-MM-dd'),
    status: 'pago' as any
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    const cats = await financialService.getCategories(type);
    setCategories(cats);
    if (cats.length > 0) setFormData(prev => ({ ...prev, category: cats[0].name }));
  };

  const { execute: handleSubmit, isLoading: loading } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.amount || isNaN(formData.amount) || formData.amount <= 0) {
      toast.error("Por favor, insira um valor válido maior que zero!");
      return;
    }

    const isPaid = formData.paymentMethod !== 'fiado';
    const transactionStatus = isPaid ? 'pago' : 'pendente';

    await financialService.createTransaction({
      ...formData,
      type,
      responsavel_id: user.uid,
      responsibleName: profile?.nome || 'Admin',
      status: transactionStatus
    });

    // If it's a paid transaction for today and we have an open cash session, record movement
    const today = format(new Date(), 'yyyy-MM-dd');
    if (isPaid && formData.date === today && currentCash) {
      await cashService.addMovement({
        caixa_id: currentCash.id,
        type: type as any,
        category: formData.category || (type === 'income' ? 'Entrada' : 'Saída'),
        description: formData.description,
        amount: formData.amount,
        paymentMethod: formData.paymentMethod,
        is_receivable: formData.paymentMethod !== 'dinheiro' && formData.paymentMethod !== 'pix',
        usuario_id: user.uid,
        usuario_name: profile?.nome || 'Sistema',
        date: today
      });
    }

    onSuccess();
    onClose();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
          <h2 className="text-2xl font-black text-primary">
            {type === 'income' ? 'Nova Entrada' : 'Nova Saída'}
          </h2>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Descrição</label>
            <input 
              type="text"
              required
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
              placeholder="Ex: Pagamento de Aluguel"
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Valor (R$)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" size={18} />
                <input 
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={isNaN(formData.amount) ? "" : formData.amount}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    setFormData({...formData, amount: isNaN(parsed) ? NaN : parsed});
                  }}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Data</label>
              <input 
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Categoria</label>
              <select 
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-bold shadow-inner"
              >
                {categories.map((cat, idx) => <option key={`cat-opt-${cat.id || idx}-${idx}`} value={cat.name}>{cat.name}</option>)}
                <option value="Outros">Outros</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Forma de Pagamento</label>
              <select 
                value={formData.paymentMethod}
                onChange={(e) => setFormData({...formData, paymentMethod: e.target.value as PaymentMethod})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-bold shadow-inner"
              >
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="credito">Crédito</option>
                <option value="debito">Débito</option>
                {type === 'income' && <option value="fiado">Fiado</option>}
                <option value="assinatura">Assinatura</option>
              </select>
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-sm text-muted hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={loading}
              className={`flex-[2] py-4 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 ${
                type === 'income' ? 'bg-primary text-white hover:bg-slate-800 shadow-primary/10' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-600/10'
              }`}
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (type === 'income' ? 'Confirmar Entrada' : 'Confirmar Saída')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CashModal({ currentCash, onOpen, onCloseCash, onClose, loading }: { currentCash: DailyCash | null, onOpen: (val: number) => void, onCloseCash: (val: number) => void, onClose: () => void, loading: boolean }) {
  const [balance, setBalance] = useState<number | string>(currentCash?.expected_balance || 0);

  useEffect(() => {
    if (currentCash) {
      setBalance(currentCash.expected_balance);
    } else {
      setBalance(0);
    }
  }, [currentCash?.id, currentCash?.expected_balance]);

  const handleConfirm = () => {
    const val = typeof balance === 'string' ? parseFloat(balance) : balance;
    if (currentCash) {
      onCloseCash(val);
    } else {
      onOpen(val);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
          <h2 className="text-2xl font-black text-primary">
            {currentCash ? 'Fechar Caixa Diário' : 'Abrir Caixa Diário'}
          </h2>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">
              {currentCash ? 'Saldo Final em Dinheiro (R$)' : 'Saldo Inicial em Dinheiro (R$)'}
            </label>
            <div className="relative">
              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-accent" size={20} />
              <input 
                type="number"
                required
                min="0"
                step="0.01"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-12 pr-5 text-2xl font-black focus:outline-none focus:ring-4 focus:ring-accent/5 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="0,00"
              />
            </div>
            {currentCash && (
              <p className="text-[10px] font-bold text-slate-500 ml-1 uppercase tracking-tight">
                Saldo esperado: <span className="text-primary font-black">R$ {currentCash.expected_balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </p>
            )}
            <p className="text-[10px] text-muted ml-1 font-bold uppercase tracking-tight opacity-70">
              {currentCash ? 'Informe o valor total em espécie presente no caixa para conferência.' : 'Informe o valor em espécie disponível para troco.'}
            </p>
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-sm text-muted hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirm}
              disabled={loading}
              className="flex-[2] py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-3 active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : (currentCash ? 'Confirmar Fechamento' : 'Confirmar Abertura')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface PaymentMethodCardProps {
  key?: React.Key;
  method: PaymentMethodConfig;
  onEdit: () => void;
  onToggleStatus: () => void | Promise<void>;
}

function PaymentMethodCard({ method, onEdit, onToggleStatus }: PaymentMethodCardProps) {
  // Cores de fundo e texto de acordo com o tipo do pagamento
  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'dinheiro':
        return {
          bg: 'bg-emerald-50/70 border-emerald-100',
          iconColor: 'text-emerald-600',
          badgeText: 'Dinheiro Físico',
          desc: 'Entrada física de cédulas na gaveta.'
        };
      case 'pix':
        return {
          bg: 'bg-cyan-50/70 border-cyan-100',
          iconColor: 'text-cyan-600',
          badgeText: 'Pix Digital',
          desc: 'Transferência instantânea via Pix.'
        };
      case 'credito':
        return {
          bg: 'bg-blue-50/70 border-blue-100',
          iconColor: 'text-blue-600',
          badgeText: 'Crédito',
          desc: 'Vendas via cartão de crédito.'
        };
      case 'debito':
        return {
          bg: 'bg-indigo-50/70 border-indigo-100',
          iconColor: 'text-indigo-600',
          badgeText: 'Débito',
          desc: 'Vendas via cartão de débito.'
        };
      case 'fiado':
        return {
          bg: 'bg-amber-50/70 border-amber-100',
          iconColor: 'text-amber-600',
          badgeText: 'Conta Cliente / Fiado',
          desc: 'Dívida pendente registrada no cadastro.'
        };
      case 'assinatura':
        return {
          bg: 'bg-purple-50/70 border-purple-100',
          iconColor: 'text-purple-600',
          badgeText: 'Créditos / Assinaturas',
          desc: 'Recorte de saldo pré-pago do cliente.'
        };
      default:
        return {
          bg: 'bg-slate-50/70 border-slate-100',
          iconColor: 'text-slate-600',
          badgeText: 'Outros',
          desc: 'Meios alternativos ou integrados.'
        };
    }
  };

  const styles = getTypeStyles(method.tipo);
  const costSimResult = 100 * (1 - (method.taxa_percentual || 0) / 100);

  return (
    <motion.div 
      layout
      className={`bg-white border rounded-3xl p-6 transition-all group relative overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md ${
        method.status === 'active' 
          ? 'border-slate-100 hover:border-slate-200' 
          : 'border-slate-150 bg-slate-50/50 opacity-60 grayscale'
      }`}
    >
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-transform group-hover:scale-105 duration-300 ${styles.bg}`}>
              <span className={styles.iconColor}>
                <PaymentIcon method={method.tipo as any} />
              </span>
            </div>
            <div>
              <h4 className="font-bold text-primary text-base leading-tight">{method.nome}</h4>
              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5 block">{styles.badgeText}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={onEdit} 
              title="Configurar regras"
              className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-xl transition-all"
            >
              <Edit2 size={15} />
            </button>
            <button 
              onClick={onToggleStatus} 
              title={method.status === 'active' ? 'Desativar método' : 'Ativar método'}
              className={`p-2 rounded-xl transition-all ${
                method.status === 'active' 
                  ? 'text-slate-400 hover:text-rose-500 hover:bg-rose-50' 
                  : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50'
              }`}
            >
              {method.status === 'active' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
            </button>
          </div>
        </div>

        {/* Tipo Informação Adicional do Meio */}
        <p className="text-[11px] text-slate-400 leading-normal mb-5 italic border-l-2 border-slate-100 pl-2.5">
          {styles.desc}
        </p>

        {/* Detalhes de Regras */}
        <div className="space-y-2.5 border-t border-b border-dashed border-slate-100 py-4 mb-5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Percent size={13} className="text-slate-400 shrink-0" />
              Taxa Administrativa
            </span>
            <span className={`font-bold ${method.taxa_percentual > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {method.taxa_percentual === 0 ? 'Sem taxas (0%)' : `${method.taxa_percentual}%`}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400 shrink-0" />
              Liberação Bancária
            </span>
            <span className="font-bold text-primary">
              {method.prazo_recebimento === 0 ? 'D+0 (Instantâneo)' : `D+${method.prazo_recebimento} dia(s)`}
            </span>
          </div>

          {/* Simulação Educacional de Venda */}
          <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100 mt-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Cálculo de Liquidez</span>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">A cada R$ 100,00 você recebe:</span>
              <strong className="text-primary font-black">
                R$ {costSimResult.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
            </div>
          </div>
        </div>

        {/* Fluxo de Caixa e Destinos */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Caixa Diário:</span>
            <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wide border ${
              method.entra_no_caixa 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                : 'bg-slate-50 text-slate-400 border-slate-100'
            }`}>
              {method.entra_no_caixa ? 'Soma no Caixa' : 'Fora do Caixa'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>Fluxo Faturado:</span>
            <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wide border ${
              method.recebe_na_hora 
                ? 'bg-cyan-50 text-cyan-600 border-cyan-100' 
                : method.vai_para_recebiveis
                ? 'bg-blue-50 text-blue-600 border-blue-100'
                : method.vai_para_conta_cliente
                ? 'bg-amber-50 text-amber-600 border-amber-100'
                : 'bg-slate-50 text-slate-400 border-slate-100'
            }`}>
              {method.recebe_na_hora 
                ? 'Sem Prazos' 
                : method.vai_para_recebiveis 
                ? 'Agendado Futuro' 
                : method.vai_para_conta_cliente 
                ? 'Pendente Fiado' 
                : 'Direto / Outros'}
            </span>
          </div>

          <div className="flex flex-wrap gap-1 pt-2">
            {method.permite_parcial && (
              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[8px] font-bold rounded">
                Parcial Ok
              </span>
            )}
            {method.permite_split && (
              <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-bold rounded">
                Comissão Auto
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer do Card */}
      <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider ${
          method.status === 'active' ? 'text-emerald-500' : 'text-slate-400'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${method.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
          {method.status === 'active' ? 'Ativo e Habilitado' : 'Meio Suspenso'}
        </span>
        <button onClick={onEdit} className="text-xs font-black text-accent hover:underline uppercase tracking-wider">
          Ajustar Regras →
        </button>
      </div>
    </motion.div>
  );
}

const getFlowUpdates = (tipo: string, prazo: number): Partial<PaymentMethodConfig> => {
  if (tipo === 'fiado') {
    return {
      recebe_na_hora: false,
      entra_no_caixa: false,
      vai_para_recebiveis: false,
      vai_para_conta_cliente: true,
    };
  }
  
  if (tipo === 'assinatura') {
    return {
      recebe_na_hora: true,
      entra_no_caixa: false,
      vai_para_recebiveis: false,
      vai_para_conta_cliente: false,
    };
  }

  // Se o prazo for 0, recebe na hora
  if (prazo === 0) {
    return {
      recebe_na_hora: true,
      entra_no_caixa: tipo === 'dinheiro', // Apenas físico entra na gaveta
      vai_para_recebiveis: false,
      vai_para_conta_cliente: false,
    };
  } else {
    // Prazo > 0 (D+1, D+30, etc.)
    return {
      recebe_na_hora: false,
      entra_no_caixa: false,
      vai_para_recebiveis: true,
      vai_para_conta_cliente: false,
    };
  }
};

function PaymentMethodModal({ method, onClose, onSuccess }: { 
  method: PaymentMethodConfig | null, 
  onClose: () => void, 
  onSuccess: () => void 
}) {
  const [formData, setFormData] = useState<Partial<PaymentMethodConfig>>(method || {
    nome: '',
    tipo: 'pix',
    taxa_percentual: 0,
    prazo_recebimento: 0,
    recebe_na_hora: true,
    entra_no_caixa: false,
    vai_para_recebiveis: false,
    vai_para_conta_cliente: false,
    permite_parcial: true,
    permite_split: true
  });

  const [taxaString, setTaxaString] = useState<string>(
    method?.taxa_percentual !== undefined ? String(method.taxa_percentual).replace('.', ',') : '0'
  );
  const [prazoString, setPrazoString] = useState<string>(
    method?.prazo_recebimento !== undefined ? String(method.prazo_recebimento) : '0'
  );

  const handleTaxaChange = (valStr: string) => {
    const cleanStr = valStr.replace(/[^0-9,.]/g, '');
    setTaxaString(cleanStr);
    
    const dotStr = cleanStr.replace(',', '.');
    const parsed = parseFloat(dotStr);
    if (!isNaN(parsed)) {
      setFormData(prev => ({ ...prev, taxa_percentual: parsed }));
    } else {
      setFormData(prev => ({ ...prev, taxa_percentual: 0 }));
    }
  };

  const handlePrazoChange = (valStr: string) => {
    const cleanStr = valStr.replace(/[^0-9]/g, '');
    setPrazoString(cleanStr);
    
    const parsed = parseInt(cleanStr, 10);
    const validParsed = !isNaN(parsed) ? parsed : 0;
    
    const currentTipo = formData.tipo || 'outros';
    const flowRules = getFlowUpdates(currentTipo, validParsed);
    
    setFormData(prev => ({ 
      ...prev, 
      prazo_recebimento: validParsed,
      ...flowRules
    }));
  };

  const { execute: handleSubmit, isLoading } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (method) {
        await paymentMethodService.updatePaymentMethod(method.id, formData);
        toast.success("Método de pagamento atualizado!");
      } else {
        await paymentMethodService.createPaymentMethod(formData);
        toast.success("Método de pagamento criado!");
      }
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Erro ao salvar método.");
    }
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white border border-slate-200 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-primary">{method ? 'Editar Método' : 'Novo Método'}</h2>
            <p className="text-xs text-slate-400 font-bold mt-0.5">As regras de fluxo definem como o dinheiro interage com o caixa.</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Seção 1: Identificação */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">1. Identificação do Canal</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nome de Exibição nas Comandas</label>
                <input 
                  required
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({...formData, nome: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:border-accent transition-all text-primary shadow-inner"
                  placeholder="Ex: Cartão de Crédito Visa"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Tipo de Meio (Aplica Auto-Ajustes)</label>
                <select 
                  required
                  value={formData.tipo}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    let updates: Partial<PaymentMethodConfig> = { tipo: val };
                    let taxa = 0;
                    let prazo = 0;
                    if (val === 'dinheiro') {
                      taxa = 0;
                      prazo = 0;
                    } else if (val === 'pix') {
                      taxa = 0;
                      prazo = 0;
                    } else if (val === 'credito') {
                      taxa = 2.99;
                      prazo = 30;
                    } else if (val === 'debito') {
                      taxa = 1.49;
                      prazo = 1;
                    } else if (val === 'fiado') {
                      taxa = 0;
                      prazo = 0;
                    } else if (val === 'assinatura') {
                      taxa = 0;
                      prazo = 0;
                    }
                    updates.taxa_percentual = taxa;
                    setTaxaString(String(taxa).replace('.', ','));
                    updates.prazo_recebimento = prazo;
                    setPrazoString(String(prazo));

                    const flowRules = getFlowUpdates(val, prazo);
                    setFormData({...formData, ...updates, ...flowRules});
                  }}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:border-accent transition-all text-primary shadow-inner outline-none"
                >
                  <option value="dinheiro">Cédula / Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="debito">Cartão de Débito</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="fiado">Fiado (Conta Cliente / Pendência)</option>
                  <option value="assinatura">Uso de Créditos / Assinatura</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
            </div>
          </div>

          {/* Seção 2: Custos */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">2. Custos e Prazo de Liberação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Taxa da Maquininha / Operadora (%)</label>
                <div className="relative">
                  <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text"
                    value={taxaString}
                    onChange={(e) => handleTaxaChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-5 text-sm font-bold focus:outline-none focus:border-accent transition-all text-primary shadow-inner"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Prazo para Compensar (Dias corridos)</label>
                <div className="relative">
                  <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text"
                    value={prazoString}
                    onChange={(e) => handlePrazoChange(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-5 text-sm font-bold focus:outline-none focus:border-accent transition-all text-primary shadow-inner"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 3: Comportamento Contábil Inteligente */}
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4 mt-2">
            <div className="space-y-1 border-b border-slate-200 pb-3">
              <h4 className="text-xs font-black text-primary uppercase tracking-widest">3. Fluxo Contábil Inteligente (Auto-Calculado)</h4>
              <p className="text-[10px] text-slate-400 font-bold">O sistema analisa o meio e o prazo inserido para atualizar as regras contábeis automaticamente.</p>
            </div>

            {/* Visualizações de Diagnóstico */}
            <div className="space-y-3 pt-1">
              {formData.tipo === 'fiado' ? (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3.5 items-start">
                  <div className="p-2.5 bg-amber-100 rounded-xl text-amber-600 shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-amber-800 block">👤 Registro de Fiado na Ficha do Cliente</strong>
                    <span className="text-[10px] text-amber-600 font-bold leading-normal block mt-1">
                      Nenhum valor entra na gaveta ou banco hoje. O valor integral do serviço se torna saldo devedor automático na ficha contábil do cliente selecionado na comanda.
                    </span>
                  </div>
                </div>
              ) : formData.tipo === 'assinatura' ? (
                <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex gap-3.5 items-start">
                  <div className="p-2.5 bg-purple-100 rounded-xl text-purple-600 shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-purple-800 block">🎟️ Abatimento de Créditos / Assinaturas</strong>
                    <span className="text-[10px] text-purple-600 font-bold leading-normal block mt-1">
                      Este pagamento abate do saldo pré-pago ou do pacote que o cliente já possui. Não gera novas entradas financeiras líquidas no caixa diário.
                    </span>
                  </div>
                </div>
              ) : (formData.prazo_recebimento || 0) === 0 ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3.5 items-start">
                    <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600 shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <strong className="text-xs font-black text-emerald-800 block">⚡ Liquidez Imediata (D+0)</strong>
                      <span className="text-[10px] text-emerald-600 font-bold leading-normal block mt-1">
                        Compensação na mesma hora. O valor líquido deduzido de possíveis taxas administrativa (R$ {(100 * (1 - (formData.taxa_percentual || 0) / 100)).toFixed(2)} por cada R$ 100 vendidos) fica disponível na hora.
                      </span>
                    </div>
                  </div>

                  {formData.tipo === 'dinheiro' ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3.5 items-start">
                      <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600 shrink-0">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <strong className="text-xs font-black text-blue-800 block">💵 Dinheiro Físico (Entrada na Gaveta)</strong>
                        <span className="text-[10px] text-blue-600 font-bold leading-normal block mt-1">
                          Este dinheiro entra na gaveta física do caixa de turno e compõe o saldo de conferência de fechamento no fim do dia.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex gap-3.5 items-start">
                      <div className="p-2.5 bg-slate-200 rounded-xl text-slate-600 shrink-0">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <strong className="text-xs font-black text-slate-850 block">📱 Transferência Conta Bancária</strong>
                        <span className="text-[10px] text-slate-500 font-bold leading-normal block mt-1">
                          O dinheiro cai na hora na conta do banco. Não soma no caixa de gaveta física do turno, mas é contabilizado no fechamento contábil.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3.5 items-start">
                  <div className="p-2.5 bg-blue-100 rounded-xl text-blue-600 shrink-0">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-blue-800 block">📅 Agendado a Receber Futuro (D+{(formData.prazo_recebimento || 0)})</strong>
                    <span className="text-[10px] text-blue-600 font-bold leading-normal block mt-1">
                      Para o fechamento de hoje, o valor líquido ficará classificado como <strong>a receber futuramente em {formData.prazo_recebimento} dia(s)</strong> no caixa. O saldo só será liquidado definitivamente no caixa do dia de compensação.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Configurações Avançadas da Comanda */}
            <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Checkbox 
                label="Permite pagamento parcial?" 
                description="Possibilita que o cliente misture este método com outro tipo para saldar uma comanda."
                checked={formData.permite_parcial} 
                onChange={(c) => setFormData({...formData, permite_parcial: c})} 
              />
              <Checkbox 
                label="Permite split de pagamento?" 
                description="Os repasses de comissão dos profissionais barbeiros são calculados em tempo real de forma automática."
                checked={formData.permite_split} 
                onChange={(c) => setFormData({...formData, permite_split: c})} 
              />
            </div>
          </div>

          {/* Botões do Formulário */}
          <div className="pt-4 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-sm text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isLoading}
              className="flex-[2] py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              {method ? 'Salvar Configurações' : 'Criar Método de Pagamento'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function Checkbox({ label, description, checked, onChange }: { label: string, description?: string, checked?: boolean, onChange: (val: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative flex items-center mt-0.5">
        <input 
          type="checkbox" 
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className="w-5 h-5 bg-white border-2 border-slate-200 rounded-md transition-all peer-checked:bg-accent peer-checked:peer-checked:border-accent group-hover:border-accent/50" />
        <CheckCircle2 size={12} className="absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
      </div>
      <div>
        <span className="text-xs font-bold text-slate-700 group-hover:text-primary transition-colors block">{label}</span>
        {description && <span className="text-[10px] text-slate-400 font-medium block mt-0.5 leading-normal">{description}</span>}
      </div>
    </label>
  );
}
