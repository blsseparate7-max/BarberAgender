import React from 'react';
import { Trophy, Medal, Award, Flame, Scissors, Clock, DollarSign, UserCheck, Coffee, ArrowUp, ArrowDown } from 'lucide-react';
import { DailyFlowItem, UserProfile, Comanda } from '../../types';

interface FlowBarberRankingProps {
  barbers: UserProfile[];
  flowItems: DailyFlowItem[];
  comandas: Comanda[];
  onMoveBarber?: (index: number, direction: 'up' | 'down') => void;
  onChangeBarberStatus?: (barberId: string, status: 'disponivel' | 'atendendo' | 'pausa') => void;
}

export function FlowBarberRanking({
  barbers,
  flowItems,
  comandas,
  onMoveBarber,
  onChangeBarberStatus
}: FlowBarberRankingProps) {
  // Calculate stats for each barber today
  const barberStats = barbers.map(barber => {
    const barberId = barber.uid || barber.id || '';
    
    // Items served by this barber today
    const myFlowItems = flowItems.filter(item => 
      item.profissional_id === barberId && item.status === 'completed'
    );
    const completedCount = myFlowItems.length;

    const myServingCount = flowItems.filter(item => 
      item.profissional_id === barberId && item.status === 'serving'
    ).length;

    // Calculate revenue from comandas linked to this barber
    let totalRevenue = 0;
    comandas.forEach(comanda => {
      if (comanda.items && Array.isArray(comanda.items)) {
        comanda.items.forEach(item => {
          if (item.profissional_id === barberId) {
            totalRevenue += item.totalPrice || item.price || 0;
          }
        });
      } else if (comanda.barberId === barberId) {
        totalRevenue += comanda.totalAmount || comanda.paidAmount || 0;
      }
    });

    return {
      barber,
      barberId,
      completedCount,
      myServingCount,
      totalRevenue,
      status: (barber as any).rodizioStatus || 'disponivel',
      rodizioIndex: (barber as any).rodizioIndex ?? 99
    };
  });

  // Sort by completed cuts for the podium ranking
  const sortedByRanking = [...barberStats].sort((a, b) => {
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
    return b.totalRevenue - a.totalRevenue;
  });

  const formatMoney = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="bg-slate-900 text-white rounded-[32px] p-6 shadow-xl relative overflow-hidden border border-slate-800 space-y-6">
      <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header with Trophy */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            <h3 className="text-base font-black tracking-tight">Ranking & Rodízio do Dia</h3>
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
            Produtividade e Fila de Atendimento
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-black text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-xl border border-amber-400/20">
          <Flame size={12} />
          <span>Ao Vivo</span>
        </div>
      </div>

      {/* Ranking List */}
      <div className="space-y-3">
        {barberStats.map((stat, index) => {
          const { barber, completedCount, myServingCount, totalRevenue, status, barberId } = stat;
          
          // Find ranking position
          const rankPos = sortedByRanking.findIndex(s => s.barberId === barberId) + 1;

          // Status labels and badge styling
          const isNextInLine = index === 0 && status === 'disponivel';

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
                {/* Left: Avatar + Position Medal + Name */}
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

                  {onMoveBarber && (
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
                  <span className="text-slate-400">Hoje:</span>
                  <strong className="text-white font-black">{completedCount} cortes</strong>
                </div>
                <div className="flex items-center gap-1.5 justify-end">
                  <DollarSign size={12} className="text-emerald-400 shrink-0" />
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
