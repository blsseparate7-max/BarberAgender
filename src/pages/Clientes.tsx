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
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Appointment } from '../types';
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
  UserX,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDate } from '../lib/utils';
import { debtService } from '../services/debtService';
import { comandaService } from '../services/comandaService';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { ClientDebt, PaymentMethod } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { toast } from 'sonner';
import { useTenant } from '../contexts/TenantContext';

export function Clientes() {
  const { tenantId } = useTenant();
  const [customers, setCustomers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterTier, setFilterTier] = useState<'all' | 'vvip' | 'debtor' | 'new'>('all');
  const [sortBy, setSortBy] = useState<'nome' | 'spent' | 'balance' | 'debt' | 'recent'>('nome');
  
  const [selectedCustomer, setSelectedCustomer] = useState<UserProfile | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<UserProfile | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'usuarios'),
      where('tipo', '==', 'cliente'),
      where('tenantId', '==', tenantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
      const sorted = docs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
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
      if (sortBy === 'nome') {
        return a.nome.localeCompare(b.nome);
      }
      if (sortBy === 'spent') {
        const spentA = a.total_gasto || a.totalSpent || 0;
        const spentB = b.total_gasto || b.totalSpent || 0;
        return spentB - spentA;
      }
      if (sortBy === 'balance') {
        const balA = a.saldo_atual ?? a.balance ?? 0;
        const balB = b.saldo_atual ?? b.balance ?? 0;
        return balB - balA;
      }
      if (sortBy === 'debt') {
        const debtA = a.total_em_aberto || 0;
        const debtB = b.total_em_aberto || 0;
        return debtB - debtA;
      }
      if (sortBy === 'recent') {
        const secA = (a.createdAt as any)?.seconds || 0;
        const secB = (b.createdAt as any)?.seconds || 0;
        return secB - secA;
      }
      return 0;
    });

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
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Total de Clientes</p>
            <h3 className="text-2xl font-black text-primary">{totalClients}</h3>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100">
            <UserIcon size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Clientes Ativos</p>
            <h3 className="text-2xl font-black text-emerald-600">{activeClients}</h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Faturamento Estimado</p>
            <h3 className="text-2xl font-black text-primary">R$ {totalSpentByAll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Pendências (Fiado)</p>
            <h3 className="text-2xl font-black text-red-600">R$ {totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
          </div>
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center border border-red-100">
            <AlertCircle size={20} />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
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
        <div className="flex flex-wrap gap-3">
          {/* Status Filter */}
          <div className="relative">
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-5 pr-12 py-4 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all outline-none cursor-pointer shadow-sm"
            >
              <option value="all">Filtro: Status</option>
              <option value="active">🟢 Ativos</option>
              <option value="inactive">🔴 Inativos</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
          </div>

          {/* Segment/Tier Filter */}
          <div className="relative">
            <select 
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-5 pr-12 py-4 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all outline-none cursor-pointer shadow-sm"
            >
              <option value="all">Filtro: Segmento</option>
              <option value="vvip">💎 VIPs (&gt; R$300)</option>
              <option value="debtor">⚠️ Com Pendências</option>
              <option value="new">✨ Novos (Últimos 30d)</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" size={16} />
          </div>

          {/* Sort Selection */}
          <div className="relative">
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-5 pr-12 py-4 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all outline-none cursor-pointer shadow-sm"
            >
              <option value="nome">Nome (A-Z)</option>
              <option value="spent">Filtrar: Maior Gasto</option>
              <option value="balance">Filtrar: Saldo Líquido</option>
              <option value="debt">Filtrar: Maior Dívida</option>
              <option value="recent">Filtrar: Recentes</option>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedCustomers.map((customer, index) => (
            <CustomerCard 
              key={`customer-${customer.uid || index}-${index}`} 
              customer={customer} 
              onViewDetails={() => handleViewDetails(customer)}
              onEdit={() => handleEditCustomer(customer)}
            />
          ))}
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
            customer={selectedCustomer} 
            onClose={() => setIsDetailsOpen(false)}
            onEdit={() => {
              setIsDetailsOpen(false);
              handleEditCustomer(selectedCustomer);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface CustomerCardProps {
  customer: UserProfile;
  onViewDetails: () => void;
  onEdit: () => void;
  key?: React.Key;
}

function CustomerCard({ customer, onViewDetails, onEdit }: CustomerCardProps) {
  // Garantir valores para exibição usando campos novos ou legados
  const saldo = customer.saldo_atual ?? customer.balance ?? 0;
  const emAberto = customer.total_em_aberto ?? 0;
  const telefone = customer.telefone || customer.phone || 'Sem telefone';

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
              <div className={`w-1.5 h-1.5 rounded-full ${customer.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${customer.ativo ? 'text-emerald-600' : 'text-muted'}`}>
                {customer.ativo ? 'Ativo' : 'Inativo'}
              </span>
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
        <button 
          onClick={onEdit}
          className="p-2 text-slate-300 hover:text-primary hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-100"
        >
          <Edit2 size={18} />
        </button>
      </div>

      <div className="space-y-3 mb-8">
        <div className="flex items-center gap-3 text-xs text-muted font-bold">
          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
            <Phone size={14} className="text-slate-400" />
          </div>
          <span>{telefone}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted font-bold">
          <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
            <Mail size={14} className="text-slate-400" />
          </div>
          <span className="truncate">{customer.email}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50 mt-auto">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[10px] text-muted uppercase font-black tracking-widest mb-1">Dívidas</p>
          <p className={`text-sm font-black ${emAberto > 0 ? 'text-red-700' : 'text-slate-400'}`}>
            R$ {emAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[10px] text-muted uppercase font-black tracking-widest mb-1">Saldo Líquido</p>
          <p className={`text-sm font-black ${saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <button 
        onClick={onViewDetails}
        className="w-full mt-6 py-4 bg-slate-100 hover:bg-slate-200 text-primary rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95 uppercase tracking-widest"
      >
        <span>Ver Perfil Completo</span>
        <ArrowRight size={16} />
      </button>
    </motion.div>
  );
}

function CustomerForm({ customer, onClose }: { customer: UserProfile | null, onClose: () => void }) {
  const [formData, setFormData] = useState({
    nome: customer?.nome || '',
    email: customer?.email || '',
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
    try {
      if (customer) {
        await userService.updateUserProfile(customer.uid, formData);
        toast.success("Cliente atualizado com sucesso!");
      } else {
        await userService.createUser({
          ...formData,
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
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nome Completo</label>
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
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-mail</label>
              <input 
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
              <input 
                type="tel"
                value={formData.telefone}
                onChange={(e) => setFormData({...formData, telefone: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2">
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

function CustomerDetails({ customer, onClose, onEdit }: { customer: UserProfile, onClose: () => void, onEdit: () => void }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<Appointment[]>([]);
  const [debts, setDebts] = useState<ClientDebt[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingDebts, setLoadingDebts] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'debts' | 'notes'>('history');
  
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

  useEffect(() => {
    const q = query(
      collection(db, 'appointments'),
      where('cliente_id', '==', customer.uid),
      orderBy('date', 'desc'),
      orderBy('startTime', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      setHistory(docs);
      setLoadingHistory(false);
    }, (error) => {
      console.error("Error fetching history:", error);
      setLoadingHistory(false);
    });

    // Fetch Debts
    const qDebts = query(
      collection(db, 'client_debts'),
      where('cliente_id', '==', customer.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeDebts = onSnapshot(qDebts, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClientDebt));
      setDebts(docs);
      setLoadingDebts(false);
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

      const clientRef = doc(db, 'usuarios', customer.uid);
      await updateDoc(clientRef, {
        total_em_aberto: increment(amt),
        saldo_atual: increment(-amt),
        balance: increment(-amt),
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
      const clientRef = doc(db, 'usuarios', customer.uid);
      await updateDoc(clientRef, {
        saldo_atual: increment(amt),
        balance: increment(amt),
        total_pago: increment(amt),
        totalPaid: increment(amt),
        updatedAt: serverTimestamp()
      });

      const paymentRef = doc(collection(db, 'debt_payments'));
      await setDoc(paymentRef, {
        id: paymentRef.id,
        cliente_id: customer.uid,
        amount: amt,
        paymentMethod: creditMethod,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        is_deposit: true,
        description: 'Adição de crédito pré-pago'
      });

      toast.success(`Crédito de R$ ${amt.toFixed(2)} adicionado!`);
      setCreditAmount('');
      setShowCreditForm(false);
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

  // Login do Usuário se possui ou não
  const temLogin = customer.email && !customer.email.includes('sem-email') && !customer.email.includes('teste');
  // Fidelidade se está ativado
  const pontosFidelidade = customer.pontos ?? customer.points ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-surface border-l border-border w-full max-w-xl h-full overflow-y-auto flex flex-col custom-scrollbar shadow-2xl"
      >
        <div className="p-8 border-b border-border flex items-center justify-between sticky top-0 bg-surface/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="p-2.5 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
              <X size={20} />
            </button>
            <h2 className="text-2xl font-black text-primary tracking-tight">Ficha do Cliente</h2>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onEdit}
              className="flex items-center gap-2 bg-amber-50 text-amber-700 hover:bg-amber-100 px-5 py-2.5 rounded-xl font-black text-xs transition-all border border-amber-100 active:scale-95 animate-pulse"
            >
              <Edit2 size={16} />
              <span>EDITAR</span>
            </button>
            <button 
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 px-5 py-2.5 rounded-xl font-black text-xs transition-all border border-red-100 active:scale-95"
            >
              <Trash2 size={16} />
              <span>EXCLUIR</span>
            </button>
          </div>
        </div>

        <div className="p-10 space-y-10">
          <section className="flex flex-col items-center text-center space-y-6">
            <div className="w-32 h-32 bg-accent rounded-[2.5rem] flex items-center justify-center text-white font-black text-5xl shadow-2xl shadow-accent/20 border-4 border-white">
              {customer.nome.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black text-primary tracking-tight">{customer.nome}</h3>
              <p className="text-muted text-sm font-bold">{customer.email}</p>
              
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-inner border text-xs font-black ${
                  customer.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${customer.ativo ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                  <span>{customer.ativo ? 'CLIENTE ATIVO' : 'INATIVO'}</span>
                </div>

                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-inner border text-xs font-black ${
                  temLogin ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  <span>{temLogin ? '🟢 USUÁRIO COM LOGIN' : '🔴 SEM LOGIN CLIENTE'}</span>
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-full shadow-inner text-xs font-black">
                  ⭐ {pontosFidelidade} PONTOS FIDELIDADE
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleWhatsApp}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/10 active:scale-95 transition-all w-full md:w-auto"
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
            
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Total de Agendamentos</p>
                <p className="text-xl font-black text-primary">{totalAgendamentos} visitas</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Serviços Concluídos</p>
                <p className="text-xl font-black text-primary">{quantidadeServicos} cortes</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-1">Mais Realizado</p>
                <p className="text-xs font-black text-accent truncate">{maisServicoFeito}</p>
              </div>
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
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
                onClick={() => { setShowCreditForm(!showCreditForm); setShowDebtForm(false); }}
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
                onClick={() => { setShowDebtForm(!showDebtForm); setShowCreditForm(false); }}
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
                loadingDebts ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="animate-spin text-accent" size={32} />
                  </div>
                ) : debts.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                    <p className="text-muted text-sm font-bold italic">Nenhuma dívida registrada.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {debts.map((debt, index) => (
                      <div key={`customer-debt-${debt.id || index}-${index}`} className="bg-white border border-slate-200 p-5 rounded-2xl flex items-center justify-between group hover:border-accent/20 transition-all shadow-sm">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-inner ${
                            debt.status === 'quitado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                          }`}>
                            {debt.status === 'quitado' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />}
                          </div>
                          <div>
                            <p className="text-sm font-black text-primary group-hover:text-accent transition-colors">
                              {debt.description || `Fiado de ${format(new Date(debt.date), 'dd/MM/yyyy')}`}
                            </p>
                            <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-0.5">Restante: R$ {debt.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-2">
                          <p className="text-sm font-black text-primary">R$ {debt.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          {debt.status !== 'quitado' && (
                            <button 
                              onClick={() => {
                                setPaymentModal({ isOpen: true, debt });
                                setPaymentAmount(debt.remainingAmount.toString());
                                setPaymentMethod('dinheiro');
                              }}
                              disabled={isPayingDebt}
                              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95 disabled:opacity-50 uppercase tracking-widest"
                            >
                              {isPayingDebt ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
                              <span>Pagar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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
                          <div key={note.id || idx} className="relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm group hover:border-accent/10 transition-all">
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
