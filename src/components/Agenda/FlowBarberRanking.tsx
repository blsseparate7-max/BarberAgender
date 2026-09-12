import React from 'react';
import { Trophy, Medal, Award, Flame, Scissors, Clock, DollarSign, UserCheck, Coffee, ArrowUp, ArrowDown } from 'lucide-react';
import { DailyFlowItem, UserProfile, Comanda } from '../../types';
import { extractComandaDate, isBarberMatch } from './FlowUtils';

interface FlowBarberRankingProps {
  barbers: UserProfile[];
  flowItems: DailyFlowItem[];
  comandas: Comanda[];
  selectedDate?: string;
  onMoveBarber?: (index: number, direction: 'up' | 'down') => void;
  onChangeBarberStatus?: (barberId: string, status: 'disponivel' | 'atendendo' | 'pausa') => void;
}

export function FlowBarberRanking({
  barbers,
  flowItems,
  comandas,
  selectedDate,
  onMoveBarber,
  onChangeBarberStatus
}: FlowBarberRankingProps) {
  const [viewMode, setViewMode] = React.useState<'rodizio' | 'ranking'>('rodizio');

  // Pre-filter comandas that belong strictly to the selected day or linked flow items
  const dailyComandas = React.useMemo(() => {
    const linkedComandaIds = new Set(flowItems.map(i => (i as any).comanda_id).filter(Boolean));
    const linkedFlowItemIds = new Set(flowItems.map(i => i.id));
    
    return comandas.filter(c => {
      // Must be closed, paid, or have amount
      const isPaidOrClosed = c.status === 'fechada' || (c.paidAmount && c.paidAmount > 0) || c.status === 'aberta';
      if (!isPaidOrClosed) return false;

      // If directly linked to a daily flow item of this date
      if (linkedComandaIds.has(c.id) || linkedFlowItemIds.has((c as any).daily_flow_id)) {
        return true;
      }
      // If matching selected date
      if (selectedDate) {
        const cDate = extractComandaDate(c);
        if (cDate && cDate === selectedDate) {
          return true;
        }
      }
      return false;
    });
  }, [comandas, flowItems, selectedDate]);

  // Calculate real synchronized stats for each barber today
  const barberStats = barbers.map(barber => {
    const barberId = barber.uid || barber.id || '';
    
    // Items completed by this barber in this day's flow
    const myCompletedFlowItems = flowItems.filter(item => 
      item.status === 'completed' && isBarberMatch(barber, item.profissional_id, item.profissional_name)
    );

    // Items currently being served by this barber right now
    const myServingItems = flowItems.filter(item => 
      item.status === 'serving' && isBarberMatch(barber, item.profissional_id, item.profissional_name)
    );
    const myServingCount = myServingItems.length;

    // Calculate real revenue and services count from today's comandas and flow items linked to this barber
    let totalRevenue = 0;
    let comandaServicesCount = 0;
    const flowItemIdsInComandas = new Set<string>();

    dailyComandas.forEach(comanda => {
      if ((comanda as any).daily_flow_id) {
        flowItemIdsInComandas.add((comanda as any).daily_flow_id);
      }
      if (comanda.items && Array.isArray(comanda.items) && comanda.items.length > 0) {
        comanda.items.forEach(cItem => {
          const itemMatch = isBarberMatch(
            barber, 
            (cItem as any).profissional_id || (cItem as any).barberId, 
            (cItem as any).barbeiro_nome || (cItem as any).profissional_name || (comanda as any).barbeiro_nome || (comanda as any).profissional_name
          );
          if (itemMatch) {
            const itemPrice = cItem.totalPrice || ((cItem.price || 0) * (cItem.quantity || cItem.quantidade || 1)) || cItem.price || 0;
            totalRevenue += itemPrice;
            comandaServicesCount += (cItem.quantity || cItem.quantidade || 1);
          }
        });
      } else {
        // Comanda header matching
        const headerMatch = isBarberMatch(
          barber, 
          (comanda as any).barberId || (comanda as any).profissional_id, 
          (comanda as any).barbeiro_nome || (comanda as any).profissional_name
        );
        if (headerMatch) {
          totalRevenue += comanda.totalAmount || comanda.paidAmount || 0;
          comandaServicesCount += 1;
        }
      }
    });

    // Flow items completed without a separate comanda record
    const unlinkedFlowCount = myCompletedFlowItems.filter(i => 
      !flowItemIdsInComandas.has(i.id) && !(i as any).comanda_id
    ).length;

    const completedCount = comandaServicesCount > 0 
      ? (comandaServicesCount + unlinkedFlowCount) 
      : myCompletedFlowItems.length;

    // Auto-calculate dynamic status: if currently serving a client, show 'atendendo'
    let effectiveStatus: 'disponivel' | 'atendendo' | 'pausa' = (barber as any).rodizioStatus || 'disponivel';
    if (myServingCount > 0) {
      effectiveStatus = 'atendendo';
    } else if (effectiveStatus === 'atendendo') {
      effectiveStatus = 'disponivel';
    }

    return {
      barber,
      barberId,
      completedCount,
      myServingCount,
      totalRevenue,
      status: effectiveStatus,
      rodizioIndex: (barber as any).rodizioIndex ?? 99
    };
  });

  // Sort by completed cuts and revenue for the podium ranking
  const sortedByRanking = [...barberStats].sort((a, b) => {
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
    return b.totalRevenue - a.totalRevenue;
  });

  // Choose display list based on viewMode
  const displayList = viewMode === 'ranking' ? sortedByRanking : barberStats;

  const formatMoney = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="bg-slate-900 text-white rounded-[32px] p-6 shadow-xl relative overflow-hidden border border-slate-800 space-y-6">
      <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <h3 className="text-base font-black tracking-tight">Fila & Desempenho Diário</h3>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            {selectedDate ? `Dia: ${selectedDate}` : 'Hoje'} • Produtividade em tempo real
          </p>
        </div>

        {/* Toggle Mode Buttons */}
        <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 shrink-0">
          <button
            onClick={() => setViewMode('rodizio')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === 'rodizio'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🔄 Rodízio (Vez)
          </button>
          <button
            onClick={() => setViewMode('ranking')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
              viewMode === 'ranking'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            🏆 Ranking (Cortes)
          </button>
        </div>
      </div>

      {/* Barbers List */}
      <div className="space-y-3">
        {displayList.map((stat, index) => {
          const { barber, completedCount, myServingCount, totalRevenue, status, barberId } = stat;
          
          // Find ranking position
          const rankPos = sortedByRanking.findIndex(s => s.barberId === barberId) + 1;

          // Check if first in line in queue mode
          const isNextInLine = viewMode === 'rodizio' && index === 0 && status === 'disponivel';

          return (
            <div
              key={`stat-barber-${barberId}-${index}`}
              className={`p-4 rounded-2xl border transition-all ${
                isNextInLine
                  ? 'bg-slate-800/90 border-indigo-500/50 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                  : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-2.5">
                {/* Left: Avatar + Position Badge + Name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center font-black text-xs text-slate-300 uppercase overflow-hidden">
                      {barber.fotoUrl || barber.avatarUrl ? (
                        <img src={barber.fotoUrl || barber.avatarUrl} alt={barber.nome} className="w-full h-full object-cover" />
                      ) : (
                        barber.nome.substring(0, 2)
                      )}
                    </div>

                    {/* Rank Badge */}
                    <div className={`absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black border-2 border-slate-900 ${
                      rankPos === 1 ? 'bg-amber-400 text-slate-950' : rankPos === 2 ? 'bg-slate-300 text-slate-950' : rankPos === 3 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {rankPos}º
                    </div>

                    {/* Status dot */}
                    <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                      status === 'disponivel' ? 'bg-emerald-500' : status === 'atendendo' ? 'bg-blue-500' : 'bg-amber-500'
                    }`} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-xs text-white truncate">{barber.nome}</h4>
                      {isNextInLine && (
                        <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                          1º da Fila
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-400">
                      {status === 'disponivel' ? '🟢 Disponível' : status === 'atendendo' ? `🔵 Na Cadeira (${myServingCount})` : '🟡 Em Intervalo'}
                    </span>
                  </div>
                </div>

                {/* Right: Quick Status Toggles & Move Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {onChangeBarberStatus && (
                    <>
                      <button
                        title="Marcar Disponível"
                        onClick={() => onChangeBarberStatus(barberId, 'disponivel')}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          status === 'disponivel'
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-slate-900 border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <UserCheck size={12} />
                      </button>
                      <button
                        title="Marcar Intervalo / Pausa"
                        onClick={() => onChangeBarberStatus(barberId, 'pausa')}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          status === 'pausa'
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : 'bg-slate-900 border-transparent text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        <Coffee size={12} />
                      </button>
                    </>
                  )}

                  {onMoveBarber && viewMode === 'rodizio' && (
                    <div className="flex flex-col gap-0.5 ml-1">
                      <button
                        disabled={index === 0}
                        onClick={() => onMoveBarber(index, 'up')}
                        className="p-1 hover:bg-slate-800 rounded text-slate-500 disabled:opacity-20 hover:text-white transition-colors cursor-pointer"
                        title="Subir no rodízio"
                      >
                        <ArrowUp size={10} />
                      </button>
                      <button
                        disabled={index === barbers.length - 1}
                        onClick={() => onMoveBarber(index, 'down')}
                        className="p-1 hover:bg-slate-800 rounded text-slate-500 disabled:opacity-20 hover:text-white transition-colors cursor-pointer"
                        title="Descer no rodízio"
                      >
                        <ArrowDown size={10} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Performance Stats Bar */}
              <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <Scissors size={12} className="text-indigo-400 shrink-0" />
                  <span className="text-slate-400">Cortes no dia:</span>
                  <strong className="text-white font-black">{completedCount}</strong>
                </div>
                <div className="flex items-center gap-1.5 justify-end">
                  <DollarSign size={12} className="text-emerald-400 shrink-0" />
                  <span className="text-slate-400">Total:</span>
                  <strong className="text-emerald-400 font-black">{formatMoney(totalRevenue)}</strong>
                </div>
              </div>
            </div>
          );
        })}

        {barbers.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-6 font-semibold">
            Nenhum barbeiro ativo cadastrado.
          </p>
        )}
      </div>
    </div>
  );
}
