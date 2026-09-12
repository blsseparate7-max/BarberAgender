import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Search, 
  Eye, 
  Clock, 
  Users, 
  Scissors, 
  DollarSign, 
  TrendingUp, 
  ArrowRight, 
  Filter,
  CheckCircle2,
  UserMinus,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { DailyFlowItem, UserProfile, Comanda } from '../../types';
import { extractFlowItemDate, formatFlowDisplayDate, extractComandaDate, isBarberMatch } from './FlowUtils';

interface FlowHistoryTableProps {
  flowItems: DailyFlowItem[];
  barbers: UserProfile[];
  comandas: Comanda[];
  onSelectDayForInspection: (date: string) => void;
  onOpenInOperational: (date: string) => void;
}

export function FlowHistoryTable({
  flowItems,
  barbers,
  comandas,
  onSelectDayForInspection,
  onOpenInOperational
}: FlowHistoryTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Group all daily flow items by date (YYYY-MM-DD)
  const daysSummary = useMemo(() => {
    const map: { [dateStr: string]: DailyFlowItem[] } = {};

    flowItems.forEach(item => {
      const date = extractFlowItemDate(item);
      if (!date) return; // ignore legacy items without resolvable date

      if (!map[date]) {
        map[date] = [];
      }
      map[date].push(item);
    });

    // Transform map into sorted array of daily stats
    const list = Object.entries(map).map(([date, items]) => {
      const totalCount = items.length;
      const completedCount = items.filter(i => i.status === 'completed').length;
      const servingCount = items.filter(i => i.status === 'serving').length;
      const waitingCount = items.filter(i => i.status === 'waiting').length;
      const canceledCount = items.filter(i => (i.status as any) === 'canceled' || (i.status as any) === 'desistiu').length;

      // Avg wait time calculation
      const waitTimes: number[] = [];
      items.forEach(item => {
        if (item.chegada_hora && (item.inicio_hora || item.fim_hora)) {
          const [hC, mC] = item.chegada_hora.split(':').map(Number);
          const startT = item.inicio_hora || item.fim_hora || '';
          if (startT) {
            const [hS, mS] = startT.split(':').map(Number);
            const diff = (hS * 60 + mS) - (hC * 60 + mC);
            if (diff >= 0 && diff < 360) {
              waitTimes.push(diff);
            }
          }
        }
      });
      const avgWait = waitTimes.length > 0
        ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length)
        : 0;

      // Top barber
      const barberCounts: { [bName: string]: number } = {};
      items.forEach(i => {
        if (i.profissional_name && i.status === 'completed') {
          barberCounts[i.profissional_name] = (barberCounts[i.profissional_name] || 0) + 1;
        }
      });
      const topBarberEntry = Object.entries(barberCounts).sort((a, b) => b[1] - a[1])[0];
      const topBarber = topBarberEntry ? `${topBarberEntry[0]} (${topBarberEntry[1]})` : '-';

      // Revenue from linked comandas or comandas of this date
      const linkedComandaIds = new Set(items.map(i => (i as any).comanda_id).filter(Boolean));
      const revenue = comandas.reduce((acc, c) => {
        const isFromFlow = linkedComandaIds.has(c.id) || 
          items.some(f => (c as any).daily_flow_id === f.id || (c.cliente_name || (c as any).clientName) === f.cliente_name);
        const cDate = extractComandaDate(c);
        if (isFromFlow || (cDate && cDate === date)) {
          return acc + (c.totalAmount || c.paidAmount || 0);
        }
        return acc;
      }, 0);

      return {
        date,
        totalCount,
        completedCount,
        servingCount,
        waitingCount,
        canceledCount,
        avgWait,
        topBarber,
        revenue,
        items
      };
    });

    // Sort descending by date (most recent first)
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [flowItems, comandas]);

  // Extract available months for filter
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    daysSummary.forEach(d => {
      const monthPrefix = d.date.substring(0, 7); // YYYY-MM
      months.add(monthPrefix);
    });
    return Array.from(months).sort().reverse();
  }, [daysSummary]);

  // Filtered list
  const filteredDays = useMemo(() => {
    return daysSummary.filter(d => {
      // Month filter
      if (selectedMonth !== 'all' && !d.date.startsWith(selectedMonth)) {
        return false;
      }
      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const displayDate = formatFlowDisplayDate(d.date).toLowerCase();
        const hasClient = d.items.some(i => i.cliente_name.toLowerCase().includes(term));
        const hasBarber = d.items.some(i => (i.profissional_name || '').toLowerCase().includes(term));
        return d.date.includes(term) || displayDate.includes(term) || hasClient || hasBarber;
      }
      return true;
    });
  }, [daysSummary, selectedMonth, searchTerm]);

  const formatMoney = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-6">
      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por data, cliente ou barbeiro..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-inner"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-2xl text-xs font-bold text-slate-700">
            <Filter size={14} className="text-slate-400" />
            <span>Mês:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value="all">Todos os Meses</option>
              {availableMonths.map(m => {
                const [y, monthNum] = m.split('-');
                const monthDate = new Date(Number(y), Number(monthNum) - 1, 1);
                const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                return (
                  <option key={`m-opt-${m}`} value={m}>
                    {monthName}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-slate-200/80 rounded-[2rem] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-4 px-6">Data da Fila</th>
                <th className="py-4 px-6">Atendimentos</th>
                <th className="py-4 px-6">Status dos Clientes</th>
                <th className="py-4 px-6">Tempo Médio</th>
                <th className="py-4 px-6">Barbeiro Destaque</th>
                <th className="py-4 px-6">Faturamento</th>
                <th className="py-4 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredDays.map((day, idx) => {
                const isToday = day.date === new Date().toISOString().split('T')[0];

                return (
                  <tr 
                    key={`flow-history-row-${day.date}-${idx}`}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => onSelectDayForInspection(day.date)}
                  >
                    {/* Date */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black ${
                          isToday ? 'bg-indigo-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Calendar size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-900 capitalize text-xs">
                              {formatFlowDisplayDate(day.date)}
                            </span>
                            {isToday && (
                              <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md">
                                Hoje
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 font-bold block mt-0.5">
                            {day.date}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Total Clientes */}
                    <td className="py-4 px-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-slate-900">
                          {day.totalCount}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">
                          {day.totalCount === 1 ? 'cliente' : 'clientes'}
                        </span>
                      </div>
                    </td>

                    {/* Status Breakdown Badges */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-black">
                          <CheckCircle2 size={10} /> {day.completedCount}
                        </span>
                        {day.servingCount > 0 && (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-black">
                            <Scissors size={10} /> {day.servingCount}
                          </span>
                        )}
                        {day.waitingCount > 0 && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-black">
                            <Clock size={10} /> {day.waitingCount}
                          </span>
                        )}
                        {day.canceledCount > 0 && (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-md text-[10px] font-black">
                            <UserMinus size={10} /> {day.canceledCount}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Avg Wait Time */}
                    <td className="py-4 px-6 font-mono font-bold">
                      <span className={`${
                        day.avgWait > 30 ? 'text-rose-600' : day.avgWait > 15 ? 'text-amber-600' : 'text-slate-800'
                      }`}>
                        {day.avgWait} min
                      </span>
                    </td>

                    {/* Top Barber */}
                    <td className="py-4 px-6 font-bold text-slate-800">
                      {day.topBarber}
                    </td>

                    {/* Revenue */}
                    <td className="py-4 px-6 font-black text-emerald-600">
                      {formatMoney(day.revenue)}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {/* Eye Button */}
                        <button
                          onClick={() => onSelectDayForInspection(day.date)}
                          className="p-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 rounded-xl transition-all border border-slate-200 hover:border-indigo-200 cursor-pointer shadow-xs"
                          title="Ver Raio-X da Fila deste dia"
                        >
                          <Eye size={15} />
                        </button>

                        {/* Open in Kanban */}
                        <button
                          onClick={() => onOpenInOperational(day.date)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                          title="Abrir no Painel Operacional"
                        >
                          <span>Abrir</span>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredDays.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 italic font-medium">
                    Nenhum histórico de fila diária encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
