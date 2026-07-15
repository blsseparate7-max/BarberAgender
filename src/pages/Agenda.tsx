import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Clock, 
  Filter, 
  Search, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  UserMinus,
  Edit3,
  Loader2,
  AlertCircle,
  Scissors,
  Receipt,
  Users,
  User,
  History,
  ListTodo,
  Lock,
  Repeat,
  LayoutGrid,
  CalendarDays,
  Settings,
  ArrowRightLeft,
  Armchair,
  Wallet,
  CreditCard,
  DollarSign,
  CalendarCheck,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Appointment, AppointmentStatus, UserProfile, TabId, AgendaBlock } from '../types';
import { appointmentService } from '../services/appointmentService';
import { userService } from '../services/userService';
import { cashService } from '../services/cashService';
import { comandaService } from '../services/comandaService';
import { agendaBlockService } from '../services/agendaBlockService';
import { useAuth } from '../contexts/AuthContext';
import { AppointmentModal } from '../components/Agenda/AppointmentModal';
import { ComandaModal } from '../components/Comanda/ComandaModal';
import { AgendaGeneral } from '../components/Agenda/AgendaGeneral';
import { AgendaProfessional } from '../components/Agenda/AgendaProfessional';
import { ProfessionalSchedules as AvailabilityManager } from '../components/Agenda/ProfessionalSchedules';
import { AgendaBlocks as BlocksManager } from '../components/Agenda/AgendaBlocks';
import { AppointmentList } from '../components/Agenda/AppointmentList';
import { RecurringAppointments } from '../components/Agenda/RecurringAppointments';
import { OperationsManager } from '../components/Agenda/OperationsManager';
import { format, addDays, subDays, isSameDay, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, parse, isAfter, isBefore, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaProps {
  currentUser: UserProfile;
  activeTab: TabId;
}

type AgendaTab = 'main' | 'appointments' | 'recurring' | 'availability' | 'blocks' | 'operations' | 'resources';
type ViewType = 'day' | 'week' | 'month';

export function Agenda({ currentUser, activeTab: parentActiveTab }: AgendaProps) {
  const { isAdmin, isGerente } = useAuth();
  const [activeTab, setActiveTab] = useState<AgendaTab>('main');

  // Sync with parent tab if it's an agenda sub-tab
  useEffect(() => {
    if (parentActiveTab.startsWith('agenda-')) {
      const subTab = parentActiveTab.replace('agenda-', '') as AgendaTab;
      const tabMap: Record<string, AgendaTab> = {
        'main': 'main',
        'appointments': 'appointments',
        'recurring': 'recurring',
        'availability': 'availability',
        'blocks': 'blocks',
        'operations': 'operations',
        'resources': 'resources'
      };
      
      const targetTab = tabMap[subTab];
      if (targetTab) {
        setActiveTab(targetTab);
      }
    }
  }, [parentActiveTab]);

  const [viewType, setViewType] = useState<ViewType>('day');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBarberFilter, setSelectedBarberFilter] = useState<string>('all');
  const [currentCash, setCurrentCash] = useState<any>(null);

  const filteredBarbersForGrid = React.useMemo(() => {
    if (selectedBarberFilter === 'all') return barbers;
    return barbers.filter(b => b.uid === selectedBarberFilter);
  }, [barbers, selectedBarberFilter]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
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

  useEffect(() => {
    const unsubscribeBarbers = userService.subscribeToAllBarbers(true, (data) => {
      setBarbers(data);
    });

    const unsubscribeClients = userService.subscribeToAllClients(true, (data) => {
      setClients(data);
    });
    
    // Subscribe to Cash Status for Alert
    const unsubscribeCash = cashService.subscribeToCurrentCash((cash) => {
      setCurrentCash(cash);
    });

    const unsubscribeBlocks = agendaBlockService.subscribeToBlocks({}, (data) => {
      setBlocks(data);
    });

    return () => {
      unsubscribeBarbers();
      unsubscribeClients();
      unsubscribeCash();
      unsubscribeBlocks();
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'main') {
      let start, end;
      if (viewType === 'day') {
        start = format(selectedDate, 'yyyy-MM-dd');
        end = start;
      } else if (viewType === 'week') {
        start = format(startOfWeek(selectedDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
        end = format(endOfWeek(selectedDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
      } else {
        start = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
        end = format(endOfMonth(selectedDate), 'yyyy-MM-dd');
      }

      const filters: any = { 
        startDate: start,
        endDate: end
      };
      
      if (currentUser.tipo === 'cliente') filters.cliente_id = currentUser.uid;
      if (currentUser.tipo === 'barbeiro') filters.profissional_id = currentUser.uid;

      setLoading(true);
      const unsubscribeAppointments = appointmentService.subscribeToAppointments(filters, (data) => {
        setAppointments(data);
        setLoading(false);
      });

      return () => unsubscribeAppointments();
    }
  }, [selectedDate, viewType, activeTab, currentUser.uid, currentUser.tipo]);

  const loadBarbers = async () => {
    try {
      const data = await userService.getAllBarbers();
      setBarbers(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadClients = async () => {
    try {
      const data = await userService.getAllClients();
      setClients(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAppointments = async () => {
    setLoading(true);
    setError('');
    try {
      let start, end;
      if (viewType === 'day') {
        start = format(selectedDate, 'yyyy-MM-dd');
        end = start;
      } else if (viewType === 'week') {
        start = format(startOfWeek(selectedDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
        end = format(endOfWeek(selectedDate, { weekStartsOn: 0 }), 'yyyy-MM-dd');
      } else {
        start = format(startOfMonth(selectedDate), 'yyyy-MM-dd');
        end = format(endOfMonth(selectedDate), 'yyyy-MM-dd');
      }

      const filters: any = { 
        startDate: start,
        endDate: end
      };
      
      if (currentUser.tipo === 'cliente') filters.cliente_id = currentUser.uid;
      if (currentUser.tipo === 'barbeiro') filters.profissional_id = currentUser.uid;

      const data = await appointmentService.getAppointments(filters);
      setAppointments(data);
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar agendamentos.');
    } finally {
      setLoading(false);
    }
  };

  const handleNew = (time?: string, profissional_id?: string) => {
    setSelectedTimeSlot(time && profissional_id ? { time, profissional_id } : null);
    setSelectedAppointment(null);
    setIsModalOpen(true);
  };

  const handleOpenAppointment = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsModalOpen(true);
  };

  const handleOpenComanda = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setIsComandaModalOpen(true);
  };

  const [isExpressModalOpen, setIsExpressModalOpen] = useState(false);

  const tabs = [
    { id: 'main', label: 'Agenda', icon: <CalendarIcon size={16} /> },
    { id: 'appointments', label: 'Agendamentos', icon: <History size={16} /> },
    { id: 'recurring', label: 'Recorrência', icon: <Repeat size={16} /> },
    { id: 'availability', label: 'Disponibilidade', icon: <Clock size={16} /> },
    { id: 'blocks', label: 'Bloqueios', icon: <Lock size={16} /> },
    { id: 'operations', label: 'Operação', icon: <ArrowRightLeft size={16} /> },
    { id: 'resources', label: 'Recursos', icon: <Armchair size={16} /> },
  ];

  const filteredTabs = tabs.filter(tab => {
    if (currentUser.tipo === 'barbeiro' || currentUser.tipo === 'cliente') {
      return tab.id === 'main';
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-8 min-h-[calc(100vh-120px)] pb-10">
      {error && (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle size={20} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {/* Cash Register Alert */}
      {!currentCash && (isAdmin || isGerente) && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm mb-2"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shadow-inner">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="font-black text-amber-800 text-lg">Caixa Fechado</h3>
              <p className="text-amber-700/70 text-sm font-medium">O caixa do dia ainda não foi aberto. Abra o caixa para registrar as movimentações financeiras de hoje.</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('operations')} // Redireciona para aba onde pode abrir caixa rápida ou apenas abrir modal se estivermos na agenda
            className="flex items-center gap-2 bg-amber-500 text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 active:scale-95 whitespace-nowrap"
          >
            <ArrowRightLeft size={18} />
            <span>Abrir Caixa Agora</span>
          </button>
        </motion.div>
      )}

      {/* Sub-navigation */}
      <div className="flex items-center gap-3 overflow-x-auto pb-4 custom-scrollbar">
        {filteredTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AgendaTab)}
            className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border shadow-sm active:scale-95 ${
              activeTab === tab.id 
                ? 'bg-primary border-primary text-white shadow-primary/10' 
                : 'bg-white border-slate-200 text-muted hover:border-slate-300 hover:text-primary'
            }`}
          >
            {React.cloneElement(tab.icon as React.ReactElement, { size: 14 })}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-8 flex-1">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col gap-8">
          {/* Header Controls (Only for Main Agenda View) */}
          {activeTab === 'main' && (
            <header className="bg-white border border-slate-200 p-6 rounded-[2rem] flex flex-col xl:flex-row gap-6 items-center justify-between shadow-sm">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-inner">
                  <button 
                    onClick={() => setViewType('day')}
                    className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${viewType === 'day' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'}`}
                  >
                    Dia
                  </button>
                  <button 
                    onClick={() => setViewType('week')}
                    className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${viewType === 'week' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'}`}
                  >
                    Semana
                  </button>
                  <button 
                    onClick={() => setViewType('month')}
                    className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${viewType === 'month' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'}`}
                  >
                    Mês
                  </button>
                </div>

                <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedDate(subDays(selectedDate, viewType === 'week' ? 7 : 1))} className="p-2.5 text-muted hover:text-primary hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
                    <ChevronLeft size={20} />
                  </button>
                  <button 
                    onClick={() => setSelectedDate(new Date())}
                    className="px-4 py-2 bg-white border border-slate-200 text-primary text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                  >
                    Hoje
                  </button>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, viewType === 'week' ? 7 : 1))} className="p-2.5 text-muted hover:text-primary hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200">
                    <ChevronRight size={20} />
                  </button>
                </div>

                <h2 className="text-lg font-black text-primary hidden md:block tracking-tight">
                  {viewType === 'week' 
                    ? `Semana de ${format(startOfWeek(selectedDate), "dd 'de' MMM", { locale: ptBR })}`
                    : format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })
                  }
                </h2>

                {viewType !== 'month' && barbers.length > 0 && (
                  <>
                    <div className="h-8 w-px bg-slate-200 hidden xl:block" />
                    <div className="relative w-52">
                      <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select
                        value={selectedBarberFilter}
                        onChange={(e) => setSelectedBarberFilter(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-9 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner appearance-none font-bold cursor-pointer"
                      >
                        <option value="all">Todos Profissionais</option>
                        {barbers.map(barber => (
                          <option key={barber.uid} value={barber.uid}>
                            {barber.nome}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown size={12} />
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
                <div className="relative flex-1 xl:flex-none xl:w-72">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
                  <input 
                    type="text"
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                  />
                </div>

                <button 
                  onClick={() => handleNew(format(new Date(), 'HH:mm'), barbers[0]?.uid)}
                  className="flex items-center justify-center gap-2 bg-white text-emerald-600 px-5 py-3 rounded-2xl font-bold text-sm hover:bg-emerald-50 transition-all border border-emerald-100 shadow-sm active:scale-95"
                >
                  <ArrowRightLeft size={18} />
                  <span className="hidden sm:inline">Encaixe Rápido</span>
                </button>

                <button 
                  onClick={() => setIsExpressModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-white text-primary px-5 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all border border-slate-200 shadow-sm active:scale-95"
                >
                  <Scissors size={18} className="text-accent" />
                  <span className="hidden sm:inline text-accent">Balcão</span>
                </button>

                <button 
                  onClick={() => handleNew()}
                  className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Novo Agendamento</span>
                </button>
              </div>
            </header>
          )}

          {/* Dynamic Content */}
          <div className="flex-1">
            {activeTab === 'main' && (
              viewType === 'day' ? (
                <AgendaGeneral 
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  barbers={filteredBarbersForGrid}
                  appointments={appointments}
                  clients={clients}
                  blocks={blocks}
                  onNewAppointment={handleNew}
                  onOpenAppointment={handleOpenAppointment}
                  onOpenComanda={handleOpenComanda}
                  loading={loading}
                />
              ) : viewType === 'week' ? (
                <AgendaProfessional 
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  barbers={filteredBarbersForGrid}
                  appointments={appointments}
                  clients={clients}
                  blocks={blocks}
                  onNewAppointment={handleNew}
                  onOpenAppointment={handleOpenAppointment}
                  onOpenComanda={handleOpenComanda}
                  loading={loading}
                />
              ) : (
                <div className="bg-white border border-slate-200 p-20 rounded-[2.5rem] text-center shadow-sm">
                  <CalendarDays size={64} className="mx-auto text-slate-200 mb-6" />
                  <h3 className="text-2xl font-black text-primary mb-3">Visão Mensal</h3>
                  <p className="text-muted max-w-md mx-auto text-sm font-medium mb-10 leading-relaxed">Visualize a ocupação estratégica da sua barbearia ao longo do mês e identifique tendências de agendamento.</p>
                  <div className="grid grid-cols-7 gap-3 max-w-2xl mx-auto opacity-40">
                    {Array.from({ length: 31 }).map((_, i) => (
                      <div key={i} className="aspect-square bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-300 shadow-inner">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
            {activeTab === 'appointments' && (
              <AppointmentList 
                currentUser={currentUser}
                onOpenAppointment={handleOpenAppointment}
              />
            )}
            {activeTab === 'recurring' && <RecurringAppointments />}
            {activeTab === 'availability' && <AvailabilityManager />}
            {activeTab === 'blocks' && <BlocksManager selectedDate={selectedDate} />}
            {activeTab === 'operations' && <OperationsManager />}
            {activeTab === 'resources' && (
              <div className="bg-white border border-slate-200 p-20 rounded-[2.5rem] text-center shadow-sm">
                <Armchair size={64} className="mx-auto text-slate-200 mb-6" />
                <h3 className="text-2xl font-black text-primary mb-3">Gestão de Recursos</h3>
                <p className="text-muted max-w-md mx-auto text-sm font-medium leading-relaxed">Gerencie cadeiras, estações e equipamentos da sua barbearia para evitar conflitos de infraestrutura e otimizar o fluxo de trabalho.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar (Only for Main Agenda View) */}
        {activeTab === 'main' && (
          <aside className="w-full lg:w-80 flex flex-col gap-8">
            {/* Mini Summary */}
            <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm space-y-6">
              <h3 className="font-black text-primary flex items-center gap-2">
                <CalendarCheck size={18} className="text-accent" />
                Resumo do Dia
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner">
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Total</p>
                  <p className="text-3xl font-black text-primary tracking-tighter">{appointments.length}</p>
                </div>
                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 shadow-inner">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5">Concluídos</p>
                  <p className="text-3xl font-black text-emerald-600 tracking-tighter">
                    {appointments.filter(a => a.status === 'concluído').length}
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold mb-2">
                  <span className="text-muted uppercase tracking-widest">Ocupação</span>
                  <span className="text-primary">75%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-accent w-3/4 rounded-full" />
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => setActiveTab('blocks')}
                className="w-full py-4 bg-white border border-slate-200 text-primary rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95"
              >
                <Lock size={16} className="text-slate-400" /> 
                <span>Bloquear Horário</span>
              </button>
              <button 
                onClick={() => handleNew(format(new Date(), 'HH:mm'), barbers[0]?.uid)}
                className="w-full py-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl font-black text-xs hover:bg-emerald-100 transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95"
              >
                <ArrowRightLeft size={16} /> 
                <span>NOVO ENCAIXE</span>
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Modals */}
      <AppointmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadAppointments}
        appointment={selectedAppointment}
        currentUser={currentUser}
        initialTime={selectedTimeSlot?.time}
        initialProfissionalId={selectedTimeSlot?.profissional_id}
        onOpenComanda={handleOpenComanda}
      />

      {isComandaModalOpen && selectedAppointment && comandaInitialData && (
        <ComandaModal 
          comanda_id={selectedAppointment.comanda_id}
          onClose={() => setIsComandaModalOpen(false)}
          onSave={loadAppointments}
          initialData={comandaInitialData}
        />
      )}

      {isExpressModalOpen && (
        <ExpressComandaModal 
          onClose={() => setIsExpressModalOpen(false)}
          onSuccess={() => {
            setIsExpressModalOpen(false);
            loadAppointments();
          }}
          barbers={barbers}
          currentUser={currentUser}
        />
      )}
      
    </div>
  );
}

function ExpressComandaModal({ onClose, onSuccess, barbers, currentUser }: { onClose: () => void, onSuccess: () => void, barbers: UserProfile[], currentUser: UserProfile }) {
  const [loading, setLoading] = useState(false);
  const [selectedBarber, setSelectedBarber] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    userService.getAllClients().then(setClients);
  }, []);

  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone?.includes(searchTerm)
  ).slice(0, 5);

  const handleCreate = async () => {
    if (!selectedBarber) return;
    setLoading(true);
    try {
      const barber = barbers.find(b => b.uid === selectedBarber);
      const client = clients.find(c => c.uid === selectedClient);
      
      await comandaService.openComanda({
        cliente_id: selectedClient || 'avulso',
        cliente_name: client?.nome || 'Cliente Avulso',
        profissional_id: selectedBarber,
        profissional_name: barber?.nome || 'Profissional',
        status: 'aberta',
        origin: 'balcao',
        aberto_por_id: currentUser.uid,
        aberto_por_name: currentUser.nome,
      }, currentUser.uid, currentUser.nome);
      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-primary">Comanda Express</h2>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-1">Atendimento Balcão / Encaixe</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <XCircle size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          {/* Barber Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Profissional Responsável</label>
            <div className="grid grid-cols-2 gap-3">
              {barbers.map(barber => (
                <button
                  key={barber.uid}
                  onClick={() => setSelectedBarber(barber.uid)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                    selectedBarber === barber.uid 
                      ? 'border-accent bg-accent/5' 
                      : 'border-slate-50 bg-slate-50 hover:bg-white hover:border-slate-200'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center text-primary font-bold">
                    {barber.nome[0]}
                  </div>
                  <span className="text-xs font-black text-primary truncate">{barber.nome}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Client Search */}
          <div className="space-y-4">
            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Cliente (Opcional)</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input 
                type="text"
                placeholder="Buscar ou deixar avulso..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary"
              />
            </div>
            
            {searchTerm && filteredClients.length > 0 && (
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-2 space-y-1">
                {filteredClients.map(client => (
                  <button
                    key={client.uid}
                    onClick={() => {
                      setSelectedClient(client.uid);
                      setSearchTerm(client.nome);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                      selectedClient === client.uid ? 'bg-primary text-white' : 'hover:bg-white'
                    }`}
                  >
                    <span className="text-xs font-bold">{client.nome}</span>
                    <span className="text-[10px] opacity-70">{client.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-5 border border-slate-200 rounded-2xl font-bold text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              disabled={!selectedBarber || loading}
              onClick={handleCreate}
              className="flex-[2] py-5 bg-primary text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
              <span>Abrir Comanda</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PaymentModal({ appointment, onClose, onConfirm }: { appointment: Appointment, onClose: () => void, onConfirm: (method: string) => void }) {
  const [method, setMethod] = useState('pix');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-surface border border-border w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-2xl font-black text-primary">Finalizar Atendimento</h2>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-1">Selecione a forma de pagamento</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
            <XCircle size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-inner">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Serviço</span>
              <span className="text-sm font-bold text-primary">{appointment.servico_name}</span>
            </div>
            <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-4">
              <span className="text-[10px] font-black text-muted uppercase tracking-widest">Valor Total</span>
              <span className="text-3xl font-black text-emerald-600 tracking-tighter">R$ {appointment.price.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { id: 'pix', label: 'PIX', icon: <Smartphone size={20} /> },
              { id: 'dinheiro', label: 'Dinheiro', icon: <Wallet size={20} /> },
              { id: 'credito', label: 'Crédito', icon: <CreditCard size={20} /> },
              { id: 'debito', label: 'Débito', icon: <CreditCard size={20} /> },
              { id: 'fiado', label: 'Fiado', icon: <Clock size={20} /> },
              { id: 'assinatura', label: 'Assinatura', icon: <DollarSign size={20} /> },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`flex flex-col items-center justify-center gap-3 p-6 rounded-[1.5rem] border-2 transition-all shadow-sm active:scale-95 ${
                  method === m.id 
                    ? 'bg-accent/5 border-accent text-accent' 
                    : 'bg-white border-slate-100 text-muted hover:border-slate-200 hover:text-primary'
                }`}
              >
                <div className={`p-3 rounded-xl ${method === m.id ? 'bg-accent/10' : 'bg-slate-50'}`}>
                  {m.icon}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="pt-4 flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button 
              onClick={() => onConfirm(method)}
              className="flex-[2] py-4 bg-primary text-white rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-3 active:scale-95"
            >
              <CheckCircle2 size={20} />
              <span>Confirmar</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
