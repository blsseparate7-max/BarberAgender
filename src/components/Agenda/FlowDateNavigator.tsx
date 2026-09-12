import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, RotateCcw } from 'lucide-react';

interface FlowDateNavigatorProps {
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (date: string) => void;
}

export function FlowDateNavigator({ selectedDate, onDateChange }: FlowDateNavigatorProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = selectedDate === todayStr;

  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const handleSetToday = () => {
    onDateChange(todayStr);
  };

  const formatDisplayDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    return dateObj.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200/80 p-2 rounded-2xl shadow-xs">
      <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
        <button
          onClick={handlePrevDay}
          className="p-2 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
          title="Dia Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={handleSetToday}
          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            isToday 
              ? 'bg-indigo-600 text-white shadow-xs' 
              : 'text-slate-600 hover:bg-white hover:text-slate-900'
          }`}
        >
          Hoje
        </button>

        <button
          onClick={handleNextDay}
          className="p-2 hover:bg-white text-slate-600 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
          title="Próximo Dia"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700">
        <Calendar size={14} className="text-indigo-600" />
        <span className="capitalize">{formatDisplayDate(selectedDate)}</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className="opacity-0 absolute w-6 h-6 cursor-pointer"
          title="Escolher data"
        />
      </div>

      {!isToday && (
        <button
          onClick={handleSetToday}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <RotateCcw size={12} />
          <span>Voltar para Hoje</span>
        </button>
      )}
    </div>
  );
}
