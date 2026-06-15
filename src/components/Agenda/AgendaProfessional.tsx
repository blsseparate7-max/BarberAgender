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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, AppointmentStatus, UserProfile } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { format, addDays, subDays, isSameDay, parse, isEqual, isAfter, isBefore, addMinutes, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaProfessionalProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  barbers: UserProfile[];
  appointments: Appointment[];
  onNewAppointment: (time?: string, profissional_id?: string) => void;
  onOpenAppointment: (app: Appointment) => void;
  onOpenComanda: (app: Appointment) => void;
  loading: boolean;
}

export function AgendaProfessional({ 
  selectedDate, 
  setSelectedDate, 
  barbers, 
  appointments, 
  onNewAppointment, 
  onOpenAppointment,
  onOpenComanda,
  loading 
}: AgendaProfessionalProps) {
  const [selectedProfissionalId, setSelectedProfissionalId] = useState<string>('');
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

  const [clientsWithPackages, setClientsWithPackages] = useState<Set<string>>(new Set());
  const [clientsWithSubscriptions, setClientsWithSubscriptions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const qPackages = query(collection(db, 'pacotes_vendas'), where('remainingCuts', '>', 0));
    const unsubPackages = onSnapshot(qPackages, (snap) => {
      const uids = new Set<string>();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.clientId) uids.add(d.clientId);
      });
      setClientsWithPackages(uids);
    });

    const qSubscriptions = query(collection(db, 'subscriptions'), where('status', '==', 'active'));
    const unsubSubscriptions = onSnapshot(qSubscriptions, (snap) => {
      const uids = new Set<string>();
      snap.forEach(doc => {
        const d = doc.data();
        if (d.cliente_id) uids.add(d.cliente_id);
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
      setSelectedProfissionalId(barbers[0].uid);
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
      const slotTime = parse(time, 'HH:mm', new Date());
      if (isNaN(slotTime.getTime())) return [];

      return appointments.filter(app => {
        if (app.profissional_id !== selectedProfissionalId || app.date !== date) return false;
        if (!app.startTime || !app.endTime) return false;
        
        const appStart = parse(app.startTime, 'HH:mm', new Date());
        const appEnd = parse(app.endTime, 'HH:mm', new Date());
        
        if (isNaN(appStart.getTime()) || isNaN(appEnd.getTime())) return false;
        
        return (isEqual(slotTime, appStart) || isAfter(slotTime, appStart)) && isBefore(slotTime, appEnd);
      });
    } catch (err) {
      console.error("Error filtering appointments:", err);
      return [];
    }
  };

  const getStatusColor = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmado': return 'bg-indigo-50 border-indigo-100 text-indigo-600';
      case 'em_atendimento': return 'bg-amber-50 border-amber-100 text-amber-600';
      case 'concluído': return 'bg-emerald-50 border-emerald-100 text-emerald-600';
      case 'cancelado': return 'bg-red-50 border-red-100 text-red-600';
      case 'faltou': return 'bg-slate-50 border-slate-100 text-slate-400';
      case 'bloqueado': return 'bg-slate-900 border-slate-800 text-white';
      default: return 'bg-slate-50 border-slate-100 text-slate-400';
    }
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Barber Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {barbers.map(barber => (
          <button
            key={barber.uid}
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
            {weekDays.map(day => (
              <div 
                key={day.toISOString()} 
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
            timeSlots.map(time => (
              <div key={time} className="flex border-b border-border/50 group">
                <div className="w-20 flex-shrink-0 border-r border-border p-4 flex items-center justify-center bg-slate-50/30">
                  <span className="text-xs font-bold text-muted">{time}</span>
                </div>
                <div className="flex-1 grid grid-cols-7">
                  {weekDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const apps = getDayAppointments(dateStr, time);
                    return (
                      <div 
                        key={day.toISOString()} 
                        onClick={() => apps.length === 0 && onNewAppointment(time, selectedProfissionalId)}
                        className={`p-1 min-h-[60px] border-r border-border/30 last:border-r-0 transition-colors cursor-pointer relative ${
                          apps.length > 0 ? 'bg-slate-50/20' : 'hover:bg-accent/5'
                        } ${isSameDay(day, new Date()) ? 'bg-accent/5' : ''}`}
                      >
                        {apps.map(app => {
                          const isStart = app.startTime === time;
                          if (!isStart) return null;

                          const start = parse(app.startTime, 'HH:mm', new Date());
                          const end = parse(app.endTime, 'HH:mm', new Date());
                          
                          if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
                          
                          const durationMin = Math.max(30, (end.getTime() - start.getTime()) / (1000 * 60));
                          const slotsCount = Math.ceil(durationMin / 30);

                          return (
                            <motion.div
                              key={app.id}
                              layoutId={app.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAppointment(app);
                              }}
                              style={{ 
                                height: `calc(${slotsCount * 100}% + ${(slotsCount - 1) * 1}px)`,
                                top: '4px',
                                left: '4px',
                                right: '4px'
                              }}
                              className={`absolute rounded-xl border p-2 flex flex-col justify-between shadow-sm z-10 ${getStatusColor(app.status)}`}
                            >
                              <div>
                                <p className="text-[10px] font-bold uppercase leading-none mb-1 truncate">{app.cliente_name}</p>
                                <p className="text-[8px] opacity-80 truncate font-medium">{app.servico_name}</p>
                                {(app.origin === 'encaixe' || app.comanda_number) && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {app.origin === 'encaixe' && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider">
                                        Encaixe
                                      </span>
                                    )}
                                    {app.comanda_number && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[8px] font-black uppercase tracking-wider">
                                        Comanda #{app.comanda_number}
                                      </span>
                                    )}
                                    {clientsWithPackages.has(app.cliente_id) && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-50 text-amber-700 text-[7px] font-black uppercase tracking-wider border border-amber-200">
                                        <Award size={8} />
                                        PACOTE
                                      </span>
                                    )}
                                    {clientsWithSubscriptions.has(app.cliente_id) && (
                                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[7px] font-black uppercase tracking-wider border border-indigo-200">
                                        <Sparkles size={8} />
                                        CLUBE
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[8px] font-bold">{app.startTime}</span>
                                <div className="flex items-center gap-1">
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
                                      className="p-1 hover:bg-black/5 rounded transition-colors"
                                    >
                                      <Clock size={10} />
                                    </button>
                                  )}
                                  {app.status === 'em_atendimento' && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenComanda(app);
                                      }}
                                      title="Finalizar Atendimento"
                                      className="p-1 hover:bg-black/5 rounded transition-colors"
                                    >
                                      <Receipt size={10} />
                                    </button>
                                  )}
                                  {app.status === 'concluído' && <CheckCircle2 size={10} />}
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
