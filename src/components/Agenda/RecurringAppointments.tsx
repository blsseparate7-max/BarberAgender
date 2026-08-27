import React, { useState, useEffect, useMemo } from 'react';
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
  X,
  CalendarCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecurringAppointment, UserProfile, Service, Appointment } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { serviceService } from '../../services/serviceService';
import { format, parse, addMinutes, getDay, addDays, addMonths, isAfter, isBefore, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

type DurationPreset = '1m' | '2m' | '3m' | '6m' | '1y' | 'custom';
type DeleteMode = 'future' | 'all' | 'deactivate';

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
  
  // New Recurrence fields
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [pattern, setPattern] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1m');
  const [dayOfWeek, setDayOfWeek] = useState<number>(3); // Wednesday default
  const [dayOfMonth, setDayOfMonth] = useState<number>(15); // 15th default
  const [startTime, setStartTime] = useState('14:00');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [allowConflict, setAllowConflict] = useState(false);

  // Available time slots state
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Conflict validation state
  const [seriesConflicts, setSeriesConflicts] = useState<{ date: string; reason: string }[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);

  // Delete modal state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>('future');
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

  // Automatically update endDate when startDate or durationPreset changes
  useEffect(() => {
    if (!startDate) return;
    const startObj = parse(startDate, 'yyyy-MM-dd', new Date());
    if (isNaN(startObj.getTime())) return;

    if (durationPreset === '1m') {
      setEndDate(format(addMonths(startObj, 1), 'yyyy-MM-dd'));
    } else if (durationPreset === '2m') {
      setEndDate(format(addMonths(startObj, 2), 'yyyy-MM-dd'));
    } else if (durationPreset === '3m') {
      setEndDate(format(addMonths(startObj, 3), 'yyyy-MM-dd'));
    } else if (durationPreset === '6m') {
      setEndDate(format(addMonths(startObj, 6), 'yyyy-MM-dd'));
    } else if (durationPreset === '1y') {
      setEndDate(format(addMonths(startObj, 12), 'yyyy-MM-dd'));
    }
  }, [startDate, durationPreset]);

  // Keep dayOfWeek aligned with startDate
  useEffect(() => {
    if (startDate && pattern !== 'monthly') {
      const parsed = parse(startDate, 'yyyy-MM-dd', new Date());
      if (!isNaN(parsed.getTime())) {
        setDayOfWeek(getDay(parsed));
      }
    }
  }, [startDate, pattern]);

  // Load available time slots for the selected date & barber
  useEffect(() => {
    if (isModalOpen && selectedBarberId && startDate && selectedServiceId) {
      const service = services.find(s => s.id === selectedServiceId);
      const duration = service ? (service.duracao_minutos || 30) : 30;
      
      setLoadingSlots(true);
      appointmentService.getAvailableSlots(selectedBarberId, startDate, duration)
        .then(slots => {
          setAvailableSlots(slots);
          if (slots.length > 0 && !slots.includes(startTime)) {
            setStartTime(slots[0]);
          }
        })
        .catch(err => console.error("Erro ao carregar horários livres:", err))
        .finally(() => setLoadingSlots(false));
    } else {
      setAvailableSlots([]);
    }
  }, [selectedBarberId, startDate, selectedServiceId, isModalOpen]);

  // Calculate target dates in the series
  const calculatedTargetDates = useMemo(() => {
    if (!startDate || !endDate) return [];
    const startObj = parse(startDate, 'yyyy-MM-dd', new Date());
    const endObj = parse(endDate, 'yyyy-MM-dd', new Date());
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime()) || isBefore(endObj, startObj)) return [];

    const dates: string[] = [];
    let current = startObj;

    while (isBefore(current, endObj) || isEqual(current, endObj)) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const currDayOfWeek = getDay(current);
      const currDayOfMonth = current.getDate();

      if (pattern === 'weekly') {
        if (currDayOfWeek === dayOfWeek) {
          dates.push(dateStr);
        }
      } else if (pattern === 'biweekly') {
        if (currDayOfWeek === dayOfWeek) {
          const diffMs = current.getTime() - startObj.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffWeeks = Math.floor(diffDays / 7);
          if (diffWeeks % 2 === 0) {
            dates.push(dateStr);
          }
        }
      } else if (pattern === 'monthly') {
        if (currDayOfMonth === dayOfMonth) {
          dates.push(dateStr);
        }
      }

      current = addDays(current, 1);
    }
    return dates;
  }, [startDate, endDate, pattern, dayOfWeek, dayOfMonth]);

  // Check conflicts across all target dates in real time
  useEffect(() => {
    if (isModalOpen && selectedBarberId && calculatedTargetDates.length > 0 && startTime && selectedServiceId) {
      const service = services.find(s => s.id === selectedServiceId);
      const duration = service ? (service.duracao_minutos || 30) : 30;
      const startParse = parse(startTime, 'HH:mm', new Date());
      const endParse = addMinutes(startParse, duration);
      const endTimeStr = format(endParse, 'HH:mm');

      setCheckingConflicts(true);
      appointmentService.checkRecurringSeriesConflicts(selectedBarberId, calculatedTargetDates, startTime, endTimeStr)
        .then(conflicts => setSeriesConflicts(conflicts))
        .catch(err => console.error("Erro ao verificar conflitos da série:", err))
        .finally(() => setCheckingConflicts(false));
    } else {
      setSeriesConflicts([]);
    }
  }, [selectedBarberId, calculatedTargetDates, startTime, selectedServiceId, isModalOpen]);

  const resetForm = () => {
    setSelectedClientId('');
    setClientSearch('');
    setClientPhone('');
    setSelectedServiceId('');
    setSelectedBarberId('');
    setPattern('weekly');
    setDurationPreset('1m');
    setDayOfWeek(3);
    setDayOfMonth(15);
    setStartTime('14:00');
    setStartDate(format(new Date(), 'yyyy-MM-dd'));
    setEndDate(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
    setNotes('');
    setAllowConflict(false);
    setSeriesConflicts([]);
  };

  const handleClientSelect = (client: UserProfile) => {
    setSelectedClientId(client.uid);
    setClientSearch(client.nome);
    setClientPhone(client.telefone || client.phone || '');
    setShowClientDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalClientName = selectedClientId 
      ? (clients.find(c => c.uid === selectedClientId)?.nome || clientSearch) 
      : clientSearch.trim();

    if (!finalClientName) {
      toast.error('Por favor, selecione ou digite o nome do cliente.');
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

    if (seriesConflicts.length > 0 && !allowConflict) {
      toast.error(`Existem ${seriesConflicts.length} data(s) com conflito de horário. Marque a opção de encaixe ou escolha outro horário.`);
      return;
    }

    const service = services.find(s => s.id === selectedServiceId);
    const barber = barbers.find(b => b.uid === selectedBarberId);

    if (!service || !barber) {
      toast.error('Erro de validação dos dados do serviço ou profissional.');
      return;
    }

    setSubmitting(true);
    try {
      const duration = service.duracao_minutos || 30;
      const startParse = parse(startTime, 'HH:mm', new Date());
      const endParse = addMinutes(startParse, duration);
      const endTime = format(endParse, 'HH:mm');

      const appointmentTemplate: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'> = {
        cliente_id: selectedClientId || 'sem_cadastro',
        cliente_name: finalClientName,
        cliente_telefone: clientPhone || undefined,
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

      let finalDayOfWeek = dayOfWeek;
      if (pattern !== 'monthly') {
        const startDay = getDay(parse(startDate, 'yyyy-MM-dd', new Date()));
        finalDayOfWeek = startDay;
      }

      const recPayload: any = {
        pattern,
        startDate,
        appointmentTemplate,
        excludedDates: [],
      };
      if (endDate) recPayload.endDate = endDate;
      if (pattern !== 'monthly') recPayload.dayOfWeek = finalDayOfWeek;
      if (pattern === 'monthly') recPayload.dayOfMonth = dayOfMonth;

      await appointmentService.createRecurringAppointment(recPayload);

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
      await appointmentService.deleteRecurringAppointment(deleteId, deleteMode);
      toast.success(
        deleteMode === 'deactivate' 
          ? 'Recorrência desativada com sucesso!' 
          : 'Agendamento recorrente removido com sucesso!'
      );
      setDeleteId(null);
      loadRecurring();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar exclusão da recorrência.');
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
      return `Quinzenal (A cada 2 semanas - ${getDayName(rec.dayOfWeek ?? 3)})`;
    }
    return `Mensal (Todo dia ${rec.dayOfMonth ?? 15})`;
  };

  const filteredClientsForSearch = clients.filter(c => 
    c.nome.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.telefone && c.telefone.includes(clientSearch))
  );

  const filteredRecurring = recurring.filter(rec => {
    const template = rec.appointmentTemplate;
    const matchesSearch = 
      template.cliente_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.servico_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBarber = filterBarber === 'all' || template.profissional_id === filterBarber;
    return matchesSearch && matchesBarber;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-primary tracking-tight flex items-center gap-2">
            <Repeat className="text-accent" size={22} />
            <span>Agendamentos Recorrentes</span>
          </h2>
          <p className="text-xs text-muted font-medium mt-0.5">
            Gerencie horários fixos e repetições automáticas para seus clientes fiéis.
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="px-6 py-3.5 bg-primary hover:bg-slate-800 text-white font-bold rounded-2xl text-xs transition-all shadow-lg shadow-primary/10 flex items-center gap-2 active:scale-95 shrink-0"
        >
          <Plus size={18} />
          <span>Novo Horário Recorrente</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar por cliente ou serviço..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-sm transition-all text-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            value={filterBarber}
            onChange={(e) => setFilterBarber(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-sm transition-all cursor-pointer"
          >
            <option value="all">Todos os Barbeiros</option>
            {barbers.map((b, bIdx) => (
              <option key={`rec-flt-barber-${b.uid || bIdx}-${bIdx}`} value={b.uid}>{b.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Recurring Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-accent" size={32} />
          <p className="text-muted font-bold text-sm">Carregando agendamentos recorrentes...</p>
        </div>
      ) : filteredRecurring.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 text-center max-w-lg mx-auto shadow-sm my-8">
          <div className="w-16 h-16 bg-primary/5 text-primary rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/10">
            <Repeat size={28} />
          </div>
          <h3 className="text-lg font-black text-primary mb-2">Nenhum agendamento recorrente encontrado</h3>
          <p className="text-muted text-xs font-medium leading-relaxed mb-6">
            Nenhum cliente possui horários recorrentes com esses filtros. Clique no botão abaixo para registrar a primeira recorrência!
          </p>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 inline-flex items-center gap-2 active:scale-95"
          >
            <Plus size={16} />
            <span>Configurar Primeira Recorrência</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecurring.map((rec, recIdx) => {
            const template = rec.appointmentTemplate;
            const isInactive = (rec as any).status === 'inactive';
            return (
              <motion.div
                key={`rec-item-${rec.id || recIdx}-${recIdx}`}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white border p-6 rounded-[2rem] shadow-sm hover:shadow-md transition-all relative flex flex-col justify-between ${
                  isInactive ? 'border-slate-200 opacity-60 bg-slate-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/5 text-primary font-black text-sm rounded-xl flex items-center justify-center border border-primary/10">
                        {template.cliente_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-primary text-sm tracking-tight">{template.cliente_name}</h4>
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                          isInactive 
                            ? 'bg-amber-50 text-amber-700 border-amber-200' 
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {isInactive ? 'Inativa' : 'Recorrente'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setDeleteId(rec.id);
                        setDeleteMode('future');
                      }}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                      title="Cancelar/Excluir Recorrência"
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

      {/* Confirmation Delete / Cancel Recurrence Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-100">
                <Trash2 size={28} />
              </div>

              <div className="text-center space-y-2">
                <h3 className="text-lg font-black text-primary">Cancelar Recorrência</h3>
                <p className="text-muted text-xs font-medium">
                  Como você gostaria de proceder com o cancelamento desta regra de agendamento recorrente?
                </p>
              </div>

              {/* Options selection */}
              <div className="space-y-3">
                <label 
                  onClick={() => setDeleteMode('future')}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    deleteMode === 'future' 
                      ? 'bg-red-50/60 border-red-200 text-red-950 font-bold' 
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="deleteMode" 
                    checked={deleteMode === 'future'} 
                    onChange={() => setDeleteMode('future')} 
                    className="mt-1 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">Excluir agendamentos futuros não realizados</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">
                      Apaga horários marcados a partir de hoje que ainda não foram concluídos (Recomendado).
                    </span>
                  </div>
                </label>

                <label 
                  onClick={() => setDeleteMode('all')}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    deleteMode === 'all' 
                      ? 'bg-red-50/60 border-red-200 text-red-950 font-bold' 
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="deleteMode" 
                    checked={deleteMode === 'all'} 
                    onChange={() => setDeleteMode('all')} 
                    className="mt-1 text-red-600 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">Excluir todas as ocorrências da agenda</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">
                      Remove completamente a regra e todos os agendamentos abertos associados a ela.
                    </span>
                  </div>
                </label>

                <label 
                  onClick={() => setDeleteMode('deactivate')}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    deleteMode === 'deactivate' 
                      ? 'bg-amber-50/60 border-amber-200 text-amber-950 font-bold' 
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="deleteMode" 
                    checked={deleteMode === 'deactivate'} 
                    onChange={() => setDeleteMode('deactivate')} 
                    className="mt-1 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold block">Apenas desativar regra de recorrência</span>
                    <span className="text-[10px] text-slate-500 font-normal block mt-0.5">
                      Interrompe futuras gerações mantendo o cadastro no sistema como inativo.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all active:scale-95 border border-slate-200"
                >
                  Voltar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-red-600/10"
                >
                  {deleting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span>Confirmar Cancelamento</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Recurrence Form Modal (Fixed Layout, Height & Scroll) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] border border-slate-200 p-6 sm:p-8 max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl relative my-auto"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/5 text-primary rounded-xl flex items-center justify-center border border-primary/10">
                    <Repeat size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary tracking-tight">Nova Recorrência</h3>
                    <p className="text-xs text-muted font-medium">Selecione o cliente, dia, frequência e horários disponíveis.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Form Content */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 py-4 space-y-5 custom-scrollbar">
                
                {/* 1. Client Selector */}
                <div className="space-y-2 relative">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Cliente <span className="text-red-500">*</span></label>
                    <span className="text-[10px] text-muted font-bold">Selecione da lista ou digite</span>
                  </div>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="Pesquisar cliente cadastrado..."
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
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500 bg-emerald-50 p-1 rounded-full flex items-center gap-1">
                        <Check size={14} />
                      </div>
                    )}
                  </div>

                  {showClientDropdown && (
                    <div className="absolute z-30 w-full bg-white border border-slate-200 rounded-2xl mt-1 shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                      {clientSearch.trim() !== '' && !selectedClientId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId('');
                            setShowClientDropdown(false);
                          }}
                          className="w-full text-left p-3 hover:bg-emerald-50 text-xs font-bold border-b border-slate-100 flex items-center justify-between text-emerald-800 bg-emerald-50/60"
                        >
                          <div className="flex items-center gap-2">
                            <Plus size={14} className="text-emerald-600" />
                            <span>Usar "<strong>{clientSearch}</strong>" (Sem cadastro)</span>
                          </div>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-black">Usar Digitado</span>
                        </button>
                      )}

                      {filteredClientsForSearch.length === 0 ? (
                        <div className="p-4 text-xs text-muted font-medium text-center">Nenhum cliente cadastrado encontrado</div>
                      ) : (
                        filteredClientsForSearch.map((client, cIdx) => (
                          <button
                            key={`rec-cli-opt-${client.uid || cIdx}-${cIdx}`}
                            type="button"
                            onClick={() => handleClientSelect(client)}
                            className="w-full text-left p-3 hover:bg-slate-50 text-xs font-medium border-b border-slate-100 flex items-center justify-between text-primary transition-colors"
                          >
                            <div>
                              <span className="font-bold block">{client.nome}</span>
                              <span className="text-slate-400 block text-[10px]">{client.telefone || client.phone || 'Sem telefone'}</span>
                            </div>
                            <span className="text-[10px] font-bold text-accent bg-accent/5 px-2 py-1 rounded-lg">Selecionar</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Service & Professional Selection Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Serviço <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                    >
                      <option value="">Selecione o Serviço</option>
                      {services.map((service, sIdx) => (
                        <option key={`rec-srv-opt-${service.id || sIdx}-${sIdx}`} value={service.id}>
                          {service.nome} - {service.duracao_minutos} min ({(service.preco || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-primary uppercase tracking-wider">Profissional <span className="text-red-500">*</span></label>
                    <select
                      required
                      value={selectedBarberId}
                      onChange={(e) => setSelectedBarberId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner cursor-pointer"
                    >
                      <option value="">Selecione o Profissional</option>
                      {barbers.map((barber, bIdx) => (
                        <option key={`rec-barber-opt-${barber.uid || bIdx}-${bIdx}`} value={barber.uid}>{barber.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Recurrence Pattern & Duration Presets */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-primary uppercase tracking-wider">Frequência da Recorrência</label>
                      <select
                        value={pattern}
                        onChange={(e) => setPattern(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 cursor-pointer"
                      >
                        <option value="weekly">Semanal (Toda semana)</option>
                        <option value="biweekly">Quinzenal (A cada 2 semanas)</option>
                        <option value="monthly">Mensal (Uma vez por mês)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-primary uppercase tracking-wider">Período / Validade</label>
                      <select
                        value={durationPreset}
                        onChange={(e) => setDurationPreset(e.target.value as DurationPreset)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 cursor-pointer"
                      >
                        <option value="1m">1 Mês (4 semanas)</option>
                        <option value="2m">2 Meses (8 semanas)</option>
                        <option value="3m">3 Meses (12 semanas)</option>
                        <option value="6m">6 Meses (24 semanas)</option>
                        <option value="1y">1 Ano (52 semanas)</option>
                        <option value="custom">Personalizado (Escolher Data)</option>
                      </select>
                    </div>
                  </div>

                  {/* Dates Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600">Data do Primeio Atendimento</label>
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-primary focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-600">Data de Término Calculada</label>
                      <input
                        type="date"
                        required
                        disabled={durationPreset !== 'custom'}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-primary focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                  </div>

                  {/* Series Summary Card */}
                  {calculatedTargetDates.length > 0 && (
                    <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-900">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                        <span>
                          Serão gerados <strong className="font-black text-emerald-950">{calculatedTargetDates.length} agendamentos</strong> para essa série.
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        {pattern === 'weekly' ? 'Semanal' : pattern === 'biweekly' ? 'Quinzenal' : 'Mensal'}
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Select Day & Available Time Slots */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14} className="text-accent" />
                      <span>Horário Fixo Preferido</span>
                    </label>
                    <span className="text-[10px] text-muted font-bold">
                      {loadingSlots ? 'Buscando horários...' : 'Selecione abaixo ou digite'}
                    </span>
                  </div>

                  {/* Available Time Slot Pills */}
                  {selectedBarberId && startDate && availableSlots.length > 0 && (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Horários Livres no Profissional ({format(parse(startDate, 'yyyy-MM-dd', new Date()), 'dd/MM')}):</p>
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar">
                        {availableSlots.map((slot, sIdx) => (
                          <button
                            key={`rec-slot-${slot}-${sIdx}`}
                            type="button"
                            onClick={() => setStartTime(slot)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              startTime === slot 
                                ? 'bg-primary text-white shadow-sm' 
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Direct Time Input */}
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner"
                  />
                </div>

                {/* 5. Real-Time Conflicts Alert Banner */}
                {checkingConflicts ? (
                  <div className="flex items-center gap-2 text-xs text-muted p-3 bg-slate-50 rounded-2xl border border-slate-200">
                    <Loader2 size={14} className="animate-spin text-accent" />
                    <span>Verificando disponibilidade de todos os dias da série...</span>
                  </div>
                ) : seriesConflicts.length > 0 ? (
                  <div className="bg-red-50 border border-red-200 p-4 rounded-2xl space-y-3">
                    <div className="flex items-start gap-2.5 text-red-900">
                      <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-xs mb-1">
                          Conflito em {seriesConflicts.length} data(s) da série para o horário {startTime}:
                        </h5>
                        <ul className="text-[11px] text-red-800 space-y-1 list-disc pl-4 max-h-24 overflow-y-auto">
                          {seriesConflicts.map((c, cIdx) => (
                            <li key={`rec-conflict-${c.date}-${cIdx}`}>
                              <strong>{format(parse(c.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}</strong>: {c.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 pt-1 border-t border-red-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowConflict}
                        onChange={(e) => setAllowConflict(e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span className="text-xs font-bold text-red-900">
                        Permitir agendar com conflito (Forçar Encaixe nas datas ocupadas)
                      </span>
                    </label>
                  </div>
                ) : calculatedTargetDates.length > 0 && selectedBarberId ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center gap-2 text-xs text-emerald-900">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>Todos os {calculatedTargetDates.length} dias da série estão 100% livres para agendar no horário {startTime}!</span>
                  </div>
                ) : null}

                {/* 6. Notes */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-primary uppercase tracking-wider">Observações adicionais</label>
                  <textarea
                    placeholder="Adicione alguma nota ou preferência para esta série de agendamentos..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary font-medium shadow-inner resize-none"
                  />
                </div>
              </form>

              {/* Fixed Modal Footer Buttons */}
              <div className="flex gap-4 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-all active:scale-95 border border-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || (seriesConflicts.length > 0 && !allowConflict)}
                  className="flex-1 py-3.5 bg-primary hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-xs transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-primary/10"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span>Confirmar e Criar Série</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
