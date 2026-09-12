import React from 'react';
import { 
  X, 
  Eye, 
  Calendar, 
  Clock, 
  Users, 
  Scissors, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle, 
  UserMinus, 
  Receipt,
  ExternalLink,
  Flame,
  Award
} from 'lucide-react';
import { DailyFlowItem, UserProfile, Comanda } from '../../types';
import { formatFlowDisplayDate } from './FlowUtils';

interface FlowDayDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  items: DailyFlowItem[];
  barbers: UserProfile[];
  comandas: Comanda[];
  onOpenInOperational?: (date: string) => void;
  onOpenComanda?: (item: DailyFlowItem) => void;
}

export function FlowDayDetailsModal({
  isOpen,
  onClose,
  date,
  items,
  barbers,
  comandas,
  onOpenInOperational,
  onOpenComanda
}: FlowDayDetailsModalProps) {
  if (!isOpen) return null;

  const totalClients = items.length;
  const completedItems = items.filter(i => i.status === 'completed');
  const servingItems = items.filter(i => i.status === 'serving');
  const waitingItems = items.filter(i => i.status === 'waiting');
  const canceledItems = items.filter(i => (i.status as any) === 'canceled' || (i.status as any) === 'desistiu');

  // Compute wait times
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

  const avgWaitTime = waitTimes.length > 0 
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) 
    : 0;

  // Calculate revenue from linked comandas
  const linkedComandaIds = new Set(items.map(i => (i as any).comanda_id).filter(Boolean));
  const totalRevenue = comandas.reduce((acc, c) => {
    const isFromFlow = linkedComandaIds.has(c.id) || 
      items.some(f => (c as any).daily_flow_id === f.id || c.clientName === f.cliente_name);
    if (isFromFlow) {
      return acc + (c.totalAmount || c.paidAmount || 0);
    }
    return acc;
  }, 0);

  // Barber breakdown for the day
  const barberPerformance: { [key: string]: { name: string; count: number; revenue: number } } = {};
  items.forEach(item => {
    if (item.profissional_name) {
      const profKey = item.profissional_id || item.profissional_name;
      if (!barberPerformance[profKey]) {
        barberPerformance[profKey] = {
          name: item.profissional_name,
          count: 0,
          revenue: 0
        };
      }
      if (item.status === 'completed') {
        barberPerformance[profKey].count += 1;
      }
    }
  });

  const sortedBarbers = Object.values(barberPerformance).sort((a, b) => b.count - a.count);

  const formatMoney = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md">
      <div className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Calendar size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 capitalize tracking-tight">
                  {formatFlowDisplayDate(date)}
                </h2>
                <span className="text-[10px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                  Auditoria da Fila
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Raio-X completo dos atendimentos, tempos de espera e desempenho dos profissionais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onOpenInOperational && (
              <button
                onClick={() => {
                  onOpenInOperational(date);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                <ExternalLink size={14} />
                <span>Abrir no Painel</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2.5 bg-white hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 border border-slate-200 transition-colors shadow-xs cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1">
          
          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Total na Fila
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900">{totalClients}</span>
                <span className="text-xs font-bold text-slate-500">clientes</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-slate-500">
                <span className="text-emerald-600">{completedItems.length} concluídos</span>
                {canceledItems.length > 0 && (
                  <span className="text-rose-600">({canceledItems.length} desistiram)</span>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Tempo Médio Espera
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-black ${avgWaitTime > 30 ? 'text-rose-600' : avgWaitTime > 15 ? 'text-amber-600' : 'text-slate-900'}`}>
                  {avgWaitTime}
                </span>
                <span className="text-xs font-bold text-slate-500">minutos</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-2">
                {avgWaitTime <= 15 ? '🟢 Fluxo ágil' : avgWaitTime <= 30 ? '🟡 Moderado' : '🔴 Espera alta'}
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                Barbeiro Destaque
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-slate-900 truncate">
                  {sortedBarbers[0]?.name || 'Nenhum'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold mt-2">
                {sortedBarbers[0] ? `${sortedBarbers[0].count} cortes finalizados` : 'Sem registros'}
              </p>
            </div>

            <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 block mb-1">
                Faturamento do Dia
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-700">
                  {formatMoney(totalRevenue)}
                </span>
              </div>
              <p className="text-[10px] text-emerald-600 font-bold mt-2">
                Comandas apuradas
              </p>
            </div>
          </div>

          {/* List of Clients in the Queue on that day */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                Detalhamento dos Atendimentos ({items.length})
              </h3>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Serviço</th>
                      <th className="py-3 px-4">Profissional</th>
                      <th className="py-3 px-4">Chegada / Início / Fim</th>
                      <th className="py-3 px-4">Tempo Espera</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Comanda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {items.map((item, idx) => {
                      const isCompleted = item.status === 'completed';
                      const isServing = item.status === 'serving';
                      const isWaiting = item.status === 'waiting';
                      const isCanceled = (item as any).status === 'desistiu' || (item as any).status === 'canceled';

                      // Wait duration
                      let waitDurationStr = '-';
                      if (item.chegada_hora && (item.inicio_hora || item.fim_hora)) {
                        const [hC, mC] = item.chegada_hora.split(':').map(Number);
                        const [hS, mS] = (item.inicio_hora || item.fim_hora || '').split(':').map(Number);
                        const diff = (hS * 60 + mS) - (hC * 60 + mC);
                        if (diff >= 0) {
                          waitDurationStr = `${diff} min`;
                        }
                      }

                      const linkedComanda = comandas.find(c => 
                        c.id === (item as any).comanda_id || 
                        (c as any).daily_flow_id === item.id
                      );

                      return (
                        <tr key={`day-detail-row-${item.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4 font-black text-slate-900">
                            {item.cliente_name}
                          </td>
                          <td className="py-3 px-4 text-slate-600 uppercase font-bold text-[11px]">
                            {item.servico_name}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {item.profissional_name || <span className="text-slate-400 italic">Sem preferência</span>}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                            <span className="text-slate-900 font-bold">{item.chegada_hora || '-'}</span>
                            {item.inicio_hora && <span className="text-blue-600"> → {item.inicio_hora}</span>}
                            {item.fim_hora && <span className="text-emerald-600"> → {item.fim_hora}</span>}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-slate-700 font-bold">
                              {waitDurationStr}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {isCompleted && (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                                <CheckCircle2 size={10} /> Concluído
                              </span>
                            )}
                            {isServing && (
                              <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                                <Scissors size={10} /> Na Cadeira
                              </span>
                            )}
                            {isWaiting && (
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                                <Clock size={10} /> Aguardando
                              </span>
                            )}
                            {isCanceled && (
                              <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider">
                                <UserMinus size={10} /> Desistiu
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {linkedComanda ? (
                              <button
                                onClick={() => onOpenComanda && onOpenComanda(item)}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer border transition-colors ${
                                  linkedComanda.status === 'fechada'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                {linkedComanda.status === 'fechada' ? 'Paga' : 'Aberta'} #{linkedComanda.number}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic font-medium">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                          Nenhum cliente registrado nesta fila diária.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
