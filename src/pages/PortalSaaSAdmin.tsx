import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  TrendingUp, 
  Bot, 
  Sparkles, 
  Loader2, 
  Search, 
  Calendar, 
  Trash2, 
  AlertTriangle, 
  Power, 
  RefreshCw, 
  Check, 
  X, 
  ShieldAlert, 
  LogOut,
  UserCheck,
  UserX,
  Building2,
  Plus,
  Edit3,
  ExternalLink,
  DollarSign,
  Sliders,
  ShieldCheck,
  PlusCircle,
  Share2,
  Copy,
  MessageSquare,
  Building,
  Phone,
  Mail,
  MapPin,
  Lock,
  Shield,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  BarChart3,
  Key,
  Palette,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { userService } from '../services/userService';
import { subscriptionService } from '../services/subscriptionService';
import { resetService } from '../services/resetService';
import { tenantService, TenantProfile } from '../services/tenantService';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, Subscription, UserRole } from '../types';

export default function PortalSaaSAdmin() {
  const { signOut, profile } = useAuth();
  
  // Data States
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [tenants, setTenants] = useState<TenantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI Tabs
  const [activeTab, setActiveTab] = useState<'tenants' | 'users' | 'subscriptions' | 'copilot' | 'reset-db'>('tenants');
  
  // Tenants Search and Filters
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState<string>('all');

  // Edit Tenant Modal States
  const [editingTenant, setEditingTenant] = useState<TenantProfile | null>(null);
  const [editTenantTab, setEditTenantTab] = useState<'brand' | 'owner' | 'billing'>('brand');
  const [editTenantName, setEditTenantName] = useState<string>('');
  const [editTenantCnpjCpf, setEditTenantCnpjCpf] = useState<string>('');
  const [editTenantPhone, setEditTenantPhone] = useState<string>('');
  const [editTenantEmail, setEditTenantEmail] = useState<string>('');
  const [editTenantStreet, setEditTenantStreet] = useState<string>('');
  const [editTenantNumber, setEditTenantNumber] = useState<string>('');
  const [editTenantNeighborhood, setEditTenantNeighborhood] = useState<string>('');
  const [editTenantCity, setEditTenantCity] = useState<string>('');
  const [editTenantState, setEditTenantState] = useState<string>('');
  const [editTenantZipCode, setEditTenantZipCode] = useState<string>('');
  const [editTenantAccentColor, setEditTenantAccentColor] = useState<string>('#10B981');
  const [editTenantMaxProfs, setEditTenantMaxProfs] = useState<number>(5);
  const [editTenantPricePerProf, setEditTenantPricePerProf] = useState<number>(39.90);
  const [editTenantFeeOverride, setEditTenantFeeOverride] = useState<string>('');
  const [editTenantPlanStatus, setEditTenantPlanStatus] = useState<'active' | 'pending' | 'suspended' | 'canceled'>('active');
  const [editTenantOwnerName, setEditTenantOwnerName] = useState<string>('');
  const [editTenantOwnerEmail, setEditTenantOwnerEmail] = useState<string>('');
  const [editTenantOwnerPhone, setEditTenantOwnerPhone] = useState<string>('');
  const [editTenantDueDateDay, setEditTenantDueDateDay] = useState<number>(10);
  const [editTenantNotes, setEditTenantNotes] = useState<string>('');
  const [savingTenant, setSavingTenant] = useState(false);

  // Create Tenant Modal States
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);
  const [createTenantTab, setCreateTenantTab] = useState<'brand' | 'owner' | 'billing'>('brand');
  const [newTenantId, setNewTenantId] = useState('');
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantCnpjCpf, setNewTenantCnpjCpf] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantStreet, setNewTenantStreet] = useState('');
  const [newTenantNumber, setNewTenantNumber] = useState('');
  const [newTenantNeighborhood, setNewTenantNeighborhood] = useState('');
  const [newTenantCity, setNewTenantCity] = useState('');
  const [newTenantState, setNewTenantState] = useState('');
  const [newTenantZipCode, setNewTenantZipCode] = useState('');
  const [newTenantAccentColor, setNewTenantAccentColor] = useState('#10B981');
  
  // Dono / Proprietário
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('Barber123@');
  const [createOwnerAccount, setCreateOwnerAccount] = useState(true);

  // Plano & Faturamento
  const [newMaxProfs, setNewMaxProfs] = useState(5);
  const [newPricePerProf, setNewPricePerProf] = useState(39.90);
  const [newMonthlyFeeOverride, setNewMonthlyFeeOverride] = useState('');
  const [newDueDateDay, setNewDueDateDay] = useState(10);
  const [newPlanStatus, setNewPlanStatus] = useState<'active' | 'pending' | 'suspended'>('active');
  const [newTenantNotes, setNewTenantNotes] = useState('');
  const [creatingTenant, setCreatingTenant] = useState(false);

  // WhatsApp / Share Credentials Modal State
  const [shareModalTenant, setShareModalTenant] = useState<TenantProfile | null>(null);
  const [sharePasswordInput, setSharePasswordInput] = useState('Barber123@');

  // Search and Filters
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Expiration Filter
  const [subSearch, setSubSearch] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');

  // AI Co-Pilot States
  const [copilotPrompt, setCopilotPrompt] = useState('');
  const [copilotResponse, setCopilotResponse] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);

  // System Reset States
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Edit Subscription Modal States
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [editSubEndDate, setEditSubEndDate] = useState('');
  const [editSubStatus, setEditSubStatus] = useState<'active' | 'expired' | 'trialing' | 'cancelled'>('active');
  const [savingSub, setSavingSub] = useState(false);

  // Edit User Role Modal States
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editUserRole, setEditUserRole] = useState<UserRole>('cliente');
  const [savingUserRole, setSavingUserRole] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all system users, subscriptions and tenants across all businesses
      const [allUsers, allSubs, allTenants] = await Promise.all([
        userService.getAllUsersSystem(),
        subscriptionService.getAllSubscriptionsSystem(),
        tenantService.listAllTenantsSystem()
      ]);
      setUsers(allUsers || []);
      setSubscriptions(allSubs || []);
      setTenants(allTenants || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao carregar os dados administrativos.');
    } finally {
      setLoading(false);
    }
  };

  // Calculations for Metrics
  const totalUsersCount = users.length;
  const activeUsersCount = users.filter(u => u.ativo !== false).length;
  const suspendedUsersCount = totalUsersCount - activeUsersCount;

  const totalTenantsCount = tenants.length;
  const activeTenantsCount = tenants.filter(t => t.isActive !== false && t.planStatus !== 'suspended').length;

  // Count active professionals per tenant
  const getTenantProfsCount = (tenantId: string) => {
    return users.filter(u => u.tenantId === tenantId && (u.tipo === 'barbeiro' || u.tipo === 'gerente') && u.ativo !== false).length;
  };

  // Compute platform Monthly Recurring Revenue (MRR) based on barbershops and active professionals
  const calculatedMRR = tenants.reduce((acc, t) => {
    if (t.isActive === false || t.planStatus === 'suspended') return acc;
    if (t.monthlyFeeOverride && t.monthlyFeeOverride > 0) return acc + t.monthlyFeeOverride;
    const profsCount = Math.max(1, getTenantProfsCount(t.id));
    const price = t.pricePerProfessional ?? 39.90;
    return acc + (profsCount * price);
  }, 0);

  const totalActiveSubsCount = subscriptions.filter(s => s.status === 'active').length;

  // Subscriptions near expiration (under 10 days or expired)
  const subscriptionsNearExpiry = subscriptions.filter(sub => {
    if (!sub.endDate) return false;
    const today = new Date();
    const end = new Date(sub.endDate);
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return sub.status === 'active' && diffDays >= 0 && diffDays <= 10;
  });

  // Open Edit Tenant Modal
  const handleOpenEditTenant = (tenant: TenantProfile) => {
    setEditingTenant(tenant);
    setEditTenantTab('brand');
    setEditTenantName(tenant.name || '');
    setEditTenantCnpjCpf(tenant.cnpjCpf || '');
    setEditTenantPhone(tenant.phone || '');
    setEditTenantEmail(tenant.email || '');
    setEditTenantStreet(tenant.address?.street || '');
    setEditTenantNumber(tenant.address?.number || '');
    setEditTenantNeighborhood(tenant.address?.neighborhood || '');
    setEditTenantCity(tenant.address?.city || '');
    setEditTenantState(tenant.address?.state || '');
    setEditTenantZipCode(tenant.address?.zipCode || '');
    setEditTenantAccentColor(tenant.accentColor || '#10B981');
    
    setEditTenantMaxProfs(tenant.maxProfessionals ?? 5);
    setEditTenantPricePerProf(tenant.pricePerProfessional ?? 39.90);
    setEditTenantFeeOverride(tenant.monthlyFeeOverride ? String(tenant.monthlyFeeOverride) : '');
    setEditTenantPlanStatus(tenant.planStatus || (tenant.isActive ? 'active' : 'suspended'));
    setEditTenantOwnerName(tenant.ownerName || '');
    setEditTenantOwnerEmail(tenant.ownerEmail || '');
    setEditTenantOwnerPhone(tenant.ownerPhone || '');
    setEditTenantDueDateDay(tenant.dueDateDay || 10);
    setEditTenantNotes(tenant.notes || '');
  };

  // Save Tenant Configuration
  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;
    setSavingTenant(true);
    const toastId = toast.loading('Salvando alterações da barbearia...');
    try {
      const feeVal = editTenantFeeOverride.trim() ? parseFloat(editTenantFeeOverride) : undefined;
      await tenantService.updateTenant(editingTenant.id, {
        name: editTenantName,
        cnpjCpf: editTenantCnpjCpf,
        phone: editTenantPhone,
        email: editTenantEmail,
        accentColor: editTenantAccentColor,
        address: {
          street: editTenantStreet,
          number: editTenantNumber,
          neighborhood: editTenantNeighborhood,
          city: editTenantCity,
          state: editTenantState,
          zipCode: editTenantZipCode
        },
        maxProfessionals: Number(editTenantMaxProfs),
        pricePerProfessional: Number(editTenantPricePerProf),
        monthlyFeeOverride: feeVal && !isNaN(feeVal) ? feeVal : undefined,
        planStatus: editTenantPlanStatus,
        isActive: editTenantPlanStatus === 'active',
        ownerName: editTenantOwnerName,
        ownerEmail: editTenantOwnerEmail,
        ownerPhone: editTenantOwnerPhone,
        dueDateDay: Number(editTenantDueDateDay),
        notes: editTenantNotes
      });
      toast.dismiss(toastId);
      toast.success(`Barbearia ${editTenantName} atualizada com sucesso!`);
      setEditingTenant(null);
      loadData();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro ao atualizar barbearia: ${err.message || err}`);
    } finally {
      setSavingTenant(false);
    }
  };

  // Toggle Tenant Block/Unblock
  const handleToggleTenantBlock = async (tenant: TenantProfile) => {
    const isCurrentlyActive = tenant.isActive !== false && tenant.planStatus !== 'suspended';
    const newStatus = isCurrentlyActive ? 'suspended' : 'active';
    const newIsActive = !isCurrentlyActive;
    const toastId = toast.loading(`${isCurrentlyActive ? 'Bloqueando' : 'Desbloqueando'} barbearia ${tenant.name}...`);
    try {
      await tenantService.updateTenant(tenant.id, {
        planStatus: newStatus,
        isActive: newIsActive
      });
      toast.dismiss(toastId);
      toast.success(`Barbearia ${tenant.name} ${isCurrentlyActive ? 'bloqueada' : 'desbloqueada'} com sucesso!`);
      loadData();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro: ${err.message || err}`);
    }
  };

  // Create New Tenant
  const handleCreateTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlug = newTenantId.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
    if (!cleanSlug || !newTenantName.trim()) {
      toast.error('Informe o identificador (slug) e o nome da barbearia.');
      return;
    }
    setCreatingTenant(true);
    const toastId = toast.loading('Cadastrando nova barbearia no ecossistema SaaS...');
    try {
      const feeVal = newMonthlyFeeOverride.trim() ? parseFloat(newMonthlyFeeOverride) : undefined;
      const createdTenant = await tenantService.createTenant({
        id: cleanSlug,
        name: newTenantName,
        cnpjCpf: newTenantCnpjCpf,
        phone: newTenantPhone,
        email: newTenantEmail,
        accentColor: newTenantAccentColor,
        address: {
          street: newTenantStreet,
          number: newTenantNumber,
          neighborhood: newTenantNeighborhood,
          city: newTenantCity,
          state: newTenantState,
          zipCode: newTenantZipCode
        },
        ownerName: newOwnerName,
        ownerEmail: newOwnerEmail,
        ownerPhone: newOwnerPhone,
        maxProfessionals: Number(newMaxProfs),
        pricePerProfessional: Number(newPricePerProf),
        monthlyFeeOverride: feeVal && !isNaN(feeVal) ? feeVal : undefined,
        dueDateDay: Number(newDueDateDay),
        planStatus: newPlanStatus,
        isActive: newPlanStatus === 'active',
        notes: newTenantNotes
      });

      // Se solicitado, criar automaticamente a conta de usuário do Dono no sistema de autenticação!
      if (createOwnerAccount && newOwnerEmail.trim() && newOwnerPassword.trim()) {
        try {
          await userService.createUser({
            nome: newOwnerName.trim() || newTenantName.trim(),
            email: newOwnerEmail.trim(),
            password: newOwnerPassword.trim(),
            tipo: 'admin',
            tenantId: cleanSlug,
            telefone: newOwnerPhone || newTenantPhone,
            ativo: true
          });
          toast.success(`Conta do proprietário (${newOwnerEmail}) criada e vinculada com sucesso!`);
        } catch (ownerErr: any) {
          console.error("Erro ao criar conta de usuário do dono:", ownerErr);
          toast.error(`Barbearia criada, mas falhou ao criar usuário: ${ownerErr.message || ownerErr}`);
        }
      }

      toast.dismiss(toastId);
      toast.success(`Barbearia ${newTenantName} cadastrada com sucesso!`);
      
      // Abrir modal de compartilhamento com o WhatsApp para o superadmin enviar os dados
      setSharePasswordInput(newOwnerPassword || 'Barber123@');
      setShareModalTenant(createdTenant);

      setIsCreateTenantOpen(false);
      
      // Reset campos
      setNewTenantId('');
      setNewTenantName('');
      setNewTenantCnpjCpf('');
      setNewTenantPhone('');
      setNewTenantEmail('');
      setNewTenantStreet('');
      setNewTenantNumber('');
      setNewTenantNeighborhood('');
      setNewTenantCity('');
      setNewTenantState('');
      setNewTenantZipCode('');
      setNewTenantAccentColor('#10B981');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPhone('');
      setNewOwnerPassword('Barber123@');
      setNewMonthlyFeeOverride('');
      setNewTenantNotes('');
      setCreateTenantTab('brand');

      loadData();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro ao criar barbearia: ${err.message || err}`);
    } finally {
      setCreatingTenant(false);
    }
  };

  // Handle User Status Toggle
  const handleToggleUserStatus = async (user: UserProfile) => {
    const nextStatus = user.ativo === false; // Toggle to active if suspended
    const toastId = toast.loading(`${nextStatus ? 'Ativando' : 'Suspendendo'} usuário...`);
    try {
      await userService.updateUserProfile(user.uid, { ativo: nextStatus });
      toast.dismiss(toastId);
      toast.success(`Usuário ${user.nome} foi ${nextStatus ? 'ativado' : 'suspenso'} com sucesso!`);
      loadData(); // Reload stats
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro: ${err.message || err}`);
    }
  };

  // Handle User Role Change Submission
  const handleSaveUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUserRole(true);
    const toastId = toast.loading('Atualizando nível de permissão do usuário...');
    try {
      await userService.updateUserProfile(editingUser.uid, { tipo: editUserRole });
      toast.dismiss(toastId);
      toast.success(`Permissão de ${editingUser.nome} atualizada para ${editUserRole}!`);
      setEditingUser(null);
      loadData();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro: ${err.message || err}`);
    } finally {
      setSavingUserRole(false);
    }
  };

  // Handle Subscription Edit Submission
  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setSavingSub(true);
    const toastId = toast.loading('Salvando alterações da assinatura...');
    try {
      await subscriptionService.updateSubscriptionStatus(editingSub.id, editSubStatus);
      
      // Update Firestore directly for other subscription fields
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      const subRef = doc(db, 'subscriptions', editingSub.id);
      await updateDoc(subRef, {
        endDate: editSubEndDate,
        updatedAt: serverTimestamp()
      });

      toast.dismiss(toastId);
      toast.success('Assinatura atualizada com sucesso!');
      setEditingSub(null);
      loadData();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(`Erro ao atualizar assinatura: ${err.message || err}`);
    } finally {
      setSavingSub(false);
    }
  };

  // Handle AI Co-Pilot Interaction
  const handleAskCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!copilotPrompt.trim()) return;
    setCopilotLoading(true);
    try {
      // Package compact current state for context
      const systemData = {
        usersCount: totalUsersCount,
        activeUsers: activeUsersCount,
        suspendedUsers: suspendedUsersCount,
        activeSubscriptions: totalActiveSubsCount,
        mrr: estimatedMRR.toFixed(2),
        nearExpiryCount: subscriptionsNearExpiry.length,
        usersList: users.map(u => ({ nome: u.nome, email: u.email, tipo: u.tipo, ativo: u.ativo !== false })),
        subscriptionsList: subscriptions.map(s => ({ client: s.cliente_name, plan: s.planName, end: s.endDate, status: s.status }))
      };

      const res = await fetch('/api/saas/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemData, prompt: copilotPrompt })
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setCopilotResponse(data.text);
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha no Co-Pilot: ${err.message || err}`);
    } finally {
      setCopilotLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.nome.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.telefone && u.telefone.includes(userSearch)) ||
      (u.tenantId && u.tenantId.toLowerCase().includes(userSearch.toLowerCase()));
      
    const matchesRole = roleFilter === 'all' || u.tipo === roleFilter;
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && u.ativo !== false) || 
      (statusFilter === 'suspended' && u.ativo === false);

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Filtered Subscriptions
  const filteredSubscriptions = subscriptions.filter(s => {
    const matchesSearch = 
      (s.cliente_name || '').toLowerCase().includes(subSearch.toLowerCase()) ||
      (s.planName || '').toLowerCase().includes(subSearch.toLowerCase()) ||
      (s.tenantId || '').toLowerCase().includes(subSearch.toLowerCase());
      
    const matchesStatus = subStatusFilter === 'all' || s.status === subStatusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      
      {/* Top prestigious Master Header */}
      <header className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white py-6 px-8 flex justify-between items-center shadow-lg border-b border-emerald-900/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/20">
            👑
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
              BarberElite <span className="text-[10px] bg-amber-500 text-slate-950 font-black tracking-widest px-2 py-0.5 rounded uppercase">SaaS ROOT</span>
            </h1>
            <p className="text-[11px] text-emerald-400 font-semibold tracking-wider uppercase">Painel de Superadministração do Sistema</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:block text-right">
            <p className="text-xs font-extrabold text-white">{profile?.nome || 'Super User'}</p>
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{profile?.email}</p>
          </div>
          <button 
            onClick={() => signOut()}
            className="flex items-center gap-2 bg-emerald-900/40 hover:bg-red-500 hover:text-white text-emerald-300 font-bold text-xs py-2 px-4 rounded-xl transition-all border border-emerald-800/60 shadow-sm uppercase tracking-wider"
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      </header>

      {/* Main Content & Dashboard */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-8">
        
        {/* Platform Overview Dashboard Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-emerald-600" size={40} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Metric 1: MRR */}
            <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 p-6 rounded-[2rem] text-white shadow-xl shadow-emerald-900/5 relative overflow-hidden group">
              <div className="absolute right-[-10px] bottom-[-15px] opacity-10 group-hover:scale-110 transition-transform duration-500 text-emerald-200">
                <TrendingUp size={120} strokeWidth={1} />
              </div>
              <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">MRR Total SaaS</p>
              <h3 className="text-3xl font-black mt-2">R$ {calculatedMRR.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
              <p className="text-[10px] text-emerald-300/80 font-bold mt-2">Faturamento por profissional ativo</p>
            </div>

            {/* Metric 2: Total Tenants */}
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
              <div className="absolute right-[-10px] bottom-[-15px] opacity-5 group-hover:scale-110 transition-transform duration-500 text-slate-800">
                <Building2 size={120} strokeWidth={1} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Barbearias Clientes</p>
              <h3 className="text-3xl font-black mt-2 text-slate-900">{totalTenantsCount}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                {activeTenantsCount} Ativas
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block ml-2"></span>
                {totalTenantsCount - activeTenantsCount} Suspensas
              </p>
            </div>

            {/* Metric 3: Active Professionals System Wide */}
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
              <div className="absolute right-[-10px] bottom-[-15px] opacity-5 group-hover:scale-110 transition-transform duration-500 text-slate-800">
                <Users size={120} strokeWidth={1} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Profissionais no Sistema</p>
              <h3 className="text-3xl font-black mt-2 text-slate-900">
                {users.filter(u => (u.tipo === 'barbeiro' || u.tipo === 'gerente') && u.ativo !== false).length}
              </h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-2">Barbeiros e gestores ativos</p>
            </div>

            {/* Metric 4: Total Users */}
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm relative overflow-hidden group">
              <div className="absolute right-[-10px] bottom-[-15px] opacity-5 group-hover:scale-110 transition-transform duration-500 text-slate-800">
                <CreditCard size={120} strokeWidth={1} />
              </div>
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Usuários do Ecossistema</p>
              <h3 className="text-3xl font-black mt-2 text-slate-900">{totalUsersCount}</h3>
              <p className="text-[10px] font-semibold text-slate-500 mt-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                {activeUsersCount} Ativos
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block ml-2"></span>
                {suspendedUsersCount} Suspensos
              </p>
            </div>

          </div>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 gap-2 md:gap-4 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`py-4 px-6 font-black uppercase tracking-widest text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'tenants' 
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-2xl' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Building2 size={16} />
            Barbearias & Limite por Profissional
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`py-4 px-6 font-black uppercase tracking-widest text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'users' 
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-2xl' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users size={16} />
            Gerenciar Usuários
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`py-4 px-6 font-black uppercase tracking-widest text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'subscriptions' 
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-2xl' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <CreditCard size={16} />
            Assinaturas & Vencimentos
          </button>
          <button
            onClick={() => setActiveTab('copilot')}
            className={`py-4 px-6 font-black uppercase tracking-widest text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'copilot' 
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50 rounded-t-2xl' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Bot size={16} />
            Suporte Inteligente IA
          </button>
          <button
            onClick={() => setActiveTab('reset-db')}
            className={`py-4 px-6 font-black uppercase tracking-widest text-xs border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'reset-db' 
                ? 'border-rose-600 text-rose-700 bg-rose-50/50 rounded-t-2xl' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Trash2 size={16} />
            Limpeza de Dados
          </button>
        </div>

        {/* Tab panels */}
        <div className="space-y-6">
          
          {/* TAB 0: TENANTS / BARBERSHOPS MANAGEMENT */}
          {activeTab === 'tenants' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm space-y-6">
              
              {/* Header & Controls */}
              <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                  <h4 className="text-lg font-black text-slate-900 tracking-tight">Gerenciamento de Barbearias & Limite de Profissionais</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Defina a quantidade de profissionais permitida, valor individual por barbeiro e controle o status do plano.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome, slug, responsável..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-64"
                    />
                  </div>

                  {/* Filter by Status */}
                  <select 
                    value={tenantStatusFilter} 
                    onChange={(e) => setTenantStatusFilter(e.target.value)}
                    className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Ativas / Regulares</option>
                    <option value="suspended">Suspensas / Bloqueadas</option>
                  </select>

                  <button 
                    onClick={() => setIsCreateTenantOpen(true)}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-5 py-2.5 rounded-xl transition shadow-md shadow-emerald-600/10 uppercase tracking-wider"
                  >
                    <PlusCircle size={16} />
                    <span>Cadastrar Barbearia</span>
                  </button>
                </div>
              </div>

              {/* Tenants Table */}
              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] uppercase font-black tracking-widest text-slate-400">
                      <th className="py-4 px-6">Barbearia & Identificador</th>
                      <th className="py-4 px-6">Responsável / Contato</th>
                      <th className="py-4 px-6 text-center">Profissionais / Limite</th>
                      <th className="py-4 px-6">Valor Mensal (MRR)</th>
                      <th className="py-4 px-6 text-center">Dia Venc.</th>
                      <th className="py-4 px-6 text-center">Status</th>
                      <th className="py-4 px-6 text-right">Ações SaaS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                    {tenants
                      .filter(t => {
                        const matchSearch = (t.name || '').toLowerCase().includes(tenantSearch.toLowerCase()) ||
                                            (t.id || '').toLowerCase().includes(tenantSearch.toLowerCase()) ||
                                            (t.ownerName || '').toLowerCase().includes(tenantSearch.toLowerCase()) ||
                                            (t.ownerEmail || '').toLowerCase().includes(tenantSearch.toLowerCase());
                        if (tenantStatusFilter === 'active') return matchSearch && t.isActive !== false && t.planStatus !== 'suspended';
                        if (tenantStatusFilter === 'suspended') return matchSearch && (t.isActive === false || t.planStatus === 'suspended');
                        return matchSearch;
                      })
                      .map((tenant) => {
                        const activeProfs = getTenantProfsCount(tenant.id);
                        const maxLimit = tenant.maxProfessionals ?? 5;
                        const pricePerProf = tenant.pricePerProfessional ?? 39.90;
                        const isAtCapacity = activeProfs >= maxLimit;
                        const isBlocked = tenant.isActive === false || tenant.planStatus === 'suspended';

                        // Total fee calculation for display
                        const totalFee = tenant.monthlyFeeOverride && tenant.monthlyFeeOverride > 0
                          ? tenant.monthlyFeeOverride
                          : (Math.max(1, activeProfs) * pricePerProf);

                        return (
                          <tr key={tenant.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white shrink-0 shadow-sm text-sm"
                                  style={{ backgroundColor: tenant.accentColor || '#6366F1' }}
                                >
                                  {tenant.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-extrabold text-slate-900 text-sm">{tenant.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono font-bold">slug: {tenant.id}</p>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-6">
                              <p className="font-bold text-slate-800">{tenant.ownerName || 'Não cadastrado'}</p>
                              <p className="text-[11px] text-slate-400 font-medium">{tenant.ownerEmail || 'Sem e-mail'}</p>
                              {tenant.ownerPhone && <p className="text-[10px] text-slate-400">{tenant.ownerPhone}</p>}
                            </td>

                            <td className="py-4 px-6 text-center">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black ${
                                isAtCapacity 
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                              }`}>
                                {activeProfs} / {maxLimit} pro.
                              </span>
                              {isAtCapacity && (
                                <p className="text-[9px] font-bold text-amber-600 mt-0.5">Limite Atingido</p>
                              )}
                            </td>

                            <td className="py-4 px-6">
                              <p className="font-black text-slate-900 text-sm">
                                R$ {totalFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                              <p className="text-[10px] text-slate-400 font-semibold">
                                {tenant.monthlyFeeOverride ? 'Valor Fixo' : `R$ ${pricePerProf.toFixed(2)} / pro.`}
                              </p>
                            </td>

                            <td className="py-4 px-6 text-center font-black text-slate-700">
                              Dia {tenant.dueDateDay || 10}
                            </td>

                            <td className="py-4 px-6 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                                isBlocked 
                                  ? 'bg-rose-100 text-rose-700' 
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isBlocked ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                                {isBlocked ? 'Suspenso' : 'Ativo'}
                              </span>
                            </td>

                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setSharePasswordInput('Barber123@');
                                    setShareModalTenant(tenant);
                                  }}
                                  title="Gerar Credenciais & Enviar via WhatsApp"
                                  className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition border border-emerald-200/50 flex items-center gap-1 font-bold text-xs"
                                >
                                  <MessageSquare size={15} />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </button>
                                <button
                                  onClick={() => handleOpenEditTenant(tenant)}
                                  title="Editar dados e plano da barbearia"
                                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                >
                                  <Sliders size={15} />
                                </button>
                                <button
                                  onClick={() => handleToggleTenantBlock(tenant)}
                                  title={isBlocked ? "Desbloquear Acesso" : "Bloquear Barbearia"}
                                  className={`p-2 rounded-xl transition ${
                                    isBlocked 
                                      ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' 
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-600'
                                  }`}
                                >
                                  <Power size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                    {tenants.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-sm">
                          Nenhuma barbearia encontrada. Clique em "Cadastrar Barbearia" para criar a primeira.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* TAB 1: USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm space-y-6">
              
              {/* Header & Filter Controls */}
              <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                  <h4 className="text-lg font-black text-slate-900 tracking-tight">Gerenciamento Geral de Usuários</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Pesquise, suspenda contas ou altere permissões de sistema globalmente.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome, e-mail, tenant..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-64"
                    />
                  </div>

                  {/* Filter by Role */}
                  <select 
                    value={roleFilter} 
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Níveis</option>
                    <option value="saas_admin">SaaS Admin (Super)</option>
                    <option value="admin">Dono da Barbearia (Admin)</option>
                    <option value="gerente">Gerente</option>
                    <option value="barbeiro">Barbeiro</option>
                    <option value="cliente">Cliente</option>
                  </select>

                  {/* Filter by Status */}
                  <select 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Ativos</option>
                    <option value="suspended">Suspensos</option>
                  </select>

                  <button 
                    onClick={loadData}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                    title="Atualizar Dados"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Users list table */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-emerald-600" size={30} />
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="p-5">Nome / Email</th>
                          <th className="p-5">Função no Sistema</th>
                          <th className="p-5">Tenant ID / Barbearia</th>
                          <th className="p-5">Status</th>
                          <th className="p-5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                        {filteredUsers.map((u) => {
                          const isActive = u.ativo !== false;
                          return (
                            <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors font-medium">
                              <td className="p-5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                                    {u.nome.substring(0, 2)}
                                  </div>
                                  <div>
                                    <h5 className="font-bold text-slate-900">{u.nome}</h5>
                                    <p className="text-[10px] text-slate-400 font-semibold">{u.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-5">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  u.tipo === 'saas_admin' ? 'bg-amber-100 text-amber-800' :
                                  u.tipo === 'admin' ? 'bg-indigo-100 text-indigo-800' :
                                  u.tipo === 'gerente' ? 'bg-blue-100 text-blue-800' :
                                  u.tipo === 'barbeiro' ? 'bg-purple-100 text-purple-800' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {u.tipo === 'saas_admin' ? 'SaaS Admin' :
                                   u.tipo === 'admin' ? 'Dono/Admin' :
                                   u.tipo === 'gerente' ? 'Gerente' :
                                   u.tipo === 'barbeiro' ? 'Barbeiro' : 'Cliente'}
                                </span>
                              </td>
                              <td className="p-5">
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 py-1 px-2.5 rounded-lg border border-slate-200">
                                  {u.tenantId || 'global'}
                                </span>
                              </td>
                              <td className="p-5">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {isActive ? 'Ativo' : 'Suspenso'}
                                  </span>
                                </div>
                              </td>
                              <td className="p-5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Change Role Button */}
                                  <button 
                                    onClick={() => {
                                      setEditingUser(u);
                                      setEditUserRole(u.tipo || 'cliente');
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] py-1.5 px-3 rounded-lg transition-colors border border-slate-200 uppercase tracking-wider flex items-center gap-1"
                                    title="Mudar papel"
                                  >
                                    Nível
                                  </button>

                                  {/* Suspend/Activate Toggle Button */}
                                  <button 
                                    onClick={() => handleToggleUserStatus(u)}
                                    className={`font-bold text-[10px] py-1.5 px-3 rounded-lg transition-colors uppercase tracking-wider flex items-center gap-1 ${
                                      isActive 
                                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/50' 
                                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/50'
                                    }`}
                                    title={isActive ? 'Suspender Usuário' : 'Ativar Usuário'}
                                  >
                                    {isActive ? <UserX size={12} /> : <UserCheck size={12} />}
                                    {isActive ? 'Suspender' : 'Reativar'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredUsers.length === 0 && (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-slate-400 text-xs font-semibold">
                              Nenhum usuário coincide com a busca e filtros selecionados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUBSCRIPTIONS & EXPIRATIONS */}
          {activeTab === 'subscriptions' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm space-y-6">
              
              {/* Header Controls */}
              <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                  <h4 className="text-lg font-black text-slate-900 tracking-tight">Assinaturas do Ecossistema</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Supervisione as renovações, pacotes ativos, e ajuste vencimentos manualmente.</p>
                </div>

                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar por cliente, plano, tenant..."
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:border-emerald-500 w-64"
                    />
                  </div>

                  {/* Status Filter */}
                  <select 
                    value={subStatusFilter} 
                    onChange={(e) => setSubStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="active">Ativas</option>
                    <option value="expired">Expiradas</option>
                    <option value="trialing">Período de Testes</option>
                    <option value="cancelled">Canceladas</option>
                  </select>

                  <button 
                    onClick={loadData}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
                    title="Atualizar Dados"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Table list */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="animate-spin text-emerald-600" size={30} />
                </div>
              ) : (
                <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          <th className="p-5">Cliente / Usuário</th>
                          <th className="p-5">Plano / Pacote</th>
                          <th className="p-5">Início / Término</th>
                          <th className="p-5">Progresso de Uso</th>
                          <th className="p-5">Status</th>
                          <th className="p-5 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                        {filteredSubscriptions.map((s) => {
                          const today = new Date();
                          const end = s.endDate ? new Date(s.endDate) : null;
                          const isNearExpiry = end && s.status === 'active' && ((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 10);
                          
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50 transition-colors font-medium">
                              <td className="p-5">
                                <h5 className="font-bold text-slate-900">{s.cliente_name || 'Cliente de Assinatura'}</h5>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Tenant: {s.tenantId}</p>
                              </td>
                              <td className="p-5">
                                <span className="font-extrabold text-slate-800 bg-slate-50 py-1 px-2.5 rounded-lg border border-slate-100">
                                  {s.planName || 'Elite Premium'}
                                </span>
                              </td>
                              <td className="p-5">
                                <div className="space-y-0.5">
                                  <p className="text-[10px] text-slate-500 font-semibold">De: {s.startDate || '-'}</p>
                                  <p className={`font-bold flex items-center gap-1 ${isNearExpiry ? 'text-amber-600' : 'text-slate-700'}`}>
                                    Até: {s.endDate || '-'}
                                    {isNearExpiry && <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Urgente</span>}
                                  </p>
                                </div>
                              </td>
                              <td className="p-5 text-slate-500">
                                <p className="text-[10px] font-semibold">Cortes: <strong className="text-slate-800">{s.haircutsUsed || 0}</strong></p>
                                <p className="text-[10px] font-semibold">Barba: <strong className="text-slate-800">{s.beardsUsed || 0}</strong></p>
                              </td>
                              <td className="p-5">
                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                  s.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                                  s.status === 'expired' ? 'bg-rose-100 text-rose-800' :
                                  s.status === 'trialing' ? 'bg-amber-100 text-amber-800' :
                                  'bg-slate-100 text-slate-500'
                                }`}>
                                  {s.status === 'active' ? 'Ativo' :
                                   s.status === 'expired' ? 'Expirado' :
                                   s.status === 'trialing' ? 'Teste' : 'Cancelado'}
                                </span>
                              </td>
                              <td className="p-5 text-right">
                                <button 
                                  onClick={() => {
                                    setEditingSub(s);
                                    setEditSubEndDate(s.endDate || '');
                                    setEditSubStatus(s.status);
                                  }}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] py-1.5 px-3 rounded-lg border border-slate-200 uppercase tracking-widest active:scale-95 transition-all"
                                >
                                  Editar
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredSubscriptions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-slate-400 text-xs font-semibold">
                              Nenhuma assinatura registrada no sistema.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: AI CO-PILOT */}
          {activeTab === 'copilot' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 border border-emerald-200 rounded-2xl flex items-center justify-center text-emerald-700">
                  <Bot size={22} className="text-emerald-700" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    Co-Pilot Inteligente da Plataforma
                    <span className="bg-emerald-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-widest">Gemini AI</span>
                  </h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Consulte estatísticas agregadas, projeções financeiras, riscos de churn ou redija comunicações imediatas.</p>
                </div>
              </div>

              {/* Conversation Area */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Suggestions Sidebar */}
                <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-[1.5rem] p-5 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Sugestões de Consultas</p>
                  
                  <button 
                    onClick={() => setCopilotPrompt("Forneça um panorama financeiro e estimativa de receita da plataforma. Qual é o faturamento total com as assinaturas Bronze, Silver e Elite?")}
                    className="w-full text-left p-3.5 bg-white hover:border-emerald-500 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 transition-all shadow-sm active:scale-95"
                  >
                    📊 Análise de Receita (MRR)
                  </button>

                  <button 
                    onClick={() => setCopilotPrompt("Quais assinaturas estão próximas do vencimento? Faça uma lista contendo os nomes dos clientes e redija um e-mail de cobrança amigável para eles.")}
                    className="w-full text-left p-3.5 bg-white hover:border-emerald-500 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 transition-all shadow-sm active:scale-95"
                  >
                    🔔 Redigir Alerta de Renovação
                  </button>

                  <button 
                    onClick={() => setCopilotPrompt("Como posso incentivar novos donos de barbearias a assinarem o plano Elite? Elabore um roteiro de marketing direto para donos inativos.")}
                    className="w-full text-left p-3.5 bg-white hover:border-emerald-500 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 transition-all shadow-sm active:scale-95"
                  >
                    🎯 Roteiro de Engajamento / Vendas
                  </button>
                </div>

                {/* Prompt Chat Interface */}
                <div className="lg:col-span-8 space-y-4">
                  <form onSubmit={handleAskCopilot} className="space-y-3">
                    <textarea 
                      rows={4}
                      value={copilotPrompt}
                      onChange={(e) => setCopilotPrompt(e.target.value)}
                      placeholder="Pergunte à IA: 'Como estão as assinaturas ativas?' ou 'Crie uma mensagem para os clientes vencendo em breve'..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800 resize-none"
                    />
                    <div className="flex justify-end">
                      <button 
                        type="submit"
                        disabled={copilotLoading || !copilotPrompt.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-600/10 flex items-center gap-2 disabled:opacity-50 uppercase tracking-widest"
                      >
                        {copilotLoading ? (
                          <>
                            <Loader2 className="animate-spin" size={14} />
                            Analisando Ecossistema...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            Enviar Consulta à IA
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* AI Response Display */}
                  <AnimatePresence>
                    {(copilotResponse || copilotLoading) && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-emerald-50/50 border border-emerald-100 p-6 rounded-[2rem] space-y-4 shadow-inner"
                      >
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 flex items-center gap-1.5">
                          <Bot size={14} className="text-emerald-700" />
                          Resultado da Consulta
                        </p>
                        
                        {copilotLoading ? (
                          <div className="flex items-center gap-3 text-xs text-emerald-700 font-bold py-6">
                            <Loader2 className="animate-spin text-emerald-600" size={18} />
                            <span>Mapeando banco de dados e processando resposta com o Gemini 3.5 Flash...</span>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-700 leading-relaxed font-semibold space-y-4 whitespace-pre-line">
                            {copilotResponse}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            </div>
          )}

          {/* TAB 4: DATABASE CLEANUP / RESET */}
          {activeTab === 'reset-db' && (
            <div className="bg-white border border-slate-200 rounded-[2rem] p-6 md:p-8 shadow-sm space-y-8">
              <div>
                <h4 className="text-lg font-black text-rose-600 tracking-tight flex items-center gap-2">
                  <ShieldAlert size={22} className="text-rose-600 animate-pulse" />
                  Reset Total e Limpeza do Sistema (Apenas para Testes)
                </h4>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Esta aba contém a funcionalidade de limpeza geral do banco de dados, excluindo todos os dados de testes.</p>
              </div>

              <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl space-y-4">
                <h5 className="text-sm font-black text-rose-800 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-rose-600" />
                  AVISO: Ação Irreversível!
                </h5>
                <p className="text-xs text-rose-700 leading-relaxed font-semibold">
                  Ao acionar o reset do sistema, todos os seguintes registros serão deletados do Firestore permanentemente:
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-rose-700 font-extrabold ml-2">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Agendamentos (Appointments)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Transações Financeiras (Finance)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Comandas e Vendas fechadas
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Profissionais e Comissões
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Produtos e Estoque
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    Serviços e Categorias
                  </li>
                </ul>

                <div className="bg-rose-100/50 p-4 rounded-2xl text-[11px] text-rose-800 font-black border border-rose-200">
                  <p>✓ MANTIDO:</p>
                  <p className="font-semibold text-rose-700 ml-3">
                    - Seu login atual (saas_admin) não será excluído, permitindo que você continue autenticado normalmente.
                  </p>
                </div>
              </div>

              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                    Para confirmar o reset geral, digite <span className="text-rose-600 font-extrabold font-mono">EXCLUIR</span> abaixo:
                  </label>
                  <input 
                    type="text" 
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Digite EXCLUIR para resetar"
                    disabled={isResetting}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-500/10 focus:border-rose-500 transition-all text-rose-700 placeholder-slate-400 font-mono"
                  />
                </div>

                <button
                  type="button"
                  disabled={confirmText !== 'EXCLUIR' || isResetting}
                  onClick={async () => {
                    if (confirmText !== 'EXCLUIR') return;
                    setIsResetting(true);
                    const loadingToastId = toast.loading("Excluindo todos os dados do banco...");
                    try {
                      const result = await resetService.resetAllDatabase();
                      toast.dismiss(loadingToastId);
                      
                      if (result.error) {
                        toast.error(`Erro ao resetar: ${result.error}`);
                      } else {
                        toast.success(`Banco limpo! ${result.totalDeleted} registros deletados.`);
                        setConfirmText('');
                        setTimeout(() => {
                          window.location.reload();
                        }, 2000);
                      }
                    } catch (err: any) {
                      toast.dismiss(loadingToastId);
                      toast.error(`Erro no reset: ${err.message || err}`);
                    } finally {
                      setIsResetting(false);
                    }
                  }}
                  className="w-full bg-rose-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Executando Reset de Fábrica...
                    </>
                  ) : (
                    <>
                      <Trash2 size={18} />
                      Confirmar Reset de Dados
                    </>
                  )}
                </button>
              </div>

            </div>
          )}

        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest mt-auto">
        BarberElite SaaS Admin Cockpit v2.1.0 • Todos os Direitos Reservados
      </footer>

      {/* MODAL 1: CHANGE PERMISSIONS / USER ROLE */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-100 z-10 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-black text-slate-900">Mudar Permissões</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{editingUser.nome}</p>
                </div>
                <button 
                  onClick={() => setEditingUser(null)}
                  className="p-1 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveUserRole} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selecione o Novo Nível</label>
                  <select 
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                  >
                    <option value="saas_admin">Superadministrador (saas_admin)</option>
                    <option value="admin">Dono da Barbearia (admin)</option>
                    <option value="gerente">Gerente de Unidade (gerente)</option>
                    <option value="barbeiro">Barbeiro / Colaborador (barbeiro)</option>
                    <option value="cliente">Cliente da Agenda (cliente)</option>
                  </select>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={savingUserRole}
                    className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-600/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {savingUserRole ? 'Salvando...' : 'Atualizar Permissão'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: EDIT SUBSCRIPTION DATES & STATUS */}
      <AnimatePresence>
        {editingSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSub(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Box */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] p-8 shadow-2xl border border-slate-100 z-10 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-black text-slate-900">Ajustar Assinatura</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{editingSub.cliente_name}</p>
                </div>
                <button 
                  onClick={() => setEditingSub(null)}
                  className="p-1 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveSubscription} className="space-y-6">
                {/* Due Date input */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Vencimento / Término</label>
                  <input 
                    type="date"
                    value={editSubEndDate}
                    onChange={(e) => setEditSubEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                  />
                </div>

                {/* Status selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status da Assinatura</label>
                  <select 
                    value={editSubStatus}
                    onChange={(e) => setEditSubStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                  >
                    <option value="active">Ativa / Regularizada</option>
                    <option value="expired">Expirada / Churn</option>
                    <option value="trialing">Período de Experiência (Trial)</option>
                    <option value="cancelled">Cancelada permanentemente</option>
                  </select>
                </div>

                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setEditingSub(null)}
                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={savingSub}
                    className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-600/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {savingSub ? 'Salvando...' : 'Salvar Assinatura'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: EDIT TENANT LIMITS, DATA & BILLING */}
      <AnimatePresence>
        {editingTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingTenant(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] p-6 md:p-8 shadow-2xl border border-slate-100 z-10 space-y-6 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-black text-slate-900">Editar Barbearia</h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">{editingTenant.name} (ID: {editingTenant.id})</p>
                </div>
                <button 
                  onClick={() => setEditingTenant(null)}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Edit Modal Navigation Tabs */}
              <div className="flex border-b border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => setEditTenantTab('brand')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    editTenantTab === 'brand'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Building size={14} />
                  Empresa & Endereço
                </button>
                <button
                  type="button"
                  onClick={() => setEditTenantTab('owner')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    editTenantTab === 'owner'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Users size={14} />
                  Proprietário
                </button>
                <button
                  type="button"
                  onClick={() => setEditTenantTab('billing')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    editTenantTab === 'billing'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <CreditCard size={14} />
                  Plano & Cobrança
                </button>
              </div>

              <form onSubmit={handleSaveTenant} className="space-y-5">
                
                {/* TAB 1: Marca & Endereço */}
                {editTenantTab === 'brand' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Barbearia</label>
                        <input 
                          type="text"
                          value={editTenantName}
                          onChange={(e) => setEditTenantName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ / CPF</label>
                        <input 
                          type="text"
                          value={editTenantCnpjCpf}
                          onChange={(e) => setEditTenantCnpjCpf(e.target.value)}
                          placeholder="00.000.000/0001-00"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                        <input 
                          type="text"
                          value={editTenantPhone}
                          onChange={(e) => setEditTenantPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Comercial</label>
                        <input 
                          type="email"
                          value={editTenantEmail}
                          onChange={(e) => setEditTenantEmail(e.target.value)}
                          placeholder="contato@barbearia.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cor da Marca (Accent)</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="color"
                          value={editTenantAccentColor}
                          onChange={(e) => setEditTenantAccentColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border-0"
                        />
                        <div className="flex gap-2">
                          {['#10B981', '#6366F1', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'].map(color => (
                            <button
                              type="button"
                              key={color}
                              onClick={() => setEditTenantAccentColor(color)}
                              className="w-7 h-7 rounded-lg border-2 border-white shadow-sm"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin size={14} className="text-emerald-600" />
                        Endereço
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">CEP</label>
                          <input 
                            type="text" 
                            value={editTenantZipCode} 
                            onChange={(e) => setEditTenantZipCode(e.target.value)}
                            placeholder="86000-000"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Rua / Logradouro</label>
                          <input 
                            type="text" 
                            value={editTenantStreet} 
                            onChange={(e) => setEditTenantStreet(e.target.value)}
                            placeholder="Rua das Flores"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Número</label>
                          <input 
                            type="text" 
                            value={editTenantNumber} 
                            onChange={(e) => setEditTenantNumber(e.target.value)}
                            placeholder="123"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Bairro</label>
                          <input 
                            type="text" 
                            value={editTenantNeighborhood} 
                            onChange={(e) => setEditTenantNeighborhood(e.target.value)}
                            placeholder="Centro"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Cidade</label>
                          <input 
                            type="text" 
                            value={editTenantCity} 
                            onChange={(e) => setEditTenantCity(e.target.value)}
                            placeholder="Londrina"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">UF</label>
                          <input 
                            type="text" 
                            value={editTenantState} 
                            onChange={(e) => setEditTenantState(e.target.value)}
                            placeholder="PR"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 uppercase"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Responsável / Proprietário */}
                {editTenantTab === 'owner' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Proprietário</label>
                      <input 
                        type="text"
                        value={editTenantOwnerName}
                        onChange={(e) => setEditTenantOwnerName(e.target.value)}
                        placeholder="Nome completo do dono"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail do Proprietário</label>
                        <input 
                          type="email"
                          value={editTenantOwnerEmail}
                          onChange={(e) => setEditTenantOwnerEmail(e.target.value)}
                          placeholder="dono@barbearia.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp do Proprietário</label>
                        <input 
                          type="text"
                          value={editTenantOwnerPhone}
                          onChange={(e) => setEditTenantOwnerPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: Plano & Cobrança */}
                {editTenantTab === 'billing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Limite de Profissionais</label>
                        <input 
                          type="number"
                          min="1"
                          max="100"
                          value={editTenantMaxProfs}
                          onChange={(e) => setEditTenantMaxProfs(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor por Profissional (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          value={editTenantPricePerProf}
                          onChange={(e) => setEditTenantPricePerProf(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mensalidade Fixa (Opcional)</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="Ex: 199.00"
                          value={editTenantFeeOverride}
                          onChange={(e) => setEditTenantFeeOverride(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dia de Vencimento</label>
                        <input 
                          type="number"
                          min="1"
                          max="31"
                          value={editTenantDueDateDay}
                          onChange={(e) => setEditTenantDueDateDay(parseInt(e.target.value) || 10)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status da Barbearia</label>
                      <select 
                        value={editTenantPlanStatus}
                        onChange={(e) => setEditTenantPlanStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                      >
                        <option value="active">Ativa / Liberada</option>
                        <option value="pending">Pendente de Pagamento</option>
                        <option value="suspended">Suspenso / Bloqueada</option>
                        <option value="canceled">Cancelado</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notas Internas</label>
                      <textarea
                        rows={2}
                        value={editTenantNotes}
                        onChange={(e) => setEditTenantNotes(e.target.value)}
                        placeholder="Observações administrativas..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-medium text-slate-800"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setEditingTenant(null)}
                    className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={savingTenant}
                    className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-600/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {savingTenant ? 'Salvando...' : 'Salvar Barbearia'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: CREATE NEW TENANT (PRO TABBED ONBOARDING) */}
      <AnimatePresence>
        {isCreateTenantOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateTenantOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] p-6 md:p-8 shadow-2xl border border-slate-100 z-10 space-y-6 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Building2 className="text-emerald-600" size={20} />
                    Cadastrar Nova Barbearia SaaS
                  </h4>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">Captura completa e onboarding profissional de parceiro.</p>
                </div>
                <button 
                  onClick={() => setIsCreateTenantOpen(false)}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Navigation Tabs for Create */}
              <div className="flex border-b border-slate-100 gap-2">
                <button
                  type="button"
                  onClick={() => setCreateTenantTab('brand')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    createTenantTab === 'brand'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Building size={14} />
                  1. Empresa & Endereço
                </button>
                <button
                  type="button"
                  onClick={() => setCreateTenantTab('owner')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    createTenantTab === 'owner'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Users size={14} />
                  2. Proprietário & Acesso
                </button>
                <button
                  type="button"
                  onClick={() => setCreateTenantTab('billing')}
                  className={`pb-3 px-4 font-black text-xs uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 ${
                    createTenantTab === 'billing'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <CreditCard size={14} />
                  3. Plano & Mensalidade
                </button>
              </div>

              <form onSubmit={handleCreateTenantSubmit} className="space-y-5">
                
                {/* TAB 1: Marca e Endereço */}
                {createTenantTab === 'brand' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Identificador Slug (Link)</label>
                        <input 
                          type="text"
                          value={newTenantId}
                          onChange={(e) => setNewTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                          placeholder="ex: barbearia-elite"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                          required
                        />
                        <p className="text-[9px] text-slate-400 ml-1">Define a URL isolada da barbearia</p>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Barbearia</label>
                        <input 
                          type="text"
                          value={newTenantName}
                          onChange={(e) => setNewTenantName(e.target.value)}
                          placeholder="ex: Barbearia Elite Premium"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">CNPJ / CPF</label>
                        <input 
                          type="text"
                          value={newTenantCnpjCpf}
                          onChange={(e) => setNewTenantCnpjCpf(e.target.value)}
                          placeholder="00.000.000/0001-00"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone Comercial</label>
                        <input 
                          type="text"
                          value={newTenantPhone}
                          onChange={(e) => setNewTenantPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Comercial</label>
                        <input 
                          type="email"
                          value={newTenantEmail}
                          onChange={(e) => setNewTenantEmail(e.target.value)}
                          placeholder="contato@barbearia.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Color selection */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cor Principal da Barbearia</label>
                      <div className="flex items-center gap-3">
                        <input 
                          type="color"
                          value={newTenantAccentColor}
                          onChange={(e) => setNewTenantAccentColor(e.target.value)}
                          className="w-10 h-10 rounded-xl cursor-pointer border-0"
                        />
                        <div className="flex gap-2">
                          {['#10B981', '#6366F1', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'].map(color => (
                            <button
                              type="button"
                              key={color}
                              onClick={() => setNewTenantAccentColor(color)}
                              className="w-7 h-7 rounded-lg border-2 border-white shadow-sm"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Address Fields */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <MapPin size={14} className="text-emerald-600" />
                        Endereço Completo
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">CEP</label>
                          <input 
                            type="text" 
                            value={newTenantZipCode} 
                            onChange={(e) => setNewTenantZipCode(e.target.value)}
                            placeholder="86000-000"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Rua / Logradouro</label>
                          <input 
                            type="text" 
                            value={newTenantStreet} 
                            onChange={(e) => setNewTenantStreet(e.target.value)}
                            placeholder="Av. Principal"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Número</label>
                          <input 
                            type="text" 
                            value={newTenantNumber} 
                            onChange={(e) => setNewTenantNumber(e.target.value)}
                            placeholder="100"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Bairro</label>
                          <input 
                            type="text" 
                            value={newTenantNeighborhood} 
                            onChange={(e) => setNewTenantNeighborhood(e.target.value)}
                            placeholder="Centro"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">Cidade</label>
                          <input 
                            type="text" 
                            value={newTenantCity} 
                            onChange={(e) => setNewTenantCity(e.target.value)}
                            placeholder="Londrina"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase">UF</label>
                          <input 
                            type="text" 
                            value={newTenantState} 
                            onChange={(e) => setNewTenantState(e.target.value)}
                            placeholder="PR"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 uppercase"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-3">
                      <button 
                        type="button" 
                        onClick={() => setCreateTenantTab('owner')}
                        className="bg-emerald-600 text-white font-black text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider hover:bg-emerald-700"
                      >
                        Próximo: Proprietário &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: Responsável & Usuário Acesso */}
                {createTenantTab === 'owner' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Proprietário</label>
                      <input 
                        type="text"
                        value={newOwnerName}
                        onChange={(e) => setNewOwnerName(e.target.value)}
                        placeholder="ex: João Silva"
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail do Proprietário (Login)</label>
                        <input 
                          type="email"
                          value={newOwnerEmail}
                          onChange={(e) => setNewOwnerEmail(e.target.value)}
                          placeholder="dono@barbearia.com"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">WhatsApp / Celular</label>
                        <input 
                          type="text"
                          value={newOwnerPhone}
                          onChange={(e) => setNewOwnerPhone(e.target.value)}
                          placeholder="(11) 99999-9999"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Auto Create User Account Toggle */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Key className="text-emerald-600" size={18} />
                          <div>
                            <p className="text-xs font-black text-slate-900">Criar Usuário Administrador no Sistema</p>
                            <p className="text-[10px] text-slate-500">Cria a conta automaticamente para o proprietário entrar imediatamente.</p>
                          </div>
                        </div>
                        <input 
                          type="checkbox"
                          checked={createOwnerAccount}
                          onChange={(e) => setCreateOwnerAccount(e.target.checked)}
                          className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                        />
                      </label>

                      {createOwnerAccount && (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Senha Inicial do Dono</label>
                          <div className="flex gap-2">
                            <input 
                              type="text"
                              value={newOwnerPassword}
                              onChange={(e) => setNewOwnerPassword(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setNewOwnerPassword(`Barber${Math.floor(100 + Math.random() * 900)}@`)}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] px-3 py-2 rounded-xl whitespace-nowrap"
                            >
                              Gerar Nova
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between pt-3">
                      <button 
                        type="button" 
                        onClick={() => setCreateTenantTab('brand')}
                        className="bg-slate-100 text-slate-600 font-black text-xs px-4 py-2.5 rounded-xl uppercase tracking-wider hover:bg-slate-200"
                      >
                        &larr; Voltar
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setCreateTenantTab('billing')}
                        className="bg-emerald-600 text-white font-black text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider hover:bg-emerald-700"
                      >
                        Próximo: Plano &rarr;
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 3: Plano & Mensalidade */}
                {createTenantTab === 'billing' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Limite Max. de Profissionais</label>
                        <input 
                          type="number"
                          min="1"
                          max="100"
                          value={newMaxProfs}
                          onChange={(e) => setNewMaxProfs(parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Preço por Profissional (R$)</label>
                        <input 
                          type="number"
                          step="0.01"
                          min="0"
                          value={newPricePerProf}
                          onChange={(e) => setNewPricePerProf(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mensalidade Fixa (Opcional)</label>
                        <input 
                          type="number"
                          step="0.01"
                          placeholder="Ex: 199.00"
                          value={newMonthlyFeeOverride}
                          onChange={(e) => setNewMonthlyFeeOverride(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Dia de Vencimento</label>
                        <input 
                          type="number"
                          min="1"
                          max="31"
                          value={newDueDateDay}
                          onChange={(e) => setNewDueDateDay(parseInt(e.target.value) || 10)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status do Acesso</label>
                      <select 
                        value={newPlanStatus}
                        onChange={(e) => setNewPlanStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer text-slate-800"
                      >
                        <option value="active">Ativo / Acesso Liberado</option>
                        <option value="pending">Pendente de Pagamento Inicial</option>
                        <option value="suspended">Suspenso / Bloqueado</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações Internas</label>
                      <textarea
                        rows={2}
                        value={newTenantNotes}
                        onChange={(e) => setNewTenantNotes(e.target.value)}
                        placeholder="Ex: Cliente fechou contrato anual por indicação..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-xs font-medium text-slate-800"
                      />
                    </div>

                    <div className="flex gap-3 justify-between pt-4 border-t border-slate-100">
                      <button 
                        type="button" 
                        onClick={() => setCreateTenantTab('owner')}
                        className="bg-slate-100 text-slate-600 font-black text-xs px-4 py-2.5 rounded-xl uppercase tracking-wider hover:bg-slate-200"
                      >
                        &larr; Voltar
                      </button>
                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => setIsCreateTenantOpen(false)}
                          className="px-4 py-3 rounded-xl border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                        >
                          Cancelar
                        </button>
                        <button 
                          type="submit"
                          disabled={creatingTenant}
                          className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-md shadow-emerald-600/10 active:scale-95 transition-all disabled:opacity-50"
                        >
                          {creatingTenant ? 'Cadastrando...' : 'Concluir & Criar Barbearia'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: SHARE CREDENTIALS / WHATSAPP TEMPLATE */}
      <AnimatePresence>
        {shareModalTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShareModalTenant(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-white rounded-[2rem] p-6 md:p-8 shadow-2xl border border-slate-100 z-10 space-y-6"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-black">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-slate-900">Enviar Acesso no WhatsApp</h4>
                    <p className="text-xs text-slate-500 font-semibold">{shareModalTenant.name}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShareModalTenant(null)}
                  className="p-1.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Acesso para a Mensagem</label>
                  <input 
                    type="text" 
                    value={sharePasswordInput}
                    onChange={(e) => setSharePasswordInput(e.target.value)}
                    placeholder="Barber123@"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800"
                  />
                </div>

                {/* Formatted Message Box */}
                {(() => {
                  const systemUrl = `${window.location.origin}/?tenant=${shareModalTenant.id}`;
                  const ownerName = shareModalTenant.ownerName || 'Parceiro';
                  const email = shareModalTenant.ownerEmail || shareModalTenant.email || 'seu-email';
                  const waText = `*Olá, ${ownerName}!* 👋🏼\n\nSeu sistema de gestão e agendamentos *${shareModalTenant.name}* está pronto e liberado!\n\n🔗 *Link do Painel:* ${systemUrl}\n👤 *Login/E-mail:* ${email}\n🔑 *Senha Inicial:* ${sharePasswordInput}\n\nQualquer dúvida, estamos à disposição!🚀`;
                  
                  return (
                    <div className="space-y-3">
                      <div className="p-4 bg-emerald-50/70 border border-emerald-200/60 rounded-2xl font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {waText}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(waText);
                            toast.success('Mensagem copiada para a área de transferência!');
                          }}
                          className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-3 px-4 rounded-xl transition"
                        >
                          <Copy size={16} />
                          Copiar Texto
                        </button>

                        <button
                          onClick={() => {
                            const cleanPhone = (shareModalTenant.ownerPhone || shareModalTenant.phone || '').replace(/\D/g, '');
                            const encodedMsg = encodeURIComponent(waText);
                            const waUrl = cleanPhone 
                              ? `https://wa.me/55${cleanPhone}?text=${encodedMsg}`
                              : `https://wa.me/?text=${encodedMsg}`;
                            window.open(waUrl, '_blank');
                          }}
                          className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-4 rounded-xl shadow-md shadow-emerald-600/20 transition"
                        >
                          <MessageSquare size={16} />
                          Abrir no WhatsApp
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
