import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Scissors, 
  User, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  X,
  ArrowUp,
  ArrowDown,
  Play,
  Check,
  Coffee,
  UserCheck,
  UserX,
  Phone,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { getActiveTenantId } from '../../services/tenantService';
import { UserProfile, Service, DailyFlowItem } from '../../types';
import { serviceService } from '../../services/serviceService';
import { toast } from 'sonner';

export function OperationsManager() {
  const [flowItems, setFlowItems] = useState<DailyFlowItem[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedFlowItem, setSelectedFlowItem] = useState<DailyFlowItem | null>(null);

  // Form states for adding to queue
  const [clientName, setClientName] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [preferredBarberId, setPreferredBarberId] = useState('next'); // 'next' or specific ID

  const tenantId = getActiveTenantId();

  // Load flow items, barbers, services in real-time
  useEffect(() => {
    setLoading(true);

    // 1. Fetch daily flow items
    const flowQuery = query(
      collection(db, 'daily_flow'),
      where('tenantId', '==', tenantId)
    );

    const unsubscribeFlow = onSnapshot(flowQuery, (snap) => {
      const items = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DailyFlowItem[];
      
      // Sort: Completed at bottom, otherwise by arrival order / createdAt
      const sorted = items.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        
        const timeA = a.chegada_hora || '';
        const timeB = b.chegada_hora || '';
        return timeA.localeCompare(timeB);
      });
      setFlowItems(sorted);
      setLoading(false);
    }, (err) => {
      console.error("Error loading daily flow:", err);
      setLoading(false);
    });

    // 2. Fetch active barbers for current tenant
    const barbersQuery = query(
      collection(db, 'usuarios'),
      where('tenantId', '==', tenantId),
      where('tipo', '==', 'barbeiro'),
      where('ativo', '==', true)
    );

    const unsubscribeBarbers = onSnapshot(barbersQuery, (snap) => {
      const list = snap.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as UserProfile[];
      
      // Sort by active queue index or default to name
      const sorted = list.sort((a, b) => {
        const indexA = (a as any).rodizioIndex ?? 99;
        const indexB = (b as any).rodizioIndex ?? 99;
        if (indexA !== indexB) return indexA - indexB;
        return a.nome.localeCompare(b.nome);
      });
      setBarbers(sorted);
    });

    // 3. Fetch services list
    serviceService.getServices().then(res => {
      setServices(res.filter(s => s.active !== false));
    });

    return () => {
      unsubscribeFlow();
      unsubscribeBarbers();
    };
  }, [tenantId]);

  // Handler to add walk-in customer to waitlist
  const handleAddToWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !selectedServiceId) {
      toast.error("Por favor, preencha o nome do cliente e o serviço.");
      return;
    }

    const service = services.find(s => s.id === selectedServiceId);
    if (!service) return;

    try {
      const now = new Date();
      const formatTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      let profId = '';
      let profName = '';

      if (preferredBarberId !== 'next') {
        const chosen = barbers.find(b => b.uid === preferredBarberId);
        if (chosen) {
          profId = chosen.uid;
          profName = chosen.nome;
        }
      }

      await addDoc(collection(db, 'daily_flow'), {
        cliente_name: clientName.trim(),
        servico_id: service.id,
        servico_name: service.nome || service.name || '',
        profissional_id: profId,
        profissional_name: profName,
        status: 'waiting',
        chegada_hora: formatTime,
        tenantId,
        createdAt: serverTimestamp()
      });

      toast.success("Cliente adicionado à fila de espera!");
      setClientName('');
      setSelectedServiceId('');
      setPreferredBarberId('next');
      setShowModal(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao adicionar cliente à fila.");
    }
  };

  // Move barber in queue order (Rotation)
  const handleMoveBarber = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= barbers.length) return;

    try {
      const updatedList = [...barbers];
      const temp = updatedList[index];
      updatedList[index] = updatedList[targetIndex];
      updatedList[targetIndex] = temp;

      // Update rodizioIndex for each barber
      for (let i = 0; i < updatedList.length; i++) {
        const barberRef = doc(db, 'usuarios', updatedList[i].uid);
        await updateDoc(barberRef, { rodizioIndex: i });
      }
      toast.success("Fila de rodízio reordenada!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao reordenar barbeiros.");
    }
  };

  // Change barber state
  const handleChangeBarberStatus = async (barberId: string, status: 'disponivel' | 'atendendo' | 'pausa') => {
    try {
      const barberRef = doc(db, 'usuarios', barberId);
      await updateDoc(barberRef, { rodizioStatus: status });
      toast.success("Status do barbeiro atualizado!");
    } catch (err) {
      console.error(err);
    }
  };

  // Call client (Start service)
  const handleCallClient = async (item: DailyFlowItem, barberId: string) => {
    const barber = barbers.find(b => b.uid === barberId);
    if (!barber) return;

    try {
      const now = new Date();
      const formatTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Update flow item to serving
      const itemRef = doc(db, 'daily_flow', item.id);
      await updateDoc(itemRef, {
        status: 'serving',
        profissional_id: barber.uid,
        profissional_name: barber.nome,
        inicio_hora: formatTime
      });

      // Update barber status to atendendo
      const barberRef = doc(db, 'usuarios', barber.uid);
      await updateDoc(barberRef, { rodizioStatus: 'atendendo' });

      setAssignModalOpen(false);
      setSelectedFlowItem(null);
      toast.success(`Atendimento do cliente ${item.cliente_name} iniciado!`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar atendimento.");
    }
  };

  // Complete service
  const handleCompleteService = async (item: DailyFlowItem) => {
    try {
      const now = new Date();
      const formatTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const itemRef = doc(db, 'daily_flow', item.id);
      await updateDoc(itemRef, {
        status: 'completed',
        fim_hora: formatTime
      });

      // If a barber was assigned, set him back to disponível and move to bottom of the queue index
      if (item.profissional_id) {
        const barberRef = doc(db, 'usuarios', item.profissional_id);
        
        // Find maximum index in queue
        const maxIndex = barbers.reduce((max, b) => {
          const idx = (b as any).rodizioIndex ?? 0;
          return idx > max ? idx : max;
        }, 0);

        await updateDoc(barberRef, { 
          rodizioStatus: 'disponivel',
          rodizioIndex: maxIndex + 1 // Send to back of line
        });
      }

      toast.success(`Atendimento de ${item.cliente_name} concluído com sucesso!`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao concluir atendimento.");
    }
  };

  // Delete flow item
  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Remover este cliente do fluxo do dia?")) return;
    try {
      const itemRef = doc(db, 'daily_flow', itemId);
      await deleteDoc(itemRef);
      toast.success("Cliente removido do painel.");
    } catch (err) {
      console.error(err);
    }
  };

  // Filter columns
  const waitingList = flowItems.filter(i => i.status === 'waiting');
  const servingList = flowItems.filter(i => i.status === 'serving');
  const completedList = flowItems.filter(i => i.status === 'completed');

  return (
    <div className="space-y-8 pb-10">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-primary tracking-tight">Painel de Fluxo & Rodízio</h1>
          <p className="text-sm text-muted font-medium mt-1">Sincronize o dia corrido do salão, controle a fila de espera e o rodízio sequencial de profissionais.</p>
        </div>
        <button
          onClick={() => { setShowModal(true); }}
          className="bg-primary text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2.5 shrink-0"
        >
          <Plus size={16} /> Adicionar na Fila do Dia
        </button>
      </div>

      {/* Main Grid: Barbers Rotation & Queue Columns */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Professional Rodízio Panel (4 columns width on XL) */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-slate-900 text-white rounded-[32px] p-6 shadow-xl relative overflow-hidden border border-slate-800">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
              <div>
                <h3 className="text-base font-black tracking-tight">Rodízio de Barbeiros</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Fila Ativa de Atendimento</p>
              </div>
              <Scissors className="text-indigo-400 animate-pulse" size={18} />
            </div>

            <div className="space-y-3">
              {barbers.map((barber, index) => {
                const status = (barber as any).rodizioStatus || 'disponivel';
                
                // Color mapping for statuses
                const statusColors = {
                  disponivel: 'bg-emerald-500 shadow-emerald-500/30 text-emerald-400',
                  atendendo: 'bg-blue-500 shadow-blue-500/30 text-blue-400',
                  pausa: 'bg-amber-500 shadow-amber-500/30 text-amber-400'
                };

                const statusLabel = {
                  disponivel: index === 0 ? 'PRÓXIMO (1º)' : 'Aguardando vez',
                  atendendo: 'Em atendimento',
                  pausa: 'Em Intervalo'
                }[status];

                return (
                  <div 
                    key={barber.uid}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                      index === 0 && status === 'disponivel'
                        ? 'bg-slate-800/80 border-indigo-500/30 shadow-indigo-500/5'
                        : 'bg-slate-950/40 border-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Barber Avatar and Status Bullet */}
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center font-black text-xs text-slate-300 uppercase overflow-hidden shrink-0">
                          {barber.fotoUrl || barber.avatarUrl ? (
                            <img src={barber.fotoUrl || barber.avatarUrl} alt={barber.nome} className="w-full h-full object-cover" />
                          ) : (
                            barber.nome.substring(0, 2)
                          )}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                          status === 'disponivel' ? 'bg-emerald-500' : status === 'atendendo' ? 'bg-blue-500' : 'bg-amber-500'
                        }`} />
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-white truncate">{barber.nome}</h4>
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Barber action controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status selectors */}
                      <button
                        title="Disponível"
                        onClick={() => handleChangeBarberStatus(barber.uid, 'disponivel')}
                        className={`p-1.5 rounded-lg border transition-all ${status === 'disponivel' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-transparent text-slate-500 hover:text-slate-300'}`}
                      >
                        <UserCheck size={12} />
                      </button>
                      <button
                        title="Pausa"
                        onClick={() => handleChangeBarberStatus(barber.uid, 'pausa')}
                        className={`p-1.5 rounded-lg border transition-all ${status === 'pausa' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-slate-900 border-transparent text-slate-500 hover:text-slate-300'}`}
                      >
                        <Coffee size={12} />
                      </button>

                      {/* Rotation index adjustment */}
                      <div className="flex flex-col gap-0.5 ml-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveBarber(index, 'up')}
                          className="p-1 hover:bg-slate-800 rounded text-slate-500 disabled:opacity-20 hover:text-white transition-colors"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          disabled={index === barbers.length - 1}
                          onClick={() => handleMoveBarber(index, 'down')}
                          className="p-1 hover:bg-slate-800 rounded text-slate-500 disabled:opacity-20 hover:text-white transition-colors"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {barbers.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6 font-semibold">Nenhum profissional cadastrado.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: The 3 Flow Kanban Columns (8 columns width on XL) */}
        <div className="xl:col-span-8 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Column 1: Aguardando (Fila de Espera) */}
          <div className="bg-white border border-slate-100 rounded-[32px] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Clock size={16} className="text-amber-500" />
                  Aguardando
                </h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">Na recepção ({waitingList.length})</p>
              </div>
              <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2.5 py-1 rounded-full">{waitingList.length}</span>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {waitingList.map(item => (
                <div key={item.id} className="p-4 bg-slate-50 border border-slate-100/80 rounded-2xl space-y-3 relative group">
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="absolute top-3 right-3 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md"
                  >
                    <Trash2 size={12} />
                  </button>

                  <div>
                    <h5 className="font-bold text-xs text-slate-800 truncate pr-5">{item.cliente_name}</h5>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">{item.servico_name}</p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      Chegou: {item.chegada_hora}
                    </span>
                    {item.profissional_name ? (
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider max-w-[100px] truncate">
                        Prefere: {item.profissional_name}
                      </span>
                    ) : (
                      <span className="text-[9px] text-indigo-600 font-extrabold uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        RODÍZIO
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => { setSelectedFlowItem(item); setAssignModalOpen(true); }}
                    className="w-full bg-white hover:bg-primary hover:text-white border border-slate-200 hover:border-transparent text-primary text-[10px] font-black uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Play size={10} /> Chamar para Cadeira
                  </button>
                </div>
              ))}

              {waitingList.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-xs">
                  Recepção vazia.
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Na Cadeira (Em Atendimento) */}
          <div className="bg-white border border-slate-100 rounded-[32px] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <Scissors size={16} className="text-blue-500 animate-spin-slow" />
                  Atendendo
                </h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">Na cadeira ({servingList.length})</p>
              </div>
              <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2.5 py-1 rounded-full">{servingList.length}</span>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {servingList.map(item => (
                <div key={item.id} className="p-4 bg-blue-50/20 border border-blue-100/50 rounded-2xl space-y-3">
                  <div>
                    <h5 className="font-bold text-xs text-slate-800 truncate">{item.cliente_name}</h5>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-1">{item.servico_name}</p>
                  </div>

                  {/* Serving Barber Indicator */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100/80 flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                      {item.profissional_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] text-slate-400 font-bold uppercase leading-none">Profissional:</p>
                      <p className="text-[10px] font-black text-slate-700 truncate mt-0.5">{item.profissional_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      Iniciou: {item.inicio_hora}
                    </span>
                  </div>

                  <button
                    onClick={() => handleCompleteService(item)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5"
                  >
                    <Check size={12} /> Finalizar & Liberar
                  </button>
                </div>
              ))}

              {servingList.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-xs">
                  Ninguém em atendimento.
                </div>
              )}
            </div>
          </div>

          {/* Column 3: Finalizados Hoje */}
          <div className="bg-white border border-slate-100 rounded-[32px] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-50 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  Finalizados
                </h3>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">Concluídos hoje ({completedList.length})</p>
              </div>
              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full">{completedList.length}</span>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {completedList.map(item => (
                <div key={item.id} className="p-4 bg-slate-50/60 border border-slate-100 rounded-2xl space-y-2.5 opacity-75">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="font-bold text-xs text-slate-700 truncate line-through">{item.cliente_name}</h5>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{item.servico_name}</p>
                    </div>
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                  </div>

                  <div className="text-[9px] text-slate-400 font-bold flex items-center justify-between pt-2 border-t border-slate-100 border-dashed">
                    <span>Profissional: {item.profissional_name}</span>
                    <span>Concluído às: {item.fim_hora}</span>
                  </div>
                </div>
              ))}

              {completedList.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic text-xs">
                  Nenhum serviço finalizado hoje.
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: ADD CUSTOMER TO WAITLIST */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h2 className="text-xl font-black text-primary uppercase tracking-tight">Adicionar ao Fluxo</h2>
                <button onClick={() => setShowModal(false)} className="p-2 bg-white hover:bg-slate-100 rounded-xl text-muted transition-colors border border-slate-100 shadow-sm">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddToWaitlist} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Cliente (Walk-In ou Cadastrado)</label>
                  <input 
                    required 
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Ex: João Silva" 
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-inner" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Serviço Pretendido</label>
                  <select 
                    required 
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 appearance-none shadow-inner"
                  >
                    <option value="">Selecione o serviço...</option>
                    {services.map(s => <option key={s.id} value={s.id}>{s.nome || s.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Barbeiro Preferido</label>
                  <select 
                    value={preferredBarberId}
                    onChange={(e) => setPreferredBarberId(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 appearance-none shadow-inner"
                  >
                    <option value="next">Próximo do Rodízio (Recomendado)</option>
                    {barbers.map(b => <option key={b.uid} value={b.uid}>{b.nome}</option>)}
                  </select>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-50">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)} 
                    className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-95"
                  >
                    Inserir na Fila
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: ASSIGN PROFESSIONAL (START SERVICE) */}
      <AnimatePresence>
        {assignModalOpen && selectedFlowItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-primary uppercase tracking-tight">Chamar Atendimento</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">Cliente: {selectedFlowItem.cliente_name}</p>
                </div>
                <button onClick={() => setAssignModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 rounded-xl text-muted transition-colors border border-slate-100 shadow-sm">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Selecione o Barbeiro</label>
                  <div className="space-y-2">
                    {/* Suggest first barber in rotation who is disponível */}
                    {barbers.map((b, i) => {
                      const isFirstDisponivel = barbers.slice(0, i).every(prev => (prev as any).rodizioStatus !== 'disponivel') && (b as any).rodizioStatus === 'disponivel';
                      const status = (b as any).rodizioStatus || 'disponivel';

                      return (
                        <button
                          key={b.uid}
                          onClick={() => handleCallClient(selectedFlowItem, b.uid)}
                          className="w-full p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200 rounded-2xl flex items-center justify-between transition-all active:scale-95"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                              {b.nome.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-bold text-xs text-slate-700">{b.nome}</span>
                          </div>
                          
                          {isFirstDisponivel ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border border-emerald-200 animate-pulse">
                              Próximo do Rodízio
                            </span>
                          ) : (
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${
                              status === 'disponivel' ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-red-50 border-red-100 text-red-500'
                            }`}>
                              {status === 'disponivel' ? 'Livre' : 'Ocupado'}
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {barbers.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">Nenhum barbeiro disponível no rodízio hoje.</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-50">
                  <button 
                    onClick={() => setAssignModalOpen(false)} 
                    className="w-full py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
