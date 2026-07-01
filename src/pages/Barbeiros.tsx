import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Plus, 
  Star, 
  Calendar, 
  DollarSign, 
  MoreVertical, 
  Search, 
  Filter, 
  Loader2, 
  X, 
  Save, 
  Trash2, 
  Percent, 
  Phone, 
  Mail, 
  Shield,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Award,
  Activity,
  Check,
  Settings,
  AlertCircle,
  ThumbsUp,
  UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { userService } from '../services/userService';
import { UserProfile, WorkingHours } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { Edit2 } from 'lucide-react';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { collection, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

// Default weekdays list for schedule configuring
const DAYS_OF_WEEK = [
  { id: 1, name: 'Segunda-feira' },
  { id: 2, name: 'Terça-feira' },
  { id: 3, name: 'Quarta-feira' },
  { id: 4, name: 'Quinta-feira' },
  { id: 5, name: 'Sexta-feira' },
  { id: 6, name: 'Sábado' },
  { id: 0, name: 'Domingo' },
];

const DEFAULT_WORKING_HOURS: WorkingHours[] = [
  { dayOfWeek: 1, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  { dayOfWeek: 2, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  { dayOfWeek: 3, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  { dayOfWeek: 4, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  { dayOfWeek: 5, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
  { dayOfWeek: 6, isOpen: true, startTime: '09:00', endTime: '15:00', lunchStart: '', lunchEnd: '' },
  { dayOfWeek: 0, isOpen: false, startTime: '09:00', endTime: '18:00', lunchStart: '', lunchEnd: '' },
];

const AVATAR_COLORS = [
  { id: 'indigo', name: 'Indigo Sleek', bg: 'bg-indigo-50 text-indigo-600 border-indigo-100', text: 'text-indigo-600', ring: 'ring-indigo-400', hex: '#4f46e5' },
  { id: 'emerald', name: 'Emerald Soft', bg: 'bg-emerald-50 text-emerald-600 border-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-400', hex: '#10b981' },
  { id: 'amber', name: 'Amber Gold', bg: 'bg-amber-50 text-amber-600 border-amber-100', text: 'text-amber-600', ring: 'ring-amber-400', hex: '#f59e0b' },
  { id: 'rose', name: 'Rose Crisp', bg: 'bg-rose-50 text-rose-600 border-rose-100', text: 'text-rose-600', ring: 'ring-rose-400', hex: '#ef4444' },
  { id: 'violet', name: 'Amethyst Purple', bg: 'bg-violet-50 text-violet-600 border-violet-100', text: 'text-violet-600', ring: 'ring-violet-400', hex: '#8b5cf6' },
  { id: 'blue', name: 'Blue Sky', bg: 'bg-blue-50 text-blue-600 border-blue-100', text: 'text-blue-600', ring: 'ring-blue-400', hex: '#3b82f6' },
];

const SPECIALTY_PRESETS = [
  'Degradê',
  'Barba & Navalha',
  'Tratamentos Capilares',
  'Visagismo',
  'Pigmentação',
  'Corte Clássico',
  'Progressiva/Selagem',
  'Luzes & Platinados',
  'Corte Infantil'
];

export function Barbeiros() {
  const { isAdmin, isGerente } = useAuth();
  const [barbeiros, setBarbeiros] = useState<UserProfile[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<UserProfile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Live Subscription for Professionals
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'usuarios'),
      where('tipo', 'in', ['barbeiro', 'gerente'])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      // Pure client-side sort to prevent needing complex composite indices on Firestore
      const sorted = docs.sort((a, b) => a.nome.localeCompare(b.nome));
      setBarbeiros(sorted);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao assinar carregamento de barbeiros:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Live Subscription for Commissions to generate live analytics cards
  useEffect(() => {
    const qCom = query(collection(db, 'comissoes'));
    const unsubscribeCom = onSnapshot(qCom, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCommissions(docs);
    }, (error) => {
      console.error("Erro ao carregar banco de comissões:", error);
    });

    return () => unsubscribeCom();
  }, []);

  const handleToggleAtivo = async (uid: string, currentAtivo: boolean) => {
    if (!isAdmin && !isGerente) return;
    try {
      await userService.updateUserProfile(uid, { ativo: !currentAtivo });
      toast.success(`Profissional marcado como ${!currentAtivo ? 'Ativo' : 'Inativo'} com sucesso!`);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao atualizar status do profissional.');
    }
  };

  const { execute: handleSave, isLoading: isSaving } = useAsyncAction(async (data: Partial<UserProfile>) => {
    try {
      if (editingBarber) {
        await userService.updateUserProfile(editingBarber.uid, {
          ...data,
          tipo: data.is_gestor ? 'gerente' : 'barbeiro'
        });
        toast.success(`Perfil de ${data.nome} atualizado em tempo real!`);
      } else {
        await userService.createUser({
          ...data,
          ativo: true,
          tipo: data.is_gestor ? 'gerente' : 'barbeiro'
        });
        toast.success(`Profissional ${data.nome} criado com sucesso!`);
      }
      setIsModalOpen(false);
      setEditingBarber(null);
    } catch (error) {
      console.error("Erro ao salvar barbeiro:", error);
      toast.error("Ocorreu um erro ao salvar as configurações.");
    }
  });

  const { execute: handleDelete, isLoading: isDeleting } = useAsyncAction(async (uid: string) => {
    try {
      await userService.deleteUser(uid);
      toast.success("O profissional foi marcado como inativo.");
    } catch (error) {
      console.error("Erro ao desativar barbeiro:", error);
      toast.error("Erro ao processar inativação.");
    }
  });

  const filteredBarbeiros = barbeiros.filter(b => {
    const matchesSearch = b.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (b.especialidade && b.especialidade.toLowerCase().includes(searchTerm.toLowerCase()));
    
    if (filterActive === 'active') return matchesSearch && b.ativo;
    if (filterActive === 'inactive') return matchesSearch && !b.ativo;
    return matchesSearch;
  });

  return (
    <div className="space-y-8 pb-16 text-primary">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary mb-1">Equipe de Profissionais</h1>
          <p className="text-muted text-sm font-medium">
            Gerencie os barbeiros parceiros, taxas de comissão, metas de faturamento e escalas de trabalho em tempo real.
          </p>
        </div>
        {(isAdmin || isGerente) && (
          <button 
            onClick={() => {
              setEditingBarber(null);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 transition shadow-md shadow-emerald-600/10 active:scale-95 shrink-0 self-start sm:self-center"
          >
            <Plus size={16} />
            <span>Adicionar Profissional</span>
          </button>
        )}
      </header>

      {/* Control filters bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por nome, email ou especialidade..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium text-primary shadow-sm transition"
          />
        </div>

        <div className="flex bg-slate-100 border p-1 rounded-2xl shadow-inner w-full md:w-auto shrink-0 justify-around">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition ${
              filterActive === 'all' ? 'bg-white text-primary shadow-sm' : 'text-slate-550 hover:text-primary'
            }`}
          >
            Todos ({barbeiros.length})
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition ${
              filterActive === 'active' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-550 hover:text-emerald-500'
            }`}
          >
            Ativos ({barbeiros.filter(b => b.ativo).length})
          </button>
          <button
            onClick={() => setFilterActive('inactive')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition ${
              filterActive === 'inactive' ? 'bg-white text-slate-600 shadow-sm' : 'text-slate-550 hover:text-slate-500'
            }`}
          >
            Inativos ({barbeiros.filter(b => !b.ativo).length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white border rounded-[2rem] shadow-sm">
          <Loader2 className="animate-spin text-indigo-600" size={48} />
          <p className="text-muted animate-pulse font-black tracking-widest uppercase text-xs">Sincronizando equipe...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredBarbeiros.map((barber, index) => (
            <BarberCard 
              key={`barber-${barber.uid || index}-${index}`} 
              barber={barber} 
              commissions={commissions}
              onEdit={() => {
                setEditingBarber(barber);
                setIsModalOpen(true);
              }}
              onToggleAtivo={handleToggleAtivo}
              onDelete={() => setConfirmDeleteId(barber.uid)}
              canEdit={isAdmin || isGerente}
            />
          ))}
          {filteredBarbeiros.length === 0 && (
            <div className="col-span-full text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] shadow-sm flex flex-col items-center justify-center">
              <UserX className="text-slate-300 mb-4" size={56} />
              <h4 className="font-extrabold text-slate-700 text-lg">Sem resultados encontrados</h4>
              <p className="text-slate-400 text-sm max-w-sm mt-1.5 font-bold leading-relaxed">
                Tente ajustar os critérios de busca ou crie um novo profissional clicando no botão acima.
              </p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <BarberModal 
            barber={editingBarber}
            onClose={() => setIsModalOpen(false)}
            onSave={handleSave}
            isLoading={isSaving}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Inativar Profissional"
        description="Tem certeza que deseja inativar este profissional? Ele continuará no banco de dados histórico mas não estará mais disponível para novos agendamentos ou escalas de comissões."
        variant="danger"
        confirmLabel="Confirmar Inativação"
      />
    </div>
  );
}

// BARBER CARD WITH EXPANDABLE WORKING HOURS AND REALTIME PERFORMANCE GRAPHICS
interface BarberCardProps {
  key?: string;
  barber: UserProfile;
  commissions: any[];
  onEdit: () => void;
  onToggleAtivo: (uid: string, currentAtivo: boolean) => void | Promise<void>;
  onDelete: () => void;
  canEdit: boolean;
}

function BarberCard({ barber, commissions, onEdit, onToggleAtivo, onDelete, canEdit }: BarberCardProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const comissao = barber.percentual_comissao ?? barber.commission_percentage ?? 50;
  const especialidadesString = barber.especialidade ?? barber.specialty ?? '';
  const specialties = especialidadesString ? especialidadesString.split(',').map(s => s.trim()).filter(Boolean) : [];
  const meta = barber.meta_mensal ?? barber.monthly_goal ?? 0;
  const gestor = barber.is_gestor ?? barber.is_manager ?? false;
  const telefone = barber.telefone || barber.phone;

  // Real-time metrics from actual month commissions
  const currentMonthYear = new Date().toISOString().substring(0, 7); // "YYYY-MM"
  const barberCommissions = commissions.filter(c => c.profissional_id === barber.uid && c.date && c.date.startsWith(currentMonthYear));
  
  const totalFaturamento = barberCommissions.reduce((acc, curr) => acc + (curr.base_value || 0), 0);
  const totalComissaoGanho = barberCommissions.reduce((acc, curr) => acc + (curr.commission_value || 0), 0);
  const totalAtendimentos = barberCommissions.length;

  const goalPercentage = meta > 0 ? Math.min(Math.round((totalFaturamento / meta) * 100), 100) : 0;

  // Extract work schedule array
  const activeHours = barber.horario_de_trabalho ?? DEFAULT_WORKING_HOURS;

  // Match random persistent color based on UUID, or fallback
  const getAvatarColor = () => {
    const colors = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'blue'];
    const charCodeSum = barber.nome.split('').reduce((acc, curr) => acc + curr.charCodeAt(0), 0);
    const index = charCodeSum % colors.length;
    return AVATAR_COLORS.find(c => c.id === colors[index]) || AVATAR_COLORS[0];
  };

  const style = getAvatarColor();

  return (
    <motion.div 
      layout
      className="bg-white border border-slate-200 rounded-[2.5rem] p-6 hover:border-slate-300 transition-all duration-300 group relative overflow-visible shadow-sm flex flex-col"
    >
      {/* Absolute Options Menu */}
      <div className="absolute top-5 right-5 z-20">
        {canEdit && (
          <div className="relative">
            <button 
              onClick={() => setShowOptions(!showOptions)} 
              className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 border border-transparent rounded-xl transition flex items-center justify-center"
            >
              <MoreVertical size={18} />
            </button>
            
            <AnimatePresence>
              {showOptions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden"
                  >
                    <button 
                      onClick={() => {
                        onEdit();
                        setShowOptions(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition text-left"
                    >
                      <Edit2 size={14} className="text-slate-400" />
                      <span>Editar Perfil</span>
                    </button>
                    <button 
                      onClick={() => {
                        onToggleAtivo(barber.uid, barber.ativo);
                        setShowOptions(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-slate-500 hover:bg-slate-50 hover:text-emerald-600 transition text-left border-y border-slate-100"
                    >
                      <Activity size={14} className="text-slate-400" />
                      <span>{barber.ativo ? 'Inativar Entrada' : 'Ativar Entrada'}</span>
                    </button>
                    <button 
                      onClick={() => {
                        onDelete();
                        setShowOptions(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-red-600 hover:bg-red-50 transition text-left"
                    >
                      <Trash2 size={14} className="text-red-400" />
                      <span>Excluir Cadastro</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Main card row header */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border shadow-inner transition grow-0 shrink-0 ${style.bg}`}>
          {barber.nome.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-lg text-primary tracking-tight truncate leading-tight">{barber.nome}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Shield size={12} className={gestor ? "text-amber-505" : "text-emerald-500"} />
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-extrabold text-slate-500">
              {gestor ? 'Sócio / Supervisor' : 'Profissional Barber'}
            </p>
          </div>
        </div>
      </div>

      {/* Real-time statistics board */}
      <div className="bg-slate-50/70 border border-slate-100 p-4 rounded-3xl mb-5 space-y-3.5">
        <div className="grid grid-cols-2 gap-3.5 text-center divide-x divide-slate-200/60">
          <div>
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Serviços ({currentMonthYear})</p>
            <p className="text-base font-black text-primary mt-0.5">{totalAtendimentos}</p>
          </div>
          <div>
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider">A Pagar / Comissões</p>
            <p className="text-base font-extrabold text-emerald-600 mt-0.5">R$ {totalComissaoGanho.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {meta > 0 && (
          <div className="space-y-1.5 pt-2.5 border-t border-slate-200/40">
            <div className="flex justify-between items-center text-[9px] font-black text-slate-500 uppercase tracking-wide">
              <span>Alcancado da Meta (R$ {meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})</span>
              <span className={goalPercentage >= 100 ? "text-emerald-600" : "text-indigo-600"}>{goalPercentage}%</span>
            </div>
            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden flex shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${goalPercentage}%` }}
                className={`h-full rounded-full ${
                  goalPercentage >= 100 ? 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-md shadow-emerald-500/20' :
                  goalPercentage >= 50 ? 'bg-gradient-to-r from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20' :
                  'bg-gradient-to-r from-amber-500 to-rose-500'
                }`}
              />
            </div>
            {goalPercentage >= 100 && (
              <div className="flex items-center gap-1.5 text-[8px] text-emerald-600 font-extrabold uppercase tracking-widest mt-1">
                <Sparkles size={10} className="animate-spin" />
                <span>Parabéns! Meta Mensal Superada!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Basic information parameters */}
      <div className="space-y-3 mb-6 flex-1">
        {specialties.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {specialties.map(spec => (
              <span key={spec} className="px-2.5 py-1 bg-slate-100 text-[9px] font-black text-slate-600 uppercase tracking-widest rounded-lg border border-slate-200/30">
                {spec}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400 italic font-semibold">
            <Star size={13} />
            <span>Sem especialidades sinalizadas</span>
          </div>
        )}

        <div className="space-y-2 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-3">
            <Mail size={13} className="text-slate-400" />
            <span className="truncate text-slate-500">{barber.email}</span>
          </div>

          {telefone && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Phone size={13} className="text-slate-400" />
                <span className="text-slate-500">{telefone}</span>
              </div>
              <a 
                href={`https://wa.me/55${telefone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="text-[9px] uppercase font-black text-emerald-600 hover:underline hover:text-emerald-700 block shrink-0"
              >
                Chamar WhatsApp
              </a>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Percent size={13} className="text-slate-400" />
            <span>Comissão Base Configurada: <span className="text-indigo-650 font-black">{comissao}%</span></span>
          </div>

          {barber.startDate && (
            <div className="flex items-center gap-3">
              <Calendar size={13} className="text-slate-400" />
              <span>Contrato: <span className="font-extrabold">{new Date(barber.startDate + 'T12:00:00').toLocaleDateString('pt-BR')}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* Collapsible schedule scale details */}
      <div className="border-t border-slate-100 pt-4 mt-auto">
        <button
          onClick={() => setShowSchedule(!showSchedule)}
          className="w-full flex items-center justify-between text-xs font-black uppercase text-slate-400 hover:text-primary transition-all pb-1 tracking-wider"
        >
          <span className="flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            <span>Escala Operacional</span>
          </span>
          <div className="flex items-center">
            {showSchedule ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        <AnimatePresence>
          {showSchedule && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-1.5 pt-3"
            >
              <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {DAYS_OF_WEEK.map(day => {
                  const hours = activeHours.find(h => h.dayOfWeek === day.id);
                  const open = hours ? hours.isOpen : false;
                  return (
                    <div key={day.id} className="bg-slate-50 border border-slate-200/40 px-2.5 py-1.5 rounded-xl flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{day.name.split('-')[0]}</span>
                      {open && hours ? (
                        <div className="text-[10px] font-black text-primary leading-tight">
                          <span>{hours.startTime} - {hours.endTime}</span>
                          {hours.lunchStart && (
                            <span className="block text-[8px] text-amber-600 mt-0.5">Almoço: {hours.lunchStart}-{hours.lunchEnd}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-450 italic font-bold">Folga / Fechado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Availability action row footer */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 h-9">
        <button
          disabled={!canEdit}
          onClick={() => onToggleAtivo(barber.uid, barber.ativo)}
          className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all ${
            barber.ativo 
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100 active:scale-95' 
              : 'bg-slate-50 text-slate-400 border-slate-200 active:scale-95'
          } ${!canEdit ? 'opacity-90 cursor-default' : 'cursor-pointer'}`}
          title={canEdit ? "Clique para suspender/ativar escalamento" : ""}
        >
          ● {barber.ativo ? 'Disponível' : 'Inativo / Suspenso'}
        </button>
        <button 
          onClick={onEdit} 
          className="text-xs font-black uppercase text-indigo-600 hover:text-indigo-850 hover:underline transition shrink-0"
        >
          Editar Configurações
        </button>
      </div>
    </motion.div>
  );
}

// PREMIUM 2-TABBED DYNAMIC MODAL WITH SCHEDULE SCALE DESIGN
interface BarberModalProps {
  barber: UserProfile | null;
  onClose: () => void;
  onSave: (data: Partial<UserProfile>) => void;
  isLoading: boolean;
}

function BarberModal({ barber, onClose, onSave, isLoading }: BarberModalProps) {
  const [activeTab, setActiveTab] = useState<'cadastro' | 'agenda'>('cadastro');
  
  // Field values state
  const [nome, setNome] = useState(barber?.nome ?? '');
  const [email, setEmail] = useState(barber?.email ?? '');
  const [telefone, setTelefone] = useState(barber?.telefone ?? barber?.phone ?? '');
  const [especialidade, setEspecialidade] = useState(barber?.especialidade ?? barber?.specialty ?? '');
  const [percentualComissao, setPercentualComissao] = useState(barber?.percentual_comissao ?? barber?.commission_percentage ?? 50);
  const [metaMensal, setMetaMensal] = useState(barber?.meta_mensal ?? barber?.monthly_goal ?? 3000);
  const [startDate, setStartDate] = useState(barber?.startDate ?? new Date().toISOString().split('T')[0]);
  const [is_gestor, setIsGestor] = useState(barber?.is_gestor ?? barber?.is_manager ?? false);
  const [password, setPassword] = useState('');
  
  // Schedule state initialization
  const [schedule, setSchedule] = useState<WorkingHours[]>(() => {
    if (barber?.horario_de_trabalho && barber.horario_de_trabalho.length > 0) {
      return [...barber.horario_de_trabalho];
    }
    return JSON.parse(JSON.stringify(DEFAULT_WORKING_HOURS));
  });

  const handleApplyCommercialSchedule = () => {
    const updated = schedule.map(item => {
      // Monday (1) to Friday (5) gets commercial schedule, saturday special, sunday closed.
      if (item.dayOfWeek >= 1 && item.dayOfWeek <= 5) {
        return { ...item, isOpen: true, startTime: '09:00', endTime: '18:00', lunchStart: '12:00', lunchEnd: '13:00' };
      }
      if (item.dayOfWeek === 6) {
        return { ...item, isOpen: true, startTime: '09:00', endTime: '15:00', lunchStart: '', lunchEnd: '' };
      }
      return { ...item, isOpen: false };
    });
    setSchedule(updated);
    toast.success("Horário comercial padrão aplicado a escala!");
  };

  const handleUpdateDayTime = (dayOfWeek: number, field: keyof WorkingHours, value: any) => {
    const updated = schedule.map(item => {
      if (item.dayOfWeek === dayOfWeek) {
        return { ...item, [field]: value };
      }
      return item;
    });
    setSchedule(updated);
  };

  const handleToggleSpecialty = (spec: string) => {
    const currentSpecs = especialidade ? especialidade.split(',').map(s => s.trim()).filter(Boolean) : [];
    let updated: string[];
    if (currentSpecs.includes(spec)) {
      updated = currentSpecs.filter(s => s !== spec);
    } else {
      updated = [...currentSpecs, spec];
    }
    setEspecialidade(updated.join(', '));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Infomar o nome é obrigatório.");
      return;
    }
    if (!email.trim()) {
      toast.error("Informar o email é obrigatório.");
      return;
    }

    const payload: any = {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefone.trim(),
      phone: telefone.trim(),
      especialidade: especialidade.trim(),
      specialty: especialidade.trim(),
      percentual_comissao: Number(percentualComissao),
      commission_percentage: Number(percentualComissao),
      meta_mensal: Number(metaMensal),
      monthly_goal: Number(metaMensal),
      startDate,
      is_gestor,
      is_manager: is_gestor,
      horario_de_trabalho: schedule,
    };

    if (!barber) {
      if (!password.trim()) {
        toast.error("Você deve definir uma senha para criar um novo profissional.");
        return;
      }
      payload.password = password;
    }

    onSave(payload);
  };

  const currentSelectsSpecs = especialidade ? especialidade.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white border border-slate-200 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black uppercase text-primary tracking-tight">
              {barber ? 'Editar Configurações de Profissional' : 'Cadastrar Novo Profissional'}
            </h2>
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5 text-slate-500">
              {barber ? `Ajustando chaves de acesso para ${barber.nome}` : 'Construa um novo perfil de barbearia do zero'}
            </p>
          </div>
          <button onClick={onClose} className="p-2.5 text-slate-450 hover:text-primary hover:bg-slate-100/60 rounded-xl transition">
            <X size={18} />
          </button>
        </div>

        {/* Form Modal Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/20">
          <button
            type="button"
            onClick={() => setActiveTab('cadastro')}
            className={`flex-1 py-3 text-xs uppercase font-black tracking-widest text-center border-b-2 transition ${
              activeTab === 'cadastro' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-450 hover:text-slate-700 hover:bg-slate-50/40'
            }`}
          >
            📋 1. Perfil e Dados Contratuais
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agenda')}
            className={`flex-1 py-3 text-xs uppercase font-black tracking-widest text-center border-b-2 transition ${
              activeTab === 'agenda' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-450 hover:text-slate-700 hover:bg-slate-50/40'
            }`}
          >
            ⏰ 2. Horários e Escala de Trabalho
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 min-h-[300px] max-h-[55vh]">
            
            {/* TAB 1: CADASTRO PROFILING */}
            {activeTab === 'cadastro' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome Completo</label>
                    <input 
                      required
                      type="text" 
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="Ex: João Silva de Souza"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Email Principal</label>
                    <input 
                      required
                      disabled={!!barber}
                      type="email" 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition disabled:opacity-50"
                      placeholder="email@exemplo.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Telefone WhatsApp</label>
                    <input 
                      type="tel" 
                      value={telefone}
                      onChange={e => setTelefone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="(11) 99999-9999"
                    />
                  </div>

                  {/* Multiple custom clickable specialty presets */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 block mb-1">
                      Especialidades Oferecidas 
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2 p-3 bg-slate-50/70 border rounded-2xl">
                      {SPECIALTY_PRESETS.map(preset => {
                        const isSelected = currentSelectsSpecs.includes(preset);
                        return (
                          <button
                            type="button"
                            key={preset}
                            onClick={() => handleToggleSpecialty(preset)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition flex items-center gap-1 border ${
                              isSelected 
                                ? 'bg-primary border-primary text-white shadow-sm' 
                                : 'bg-white border-slate-250 text-slate-600 hover:border-slate-350'
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                            <span>{preset}</span>
                          </button>
                        );
                      })}
                    </div>
                    <input 
                      type="text" 
                      value={especialidade}
                      onChange={e => setEspecialidade(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="Especialidades separadas por vírgula para livre preenchimento"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Data de Contrato / Início</label>
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Percentual Comissão (%)</label>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      value={percentualComissao}
                      onChange={e => setPercentualComissao(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="Ex: 50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Meta Mensal Esperada (R$)</label>
                    <input 
                      type="number" 
                      min="0"
                      value={metaMensal}
                      onChange={e => setMetaMensal(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="Ex: 3000"
                    />
                  </div>

                  {!barber && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Definir Senha de Acesso</label>
                      <input 
                        required
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                        placeholder="Mínimo 6 caracteres"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between shadow-sm mt-4">
                  <div>
                    <h5 className="text-sm font-extrabold text-primary">Nível de Acesso de Gestor</h5>
                    <p className="text-[10px] text-muted font-bold text-slate-450 uppercase tracking-widest mt-0.5">Permitir leitura de painéis financeiros e edição geral</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsGestor(!is_gestor)}
                    className={`w-12 h-6 rounded-full transition relative ${is_gestor ? 'bg-indigo-600' : 'bg-slate-350'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition shadow-md ${is_gestor ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: WORK DAYS AND DETAILS SCALE */}
            {activeTab === 'agenda' && (
              <div className="space-y-5">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                  <div>
                    <h5 className="text-xs font-black uppercase text-primary tracking-wide">Configulador Rápido de Turno</h5>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Preencha automaticante a escala semanal de trabalho padrão comercial</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCommercialSchedule}
                    className="px-3.5 py-2 hover:bg-slate-250 bg-white border text-primary text-[10px] font-black uppercase tracking-wider rounded-xl active:scale-95 transition"
                  >
                    Aplicar Escala Padrão
                  </button>
                </div>

                <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                  {DAYS_OF_WEEK.map(day => {
                    const hoursIndex = schedule.findIndex(h => h.dayOfWeek === day.id);
                    const hoursObj = schedule[hoursIndex] ?? { dayOfWeek: day.id, isOpen: false, startTime: '09:00', endTime: '18:00' };

                    return (
                      <div 
                        key={day.id} 
                        className={`p-4 border rounded-2xl flex flex-col md:flex-row gap-4 items-start md:items-center justify-between transition-colors ${
                          hoursObj.isOpen ? 'bg-emerald-50/15 border-emerald-200/50' : 'bg-slate-100/40 border-slate-200/30 opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateDayTime(day.id, 'isOpen', !hoursObj.isOpen)}
                            className={`w-9 h-5 rounded-full transition relative shrink-0 ${hoursObj.isOpen ? 'bg-emerald-600' : 'bg-slate-300'}`}
                          >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition shadow-sm ${hoursObj.isOpen ? 'left-4.5' : 'left-0.5'}`} />
                          </button>
                          <span className="text-xs uppercase font-extrabold text-primary min-w-[90px]">{day.name}</span>
                        </div>

                        {hoursObj.isOpen ? (
                          <div className="flex flex-wrap gap-4 items-center">
                            {/* Working Hours */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black uppercase text-slate-400 mr-1.5">Serviço:</span>
                              <input 
                                type="time"
                                required={hoursObj.isOpen}
                                value={hoursObj.startTime}
                                onChange={e => handleUpdateDayTime(day.id, 'startTime', e.target.value)}
                                className="p-1 px-1.5 border border-slate-200 rounded-lg text-xs font-black bg-white"
                              />
                              <span className="text-xs font-bold text-slate-400 px-0.5">às</span>
                              <input 
                                type="time"
                                required={hoursObj.isOpen}
                                value={hoursObj.endTime}
                                onChange={e => handleUpdateDayTime(day.id, 'endTime', e.target.value)}
                                className="p-1 px-1.5 border border-slate-200 rounded-lg text-xs font-black bg-white"
                              />
                            </div>

                            {/* Optional Lunch Interval */}
                            <div className="flex items-center gap-1 border-l border-slate-200 pl-3 md:pl-4">
                              <span className="text-[9px] font-black uppercase text-slate-400 mr-1.5">Almoço:</span>
                              <input 
                                type="time"
                                value={hoursObj.lunchStart ?? ''}
                                onChange={e => handleUpdateDayTime(day.id, 'lunchStart', e.target.value)}
                                className="p-1 px-1.5 border border-slate-200 rounded-lg text-xs font-black bg-white"
                                placeholder="Folga"
                              />
                              <span className="text-xs font-bold text-slate-400 px-0.5">às</span>
                              <input 
                                type="time"
                                value={hoursObj.lunchEnd ?? ''}
                                onChange={e => handleUpdateDayTime(day.id, 'lunchEnd', e.target.value)}
                                className="p-1 px-1.5 border border-slate-200 rounded-lg text-xs font-black bg-white"
                                placeholder="Retorno"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-[10px] font-black text-slate-450 uppercase tracking-widest italic pr-3">
                            🏖️ Folga Semanal Configurada
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Modal Actions row */}
          <div className="p-6 border-t border-slate-150-f100 bg-slate-50 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 border border-slate-250 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 bg-white hover:bg-slate-50 active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isLoading}
              className="flex-[2] py-3.5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition shadow-md shadow-slate-900/15 flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              <span>{isLoading ? 'Sincronizando...' : barber ? 'Salvar Configurações' : 'Cadastrar Profissional'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
