import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, 
  Plus, 
  Trash2, 
  Search, 
  Cake, 
  Calendar, 
  CheckCircle, 
  Loader2, 
  X, 
  Phone, 
  Send,
  Sparkles,
  ClipboardList,
  Edit2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Bookmark,
  CheckSquare,
  Square,
  ArrowUpDown,
  Filter,
  Info
} from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  updateDoc,
  doc, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { toast } from 'sonner';
import { ConfirmationModal } from '../components/ConfirmationModal';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface InternalReminder {
  id: string;
  task: string;
  date: string;
  completed: boolean;
  priority?: 'low' | 'medium' | 'high';
  createdAt?: string;
  notes?: string;
}

const MONTHS_LIST = [
  { value: 0, label: 'Janeiro' },
  { value: 1, label: 'Fevereiro' },
  { value: 2, label: 'Março' },
  { value: 3, label: 'Abril' },
  { value: 4, label: 'Maio' },
  { value: 5, label: 'Junho' },
  { value: 6, label: 'Julho' },
  { value: 7, label: 'Agosto' },
  { value: 8, label: 'Setembro' },
  { value: 9, label: 'Outubro' },
  { value: 10, label: 'Novembro' },
  { value: 11, label: 'Dezembro' }
];

export function Lembretes() {
  const { tenantId } = useTenant();
  const { isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  const [activeTab, setActiveTab] = useState<'lembretes' | 'aniversariantes'>('lembretes');
  const [reminders, setReminders] = useState<InternalReminder[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, filtration & sorts
  const [searchQuery, setSearchQuery] = useState('');
  const [reminderFilter, setReminderFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [selectedBirthMonth, setSelectedBirthMonth] = useState<number>(new Date().getMonth());

  // Modal forms states
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState<InternalReminder | null>(null);

  // Reminder Form Fields
  const [reminderTask, setReminderTask] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderPriority, setReminderPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [reminderNotes, setReminderNotes] = useState('');

  // WhatsApp Greeting Template Modal States
  const [showGreetingModal, setShowGreetingModal] = useState(false);
  const [targetClient, setTargetClient] = useState<UserProfile | null>(null);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState(0);
  const [editedMessageText, setEditedMessageText] = useState('');

  // Confirmation Modals States
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);

    // 1. Subscribe to Team Reminders
    const pathRem = 'lembretes_internos';
    const qRem = query(collection(db, pathRem), orderBy('date', 'asc'));
    const unsubRem = onSnapshot(qRem, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as InternalReminder));
      setReminders(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, pathRem);
    });

    // 2. Fetch Clients using service
    userService.getAllClients()
      .then(res => setClients(res.filter(c => c.ativo !== false)))
      .catch(err => console.error('Erro ao buscar clientes paracadastro:', err));

    return () => {
      unsubRem();
    };
  }, []);

  // Sync edit form states
  useEffect(() => {
    if (editingReminder) {
      setReminderTask(editingReminder.task);
      setReminderDate(editingReminder.date);
      setReminderPriority(editingReminder.priority || 'medium');
      setReminderNotes(editingReminder.notes || '');
    } else {
      setReminderTask('');
      setReminderDate(new Date().toISOString().split('T')[0]);
      setReminderPriority('medium');
      setReminderNotes('');
    }
  }, [editingReminder]);

  // Handle WhatsApp Greeting Message Template Building
  useEffect(() => {
    if (targetClient) {
      const templates = [
        `Parabéns, ${targetClient.nome}! 🥳 Nós da BarberElite desejamos um feliz aniversário e um excelente ano novo de vida. Para comemorar, passe aqui ganhar 15% OFF no seu próximo corte!`,
        `Fala, ${targetClient.nome}! Feliz aniversário! 🎂 Desejamos muito sucesso, paz e estilo nessa nova etapa. Que tal dar aquele trato no visual hoje? Temos um presente surpresa esperando por você aqui!`,
        `Parabéns pelo seu dia, ${targetClient.nome}! 🎉 Desejamos o melhor para você sempre. Obrigado por ser nosso cliente fiel. Aguardamos sua visita para comemorar com estilo!`
      ];
      setEditedMessageText(templates[selectedTemplateIndex]);
    }
  }, [targetClient, selectedTemplateIndex]);

  // Create / Edit Reminder Submit
  const handleSaveReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTask.trim()) {
      toast.error('Preencha a tarefa do lembrete.');
      return;
    }
    if (!reminderDate) {
      toast.error('Informe a data do compromisso.');
      return;
    }

    const payload = {
      task: reminderTask.trim(),
      date: reminderDate,
      priority: reminderPriority,
      notes: reminderNotes.trim(),
      completed: editingReminder ? editingReminder.completed : false,
      updatedAt: new Date().toISOString()
    };

    const path = 'lembretes_internos';
    try {
      if (editingReminder) {
        await updateDoc(doc(db, path, editingReminder.id), payload);
        toast.success('Lembrete atualizado com sucesso!');
      } else {
        await addDoc(collection(db, path), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        toast.success('Lembrete criado com sucesso!');
      }
      setShowReminderModal(false);
      setEditingReminder(null);
    } catch (err) {
      handleFirestoreError(err, editingReminder ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  // Toggle Reminder Status (Completed / Pending)
  const handleToggleReminderCompleted = async (rem: InternalReminder) => {
    const path = 'lembretes_internos';
    try {
      await updateDoc(doc(db, path, rem.id), {
        completed: !rem.completed
      });
      toast.success(rem.completed ? 'Tarefa reaberta!' : 'Tarefa concluída! Parabéns equipe!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Delete Reminder Confirmation Submit
  const handleConfirmDeleteReminder = async () => {
    if (!deleteReminderId) return;
    const path = 'lembretes_internos';
    try {
      await deleteDoc(doc(db, path, deleteReminderId));
      toast.success('Lembrete removido em definitivo.');
      setDeleteReminderId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // WhatsApp Sender Handler
  const handleTriggerSendGreeting = () => {
    if (!targetClient) return;
    const rawPhone = targetClient.telefone || targetClient.phone || '';
    const phoneClean = rawPhone.replace(/\D/g, '');
    if (!phoneClean) {
      toast.error('O cliente não possui um telefone celular válido cadastrado.');
      return;
    }
    const messageEncoded = encodeURIComponent(editedMessageText);
    window.open(`https://api.whatsapp.com/send?phone=55${phoneClean}&text=${messageEncoded}`, '_blank');
    setShowGreetingModal(false);
    setTargetClient(null);
  };

  // Filtering: Birthdays matching the selected month and search query
  const birthdayClients = clients.filter(c => {
    if (!c.birthDate) return false;
    try {
      const bDate = new Date(c.birthDate);
      // Adjust timezone issues if birthday is off by 1 day
      const matchesMonth = bDate.getMonth() === selectedBirthMonth;
      const matchesSearch = c.nome.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMonth && matchesSearch;
    } catch (err) {
      return false;
    }
  });

  // Filtering: Reminders matching the query and completion controls
  const filteredReminders = reminders.filter(r => {
    const matchesSearch = r.task.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (reminderFilter === 'pending') {
      return matchesSearch && !r.completed;
    }
    if (reminderFilter === 'completed') {
      return matchesSearch && r.completed;
    }
    return matchesSearch;
  });

  // Aggregated indicators
  const totalPendingTasks = reminders.filter(r => !r.completed).length;
  const totalCompletedTasks = reminders.filter(r => r.completed).length;
  const totalUrgentTasks = reminders.filter(r => !r.completed && r.priority === 'high').length;
  const currentMonthBirthdays = clients.filter(c => {
    if (!c.birthDate) return false;
    try {
      return new Date(c.birthDate).getMonth() === new Date().getMonth();
    } catch {
      return false;
    }
  }).length;

  return (
    <div className="space-y-8 pb-16 text-primary font-sans">
      {/* Header Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-1">Lembretes & Relacionamento</h1>
          <p className="text-muted text-sm font-medium">
            Gerencie tarefas e compromissos internos do time de barbeiros e parabenize os aniversariantes do mês por WhatsApp.
          </p>
        </div>
        <div className="flex gap-3 shrink-0 self-start sm:self-center">
          {canManage && (
            <button 
              onClick={() => {
                setEditingReminder(null);
                setShowReminderModal(true);
              }}
              className="flex items-center justify-center gap-2 bg-slate-900 border border-slate-850 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition shadow-sm active:scale-95"
            >
              <Plus size={15} />
              <span>Novo Lembrete</span>
            </button>
          )}
        </div>
      </header>

      {/* Analytical Badges Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tarefas em Aberto', value: `${totalPendingTasks} pendentes`, icon: ClipboardList, color: 'text-indigo-600 bg-indigo-50 border-indigo-100/50' },
          { label: 'Tarefas Concluídas', value: `${totalCompletedTasks} finalizadas`, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100/50' },
          { label: 'Prioritários (Alta)', value: `${totalUrgentTasks} críticos`, icon: AlertCircle, color: 'text-amber-600 bg-amber-50 border-amber-100/50' },
          { label: 'Aniversariantes do Mês', value: `${currentMonthBirthdays} aniversariantes`, icon: Cake, color: 'text-rose-600 bg-rose-50 border-rose-100/50' }
        ].map((stat, i) => (
          <div key={i} className="bg-white border rounded-3xl p-4 flex items-center gap-4 shadow-sm">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${stat.color} shrink-0`}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">{stat.label}</p>
              <p className="text-lg font-black text-primary leading-tight">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Control navigation and Search/Filter Area */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 border p-1 rounded-2xl shadow-inner w-full md:w-auto shrink-0 justify-start gap-1">
          <button 
            onClick={() => {
              setActiveTab('lembretes');
              setSearchQuery('');
            }}
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
              activeTab === 'lembretes' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-slate-500 hover:text-primary'
            }`}
          >
            📋 Lembretes da Equipe
          </button>
          <button 
            onClick={() => {
              setActiveTab('aniversariantes');
              setSearchQuery('');
            }}
            className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
              activeTab === 'aniversariantes' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-slate-500 hover:text-primary'
            }`}
          >
            🎂 Canal de Aniversariantes
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder={activeTab === 'lembretes' ? "Filtrar compromissos..." : "Buscar aniversariante..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-slate-50 focus:border-slate-500 rounded-2xl py-2 pl-10 pr-3.5 text-xs font-semibold text-primary shadow-sm transition animate-none"
            />
          </div>

          {activeTab === 'lembretes' ? (
            <div className="flex bg-slate-50 border border-slate-100 rounded-xl p-1 gap-1 w-full sm:w-auto shrink-0">
              {(['all', 'pending', 'completed'] as const).map(option => (
                <button
                  key={option}
                  onClick={() => setReminderFilter(option)}
                  className={`px-3.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                    reminderFilter === option 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-500 hover:text-primary'
                  }`}
                >
                  {option === 'all' && 'Todos'}
                  {option === 'pending' && 'Pendentes'}
                  {option === 'completed' && 'Concluídos'}
                </button>
              ))}
            </div>
          ) : (
            <div className="relative w-full sm:w-auto shrink-0">
              <select 
                value={selectedBirthMonth}
                onChange={e => setSelectedBirthMonth(Number(e.target.value))}
                className="w-full sm:w-44 bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-slate-50 focus:border-slate-500 rounded-2xl py-2 px-3 text-xs font-black uppercase tracking-wider text-primary shadow-sm transition cursor-pointer"
              >
                {MONTHS_LIST.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main List Sections */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white border rounded-[2rem] shadow-sm">
          <Loader2 className="animate-spin text-slate-800" size={48} />
          <p className="text-muted animate-pulse font-black tracking-widest uppercase text-xs">Acessando registros seguros...</p>
        </div>
      ) : activeTab === 'lembretes' ? (
        /* TAB 1: TEAM REMINDERS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredReminders.length === 0 ? (
            <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] py-16 text-center shadow-sm flex flex-col items-center justify-center">
              <Bell size={28} className="text-slate-400 mb-2" />
              <h3 className="text-sm font-black text-primary uppercase tracking-tight">Nenhum lembrete registrado</h3>
              <p className="text-muted text-xs max-w-xs mx-auto font-bold mt-1 text-slate-450 leading-relaxed">
                Nenhum compromisso ou lembrete coincide com o filtro selecionado. Clique no botão de criação para inserir um lembrete.
              </p>
            </div>
          ) : (
            filteredReminders.map(rem => {
              const parsedDate = new Date(rem.date);
              const formattedDate = isNaN(parsedDate.getTime()) ? rem.date : parsedDate.toLocaleDateString('pt-BR');
              
              // Color badges for priority
              const priorityColors = {
                high: 'bg-red-50 border-red-100 text-red-700',
                medium: 'bg-amber-50 border-amber-200 text-amber-700',
                low: 'bg-slate-50 border-slate-200 text-slate-600'
              }[rem.priority || 'medium'];

              const priorityLabel = {
                high: '🚨 Urgente',
                medium: '⚡ Média',
                low: '💤 Baixa'
              }[rem.priority || 'medium'];

              return (
                <motion.div 
                  layout
                  key={rem.id} 
                  className={`bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative ${
                    rem.completed ? 'opacity-65 border-slate-200 bg-slate-50/10' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header line */}
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-black px-2.5 py-1 rounded-full uppercase border ${priorityColors}`}>
                          {priorityLabel}
                        </span>
                        {rem.completed && (
                          <span className="text-[8px] font-black px-2.5 py-1 rounded-full uppercase border bg-emerald-50 border-emerald-100 text-emerald-700">
                            ✓ Resolvido
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => handleToggleReminderCompleted(rem)}
                          className={`p-1.5 rounded-lg border transition ${
                            rem.completed 
                              ? 'text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                              : 'text-slate-400 bg-white border-slate-100 hover:text-indigo-650 hover:bg-indigo-50'
                          }`}
                          title={rem.completed ? "Reabrir tarefa" : "Marcar como concluído"}
                        >
                          {rem.completed ? <CheckSquare size={13} /> : <Square size={13} />}
                        </button>

                        {canManage && (
                          <>
                            <button 
                              onClick={() => {
                                setEditingReminder(rem);
                                setShowReminderModal(true);
                              }}
                              className="p-1.5 text-slate-400 bg-white border border-slate-100 hover:bg-slate-50 hover:text-slate-700 rounded-lg"
                              title="Editar lembrete"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              onClick={() => setDeleteReminderId(rem.id)}
                              className="p-1.5 text-slate-350 bg-white border border-slate-100 hover:bg-red-50 hover:text-red-500 rounded-lg hover:border-red-100"
                              title="Excluir definitivo"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Task Title with checkbox link */}
                    <div className="flex items-start gap-2.5">
                      <div className="pt-0.5 shrink-0">
                        <Bookmark size={15} className={`text-slate-400 ${rem.completed ? 'opacity-30' : ''}`} />
                      </div>
                      <div>
                        <h3 className={`text-sm font-extrabold text-primary leading-tight tracking-tight ${
                          rem.completed ? 'line-through text-slate-450 font-bold' : ''
                        }`}>
                          {rem.task}
                        </h3>
                        {rem.notes && (
                          <p className={`text-xs mt-1 leading-relaxed ${
                            rem.completed ? 'text-slate-400 italic font-bold' : 'text-slate-500 font-semibold'
                          }`}>
                            {rem.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 mt-5 flex items-center justify-between text-[10px] font-black uppercase text-slate-450 tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-indigo-600" />
                      <span>{formattedDate}</span>
                    </span>
                    <span className="text-slate-350 shrink-0 capitalize">
                      status: {rem.completed ? 'finalizado' : 'ativo'}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      ) : (
        /* TAB 2: BIRTHDAYS CHANNELS OF THE MONTH */
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <Cake className="text-pink-500" size={18} />
              <h2 className="text-xs font-black tracking-widest uppercase text-slate-700">
                Lista de Aniversariantes para {MONTHS_LIST.find(m => m.value === selectedBirthMonth)?.label}
              </h2>
            </div>
            <span className="text-[10px] font-black uppercase bg-white border text-primary px-3 py-1 rounded-full px-4 py-1.5">
              💡 {birthdayClients.length} Clientes Encontrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/20 border-b border-slate-100">
                  <th className="p-5 text-xs font-black uppercase text-slate-450 tracking-wide">Cliente aniversariante</th>
                  <th className="p-5 text-xs font-black uppercase text-slate-450 tracking-wide">Data de nascimento</th>
                  <th className="p-5 text-xs font-black uppercase text-slate-450 tracking-wide">Telefone para envio</th>
                  <th className="p-5 text-xs font-black uppercase text-slate-450 tracking-wide text-right">Canal de ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {birthdayClients.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-xs font-bold italic text-slate-400">
                      Nenhum cliente aniversariante cadastrado com a data correspondente a este mês de consulta.
                    </td>
                  </tr>
                ) : (
                  birthdayClients.map((c, index) => {
                    const parsedBirthDate = c.birthDate ? new Date(c.birthDate) : null;
                    const bDayNum = parsedBirthDate ? parsedBirthDate.getDate() : '--';
                    const bMonthLabel = parsedBirthDate ? MONTHS_LIST.find(m => m.value === parsedBirthDate.getMonth())?.label : '';
                    
                    const clientPhone = c.telefone || c.phone || 'Sem telefone';
                    const hasValidPhone = clientPhone !== 'Sem telefone' && clientPhone.replace(/\D/g, '').length >= 8;

                    return (
                      <tr key={`birthday-client-${c.uid || index}-${index}`} className="hover:bg-slate-50/30 transition-all font-bold text-primary">
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-pink-50 border border-pink-100 text-pink-600 rounded-2xl flex items-center justify-center font-black text-xs shrink-0">
                              🎂
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-800 leading-tight">{c.nome}</p>
                              <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">Cliente Elite</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-5">
                          <span className="bg-slate-150-f100 bg-slate-100 font-extrabold text-slate-705 text-xs py-1.5 px-3 rounded-xl border">
                            {bDayNum} de {bMonthLabel || 'N/A'}
                          </span>
                        </td>
                        <td className="p-5">
                          <span className="flex items-center gap-1.5 text-slate-650">
                            <Phone size={13} className="text-slate-400" />
                            <span>{clientPhone}</span>
                          </span>
                        </td>
                        <td className="p-5 text-right">
                          <button 
                            onClick={() => {
                              setTargetClient(c);
                              setSelectedTemplateIndex(0);
                              setShowGreetingModal(true);
                            }}
                            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-sm border ${
                              hasValidPhone 
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-650' 
                                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            }`}
                            disabled={!hasValidPhone}
                            title={hasValidPhone ? "Enviar parabenização personalizada no WhatsApp" : "Telefone ausente do cadastro"}
                          >
                            <Send size={11} />
                            <span>Parabenizar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* 1. Create/Edit Reminder Modal */}
      <AnimatePresence>
        {showReminderModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleSaveReminder}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">
                    {editingReminder ? 'Editar Lembrete' : 'Criar Lembrete Equipe'}
                  </h3>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-1">
                    Defina tarefas gerenciais ou avisos para a equipe
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowReminderModal(false)}
                  className="bg-slate-100 p-2 rounded-xl text-slate-500 hover:text-primary transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Tarefa / Compromisso</label>
                  <input 
                    required
                    type="text" 
                    value={reminderTask} 
                    onChange={e => setReminderTask(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50 focus:border-slate-500 transition text-xs"
                    placeholder="Ex: Comprar golas higiênicas e toalhas de microfibra"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Data de Realização</label>
                    <input 
                      required
                      type="date" 
                      value={reminderDate} 
                      onChange={e => setReminderDate(e.target.value)}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold outline-none focus:bg-white cursor-text focus:ring-4 focus:ring-slate-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Nível de Prioridade</label>
                    <select 
                      value={reminderPriority} 
                      onChange={e => setReminderPriority(e.target.value as any)}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold outline-none focus:bg-white cursor-pointer focus:ring-4 focus:ring-slate-50"
                    >
                      <option value="high">Urgentíssimo (🚨 Alta)</option>
                      <option value="medium">Rotineiro (⚡ Média)</option>
                      <option value="low">Flexível (💤 Baixa)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Observações Informativas (Opcional)</label>
                  <textarea 
                    rows={3}
                    value={reminderNotes} 
                    onChange={e => setReminderNotes(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl font-semibold outline-none text-xs focus:bg-white focus:ring-4 focus:ring-slate-50 focus:border-slate-500 transition resize-none"
                    placeholder="Informações adicionais para ajudar a equipe a concluir a tarefa corretamente (Ex: Comprar marca X por causa da maciez...)"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReminderModal(false)}
                  className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 active:scale-95 transition"
                >
                  Fechar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] py-3.5 bg-slate-900 text-white font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-slate-800 transition shadow-lg active:scale-95"
                >
                  <span>Salvar Lembrete</span>
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Birthday WhatsApp Greeting Editor Modal */}
      <AnimatePresence>
        {showGreetingModal && targetClient && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <MessageSquare className="text-emerald-500" size={20} />
                    <span>Parabenizar {targetClient.nome}</span>
                  </h3>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-1">
                    Selecione um roteiro de marketing e edite a mensagem como preferir.
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowGreetingModal(false);
                    setTargetClient(null);
                  }} 
                  className="bg-slate-100 p-2 rounded-xl text-slate-500 hover:text-primary transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 text-sm font-bold">
                {/* Templates Selector */}
                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-2 ml-1">
                    Selecionar Estilo de Abordagem
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { title: 'Promo 15% OFF', desc: 'Desconto aniversário' },
                      { title: 'Trato Sênior', desc: 'Presente surpresa' },
                      { title: 'Socio Fiel', desc: 'Agradecimento puro' }
                    ].map((temp, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedTemplateIndex(index)}
                        className={`p-3 text-left border rounded-xl flex flex-col justify-between transition-all ${
                          selectedTemplateIndex === index 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        <span className="text-[10px] font-black tracking-tight uppercase leading-none mb-1 text-emerald-700">
                          {temp.title}
                        </span>
                        <span className="text-[8px] font-semibold text-slate-400 leading-none">{temp.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Message Textbox */}
                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1 flex justify-between">
                    <span>Editar Mensagem de Envio</span>
                    <span className="text-emerald-600">Celular: {targetClient.telefone || targetClient.phone}</span>
                  </label>
                  <textarea 
                    rows={4}
                    value={editedMessageText} 
                    onChange={e => setEditedMessageText(e.target.value)}
                    className="w-full bg-slate-50 border p-4 rounded-2xl font-semibold outline-none text-xs focus:bg-white focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition resize-none leading-relaxed text-slate-700"
                    placeholder="Digite a mensagem..."
                  />
                  <div className="flex items-start gap-1.5 mt-2 ml-1 text-slate-400">
                    <Info size={12} className="shrink-0 mt-0.5" />
                    <p className="text-[9px] font-semibold leading-normal">
                      A mensagem será iniciada diretamente na tela do aplicativo WhatsApp do seu celular ou web contendo o texto acima preenchido para envio manual rápido.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowGreetingModal(false);
                    setTargetClient(null);
                  }}
                  className="flex-1 py-3.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 active:scale-95 transition"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleTriggerSendGreeting}
                  className="flex-[2] py-3.5 bg-emerald-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-emerald-700 transition shadow-lg active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Send size={12} />
                  <span>Chamar no WhatsApp</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOGS */}
      
      {/* 1. Delete Reminder Confirmation */}
      <ConfirmationModal 
        isOpen={!!deleteReminderId}
        onClose={() => setDeleteReminderId(null)}
        onConfirm={handleConfirmDeleteReminder}
        title="Apagar Lembrete"
        description="Tem certeza que dejsa deletar permanentemente este lembrete de equipe? Esta ação é irreversível e removerá todos os logs internos vinculados a este ID."
        confirmLabel="Remover Lembrete"
        variant="danger"
      />
    </div>
  );
}
