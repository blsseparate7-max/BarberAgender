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
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Appointment, AppointmentStatus, UserProfile, AgendaBlock } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { agendaBlockService } from '../../services/agendaBlockService';
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
  loading: boolean;
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
  loading 
}: AgendaGeneralProps) {
  const [timeSlots, setTimeSlots] = useState<string[]>([]);
  const [nowTime, setNowTime] = useState<Date>(new Date());
  const displayedBarbers = barbers;

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
        label: 'Assinante',
        icon: <Sparkles size={10} fill="currentColor" className="text-indigo-600 animate-pulse" />,
        className: 'bg-indigo-600/10 text-indigo-700 border border-indigo-600/25 shadow-sm'
      });
    } else if (hasExpiredSub) {
      badges.push({
        label: 'Assinatura Vencida',
        icon: <AlertCircle size={10} />,
        className: 'bg-red-500 text-white border border-red-600 font-extrabold animate-pulse'
      });
    }

    return badges;
  };

  useEffect(() => {
    const slots = [];
    let current = parse('08:00', 'HH:mm', new Date());
    const end = parse('21:00', 'HH:mm', new Date());
    while (isBefore(current, end) || isEqual(current, end)) {
      slots.push(format(current, 'HH:mm'));
      current = addMinutes(current, 30);
    }
    setTimeSlots(slots);
  }, []);

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

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmado':
      case 'agendado': 
        return 'bg-blue-50/95 border-2 border-blue-400 text-slate-900 shadow-sm hover:border-blue-600';
      case 'em_atendimento': 
        return 'bg-amber-100/95 border-2 border-amber-500 text-amber-950 shadow-md ring-2 ring-amber-400/40 hover:border-amber-600';
      case 'concluído': 
        return 'bg-emerald-50/95 border-2 border-emerald-500 text-slate-900 shadow-sm hover:border-emerald-600';
      case 'cancelado': 
        return 'bg-rose-50/90 border-2 border-rose-300 text-rose-800 opacity-75';
      case 'faltou': 
        return 'bg-slate-100 border-2 border-slate-300 text-slate-500 line-through opacity-75';
      case 'bloqueado': 
        return 'bg-slate-900 border-2 border-slate-800 text-white';
      default: 
        return 'bg-slate-50 border-2 border-slate-200 text-slate-700';
    }
  };

  // --- STATS FOR THE FLASH TOP BAR ---
  const selectedDayStr = format(selectedDate, 'yyyy-MM-dd');
  const dayApps = appointments.filter(a => a.date === selectedDayStr);
  const concluidosCount = dayApps.filter(a => a.status === 'concluído').length;
  const emAtendimentoCount = dayApps.filter(a => a.status === 'em_atendimento').length;
  const agendadosCount = dayApps.filter(a => a.status === 'agendado' || a.status === 'confirmado').length;
  const faltouCount = dayApps.filter(a => a.status === 'faltou' || a.status === 'cancelado').length;

  const valorConcluido = dayApps.filter(a => a.status === 'concluído').reduce((acc, a) => acc + (a.price || (a as any).preco || (a as any).valor || 0), 0);
  const valorPrevisto = dayApps.filter(a => a.status !== 'cancelado' && a.status !== 'faltou').reduce((acc, a) => acc + (a.price || (a as any).preco || (a as any).valor || 0), 0);

  // Barber occupancy check for current moment
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
      {/* 📊 TOP FLASH METRICS BAR (Resumo Inteligente para o Dono) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Resumo de Cortes */}
        <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total do Dia</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <CalendarIcon size={16} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-slate-900 tracking-tight">{dayApps.length} <span className="text-xs font-bold text-slate-400">agendamentos</span></p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[9px] font-black border border-emerald-200">
                {concluidosCount} Concluídos
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[9px] font-black border border-amber-200 animate-pulse">
                {emAtendimentoCount} Na Cadeira
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[9px] font-black border border-blue-200">
                {agendadosCount} A Agendar
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Barbeiros em Ação */}
        <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Cadeiras Ocupadas</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Scissors size={16} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-black text-slate-900 tracking-tight">
              {barbersOccupiedNow.length} <span className="text-xs font-bold text-slate-400">/ {barbers.length} em atendimento</span>
            </p>
            <p className="text-[11px] font-bold text-slate-500 mt-2 flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${barbers.length - barbersOccupiedNow.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{Math.max(0, barbers.length - barbersOccupiedNow.length)} barbeiros livres agora</span>
            </p>
          </div>
        </div>

        {/* Card 3: Financeiro do Dia */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider">Faturamento Previsto</span>
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

        {/* Card 4: Alertas e Oportunidades */}
        <div className="bg-white border border-slate-200/90 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Atenção & Alertas</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              <Zap size={16} />
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-bold">Clientes c/ Fiado:</span>
              <span className={`font-black ${clientsWithDebtCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{clientsWithDebtCount} hoje</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 font-bold">Primeira vez:</span>
              <span className="font-black text-emerald-600">{newClientsCount} novos</span>
            </div>
          </div>
        </div>
      </div>

      {/* 🏷️ BARRA DE LEGENDA DISCRETA DE STATUS */}
      <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Filter size={12} /> Status dos Horários:
        </span>
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1.5 text-blue-800 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Confirmado
          </span>
          <span className="flex items-center gap-1.5 text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-400 font-black ring-2 ring-amber-300/40">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping" /> Na Cadeira (Agol)
          </span>
          <span className="flex items-center gap-1.5 text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Concluído
          </span>
          <span className="flex items-center gap-1.5 text-rose-800 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Faltou / Cancelado
          </span>
          <span className="flex items-center gap-1.5 text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300">
            <Lock size={12} className="text-slate-600" /> Bloqueado / Intervalo
          </span>
        </div>
      </div>

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
                {displayedBarbers.map(barber => {
                  const bUid = barber.uid || barber.id;
                  const currentApp = dayApps.find(app => app.profissional_id === bUid && app.status === 'em_atendimento');
                  const totalBarberCuts = dayApps.filter(app => app.profissional_id === bUid && app.status !== 'cancelado').length;
                  const columnWidthClass = displayedBarbers.length <= 2
                    ? 'min-w-0 flex-1'
                    : 'min-w-[180px] sm:min-w-[220px] flex-1';

                  return (
                    <div key={barber.uid} className={`${columnWidthClass} border-r border-border p-3 flex items-center justify-between gap-3 bg-slate-50/95`}>
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
                            {isBlockStart && (
                              <motion.div
                                key={`block-start-${block.id || 'block'}-${time}`}
                                layoutId={block.id ? `block-layout-${block.id}` : undefined}
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
                                  left: '4px',
                                  right: '4px'
                                }}
                                className="absolute rounded-xl border border-rose-300 bg-rose-50/95 text-rose-800 p-2.5 flex flex-col justify-between shadow-sm z-10 transition-all active:scale-[0.98] cursor-pointer hover:border-rose-500 group/block"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider mb-1 text-rose-700">
                                    <Lock size={12} />
                                    <span>Horário Bloqueado</span>
                                  </div>
                                  <p className="text-xs font-black uppercase leading-tight truncate">{block.reason || 'Bloqueado'}</p>
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-bold text-rose-700">
                                  <span>{block.startTime} - {block.endTime}</span>
                                  <span className="opacity-0 group-hover/block:opacity-100 text-[9px] uppercase tracking-widest text-rose-900 font-extrabold transition-opacity">
                                    [Remover]
                                  </span>
                                </div>
                              </motion.div>
                            )}

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

                              const subscriptionBorderClass = hasActiveSub 
                                ? '!border-indigo-600 !ring-2 !ring-indigo-500/30' 
                                : hasExpiredSub 
                                  ? '!border-rose-600 !ring-4 !ring-red-500/30' 
                                  : '';

                              return (
                                <motion.div
                                  key={`app-start-${app.id || 'app'}-${time}-${appIdx}`}
                                  layoutId={app.id ? `app-layout-${app.id}` : undefined}
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
                                    left: '4px',
                                    right: '4px'
                                  }}
                                  className={`absolute rounded-xl p-2.5 flex flex-col justify-between shadow-md z-10 transition-all cursor-pointer ${getStatusColor(app.status)} ${subscriptionBorderClass}`}
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                      <p className="text-xs font-black uppercase leading-tight truncate tracking-tight">{app.cliente_name}</p>
                                      {app.status === 'em_atendimento' && (
                                        <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded font-black text-[8px] uppercase tracking-wider animate-pulse flex items-center gap-0.5 shrink-0">
                                          <Scissors size={10} /> NA CADEIRA
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-700">
                                      <span className="truncate">{app.servico_name}</span>
                                      <span className="font-mono font-black shrink-0 text-slate-900 ml-1">R$ {(app.price || (app as any).preco || 0).toFixed(0)}</span>
                                    </div>

                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {app.origin === 'encaixe' && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 text-[8px] font-black uppercase tracking-wider">
                                          Encaixe
                                        </span>
                                      )}
                                      {app.comanda_number && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[8px] font-black uppercase tracking-wider">
                                          #{app.comanda_number}
                                        </span>
                                      )}
                                      {getClientClassification(app.cliente_id, app.cliente_name).map((badge, bIdx) => (
                                        <span 
                                          key={`badge-${badge.label}-${bIdx}`} 
                                          title={badge.label}
                                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${badge.className}`}
                                        >
                                          {badge.icon}
                                          <span>{badge.label}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-black/5">
                                    <span className="text-[10px] font-black font-mono text-slate-800">{app.startTime} - {app.endTime}</span>
                                    
                                    <div className="flex items-center gap-1">
                                      {/* WhatsApp Quick Action */}
                                      {cleanPhone && (
                                        <a
                                          href={`https://wa.me/55${cleanPhone}?text=${encodeURIComponent(`Olá, ${app.cliente_name}! Confirmando seu agendamento hoje às ${app.startTime} na barbearia.`)}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          title="Mensagem no WhatsApp"
                                          className="p-1 bg-emerald-100 hover:bg-emerald-600 text-emerald-800 hover:text-white rounded-lg transition-colors border border-emerald-300"
                                        >
                                          <MessageCircle size={12} />
                                        </a>
                                      )}

                                      {/* Start Service Action */}
                                      {(app.status === 'agendado' || app.status === 'confirmado') && (
                                        <button
                                          onClick={(e) => handleStartService(app, e)}
                                          title="Iniciar Atendimento (Colocar na Cadeira)"
                                          className="px-1.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all font-black text-[9px] flex items-center gap-1 shadow-xs"
                                        >
                                          <Play size={10} fill="currentColor" />
                                          <span>Iniciar</span>
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
                                          className="px-1.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all font-black text-[9px] flex items-center gap-1 shadow-xs"
                                        >
                                          <Receipt size={10} />
                                          <span>Caixa</span>
                                        </button>
                                      )}

                                      {app.status === 'concluído' && (
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-600 text-white rounded text-[8px] font-black uppercase">
                                          <CheckCircle2 size={10} /> Pago
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
