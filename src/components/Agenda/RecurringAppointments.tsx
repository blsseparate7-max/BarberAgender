import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Repeat, 
  Calendar, 
  User, 
  Scissors, 
  Trash2, 
  Loader2,
  AlertCircle,
  Clock,
  Check,
  TrendingUp,
  X,
  Users,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecurringAppointment, UserProfile, Service, Appointment } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { serviceService } from '../../services/serviceService';
import { format, parse, addMinutes, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export function RecurringAppointments() {
  const [recurring, setRecurring] = useState<RecurringAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBarber, setFilterBarber] = useState('all');

  // Load dependency data for the form
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Form & modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  
  // New Recurrence fields
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [pattern, setPattern] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState<number>(3); // Wednesday default
  const [dayOfMonth, setDayOfMonth] = useState<number>(15); // 15th default
  const [startTime, setStartTime] = useState('14:00');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadRecurring();
    loadDependencies();
  }, []);

  const loadRecurring = async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getRecurringAppointments();
      setRecurring(data);
    } catch (error) {
      console.error("Erro ao carregar recorrências:", error);
      toast.error("Erro ao carregar agendamentos recorrentes.");
    } finally {
      setLoading(false);
    }
  };

  const loadDependencies = async () => {
    try {
      const [allClients, allBarbers, allServices] = await Promise.all([
        userService.getAllClients(),
        userService.getAllBarbers(),
        serviceService.getServices(true)
      ]);
      setClients(allClients);
      setBarbers(allBarbers);
      setServices(allServices);
    } catch (error) {
      console.error("Erro ao carregar dados auxiliares:", error);
    }
  };

  // Availability validation on change of key form fields
  useEffect(() => {
    if (isModalOpen && selectedBarberId && startDate && startTime && selectedServiceId) {
      const service = services.find(s => s.id === selectedServiceId);
      const duration = service ? (service.duracao_minutos || 30) : 30;
      const startParse = parse(startTime, 'HH:mm', new Date());
      const endParse = addMinutes(startParse, duration);
      const endTimeStr = format(endParse, 'HH:mm');

      appointmentService.checkAvailability(selectedBarberId, startDate, startTime, endTimeStr)
        .then(res => {
          if (!res.available) {
            setConflictWarning(res.reason || "Conflito de horário detectado para o primeiro dia selecionado.");
          } else {
            setConflictWarning(null);
          }
        })
        .catch(() => setConflictWarning(null));
    } else {
      setConflictWarning(null);
    }
  }, [selectedBarberId, startDate, startTime, selectedServiceId, isModalOpen, services]);

  const resetForm = () => {
    setSelectedClientId('');
    setClientSearch('');
    setSelectedServiceId('');
    setSelectedBarberId('');
    setPattern('weekly');
    setDayOfWeek(3);
    setDayOfMonth(15);
    setStartTime('14:00');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate('');
    setNotes('');
    setConflictWarning(null);
  };

  const handleClientSelect = (client: UserProfile) => {
    setSelectedClientId(client.uid);
    setClientSearch(client.nome);
    setShowClientDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      toast.error('Por favor, selecione um cliente.');
      return;
    }
    if (!selectedServiceId) {
      toast.error('Por favor, selecione um serviço.');
      return;
    }
    if (!selectedBarberId) {
      toast.error('Por favor, selecione um profissional.');
      return;
    }

    const client = clients.find(c => c.uid === selectedClientId);
    const service = services.find(s => s.id === selectedServiceId);
    const barber = barbers.find(b => b.uid === selectedBarberId);

    if (!client || !service || !barber) {
      toast.error('Erro de validação dos dados selecionados.');
      return;
    }

    setSubmitting(true);
    try {
      const duration = service.duracao_minutos || 30;
      const startParse = parse(startTime, 'HH:mm', new Date());
      const endParse = addMinutes(startParse, duration);
      const endTime = format(endParse, 'HH:mm');

      const appointmentTemplate: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> = {
        cliente_id: client.uid,
        cliente_name: client.nome,
        profissional_id: barber.uid,
        profissional_name: barber.nome,
        servico_id: service.id,
        servico_name: service.nome,
        date: startDate,
        startTime,
        endTime,
        duration,
        price: service.preco || 0,
        status: 'agendado',
        origin: 'recorrente',
        notes: notes || undefined,
      };

      // Ensure dayOfWeek is correct based on selected startDate for Weekly/Biweekly if not manually set, or match it
      let finalDayOfWeek = dayOfWeek;
      if (pattern !== 'monthly') {
        const startDay = getDay(parse(startDate, 'yyyy-MM-dd', new Date()));
        finalDayOfWeek = startDay;
      }

      await appointmentService.createRecurringAppointment({
        pattern,
        startDate,
        endDate: endDate || undefined,
        dayOfWeek: pattern !== 'monthly' ? finalDayOfWeek : undefined,
        dayOfMonth: pattern === 'monthly' ? dayOfMonth : undefined,
        appointmentTemplate,
        excludedDates: [],
      });

      toast.success('Agendamento recorrente configurado com sucesso!');
      setIsModalOpen(false);
      resetForm();
      loadRecurring();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao criar agendamento recorrente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await appointmentService.deleteRecurringAppointment(deleteId);
      toast.success('Agendamento recorrente removido com sucesso!');
      setDeleteId(null);
      loadRecurring();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao deletar agendamento recorrente.');
    } finally {
      setDeleting(false);
    }
  };

  // Helper translations
  const getDayName = (dayNum: number) => {
    const days = [
      'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 
      'Quinta-feira', 'Sexta-feira', 'Sábado'
    ];
    return days[dayNum];
  };

  const getPatternLabel = (rec: RecurringAppointment) => {
    if (rec.pattern === 'weekly') {
      return `Semanal (Toda ${getDayName(rec.dayOfWeek ?? 3)})`;
    }
    if (rec.pattern === 'biweekly') {
      return `Quinzenal (A cada duas ${getDayName(rec.dayOfWeek ?? 3)}s)`;
    }
    return `Mensal (Todo dia ${rec.dayOfMonth ?? 15})`;
  };

  // Filters
  const filteredClientsForSearch = clientSearch.trim() === '' ? [] : clients.filter(c => 
    c.nome.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.telefone?.includes(clientSearch) ||
    c.phone?.includes(clientSearch)
  ).slice(0, 5);

  const filteredRecurring = recurring.filter(rec => {
    const template = rec.appointmentTemplate;
    const matchesSearch = template.cliente_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          template.servico_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBarber = filterBarber === 'all' || template.profissional_id === filterBarber;
    return matchesSearch && matchesBarber;
  });

  // Calculate metrics
  const activeCount = recurring.length;
  const uniqueClientsCount = new Set(recurring.map(r => r.appointmentTemplate.cliente_id)).size;
  const popularService = recurring.reduce((acc, curr) => {
    const name = curr.appointmentTemplate.servico_name;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topService = Object.keys(popularService).reduce((a, b) => popularService[a] > popularService[b] ? a : b, 'Nenhum');

  return (
    <div className="space-y-8 min-h-[calc(100vh-120px)] pb-10">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
        <div>
          <h2 className="text-xl font-black text-primary tracking-tight">Clientes Recorrentes</h2>
          <p className="text-sm text-muted font-medium">Configure e gerencie horários fixos de clientes fiéis de forma automatizada.</p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center gap-2 active:scale-95"
        >
          <Plus size={18} />
          <span>Nova Recorrência</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Recorrências Ativas</p>
            <h3 className="text-2xl font-black text-primary">{activeCount}</h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
            <Repeat size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Clientes com Horário Fixo</p>
            <h3 className="text-2xl font-black text-primary">{uniqueClientsCount}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] flex items-center justify-between shadow-sm hover:border-slate-300 transition-all">
          <div>
            <p className="text-[10px] text-muted font-black uppercase tracking-widest mb-1">Serviço mais Frequente</p>
            <h3 className="text-xl font-black text-primary truncate max-w-[180px]">{topService}</h3>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100">
            <Scissors size={20} />
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input 
            type="text"
            placeholder="Buscar por cliente ou serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <span className="text-xs font-black text-muted uppercase tracking-wider hidden sm:inline">Filtrar por:</span>
          <select
            value={filterBarber}
            onChange={(e) => setFilterBarber(e.target.value)}
            className="w-full sm:w-52 bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-bold shadow-inner"
          >
            <option value="all">Todos Barbeiros</option>
            {barbers.map(barber => (
              <option key={barber.uid} value={barber.uid}>{barber.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="bg-white border border-slate-200 p-20 rounded-[2.5rem] text-center shadow-sm flex flex-col items-center justify-center">
          <Loader2 size={36} className="text-primary animate-spin mb-4" />
          <p className="text-muted font-bold text-sm">Carregando agendamentos recorrentes...</p>
        </div>
      ) : filteredRecurring.length === 0 ? (
        <div className="bg-white border border-slate-200 p-16 rounded-[2.5rem] text-center shadow-sm max-w-4xl mx-auto">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
            <Repeat size={32} className="text-slate-400" />
          </div>
          <h3 className="text-lg font-black text-primary mb-2">Nenhum agendamento recorrente encontrado</h3>
          <p className="text-muted max-w-md mx-auto text-sm font-medium mb-8">
            Nenhum cliente possui horários recorrentes com esses filtros. Clique no botão abaixo para registrar a primeira recorrência!
          </p>
          <button
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 inline-flex items-center gap-2 active:scale-95"
          >
            <Plus size={16} />
            <span>Configurar Primeira Recorrência</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecurring.map(rec => {
            const template = rec.appointmentTemplate;
            return (
              <motion.div
                key={rec.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm hover:shadow-md hover:border-slate-300 transition-all relative group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/5 text-primary font-black text-sm rounded-xl flex items-center justify-center border border-primary/10">
                        {template.cliente_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-primary text-sm tracking-tight">{template.cliente_name}</h4>
                        <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-500 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          Recorrente
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setDeleteId(rec.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                      title="Excluir Recorrência"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2 text-muted">
                      <Scissors size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-600">Serviço:</span>
                      <span className="font-bold text-primary">{template.servico_name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-muted">
                      <User size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-600">Barbeiro:</span>
                      <span className="font-bold text-primary">{template.profissional_name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-muted">
                      <Repeat size={14} className="text-primary" />
                      <span className="font-medium text-slate-600">Padrão:</span>
                      <span className="font-bold text-primary">{getPatternLabel(rec)}</span>
                    </div>

                    <div className="flex items-center gap-2 text-muted">
                      <Clock size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-600">Horário fixo:</span>
                      <span className="font-bold text-primary">{template.startTime} ({template.duration} min)</span>
                    </div>

                    <div className="flex items-center gap-2 text-muted">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="font-medium text-slate-600">Data de Início:</span>
                      <span className="font-bold text-primary">
                        {format(parse(rec.startDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}
                      </span>
                    </div>

                    {rec.endDate && (
                      <div className="flex items-center gap-2 text-muted">
                        <CalendarCheck size={14} className="text-slate-400" />
                        <span className="font-medium text-slate-600">Data de Término:</span>
                        <span className="font-bold text-primary">
                          {format(parse(rec.endDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-muted font-bold uppercase tracking-wider">
                  <span>Preço Fixo:</span>
                  <span className="text-emerald-600 text-xs font-black">
                    {template.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirmation Delete Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] border border-slate-200 p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <Trash2 size={28} />
              </div>

              <div className="text-center">
                <h3 className="text-lg font-black text-primary mb-2">Excluir Agendamento Recorrente</h3>
                <p className="text-muted text-sm font-medium">
                  Tem certeza que deseja cancelar esta recorrência? Todos os agendamentos futuros gerados sob este padrão que ainda não foram realizados serão excluídos.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all active:scale-95 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-red-600/10"
                >
                  {deleting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span>Excluir</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Recurrence Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 p-8 max-w-xl w-full shadow-2xl relative my-8"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute right-6 top-6 p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-xl transition-all"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center border border-primary/10">
                  <Repeat size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-primary tracking-tight">Nova Recorrência</h3>
                  <p className="text-xs text-muted font-medium">Configure as opções de repetição e horário preferido.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Searchable Client Selector */}
                <div className="space-y-2 relative">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Cliente <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar por nome ou telefone do cliente..."
                      value={clientSearch}
                      onChange={(e) => {
                        setClientSearch(e.target.value);
                        setSelectedClientId('');
                        setShowClientDropdown(true);
                      }}
                      onFocus={() => setShowClientDropdown(true)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner font-medium"
                    />
                    {selectedClientId && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 bg-emerald-50 p-1 rounded-full">
                        <Check size={14} />
                      </div>
                    )}
                  </div>

                  {showClientDropdown && clientSearch.trim() !== '' && (
                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-2xl mt-1 shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                      {filteredClientsForSearch.length === 0 ? (
                        <div className="p-4 text-xs text-muted font-medium text-center">Nenhum cliente encontrado</div>
                      ) : (
                        filteredClientsForSearch.map(client => (
                          <button
                            key={client.uid}
                            type="button"
                            onClick={() => handleClientSelect(client)}
                            className="w-full text-left p-3 hover:bg-slate-50 text-xs font-medium border-b border-slate-100 flex items-center justify-between text-primary"
                          >
                            <div>
                              <span className="font-bold">{client.nome}</span>
                              <span className="text-slate-400 block text-[10px]">{client.telefone || client.phone || 'Sem telefone'}</span>
                            </div>
                            <Plus size={14} className="text-slate-400" />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Service Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Serviço <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                  >
                    <option value="">Selecione o Serviço</option>
                    {services.map(service => (
                      <option key={service.id} value={service.id}>
                        {service.nome} - {service.duracao_minutos} min ({(service.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Barber Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Profissional <span className="text-red-500">*</span></label>
                  <select
                    required
                    value={selectedBarberId}
                    onChange={(e) => setSelectedBarberId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                  >
                    <option value="">Selecione o Profissional</option>
                    {barbers.map(barber => (
                      <option key={barber.uid} value={barber.uid}>{barber.nome}</option>
                    ))}
                  </select>
                </div>

                {/* Recurrence Pattern Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Padrão de Repetição</label>
                    <select
                      value={pattern}
                      onChange={(e) => setPattern(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Quinzenal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </div>

                  {pattern !== 'monthly' ? (
                    <div className="space-y-2">
                      <label className="text-xs font-black text-primary uppercase tracking-wider">Dia da Semana</label>
                      <select
                        value={dayOfWeek}
                        onChange={(e) => setDayOfWeek(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                      >
                        <option value={1}>Segunda-feira</option>
                        <option value={2}>Terça-feira</option>
                        <option value={3}>Quarta-feira</option>
                        <option value={4}>Quinta-feira</option>
                        <option value={5}>Sexta-feira</option>
                        <option value={6}>Sábado</option>
                        <option value={0}>Domingo</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-black text-primary uppercase tracking-wider">Dia do Mês</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner"
                      />
                    </div>
                  )}
                </div>

                {/* Time Slot and Start Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Horário Fixo <span className="text-red-500">*</span></label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Início das Repetições <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                    />
                  </div>
                </div>

                {/* Optional End Date */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Data de Término (Opcional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Observações adicionais</label>
                  <textarea
                    placeholder="Adicione alguma nota, preferência especial ou indicação técnica para esta recorrência..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner resize-none"
                  />
                </div>

                {/* Conflict Warnings */}
                {conflictWarning && (
                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3 text-amber-700">
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                    <div className="text-xs font-medium">
                      <p className="font-bold mb-0.5">Aviso de Disponibilidade:</p>
                      <p>{conflictWarning}</p>
                    </div>
                  </div>
                )}

                {/* Submit buttons */}
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all active:scale-95 border border-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-3.5 bg-primary hover:bg-slate-800 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-primary/10"
                  >
                    {submitting ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <span>Salvar Recorrência</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
