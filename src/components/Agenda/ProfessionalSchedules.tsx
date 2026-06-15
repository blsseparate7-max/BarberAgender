import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar as CalendarIcon,
  Plus,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProfessionalSchedule, WorkingHours, UserProfile } from '../../types';
import { professionalScheduleService } from '../../services/professionalScheduleService';
import { userService } from '../../services/userService';
import { toast } from 'sonner';

export function ProfessionalSchedules() {
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [schedule, setSchedule] = useState<ProfessionalSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBarbers();
  }, []);

  useEffect(() => {
    if (selectedBarberId) {
      loadSchedule(selectedBarberId);
    }
  }, [selectedBarberId]);

  const loadBarbers = async () => {
    const data = await userService.getAllBarbers();
    setBarbers(data);
    if (data.length > 0) setSelectedBarberId(data[0].uid);
  };

  const loadSchedule = async (id: string) => {
    setLoading(true);
    try {
      let data = await professionalScheduleService.getSchedule(id);
      if (!data) {
        // Seed default if none exists
        await professionalScheduleService.seedDefaultSchedule(id);
        data = await professionalScheduleService.getSchedule(id);
      }
      setSchedule(data);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar horários.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!schedule || !selectedBarberId) return;
    setSaving(true);
    try {
      await professionalScheduleService.saveSchedule(selectedBarberId, schedule);
      toast.success('Horários salvos com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar horários.');
    } finally {
      setSaving(false);
    }
  };

  const updateWorkingHour = (dayOfWeek: number, updates: Partial<WorkingHours>) => {
    if (!schedule) return;
    const updatedHours = schedule.workingHours.map(wh => 
      wh.dayOfWeek === dayOfWeek ? { ...wh, ...updates } : wh
    );
    setSchedule({ ...schedule, workingHours: updatedHours });
  };

  const daysOfWeek = [
    { id: 0, name: 'Domingo' },
    { id: 1, name: 'Segunda-feira' },
    { id: 2, name: 'Terça-feira' },
    { id: 3, name: 'Quarta-feira' },
    { id: 4, name: 'Quinta-feira' },
    { id: 5, name: 'Sexta-feira' },
    { id: 6, name: 'Sábado' },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Barber List */}
      <div className="w-full lg:w-64 space-y-2">
        <h3 className="text-[10px] font-black text-muted uppercase tracking-widest mb-4 ml-2">Equipe</h3>
        {barbers.map(barber => (
          <button
            key={barber.uid}
            onClick={() => setSelectedBarberId(barber.uid)}
            className={`w-full p-4 rounded-2xl flex items-center gap-3 transition-all active:scale-95 border ${
              selectedBarberId === barber.uid 
                ? 'bg-primary border-primary text-white font-bold shadow-lg shadow-primary/10' 
                : 'bg-white border-slate-100 text-muted hover:border-slate-200'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              selectedBarberId === barber.uid ? 'bg-white/20' : 'bg-slate-50'
            }`}>
              <User size={20} />
            </div>
            <div className="text-left overflow-hidden">
              <p className="text-sm font-bold truncate">{barber.nome}</p>
              <p className={`text-[10px] uppercase font-black tracking-widest ${selectedBarberId === barber.uid ? 'text-white/60' : 'text-slate-400'}`}>
                {barber.specialty || 'Barbeiro'}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Schedule Editor */}
      <div className="flex-1 space-y-6">
        <div className="bg-white border border-slate-200 rounded-[2.5rem] p-6 lg:p-10 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
            <div>
              <h2 className="text-2xl font-black text-primary tracking-tight">Horários de Trabalho</h2>
              <p className="text-sm text-muted font-medium mt-1">Configure os dias e horários que este profissional atende.</p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !schedule}
              className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center gap-3 active:scale-95 disabled:opacity-50 uppercase tracking-widest"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              <span>Salvar Alterações</span>
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="animate-spin text-accent" size={48} />
              <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Carregando horários...</p>
            </div>
          ) : schedule ? (
            <div className="space-y-4">
              {daysOfWeek.map(day => {
                const wh = schedule.workingHours.find(h => h.dayOfWeek === day.id) || {
                  dayOfWeek: day.id,
                  isOpen: false,
                  startTime: '09:00',
                  endTime: '19:00'
                };

                return (
                  <div key={day.id} className={`p-6 rounded-[1.5rem] border transition-all ${
                    wh.isOpen ? 'bg-slate-50/50 border-slate-200' : 'bg-slate-50/20 border-slate-100 opacity-60'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                      <div className="flex items-center gap-6 min-w-[180px]">
                        <button
                          type="button"
                          onClick={() => updateWorkingHour(day.id, { isOpen: !wh.isOpen })}
                          className={`w-12 h-6 rounded-full relative transition-all shadow-inner ${wh.isOpen ? 'bg-accent' : 'bg-slate-200'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${wh.isOpen ? 'right-1' : 'left-1'}`} />
                        </button>
                        <span className={`font-black uppercase tracking-widest text-xs ${wh.isOpen ? 'text-primary' : 'text-slate-400'}`}>{day.name}</span>
                      </div>

                      {wh.isOpen && (
                        <div className="flex flex-wrap items-center gap-6 sm:ml-auto">
                          <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                            <Clock size={14} className="text-slate-400" />
                            <input 
                              type="time" 
                              value={wh.startTime}
                              onChange={(e) => updateWorkingHour(day.id, { startTime: e.target.value })}
                              className="bg-transparent text-xs font-bold text-primary focus:outline-none"
                            />
                            <span className="text-[10px] font-black text-slate-300 uppercase">às</span>
                            <input 
                              type="time" 
                              value={wh.endTime}
                              onChange={(e) => updateWorkingHour(day.id, { endTime: e.target.value })}
                              className="bg-transparent text-xs font-bold text-primary focus:outline-none"
                            />
                          </div>

                          <div className="h-8 w-px bg-slate-200 hidden sm:block" />

                          <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                            <span className="text-[9px] font-black text-muted uppercase tracking-wider ml-1">Pausa:</span>
                            <input 
                              type="time" 
                              value={wh.lunchStart || ''}
                              onChange={(e) => updateWorkingHour(day.id, { lunchStart: e.target.value })}
                              className="bg-transparent text-xs font-bold text-primary focus:outline-none"
                            />
                            <span className="text-slate-300">-</span>
                            <input 
                              type="time" 
                              value={wh.lunchEnd || ''}
                              onChange={(e) => updateWorkingHour(day.id, { lunchEnd: e.target.value })}
                              className="bg-transparent text-xs font-bold text-primary focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {!wh.isOpen && (
                        <div className="sm:ml-auto flex items-center bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-inner">
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Folga / Fechado</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-24 text-slate-300 italic font-medium">
              Selecione um profissional para ver os horários.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
