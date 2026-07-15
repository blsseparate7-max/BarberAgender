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
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { appointmentService } from '../services/appointmentService';
import { commissionService } from '../services/commissionService';
import { inventoryService } from '../services/inventoryService';
import { agendaBlockService } from '../services/agendaBlockService';
import { UserProfile, Appointment, Product, Commission, AppointmentStatus, AgendaBlock } from '../types';
import { toast } from 'sonner';
import { format, parse, addDays, startOfDay, endOfDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PortalBarbeiroProps {
  profile: UserProfile;
}

export function PortalBarbeiro({ profile }: PortalBarbeiroProps) {
  const [activeTab, setActiveTab] = useState<'agenda' | 'clientes' | 'comissao' | 'estoque' | 'perfil'>('agenda');
  
  // Tab states: Agenda
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  
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
    const unsubscribe = appointmentService.subscribeToAppointments(
      { date: selectedDate, profissional_id: profile.uid },
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
    const unsubscribe = agendaBlockService.subscribeToBlocks(
      { date: selectedDate, profissional_id: profile.uid },
      (data) => {
        setBlocks(data);
        setLoadingBlocks(false);
      }
    );
    return () => unsubscribe();
  }, [selectedDate, profile.uid]);

  // 2. Fetch Clients when entering Clientes tab
  useEffect(() => {
    if (activeTab === 'clientes') {
      setLoadingClientes(true);
      userService.getAllClients()
        .then(data => {
          setClientes(data);
          setLoadingClientes(false);
        })
        .catch(err => {
          console.error(err);
          toast.error('Erro ao carregar clientes.');
          setLoadingClientes(false);
        });
    }
  }, [activeTab]);

  // 3. Fetch Commissions when entering Comissão tab
  useEffect(() => {
    if (activeTab === 'comissao' || activeTab === 'agenda') {
      setLoadingCommissions(true);
      commissionService.getCommissions({ profissional_id: profile.uid })
        .then(data => {
          setCommissions(data);
          setLoadingCommissions(false);
        })
        .catch(err => {
          console.error(err);
          toast.error('Erro ao carregar comissões.');
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
        date: selectedDate,
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
    // 1. Pending commission only (Apenas comissão a receber)
    const toReceive = commissions
      .filter(c => c.status === 'pendente')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    // 2. Customers served today (Tanto de cliente atendido hoje)
    const servedTodayCount = appointments
      .filter(app => app.status === 'concluído')
      .length;

    // 3. This month's total completed commission
    const currentYearMonth = format(new Date(), 'yyyy-MM');
    const monthlyCommissions = commissions
      .filter(c => c.date.startsWith(currentYearMonth));
      
    const receivedThisMonth = monthlyCommissions
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    return {
      toReceive,
      servedTodayCount,
      receivedThisMonth
    };
  }, [commissions, appointments]);

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
      <main className="flex-1 max-w-md w-full mx-auto px-4 -mt-6 relative z-10">
        
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
                  {dateStrip.find(d => d.iso === selectedDate)?.label || selectedDate}
                </span>
              </div>
              
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 pr-2">
                {dateStrip.map(d => {
                  const isSelected = d.iso === selectedDate;
                  return (
                    <button
                      key={d.iso}
                      onClick={() => setSelectedDate(d.iso)}
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

            {/* Appointments list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 mt-2">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Agendamentos do Dia
                </h3>
                <button
                  onClick={() => setIsBlockModalOpen(true)}
                  className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-100/60 text-red-700 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl transition"
                >
                  <Lock size={11} />
                  Bloquear Horário
                </button>
              </div>

              {loadingAppointments ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Buscando sua agenda...</p>
                </div>
              ) : appointments.length === 0 ? (
                <div className="bg-white border rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Scissors className="text-slate-300 w-10 h-10" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Sem agendamentos</h4>
                  <p className="text-slate-400 text-[11px] max-w-xs font-semibold leading-relaxed">
                    Você não possui compromissos ou horários agendados para esta data. Aproveite para descansar ou organizar seus materiais!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map((app) => {
                    const durationInMin = app.duration || 30;
                    return (
                      <div 
                        key={app.id} 
                        className="bg-white border border-slate-200/80 rounded-3xl p-4 shadow-sm hover:border-slate-300/80 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            
                            {/* Time and Duration badges */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-black px-2 py-0.5 rounded-lg border border-indigo-100">
                                <Clock size={11} />
                                {app.startTime} - {app.endTime}
                              </span>
                              <span className="text-[10px] text-slate-400 font-bold">
                                ({durationInMin} min)
                              </span>
                              
                              {/* Status Badges */}
                              {app.status === 'agendado' && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100">
                                  Agendado
                                </span>
                              )}
                              {app.status === 'em_atendimento' && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 animate-pulse">
                                  Em Atendimento
                                </span>
                              )}
                              {app.status === 'concluído' && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                                  Concluído
                                </span>
                              )}
                              {app.status === 'cancelado' && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-red-500 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100">
                                  Cancelado
                                </span>
                              )}
                            </div>

                            {/* Client name */}
                            <h4 className="text-sm font-black text-slate-800 truncate">
                              {app.cliente_name}
                            </h4>

                            {/* Service name & price */}
                            <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
                              <span className="text-slate-800 font-bold">{app.servico_name}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-indigo-600 font-black">R$ {(app.price || 0).toFixed(2)}</span>
                            </p>

                            {/* Notes */}
                            {app.notes && (
                              <p className="text-[10px] text-slate-400 font-medium italic mt-1 border-l-2 border-slate-200 pl-2">
                                Obs: {app.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Quick Interactive Actions */}
                        {app.status !== 'concluído' && app.status !== 'cancelado' && (
                          <div className="flex items-center gap-2 mt-4 pt-3.5 border-t border-slate-100/60 justify-end">
                            {app.status === 'agendado' && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, 'em_atendimento')}
                                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider py-1.5 px-3.5 rounded-xl transition"
                              >
                                <Play size={11} fill="currentColor" />
                                Iniciar Corte
                              </button>
                            )}

                            {app.status === 'em_atendimento' && (
                              <button
                                onClick={() => handleUpdateStatus(app.id, 'concluído')}
                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider py-1.5 px-3.5 rounded-xl transition"
                              >
                                <Check size={11} strokeWidth={3} />
                                Concluir
                              </button>
                            )}

                            <button
                              onClick={() => handleUpdateStatus(app.id, 'cancelado')}
                              className="flex items-center gap-1 bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl transition"
                            >
                              <XCircle size={11} />
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Blocked Times List */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                Horários Bloqueados
              </h3>

              {loadingBlocks ? (
                <div className="bg-white border rounded-3xl p-6 text-center flex flex-col items-center justify-center gap-2 shadow-sm">
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-bold text-slate-400 animate-pulse uppercase tracking-wider">Buscando bloqueios...</p>
                </div>
              ) : blocks.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-3xl p-6 text-center flex flex-col items-center justify-center gap-2 shadow-sm">
                  <Unlock className="text-slate-300 w-6 h-6" />
                  <h4 className="font-extrabold text-slate-500 text-xs">Nenhum horário bloqueado</h4>
                  <p className="text-slate-400 text-[10px] max-w-xs font-semibold leading-relaxed">
                    Sua agenda está livre de bloqueios para este dia.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blocks.map((block) => (
                    <div 
                      key={block.id}
                      className="bg-red-50/50 border border-red-100/80 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-sm hover:border-red-200 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                          <Lock size={13} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-red-800">
                              {block.startTime} - {block.endTime}
                            </span>
                            {block.isGeneral && (
                              <span className="bg-red-200 text-red-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Geral
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-red-650 font-bold">
                            {block.reason || 'Bloqueio de agenda'}
                          </p>
                        </div>
                      </div>
                      
                      {!block.isGeneral && (
                        <button
                          onClick={() => handleUnblockTime(block.id)}
                          className="p-1.5 hover:bg-red-100 rounded-lg text-red-600 transition shrink-0"
                          title="Desbloquear Horário"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
                  Pendente
                </span>
              </div>

              <div>
                <p className="text-3xl font-black tracking-tight text-white">
                  R$ {stats.toReceive.toFixed(2)}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed mt-1">
                  Este é o valor líquido total de comissão pendente a receber (já deduzidos os custos da barbearia).
                </p>
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
                          ? 'Extraordinário! Meta de comissão do mês alcançada! Que sucesso! 🚀' 
                          : `Falta R$ ${(personalMonthlyGoal - stats.receivedThisMonth).toFixed(2)} para alcançar a sua meta financeira pessoal.`}
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Commissions List Log */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">
                Histórico Recente de Comissões
              </h3>

              {loadingCommissions ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Carregando repasses e histórico...</p>
                </div>
              ) : commissions.length === 0 ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <DollarSign className="text-slate-300 w-10 h-10 mx-auto" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Sem comissões registradas</h4>
                  <p className="text-slate-400 text-[10px] max-w-xs font-semibold leading-relaxed">
                    Você ainda não possui comissões registradas no histórico recente da barbearia.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commissions.slice(0, 15).map((com) => (
                    <div 
                      key={com.id}
                      className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <p className="text-xs font-black text-slate-800">
                          {com.description || 'Comissão de Atendimento'}
                        </p>
                        <p className="text-[10px] text-slate-400 font-bold">
                          {com.date ? new Date(com.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Indefinida'}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-black text-indigo-600">
                          + R$ {(com.amount || 0).toFixed(2)}
                        </p>
                        <span className={`text-[8px] font-black uppercase tracking-wider ${
                          com.status === 'pago' 
                            ? 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100' 
                            : 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100'
                        }`}>
                          {com.status || 'pendente'}
                        </span>
                      </div>
                    </div>
                  ))}
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

    </div>
  );
}
