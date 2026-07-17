import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Package, 
  User, 
  LogOut, 
  Search, 
  Phone, 
  Clock, 
  TrendingUp, 
  CheckCircle2, 
  Play, 
  XCircle, 
  Target, 
  Edit3, 
  Save, 
  Plus, 
  ChevronRight, 
  AlertTriangle, 
  Scissors,
  Check,
  AlertCircle,
  Lock,
  Unlock,
  Trash2,
  ArrowRightLeft,
  Loader2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { appointmentService } from '../services/appointmentService';
import { commissionService } from '../services/commissionService';
import { inventoryService } from '../services/inventoryService';
import { agendaBlockService } from '../services/agendaBlockService';
import { AppointmentModal } from '../components/Agenda/AppointmentModal';
import { ComandaModal } from '../components/Comanda/ComandaModal';
import { AgendaGeneral } from '../components/Agenda/AgendaGeneral';
import { UserProfile, Appointment, Product, Commission, AppointmentStatus, AgendaBlock, ProfessionalAdvance, ProfessionalPayment } from '../types';
import { toast } from 'sonner';
import { format, parse, addDays, startOfDay, endOfDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PortalBarbeiroProps {
  profile: UserProfile;
}

export function PortalBarbeiro({ profile }: PortalBarbeiroProps) {
  const [activeTab, setActiveTab] = useState<'agenda' | 'clientes' | 'comissao' | 'estoque' | 'perfil'>('agenda');
  
  // Tab states: Agenda
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  // New Modals State for Barber manual control
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [isManualComandaOpen, setIsManualComandaOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ time: string, profissional_id: string } | null>(null);

  const comandaInitialData = React.useMemo(() => {
    if (!selectedAppointment) return undefined;
    return {
      agendamento_id: selectedAppointment.id,
      cliente_id: selectedAppointment.cliente_id,
      cliente_name: selectedAppointment.cliente_name,
      profissional_id: selectedAppointment.profissional_id,
      profissional_name: selectedAppointment.profissional_name,
      observations: selectedAppointment.notes,
      items: [{
        id: `item-${selectedAppointment.id}-${Date.now()}`,
        type: 'servico' as const,
        referencia_id: selectedAppointment.servico_id,
        name: selectedAppointment.servico_name,
        quantity: 1,
        unitPrice: selectedAppointment.price,
        totalPrice: selectedAppointment.price,
        profissional_id: selectedAppointment.profissional_id,
        profissional_name: selectedAppointment.profissional_name,
        isCortesia: false,
        generateCommission: true
      }]
    };
  }, [selectedAppointment]);
  
  // Tab states: Agenda Blocks
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  
  // Tab states: Clientes
  const [clientes, setClientes] = useState<UserProfile[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  
  // Tab states: Comissão
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [advances, setAdvances] = useState<ProfessionalAdvance[]>([]);
  const [payouts, setPayouts] = useState<ProfessionalPayment[]>([]);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago'>('todos');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'comissao' | 'vale'>('todos');
  const [loadingCommissions, setLoadingCommissions] = useState(true);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [personalDailyGoal, setPersonalDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem(`barber_daily_goal_${profile.uid}`);
    return saved ? parseInt(saved, 10) : 5; // Default 5 clients
  });
  const [personalMonthlyGoal, setPersonalMonthlyGoal] = useState<number>(() => {
    const saved = localStorage.getItem(`barber_monthly_goal_${profile.uid}`);
    return saved ? parseFloat(saved) : 2500; // Default R$ 2500 in commissions
  });
  const [newDailyGoal, setNewDailyGoal] = useState<string>('');
  const [newMonthlyGoal, setNewMonthlyGoal] = useState<string>('');

  // Tab states: Estoque
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Horizontal date-strip list
  const dateStrip = React.useMemo(() => {
    const dates = [];
    for (let i = -2; i < 6; i++) {
      const d = addDays(new Date(), i);
      dates.push({
        iso: format(d, 'yyyy-MM-dd'),
        dayName: format(d, 'EEE', { locale: ptBR }).replace('.', ''),
        dayNum: format(d, 'd'),
        label: format(d, "dd 'de' MMMM", { locale: ptBR }),
        isToday: isToday(d)
      });
    }
    return dates;
  }, []);

  // 1. Listen to Appointments
  useEffect(() => {
    setLoadingAppointments(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const unsubscribe = appointmentService.subscribeToAppointments(
      { date: dateStr, profissional_id: profile.uid },
      (data) => {
        setAppointments(data);
        setLoadingAppointments(false);
      }
    );
    return () => unsubscribe();
  }, [selectedDate, profile.uid]);

  // 1.1. Listen to Agenda Blocks
  useEffect(() => {
    setLoadingBlocks(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const unsubscribe = agendaBlockService.subscribeToBlocks(
      { date: dateStr, profissional_id: profile.uid },
      (data) => {
        setBlocks(data);
        setLoadingBlocks(false);
      }
    );
    return () => unsubscribe();
  }, [selectedDate, profile.uid]);

  // 2. Subscribe to all Clients at mount
  useEffect(() => {
    const unsubscribe = userService.subscribeToAllClients(true, (data) => {
      setClientes(data);
    });
    return () => unsubscribe();
  }, []);

  // 3. Fetch Commissions and Financial Data when entering Comissão tab
  useEffect(() => {
    if (activeTab === 'comissao' || activeTab === 'agenda') {
      setLoadingCommissions(true);
      Promise.all([
        commissionService.getCommissions({ profissional_id: profile.uid }),
        commissionService.getAdvances({ profissional_id: profile.uid }),
        commissionService.getPayouts(profile.uid)
      ]).then(([commsData, advsData, payoutsData]) => {
        setCommissions(commsData);
        setAdvances(advsData);
        setPayouts(payoutsData);
        setLoadingCommissions(false);
      }).catch(err => {
        console.error(err);
        toast.error('Erro ao carregar dados financeiros.');
        setLoadingCommissions(false);
      });
    }
  }, [activeTab, profile.uid]);

  // 4. Fetch Products when entering Estoque tab
  useEffect(() => {
    if (activeTab === 'estoque') {
      setLoadingProducts(true);
      inventoryService.getProducts()
        .then(data => {
          setProducts(data);
          setLoadingProducts(false);
        })
        .catch(err => {
          console.error(err);
          toast.error('Erro ao carregar estoque de produtos.');
          setLoadingProducts(false);
        });
    }
  }, [activeTab]);

  // Update appointment status
  const handleUpdateStatus = async (appointmentId: string, newStatus: AppointmentStatus) => {
    try {
      await appointmentService.updateAppointment(appointmentId, { status: newStatus });
      toast.success(`Status atualizado para ${newStatus.replace('_', ' ')}!`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao atualizar status: ${err.message || err}`);
    }
  };

  // Create a block
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockStartTime >= blockEndTime) {
      toast.error('O horário de término deve ser posterior ao horário de início.');
      return;
    }

    try {
      await agendaBlockService.createBlock({
        profissional_id: profile.uid,
        profissional_name: profile.nome,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: blockStartTime,
        endTime: blockEndTime,
        reason: blockReason.trim() || 'Bloqueio de agenda',
        isGeneral: false
      });
      toast.success('Horário bloqueado com sucesso!');
      setIsBlockModalOpen(false);
      setBlockReason('');
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao bloquear horário: ${err.message || err}`);
    }
  };

  // Delete/unblock a time
  const handleUnblockTime = async (blockId: string) => {
    try {
      await agendaBlockService.deleteBlock(blockId);
      toast.success('Horário desbloqueado com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao desbloquear horário: ${err.message || err}`);
    }
  };

  const handleNewAppointment = (time?: string, profissional_id?: string) => {
    setSelectedTimeSlot(time && profissional_id ? { time, profissional_id } : { time: '09:00', profissional_id: profile.uid });
    setSelectedAppointment(null);
    setIsAppointmentModalOpen(true);
  };

  const handleOpenAppointment = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsAppointmentModalOpen(true);
  };

  const handleOpenComanda = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsComandaModalOpen(true);
  };

  // Save personal goals
  const handleSaveGoals = (e: React.FormEvent) => {
    e.preventDefault();
    const daily = parseInt(newDailyGoal, 10);
    const monthly = parseFloat(newMonthlyGoal);
    
    if (isNaN(daily) || daily <= 0) {
      toast.error('Por favor, informe uma meta diária válida maior que zero.');
      return;
    }
    if (isNaN(monthly) || monthly <= 0) {
      toast.error('Por favor, informe uma meta mensal válida maior que zero.');
      return;
    }

    setPersonalDailyGoal(daily);
    setPersonalMonthlyGoal(monthly);
    localStorage.setItem(`barber_daily_goal_${profile.uid}`, daily.toString());
    localStorage.setItem(`barber_monthly_goal_${profile.uid}`, monthly.toString());
    setIsEditingGoal(false);
    toast.success('Metas de estímulo pessoal salvas com sucesso!');
  };

  // Filter clients
  const filteredClientes = clientes.filter(c => {
    const term = clientSearchTerm.toLowerCase();
    return c.nome.toLowerCase().includes(term) || 
           (c.telefone && c.telefone.includes(term)) ||
           (c.email && c.email.toLowerCase().includes(term));
  });

  // Filter products
  const filteredProducts = products.filter(p => {
    const term = productSearchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || 
           (p.categoryName && p.categoryName.toLowerCase().includes(term));
  });

  // Calculate statistics for Commission tab
  const stats = React.useMemo(() => {
    // 1. Pending commission only (Apenas comissão a receber) - absolute total
    const toReceive = commissions
      .filter(c => c.status === 'pendente')
      .reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);

    // 2. Customers served today (Tanto de cliente atendido hoje)
    const servedTodayCount = appointments
      .filter(app => app.status === 'concluído')
      .length;

    // 3. This month's total completed commission
    const currentYearMonth = format(new Date(), 'yyyy-MM');
    const monthlyCommissions = commissions
      .filter(c => c.date.startsWith(currentYearMonth));
      
    const receivedThisMonth = monthlyCommissions
      .reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);

    return {
      toReceive,
      servedTodayCount,
      receivedThisMonth
    };
  }, [commissions, appointments]);

  // Filtered commissions and advances based on the selected date range and status/type filters
  const filteredCommissions = React.useMemo(() => {
    return commissions.filter(c => {
      // Date filter
      if (startDate && c.date < startDate) return false;
      if (endDate && c.date > endDate) return false;
      // Status filter
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      return true;
    });
  }, [commissions, startDate, endDate, statusFilter]);

  const filteredAdvances = React.useMemo(() => {
    return advances.filter(a => {
      // Date filter
      if (startDate && a.date < startDate) return false;
      if (endDate && a.date > endDate) return false;
      // Status filter
      if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
      return true;
    });
  }, [advances, startDate, endDate, statusFilter]);

  // Combined and sorted transactions list for the detailed statement
  const transactionsList = React.useMemo(() => {
    const list: Array<
      | { type: 'comissao'; id: string; date: string; title: string; clientName?: string; value: number; status: string; commissionType?: string }
      | { type: 'vale'; id: string; date: string; title: string; description: string; value: number; status: string }
    > = [];

    if (typeFilter === 'todos' || typeFilter === 'comissao') {
      filteredCommissions.forEach(c => {
        list.push({
          type: 'comissao',
          id: c.id,
          date: c.date,
          title: c.servico_name || 'Comissão de Atendimento',
          clientName: c.cliente_name || 'Cliente Avulso',
          value: c.commission_value || c.amount || 0,
          status: c.status || 'pendente',
          commissionType: c.commission_type
        });
      });
    }

    if (typeFilter === 'todos' || typeFilter === 'vale') {
      filteredAdvances.forEach(a => {
        list.push({
          type: 'vale',
          id: a.id,
          date: a.date,
          title: 'Retirada / Vale',
          description: a.description || 'Adiantamento',
          value: a.amount || 0,
          status: a.status || 'pendente'
        });
      });
    }

    // Sort transactions by date descending, then by value/id
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredCommissions, filteredAdvances, typeFilter]);

  // Summaries based strictly on the selected filters
  const periodStats = React.useMemo(() => {
    const totalComissoesGeradas = filteredCommissions.reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    const totalComissoesPagas = filteredCommissions.filter(c => c.status === 'pago').reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    const totalComissoesPendentes = filteredCommissions.filter(c => c.status === 'pendente').reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    
    const totalVales = filteredAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalValesPagos = filteredAdvances.filter(a => a.status === 'pago').reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalValesPendentes = filteredAdvances.filter(a => a.status !== 'pago').reduce((sum, a) => sum + (a.amount || 0), 0);

    const saldoLiquidoPeriodo = totalComissoesGeradas - totalVales;

    return {
      totalComissoesGeradas,
      totalComissoesPagas,
      totalComissoesPendentes,
      totalVales,
      totalValesPagos,
      totalValesPendentes,
      saldoLiquidoPeriodo
    };
  }, [filteredCommissions, filteredAdvances]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('Desconectado com sucesso.');
    } catch (err) {
      toast.error('Erro ao sair.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Header Banner */}
      <header className="bg-slate-900 text-white pt-6 pb-12 px-4 shadow-md rounded-b-[2rem] relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 opacity-95" />
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute top-1/2 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />

        <div className="max-w-md mx-auto flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-xl shadow-inner uppercase">
              {profile.nome.substring(0, 2)}
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300">Painel do Barbeiro</p>
              <h2 className="text-lg font-black tracking-tight">{profile.nome}</h2>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2.5 bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-xl transition border border-slate-700/50"
            title="Sair do Sistema"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto px-4 -mt-6 relative z-10 max-w-4xl pb-24">
        
        {/* AGENDA TAB */}
        {activeTab === 'agenda' && (
          <div className="space-y-4">
            
            {/* Horizontal date selection bar */}
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-3xl shadow-sm space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Calendar size={13} className="text-indigo-600" />
                  Visualizar Escala
                </span>
                <span className="text-xs font-black text-indigo-600">
                  {dateStrip.find(d => d.iso === format(selectedDate, 'yyyy-MM-dd'))?.label || format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                </span>
              </div>
              
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 pr-2">
                {dateStrip.map(d => {
                  const isSelected = d.iso === format(selectedDate, 'yyyy-MM-dd');
                  return (
                    <button
                       key={d.iso}
                       onClick={() => setSelectedDate(parse(d.iso, 'yyyy-MM-dd', new Date()))}
                       className={`flex flex-col items-center justify-center min-w-[50px] h-[64px] rounded-2xl transition border ${
                        isSelected 
                          ? 'bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-950/25 scale-105' 
                          : d.isToday
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold'
                            : 'bg-slate-50 border-slate-200/70 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[9px] uppercase font-bold tracking-wider leading-none mb-1.5">
                        {d.dayName}
                      </span>
                      <span className="text-base font-black leading-none">
                        {d.dayNum}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Today Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  {stats.servedTodayCount}
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Atendidos Hoje</p>
                  <p className="text-xs font-black text-slate-700">De {appointments.length} agendados</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Comissão Pendente</p>
                  <p className="text-xs font-black text-slate-700">R$ {stats.toReceive.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleNewAppointment('09:00', profile.uid)}
                className="flex flex-col items-center justify-center p-3.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/60 text-indigo-700 rounded-2xl transition shadow-sm active:scale-95 text-center gap-1.5"
              >
                <Plus size={16} strokeWidth={3} className="text-indigo-600" />
                <span className="text-[10px] font-black uppercase tracking-wider">Novo Agendamento</span>
              </button>

              <button
                onClick={() => setIsManualComandaOpen(true)}
                className="flex flex-col items-center justify-center p-3.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100/60 text-emerald-700 rounded-2xl transition shadow-sm active:scale-95 text-center gap-1.5"
              >
                <ArrowRightLeft size={16} strokeWidth={2.5} className="text-emerald-600" />
                <span className="text-[10px] font-black uppercase tracking-wider">Abrir Comanda</span>
              </button>

              <button
                onClick={() => setIsBlockModalOpen(true)}
                className="flex flex-col items-center justify-center p-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-100/60 text-rose-700 rounded-2xl transition shadow-sm active:scale-95 text-center gap-1.5"
              >
                <Lock size={16} strokeWidth={2.5} className="text-rose-600" />
                <span className="text-[10px] font-black uppercase tracking-wider">Bloquear Horário</span>
              </button>
            </div>

            {/* Agenda Hourly Grid */}
            <div className="bg-white border border-slate-200/80 p-1.5 rounded-3xl shadow-sm overflow-hidden">
              <AgendaGeneral
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                barbers={[profile]}
                appointments={appointments}
                clients={clientes}
                blocks={blocks}
                onNewAppointment={handleNewAppointment}
                onOpenAppointment={handleOpenAppointment}
                onOpenComanda={handleOpenComanda}
                loading={loadingAppointments || loadingBlocks}
              />
            </div>

          </div>
        )}

        {/* CLIENTES TAB */}
        {activeTab === 'clientes' && (
          <div className="space-y-4">
            
            {/* Search client input */}
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-3xl shadow-sm space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Users size={13} className="text-indigo-600" />
                Listagem de Clientes
              </span>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, tel ou email..."
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* Clients display */}
            <div className="space-y-3">
              {loadingClientes ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Acessando cadastro de clientes...</p>
                </div>
              ) : filteredClientes.length === 0 ? (
                <div className="bg-white border rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Users className="text-slate-300 w-10 h-10" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Nenhum cliente</h4>
                  <p className="text-slate-400 text-[11px] max-w-xs font-semibold leading-relaxed">
                    Nenhum resultado corresponde à sua pesquisa. Tente digitar outros termos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredClientes.map((cliente) => (
                    <div 
                      key={cliente.uid}
                      className="bg-white border border-slate-200/80 p-4 rounded-3xl shadow-sm flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black text-slate-800 leading-snug">
                            {cliente.nome}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {cliente.email}
                          </p>
                        </div>
                        
                        {cliente.telefone && (
                          <a
                            href={`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl transition"
                          >
                            <Phone size={11} />
                            WhatsApp
                          </a>
                        )}
                      </div>

                      {/* Observations / Preferences */}
                      {(cliente.observacoes || cliente.preferences) && (
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] font-semibold text-slate-500">
                          <span className="font-black text-slate-600 uppercase text-[8px] tracking-wider block mb-1">Dicas & Preferências de Estilo</span>
                          {cliente.observacoes || cliente.preferences}
                        </div>
                      )}

                      {/* Basic details */}
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100/50">
                        <span>Total de visitas: <span className="text-slate-600 font-black">{cliente.appointmentsCount || 0}</span></span>
                        <span>Última visita: <span className="text-slate-600 font-black">{cliente.lastVisit ? new Date(cliente.lastVisit + 'T12:00:00').toLocaleDateString('pt-BR') : 'Primeira vez'}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMISSÃO TAB */}
        {activeTab === 'comissao' && (
          <div className="space-y-4">
            
            {/* Header / Primary Stats */}
            <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                  <DollarSign size={13} className="text-indigo-400" />
                  Sua Comissão Acumulada
                </span>
                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 font-bold px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Total Pendente Geral
                </span>
              </div>

              <div>
                <p className="text-3xl font-black tracking-tight text-white">
                  R$ {stats.toReceive.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">
                  Este é o valor líquido total de todas as suas comissões pendentes acumuladas.
                </p>
              </div>
            </div>

            {/* Filtros de Data e Status */}
            <div className="bg-white border border-slate-200/80 p-4.5 rounded-3xl shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Filter size={13} className="text-indigo-600" />
                  Filtrar Produção & Vales
                </span>
                <button
                  onClick={() => {
                    const d = new Date();
                    setStartDate(format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                    setStatusFilter('todos');
                    setTypeFilter('todos');
                    toast.success('Filtros restaurados!');
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline uppercase"
                >
                  Limpar Filtros
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">De (Início)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Até (Fim)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Status de Repasse</label>
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="pendente">Pendente (A receber)</option>
                    <option value="pago">Pago (Repassado)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Tipo de Registro</label>
                  <select
                    value={typeFilter}
                    onChange={(e: any) => setTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="todos">Todos os Registros</option>
                    <option value="comissao">Comissões Apenas</option>
                    <option value="vale">Vales/Retiradas</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Resumo Financeiro do Período */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Gerado
                  </p>
                  <p className="text-sm font-black text-slate-800">
                    R$ {periodStats.totalComissoesGeradas.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Comissões produzidas</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Recebido
                  </p>
                  <p className="text-sm font-black text-emerald-600">
                    R$ {periodStats.totalComissoesPagas.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Valores repassados</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Pendente
                  </p>
                  <p className="text-sm font-black text-amber-600">
                    R$ {periodStats.totalComissoesPendentes.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">A receber no período</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Retiradas
                  </p>
                  <p className="text-sm font-black text-rose-600">
                    R$ {periodStats.totalVales.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Adiantamentos pegos</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm col-span-2 sm:col-span-1 flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    Saldo Líquido
                  </p>
                  <p className={`text-sm font-black ${periodStats.saldoLiquidoPeriodo >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                    R$ {periodStats.saldoLiquidoPeriodo.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Comissão menos vales</p>
              </div>
            </div>

            {/* Stimulus Goals Section */}
            <div className="bg-white border border-slate-200/80 p-4.5 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Target size={14} className="text-indigo-600" />
                  Metas de Estímulo Pessoal
                </span>
                <button
                  onClick={() => {
                    setNewDailyGoal(personalDailyGoal.toString());
                    setNewMonthlyGoal(personalMonthlyGoal.toString());
                    setIsEditingGoal(!isEditingGoal);
                  }}
                  className="text-[10px] font-black text-indigo-600 hover:underline uppercase flex items-center gap-1"
                >
                  <Edit3 size={11} />
                  {isEditingGoal ? 'Cancelar' : 'Ajustar'}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isEditingGoal ? (
                  <motion.form 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    onSubmit={handleSaveGoals}
                    className="space-y-3 bg-slate-50 border p-3.5 rounded-2xl"
                  >
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Configurar Suas Metas</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">Meta diária (Clientes atendidos hoje)</label>
                      <input
                        type="number"
                        required
                        value={newDailyGoal}
                        onChange={(e) => setNewDailyGoal(e.target.value)}
                        placeholder="Ex: 5"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">Meta mensal (R$ de comissão total no mês)</label>
                      <input
                        type="number"
                        required
                        value={newMonthlyGoal}
                        onChange={(e) => setNewMonthlyGoal(e.target.value)}
                        placeholder="Ex: 3000"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Save size={12} />
                      Salvar Novas Metas
                    </button>
                  </motion.form>
                ) : (
                  <div className="space-y-4">
                    
                    {/* Goal 1: Daily clients served */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-600">Foco do Dia: Clientes Atendidos</span>
                        <span className="text-indigo-600 font-black">{stats.servedTodayCount} / {personalDailyGoal}</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (stats.servedTodayCount / personalDailyGoal) * 100)}%` }}
                        />
                      </div>
                      
                      {/* Motivational text */}
                      <p className="text-[10px] text-slate-400 font-semibold italic">
                        {stats.servedTodayCount >= personalDailyGoal 
                          ? 'Excelente! Meta diária concluída! Continue brilhando! 🌟' 
                          : `Faltam apenas ${personalDailyGoal - stats.servedTodayCount} atendimentos hoje para bater sua meta!`}
                      </p>
                    </div>

                    {/* Goal 2: Monthly commissions earned */}
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-600">Estímulo do Mês: Comissão Gerada</span>
                        <span className="text-indigo-600 font-black">R$ {stats.receivedThisMonth.toFixed(2)} / R$ {personalMonthlyGoal.toFixed(2)}</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border">
                        <div 
                          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (stats.receivedThisMonth / personalMonthlyGoal) * 100)}%` }}
                        />
                      </div>
                      
                      {/* Motivational text */}
                      <p className="text-[10px] text-slate-400 font-semibold italic">
                        {stats.receivedThisMonth >= personalMonthlyGoal 
                          ? 'Extraordinário! Meta de comissão do mês alcançada! Que success! 🚀' 
                          : `Falta R$ ${(personalMonthlyGoal - stats.receivedThisMonth).toFixed(2)} para alcançar a sua meta financeira pessoal.`}
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Detailed Transaction Statement */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Extrato Detalhado do Período ({transactionsList.length})
                </h3>
                <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded-full border border-indigo-100">
                  Apenas Valores Líquidos
                </span>
              </div>

              {loadingCommissions ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Carregando repasses e histórico...</p>
                </div>
              ) : transactionsList.length === 0 ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <DollarSign className="text-slate-300 w-10 h-10 mx-auto" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Sem movimentações</h4>
                  <p className="text-slate-400 text-[10px] max-w-xs font-semibold leading-relaxed">
                    Nenhuma comissão ou retirada encontrada no período selecionado com os filtros ativos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactionsList.map((item) => {
                    const isComm = item.type === 'comissao';
                    return (
                      <div 
                        key={`${item.type}-${item.id}`}
                        className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center justify-between hover:border-indigo-100 transition-colors duration-150"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isComm 
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                              : 'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            {isComm ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span>{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Indefinida'}</span>
                              {isComm && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span className="text-slate-500 truncate">Cliente: {item.clientName}</span>
                                </>
                              )}
                              {!isComm && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span className="text-rose-500/80 font-bold truncate">{item.description}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-3">
                          <p className={`text-xs font-black ${isComm ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isComm ? '+' : '-'} R$ {item.value.toFixed(2)}
                          </p>
                          <span className={`text-[8px] font-black uppercase tracking-wider ${
                            item.status === 'pago' 
                              ? 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100' 
                              : 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100'
                          }`}>
                            {item.status || 'pendente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ESTOQUE TAB */}
        {activeTab === 'estoque' && (
          <div className="space-y-4">
            
            {/* Search and context */}
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-3xl shadow-sm space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Package size={13} className="text-indigo-600" />
                Consulta de Estoque
              </span>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar pomadas, óleos, lâminas..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* Stock Level Warning banner */}
            {products.some(p => p.currentStock <= p.minStock) && (
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-amber-800 flex items-start gap-2.5 shadow-sm">
                <AlertTriangle className="shrink-0 mt-0.5 text-amber-600" size={16} />
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-black uppercase tracking-wider">Produtos com Estoque Baixo!</h5>
                  <p className="text-[10px] text-amber-750 font-semibold leading-normal">
                    Existem itens abaixo do limite mínimo recomendado. Avise o gerente para providenciar reposição.
                  </p>
                </div>
              </div>
            )}

            {/* Product list */}
            <div className="space-y-3">
              {loadingProducts ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Acessando níveis de estoque...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Package className="text-slate-300 w-10 h-10" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Nenhum produto</h4>
                  <p className="text-slate-400 text-[11px] max-w-xs font-semibold leading-relaxed">
                    Nenhum produto em estoque corresponde à sua pesquisa.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredProducts.map((prod) => {
                    const isLow = prod.currentStock <= prod.minStock;
                    return (
                      <div 
                        key={prod.id}
                        className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-slate-800 leading-snug">
                            {prod.name}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              {prod.categoryName || 'Produto'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              Preço venda: <span className="text-slate-700 font-extrabold">R$ {(prod.salePrice || 0).toFixed(2)}</span>
                            </span>
                          </div>
                        </div>

                        {/* Stock counter indicator */}
                        <div className="text-right">
                          <p className={`text-sm font-black ${isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                            {prod.currentStock} un
                          </p>
                          <span className={`text-[8px] font-black uppercase tracking-wider block ${
                            isLow ? 'text-amber-600 bg-amber-50 px-1 rounded border border-amber-100' : 'text-slate-400'
                          }`}>
                            {isLow ? 'Recarga Urgente' : `Mínimo: ${prod.minStock}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PERFIL TAB */}
        {activeTab === 'perfil' && (
          <div className="space-y-4">
            
            {/* Detailed Professional Card */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center text-3xl font-black uppercase shadow-inner">
                  {profile.nome.substring(0, 2)}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 leading-tight">{profile.nome}</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">{profile.email}</p>
                  <p className="text-[10px] bg-indigo-50 text-indigo-700 font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border border-indigo-100 mt-2 inline-block">
                    Barbeiro Parceiro
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs font-bold text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Sua Comissão de Contrato</span>
                  <span className="text-indigo-600 font-black text-sm">
                    {profile.percentual_comissao || profile.commission_percentage || 0}%
                  </span>
                </div>
                
                {profile.especialidade && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Sua Especialidade Principal</span>
                    <span className="text-slate-700 font-extrabold">
                      {profile.especialidade}
                    </span>
                  </div>
                )}

                {profile.telefone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Telefone de Contato</span>
                    <span className="text-slate-700 font-extrabold">{profile.telefone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Working hours scale summary */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                <Clock size={14} className="text-indigo-600" />
                Sua Escala Operacional
              </h4>

              {profile.horario_de_trabalho && profile.horario_de_trabalho.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {profile.horario_de_trabalho.map((wh) => (
                    <div key={wh.dayOfWeek} className="bg-slate-50 border p-2.5 rounded-xl text-center">
                      <p className="text-[9px] text-slate-400 font-black uppercase">
                        {wh.dayOfWeek === 1 ? 'Segunda' :
                         wh.dayOfWeek === 2 ? 'Terça' :
                         wh.dayOfWeek === 3 ? 'Quarta' :
                         wh.dayOfWeek === 4 ? 'Quinta' :
                         wh.dayOfWeek === 5 ? 'Sexta' :
                         wh.dayOfWeek === 6 ? 'Sábado' : 'Domingo'}
                      </p>
                      {wh.isOpen ? (
                        <p className="text-xs font-black text-indigo-700 mt-0.5">
                          {wh.startTime} - {wh.endTime}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-400 italic mt-0.5">
                          Folga
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-50 border p-3 rounded-xl text-slate-450 italic text-xs font-bold justify-center">
                  <AlertCircle size={14} />
                  <span>Nenhum horário de expediente cadastrado pelo dono.</span>
                </div>
              )}
            </div>

            {/* Simulator switcher for easily switching profiles in development context */}
            <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-[2rem] shadow-sm text-center">
              <p className="text-xs font-black text-indigo-950 flex items-center justify-center gap-1.5">
                <Scissors size={14} className="text-indigo-600" />
                Painel do Profissional
              </p>
              <p className="text-[10px] text-indigo-700/80 mt-1 max-w-xs mx-auto leading-relaxed font-semibold">
                Este portal foi otimizado para celulares dos barbeiros. Você pode ver sua agenda em tempo real, gerenciar comissões e acompanhar estoque.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Fixed bottom simple bottom navigation menu bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 px-2 py-2 shadow-2xl z-50 rounded-t-3xl max-w-md mx-auto">
        <div className="grid grid-cols-5 gap-1 text-center">
          
          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'agenda' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Calendar size={18} className={`mb-1 transition-transform ${activeTab === 'agenda' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Agenda</span>
          </button>

          <button
            onClick={() => setActiveTab('clientes')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'clientes' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Users size={18} className={`mb-1 transition-transform ${activeTab === 'clientes' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Clientes</span>
          </button>

          <button
            onClick={() => setActiveTab('comissao')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'comissao' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <DollarSign size={18} className={`mb-1 transition-transform ${activeTab === 'comissao' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Comissão</span>
          </button>

          <button
            onClick={() => setActiveTab('estoque')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'estoque' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Package size={18} className={`mb-1 transition-transform ${activeTab === 'estoque' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Estoque</span>
          </button>

          <button
            onClick={() => setActiveTab('perfil')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'perfil' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <User size={18} className={`mb-1 transition-transform ${activeTab === 'perfil' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Perfil</span>
          </button>

        </div>
      </nav>

      {/* Block Time Modal */}
      <AnimatePresence>
        {isBlockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="bg-white rounded-t-[2.5rem] sm:rounded-[2rem] border border-slate-200 shadow-2xl p-6 w-full max-w-sm space-y-4 pb-8 sm:pb-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                  <Lock size={15} className="text-red-600" />
                  Bloquear Agenda
                </h3>
                <button
                  onClick={() => setIsBlockModalOpen(false)}
                  className="text-xs font-black uppercase text-slate-400 hover:text-slate-600 px-2 py-1 rounded-xl transition"
                >
                  Fechar
                </button>
              </div>

              <form onSubmit={handleCreateBlock} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Data Selecionada
                  </label>
                  <p className="text-xs font-extrabold text-slate-700 bg-slate-50 border p-2.5 rounded-xl">
                    {dateStrip.find(d => d.iso === selectedDate)?.label || selectedDate}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Início
                    </label>
                    <input
                      type="time"
                      required
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.target.value)}
                      className="w-full text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Término
                    </label>
                    <input
                      type="time"
                      required
                      value={blockEndTime}
                      onChange={(e) => setBlockEndTime(e.target.value)}
                      className="w-full text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Motivo (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Almoço, Compromisso pessoal..."
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider py-3.5 rounded-2xl shadow-md transition"
                >
                  Confirmar Bloqueio
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modals for Manual Management */}
      <AppointmentModal 
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={() => {
          setIsAppointmentModalOpen(false);
          toast.success("Agenda atualizada!");
        }}
        appointment={selectedAppointment}
        currentUser={profile}
        initialTime={selectedTimeSlot?.time}
        initialProfissionalId={selectedTimeSlot?.profissional_id}
        onOpenComanda={handleOpenComanda}
      />

      {isComandaModalOpen && selectedAppointment && comandaInitialData && (
        <ComandaModal 
          comanda_id={selectedAppointment.comanda_id}
          onClose={() => setIsComandaModalOpen(false)}
          onSave={() => {
            setIsComandaModalOpen(false);
            setSelectedAppointment(null);
          }}
          initialData={comandaInitialData}
        />
      )}

      {isManualComandaOpen && (
        <ComandaModal 
          onClose={() => setIsManualComandaOpen(false)}
          onSave={() => {
            setIsManualComandaOpen(false);
          }}
          initialData={{
            profissional_id: profile.uid,
            profissional_name: profile.nome,
            origin: 'balcao',
            status: 'aberta'
          }}
        />
      )}

    </div>
  );
}
