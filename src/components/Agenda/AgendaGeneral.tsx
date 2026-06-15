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
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Appointment, AppointmentStatus, UserProfile } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { format, addDays, subDays, isSameDay, parse, isEqual, isAfter, isBefore, addMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AgendaGeneralProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  barbers: UserProfile[];
  appointments: Appointment[];
  onNewAppointment: (time?: string, profissional_id?: string) => void;
  onOpenAppointment: (app: Appointment) => void;
  onOpenComanda: (app: Appointment) => void;
  loading: boolean;
}

export function AgendaGeneral({ 
  selectedDate, 
  setSelectedDate, 
  barbers, 
  appointments, 
  onNewAppointment, 
  onOpenAppointment,
  onOpenComanda,
  loading 
}: AgendaGeneralProps) {
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

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

  const getBarberAppointments = (profissional_id: string, time: string) => {
    try {
      const slotTime = parse(time, 'HH:mm', new Date());
      if (isNaN(slotTime.getTime())) return [];
      
      return appointments.filter(app => {
        if (app.profissional_id !== profissional_id || app.date !== format(selectedDate, 'yyyy-MM-dd')) return false;
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
    <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col flex-1 shadow-sm">
      {/* Header with Barbers */}
      <div className="flex border-b border-border bg-slate-50/50 sticky top-0 z-20 backdrop-blur-sm">
        <div className="w-20 flex-shrink-0 border-r border-border p-4 flex items-center justify-center">
          <Clock size={16} className="text-muted" />
        </div>
        <div className="flex-1 overflow-x-auto flex custom-scrollbar">
          {barbers.map(barber => (
            <div key={barber.uid} className="min-w-[200px] flex-1 border-r border-border p-4 text-center">
              <p className="text-sm font-bold text-primary">{barber.nome}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">{barber.specialty || 'Barbeiro'}</p>
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
              <div className="flex-1 flex overflow-x-auto custom-scrollbar">
                {barbers.map(barber => {
                  const apps = getBarberAppointments(barber.uid, time);
                  return (
                    <div 
                      key={barber.uid} 
                      onClick={() => apps.length === 0 && onNewAppointment(time, barber.uid)}
                      className={`min-w-[200px] flex-1 p-1 min-h-[60px] border-r border-border/30 transition-colors cursor-pointer relative ${
                        apps.length > 0 ? 'bg-slate-50/20' : 'hover:bg-accent/5'
                      }`}
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
                            className={`absolute rounded-xl border p-3 flex flex-col justify-between shadow-sm z-10 ${getStatusColor(app.status)}`}
                          >
                            <div>
                              <p className="text-[11px] font-bold uppercase leading-none mb-1 truncate">{app.cliente_name}</p>
                              <p className="text-[9px] opacity-80 truncate font-medium">{app.servico_name}</p>
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
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] font-bold">{app.startTime}</span>
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
                                    <Clock size={12} />
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
                                    <Receipt size={12} />
                                  </button>
                                )}
                                {app.status === 'concluído' && <CheckCircle2 size={12} />}
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
  );
}
