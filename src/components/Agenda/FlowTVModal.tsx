import React, { useState, useEffect } from 'react';
import { Maximize2, Minimize2, X, Scissors, Clock, Users, Sparkles, CheckCircle2 } from 'lucide-react';
import { DailyFlowItem, UserProfile } from '../../types';

interface FlowTVModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowItems: DailyFlowItem[];
  barbers: UserProfile[];
}

export function FlowTVModal({ isOpen, onClose, flowItems, barbers }: FlowTVModalProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isOpen) return null;

  const waitingList = flowItems.filter(i => i.status === 'waiting');
  const servingList = flowItems.filter(i => i.status === 'serving');

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950 text-white flex flex-col overflow-hidden p-6 sm:p-10 select-none">
      {/* Background glow styling */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* TV Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-6 mb-8 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Scissors size={24} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              Painel de Atendimento
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                Ao Vivo
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-bold uppercase tracking-wider mt-0.5">
              Acompanhe sua vez na fila da barbearia
            </p>
          </div>
        </div>

        {/* Live Clock & Close */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-3xl sm:text-4xl font-mono font-black text-indigo-400 tracking-wider">
              {currentTime.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-xs font-bold text-slate-400 capitalize">
              {currentTime.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-2xl border border-slate-800 transition-colors cursor-pointer"
            title="Sair do Modo TV"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main TV Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 overflow-hidden relative z-10">
        
        {/* Left: Em Atendimento (Cadeiras Ativas) - 7 cols */}
        <div className="lg:col-span-7 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-lg font-black text-white uppercase tracking-wider">
                Nas Cadeiras (Em Atendimento)
              </h2>
            </div>
            <span className="text-xs font-mono font-black text-slate-400 bg-slate-800 px-3 py-1 rounded-lg">
              {servingList.length} Atendimentos
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto flex-1 pr-1">
            {servingList.map((item, idx) => (
              <div
                key={`tv-serving-${item.id || idx}-${idx}`}
                className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 flex flex-col justify-between shadow-lg shadow-indigo-500/5 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    Cadeira #{idx + 1}
                  </span>
                  <h3 className="text-xl font-black text-white truncate mt-1">
                    {item.cliente_name}
                  </h3>
                  <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-wide">
                    {item.servico_name}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 text-xs font-black flex items-center justify-center">
                      {item.profissional_name?.charAt(0) || 'B'}
                    </div>
                    <span className="text-xs font-bold text-slate-300">
                      {item.profissional_name}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                    <Clock size={12} /> {item.inicio_hora}
                  </span>
                </div>
              </div>
            ))}

            {servingList.length === 0 && (
              <div className="col-span-2 flex flex-col items-center justify-center py-20 text-slate-500">
                <Scissors size={48} className="mb-3 opacity-30 animate-pulse" />
                <p className="text-base font-bold">Cadeiras disponíveis no momento.</p>
                <p className="text-xs text-slate-600 mt-1">Aguardando chamada do próximo cliente.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Próximos da Fila (Aguardando) - 5 cols */}
        <div className="lg:col-span-5 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-amber-400" />
              <h2 className="text-lg font-black text-white uppercase tracking-wider">
                Fila de Espera
              </h2>
            </div>
            <span className="text-xs font-mono font-black text-amber-400 bg-amber-400/10 px-3 py-1 rounded-lg border border-amber-400/20">
              {waitingList.length} Aguardando
            </span>
          </div>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {waitingList.map((item, idx) => (
              <div
                key={`tv-waiting-${item.id || idx}-${idx}`}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                  idx === 0 
                    ? 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20' 
                    : 'bg-slate-900/80 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                    idx === 0 ? 'bg-amber-400 text-slate-950 font-black shadow-md' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {idx + 1}º
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-base font-black text-white truncate">
                      {item.cliente_name}
                    </h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      {item.servico_name}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-slate-400 font-bold block">
                    {item.chegada_hora}
                  </span>
                  {idx === 0 && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">
                      Próximo
                    </span>
                  )}
                </div>
              </div>
            ))}

            {waitingList.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Users size={48} className="mb-3 opacity-30" />
                <p className="text-base font-bold">Nenhum cliente aguardando na recepção.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
