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
  Award,
  Sparkles,
  UserPlus,
  AlertTriangle,
  HeartHandshake,
  DollarSign,
  Lock,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { getActiveTenantId } from '../../services/tenantService';
import { Appointment, AppointmentStatus, UserProfile, AgendaBlock } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { agendaBlockService } from '../../services/agendaBlockService';
import { computeOverlappingLayout, ItemPosition, LayoutItem } from '../../lib/calendarLayout';
import { toast } from 'sonner';
import { format, addDays, subDays, isSameDay, parse, isEqual, isAfter, isBefore, addMinutes, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaProfessionalProps {
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
  customSubscriptionLabel?: string;
}

export function AgendaProfessional({ 
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
  loading,
  customSubscriptionLabel = 'Clube VIP'
}: AgendaProfessionalProps) {
  const [selectedProfissionalId, setSelectedProfissionalId] = useState<string>('');
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  const [clientsWithPackages, setClientsWithPackages] = useState<Set<string>>(new Set());
  const [clientsWithSubscriptions, setClientsWithSubscriptions] = useState<Set<string>>(new Set());

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
        icon: <Crown size={10} className="text-amber-300 fill-amber-300" />,
        className: 'bg-slate-950 text-amber-300 border border-amber-400/50 font-black'
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

  useEffect(() => {
    const tid = getActiveTenantId();
    const qPackages = query(
      collection(db, 'pacotes_vendas'),
      where('tenantId', '==', tid)
    );
    const unsubPackages = onSnapshot(qPackages, (snap) => {
      const uids = new Set<string>();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.clientId && (d.remainingCuts || 0) > 0) uids.add(d.clientId);
      });
      setClientsWithPackages(uids);
    });

    const qSubscriptions = query(
      collection(db, 'subscriptions'),
      where('tenantId', '==', tid)
    );
    const unsubSubscriptions = onSnapshot(qSubscriptions, (snap) => {
      const uids = new Set<string>();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.cliente_id && d.status === 'active') uids.add(d.cliente_id);
      });
      setClientsWithSubscriptions(uids);
    });

    return () => {
      unsubPackages();
      unsubSubscriptions();
    };
  }, []);

  useEffect(() => {
    if (barbers.length > 0 && !selectedProfissionalId) {
      setSelectedProfissionalId(barbers[0].uid || barbers[0].id || '');
    }
  }, [barbers]);

  useEffect(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 0 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 0 });
    setWeekDays(eachDayOfInterval({ start, end }));

    const slots = [];
    let current = parse('08:00', 'HH:mm', new Date());
    const endTime = parse('21:00', 'HH:mm', new Date());
    while (isBefore(current, endTime) || isEqual(current, endTime)) {
      slots.push(format(current, 'HH:mm'));
      current = addMinutes(current, 30);
    }
    setTimeSlots(slots);
  }, [selectedDate]);

  const getDayAppointments = (date: string, time: string) => {
    try {
      const slotStart = parse(time, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, 30);
      if (isNaN(slotStart.getTime())) return [];

      const targetBarber = barbers.find(b => b.uid === selectedProfissionalId || b.id === selectedProfissionalId);

      return appointments.filter(app => {
        const matchProf = app.profissional_id === selectedProfissionalId || (targetBarber && (app.profissional_id === targetBarber.uid || app.profissional_id === targetBarber.id));
        if (!matchProf || app.date !== date) return false;
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

  const getDayBlock = (date: string, time: string) => {
    try {
      const slotStart = parse(time, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, 30);
      const targetBarber = barbers.find(b => b.uid === selectedProfissionalId || b.id === selectedProfissionalId);

      return (blocks || []).find(block => {
        if (block.date !== date) return false;
        const matchProf = block.profissional_id === selectedProfissionalId || (targetBarber && (block.profissional_id === targetBarber.uid || block.profissional_id === targetBarber.id));
        if (!block.isGeneral && !matchProf) return false;
        
        const bStart = parse(block.startTime, 'HH:mm', new Date());
        const bEnd = parse(block.endTime, 'HH:mm', new Date());
        if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) return false;

        return isBefore(slotStart, bEnd) && isAfter(slotEnd, bStart);
      });
    } catch (err) {
      console.error("Error filtering blocks in week view:", err);
      return undefined;
    }
  };

  // Pre-calculate non-overlapping side-by-side layout for each day in week view
  const weekDayLayoutsMap = React.useMemo(() => {
    const map = new Map<string, Map<string, ItemPosition>>();
    const targetBarber = barbers.find(b => b.uid === selectedProfissionalId || b.id === selectedProfissionalId);

    weekDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      const dayApps = appointments.filter(app => {
        const matchProf = app.profissional_id === selectedProfissionalId || (targetBarber && (app.profissional_id === targetBarber.uid || app.profissional_id === targetBarber.id));
        return matchProf && app.date === dateStr && app.status !== 'cancelado';
      });

      const dayBlocks = (blocks || []).filter(block => {
        if (block.date !== dateStr) return false;
        const matchProf = block.profissional_id === selectedProfissionalId || (targetBarber && (block.profissional_id === targetBarber.uid || block.profissional_id === targetBarber.id));
        return block.isGeneral || matchProf;
      });

      const items: LayoutItem[] = [
        ...dayApps.map(a => ({
          id: a.id,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
        ...dayBlocks.map(b => ({
          id: b.id || `block-${b.startTime}`,
          startTime: b.startTime,
          endTime: b.endTime,
        }))
      ];

      const layout = computeOverlappingLayout(items);
      map.set(dateStr, layout);
    });

    return map;
  }, [weekDays, appointments, blocks, selectedProfissionalId, barbers]);

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

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Barber Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {barbers.map((barber, bIdx) => (
          <button
            key={`agenda-prof-barber-${barber.uid || bIdx}-${bIdx}`}
            onClick={() => setSelectedProfissionalId(barber.uid)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
              selectedProfissionalId === barber.uid 
                ? 'bg-primary border-primary text-white shadow-sm' 
                : 'bg-surface border-border text-muted hover:border-slate-300 hover:text-primary'
            }`}
          >
            {barber.nome}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col flex-1 shadow-sm">
        {/* Week Header */}
        <div className="flex border-b border-border bg-slate-50/50 sticky top-0 z-20 backdrop-blur-sm">
          <div className="w-20 flex-shrink-0 border-r border-border p-4 flex items-center justify-center">
            <Clock size={16} className="text-muted" />
          </div>
          <div className="flex-1 grid grid-cols-7">
            {weekDays.map((day, idx) => (
              <div 
                key={`prof-weekday-${day.toISOString()}-${idx}`} 
                className={`p-4 text-center border-r border-border last:border-r-0 ${
                  isSameDay(day, new Date()) ? 'bg-accent/5' : ''
                }`}
              >
                <p className={`text-[10px] uppercase font-bold tracking-wider ${
                  isSameDay(day, new Date()) ? 'text-accent' : 'text-muted'
                }`}>
                  {format(day, 'EEE', { locale: ptBR })}
                </p>
                <p className={`text-lg font-bold ${
                  isSameDay(day, new Date()) ? 'text-accent' : 'text-primary'
                }`}>
                  {format(day, 'dd')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin text-accent" size={32} />
            </div>
          ) : (
            timeSlots.map((time, timeIdx) => (
              <div key={`prof-timerow-${time}-${timeIdx}`} className="flex border-b border-border/50 group relative" style={{ zIndex: 100 - timeIdx }}>
                <div className="w-20 flex-shrink-0 border-r border-border p-4 flex items-center justify-center bg-slate-50/30">
                  <span className="text-xs font-bold text-muted">{time}</span>
                </div>
                <div className="flex-1 grid grid-cols-7 relative">
                  {weekDays.map((day, dayIdx) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const apps = getDayAppointments(dateStr, time);
                    const block = getDayBlock(dateStr, time);
                    const isBlockStart = block && (() => {
                      const bStart = parse(block.startTime, 'HH:mm', new Date());
                      const slotStart = parse(time, 'HH:mm', new Date());
                      const slotEnd = addMinutes(slotStart, 30);
                      return (isEqual(bStart, slotStart) || isAfter(bStart, slotStart)) && isBefore(bStart, slotEnd);
                    })();
                    const layoutMap = weekDayLayoutsMap.get(dateStr);

                    return (
                      <div 
                        key={`prof-cell-${dateStr}-${time}-${dayIdx}`} 
                        onClick={() => {
                          if (apps.length === 0 && !block) {
                            onNewAppointment(time, selectedProfissionalId);
                          }
                        }}
                        className={`p-1 h-[60px] border-r border-border/30 last:border-r-0 transition-colors relative ${
                          block ? 'bg-rose-50/50 cursor-not-allowed' : apps.length > 0 ? 'bg-slate-50/20 cursor-pointer' : 'hover:bg-accent/5 cursor-pointer'
                        } ${isSameDay(day, new Date()) ? 'bg-accent/5' : ''}`}
                      >
                        {isBlockStart && (() => {
                          const blockPos = layoutMap?.get(block.id || `block-${block.startTime}`) || { colIndex: 0, totalCols: 1 };
                          const colWidth = 100 / blockPos.totalCols;
                          const leftPos = blockPos.colIndex * colWidth;

                          return (
                            <motion.div
                              key={`prof-block-${block.id || 'block'}-${dateStr}-${time}`}
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
                                  if (isNaN(bStart.getTime()) || isNaN(bEnd.getTime())) return '53px';
                                  const bDur = Math.max(15, (bEnd.getTime() - bStart.getTime()) / (1000 * 60));
                                  return `${(bDur / 30) * 61 - 8}px`;
                                })(),
                                top: (() => {
                                  const bStart = parse(block.startTime, 'HH:mm', new Date());
                                  const slotStart = parse(time, 'HH:mm', new Date());
                                  if (isNaN(bStart.getTime()) || isNaN(slotStart.getTime())) return '4px';
                                  const diffMin = (bStart.getTime() - slotStart.getTime()) / (1000 * 60);
                                  return `${4 + (diffMin / 30) * 61}px`;
                                })(),
                                left: blockPos.totalCols === 1 ? '4px' : `calc(${leftPos}% + 2px)`,
                                width: blockPos.totalCols === 1 ? 'calc(100% - 8px)' : `calc(${colWidth}% - 4px)`
                              }}
                              className="absolute rounded-xl border border-rose-200 bg-rose-50/95 text-rose-700 p-1.5 sm:p-2 flex flex-col justify-between shadow-sm z-10 transition-transform active:scale-[0.98] cursor-pointer hover:border-rose-400 group/block overflow-hidden"
                            >
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider mb-0.5 text-rose-600">
                                  <Lock size={10} className="shrink-0" />
                                  <span className="truncate">Bloqueado</span>
                                </div>
                                <p className="text-[10px] font-bold uppercase leading-tight truncate">{block.reason || 'Bloqueado'}</p>
                                {block.isGeneral && (
                                  <span className="inline-flex items-center px-1 py-0.5 mt-0.5 rounded bg-rose-100 text-rose-950 border border-rose-200 text-[7px] font-black uppercase tracking-wider">
                                    Geral
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[7px] font-black text-rose-600/80 mt-1">
                                <span>{block.startTime}</span>
                              </div>
                            </motion.div>
                          );
                        })()}

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
                          const slotsCount = Math.ceil(durationMin / 30);

                          const clientSubs = (subscriptions || []).filter(sub => sub.cliente_id === app.cliente_id);
                          const hasActiveSub = clientSubs.some(sub => sub.status === 'active');
                          const hasExpiredSub = !hasActiveSub && clientSubs.some(sub => sub.status === 'expired' || sub.status === 'past_due' || sub.status === 'inactive');

                          const isYellowCard = hasActiveSub || app.status === 'em_atendimento';

                          const subscriptionBorderClass = hasActiveSub 
                            ? '!border-amber-400 !ring-2 !ring-amber-300/80 shadow-md shadow-amber-500/20' 
                            : hasExpiredSub 
                              ? '!border-rose-600 !ring-4 !ring-red-500/30' 
                              : '';

                          const cardBgColorClass = hasActiveSub 
                            ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-black shadow-md shadow-yellow-500/25 border-2 border-amber-500 hover:border-amber-600' 
                            : getStatusColor(app.status);

                          const appPos = layoutMap?.get(app.id) || { colIndex: 0, totalCols: 1 };
                          const colWidth = 100 / appPos.totalCols;
                          const leftPos = appPos.colIndex * colWidth;

                          return (
                            <motion.div
                              key={`prof-app-${app.id || 'app'}-${dateStr}-${time}-${appIdx}`}
                              layoutId={app.id ? `app-layout-${app.id}` : undefined}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAppointment(app);
                              }}
                              style={{ 
                                height: (() => {
                                  const appStart = parse(app.startTime, 'HH:mm', new Date());
                                  const appEnd = parse(app.endTime, 'HH:mm', new Date());
                                  if (isNaN(appStart.getTime()) || isNaN(appEnd.getTime())) return '53px';
                                  const durationMin = Math.max(15, (appEnd.getTime() - appStart.getTime()) / (1000 * 60));
                                  return `${(durationMin / 30) * 61 - 8}px`;
                                })(),
                                top: (() => {
                                  const appStart = parse(app.startTime, 'HH:mm', new Date());
                                  const slotStart = parse(time, 'HH:mm', new Date());
                                  if (isNaN(appStart.getTime()) || isNaN(slotStart.getTime())) return '4px';
                                  const diffMin = (appStart.getTime() - slotStart.getTime()) / (1000 * 60);
                                  return `${4 + (diffMin / 30) * 61}px`;
                                })(),
                                left: appPos.totalCols === 1 ? '4px' : `calc(${leftPos}% + 2px)`,
                                width: appPos.totalCols === 1 ? 'calc(100% - 8px)' : `calc(${colWidth}% - 4px)`
                              }}
                              className={`absolute rounded-xl ${appPos.totalCols > 1 ? 'p-1 sm:p-1.5' : 'p-2'} flex flex-col justify-between shadow-sm z-10 overflow-hidden ${cardBgColorClass} ${subscriptionBorderClass} hover:z-20 hover:scale-[1.01]`}
                            >
                              <div className="overflow-hidden">
                                {hasActiveSub && (
                                  <div className="bg-slate-950/90 text-amber-300 px-1 py-0.5 rounded mb-1 flex items-center justify-between border border-amber-400/40">
                                    <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider truncate">
                                      <Crown size={9} className="text-amber-300 fill-amber-300 shrink-0" />
                                      <span className="truncate">{customSubscriptionLabel || 'Clube VIP'}</span>
                                    </span>
                                  </div>
                                )}
                                <p className={`text-[10px] font-bold uppercase leading-none mb-1 truncate ${isYellowCard ? 'text-slate-950 font-black' : 'text-white'}`}>{app.cliente_name}</p>
                                <p className={`text-[8px] truncate font-semibold ${isYellowCard ? 'text-slate-900' : 'text-slate-100'}`}>{app.servico_name}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {app.origin === 'encaixe' && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-black/30 text-white text-[8px] font-black uppercase tracking-wider">
                                      Encaixe
                                    </span>
                                  )}
                                  {app.comanda_number && (
                                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-white/20 text-white text-[8px] font-black uppercase tracking-wider">
                                      #{app.comanda_number}
                                    </span>
                                  )}
                                  {getClientClassification(app.cliente_id, app.cliente_name).filter(b => !hasActiveSub || !b.label.includes(customSubscriptionLabel || 'Assinante')).map((badge, idx) => (
                                    <span 
                                      key={`badge-${badge.label || idx}-${idx}`} 
                                      title={badge.label}
                                      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${badge.className}`}
                                    >
                                      {badge.icon}
                                      {appPos.totalCols === 1 && <span>{badge.label}</span>}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className={`flex items-center justify-between mt-1 pt-0.5 border-t ${isYellowCard ? 'border-black/15' : 'border-white/20'} gap-0.5`}>
                                <span className={`text-[8px] font-bold truncate ${isYellowCard ? 'text-slate-950' : 'text-white'}`}>{app.startTime}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {(app.status === 'agendado' || app.status === 'confirmado') && (
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await appointmentService.startService(app.id);
                                        } catch (err) {
                                          console.error(err);
                                        }
                                      }}
                                      title="Iniciar Atendimento"
                                      className="p-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded transition-colors"
                                    >
                                      <Clock size={10} />
                                    </button>
                                  )}
                                  {['agendado', 'confirmado', 'em_atendimento'].includes(app.status) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenComanda(app);
                                      }}
                                      title="Finalizar e Abrir Comanda"
                                      className="p-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
                                    >
                                      <Receipt size={10} />
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
  );
}
