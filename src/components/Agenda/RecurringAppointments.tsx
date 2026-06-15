import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Repeat, 
  Calendar, 
  User, 
  Scissors, 
  Trash2, 
  Edit3, 
  Loader2,
  AlertCircle,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RecurringAppointment, UserProfile, Service } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { userService } from '../../services/userService';
import { serviceService } from '../../services/serviceService';
import { format } from 'date-fns';

export function RecurringAppointments() {
  const [recurring, setRecurring] = useState<RecurringAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    setLoading(true);
    try {
      const data = await appointmentService.getRecurringAppointments();
      setRecurring(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Agendamentos Recorrentes</h2>
          <p className="text-sm text-zinc-500">Gerencie horários fixos e automáticos para seus clientes.</p>
        </div>
        <button
          className="px-6 py-2.5 bg-emerald-500 text-zinc-950 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Nova Recorrência</span>
        </button>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800 p-12 rounded-3xl text-center">
        <div className="w-20 h-20 bg-zinc-800/50 rounded-full flex items-center justify-center mx-auto mb-6">
          <Repeat size={40} className="text-zinc-600" />
        </div>
        <h3 className="text-lg font-bold text-white mb-2">Módulo de Recorrência</h3>
        <p className="text-zinc-500 max-w-md mx-auto text-sm mb-8">
          Esta funcionalidade permite criar agendamentos que se repetem semanalmente ou mensalmente de forma automática.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          <div className="p-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl text-left">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 mb-4">
              <Calendar size={20} />
            </div>
            <h4 className="text-sm font-bold text-white mb-2">Automatização</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">Os horários são reservados automaticamente no sistema conforme o padrão escolhido.</p>
          </div>
          <div className="p-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl text-left">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 mb-4">
              <User size={20} />
            </div>
            <h4 className="text-sm font-bold text-white mb-2">Fidelização</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">Garanta o horário preferido do seu cliente fiel sem precisar agendar toda semana.</p>
          </div>
          <div className="p-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl text-left">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500 mb-4">
              <Clock size={20} />
            </div>
            <h4 className="text-sm font-bold text-white mb-2">Gestão de Conflitos</h4>
            <p className="text-xs text-zinc-500 leading-relaxed">O sistema alerta se houver conflito com feriados ou bloqueios pontuais.</p>
          </div>
        </div>

        <div className="mt-12 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl inline-flex items-center gap-3 text-amber-500 text-xs font-bold uppercase tracking-widest">
          <AlertCircle size={16} />
          Funcionalidade em fase final de desenvolvimento
        </div>
      </div>
    </div>
  );
}
