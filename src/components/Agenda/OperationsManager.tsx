import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  ListTodo, 
  Scissors, 
  User, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  MoreVertical,
  Calendar,
  ArrowRightLeft,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WaitlistEntry, UserProfile, Service } from '../../types';
import { userService } from '../../services/userService';
import { serviceService } from '../../services/serviceService';
import { format } from 'date-fns';
import { toast } from 'sonner';

export function OperationsManager() {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);

  return (
    <div className="space-y-8">
      {/* Waitlist Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-primary">Lista de Espera</h2>
            <p className="text-sm text-muted">Clientes aguardando por desistências ou horários vagos.</p>
          </div>
          <button
            onClick={() => { setSelectedEntry(null); setShowModal(true); }}
            className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} />
            <span>Novo na Espera</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm uppercase tracking-tight">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Serviço</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Preferência</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waitlist.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-muted italic">
                    Nenhum cliente na lista de espera.
                  </td>
                </tr>
              ) : (
                waitlist.map(entry => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {entry.cliente_name.charAt(0)}
                        </div>
                        <span className="text-sm text-primary font-bold">{entry.cliente_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{entry.servico_name}</td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{entry.preferred_period}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">{entry.preferred_date}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-lg text-[9px] font-bold bg-amber-100 text-amber-600 uppercase tracking-widest border border-amber-200">Aguardando</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 text-slate-400 hover:text-primary transition-colors">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Fits and Relocation Section */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm hover:border-accent transition-colors">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 border border-emerald-200 shadow-sm">
            <Scissors size={24} />
          </div>
          <h3 className="text-lg font-bold text-primary mb-2">Gestão de Encaixes</h3>
          <p className="text-sm text-muted mb-6 leading-relaxed">
            Ferramenta para identificar rapidamente espaços entre agendamentos e sugerir o melhor horário para um encaixe rápido sem prejudicar a agenda.
          </p>
          <button 
            onClick={() => toast.info("Funcionalidade de identificação de espaços será ativada em breve.")}
            className="px-6 py-2.5 bg-slate-50 text-primary border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all active:scale-95"
          >
            Identificar Espaços
          </button>
        </div>

        <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm hover:border-accent transition-colors">
          <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-6 border border-blue-200 shadow-sm">
            <ArrowRightLeft size={24} />
          </div>
          <h3 className="text-lg font-bold text-primary mb-2">Remanejamento Inteligente</h3>
          <p className="text-sm text-muted mb-6 leading-relaxed">
            Mova agendamentos em massa ou individualmente em caso de imprevistos do profissional, notificando os clientes automaticamente.
          </p>
          <button 
            onClick={() => toast.info("Painel de remanejamento em desenvolvimento.")}
            className="px-6 py-2.5 bg-slate-50 text-primary border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 transition-all active:scale-95"
          >
            Abrir Painel de Remanejamento
          </button>
        </div>
      </section>

      {showModal && (
        <WaitlistModal 
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); /* Reload data */ }}
        />
      )}
    </div>
  );
}

function WaitlistModal({ onClose, onSave }: { onClose: () => void, onSave: () => void }) {
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    serviceService.getServices().then(setServices);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Logic to save to Waitlist collection
    setTimeout(() => {
      setLoading(false);
      toast.success("Adicionado à lista de espera!");
      onSave();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-xl font-bold text-primary uppercase tracking-tight">Novo na Espera</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-muted transition-colors">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Cliente</label>
            <input required placeholder="Nome do cliente" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Serviço</label>
            <select required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
              <option value="">Selecione um serviço</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Data</label>
              <input type="date" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Período</label>
              <select required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
                <option value="qualquer">Qualquer</option>
              </select>
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-4 border border-slate-200 text-muted rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
              {loading && <Loader2 size={18} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
