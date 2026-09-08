import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Receipt,
  Scissors,
  User,
  AlertCircle,
  Loader2,
  UserPlus,
  AlertTriangle,
  HeartHandshake,
  DollarSign,
  Award,
  Sparkles,
  Lock,
  TrendingUp,
  Users,
  MessageCircle,
  Play,
  Check,
  Zap,
  Phone,
  Trophy,
  Eye,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Appointment, AppointmentStatus, UserProfile, AgendaBlock } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { agendaBlockService } from '../../services/agendaBlockService';
import { serviceService } from '../../services/serviceService';
import { computeOverlappingLayout, ItemPosition, LayoutItem } from '../../lib/calendarLayout';
import { toast } from 'sonner';
import { format, addDays, subDays, isSameDay, parse, isEqual, isAfter, isBefore, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaGeneralProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  barbers: UserProfile[];
  appointments: Appointment[];
  clients?: UserProfile[];
  subscriptions?: any[];
  blocks?: AgendaBlock[];
  onNewAppointment: (time: string, profissional_id: string) => void;
  onOpenAppointment: (app: Appointment) => void;
  onOpenComanda: (app: Appointment) => void;
  onOpenRanking?: () => void;
  loading: boolean;
  hideManagementMetrics?: boolean;
  customSubscriptionLabel?: string;
}

export function AgendaGeneral({ 
  selectedDate, 
  setSelectedDate, 
  barbers, 
  appointments, 
  clients = [],
  subscriptions = [],
  blocks = [],
  onNewAppointment, 
  onOpenAppointment,
  onOpenComanda,
  onOpenRanking,
  loading,
  hideManagementMetrics = false,
  customSubscriptionLabel = 'Clube VIP'
}: AgendaGeneralProps) {
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [nowTime, setNowTime] = useState<Date>(new Date());
  const [servicesList, setServicesList] = useState<any[]>([]);
  const displayedBarbers = barbers;

  // Load services for price fallback on subscription/zero-priced appointments
  useEffect(() => {
    serviceService.getServices(true).then(setServicesList).catch(() => {});
  }, []);

  // Update real-time clock indicator every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setNowTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const getClientClassification = (clienteId: string, clienteName: string) => {
    const client = clients?.find(c => c.uid === clienteId);
    
    // 1. Check if they have a "faltou" history in database appointments
    const hasMissedBefore = appointments.some(app => app.cliente_id === clienteId && app.status === 'faltou');

    // 2. Check observations for indication / indicação
    const obsLower = (client?.observations || client?.observacoes || '').toLowerCase();
    const isReferred = obsLower.includes('indica') || obsLower.includes('indicado') || obsLower.includes('indicidade') || obsLower.includes('referra');

    // 3. Outstanding debt
    const hasDebt = (client?.total_em_aberto || 0) > 0;

    // 4. Appointment count (Client is new vs VIP)
    const count = client?.appointmentsCount ?? 0;
    const isNew = count <= 1;
    const isVIP = count >= 5;

    const badges: { label: string; icon: React.ReactNode; className: string }[] = [];

    if (isNew) {
      badges.push({
        label: 'Novo',
        icon: <UserPlus size={10} />,
        className: 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20'
      });
    }
    if (hasMissedBefore) {
      badges.push({
        label: 'Faltou',
        icon: <AlertTriangle size={10} />,
        className: 'bg-rose-500/10 text-rose-700 border border-rose-500/20'
      });
    }
    if (isReferred) {
      badges.push({
        label: 'Indicado',
        icon: <HeartHandshake size={10} />,
        className: 'bg-purple-500/10 text-purple-700 border border-purple-500/20'
      });
    }
    if (hasDebt) {
      badges.push({
        label: 'Débito',
        icon: <DollarSign size={10} />,
        className: 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
      });
    }
    if (isVIP) {
      badges.push({
        label: 'VIP',
        icon: <Award size={10} />,
        className: 'bg-indigo-500/10 text-indigo-700 border border-indigo-500/40'
      });
    }

    // 5. Subscription check
    const clientSubs = (subscriptions || []).filter(sub => sub.cliente_id === clienteId);
    const hasActiveSub = clientSubs.some(sub => sub.status === 'active');
    const hasExpiredSub = !hasActiveSub && clientSubs.some(sub => sub.status === 'expired' || sub.status === 'past_due' || sub.status === 'inactive');

    if (hasActiveSub) {
      badges.push({
        label: customSubscriptionLabel || 'Assinante',
        icon: <Crown size={11} className="text-amber-300 drop-shadow-sm fill-amber-300" />,
        className: 'bg-slate-950 text-amber-300 border border-amber-400/50 shadow-sm font-black tracking-wider'
      });
    } else if (hasExpiredSub) {
      badges.push({
        label: `${customSubscriptionLabel || 'Clube'} Vencido`,
        icon: <AlertCircle size={10} />,
        className: 'bg-red-600 text-white border border-red-700 font-extrabold animate-pulse'
      });
    }

    return badges;
  };

  // Dynamically compute time slots for the agenda grid based on barbers' working hours
  useEffect(() => {
    let minHour = 8;
    let maxHour = 20;

    const dayOfWeek = selectedDate.getDay(); // 0 = Domingo, 1 = Segunda, etc.

    if (barbers && barbers.length > 0) {
      let computedMinsStart = 24 * 60;
      let computedMinsEnd = 0;

      barbers.forEach(b => {
        const whList = b.horario_de_trabalho || [];
        const whToday = whList.find((w: any) => w.dayOfWeek === dayOfWeek || w.dia === String(dayOfWeek)) as any;
        if (whToday && whToday.isOpen !== false && (whToday.startTime || whToday.inicio)) {
          const startStr = whToday.startTime || whToday.inicio || '08:00';
          const endStr = whToday.endTime || whToday.fim || '20:00';
          const [iH, iM] = startStr.split(':').map(Number);
          const [fH, fM] = endStr.split(':').map(Number);
          const startM = (iH || 8) * 60 + (iM || 0);
          const endM = (fH || 20) * 60 + (fM || 0);
          if (startM < computedMinsStart) computedMinsStart = startM;
          if (endM > computedMinsEnd) computedMinsEnd = endM;
        } else {
          // Fallback default hours if barber has no specific shift configured for today
          if (8 * 60 < computedMinsStart) computedMinsStart = 8 * 60;
          if (20 * 60 > computedMinsEnd) computedMinsEnd = 20 * 60;
        }
      });

      if (computedMinsStart < computedMinsEnd) {
        minHour = Math.floor(computedMinsStart / 60);
        maxHour = Math.ceil(computedMinsEnd / 60);
      }
    }

    const slots = [];
    let current = parse(String(minHour).padStart(2, '0') + ':00', 'HH:mm', new Date());
    const end = parse(String(maxHour).padStart(2, '0') + ':00', 'HH:mm', new Date());
    while (isBefore(current, end) || isEqual(current, end)) {
      slots.push(format(current, 'HH:mm'));
      current = addMinutes(current, 30);
    }
    setTimeSlots(slots.length > 0 ? slots : ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']);
  }, [barbers, selectedDate]);

  const getBarberAppointments = (barber: UserProfile, time: string) => {
    try {
      const slotStart = parse(time, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, 30);
      if (isNaN(slotStart.getTime())) return [];
      
      return appointments.filter(app => {
        const matchProf = app.profissional_id === barber.uid || (barber.id && app.profissional_id === barber.id);
        if (!matchProf || app.date !== format(selectedDate, 'yyyy-MM-dd')) return false;
        if (!app.startTime || !app.endTime) return false;
        
        const appStart = parse(app.startTime, 'HH:mm', new Date());
        const appEnd = parse(app.endTime, 'HH:mm', new Date());
        
        if (isNaN(appStart.getTime()) || isNaN(appEnd.getTime())) return false;
        
        return isBefore(slotStart, appEnd) && isAfter(slotEnd, appStart);
      });
    } catch (err) {
      console.error("Error filtering appointments:", err);
      return [];
    }
  };

  const getBarberBlock = (barber: UserProfile, time: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const slotStart = parse(time, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, 30);
      return (blocks || []).find(block => {
        if (block.date !== dateStr) return false;
        const matchProf = block.profissional_id === barber.uid || (barber.id && block.profissional_id === barber.id);
        if (!block.isGeneral && !matchProf) return false;
        
        const bStart = parse(block.startTime, 'HH:mm', new Date());
        const bEnd = parse(block.endTime, 'HH:mm', new Date());
        if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) return false;

        return isBefore(slotStart, bEnd) && isAfter(slotEnd, bStart);
      });
    } catch (err) {
      console.error("Error filtering blocks:", err);
      return undefined;
    }
  };

  // Pre-calculate non-overlapping side-by-side layout for each barber's appointments and blocks on selected date
  const barberLayoutsMap = React.useMemo(() => {
    const map = new Map<string, Map<string, ItemPosition>>();
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    displayedBarbers.forEach(barber => {
      const bUid = barber.uid || barber.id || '';

      const barberApps = appointments.filter(app => {
        const matchProf = app.profissional_id === bUid || (barber.id && app.profissional_id === barber.id);
        return matchProf && app.date === dateStr && app.status !== 'cancelado';
      });

      const barberBlocks = (blocks || []).filter(block => {
        if (block.date !== dateStr) return false;
        const matchProf = block.profissional_id === bUid || (barber.id && block.profissional_id === barber.id);
        return block.isGeneral || matchProf;
      });

      const items: LayoutItem[] = [
        ...barberApps.map(a => ({
          id: a.id,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        ...barberBlocks.map(b => ({
          id: b.id || `block-${b.startTime}`,
          startTime: b.startTime,
          endTime: b.endTime,
        }))
      ];

      const layout = computeOverlappingLayout(items);
      map.set(bUid, layout);
    });

    return map;
  }, [displayedBarbers, appointments, blocks, selectedDate]);

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmado':
      case 'agendado': 
        return 'bg-blue-600 border-2 border-blue-700 text-white shadow-md hover:bg-blue-700 font-bold';
      case 'em_atendimento': 
        return 'bg-amber-500 border-2 border-amber-600 text-slate-950 shadow-lg ring-2 ring-amber-400/60 hover:bg-amber-600 font-black';
      case 'concluído': 
        return 'bg-emerald-600 border-2 border-emerald-700 text-white shadow-md hover:bg-emerald-700 font-bold';
      case 'cancelado': 
        return 'bg-rose-600 border-2 border-rose-700 text-white opacity-90 font-bold';
      case 'faltou': 
        return 'bg-slate-600 border-2 border-slate-700 text-slate-200 line-through opacity-85 font-medium';
      case 'bloqueado': 
        return 'bg-slate-900 border-2 border-slate-800 text-white font-black';
      default: 
        return 'bg-slate-700 border-2 border-slate-800 text-white';
    }
  };

  // --- STATS FOR THE FLASH TOP BAR ---
  const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');
  const dayApps = appointments.filter(a => a.date === selectedDayStr);

  // 1. Separation of Client Appointments vs Total Services
  // Unique Clients booked today
  const uniqueClientsCount = new Set(
    dayApps
      .filter(a => a.status !== 'cancelado')
      .map(a => a.cliente_id || a.cliente_name || a.id)
  ).size;

  // Total Services booked today (accounting for multi-service or total valid appointments)
  const totalServicesCount = dayApps
    .filter(a => a.status !== 'cancelado')
    .reduce((acc, a) => {
      const extraServicesCount = Array.isArray((a as any).servicos) ? (a as any).servicos.length : 0;
      return acc + Math.max(1, extraServicesCount);
    }, 0);

  const concluidosCount = dayApps.filter(a => a.status === 'concluído').length;
  const emAtendimentoCount = dayApps.filter(a => a.status === 'em_atendimento').length;
  const agendadosCount = dayApps.filter(a => a.status === 'agendado' || a.status === 'confirmado').length;
  const faltouCount = dayApps.filter(a => a.status === 'faltou').length;

  // 2. Professionals available on selected day (checking working hours and active status)
  const dayOfWeekNumber = selectedDate.getDay(); // 0 = Domingo, 1 = Segunda, ... 6 = Sábado
  const availableBarbersOnDay = barbers.filter(b => {
    if (b.bloqueadoParaAgendar) return false;
    if (b.horario_de_trabalho && Array.isArray(b.horario_de_trabalho) && b.horario_de_trabalho.length > 0) {
      const daySchedule = b.horario_de_trabalho.find(
        (h: any) => h.dayOfWeek === dayOfWeekNumber || h.dia_semana === dayOfWeekNumber
      );
      if (daySchedule && (daySchedule.isOpen === false || (daySchedule as any).is_open === false)) {
        return false;
      }
    }
    return true;
  });

  const totalWorkingBarbersCount = availableBarbersOnDay.length > 0 ? availableBarbersOnDay.length : barbers.length;

  // Occupancy rate calculation of the day
  // Standard capacity = ~16 half-hour slots per working professional
  const totalDailyCapacity = Math.max(1, totalWorkingBarbersCount * 16);
  const activeDayAppointments = dayApps.filter(a => a.status !== 'cancelado').length;
  const dailyOccupancyRate = Math.min(100, Math.round((activeDayAppointments / totalDailyCapacity) * 100));

  // Current moment occupancy
  const barbersOccupiedNow = barbers.filter(b => {
    const bUid = b.uid || b.id;
    return dayApps.some(app => {
      const matchProf = app.profissional_id === bUid;
      if (!matchProf) return false;
      if (app.status === 'em_atendimento') return true;
      if (isSameDay(selectedDate, nowTime)) {
        const nowStr = format(nowTime, 'HH:mm');
        return app.startTime <= nowStr && app.endTime >= nowStr && app.status !== 'cancelado' && app.status !== 'faltou';
      }
      return false;
    });
  });

  const getAppPrice = (a: Appointment) => {
    // 1. If explicitly marked as subscription, cortesia, or price 0
    if (
      a.isSubscription || 
      (a as any).deductType === 'assinatura' || 
      (a as any).origin === 'assinatura' || 
      (a as any).isCortesia
    ) {
      return 0;
    }

    if (a.price === 0 || (a as any).preco === 0 || (a as any).valor === 0) {
      return 0;
    }

    // 2. Check if client has an active subscription
    const clientSubs = (subscriptions || []).filter(sub => 
      sub.cliente_id === a.cliente_id || 
      (a as any).clienteId === sub.cliente_id
    );
    const hasActiveSub = clientSubs.some(sub => sub.status === 'active' || sub.status === 'ativo');

    // If client is an active subscriber and the appointment isn't explicitly marked as a separate paid non-subscription service
    if (hasActiveSub && a.isSubscription !== false) {
      return 0;
    }

    // 3. Direct appointment price if > 0
    const directPrice = a.price ?? (a as any).preco ?? (a as any).valor;
    if (directPrice !== undefined && directPrice !== null && Number(directPrice) > 0) {
      return Number(directPrice);
    }

    // 4. Fallback to service table price for regular clients
    if (a.servico_id) {
      const srv = servicesList.find(s => s.id === a.servico_id);
      if (srv && (srv.price || srv.preco)) return Number(srv.price || srv.preco);
    }

    return Number(directPrice || 0);
  };

  const valorConcluido = dayApps.filter(a => a.status === 'concluído').reduce((acc, a) => acc + getAppPrice(a), 0);
  const valorPrevisto = dayApps.filter(a => a.status !== 'cancelado' && a.status !== 'faltou').reduce((acc, a) => acc + getAppPrice(a), 0);

  // 3. Top Barber ranking for the Day (to show directly in the ranking card next to Cadeiras Ocupadas)
  const topBarberDayRanking = React.useMemo(() => {
    return barbers.map(barber => {
      const bId = barber.uid || barber.id;
      const bApps = dayApps.filter(app => app.profissional_id === bId && app.status !== 'cancelado');
      const completed = bApps.filter(a => a.status === 'concluído').length;
      return {
        barber,
        id: bId,
        nome: barber.nome || (barber as any).displayName || 'Barbeiro',
        foto: barber.foto || barber.fotoUrl || (barber as any).photoURL || '',
        total: bApps.length,
        completed
      };
    }).sort((a, b) => b.total - a.total);
  }, [barbers, dayApps]);

  const clientsWithDebtCount = dayApps.filter(a => {
    const c = clients.find(cl => cl.uid === a.cliente_id);
    return (c?.total_em_aberto || 0) > 0;
  }).length;

  const newClientsCount = dayApps.filter(a => {
    const c = clients.find(cl => cl.uid === a.cliente_id);
    return (c?.appointmentsCount ?? 0) <= 1;
  }).length;

  // Real-time line calculations
  const isSelectedToday = isSameDay(selectedDate, nowTime);
  const currentHour = nowTime.getHours();
  const currentMin = nowTime.getMinutes();
  const minutesFromGridStart = (currentHour * 60 + currentMin) - (8 * 60); // 8:00 AM start
  const isNowInGridRange = isSelectedToday && minutesFromGridStart >= 0 && minutesFromGridStart <= (21 - 8) * 60;
  // Each 30min slot is 72px high => 2.4px per minute
  const nowLineTopPx = (minutesFromGridStart / 30) * 72 + 4;

  const handleStartService = async (app: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await appointmentService.startService(app.id);
      toast.success(`Atendimento com ${app.cliente_name} iniciado!`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar atendimento.");
    }
  };

  return (
    <div className="flex flex-col gap-5 flex-1">
      {!hideManagementMetrics && (
        <>
          {/* 📊 TOP FLASH METRICS BAR (Resumo Inteligente & Sincronizado) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Resumo de Agendamentos e Serviços */}
            <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total do Dia</span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <CalendarIcon size={16} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{uniqueClientsCount}</p>
                  <span className="text-xs font-bold text-slate-500">
                    {uniqueClientsCount === 1 ? 'cliente agendado' : 'clientes agendados'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  <span className="font-bold text-indigo-600">{totalServicesCount}</span> {totalServicesCount === 1 ? 'serviço na grade' : 'serviços na grade'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[9px] font-black border border-emerald-200">
                    {concluidosCount} Concluídos
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[9px] font-black border border-amber-200 animate-pulse">
                    {emAtendimentoCount} Na Cadeira
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[9px] font-black border border-blue-200">
                    {agendadosCount} Agendados
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Cadeiras Ocupadas + Taxa de Ocupação do Dia */}
            <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cadeiras & Ocupação</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Scissors size={16} />
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-2xl font-black text-slate-900 tracking-tight">
                    {barbersOccupiedNow.length} <span className="text-xs font-bold text-slate-400">/ {totalWorkingBarbersCount} em atendimento</span>
                  </p>
                  <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {dailyOccupancyRate}% dia
                  </span>
                </div>
                
                {/* Barra de Taxa de Ocupação */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${dailyOccupancyRate}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2 text-[11px] font-bold text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${totalWorkingBarbersCount - barbersOccupiedNow.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span>{Math.max(0, totalWorkingBarbersCount - barbersOccupiedNow.length)} livres agora</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {availableBarbersOnDay.length} de {barbers.length} no dia
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Ranking dos Barbeiros do Dia */}
            <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Trophy size={14} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ranking do Dia</span>
                </div>
                {onOpenRanking && (
                  <button
                    type="button"
                    onClick={onOpenRanking}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-accent bg-accent/10 hover:bg-accent/20 px-2 py-0.5 rounded-lg transition active:scale-95"
                    title="Ver Ranking Completo"
                  >
                    <Eye size={12} />
                    <span>Detalhes</span>
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1.5">
                {topBarberDayRanking.slice(0, 2).map((item, index) => (
                  <div key={item.id} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {index + 1}
                      </span>
                      <span className="font-bold text-slate-800 truncate max-w-[100px]">{item.nome}</span>
                    </div>
                    <span className="font-black text-slate-700 text-xs">
                      {item.total} <span className="text-[10px] font-normal text-slate-400">({item.completed} conc.)</span>
                    </span>
                  </div>
                ))}
                {topBarberDayRanking.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Nenhum barbeiro escalado</p>
                )}
                {topBarberDayRanking.length > 2 && (
                  <p className="text-[10px] font-bold text-slate-400 text-right pt-0.5">
                    +{topBarberDayRanking.length - 2} outros profissionais
                  </p>
                )}
              </div>
            </div>

            {/* Card 4: Faturamento do Dia */}
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Faturamento do Dia</span>
                <div className="w-8 h-8 rounded-xl bg-white/10 text-emerald-400 flex items-center justify-center font-bold backdrop-blur-md">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-black font-mono text-white tracking-tight">
                  R$ {valorConcluido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-[10px] font-bold text-indigo-200 mt-1">
                  Previsto Total: R$ {valorPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* 🏷️ BARRA DE LEGENDA DISCRETA DE STATUS */}
          <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Filter size={12} /> Status & Destaques:
            </span>
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-white bg-gradient-to-r from-amber-500 to-yellow-600 px-2.5 py-1 rounded-lg border border-yellow-400 font-black shadow-xs text-[11px]">
                <Crown size={12} className="text-yellow-200 fill-yellow-200" /> {customSubscriptionLabel || 'Clube VIP'}
              </span>
              <span className="flex items-center gap-1.5 text-white bg-blue-600 px-2.5 py-1 rounded-lg border border-blue-700 shadow-xs text-[11px]">
                <span className="w-2 h-2 rounded-full bg-white" /> Confirmado
              </span>
              <span className="flex items-center gap-1.5 text-slate-950 bg-amber-400 px-2.5 py-1 rounded-lg border border-amber-500 font-black shadow-xs ring-2 ring-amber-300/40 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-amber-900 animate-ping" /> Na Cadeira
              </span>
              <span className="flex items-center gap-1.5 text-white bg-emerald-600 px-2.5 py-1 rounded-lg border border-emerald-700 shadow-xs text-[11px]">
                <span className="w-2 h-2 rounded-full bg-white" /> Concluído
              </span>
              <span className="flex items-center gap-1.5 text-white bg-rose-600 px-2.5 py-1 rounded-lg border border-rose-700 shadow-xs text-[11px]">
                <span className="w-2 h-2 rounded-full bg-white" /> Cancelado / Faltou
              </span>
              <span className="flex items-center gap-1.5 text-white bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px]">
                <Lock size={12} className="text-slate-400" /> Bloqueado
              </span>
            </div>
          </div>
        </>
      )}

      {/* 🗓️ QUADRO DA GRADE DE HORÁRIOS */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col flex-1 shadow-sm relative">
        <div className="flex-1 overflow-auto custom-scrollbar relative">
          <div className="min-w-max lg:min-w-0 flex flex-col min-h-full relative">
            
            {/* Header with Barbers */}
            <div className="flex border-b border-border bg-slate-50/95 sticky top-0 z-30 backdrop-blur-sm shadow-sm">
              <div className="w-20 flex-shrink-0 border-r border-border p-4 flex flex-col items-center justify-center sticky left-0 z-40 bg-slate-50/95 backdrop-blur-sm">
                <Clock size={18} className="text-slate-500 mb-1" />
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Hora</span>
              </div>
              <div className="flex-1 flex">
                {displayedBarbers.map((barber, barberIdx) => {
                  const bUid = barber.uid || barber.id || `barber-b-${barberIdx}`;
                  const currentApp = dayApps.find(app => app.profissional_id === bUid && app.status === 'em_atendimento');
                  const totalBarberCuts = dayApps.filter(app => app.profissional_id === bUid && app.status !== 'cancelado').length;
                  const columnWidthClass = displayedBarbers.length <= 2
                    ? 'min-w-0 flex-1'
                    : 'min-w-[180px] sm:min-w-[220px] flex-1';

                  return (
                    <div key={`barber-hdr-${barber.uid || barber.id || barber.nome || barberIdx}`} className={`${columnWidthClass} border-r border-border p-3 flex items-center justify-between gap-3 bg-slate-50/95`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-accent rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-sm border border-accent/20">
                          {barber.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 leading-tight">{barber.nome}</p>
                          <p className="text-[10px] text-muted font-bold truncate max-w-[110px]">{barber.specialty || 'Barbeiro'}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end">
                        {currentApp ? (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-full text-[9px] font-black animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                            Ocupado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[9px] font-black flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Livre
                          </span>
                        )}
                        <span className="text-[9px] font-bold text-slate-400 mt-1">{totalBarberCuts} agend.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid Container */}
            <div className="flex-1 flex flex-col relative bg-white min-h-[700px]">
              
              {/* 🔴 RED LINE OF THE CURRENT MOMENT ("LINHA DO AGORA") */}
              {isNowInGridRange && (
                <div 
                  className="absolute left-0 right-0 z-40 pointer-events-none flex items-center transition-all duration-500"
                  style={{ top: `${nowLineTopPx}px` }}
                >
                  <div className="w-20 bg-rose-600 text-white text-[10px] font-black px-2 py-1 rounded-r-xl shadow-lg flex items-center justify-center gap-1.5 shrink-0 z-50 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-white" />
                    <span>{format(nowTime, 'HH:mm')}</span>
                  </div>
                  <div className="flex-1 h-[2.5px] bg-rose-500 shadow-md relative">
                    <div className="absolute right-0 -top-1 w-3 h-3 rounded-full bg-rose-600 shadow-md ring-4 ring-rose-200" />
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <Loader2 className="animate-spin text-accent" size={36} />
                  <p className="text-xs font-bold text-slate-400">Carregando quadro de horários...</p>
                </div>
              ) : (
                timeSlots.map((time, index) => (
                  <div key={time} className="flex border-b border-slate-100 group relative" style={{ zIndex: 100 - index }}>
                    <div className="w-20 flex-shrink-0 border-r border-border p-3.5 flex items-center justify-center bg-slate-50/90 sticky left-0 z-20 backdrop-blur-sm">
                      <span className="text-xs font-black text-slate-600 font-mono">{time}</span>
                    </div>
                    <div className="flex-1 flex">
                      {displayedBarbers.map((barber, bIdx) => {
                        const apps = getBarberAppointments(barber, time);
                        const block = getBarberBlock(barber, time);
                        const isBlockStart = block && (() => {
                          const bStart = parse(block.startTime, 'HH:mm', new Date());
                          const slotStart = parse(time, 'HH:mm', new Date());
                          const slotEnd = addMinutes(slotStart, 30);
                          return (isEqual(bStart, slotStart) || isAfter(bStart, slotStart)) && isBefore(bStart, slotEnd);
                        })();
                        const columnWidthClass = displayedBarbers.length <= 2
                          ? 'min-w-0 flex-1'
                          : 'min-w-[180px] sm:min-w-[220px] flex-1';

                        const barberKey = barber.uid || barber.id || '';
                        const layoutMap = barberLayoutsMap.get(barberKey);

                        return (
                          <div 
                            key={`barber-col-${barber.uid || barber.id || bIdx}-${bIdx}`} 
                            onClick={() => {
                              if (apps.length === 0 && !block) {
                                onNewAppointment(time, barber.uid || barber.id || '');
                              }
                            }}
                            className={`${columnWidthClass} p-1 h-[72px] border-r border-slate-100/80 transition-all relative ${
                              block ? 'bg-rose-50/40 cursor-not-allowed' : apps.length > 0 ? 'bg-slate-50/30 cursor-pointer' : 'hover:bg-accent/5 cursor-pointer'
                            }`}
                          >
                            {/* Block Element */}
                            {isBlockStart && (() => {
                              const blockPos = layoutMap?.get(block.id || `block-${block.startTime}`) || { colIndex: 0, totalCols: 1 };
                              const colWidth = 100 / blockPos.totalCols;
                              const leftPos = blockPos.colIndex * colWidth;

                              return (
                                <motion.div
                                  key={`block-start-${block.id || 'block'}-${barberKey}-${time}`}
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.15 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Deseja realmente remover este bloqueio: "${block.reason || 'Bloqueado'}"?`)) {
                                      agendaBlockService.deleteBlock(block.id)
                                        .then(() => {
                                          toast.success("Bloqueio removido com sucesso!");
                                        })
                                        .catch((err) => {
                                          console.error("Erro ao deletar bloqueio:", err);
                                          toast.error("Erro ao remover bloqueio.");
                                        });
                                    }
                                  }}
                                  style={{
                                    height: (() => {
                                      const bStart = parse(block.startTime, 'HH:mm', new Date());
                                      const bEnd = parse(block.endTime, 'HH:mm', new Date());
                                      if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) return '64px';
                                      const bDur = Math.max(15, (bEnd.getTime() - bStart.getTime()) / (1000 * 60));
                                      return `${(bDur / 30) * 72 - 8}px`;
                                    })(),
                                    top: (() => {
                                      const bStart = parse(block.startTime, 'HH:mm', new Date());
                                      const slotStart = parse(time, 'HH:mm', new Date());
                                      if (isNaN(bStart.getTime()) || isNaN(slotStart.getTime())) return '4px';
                                      const diffMin = (bStart.getTime() - slotStart.getTime()) / (1000 * 60);
                                      return `${4 + (diffMin / 30) * 72}px`;
                                    })(),
                                    left: blockPos.totalCols === 1 ? '4px' : `calc(${leftPos}% + 2px)`,
                                    width: blockPos.totalCols === 1 ? 'calc(100% - 8px)' : `calc(${colWidth}% - 4px)`
                                  }}
                                  className="absolute rounded-xl border border-rose-300 bg-rose-50/95 text-rose-800 p-2 sm:p-2.5 flex flex-col justify-between shadow-sm z-10 transition-all active:scale-[0.98] cursor-pointer hover:border-rose-500 group/block overflow-hidden"
                                >
                                  <div className="overflow-hidden">
                                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider mb-1 text-rose-700">
                                      <Lock size={12} className="shrink-0" />
                                      <span className="truncate">Horário Bloqueado</span>
                                    </div>
                                    <p className="text-xs font-black uppercase leading-tight truncate">{block.reason || 'Bloqueado'}</p>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] font-bold text-rose-700 mt-1">
                                    <span className="truncate">{block.startTime} - {block.endTime}</span>
                                    <span className="opacity-0 group-hover/block:opacity-100 text-[9px] uppercase tracking-widest text-rose-900 font-extrabold transition-opacity shrink-0 ml-1">
                                      [Remover]
                                    </span>
                                  </div>
                                </motion.div>
                              );
                            })()}

                            {/* Appointments Elements */}
                            {apps.map((app, appIdx) => {
                              const isStart = (() => {
                                const appStart = parse(app.startTime, 'HH:mm', new Date());
                                const slotStart = parse(time, 'HH:mm', new Date());
                                const slotEnd = addMinutes(slotStart, 30);
                                return (isEqual(appStart, slotStart) || isAfter(appStart, slotStart)) && isBefore(appStart, slotEnd);
                              })();
                              if (!isStart) return null;

                              const start = parse(app.startTime, 'HH:mm', new Date());
                              const end = parse(app.endTime, 'HH:mm', new Date());
                              
                              if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
                              
                              const durationMin = Math.max(30, (end.getTime() - start.getTime()) / (1000 * 60));

                              const clientSubs = (subscriptions || []).filter(sub => sub.cliente_id === app.cliente_id);
                              const hasActiveSub = clientSubs.some(sub => sub.status === 'active');
                              const hasExpiredSub = !hasActiveSub && clientSubs.some(sub => sub.status === 'expired' || sub.status === 'past_due' || sub.status === 'inactive');

                              const clientObj = clients.find(c => c.uid === app.cliente_id);
                              const clientPhone = app.cliente_telefone || clientObj?.telefone || clientObj?.phone || '';
                              const cleanPhone = clientPhone.replace(/\D/g, '');

                              const isDarkCard = !hasActiveSub && ['confirmado', 'agendado', 'concluído', 'cancelado', 'faltou', 'bloqueado'].includes(app.status);
                              const isYellowCard = hasActiveSub || app.status === 'em_atendimento';

                              const subscriptionBorderClass = hasActiveSub 
                                ? '!border-amber-400 !ring-2 !ring-amber-300/80 shadow-lg shadow-amber-500/20' 
                                : hasExpiredSub 
                                  ? '!border-rose-600 !ring-4 !ring-red-500/30' 
                                  : '';

                              const cardBgColorClass = hasActiveSub 
                                ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-black shadow-lg shadow-yellow-500/25 border-2 border-amber-500 hover:border-amber-600' 
                                : getStatusColor(app.status);

                              const appPos = layoutMap?.get(app.id) || { colIndex: 0, totalCols: 1 };
                              const colWidth = 100 / appPos.totalCols;
                              const leftPos = appPos.colIndex * colWidth;

                              return (
                                <motion.div
                                  key={`app-start-${app.id || 'app'}-${barberKey}-${time}-${appIdx}`}
                                  initial={{ opacity: 0, scale: 0.96 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.15 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenAppointment(app);
                                  }}
                                  style={{ 
                                    height: (() => {
                                      const appStart = parse(app.startTime, 'HH:mm', new Date());
                                      const appEnd = parse(app.endTime, 'HH:mm', new Date());
                                      if (isNaN(appStart.getTime()) || isNaN(appEnd.getTime())) return '64px';
                                      const durationMin = Math.max(15, (appEnd.getTime() - appStart.getTime()) / (1000 * 60));
                                      return `${(durationMin / 30) * 72 - 8}px`;
                                    })(),
                                    top: (() => {
                                      const appStart = parse(app.startTime, 'HH:mm', new Date());
                                      const slotStart = parse(time, 'HH:mm', new Date());
                                      if (isNaN(appStart.getTime()) || isNaN(slotStart.getTime())) return '4px';
                                      const diffMin = (appStart.getTime() - slotStart.getTime()) / (1000 * 60);
                                      return `${4 + (diffMin / 30) * 72}px`;
                                    })(),
                                    left: appPos.totalCols === 1 ? '4px' : `calc(${leftPos}% + 2px)`,
                                    width: appPos.totalCols === 1 ? 'calc(100% - 8px)' : `calc(${colWidth}% - 4px)`
                                  }}
                                  className={`absolute rounded-xl ${appPos.totalCols > 1 ? 'p-1.5 sm:p-2' : 'p-2.5'} flex flex-col justify-between shadow-md z-10 transition-all cursor-pointer overflow-hidden ${cardBgColorClass} ${subscriptionBorderClass} hover:z-20 hover:scale-[1.01]`}
                                >
                                  <div className="overflow-hidden">
                                    {/* 👑 High-Visibility VIP Subscriber Top Bar */}
                                    {hasActiveSub && (
                                      <div className="bg-slate-950/90 text-amber-300 px-1.5 py-0.5 rounded-md mb-1 flex items-center justify-between border border-amber-400/40 shadow-xs">
                                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider truncate">
                                          <Crown size={11} className="text-amber-300 fill-amber-300 shrink-0" />
                                          <span className="truncate">{customSubscriptionLabel || 'Clube VIP'}</span>
                                        </span>
                                        <Sparkles size={10} className="text-amber-300 shrink-0 animate-pulse" />
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <p className={`text-xs font-black uppercase leading-tight truncate tracking-tight ${isYellowCard ? 'text-slate-950 font-black' : 'text-white'}`}>{app.cliente_name}</p>
                                      {app.status === 'em_atendimento' && (
                                        <span className="px-1.5 py-0.5 bg-slate-950 text-amber-400 rounded font-black text-[8px] uppercase tracking-wider animate-pulse flex items-center gap-0.5 shrink-0 border border-amber-400/40">
                                          <Scissors size={10} /> {appPos.totalCols === 1 && 'NA CADEIRA'}
                                        </span>
                                      )}
                                    </div>

                                    <div className={`flex items-center justify-between text-[10px] font-bold ${isYellowCard ? 'text-slate-900' : 'text-slate-100'}`}>
                                      <span className="truncate">{app.servico_name}</span>
                                      <span className={`font-mono font-black shrink-0 ml-1 ${isYellowCard ? 'text-slate-950' : 'text-white'}`}>
                                        {getAppPrice(app) === 0 ? 'CLUBE' : `R$ ${getAppPrice(app).toFixed(0)}`}
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {app.origin === 'encaixe' && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/30 text-white text-[8px] font-black uppercase tracking-wider">
                                          Encaixe
                                        </span>
                                      )}
                                      {app.comanda_number && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/20 text-white text-[8px] font-black uppercase tracking-wider">
                                          #{app.comanda_number}
                                        </span>
                                      )}
                                      {getClientClassification(app.cliente_id, app.cliente_name).filter(b => !hasActiveSub || !b.label.includes(customSubscriptionLabel || 'Assinante')).map((badge, bIdx) => (
                                        <span 
                                          key={`badge-${badge.label}-${bIdx}`} 
                                          title={badge.label}
                                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${badge.className}`}
                                        >
                                          {badge.icon}
                                          {appPos.totalCols === 1 && <span>{badge.label}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className={`flex items-center justify-between mt-1.5 pt-1 border-t ${isYellowCard ? 'border-black/15' : 'border-white/20'} gap-1`}>
                                    <span className={`text-[10px] font-black font-mono truncate ${isYellowCard ? 'text-slate-950' : 'text-white'}`}>
                                      {app.startTime}{appPos.totalCols === 1 ? ` - ${app.endTime}` : ''}
                                    </span>
                                    
                                    <div className="flex items-center gap-1 shrink-0">
                                      {/* WhatsApp Quick Action */}
                                      {cleanPhone && (
                                        <a
                                          href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá, ${app.cliente_name}! Confirmando seu agendamento hoje às ${app.startTime} na barbearia.`)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          title="Mensagem no WhatsApp"
                                          className="p-1 bg-white/20 hover:bg-white text-white hover:text-emerald-700 rounded-lg transition-colors"
                                        >
                                          <MessageCircle size={12} />
                                        </a>
                                      )}

                                      {/* Start Service Action */}
                                      {(app.status === 'agendado' || app.status === 'confirmado') && (
                                        <button
                                          onClick={(e) => handleStartService(app, e)}
                                          title="Iniciar Atendimento (Colocar na Cadeira)"
                                          className="px-1.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg transition-all font-black text-[9px] flex items-center gap-1 shadow-xs border border-amber-300"
                                        >
                                          <Play size={10} fill="currentColor" />
                                          {appPos.totalCols === 1 && <span>Iniciar</span>}
                                        </button>
                                      )}

                                      {/* Receipt / Comanda Action */}
                                      {['agendado', 'confirmado', 'em_atendimento'].includes(app.status) && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenComanda(app);
                                          }}
                                          title="Finalizar e Abrir Comanda"
                                          className="px-1.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-all font-black text-[9px] flex items-center gap-1 shadow-xs border border-emerald-600"
                                        >
                                          <Receipt size={10} />
                                          {appPos.totalCols === 1 && <span>Caixa</span>}
                                        </button>
                                      )}

                                      {app.status === 'concluído' && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-800 text-white rounded text-[8px] font-black uppercase border border-emerald-700">
                                          <CheckCircle2 size={10} /> {appPos.totalCols === 1 && 'Pago'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
