import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  User,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AgendaBlock, UserProfile } from '../../types';
import { agendaBlockService } from '../../services/agendaBlockService';
import { userService } from '../../services/userService';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ConfirmationModal } from '../ConfirmationModal';

interface AgendaBlocksProps {
  selectedDate?: Date;
}

export function AgendaBlocks({ selectedDate }: AgendaBlocksProps = {}) {
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    profissional_id: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '12:00',
    endTime: '13:00',
    reason: 'Almoço',
    isGeneral: false
  });

  useEffect(() => {
    if (selectedDate) {
      setFormData(prev => ({
        ...prev,
        date: format(selectedDate, 'yyyy-MM-dd')
      }));
    }
  }, [selectedDate]);

  useEffect(() => {
    loadInitialData();
    
    const unsubscribe = agendaBlockService.subscribeToBlocks({}, (data) => {
      setBlocks(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadInitialData = async () => {
    try {
      const bData = await userService.getAllBarbers();
      setBarbers(bData);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao carregar profissionais.");
    }
  };

  const handleCreate = async () => {
    if (!formData.profissional_id && !formData.isGeneral) {
      toast.error('Selecione um profissional ou marque como bloqueio geral.');
      return;
    }
    setSaving(true);
    try {
      const barber = barbers.find(b => b.uid === formData.profissional_id);
      await agendaBlockService.createBlock({
        ...formData,
        profissional_id: formData.isGeneral ? 'general' : formData.profissional_id,
        profissional_name: formData.isGeneral ? 'Geral' : (barber?.nome || 'Desconhecido')
      });
      setShowModal(false);
      toast.success("Bloqueio criado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar bloqueio.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await agendaBlockService.deleteBlock(id);
      toast.success("Bloqueio removido.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao remover bloqueio.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-primary">Bloqueios de Agenda</h2>
          <p className="text-sm text-muted">Gerencie horários indisponíveis para atendimento.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center gap-2"
        >
          <Plus size={18} />
          <span>Novo Bloqueio</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Data</th>
              <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Horário</th>
              <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Profissional</th>
              <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Motivo</th>
              <th className="px-6 py-4 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center">
                  <Loader2 className="animate-spin text-accent mx-auto" size={32} />
                </td>
              </tr>
            ) : blocks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-20 text-center text-muted italic">
                  Nenhum bloqueio registrado.
                </td>
              </tr>
            ) : (
              blocks.map(block => (
                <tr key={block.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-primary">{block.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{block.startTime} - {block.endTime}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      block.isGeneral ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {block.profissional_name}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">{block.reason}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => setConfirmDelete(block.id)}
                      className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-primary">Novo Bloqueio</h3>
                <button onClick={() => setShowModal(false)} className="p-2 text-muted hover:text-primary transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <input 
                    type="checkbox" 
                    id="isGeneral"
                    checked={formData.isGeneral}
                    onChange={(e) => setFormData({...formData, isGeneral: e.target.checked, profissional_id: e.target.checked ? '' : formData.profissional_id})}
                    className="w-4 h-4 rounded border-slate-200 bg-white text-primary focus:ring-accent/20"
                  />
                  <label htmlFor="isGeneral" className="text-sm font-bold text-primary cursor-pointer">Bloqueio Geral (Todos os Profissionais)</label>
                </div>

                {!formData.isGeneral && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Profissional</label>
                    <select 
                      value={formData.profissional_id}
                      onChange={(e) => setFormData({...formData, profissional_id: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm text-primary focus:outline-none focus:border-accent/50 transition-all font-medium"
                    >
                      <option value="">Selecione um profissional</option>
                      {barbers.map(b => <option key={b.uid} value={b.uid}>{b.nome}</option>)}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Data</label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm text-primary focus:outline-none focus:border-accent/50 transition-all font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Início</label>
                    <input 
                      type="time" 
                      value={formData.startTime}
                      onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm text-primary focus:outline-none focus:border-accent/50 transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Fim</label>
                    <input 
                      type="time" 
                      value={formData.endTime}
                      onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm text-primary focus:outline-none focus:border-accent/50 transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Motivo / Descrição</label>
                  <input 
                    type="text" 
                    value={formData.reason}
                    onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    placeholder="Ex: Almoço, Reunião, Manutenção..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm text-primary focus:outline-none focus:border-accent/50 transition-all font-medium"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-2 mt-4 active:scale-95"
                >
                  {saving ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                  <span>Criar Bloqueio</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        title="Remover Bloqueio"
        description="Deseja realmente remover este bloqueio de agenda?"
        variant="danger"
        confirmLabel="Remover"
      />
    </div>
  );
}
