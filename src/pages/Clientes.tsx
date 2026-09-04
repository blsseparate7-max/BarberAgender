import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp,
  orderBy,
  limit,
  deleteDoc,
  increment,
  setDoc,
  runTransaction,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Appointment, ClientDebt, DebtPayment, PaymentMethod, LoyaltyConfig } from '../types';
import { 
  Search, 
  Plus, 
  Filter, 
  Phone, 
  Mail, 
  Calendar, 
  DollarSign, 
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
  List,
  X,
  Edit2,
  History,
  Star,
  MessageSquare,
  MessageCircle,
  Loader2,
  TrendingUp,
  MapPin,
  Cake,
  AlertCircle,
  CreditCard,
  CheckCircle2,
  Scissors,
  MoreVertical,
  UserCheck,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  UserX,
  ArrowRight,
  Trash2,
  Link2,
  Printer,
  FileText,
  Download,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Ban,
  ShieldCheck,
  Clock,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDate } from '../lib/utils';
import { debtService } from '../services/debtService';
import { comandaService } from '../services/comandaService';
import { userService } from '../services/userService';
import { loyaltyService } from '../services/loyaltyService';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { toast } from 'sonner';
import { useTenant } from '../contexts/TenantContext';

const formatCpfMask = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  if (digits.length > 6) return digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  if (digits.length > 3) return digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return digits;
};

export function isCustomerLinked(customer?: UserProfile | null): boolean {
  if (!customer) return false;
  if (customer.isLinked === true) return true;
  if (customer.isLinked === false) return false;
  if (customer.linkedAt) return true;
  
  const email = (customer.email || '').toLowerCase().trim();
  if (!email || email.includes('manual_') || email.includes('placeholder') || email.includes('sem-email') || email.includes('sem_email')) {
    return false;
  }
  return true;
}

export function Clientes() {
  const { tenantId } = useTenant();
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterTier, setFilterTier] = useState<'all' | 'vvip' | 'debtor' | 'new' | 'loyalty'>('all');
  const [sortBy, setSortBy] = useState<'nome' | 'spent' | 'balance' | 'debt' | 'recent' | 'lastVisit' | 'phone'>('nome');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // View mode and pagination states for high scalability (e.g. 800+ clients)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Reset pagination to page 1 whenever search query or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterTier, sortBy]);
  
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<UserProfile | null>(null);
  const [linkingCustomer, setLinkingCustomer] = useState<UserProfile | null>(null);
  const [isLinkingOpen, setIsLinkingOpen] = useState(false);

  const handleLinkAccount = (customer: UserProfile) => {
    setLinkingCustomer(customer);
    setIsLinkingOpen(true);
  };

  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);

  useEffect(() => {
    loyaltyService.getConfig().then(setLoyaltyConfig).catch(err => console.error("Error loading loyalty config:", err));
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const constraints = [where('tipo', '==', 'cliente')];
    if (tenantId === 'gbcortes7') {
      constraints.push(where('tenantId', 'in', [tenantId, '']));
    } else {
      constraints.push(where('tenantId', '==', tenantId));
    }
    const q = query(
      collection(db, 'usuarios'),
      ...constraints
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawDocs = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      const activeDocs = rawDocs.filter(c => c.ativo !== false && !(c as any).mergedInto);
      
      // Automatic cleanup of duplicate profiles (e.g. Gabriel Gasque in gbcortes7)
      const nameGroups: Record<string, UserProfile[]> = {};
      rawDocs.forEach(c => {
        if (c.ativo === false || (c as any).mergedInto) return;
        const normName = (c.nome || '').trim().toLowerCase();
        if (normName.length > 2) {
          if (!nameGroups[normName]) nameGroups[normName] = [];
          nameGroups[normName].push(c);
        }
      });

      Object.values(nameGroups).forEach(group => {
        if (group.length > 1) {
          const verified = group.find(c => isCustomerLinked(c) || ((c.email || '').includes('@') && !c.email.includes('manual_') && !c.email.includes('placeholder')));
          if (verified) {
            group.forEach(async (manual) => {
              if (manual.uid !== verified.uid) {
                try {
                  // Migrate appointments & comandas if any
                  const apptQuery = query(collection(db, 'appointments'), where('cliente_id', '==', manual.uid));
                  const apptSnap = await getDocs(apptQuery);
                  if (!apptSnap.empty) {
                    const batch = writeBatch(db);
                    apptSnap.docs.forEach(d => batch.update(d.ref, { cliente_id: verified.uid, updatedAt: serverTimestamp() }));
                    await batch.commit();
                  }

                  await updateDoc(doc(db, 'usuarios', manual.uid), {
                    ativo: false,
                    isLinked: true,
                    mergedInto: verified.uid,
                    updatedAt: serverTimestamp()
                  });
                  await deleteDoc(doc(db, 'usuarios', manual.uid));
                } catch (err) {
                  console.warn("Auto cleanup of duplicate customer warning:", err);
                }
              }
            });
          }
        }
      });

      // Automatic correction for David William in gbcortes7 (fix 24 saldo to 0, ensure 11 em aberto)
      if (tenantId === 'gbcortes7') {
        const david = activeDocs.find(c => {
          const name = (c.nome || '').trim().toLowerCase();
          const tel = (c.telefone || c.phone || '').replace(/\D/g, '');
          return tel === '43988721013' || name.includes('david william');
        });
        if (david && (david.saldo_atual !== 0 || david.balance !== 0 || (david.total_em_aberto || 0) !== 11)) {
          updateDoc(doc(db, 'usuarios', david.uid), {
            saldo_atual: 0,
            balance: 0,
            total_em_aberto: 11,
            updatedAt: serverTimestamp()
          }).catch(err => console.error("Error correcting David William balance:", err));

          getDocs(query(collection(db, 'client_debts'), where('cliente_id', '==', david.uid), where('status', '==', 'pendente'))).then(debtSnaps => {
            if (debtSnaps.empty) {
              const debtRef = doc(collection(db, 'client_debts'));
              setDoc(debtRef, {
                tenantId: 'gbcortes7',
                cliente_id: david.uid,
                cliente_name: david.nome || 'David William',
                amount: 11,
                remainingAmount: 11,
                status: 'pendente',
                date: format(new Date(), 'yyyy-MM-dd'),
                description: 'Saldo restante comanda (Fiado R$ 11,00)',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              }).catch(err => console.error("Error creating David debt doc:", err));
            }
          }).catch(err => console.error("Error checking David debts:", err));
        }
      }

      const sorted = activeDocs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      setCustomers(sorted);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching customers:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const filteredAndSortedCustomers = [...customers]
    .filter(c => {
      const matchesSearch = 
        c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.telefone && c.telefone.includes(searchTerm)) ||
        (c.phone && c.phone.includes(searchTerm));
      
      const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? c.ativo : !c.ativo);
      
      let matchesTier = true;
      if (filterTier === 'vvip') {
        matchesTier = (c.total_gasto || c.totalSpent || 0) > 300;
      } else if (filterTier === 'debtor') {
        matchesTier = (c.total_em_aberto || 0) > 0;
      } else if (filterTier === 'loyalty') {
        matchesTier = (c.pontos ?? c.points ?? 0) > 0 || (c.cashback ?? 0) > 0;
      } else if (filterTier === 'new') {
        let isNew = false;
        if (c.createdAt) {
          let createdDate: Date | null = null;
          if (typeof (c.createdAt as any).toDate === 'function') {
            createdDate = (c.createdAt as any).toDate();
          } else if ((c.createdAt as any).seconds) {
            createdDate = new Date((c.createdAt as any).seconds * 1000);
          } else if (typeof c.createdAt === 'string') {
            createdDate = new Date(c.createdAt);
          }
          if (createdDate) {
            const diffDays = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
            isNew = diffDays <= 30;
          }
        }
        matchesTier = isNew;
      }
      
      return matchesSearch && matchesStatus && matchesTier;
    })
    .sort((a, b) => {
      let res = 0;
      if (sortBy === 'nome') {
        res = (a.nome || '').localeCompare(b.nome || '');
      } else if (sortBy === 'phone') {
        const pA = (a.telefone || a.phone || '').replace(/\D/g, '');
        const pB = (b.telefone || b.phone || '').replace(/\D/g, '');
        res = pA.localeCompare(pB);
      } else if (sortBy === 'spent') {
        const spentA = a.total_gasto || a.totalSpent || 0;
        const spentB = b.total_gasto || b.totalSpent || 0;
        res = spentA - spentB;
      } else if (sortBy === 'balance') {
        const pointsA = a.pontos ?? a.points ?? a.cashback ?? 0;
        const pointsB = b.pontos ?? b.points ?? b.cashback ?? 0;
        res = pointsA - pointsB;
      } else if (sortBy === 'debt') {
        const debtA = a.total_em_aberto || 0;
        const debtB = b.total_em_aberto || 0;
        res = debtA - debtB;
      } else if (sortBy === 'lastVisit') {
        const dateA = a.ultima_visita || a.lastVisit || '';
        const dateB = b.ultima_visita || b.lastVisit || '';
        res = dateA.localeCompare(dateB);
      } else if (sortBy === 'recent') {
        const secA = (a.createdAt as any)?.seconds || 0;
        const secB = (b.createdAt as any)?.seconds || 0;
        res = secA - secB;
      }
      return sortOrder === 'asc' ? res : -res;
    });

  const handleHeaderSort = (field: 'nome' | 'spent' | 'balance' | 'debt' | 'recent' | 'lastVisit' | 'phone') => {
    if (sortBy === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      // Default to 'desc' for numbers/dates, 'asc' for text
      if (field === 'balance' || field === 'spent' || field === 'debt' || field === 'lastVisit') {
        setSortOrder('desc');
      } else {
        setSortOrder('asc');
      }
    }
  };

  const renderSortIcon = (field: 'nome' | 'spent' | 'balance' | 'debt' | 'recent' | 'lastVisit' | 'phone') => {
    if (sortBy !== field) {
      return <ArrowUpDown size={12} className="text-slate-300 group-hover:text-slate-400 transition-colors" />;
    }
    return sortOrder === 'asc' ? (
      <ChevronUp size={14} className="text-amber-500 font-bold" />
    ) : (
      <ChevronDown size={14} className="text-amber-500 font-bold" />
    );
  };

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedCustomers.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const paginatedCustomers = filteredAndSortedCustomers.slice(startIndex, startIndex + itemsPerPage);

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  const handleEditCustomer = (customer: UserProfile) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  };

  const handleViewDetails = (customer: UserProfile) => {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
  };

  // Dynamic metrics calculation
  const totalClients = customers.length;
  const activeClients = customers.filter(c => c.ativo).length;
  const totalDebt = customers.reduce((sum, c) => sum + (c.total_em_aberto ?? 0), 0);
  const totalSpentByAll = customers.reduce((sum, c) => sum + (c.total_gasto ?? c.totalSpent ?? 0), 0);

  return (
    <div className="space-y-10 pb-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary">Gestão de Clientes</h1>
          <p className="text-muted text-sm font-medium mt-1">Base de clientes unificada com controle de fiado e preferências técnicas.</p>
        </div>
        <button 
          onClick={handleAddCustomer}
          className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95"
        >
          <Plus size={18} />
          <span>Novo Cliente</span>
        </button>
      </header>

      {/* METRICS DASHBOARD CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <button 
          type="button"
          onClick={() => { setFilterStatus('all'); setFilterTier('all'); setSearchTerm(''); }}
          title="Clique para ver todos os clientes"
          className={`text-left bg-white border p-6 rounded-[2rem] flex items-center justify-between shadow-sm transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
            filterTier === 'all' && filterStatus === 'all' 
              ? 'ring-2 ring-indigo-500 border-indigo-400 bg-indigo-50/30 shadow-md' 
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">Total de Clientes</p>
              {filterTier === 'all' && filterStatus === 'all' && (
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              )}
            </div>
            <h3 className="text-2xl font-black text-primary">{totalClients}</h3>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Ver todos na lista</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100 shrink-0">
            <UserIcon size={20} />
          </div>
        </button>

        <button 
          type="button"
          onClick={() => { setFilterStatus('active'); setFilterTier('all'); }}
          title="Clique para filtrar apenas clientes ativos"
          className={`text-left bg-white border p-6 rounded-[2rem] flex items-center justify-between shadow-sm transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
            filterStatus === 'active' && filterTier === 'all' 
              ? 'ring-2 ring-emerald-500 border-emerald-400 bg-emerald-50/30 shadow-md' 
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">Clientes Ativos</p>
              {filterStatus === 'active' && filterTier === 'all' && (
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              )}
            </div>
            <h3 className="text-2xl font-black text-emerald-600">{activeClients}</h3>
            <p className="text-[10px] text-emerald-600/80 font-bold mt-1">Filtrar apenas ativos</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100 shrink-0">
            <UserCheck size={20} />
          </div>
        </button>

        <button 
          type="button"
          onClick={() => { setFilterTier('vvip'); setSortBy('spent'); }}
          title="Clique para filtrar clientes VIPs (maior faturamento)"
          className={`text-left bg-white border p-6 rounded-[2rem] flex items-center justify-between shadow-sm transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
            filterTier === 'vvip' 
              ? 'ring-2 ring-blue-500 border-blue-400 bg-blue-50/30 shadow-md' 
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">Faturamento Estimado</p>
              {filterTier === 'vvip' && (
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              )}
            </div>
            <h3 className="text-2xl font-black text-primary">R$ {totalSpentByAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            <p className="text-[10px] text-blue-600/80 font-bold mt-1">Filtrar clientes VIPs</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 shrink-0">
            <TrendingUp size={20} />
          </div>
        </button>

        <button 
          type="button"
          onClick={() => { setFilterTier('debtor'); setSortBy('debt'); }}
          title="Clique para filtrar imediatamente todos com pendências (Fiado)"
          className={`text-left bg-white border p-6 rounded-[2rem] flex items-center justify-between shadow-sm transition-all cursor-pointer hover:scale-[1.01] active:scale-95 ${
            filterTier === 'debtor' 
              ? 'ring-2 ring-red-500 border-red-500 bg-red-50/50 shadow-md' 
              : 'border-slate-200 hover:border-red-200'
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-[10px] text-red-600 font-black uppercase tracking-widest flex items-center gap-1">
                <AlertCircle size={12} /> Pendências (Fiado)
              </p>
              {filterTier === 'debtor' && (
                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              )}
            </div>
            <h3 className="text-2xl font-black text-red-600">R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
            <p className="text-[10px] text-red-600 font-black mt-1 uppercase tracking-wider flex items-center gap-0.5">
              <span>⚡ Clique para listar devedores</span>
            </p>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center border border-red-100 shrink-0">
            <AlertCircle size={20} />
          </div>
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input 
            type="text"
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Segment/Tier Filter */}
          <div className="relative">
            <select 
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-5 pr-12 py-3.5 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all outline-none cursor-pointer shadow-sm"
            >
              <option value="all">Segmento: Todos</option>
              <option value="vvip">💎 VIPs (&gt; R$300)</option>
              <option value="debtor">⚠️ Com Pendências (Fiado)</option>
              <option value="new">✨ Novos (Últimos 30d)</option>
              <option value="loyalty">🎁 Fidelidade & Cashback</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
          </div>

          {/* Sort Selection */}
          <div className="relative">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-5 pr-12 py-3.5 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all outline-none cursor-pointer shadow-sm"
            >
              <option value="nome">Nome (A-Z)</option>
              <option value="spent">Maior Gasto</option>
              <option value="balance">Mais Pontos (Fidelidade)</option>
              <option value="debt">Maior Dívida</option>
              <option value="recent">Recentes</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Loader2 className="animate-spin text-accent" size={48} />
          <p className="text-muted font-bold animate-pulse">Carregando base estratégica...</p>
        </div>
      ) : filteredAndSortedCustomers.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-[2.5rem] py-24 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-50 rounded-3xl mb-6 shadow-inner border border-slate-100">
            <UserIcon className="text-slate-300" size={40} />
          </div>
          <h3 className="text-xl font-black text-primary mb-2 tracking-tight">Nenhum cliente encontrado</h3>
          <p className="text-muted text-sm max-w-xs mx-auto font-medium">Tente ajustar sua busca ou cadastre um novo cliente para começar a gerenciar sua base.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sub-abas de Ativos / Inativos */}
          <div className="flex border border-slate-200 bg-slate-50 p-1.5 rounded-[2rem] shadow-sm gap-1">
            <button
              type="button"
              onClick={() => {
                setFilterStatus('all');
                setCurrentPage(1);
              }}
              className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                filterStatus === 'all'
                  ? 'bg-white text-primary shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <span>Todos</span>
              <span className="bg-slate-200/80 text-slate-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-bold">
                {customers.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('active');
                setCurrentPage(1);
              }}
              className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                filterStatus === 'active'
                  ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span>Ativos</span>
              <span className="bg-emerald-50 text-emerald-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-bold">
                {customers.filter(c => c.ativo !== false).length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterStatus('inactive');
                setCurrentPage(1);
              }}
              className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                filterStatus === 'inactive'
                  ? 'bg-white text-rose-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
              <span>Inativos</span>
              <span className="bg-rose-50 text-rose-700 font-mono text-[10px] px-2 py-0.5 rounded-md font-bold">
                {customers.filter(c => c.ativo === false).length}
              </span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto md:table-fixed">
                <thead>
                  <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    <th 
                      onClick={() => handleHeaderSort('nome')} 
                      className="py-3.5 px-4 md:px-5 cursor-pointer hover:bg-slate-100/70 hover:text-primary transition-colors select-none group w-auto md:w-[32%]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={sortBy === 'nome' ? 'text-primary font-black' : ''}>Cliente</span>
                        {renderSortIcon('nome')}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleHeaderSort('phone')} 
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/70 hover:text-primary transition-colors select-none group w-auto md:w-[26%]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={sortBy === 'phone' ? 'text-primary font-black' : ''}>Contato & WhatsApp</span>
                        {renderSortIcon('phone')}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleHeaderSort('balance')} 
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/70 hover:text-primary transition-colors select-none group w-auto md:w-[20%]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={sortBy === 'balance' ? 'text-primary font-black' : ''}>Fidelidade / Cashback</span>
                        {renderSortIcon('balance')}
                      </div>
                    </th>

                    <th 
                      onClick={() => handleHeaderSort('debt')} 
                      className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/70 hover:text-primary transition-colors select-none group w-auto md:w-[12%]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={sortBy === 'debt' ? 'text-primary font-black' : ''}>Fiado / Status</span>
                        {renderSortIcon('debt')}
                      </div>
                    </th>

                    <th className="py-3.5 px-4 text-right w-auto md:w-[10%]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCustomers.map((customer, index) => (
                    <CustomerTableRow
                      key={`customer-row-${customer.uid || index}-${index}`}
                      customer={customer}
                      loyaltyConfig={loyaltyConfig}
                      onViewDetails={() => handleViewDetails(customer)}
                      onEdit={() => handleEditCustomer(customer)}
                      onLinkAccount={() => handleLinkAccount(customer)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 px-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-bold text-slate-500">
                Exibindo <span className="font-mono text-primary font-black">{startIndex + 1}</span> a{' '}
                <span className="font-mono text-primary font-black">
                  {Math.min(startIndex + itemsPerPage, filteredAndSortedCustomers.length)}
                </span>{' '}
                de <span className="font-mono text-primary font-black">{filteredAndSortedCustomers.length}</span> clientes
              </p>
              
              <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <span className="text-[11px] font-semibold text-slate-400">Por página:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 shadow-sm cursor-pointer"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                  title="Página Anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="text-xs font-black text-slate-700 px-3.5 py-2 bg-slate-100 rounded-xl border border-slate-200/50">
                  Página <span className="font-mono text-primary">{safePage}</span> de <span className="font-mono">{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={safePage === totalPages}
                  className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                  title="Próxima Página"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {isFormOpen && (
          <CustomerForm 
            customer={editingCustomer} 
            onClose={() => setIsFormOpen(false)} 
          />
        )}
        {isDetailsOpen && selectedCustomer && (
          <CustomerDetails 
            customer={customers.find(c => c.uid === selectedCustomer.uid) || selectedCustomer} 
            onClose={() => setIsDetailsOpen(false)}
            onEdit={() => {
              setIsDetailsOpen(false);
              handleEditCustomer(selectedCustomer);
            }}
            onLinkAccount={() => {
              setIsDetailsOpen(false);
              handleLinkAccount(selectedCustomer);
            }}
          />
        )}
        {isLinkingOpen && linkingCustomer && (
          <LinkingModal 
            customer={linkingCustomer} 
            tenantId={tenantId}
            onClose={() => setIsLinkingOpen(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface CustomerCardProps {
  customer: UserProfile;
  loyaltyConfig?: LoyaltyConfig | null;
  onViewDetails: () => void;
  onEdit: () => void;
  onLinkAccount: () => void;
  key?: React.Key;
}

function CustomerTableRow({ customer, loyaltyConfig, onViewDetails, onEdit, onLinkAccount }: CustomerCardProps) {
  const saldo = customer.saldo_atual ?? customer.balance ?? 0;
  const emAberto = customer.total_em_aberto ?? 0;
  const telefone = customer.telefone || customer.phone || '';
  const cleanPhone = telefone.replace(/\D/g, '');
  const totalSpent = customer.total_gasto || customer.totalSpent || 0;

  const isVvip = totalSpent > 300;
  const isNew = (() => {
    if (customer.createdAt) {
      let createdDate: Date | null = null;
      if (typeof (customer.createdAt as any).toDate === 'function') {
        createdDate = (customer.createdAt as any).toDate();
      } else if ((customer.createdAt as any).seconds) {
        createdDate = new Date((customer.createdAt as any).seconds * 1000);
      } else if (typeof customer.createdAt === 'string') {
        createdDate = new Date(customer.createdAt);
      }
      if (createdDate) {
        const diffDays = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 30;
      }
    }
    return false;
  })();

  const formatLastVisit = (lastVisit?: string) => {
    if (!lastVisit) return 'Sem visitas';
    try {
      const parts = lastVisit.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return lastVisit;
    } catch {
      return 'Sem visitas';
    }
  };

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors group">
      {/* Cliente */}
      <td className="py-3 px-3.5 md:px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-accent font-black text-sm border border-slate-200/60 shadow-inner group-hover:bg-accent/10 transition-colors shrink-0">
            {customer.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span 
                onClick={onViewDetails} 
                className="font-black text-primary group-hover:text-accent transition-colors cursor-pointer truncate text-sm"
              >
                {customer.nome}
              </span>
            </div>
            {customer.lastVisit && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold mt-0.5">
                <Calendar size={10} className="shrink-0" />
                <span>Última visita: {formatLastVisit(customer.lastVisit)}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {isVvip && (
                <span className="text-[9px] font-black bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">
                  💎 VIP
                </span>
              )}
              {isNew && (
                <span className="text-[9px] font-black bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                  ✨ Novo
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Contato & WhatsApp */}
      <td className="py-3 px-3.5 md:px-4">
        <div className="space-y-0.5 text-xs font-semibold text-slate-600">
          {telefone ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-700 font-bold">{telefone}</span>
              {cleanPhone && (
                <a 
                  href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá, ${customer.nome}! Tudo bem?`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Chamar no WhatsApp"
                  className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-md transition-all flex items-center gap-1 text-[10px] font-bold border border-emerald-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageCircle size={11} />
                  <span>Whats</span>
                </a>
              )}
            </div>
          ) : (
            <span className="text-slate-300 italic text-[11px]">Sem telefone</span>
          )}
          {customer.email ? (
            <div className="flex items-center gap-1 text-slate-400 text-[11px] truncate max-w-[170px]">
              <Mail size={11} className="shrink-0" />
              <span className="truncate">{customer.email}</span>
            </div>
          ) : null}
        </div>
      </td>

      {/* Fidelidade / Cashback */}
      <td className="py-3 px-3.5 md:px-4">
        <div>
          {loyaltyConfig?.cashbackEnabled === false ? (
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Desativado</span>
          ) : loyaltyConfig?.loyaltyMode === 'saldo' ? (
            <span className="text-xs font-black text-emerald-600 font-mono flex items-center gap-1">
              💰 R$ {(customer.cashback ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          ) : (
            <span className="text-xs font-black text-amber-500 font-mono flex items-center gap-1">
              ⭐ {customer.pontos ?? customer.points ?? 0} pts
            </span>
          )}
        </div>
      </td>

      {/* Fiado / Status */}
      <td className="py-3 px-3.5 md:px-4">
        <div className="space-y-1">
          {emAberto > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-50 text-red-700 border border-red-100">
              ⚠️ R$ {emAberto.toFixed(2)}
            </span>
          ) : customer.bloqueadoParaAgendar ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100">
              Bloqueado
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${customer.ativo ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>

              Regular
            </span>
          )}
        </div>
      </td>

      {/* Ações */}
      <td className="py-3 px-3.5 md:px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={onViewDetails}
            className="px-3.5 py-1.5 bg-accent/10 hover:bg-accent hover:text-white text-accent rounded-xl text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 shadow-sm border border-accent/20"
            title="Ver Ficha Completa do Cliente"
          >
            <span>Ficha</span>
            <ArrowRight size={14} />
          </button>
          {isCustomerLinked(customer) ? (
            <button 
              type="button"
              onClick={onLinkAccount}
              title="Cliente Já Vinculado (Conta Ativa)"
              className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-200 flex items-center gap-1 font-bold text-xs"
            >
              <CheckCircle2 size={16} className="text-emerald-600" />
            </button>
          ) : (
            <button 
              type="button"
              onClick={onLinkAccount}
              title="Vincular Conta / Enviar Convite"
              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
            >
              <Link2 size={16} />
            </button>
          )}
          <button 
            type="button"
            onClick={onEdit}
            title="Editar Cadastro"
            className="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-xl transition-all"
          >
            <Edit2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CustomerCard({ customer, onViewDetails, onEdit, onLinkAccount }: CustomerCardProps) {
  // Garantir valores para exibição usando campos novos ou legados
  const saldo = customer.saldo_atual ?? customer.balance ?? 0;
  const emAberto = customer.total_em_aberto ?? 0;
  const telefone = customer.telefone || customer.phone || 'Sem telefone';
  const cleanPhone = telefone.replace(/\D/g, '');

  const isVvip = (customer.total_gasto || customer.totalSpent || 0) > 300;
  const isNew = (() => {
    if (customer.createdAt) {
      let createdDate: Date | null = null;
      if (typeof (customer.createdAt as any).toDate === 'function') {
        createdDate = (customer.createdAt as any).toDate();
      } else if ((customer.createdAt as any).seconds) {
        createdDate = new Date((customer.createdAt as any).seconds * 1000);
      } else if (typeof customer.createdAt === 'string') {
        createdDate = new Date(customer.createdAt);
      }
      if (createdDate) {
        const diffDays = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 30;
      }
    }
    return false;
  })();

  const formatLastVisit = (lastVisit?: string) => {
    if (!lastVisit) return 'Sem visitas';
    try {
      const parts = lastVisit.split('T')[0].split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return lastVisit;
    } catch {
      return 'Sem visitas';
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:border-accent/30 transition-all group relative overflow-hidden shadow-sm flex flex-col"
    >
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-accent font-black text-xl border border-slate-100 shadow-inner group-hover:bg-accent/5 transition-colors">
            {customer.nome.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-black text-primary group-hover:text-accent transition-colors truncate max-w-[160px] tracking-tight">
              {customer.nome}
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {isVvip && (
                <span className="text-[9px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md border border-purple-100 uppercase tracking-normal">
                  💎 VIP
                </span>
              )}
              {isNew && (
                <span className="text-[9px] font-black bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-normal">
                  ✨ Novo
                </span>
              )}
              {emAberto > 0 && (
                <span className="text-[9px] font-black bg-red-50 text-red-700 px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-normal animate-pulse">
                  ⚠️ Fiado
                </span>
              )}
              {customer.bloqueadoParaAgendar && (
                <span className="text-[9px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-100 uppercase tracking-normal">
                  🚫 Bloqueado
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isCustomerLinked(customer) ? (
            <button 
              type="button"
              onClick={onLinkAccount}
              title="Cliente Já Vinculado (Conta Ativa)"
              className="p-2 text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all border border-emerald-200"
            >
              <CheckCircle2 size={18} className="text-emerald-600" />
            </button>
          ) : (
            <button 
              type="button"
              onClick={onLinkAccount}
              title="Vincular Conta / Enviar Convite"
              className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
            >
              <Link2 size={18} />
            </button>
          )}
          <button 
            type="button"
            onClick={onEdit}
            className="p-2 text-slate-300 hover:text-primary hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100"
          >
            <Edit2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-xs text-muted font-bold">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
              <Phone size={14} className="text-slate-400" />
            </div>
            <span>{telefone}</span>
          </div>
          {cleanPhone && (
            <a 
              href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá, ${customer.nome}! Tudo bem?`)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir WhatsApp"
              className="p-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-lg transition-all flex items-center gap-1 text-[11px] font-bold border border-emerald-200"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle size={14} />
              <span>WhatsApp</span>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted font-bold">
          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
            <Calendar size={14} className="text-slate-400" />
          </div>
          <span>Última visita: <strong className="text-slate-700">{formatLastVisit(customer.lastVisit)}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50 mt-auto">
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[10px] text-muted uppercase font-black tracking-widest mb-1">Dívidas</p>
          <p className={`text-sm font-black ${emAberto > 0 ? 'text-red-700' : 'text-slate-400'}`}>
            R$ {emAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[10px] text-muted uppercase font-black tracking-widest mb-1">Saldo Líquido</p>
          <p className={`text-sm font-black ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <button 
        onClick={onViewDetails}
        className="w-full mt-5 py-3.5 bg-accent/10 hover:bg-accent text-accent hover:text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 uppercase tracking-wider border border-accent/20"
      >
        <span>Abrir Ficha Completa</span>
        <ArrowRight size={16} />
      </button>
    </motion.div>
  );
}

function CustomerForm({ customer, onClose }: { customer: UserProfile | null, onClose: () => void }) {
  const [formData, setFormData] = useState({
    nome: customer?.nome || '',
    email: customer?.email || '',
    cpf: customer?.cpf || (customer as any)?.cpfCnpj || '',
    telefone: customer?.telefone || customer?.phone || '',
    birthDate: customer?.birthDate || '',
    address: customer?.address || '',
    observacoes: customer?.observacoes || customer?.observations || '',
    preferences: customer?.preferences || '',
    ativo: customer?.ativo !== undefined ? customer.ativo : true,
    bloqueadoParaAgendar: customer?.bloqueadoParaAgendar || false
  });

  const { execute: handleSubmit, isLoading: isSaving } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.email && formData.email.trim() && !formData.email.includes('@')) {
      toast.error("O formato do E-mail é inválido.");
      return;
    }

    const cleanCpf = (formData.cpf || '').replace(/\D/g, '');
    if (cleanCpf && cleanCpf.length !== 11) {
      toast.error("O CPF deve conter exatamente 11 dígitos numéricos.");
      return;
    }

    try {
      if (customer) {
        await userService.updateUserProfile(customer.uid, {
          ...formData,
          cpf: cleanCpf || null,
          cpfCnpj: cleanCpf || null
        });
        toast.success("Cliente atualizado com sucesso!");
      } else {
        await userService.createUser({
          ...formData,
          cpf: cleanCpf || null,
          cpfCnpj: cleanCpf || null,
          tipo: 'cliente',
          saldo_atual: 0,
          total_gasto: 0,
          total_pago: 0,
          total_em_aberto: 0
        });
        toast.success("Cliente cadastrado com sucesso!");
      }
      onClose();
    } catch (error) {
      console.error("Error saving customer:", error);
      toast.error("Erro ao salvar cadastro.");
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
          <h2 className="text-2xl font-black text-primary tracking-tight">
            {customer ? 'Editar Cliente' : 'Novo Cliente'}
          </h2>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nome Completo *</label>
              <input 
                type="text"
                required
                value={formData.nome}
                onChange={(e) => setFormData({...formData, nome: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="Nome do cliente"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-mail (Opcional - Necessário para Assinaturas)</label>
              <input 
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">CPF (Opcional - Necessário para Assinaturas)</label>
              <input 
                type="text"
                maxLength={14}
                value={formData.cpf}
                onChange={(e) => setFormData({...formData, cpf: formatCpfMask(e.target.value)})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner font-mono"
                placeholder="000.000.000-00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Telefone / WhatsApp (Opcional)</label>
              <input 
                type="tel"
                value={formData.telefone}
                onChange={(e) => setFormData({...formData, telefone: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Data de Nascimento</label>
              <input 
                type="date"
                value={formData.birthDate}
                onChange={(e) => setFormData({...formData, birthDate: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Endereço</label>
            <input 
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
              placeholder="Rua, número, bairro..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Preferências</label>
              <textarea 
                value={formData.preferences}
                onChange={(e) => setFormData({...formData, preferences: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary min-h-[120px] resize-none shadow-inner"
                placeholder="Ex: Gosta de café, prefere corte com tesoura, etc."
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Observações Internas</label>
              <textarea 
                value={formData.observacoes}
                onChange={(e) => setFormData({...formData, observacoes: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary min-h-[120px] resize-none shadow-inner"
                placeholder="Informações estratégicas para a equipe."
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
            <label className="text-sm font-black text-primary uppercase tracking-tight">Status do Cliente:</label>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setFormData({...formData, ativo: true})}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${formData.ativo ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-muted'}`}
              >
                <UserCheck size={14} />
                Ativo
              </button>
              <button 
                type="button"
                onClick={() => setFormData({...formData, ativo: false})}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${!formData.ativo ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-muted'}`}
              >
                <UserX size={14} />
                Inativo
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
            <div className="space-y-0.5">
              <label className="text-sm font-black text-primary uppercase tracking-tight">Agendamento pelo App:</label>
              <p className="text-[10px] text-slate-400 font-semibold leading-none">Se bloqueado, o cliente não conseguirá agendar pelo app.</p>
            </div>
            <div className="flex gap-3">
              <button 
                type="button"
                onClick={() => setFormData({...formData, bloqueadoParaAgendar: false})}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${!formData.bloqueadoParaAgendar ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-muted'}`}
              >
                <UserCheck size={14} />
                Permitido
              </button>
              <button 
                type="button"
                onClick={() => setFormData({...formData, bloqueadoParaAgendar: true})}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm ${formData.bloqueadoParaAgendar ? 'bg-rose-600 text-white' : 'bg-white border border-slate-200 text-muted'}`}
              >
                <UserX size={14} />
                Bloqueado
              </button>
            </div>
          </div>

          <div className="pt-6 flex gap-4 sticky bottom-0 bg-surface py-6 border-t border-border">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-sm text-muted hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="flex-[2] py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-3 active:scale-95"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : (customer ? 'Salvar Alterações' : 'Cadastrar Cliente')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function CustomerDetails({ customer, onClose, onEdit, onLinkAccount }: { customer: UserProfile, onClose: () => void, onEdit: () => void, onLinkAccount?: () => void }) {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [dontAddToCash, setDontAddToCash] = useState(false);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [debts, setDebts] = useState<ClientDebt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingDebts, setLoadingDebts] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'debts' | 'notes'>('history');
  const [showPrintStatement, setShowPrintStatement] = useState(false);
  
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean; debt: ClientDebt | null }>({ isOpen: false, debt: null });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('dinheiro');

  // Manual Debt Form states
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtAmount, setDebtAmount] = useState('');
  const [debtDescription, setDebtDescription] = useState('');
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingDebt, setSubmittingDebt] = useState(false);

  // Prepayment Credit Form states
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMethod, setCreditMethod] = useState<'dinheiro' | 'pix' | 'debito' | 'credito'>('pix');
  const [submittingCredit, setSubmittingCredit] = useState(false);

  // Technical notes states
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Loyalty / Points adjustment form states
  const [showLoyaltyForm, setShowLoyaltyForm] = useState(false);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  const [loyaltyType, setLoyaltyType] = useState<'points' | 'cashback'>('points');
  const [loyaltyAction, setLoyaltyAction] = useState<'add' | 'remove' | 'set'>('add');
  const [loyaltyValue, setLoyaltyValue] = useState('');
  const [loyaltyDescription, setLoyaltyDescription] = useState('');
  const [submittingLoyalty, setSubmittingLoyalty] = useState(false);

  useEffect(() => {
    loyaltyService.getConfig().then(cfg => {
      setLoyaltyConfig(cfg);
      if (cfg?.loyaltyMode === 'saldo') {
        setLoyaltyType('cashback');
      } else {
        setLoyaltyType('points');
      }
    }).catch(err => console.error("Error loading loyalty config in modal:", err));
  }, [tenantId]);

  useEffect(() => {
    const q = query(
      collection(db, 'appointments'),
      where('cliente_id', '==', customer.uid),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      docs.sort((a, b) => {
        const dateA = String(a.date || '');
        const dateB = String(b.date || '');
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return String(b.startTime || '').localeCompare(String(a.startTime || ''));
      });
      setHistory(docs);
      setLoadingHistory(false);
    }, (error) => {
      console.error("Error fetching history:", error);
      setLoadingHistory(false);
    });

    // Fetch Debts
    const qDebts = query(
      collection(db, 'client_debts'),
      where('cliente_id', '==', customer.uid)
    );

    const unsubscribeDebts = onSnapshot(qDebts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
      docs.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setDebts(docs);
      setLoadingDebts(false);
    }, (error) => {
      console.error("Error fetching debts:", error);
      setLoadingDebts(false);
    });

    // Fetch Debt Payments
    const qPayments = query(
      collection(db, 'debt_payments'),
      where('cliente_id', '==', customer.uid)
    );

    const unsubscribePayments = onSnapshot(qPayments, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DebtPayment));
      setPayments(docs);
      setLoadingPayments(false);
    }, (error) => {
      console.error("Error fetching debt payments:", error);
      setLoadingPayments(false);
    });

    // Fetch Technical Notes
    const qNotes = query(
      collection(db, 'usuarios', customer.uid, 'anotacoes'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNotes = onSnapshot(qNotes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotes(docs);
      setLoadingNotes(false);
    }, (error) => {
      console.error("Error fetching notes:", error);
      setLoadingNotes(false);
    });

    return () => {
      unsubscribe();
      unsubscribeDebts();
      unsubscribePayments();
      unsubscribeNotes();
    };
  }, [customer.uid]);

  const { execute: handlePayDebt, isLoading: isPayingDebt } = useAsyncAction(async () => {
    if (!user || !paymentModal.debt) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0 || amount > paymentModal.debt.remainingAmount) {
      toast.error("Valor inválido");
      return;
    }

    try {
      await comandaService.payDebt(paymentModal.debt.id, amount, paymentMethod, '', user.uid, user.displayName || 'Admin');
      toast.success("Pagamento registrado com sucesso!");
      setPaymentModal({ isOpen: false, debt: null });
      setPaymentAmount('');
    } catch (error) {
      console.error("Erro ao pagar dívida:", error);
      toast.error("Erro ao registrar pagamento");
    }
  });

  const handleAddManualDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(debtAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Informe um valor de fiado válido!');
      return;
    }
    if (!debtDescription.trim()) {
      toast.error('Informe a descrição do fiado!');
      return;
    }
    setSubmittingDebt(true);
    try {
      const debtRef = collection(db, 'client_debts');
      const newDebtId = doc(debtRef).id;

      await setDoc(doc(db, 'client_debts', newDebtId), {
        id: newDebtId,
        cliente_id: customer.uid,
        cliente_name: customer.nome,
        amount: amt,
        remainingAmount: amt,
        status: 'pendente',
        description: debtDescription.trim(),
        date: debtDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const currentBal = customer.saldo_atual ?? customer.balance ?? 0;
      const newBal = currentBal - amt;

      const clientRef = doc(db, 'usuarios', customer.uid);
      await updateDoc(clientRef, {
        total_em_aberto: increment(amt),
        saldo_atual: newBal,
        balance: newBal,
        updatedAt: serverTimestamp()
      });

      toast.success('Fiado registrado com sucesso!');
      setDebtAmount('');
      setDebtDescription('');
      setShowDebtForm(false);
    } catch (err) {
      console.error("Erro ao salvar dívida manual:", err);
      toast.error('Erro ao registrar fiado.');
    } finally {
      setSubmittingDebt(false);
    }
  };

  const handleAddCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(creditAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Informe um valor de crédito válido!');
      return;
    }
    setSubmittingCredit(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch pending debts to be paid off
      const qDebts = query(
        collection(db, 'client_debts'),
        where('cliente_id', '==', customer.uid),
        where('status', 'in', ['pendente', 'parcial'])
      );
      const debtsSnap = await getDocs(qDebts);
      const pendingDebts = debtsSnap.docs.map(doc => ({ 
        id: doc.id, 
        ref: doc.ref, 
        ...doc.data() 
      } as ClientDebt & { ref: any }));

      // Sort oldest first
      pendingDebts.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tA - tB;
      });

      // 2. Query open/reopened cash session if not skipping cash registration
      let cashDoc = null;
      if (!dontAddToCash) {
        const cashQuery = query(
          collection(db, 'cash_sessions'),
          where('tenantId', '==', tenantId),
          where('status', 'in', ['open', 'reopened'])
        );
        const cashDocs = await getDocs(cashQuery);
        if (!cashDocs.empty) {
          const sortedDocs = [...cashDocs.docs].sort((a, b) => {
            const tA = a.data().openedAt?.seconds || 0;
            const tB = b.data().openedAt?.seconds || 0;
            return tB - tA;
          });
          cashDoc = sortedDocs[0];
        }
      }

      const clientRef = doc(db, 'usuarios', customer.uid);
      let totalDebtPaidOuter = 0;

      await runTransaction(db, async (transaction) => {
        // Reads first
        const clientSnap = await transaction.get(clientRef);
        const clientData = clientSnap.exists() ? clientSnap.data() : {};
        const currentBal = clientData.saldo_atual ?? clientData.balance ?? 0;
        const currentEmAberto = clientData.total_em_aberto ?? clientData.saldo_devedor ?? 0;

        // Fetch latest state for debts in transaction
        const latestDebts = [];
        for (const debt of pendingDebts) {
          const latestDebtSnap = await transaction.get(debt.ref);
          if (latestDebtSnap.exists()) {
            latestDebts.push({
              ...debt,
              ...latestDebtSnap.data() as ClientDebt
            });
          }
        }

        let remainingPayment = amt;
        totalDebtPaidOuter = 0;

        // Process payments against pending debts
        for (const debt of latestDebts) {
          if (remainingPayment <= 0.001) break;
          const currentDebtRemaining = debt.remainingAmount;
          if (currentDebtRemaining <= 0) continue;

          const paymentToThisDebt = Math.min(remainingPayment, currentDebtRemaining);
          remainingPayment -= paymentToThisDebt;
          totalDebtPaidOuter += paymentToThisDebt;

          // Update individual debt
          transaction.update(debt.ref, {
            remainingAmount: currentDebtRemaining - paymentToThisDebt,
            status: (currentDebtRemaining - paymentToThisDebt) <= 0.001 ? 'pago' : 'parcial',
            updatedAt: serverTimestamp()
          });

          // Create payment record inside transaction
          const pRef = doc(collection(db, 'debt_payments'));
          transaction.set(pRef, {
            id: pRef.id,
            cliente_id: customer.uid,
            divida_id: debt.id,
            amount: paymentToThisDebt,
            paymentMethod: creditMethod,
            date: today,
            createdAt: serverTimestamp(),
            is_deposit: false,
            description: `Abatimento parcial/total de débito: ${debt.description || ''}`
          });
        }

        // If there is any remaining payment left, record it as a prepayment deposit
        if (remainingPayment > 0.001) {
          const depositRef = doc(collection(db, 'debt_payments'));
          transaction.set(depositRef, {
            id: depositRef.id,
            cliente_id: customer.uid,
            amount: remainingPayment,
            paymentMethod: creditMethod,
            date: today,
            createdAt: serverTimestamp(),
            is_deposit: true,
            description: 'Adição de crédito pré-pago (Sobra/Saldo)'
          });
        }

        // Update Client profile
        const newBal = currentBal + amt;
        const newEmAberto = Math.max(0, currentEmAberto - totalDebtPaidOuter);

        transaction.update(clientRef, {
          saldo_atual: newBal,
          balance: newBal,
          total_pago: increment(amt),
          totalPaid: increment(amt),
          total_em_aberto: newEmAberto,
          saldo_devedor: newEmAberto,
          updatedAt: serverTimestamp()
        });

        // Add to Cash / Caixa if requested
        if (!dontAddToCash && cashDoc) {
          const caixa_id = cashDoc.id;
          const movementRef = doc(collection(db, 'cash_movements'));
          transaction.set(movementRef, {
            id: movementRef.id,
            tenantId,
            caixa_id,
            type: 'income',
            category: totalDebtPaidOuter > 0 ? 'Recebimento de Dívida' : 'Adição de Crédito',
            description: totalDebtPaidOuter > 0 
              ? `Recebimento Dívida - ${customer.nome}` 
              : `Adição de Crédito - ${customer.nome}`,
            amount: amt,
            paymentMethod: creditMethod,
            is_receivable: false,
            referencia_id: customer.uid,
            usuario_id: user?.uid || '',
            usuario_name: user?.displayName || 'Admin',
            date: today,
            createdAt: serverTimestamp()
          });

          const cashRef = doc(db, 'cash_sessions', caixa_id);
          transaction.update(cashRef, {
            total_income: increment(amt),
            totalIncome: increment(amt),
            expected_balance: increment(amt),
            expectedBalance: increment(amt),
            updatedAt: serverTimestamp()
          });
        }

        // Financial accounting (for Dashboard)
        if (!dontAddToCash) {
          const finRef = doc(collection(db, 'financial_transactions'));
          transaction.set(finRef, {
            id: finRef.id,
            tenantId,
            type: 'income',
            status: 'pago',
            category: totalDebtPaidOuter > 0 ? 'Recebimento Fiado' : 'Crédito Cliente',
            amount: amt,
            description: totalDebtPaidOuter > 0 
              ? `Recebimento Fiado - ${customer.nome}` 
              : `Adição de Crédito - ${customer.nome}`,
            date: today,
            paymentMethod: creditMethod,
            cliente_id: customer.uid,
            cliente_name: customer.nome,
            created_at: serverTimestamp(),
            createdAt: serverTimestamp()
          });
        }
      });

      toast.success(
        totalDebtPaidOuter > 0 
          ? `Lançamento de R$ ${amt.toFixed(2)} registrado! Dívida de R$ ${totalDebtPaidOuter.toFixed(2)} quitada/abatida.`
          : `Crédito de R$ ${amt.toFixed(2)} adicionado!`
      );
      setCreditAmount('');
      setShowCreditForm(false);
      setDontAddToCash(false); // Reset checkbox
    } catch (err) {
      console.error("Erro ao depositar crédito:", err);
      toast.error('Erro ao adicionar crédito.');
    } finally {
      setSubmittingCredit(false);
    }
  };

  const handleAddTechnicalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const notesRef = collection(db, 'usuarios', customer.uid, 'anotacoes');
      await addDoc(notesRef, {
        content: newNoteText.trim(),
        authorName: user?.displayName || 'Profissional',
        createdAt: serverTimestamp()
      });
      setNewNoteText('');
      toast.success('Anotação técnica salva!');
    } catch (err) {
      console.error("Erro ao salvar anotação técnica:", err);
      toast.error('Erro ao registrar anotação.');
    } finally {
      setSavingNote(false);
    }
  };

  const [isTogglingBlock, setIsTogglingBlock] = useState(false);

  const handleToggleBlock = async () => {
    const newBlockedState = !customer.bloqueadoParaAgendar;
    const actionText = newBlockedState ? 'bloquear os agendamentos pelo app de' : 'liberar os agendamentos de';
    
    if (window.confirm(`Tem certeza que deseja ${actionText} ${customer.nome}?`)) {
      setIsTogglingBlock(true);
      try {
        await userService.updateUserProfile(customer.uid, {
          bloqueadoParaAgendar: newBlockedState
        });
        toast.success(newBlockedState 
          ? `Cliente ${customer.nome} bloqueado para novos agendamentos!` 
          : `Agendamentos do cliente ${customer.nome} liberados com sucesso!`
        );
      } catch (err) {
        console.error("Erro ao alterar permissão de agendamento:", err);
        toast.error("Erro ao atualizar status do cliente.");
      } finally {
        setIsTogglingBlock(false);
      }
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Deseja realmente excluir permanentemente o cliente ${customer.nome}? Esta ação não pode ser desfeita.`)) {
      try {
        await deleteDoc(doc(db, 'usuarios', customer.uid));
        toast.success("Cliente excluído permanentemente da nuvem!");
        onClose();
      } catch (err) {
        console.error("Erro ao excluir cliente:", err);
        toast.error("Erro ao excluir cliente.");
      }
    }
  };

  const handleAdjustLoyalty = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(loyaltyValue);
    if (isNaN(val) || val < 0) {
      toast.error('Informe um valor válido!');
      return;
    }
    if (!loyaltyDescription.trim()) {
      toast.error('Informe a descrição/motivo do ajuste!');
      return;
    }
    setSubmittingLoyalty(true);
    try {
      await loyaltyService.manualAdjustPoints(
        customer.uid,
        loyaltyAction,
        loyaltyType,
        val,
        loyaltyDescription.trim()
      );
      toast.success('Fidelidade ajustada com sucesso!');
      setLoyaltyValue('');
      setLoyaltyDescription('');
      setShowLoyaltyForm(false);
    } catch (error) {
      console.error("Erro ao ajustar fidelidade:", error);
      toast.error('Erro ao ajustar os pontos/cashback.');
    } finally {
      setSubmittingLoyalty(false);
    }
  };

  const handleWhatsApp = () => {
    const rawPhone = customer.telefone || customer.phone || '';
    const phoneClean = rawPhone.replace(/\D/g, '');
    if (!phoneClean) {
      toast.error("Telefone não cadastrado.");
      return;
    }
    const msg = encodeURIComponent(`Olá, ${customer.nome}! Tudo bem? Gostaria de agendar o seu próximo horário conosco na BarberElite?`);
    window.open(`https://api.whatsapp.com/send?phone=55${phoneClean}&text=${msg}`, '_blank');
  };

  // Cálculos dinâmicos com base nos atendimentos
  const atendimentosConcluidos = history.filter(a => a.status === 'concluído' || a.status === 'completed');
  const totalAgendamentos = history.length;
  const quantidadeServicos = atendimentosConcluidos.length;
  
  const totalGastoReal = atendimentosConcluidos.reduce((sum, item) => sum + (item.price || item.valor || 0), 0);
  const totalGastoFinal = customer.total_gasto || customer.totalSpent || totalGastoReal;

  // Serviço mais realizado
  const serviceCounts: Record<string, number> = {};
  atendimentosConcluidos.forEach(a => {
    const name = a.serviceName || a.servico_name || 'Corte';
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  });
  let maisServicoFeito = 'Nenhum';
  let maxSCount = 0;
  Object.entries(serviceCounts).forEach(([name, count]) => {
    if (count > maxSCount) {
      maxSCount = count;
      maisServicoFeito = `${name} (${count}x)`;
    }
  });

  // Profissional favorito (mais atendido)
  const profCounts: Record<string, number> = {};
  atendimentosConcluidos.forEach(a => {
    const name = a.profissional_name || 'Não informado';
    profCounts[name] = (profCounts[name] || 0) + 1;
  });
  let profissionalMaisAtendido = 'Nenhum';
  let maxPCount = 0;
  Object.entries(profCounts).forEach(([name, count]) => {
    if (count > maxPCount) {
      maxPCount = count;
      profissionalMaisAtendido = `${name} (${count}x)`;
    }
  });

  // Login do Usuário se possui ou não (vinculado com senha ativada)
  const temLogin = isCustomerLinked(customer);
  // Fidelidade se está ativado
  const pontosFidelidade = customer.pontos ?? customer.points ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm overflow-hidden">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-surface border-l border-border w-full max-w-xl h-screen max-h-screen overflow-y-auto flex flex-col custom-scrollbar shadow-2xl relative"
      >
        <div className="p-6 border-b border-border flex flex-wrap items-center justify-between gap-4 sticky top-0 bg-surface/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2.5 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
              <X size={20} />
            </button>
            <h2 className="text-xl font-black text-primary tracking-tight">Ficha do Cliente</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={handleToggleBlock}
              disabled={isTogglingBlock}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs transition-all border shadow-sm active:scale-95 ${
                customer.bloqueadoParaAgendar 
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'
              }`}
              title={customer.bloqueadoParaAgendar ? "Desbloquear agendamentos pelo app" : "Bloquear cliente para agendamentos"}
            >
              {isTogglingBlock ? (
                <Loader2 size={15} className="animate-spin" />
              ) : customer.bloqueadoParaAgendar ? (
                <>
                  <ShieldCheck size={15} />
                  <span>DESBLOQUEAR</span>
                </>
              ) : (
                <>
                  <Ban size={15} />
                  <span>BLOQUEAR</span>
                </>
              )}
            </button>
            <button 
              onClick={onEdit}
              className="flex items-center gap-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 px-3.5 py-2 rounded-xl font-black text-xs transition-all border border-amber-100 active:scale-95"
            >
              <Edit2 size={15} />
              <span>EDITAR</span>
            </button>
            <button 
              onClick={handleDelete}
              className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 px-3.5 py-2 rounded-xl font-black text-xs transition-all border border-red-100 active:scale-95"
            >
              <Trash2 size={15} />
              <span>EXCLUIR</span>
            </button>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <section className="flex flex-col items-center text-center space-y-5">
            <div className="w-28 h-28 bg-accent rounded-[2.5rem] flex items-center justify-center text-white font-black text-4xl shadow-2xl shadow-accent/20 border-4 border-white relative">
              {customer.nome.charAt(0).toUpperCase()}
              {customer.bloqueadoParaAgendar && (
                <div className="absolute -top-1 -right-1 bg-rose-600 text-white p-1.5 rounded-full border-2 border-white shadow-md" title="Cliente Bloqueado">
                  <Ban size={16} />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-primary tracking-tight">{customer.nome}</h3>
              <p className="text-muted text-sm font-bold">{customer.email || 'Sem e-mail cadastrado'}</p>
              
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <div className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-full shadow-inner border text-[11px] font-black ${
                  customer.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${customer.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  <span>{customer.ativo ? 'CLIENTE ATIVO' : 'INATIVO'}</span>
                </div>

                {customer.bloqueadoParaAgendar && (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full shadow-inner text-[11px] font-black">
                    <Ban size={12} />
                    <span>AGENDAMENTO BLOQUEADO</span>
                  </div>
                )}

                {temLogin ? (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full shadow-inner text-[11px] font-black">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    <span>✅ CLIENTE VINCULADO</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full shadow-inner text-[11px] font-black">
                    <Lock size={13} className="text-amber-600" />
                    <span>🔐 PENDENTE DE ATIVAÇÃO</span>
                  </div>
                )}

                {!temLogin && onLinkAccount && (
                  <button
                    type="button"
                    onClick={onLinkAccount}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full text-[11px] font-black transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Link2 size={12} />
                    <span>Vincular / Enviar Convite</span>
                  </button>
                )}

                {loyaltyConfig?.cashbackEnabled !== false && (
                  <>
                    {loyaltyConfig?.loyaltyMode !== 'saldo' && (
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full shadow-inner text-[11px] font-black">
                        ⭐ {pontosFidelidade} PONTOS FIDELIDADE
                      </div>
                    )}

                    {loyaltyConfig?.loyaltyMode === 'saldo' && (
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full shadow-inner text-[11px] font-black">
                        💰 R$ {(customer.cashback ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CASHBACK
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const next = !showLoyaltyForm;
                        setShowLoyaltyForm(next);
                        if (next) {
                          setLoyaltyType(loyaltyConfig?.loyaltyMode === 'saldo' ? 'cashback' : 'points');
                          setShowCreditForm(false);
                          setShowDebtForm(false);
                          setTimeout(() => {
                            document.getElementById('loyalty-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 100);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-full text-[11px] font-black transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      <Edit2 size={11} />
                      <span>{loyaltyConfig?.loyaltyMode === 'saldo' ? 'Ajustar Cashback' : 'Ajustar Pontos'}</span>
                    </button>
                  </>
                )}
              </div>

              <div className="pt-3">
                <button
                  onClick={handleWhatsApp}
                  className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/10 active:scale-95 transition-all w-full md:w-auto"
                >
                  <MessageCircle size={16} />
                  <span>Chamar no WhatsApp</span>
                </button>
              </div>
            </div>
          </section>

          {/* Painel Centralizado de Registros e Métricas Estatisitcas */}
          <div className="bg-slate-50 border border-slate-100 p-8 rounded-[2rem] shadow-inner space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h4 className="text-sm font-black text-primary uppercase tracking-wider">Histórico & Registros de Consumo</h4>
              <span className="text-[10px] font-black uppercase text-accent tracking-[0.2em]">Dashboard Elite</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-5 rounded-2xl shadow-md col-span-2 md:col-span-1 flex flex-col justify-between">
                <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <TrendingUp size={13} className="text-indigo-400" /> Gasto Total Acumulado
                </p>
                <p className="text-2xl font-black text-white font-mono tracking-tight mt-1">
                  R$ {totalGastoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Total de Agendamentos</p>
                <p className="text-xl font-black text-primary">{totalAgendamentos} visitas</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Serviços Concluídos</p>
                <p className="text-xl font-black text-primary">{quantidadeServicos} cortes</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm col-span-2 md:col-span-1">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Mais Realizado</p>
                <p className="text-xs font-black text-accent truncate">{maisServicoFeito}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm col-span-2 md:col-span-2">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Profissional Preferido</p>
                <p className="text-xs font-black text-emerald-600 truncate">{profissionalMaisAtendido}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl space-y-4 shadow-inner flex flex-col justify-between">
              <div>
                <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm ${(customer.saldo_atual ?? customer.balance ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  <DollarSign size={20} />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Saldo Líquido</p>
                  <p className="text-lg font-black text-primary tracking-tight">
                    R$ {(customer.saldo_atual ?? customer.balance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { 
                  const next = !showCreditForm;
                  setShowCreditForm(next); 
                  setShowDebtForm(false); 
                  setShowLoyaltyForm(false);
                  if (next) {
                    setTimeout(() => {
                      document.getElementById('credit-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }
                }}
                className="text-[9px] font-black uppercase text-emerald-600 hover:text-emerald-700 hover:underline mt-1 self-start flex items-center gap-1 bg-white border border-slate-200 shadow-sm py-1 px-2.5 rounded-lg"
              >
                <Plus size={10} /> Adicionar Crédito
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl space-y-4 shadow-inner flex flex-col justify-between">
              <div>
                <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm ${(customer.total_em_aberto ?? 0) > 0 ? "text-red-700" : "text-slate-400"}`}>
                  <AlertCircle size={20} />
                </div>
                <div className="mt-3">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Em Aberto (Dívida)</p>
                  <p className="text-lg font-black text-primary tracking-tight">
                    R$ {(customer.total_em_aberto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => { 
                  const next = !showDebtForm;
                  setShowDebtForm(next); 
                  setShowCreditForm(false); 
                  setShowLoyaltyForm(false);
                  if (next) {
                    setTimeout(() => {
                      document.getElementById('debt-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }
                }}
                className="text-[9px] font-black uppercase text-red-600 hover:text-red-700 hover:underline mt-1 self-start flex items-center gap-1 bg-white border border-slate-200 shadow-sm py-1 px-2.5 rounded-lg"
              >
                <Plus size={10} /> Registrar Fiado
              </button>
            </div>

            <DetailStat label="Total Gasto" value={`R$ ${totalGastoFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<TrendingUp size={20} />} color="text-blue-600" />
            <DetailStat label="Total Pago" value={`R$ ${(customer.total_pago ?? customer.totalPaid ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<CheckCircle2 size={20} />} color="text-emerald-600" />
          </div>

          {/* COLLAPSIBLE CREDIT FORM */}
          <AnimatePresence>
            {showCreditForm && (
              <motion.div 
                id="credit-form-container"
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50/70 border border-emerald-100 p-6 rounded-[2rem] space-y-4 shadow-inner overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-emerald-800 tracking-wider">Depositar Crédito Pré-Pago</h4>
                  <button onClick={() => setShowCreditForm(false)} className="text-emerald-800 hover:text-black">
                    <X size={14} />
                  </button>
                </div>
                <form onSubmit={handleAddCredit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-emerald-800 block mb-1 uppercase tracking-wider">VALOR (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        required
                        value={creditAmount} 
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="w-full bg-white border border-emerald-200 rounded-xl py-2 px-3 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500" 
                        placeholder="0,00"
                        min="0.01"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-emerald-800 block mb-1 uppercase tracking-wider">MÉTODO</label>
                      <select 
                        value={creditMethod} 
                        onChange={(e) => setCreditMethod(e.target.value as any)}
                        className="w-full bg-white border border-emerald-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="pix">PIX</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 py-2">
                    <input 
                      type="checkbox"
                      id="dontAddToCash"
                      checked={dontAddToCash}
                      onChange={(e) => setDontAddToCash(e.target.checked)}
                      className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor="dontAddToCash" className="text-[10px] font-black text-emerald-800 cursor-pointer select-none">
                      Não adicionar valor ao caixa (Apenas ajuste manual / correção de saldo)
                    </label>
                  </div>

                  <button 
                    type="submit" 
                    disabled={submittingCredit}
                    className="w-full py-2.5 bg-emerald-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-emerald-700 transition"
                  >
                    {submittingCredit ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar Adição de Crédito'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* COLLAPSIBLE DEBT FORM */}
          <AnimatePresence>
            {showDebtForm && (
              <motion.div 
                id="debt-form-container"
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-50/70 border border-red-100 p-6 rounded-[2rem] space-y-4 shadow-inner overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-red-800 tracking-wider">Registrar Novo Fiado / Débito</h4>
                  <button onClick={() => setShowDebtForm(false)} className="text-red-800 hover:text-black">
                    <X size={14} />
                  </button>
                </div>
                <form onSubmit={handleAddManualDebt} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-red-800 block mb-1 uppercase tracking-wider">VALOR (R$)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        required
                        value={debtAmount} 
                        onChange={(e) => setDebtAmount(e.target.value)}
                        className="w-full bg-white border border-red-200 rounded-xl py-2 px-3 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500" 
                        placeholder="0,00"
                        min="0.01"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-red-800 block mb-1 uppercase tracking-wider">DATA</label>
                      <input 
                        type="date" 
                        required
                        value={debtDate} 
                        onChange={(e) => setDebtDate(e.target.value)}
                        className="w-full bg-white border border-red-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-red-800 block mb-1 uppercase tracking-wider">DESCRIÇÃO (MÁX. 40 CARACTERES)</label>
                    <input 
                      type="text" 
                      required
                      value={debtDescription} 
                      onChange={(e) => setDebtDescription(e.target.value)}
                      className="w-full bg-white border border-red-200 rounded-xl py-2.5 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500" 
                      placeholder="Ex: Cerveja, Pomada Modeladora, Corte Fiado"
                      maxLength={40}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={submittingDebt}
                    className="w-full py-2.5 bg-red-650 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-red-700 transition"
                  >
                    {submittingDebt ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar Registro de Fiado'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* COLLAPSIBLE LOYALTY / POINTS FORM */}
          <AnimatePresence>
            {showLoyaltyForm && (
              <motion.div 
                id="loyalty-form-container"
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                exit={{ opacity: 0, height: 0 }}
                className="bg-blue-50/70 border border-blue-100 p-6 rounded-[2rem] space-y-4 shadow-inner overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase text-blue-800 tracking-wider">Ajustar Pontos / Cashback</h4>
                  <button type="button" onClick={() => setShowLoyaltyForm(false)} className="text-blue-800 hover:text-black">
                    <X size={14} />
                  </button>
                </div>
                <form onSubmit={handleAdjustLoyalty} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[9px] font-black text-blue-800 block mb-1 uppercase tracking-wider">TIPO DE SALDO</label>
                      <select 
                        value={loyaltyType} 
                        onChange={(e) => setLoyaltyType(e.target.value as any)}
                        className="w-full bg-white border border-blue-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {loyaltyConfig?.loyaltyMode !== 'saldo' && (
                          <option value="points">Pontos de Fidelidade</option>
                        )}
                        {loyaltyConfig?.loyaltyMode === 'saldo' && (
                          <option value="cashback">Saldo Cashback (R$)</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-blue-800 block mb-1 uppercase tracking-wider">OPERAÇÃO</label>
                      <select 
                        value={loyaltyAction} 
                        onChange={(e) => setLoyaltyAction(e.target.value as any)}
                        className="w-full bg-white border border-blue-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="add">➕ Adicionar</option>
                        <option value="remove">➖ Remover</option>
                        <option value="set">🎯 Definir Saldo Fixo</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-blue-800 block mb-1 uppercase tracking-wider">VALOR / QUANTIDADE</label>
                      <input 
                        type="number" 
                        step={loyaltyType === 'cashback' ? '0.01' : '1'} 
                        required
                        value={loyaltyValue} 
                        onChange={(e) => setLoyaltyValue(e.target.value)}
                        className="w-full bg-white border border-blue-200 rounded-xl py-2 px-3 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" 
                        placeholder={loyaltyType === 'cashback' ? '0,00' : '0'}
                        min="0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black text-blue-800 block mb-1 uppercase tracking-wider">DESCRIÇÃO / MOTIVO DO AJUSTE</label>
                    <input 
                      type="text" 
                      required
                      value={loyaltyDescription} 
                      onChange={(e) => setLoyaltyDescription(e.target.value)}
                      className="w-full bg-white border border-blue-200 rounded-xl py-2.5 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" 
                      placeholder="Ex: Bônus de aniversário, Correção manual de saldo, Cortesia..."
                      maxLength={60}
                    />
                  </div>

                  <button 
                    type="submit" 
                    disabled={submittingLoyalty}
                    className="w-full py-2.5 bg-blue-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-blue-700 transition animate-pulse"
                  >
                    {submittingLoyalty ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Confirmar Ajuste de Fidelidade'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex items-center gap-4 shadow-inner">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 text-slate-400 shadow-sm">
                <Phone size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Telefone de Contato</p>
                <p className="text-sm font-black text-primary">{customer.telefone || customer.phone || 'Não informado'}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex items-center gap-4 shadow-inner">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 text-slate-400 shadow-sm">
                <Cake size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Nascimento</p>
                <p className="text-sm font-black text-primary">
                  {customer.birthDate ? format(new Date(customer.birthDate), "dd/MM/yyyy") : 'Não informado'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl flex items-start gap-4 shadow-inner">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-slate-100 text-slate-400 flex-shrink-0 shadow-sm">
              <MapPin size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">Endereço Residencial</p>
              <p className="text-sm font-black text-primary leading-relaxed">{customer.address || 'Não informado'}</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-8 space-y-6 shadow-inner">
              <h4 className="text-base font-black text-primary flex items-center gap-3">
                <MessageSquare size={20} className="text-accent" />
                Preferências e Observações
              </h4>
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Preferências de Atendimento</p>
                  <p className="text-sm text-slate-600 leading-relaxed font-bold">
                    {customer.preferences || 'Nenhuma preferência registrada.'}
                  </p>
                </div>
                <div className="pt-6 border-t border-slate-200">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Notas Administrativas Internas</p>
                  <p className="text-sm text-slate-500 italic font-bold">
                    {customer.observacoes || customer.observations || 'Sem observações adicionais.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-2 p-1.5 bg-slate-100 border border-slate-200 rounded-2xl shadow-inner">
                <button 
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
                    activeTab === 'history' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
                  }`}
                >
                  <History size={16} />
                  <span>Atendimentos ({history.length})</span>
                </button>
                <button 
                  onClick={() => setActiveTab('debts')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
                    activeTab === 'debts' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
                  }`}
                >
                  <AlertCircle size={16} />
                  <span>Dívidas / Fiado ({debts.length})</span>
                  {debts.filter(d => d.status !== 'quitado').length > 0 && (
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  )}
                </button>
                <button 
                  onClick={() => setActiveTab('notes')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${
                    activeTab === 'notes' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
                  }`}
                >
                  <MessageSquare size={16} />
                  <span>Anotações ({notes.length})</span>
                </button>
              </div>
              
              {activeTab === 'history' ? (
                loadingHistory ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-accent" size={32} />
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                    <p className="text-muted text-sm font-bold italic">Nenhum atendimento registrado ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.map((apt, index) => (
                      <div key={`customer-history-${apt.id || index}-${index}`} className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between group hover:border-accent/20 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex flex-col items-center justify-center border border-slate-100 shadow-inner">
                            <span className="text-[10px] font-black text-muted uppercase leading-none mb-1">{format(new Date(apt.date), 'MMM', { locale: ptBR })}</span>
                            <span className="text-base font-black text-primary leading-none">{format(new Date(apt.date), 'dd')}</span>
                          </div>
                          <div>
                            <p className="text-sm font-black text-primary group-hover:text-accent transition-colors">{apt.serviceName}</p>
                            <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-0.5">com {apt.profissional_name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-primary">R$ {apt.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border mt-1 inline-block ${
                            apt.status === 'completed' || apt.status === 'concluído' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                            apt.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-muted border-slate-100'
                          }`}>
                            {apt.status === 'completed' ? 'Concluído' : apt.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : activeTab === 'debts' ? (
                loadingDebts || loadingPayments ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-accent" size={32} />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Header Bar with Print Extrato Button */}
                    <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl space-y-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Receipt className="text-amber-400" size={20} />
                            <h3 className="text-lg font-black tracking-tight">Livro Caixa & Extrato do Cliente</h3>
                          </div>
                          <p className="text-xs text-slate-400 font-semibold mt-1">
                            Acompanhamento detalhado de débitos/fiados e pagamentos efetuados
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPrintStatement(true)}
                          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 active:scale-95"
                        >
                          <Printer size={16} />
                          <span>Imprimir / Baixar Extrato</span>
                        </button>
                      </div>

                      {/* Financial KPI Summary Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Dívidas Geradas</p>
                          <p className="text-base font-black text-red-400">
                            R$ {debts.reduce((acc, d) => acc + (d.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Pagamentos</p>
                          <p className="text-base font-black text-emerald-400">
                            R$ {payments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Devedor Atual</p>
                          <p className={`text-base font-black ${
                            (customer.total_em_aberto ?? debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').reduce((acc, d) => acc + (d.remainingAmount || 0), 0)) > 0 
                              ? 'text-amber-400' 
                              : 'text-emerald-400'
                          }`}>
                            R$ {(customer.total_em_aberto ?? debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').reduce((acc, d) => acc + (d.remainingAmount || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Pending Debts Section */}
                    {debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-500" />
                            Dívidas Pendentes em Aberto ({debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').length})
                          </h4>
                        </div>
                        <div className="space-y-3">
                          {debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').map((debt, index) => (
                            <div key={`pending-debt-${debt.id || 'debt'}-${index}`} className="bg-red-50/50 border border-red-200 p-5 rounded-2xl flex items-center justify-between group transition-all shadow-sm">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center border border-red-200">
                                  <AlertCircle size={20} />
                                </div>
                                <div>
                                  <p className="text-sm font-black text-primary">
                                    {debt.description || `Fiado de ${debt.date ? format(new Date(debt.date), 'dd/MM/yyyy') : 'Data N/D'}`}
                                  </p>
                                  <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-0.5">
                                    Restante: <span className="text-red-600 font-black">R$ {debt.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    {debt.dueDate && ` • Vence: ${debt.dueDate}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <div>
                                  <p className="text-xs text-muted font-bold">Total Original</p>
                                  <p className="text-sm font-black text-primary">R$ {debt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <button 
                                  onClick={() => {
                                    setPaymentModal({ isOpen: true, debt });
                                    setPaymentAmount(debt.remainingAmount.toString());
                                    setPaymentMethod('dinheiro');
                                  }}
                                  disabled={isPayingDebt}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                                >
                                  {isPayingDebt ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                                  <span>Pagar</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Complete Chronological Livro Caixa Feed */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-2">
                        <FileText size={14} className="text-slate-500" />
                        Histórico de Lançamentos do Livro Caixa ({debts.length + payments.length})
                      </h4>

                      {debts.length === 0 && payments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                          <p className="text-muted text-sm font-bold italic">Nenhum lançamento no Livro Caixa para este cliente.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {[
                            ...debts.map(d => ({
                              id: d.id,
                              kind: 'debit' as const,
                              dateStr: d.date || (d.createdAt?.seconds ? format(new Date(d.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                              timestamp: d.createdAt?.seconds || 0,
                              title: d.description || `Dívida / Fiado${d.comanda_id ? ` (Comanda #${d.comanda_id.slice(-4)})` : ''}`,
                              amount: d.amount,
                              status: d.status,
                              remaining: d.remainingAmount
                            })),
                            ...payments.map(p => ({
                              id: p.id,
                              kind: 'credit' as const,
                              dateStr: p.date || (p.createdAt?.seconds ? format(new Date(p.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                              timestamp: p.createdAt?.seconds || 0,
                              title: `Pagamento Recebido (${(p.paymentMethod || 'Dinheiro').toUpperCase()})`,
                              amount: p.amount,
                              status: 'pago',
                              remaining: 0
                            }))
                          ]
                          .sort((a, b) => b.timestamp - a.timestamp)
                          .map((entry, idx) => (
                            <div key={`livro-entry-${entry.id || idx}-${idx}`} className="bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner ${
                                  entry.kind === 'credit' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                                }`}>
                                  {entry.kind === 'credit' ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                                </div>
                                <div>
                                  <p className="text-sm font-black text-primary">{entry.title}</p>
                                  <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-0.5">
                                    {entry.dateStr ? format(new Date(entry.dateStr), 'dd/MM/yyyy') : 'Data N/D'}
                                    {entry.kind === 'debit' && entry.remaining > 0 && ` • Em aberto: R$ ${entry.remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-black ${entry.kind === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {entry.kind === 'credit' ? '+' : '-'} R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border mt-1 inline-block ${
                                  entry.kind === 'credit' 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                    : entry.status === 'quitado' || entry.status === 'pago' 
                                      ? 'bg-slate-100 text-slate-600 border-slate-200' 
                                      : 'bg-red-50 text-red-700 border-red-100'
                                }`}>
                                  {entry.kind === 'credit' ? 'Pagamento' : entry.status === 'quitado' ? 'Quitado' : 'Débito'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-6">
                  <form onSubmit={handleAddTechnicalNote} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 shadow-sm">
                    <label className="text-[10px] text-muted font-black uppercase tracking-widest">Nova Anotação Técnica (Ficha de Cabelo/Barba)</label>
                    <textarea 
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent min-h-[80px]"
                      placeholder="Descreva detalhes técnicos (ex: Degradê navalhado usando pente 1.5, barba lenhador hidratada...)"
                    />
                    <div className="flex justify-end">
                      <button 
                        type="submit" 
                        disabled={savingNote || !newNoteText.trim()}
                        className="py-2.5 px-6 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-2"
                      >
                        {savingNote ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        <span>Salvar Nota</span>
                      </button>
                    </div>
                  </form>

                  {loadingNotes ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="animate-spin text-accent" size={32} />
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                      <p className="text-muted text-sm font-bold italic">Nenhuma anotação técnica registrada ainda.</p>
                    </div>
                  ) : (
                    <div className="relative border-l border-slate-200 pl-6 ml-4 space-y-6">
                      {notes.map((note, idx) => {
                        const noteDate = note.createdAt?.seconds 
                          ? format(new Date(note.createdAt.seconds * 1000), "dd/MM/yyyy 'às' HH:mm") 
                          : 'Recentemente';
                        return (
                          <div key={`client-note-${note.id || 'n'}-${idx}`} className="relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm group hover:border-accent/10 transition-all">
                            <div className="absolute -left-[30px] top-6 w-3 h-3 bg-accent border-2 border-white rounded-full group-hover:scale-125 transition-transform" />
                            
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] text-muted font-black uppercase tracking-widest">{noteDate}</span>
                              <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase tracking-wider">Por {note.authorName}</span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed font-bold break-words whitespace-pre-line">{note.content}</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Payment Modal */}
      <AnimatePresence>
        {paymentModal.isOpen && paymentModal.debt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden text-primary"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight uppercase">Pagar Dívida</h3>
                    <p className="text-[10px] font-black text-muted uppercase tracking-widest leading-none mt-1">Saldo Devedor: R$ {paymentModal.debt.remainingAmount.toLocaleString()}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPaymentModal({ isOpen: false, debt: null })}
                  className="p-3 text-muted hover:text-primary transition-colors bg-white rounded-2xl border border-slate-100"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-3 font-bold">
                  <label className="text-[10px] text-muted uppercase tracking-[0.2em] ml-1">Valor do Pagamento</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted text-sm uppercase tracking-widest font-black">R$</span>
                    <input 
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-5 pl-12 pr-6 text-2xl font-black text-primary focus:outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent transition-all shadow-inner"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] text-muted uppercase tracking-[0.2em] font-black ml-1">Método de Pagamento</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['dinheiro', 'pix', 'debito', 'credito'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m as PaymentMethod)}
                        className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all active:scale-95 shadow-sm ${
                          paymentMethod === m 
                            ? 'bg-primary text-white border-primary shadow-primary/20' 
                            : 'bg-white border-slate-100 text-muted hover:border-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => handlePayDebt()}
                  disabled={isPayingDebt || !paymentAmount}
                  className="w-full py-5 bg-emerald-600 text-white rounded-3xl font-black text-sm uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {isPayingDebt ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                  Confirmar Pagamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Printable Extrato / Livro Caixa Modal */}
      <AnimatePresence>
        {showPrintStatement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]"
            >
              {/* Modal Top Bar (Screen only) */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:hidden">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center border border-amber-500/30">
                    <Printer size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">Extrato do Livro Caixa</h3>
                    <p className="text-xs text-slate-400 font-medium">Pronto para impressão e prestação de contas com o cliente</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                  >
                    <Printer size={16} />
                    <span>Imprimir Agora</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPrintStatement(false)}
                    className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Printable Document Sheet Body */}
              <div id="printable-client-statement" className="p-8 sm:p-12 overflow-y-auto space-y-8 bg-white text-slate-900 font-sans text-xs">
                {/* Document Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                  <div>
                    <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">EXTRATO DO LIVRO CAIXA</h1>
                    <p className="text-sm font-bold text-slate-600 mt-1">Histórico Oficial de Débitos & Pagamentos</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-1">
                      Gerado em: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black uppercase tracking-wider text-slate-900">{customer.nome}</p>
                    <p className="text-xs font-semibold text-slate-600">{customer.telefone || customer.phone || 'Telefone não informado'}</p>
                    {customer.email && <p className="text-xs text-slate-500">{customer.email}</p>}
                    <span className="inline-block mt-2 px-3 py-1 bg-slate-100 font-mono text-[10px] font-bold rounded border border-slate-300">
                      ID CLIENTE: {customer.uid.slice(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Balance Summary Box */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total de Débitos / Fiados</p>
                    <p className="text-lg font-black text-red-600">
                      R$ {debts.reduce((acc, d) => acc + (d.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total de Pagamentos Efetuados</p>
                    <p className="text-lg font-black text-emerald-600">
                      R$ {payments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Saldo Pendente Atual</p>
                    <p className="text-lg font-black text-amber-600">
                      R$ {(customer.total_em_aberto ?? debts.filter(d => d.status !== 'quitado' && d.status !== 'pago').reduce((acc, d) => acc + (d.remainingAmount || 0), 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Itemized Table */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Detalhamento dos Lançamentos</h3>
                  <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <th className="p-3 border-r border-slate-200">Data</th>
                        <th className="p-3 border-r border-slate-200">Tipo</th>
                        <th className="p-3 border-r border-slate-200">Descrição / Forma</th>
                        <th className="p-3 text-right border-r border-slate-200">Valor (R$)</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {[
                        ...debts.map(d => ({
                          id: d.id,
                          kind: 'debit' as const,
                          dateStr: d.date || (d.createdAt?.seconds ? format(new Date(d.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                          timestamp: d.createdAt?.seconds || 0,
                          desc: d.description || `Fiado / Dívida${d.comanda_id ? ` (Comanda #${d.comanda_id.slice(-4)})` : ''}`,
                          amount: d.amount,
                          status: d.status,
                          remaining: d.remainingAmount
                        })),
                        ...payments.map(p => ({
                          id: p.id,
                          kind: 'credit' as const,
                          dateStr: p.date || (p.createdAt?.seconds ? format(new Date(p.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                          timestamp: p.createdAt?.seconds || 0,
                          desc: `Pagamento de Fiado - ${(p.paymentMethod || 'Dinheiro').toUpperCase()}`,
                          amount: p.amount,
                          status: 'pago',
                          remaining: 0
                        }))
                      ]
                      .sort((a, b) => b.timestamp - a.timestamp)
                      .map((row, i) => (
                        <tr key={`print-row-${row.id || 'r'}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="p-3 border-r border-slate-200 font-mono">
                            {row.dateStr ? format(new Date(row.dateStr), 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="p-3 border-r border-slate-200 font-bold">
                            {row.kind === 'debit' ? (
                              <span className="text-red-600 font-black uppercase">Débito</span>
                            ) : (
                              <span className="text-emerald-600 font-black uppercase">Pagamento</span>
                            )}
                          </td>
                          <td className="p-3 border-r border-slate-200 font-semibold">{row.desc}</td>
                          <td className={`p-3 text-right border-r border-slate-200 font-mono font-bold ${row.kind === 'debit' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {row.kind === 'debit' ? '-' : '+'} R$ {row.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-center uppercase font-bold text-[10px]">
                            {row.kind === 'credit' ? (
                              <span className="text-emerald-700">Confirmado</span>
                            ) : row.remaining === 0 ? (
                              <span className="text-slate-500">Quitado</span>
                            ) : (
                              <span className="text-red-600">Pendente (R$ {row.remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Declarations and Signature Block */}
                <div className="pt-8 space-y-12 border-t border-slate-200">
                  <p className="text-[10px] text-slate-500 italic text-center">
                    Declaro para os devidos fins que reconheço as movimentações acima descritas e o saldo devedor apontado neste extrato.
                  </p>

                  <div className="grid grid-cols-2 gap-12 pt-6">
                    <div className="text-center space-y-2">
                      <div className="border-b border-slate-900 w-full h-8"></div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">{customer.nome}</p>
                      <p className="text-[9px] text-slate-500 font-semibold">Assinatura do Cliente</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="border-b border-slate-900 w-full h-8"></div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-900">Representante do Estabelecimento</p>
                      <p className="text-[9px] text-slate-500 font-semibold">Assinatura / Carimbo</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailStat({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-slate-50 border border-slate-100 p-6 rounded-3xl space-y-4 shadow-inner">
      <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-100 shadow-sm ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{label}</p>
        <p className="text-lg font-black text-primary tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function LinkingModal({ customer, tenantId, onClose }: { customer: UserProfile; tenantId: string; onClose: () => void }) {
  const isLinked = isCustomerLinked(customer);
  const generatedLink = `${window.location.origin}/register?link_client_id=${customer.uid}&tenant=${tenantId}`;
  
  const formattedPhone = (customer.telefone || customer.phone || '').replace(/\D/g, '');
  const whatsappText = isLinked
    ? `Olá, ${customer.nome}! Lembrando que sua conta de cliente na barbearia já está vinculada e ativa com o e-mail: ${customer.email}. Você pode acessar seus agendamentos e histórico a qualquer momento!`
    : `Olá, ${customer.nome}! Para fazer seus agendamentos online, acompanhar seus pontos de fidelidade e ver seu histórico, clique no link abaixo para criar sua senha e ativar sua conta:\n\n🔗 ${generatedLink}`;
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    toast.success("Link copiado com sucesso!");
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(whatsappText);
    toast.success("Mensagem do WhatsApp copiada!");
  };

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(whatsappText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-border w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              isLinked 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                : 'bg-amber-50 text-amber-600 border-amber-200'
            }`}>
              {isLinked ? <CheckCircle2 size={20} /> : <Link2 size={20} />}
            </div>
            <div>
              <h2 className="text-xl font-black text-primary tracking-tight">
                {isLinked ? 'Cliente Já Vinculado' : 'Vincular Conta do Cliente'}
              </h2>
              <p className="text-[11px] font-bold text-muted">
                {isLinked ? 'Este cliente possui conta ativa no sistema' : 'Gere o link de ativação para o cliente cadastrar a senha'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {isLinked ? (
            <>
              <div className="bg-emerald-50 border border-emerald-200/80 p-5 rounded-2xl flex items-start gap-4 text-emerald-950">
                <div className="p-2.5 bg-emerald-500 text-white rounded-xl shrink-0 shadow-md">
                  <CheckCircle2 size={24} />
                </div>
                <div className="space-y-1">
                  <span className="inline-block text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-md border border-emerald-200">
                    ✅ CONTA VERIFICADA & ATIVA
                  </span>
                  <h3 className="text-base font-black text-slate-900">{customer.nome}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                    Este cliente já completou o cadastro de senha e vinculou seu histórico completo de agendamentos, saldos e pontos de fidelidade.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">E-mail de Acesso:</span>
                  <span className="font-bold text-slate-800 font-mono">{customer.email || 'Não informado'}</span>
                </div>
                {customer.telefone && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80">
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Telefone:</span>
                    <span className="font-bold text-slate-800 font-mono">{customer.telefone}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(customer.email || '');
                    toast.success("E-mail copiado com sucesso!");
                  }}
                  className="flex-1 py-3.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <Mail size={16} />
                  Copiar E-mail de Acesso
                </button>
                {formattedPhone && (
                  <button 
                    onClick={handleShareWhatsApp}
                    className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-500/10"
                  >
                    <MessageCircle size={16} />
                    Enviar Lembrete WhatsApp
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Cliente Selecionado</p>
                <h3 className="text-lg font-black text-primary">{customer.nome}</h3>
                {customer.email && <p className="text-xs text-muted font-bold">{customer.email}</p>}
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed font-semibold">
                Este cliente foi cadastrado diretamente na barbearia. Gerando o link abaixo, ele poderá cadastrar sua senha de acesso para vincular seu histórico completo de agendamentos, saldos e pontos de fidelidade!
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Link de Ativação Único</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-mono focus:outline-none text-primary"
                  />
                  <button 
                    onClick={handleCopyLink}
                    className="bg-primary text-white hover:bg-primary-hover px-4 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Mensagem Pronta para WhatsApp</label>
                <div className="relative">
                  <textarea 
                    readOnly
                    value={whatsappText}
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs focus:outline-none text-primary leading-relaxed font-semibold"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button 
                    onClick={handleCopyMessage}
                    className="flex-1 py-3.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    Copiar Mensagem
                  </button>
                  <button 
                    onClick={handleShareWhatsApp}
                    className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-500/10"
                  >
                    <MessageCircle size={16} />
                    Enviar via WhatsApp
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
