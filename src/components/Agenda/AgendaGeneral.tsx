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
  Lock
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
  blocks = [],
  onNewAppointment, 
  onOpenAppointment,
  onOpenComanda,
  loading 
}: AgendaGeneralProps) {
  const [timeSlots, setTimeSlots] = useState<string[]>([]);

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

  const getBarberBlock = (profissional_id: string, time: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      return (blocks || []).find(block => {
        if (block.date !== dateStr) return false;
        if (!block.isGeneral && block.profissional_id !== profissional_id) return false;
        
        return time >= block.startTime && time < block.endTime;
      });
    } catch (err) {
      console.error("Error filtering blocks:", err);
      return undefined;
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
                  const block = getBarberBlock(barber.uid, time);
                  const isBlockStart = block && block.startTime === time;

                  return (
                    <div 
                      key={barber.uid} 
                      onClick={() => {
                        if (apps.length === 0 && !block) {
                          onNewAppointment(time, barber.uid);
                        }
                      }}
                      className={`min-w-[200px] flex-1 p-1 min-h-[60px] border-r border-border/30 transition-colors cursor-pointer relative ${
                        apps.length > 0 || block ? 'bg-slate-50/20' : 'hover:bg-accent/5'
                      }`}
                    >
                      {isBlockStart && (
                        <motion.div
                          key={block.id}
                          layoutId={block.id}
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
                              if (!isNaN(bStart.getTime()) && !isNaN(bEnd.getTime())) {
                                const bDur = Math.max(30, (bEnd.getTime() - bStart.getTime()) / (1000 * 60));
                                const bSlots = Math.ceil(bDur / 30);
                                return `calc(${bSlots * 100}% + ${(bSlots - 1) * 8}px)`;
                              }
                              return '100%';
                            })(),
                            top: '4px',
                            left: '4px',
                            right: '4px'
                          }}
                          className="absolute rounded-xl border border-rose-200 bg-rose-50/95 text-rose-700 p-3 flex flex-col justify-between shadow-sm z-10 transition-transform active:scale-[0.98] cursor-pointer hover:border-rose-400 group/block"
                        >
                          <div>
                            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider mb-1 text-rose-600">
                              <Lock size={12} />
                              <span>Bloqueado</span>
                            </div>
                            <p className="text-[11px] font-black uppercase leading-tight truncate">{block.reason || 'Bloqueado'}</p>
                            {block.isGeneral && (
                              <span className="inline-flex items-center px-1.5 py-0.5 mt-1 rounded bg-rose-100 text-rose-900 border border-rose-200 text-[8px] font-black uppercase tracking-wider">
                                Bloqueio Geral
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between text-[8px] font-black text-rose-600/80">
                            <span>{block.startTime} - {block.endTime}</span>
                            <span className="opacity-0 group-hover/block:opacity-100 text-[8px] uppercase tracking-widest text-rose-800 font-bold transition-opacity">
                              [Clique para remover]
                            </span>
                          </div>
                        </motion.div>
                      )}

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
                                {getClientClassification(app.cliente_id, app.cliente_name).map((badge, idx) => (
                                  <span 
                                    key={idx} 
                                    title={badge.label}
                                    className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${badge.className}`}
                                  >
                                    {badge.icon}
                                    <span>{badge.label}</span>
                                  </span>
                                ))}
                              </div>
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
