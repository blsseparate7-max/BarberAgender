import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  User, 
  Scissors, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  MoreVertical,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Award,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, AppointmentStatus, UserProfile } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { format, subDays, addDays, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AppointmentListProps {
  currentUser: UserProfile;
  onOpenAppointment: (app: Appointment) => void;
}

export function AppointmentList({ currentUser, onOpenAppointment }: AppointmentListProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(addDays(new Date(), 7), 'yyyy-MM-dd')
  });

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
    loadAppointments();
  }, [dateRange.start, dateRange.end, statusFilter]);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getAppointments({
        startDate: dateRange.start,
        endDate: dateRange.end,
        status: statusFilter === 'all' ? undefined : statusFilter as AppointmentStatus
      });
      setAppointments(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAppointments = appointments.filter(app => 
    app.cliente_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.profissional_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.serviceName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmado': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 uppercase tracking-wider">Confirmado</span>;
      case 'concluído': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 uppercase tracking-wider">Concluído</span>;
      case 'cancelado': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-600 uppercase tracking-wider">Cancelado</span>;
      case 'faltou': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 uppercase tracking-wider">Faltou</span>;
      case 'em_atendimento': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 uppercase tracking-wider">Em Atendimento</span>;
      case 'bloqueado': return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-900 text-white uppercase tracking-wider">Bloqueado</span>;
      default: return <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 uppercase tracking-wider">Agendado</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-surface border border-border p-4 rounded-2xl flex flex-col xl:flex-row gap-4 items-center justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="relative flex-1 xl:flex-none xl:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
            <input 
              type="text"
              placeholder="Buscar agendamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary"
            />
          </div>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-100 rounded-xl py-2 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary appearance-none min-w-[150px] font-medium"
          >
            <option value="all">Todos Status</option>
            <option value="agendado">Agendado</option>
            <option value="confirmado">Confirmado</option>
            <option value="em_atendimento">Em Atendimento</option>
            <option value="concluído">Concluído</option>
            <option value="cancelado">Cancelado</option>
            <option value="faltou">Faltou</option>
            <option value="bloqueado">Bloqueado</option>
          </select>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <Calendar size={14} className="text-muted" />
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="bg-transparent text-xs text-primary focus:outline-none font-medium"
            />
            <span className="text-border">|</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="bg-transparent text-xs text-primary focus:outline-none font-medium"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 bg-surface border border-border text-muted rounded-xl hover:text-primary hover:bg-slate-50 transition-all shadow-sm">
            <FileText size={18} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Data/Hora</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Profissional</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Serviço</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <Loader2 className="animate-spin text-accent mx-auto" size={32} />
                  </td>
                </tr>
              ) : filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-muted italic text-sm">
                    Nenhum agendamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredAppointments.map(app => (
                  <tr 
                    key={app.id} 
                    onClick={() => onOpenAppointment(app)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-primary font-semibold">{format(parse(app.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}</span>
                        <span className="text-[10px] text-muted font-bold uppercase tracking-wider">{app.startTime} - {app.endTime}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                          {app.cliente_name.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-primary font-semibold group-hover:text-accent transition-colors flex items-center gap-1.5">
                            {app.cliente_name}
                            {clientsWithPackages.has(app.cliente_id) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-wider border border-amber-200" title="Possui pacote ativo">
                                <Award size={10} />
                              </span>
                            )}
                            {clientsWithSubscriptions.has(app.cliente_id) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wider border border-indigo-200" title="Assinante do Clube">
                                <Sparkles size={10} />
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted font-medium">{app.profissional_name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted font-medium">{app.serviceName}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-accent font-bold">R$ {app.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(app.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-300 hover:text-primary transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
