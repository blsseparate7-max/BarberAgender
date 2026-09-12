import React from 'react';
import { Users, Clock, Scissors, DollarSign, ArrowUpRight, TrendingUp } from 'lucide-react';
import { DailyFlowItem, UserProfile, Comanda } from '../../types';

interface FlowMetricsCardsProps {
  flowItems: DailyFlowItem[];
  barbers: UserProfile[];
  comandas: Comanda[];
  selectedDate: string;
}

export function FlowMetricsCards({ flowItems, barbers, comandas, selectedDate }: FlowMetricsCardsProps) {
  const waitingCount = flowItems.filter(i => i.status === 'waiting').length;
  const servingCount = flowItems.filter(i => i.status === 'serving').length;
  const completedCount = flowItems.filter(i => i.status === 'completed').length;
  const canceledCount = flowItems.filter(i => (i.status as any) === 'canceled' || (i.status as any) === 'desistiu').length;
  const totalClients = flowItems.length;

  // Chair occupancy rate
  const activeBarbers = barbers.filter(b => (b as any).ativo !== false);
  const occupiedChairs = servingCount;
  const occupancyRate = activeBarbers.length > 0 
    ? Math.min(100, Math.round((occupiedChairs / activeBarbers.length) * 100)) 
    : 0;

  // Average wait time calculation (in minutes)
  const waitTimes: number[] = [];
  flowItems.forEach(item => {
    if (item.chegada_hora && (item.inicio_hora || item.status === 'serving' || item.status === 'completed')) {
      const [hC, mC] = item.chegada_hora.split(':').map(Number);
      const startTime = item.inicio_hora || (item.fim_hora ?? '');
      if (startTime) {
        const [hS, mS] = startTime.split(':').map(Number);
        const diffMin = (hS * 60 + mS) - (hC * 60 + mC);
        if (diffMin >= 0 && diffMin < 300) {
          waitTimes.push(diffMin);
        }
      }
    }
  });

  const avgWaitTime = waitTimes.length > 0 
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) 
    : 0;

  // Revenue from daily flow comandas
  const linkedComandaIds = new Set(
    flowItems.map(i => (i as any).comanda_id).filter(Boolean)
  );
  
  const revenueTotal = comandas.reduce((acc, c) => {
    const isFromFlow = linkedComandaIds.has(c.id) || 
      flowItems.some(f => (c as any).daily_flow_id === f.id || c.clientName === f.cliente_name);
    if (isFromFlow) {
      return acc + (c.totalAmount || c.paidAmount || 0);
    }
    return acc;
  }, 0);

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Clientes no Fluxo */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total no Fluxo</span>
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users size={16} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{totalClients}</span>
            <span className="text-xs font-bold text-slate-500">atendimentos</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-bold">
            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">{waitingCount} aguardando</span>
            <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">{servingCount} na cadeira</span>
            <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">{completedCount} prontos</span>
          </div>
        </div>
      </div>

      {/* 2. Tempo Médio de Espera */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Espera Média Recepção</span>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            avgWaitTime > 30 ? 'bg-rose-50 text-rose-600' : avgWaitTime > 15 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
          }`}>
            <Clock size={16} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${
              avgWaitTime > 30 ? 'text-rose-600' : avgWaitTime > 15 ? 'text-amber-600' : 'text-slate-900'
            }`}>
              {avgWaitTime}
            </span>
            <span className="text-xs font-bold text-slate-500">minutos</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-1">
            {avgWaitTime <= 15 ? '🟢 Fluxo rápido e fluido' : avgWaitTime <= 30 ? '🟡 Atenção: fila moderada' : '🔴 Fila crítica: agilizar chamadas'}
          </p>
        </div>
      </div>

      {/* 3. Taxa de Ocupação das Cadeiras */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ocupação das Cadeiras</span>
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Scissors size={16} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 tracking-tight">{occupancyRate}%</span>
            <span className="text-xs font-bold text-slate-500">({occupiedChairs}/{activeBarbers.length} ativas)</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2.5 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                occupancyRate > 75 ? 'bg-emerald-500' : occupancyRate > 40 ? 'bg-blue-500' : 'bg-amber-500'
              }`}
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. Faturamento do Fluxo */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Faturamento do Dia (Fluxo)</span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign size={16} />
          </div>
        </div>
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600 tracking-tight">
              {formatCurrency(revenueTotal)}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">
            Comandas geradas no dia
          </p>
        </div>
      </div>
    </div>
  );
}
