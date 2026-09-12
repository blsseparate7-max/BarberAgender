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
  ChevronRight,
  Receipt,
  Tv,
  UserMinus,
  ArrowUpCircle,
  Calendar,
  Eye,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { getActiveTenantId } from '../../services/tenantService';
import { UserProfile, Service, DailyFlowItem, Comanda } from '../../types';
import { serviceService } from '../../services/serviceService';
import { userService } from '../../services/userService';
import { comandaService } from '../../services/comandaService';
import { ComandaModal } from '../Comanda/ComandaModal';
import { FlowDateNavigator } from './FlowDateNavigator';
import { FlowMetricsCards } from './FlowMetricsCards';
import { FlowBarberRanking } from './FlowBarberRanking';
import { FlowTVModal } from './FlowTVModal';
import { FlowHistoryTable } from './FlowHistoryTable';
import { FlowDayDetailsModal } from './FlowDayDetailsModal';
import { extractFlowItemDate } from './FlowUtils';
import { toast } from 'sonner';

export function OperationsManager() {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [flowTab, setFlowTab] = useState<'operacao' | 'historico'>('operacao');
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);

  const [rawFlowItems, setRawFlowItems] = useState<DailyFlowItem[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedFlowItem, setSelectedFlowItem] = useState<DailyFlowItem | null>(null);
  const [isTVModalOpen, setIsTVModalOpen] = useState(false);

  // Comanda Modal States
  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [selectedComandaId, setSelectedComandaId] = useState<string | undefined>(undefined);
  const [comandaInitialData, setComandaInitialData] = useState<Partial<Comanda> | null>(null);

  // Waitlist selection states
  const [clientSelectionType, setClientSelectionType] = useState<'sem_cadastro' | 'cadastrado' | 'novo_cadastro'>('sem_cadastro');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [registeredClients, setRegisteredClients] = useState<UserProfile[]>([]);

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
      
      setRawFlowItems(items);
      setLoading(false);
    }, (err) => {
      console.error("Error loading daily flow:", err);
      setLoading(false);
    });

    // 2. Fetch active barbers for current tenant
    const unsubscribeBarbers = userService.subscribeToAllBarbers(true, (list) => {
      const sorted = list.sort((a, b) => {
        const indexA = (a as any).rodizioIndex ?? 99;
        const indexB = (b as any).rodizioIndex ?? 99;
        if (indexA !== indexB) return indexA - indexB;
        return (a.nome || '').localeCompare(b.nome || '');
      });
      setBarbers(sorted);
    }, tenantId);

    // 3. Fetch services list
    serviceService.getServices().then(res => {
      setServices(res.filter(s => s.active !== false));
    });

    // 4. Fetch registered clients list in real-time
    const unsubscribeClients = userService.subscribeToAllClients(true, (data) => {
      setRegisteredClients(data);
    });

    // 5. Fetch active comandas in real-time for status tracking
    const unsubscribeComandas = comandaService.subscribeToComandas(
      ['aberta', 'aguardando_pagamento', 'fechada'],
      (list) => {
        setComandas(list);
      }
    );

    return () => {
      unsubscribeFlow();
      unsubscribeBarbers();
      unsubscribeClients();
      unsubscribeComandas();
    };
  }, [tenantId]);

  // Filter flow items for the selected day safely
  const filteredFlowItems = rawFlowItems.filter(item => {
    const itemDate = extractFlowItemDate(item);
    if (itemDate) {
      return itemDate === selectedDate;
    }
    // Strict separation: never let past items bleed into today
    return false;
  }).sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    
    // Priority check
    if ((a as any).priority && !(b as any).priority) return -1;
    if (!(a as any).priority && (b as any).priority) return 1;

    const timeA = a.chegada_hora || '';
    const timeB = b.chegada_hora || '';
    return timeA.localeCompare(timeB);
  });

  // Calculate live waiting time in minutes
  const calculateWaitMinutes = (chegadaHora?: string) => {
    if (!chegadaHora) return 0;
    const [h, m] = chegadaHora.split(':').map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const arrivalMinutes = h * 60 + m;
    const diff = currentMinutes - arrivalMinutes;
    return diff > 0 ? diff : 0;
  };

  // Handler to add walk-in customer to waitlist
  const handleAddToWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) {
      toast.error("Por favor, selecione um serviço.");
      return;
    }

    let finalClientName = '';
    let finalClientId: string | null = null;

    try {
      if (clientSelectionType === 'sem_cadastro') {
        if (!clientName.trim()) {
          toast.error("Por favor, preencha o nome do cliente.");
          return;
        }
        finalClientName = clientName.trim();
        finalClientId = null;
      } else if (clientSelectionType === 'cadastrado') {
        if (!selectedClientId) {
          toast.error("Por favor, selecione um cliente cadastrado.");
          return;
        }
        const clientProfile = registeredClients.find(c => c.uid === selectedClientId);
        if (!clientProfile) {
          toast.error("Cliente cadastrado não encontrado.");
          return;
        }
        finalClientName = clientProfile.nome;
        finalClientId = selectedClientId;
      } else if (clientSelectionType === 'novo_cadastro') {
        if (!clientName.trim()) {
          toast.error("Por favor, preencha o nome do novo cliente.");
          return;
        }
        const newClient = await userService.createUser({
          nome: clientName.trim(),
          telefone: newClientPhone.trim() || '',
          phone: newClientPhone.trim() || '',
          tipo: 'cliente',
          ativo: true,
          tenantId: tenantId,
          saldo_atual: 0,
          total_gasto: 0,
          total_pago: 0,
          total_em_aberto: 0
        });
        finalClientName = newClient.nome;
        finalClientId = newClient.uid;
        toast.success(`Cliente ${finalClientName} cadastrado com sucesso!`);
      }

      const service = services.find(s => s.id === selectedServiceId);
      if (!service) return;

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
        cliente_name: finalClientName,
        cliente_id: finalClientId,
        servico_id: service.id,
        servico_name: service.nome || service.name || '',
        profissional_id: profId,
        profissional_name: profName,
        status: 'waiting',
        chegada_hora: formatTime,
        data: selectedDate,
        date: selectedDate,
        tenantId,
        createdAt: serverTimestamp()
      });

      toast.success("Cliente adicionado à fila de espera!");
      setClientName('');
      setNewClientPhone('');
      setSelectedClientId('');
      setClientSearchTerm('');
      setClientSelectionType('sem_cadastro');
      setSelectedServiceId('');
      setPreferredBarberId('next');
      setShowModal(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao adicionar cliente à fila.");
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

  // Prioritize customer
  const handlePrioritizeCustomer = async (itemId: string, currentPriority?: boolean) => {
    try {
      const itemRef = doc(db, 'daily_flow', itemId);
      await updateDoc(itemRef, { priority: !currentPriority });
      toast.success(!currentPriority ? "Cliente priorizado na fila!" : "Prioridade removida.");
    } catch (err) {
      console.error(err);
    }
  };

  // Mark Desistência / No-Show
  const handleMarkDesistencia = async (itemId: string, clientName: string) => {
    if (!window.confirm(`Registrar desistência para o cliente ${clientName}?`)) return;
    try {
      const itemRef = doc(db, 'daily_flow', itemId);
      await updateDoc(itemRef, { 
        status: 'desistiu',
        cancelado_em: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
      toast.info(`Desistência de ${clientName} registrada.`);
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

      // Update barber status to atendendo & rotate to end of queue
      const barberRef = doc(db, 'usuarios', barber.uid);
      const maxIndex = barbers.reduce((max, b) => {
        const idx = (b as any).rodizioIndex ?? 0;
        return idx > max ? idx : max;
      }, 0);
      await updateDoc(barberRef, { 
        rodizioStatus: 'atendendo',
        rodizioIndex: maxIndex + 1
      });

      // Synchronize with Agenda (Appointments)
      try {
        let linkedAppId: string | null = (item as any).agendamento_id || null;
        
        if (!linkedAppId && item.cliente_id && item.cliente_id !== 'avulso') {
          const appQuery = query(
            collection(db, 'appointments'),
            where('tenantId', '==', tenantId),
            where('cliente_id', '==', item.cliente_id),
            where('date', '==', selectedDate)
          );
          const appSnap = await getDocs(appQuery);
          const activeApp = appSnap.docs.find(d => {
            const st = d.data().status;
            return st === 'agendado' || st === 'confirmado' || st === 'em_atendimento';
          });
          if (activeApp) {
            linkedAppId = activeApp.id;
          }
        }

        if (linkedAppId) {
          await updateDoc(doc(db, 'appointments', linkedAppId), {
            status: 'em_atendimento',
            profissional_id: barber.uid,
            profissional_name: barber.nome,
            daily_flow_id: item.id,
            updatedAt: serverTimestamp()
          });
          await updateDoc(itemRef, { agendamento_id: linkedAppId });
        } else {
          const serviceObj = services.find(s => s.id === item.servico_id);
          const duration = serviceObj?.duracao || serviceObj?.duracao_minutos || 30;
          
          const [h, m] = formatTime.split(':').map(Number);
          const totalEndMin = (h * 60 + m) + duration;
          const endH = Math.floor(totalEndMin / 60) % 24;
          const endM = totalEndMin % 60;
          const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

          const createdApp = await addDoc(collection(db, 'appointments'), {
            tenantId,
            cliente_id: item.cliente_id || 'avulso',
            cliente_name: item.cliente_name || 'Consumidor Final',
            profissional_id: barber.uid,
            profissional_name: barber.nome,
            servico_id: item.servico_id || '',
            servico_name: item.servico_name || serviceObj?.nome || 'Atendimento (Fluxo)',
            date: selectedDate,
            startTime: formatTime,
            endTime: endTimeStr,
            status: 'em_atendimento',
            origin: 'ordem_chegada',
            daily_flow_id: item.id,
            price: serviceObj?.preco || (serviceObj as any)?.price || 0,
            duration,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await updateDoc(itemRef, { agendamento_id: createdApp.id });
        }
      } catch (agendaSyncErr) {
        console.warn("Could not sync daily flow call with agenda:", agendaSyncErr);
      }

      setAssignModalOpen(false);
      setSelectedFlowItem(null);
      toast.success(`Atendimento do cliente ${item.cliente_name} iniciado!`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao iniciar atendimento.");
    }
  };

  // Open Comanda modal for item
  const handleOpenItemComanda = (item: DailyFlowItem) => {
    const serviceObj = services.find(s => s.id === item.servico_id);
    const itemPrice = serviceObj?.preco || (serviceObj as any)?.price || 0;

    const existingComanda = comandas.find(c => 
      c.id === (item as any).comanda_id || 
      (c as any).daily_flow_id === item.id
    );

    if (existingComanda || (item as any).comanda_id) {
      setSelectedComandaId(existingComanda ? existingComanda.id : (item as any).comanda_id);
      setComandaInitialData(null);
    } else {
      setSelectedComandaId(undefined);
      setComandaInitialData({
        cliente_id: item.cliente_id || 'avulso',
        cliente_name: item.cliente_name || 'Consumidor Final',
        profissional_id: item.profissional_id || '',
        profissional_name: item.profissional_name || '',
        origin: 'balcao',
        daily_flow_id: item.id,
        agendamento_id: (item as any).agendamento_id || '',
        items: item.servico_id ? [{
          id: item.servico_id,
          referencia_id: item.servico_id,
          name: item.servico_name || serviceObj?.nome || 'Serviço',
          type: 'servico',
          price: itemPrice,
          unitPrice: itemPrice,
          quantity: 1,
          totalPrice: itemPrice,
          generateCommission: true,
          profissional_id: item.profissional_id || '',
          profissional_name: item.profissional_name || ''
        }] : []
      } as any);
    }
    setIsComandaModalOpen(true);
  };

  // Complete service
  const handleCompleteService = async (item: DailyFlowItem) => {
    try {
      const now = new Date();
      const formatTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const itemRef = doc(db, 'daily_flow', item.id);
      await updateDoc(itemRef, {
        status: 'completed',
        fim_hora: formatTime,
        data_conclusao: selectedDate,
        concluido_em_timestamp: serverTimestamp()
      });

      if (item.profissional_id) {
        const barberRef = doc(db, 'usuarios', item.profissional_id);
        const maxIndex = barbers.reduce((max, b) => {
          const idx = (b as any).rodizioIndex ?? 0;
          return idx > max ? idx : max;
        }, 0);

        await updateDoc(barberRef, { 
          rodizioStatus: 'disponivel',
          rodizioIndex: maxIndex + 1
        });
      }

      toast.success(`Atendimento de ${item.cliente_name} concluído com sucesso!`);
      handleOpenItemComanda(item);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao concluir atendimento.");
    }
  };

  // Delete flow item
  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm("Remover permanentemente este registro do fluxo?")) return;
    try {
      const itemRef = doc(db, 'daily_flow', itemId);
      await deleteDoc(itemRef);
      toast.success("Cliente removido do painel.");
    } catch (err) {
      console.error(err);
    }
  };

  // Filter columns
  const waitingList = filteredFlowItems.filter(i => i.status === 'waiting');
  const servingList = filteredFlowItems.filter(i => i.status === 'serving');
  const completedList = filteredFlowItems.filter(i => i.status === 'completed');

  return (
    <div className="space-y-6 pb-10">
      {/* Top Bar: Title + Date Navigator + TV Mode + Add Button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200/80 p-6 rounded-[2.5rem] shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Painel de Fluxo & Rodízio
            </h1>
            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-indigo-100">
              Operação em Tempo Real
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Gestão da fila de espera por ordem de chegada, rodízio sequencial e monitoramento de cadeiras.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <FlowDateNavigator
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />

          <button
            onClick={() => setIsTVModalOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            title="Abrir Painel de TV / Sala de Espera"
          >
            <Tv size={16} className="text-indigo-400" />
            <span className="hidden sm:inline">Modo Telão (TV)</span>
          </button>

          <button
            onClick={() => {
              setClientName('');
              setNewClientPhone('');
              setSelectedClientId('');
              setClientSearchTerm('');
              setClientSelectionType('sem_cadastro');
              setSelectedServiceId('');
              setPreferredBarberId('next');
              setShowModal(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-600/20 active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <Plus size={16} />
            <span>Adicionar na Fila</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs: Operação do Dia vs. Histórico de Filas Diárias */}
      <div className="flex items-center gap-2 border-b border-slate-200/80 pb-3">
        <button
          onClick={() => setFlowTab('operacao')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            flowTab === 'operacao'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
          }`}
        >
          <Scissors size={14} />
          <span>Operação do Dia</span>
        </button>

        <button
          onClick={() => setFlowTab('historico')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
            flowTab === 'historico'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
              : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
          }`}
        >
          <History size={14} />
          <span>Histórico de Filas Diárias</span>
        </button>
      </div>

      {flowTab === 'operacao' ? (
        <>
          {/* Operational Metrics Cards (KPIs) */}
          <FlowMetricsCards
            flowItems={filteredFlowItems}
            barbers={barbers}
            comandas={comandas}
            selectedDate={selectedDate}
          />

          {/* Main Grid: Barber Ranking & Rotation + 3 Kanban Columns */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* Left: Professional Ranking & Rotation (4 cols on XL) */}
            <div className="xl:col-span-4">
              <FlowBarberRanking
                barbers={barbers}
                flowItems={filteredFlowItems}
                comandas={comandas}
                selectedDate={selectedDate}
                onMoveBarber={handleMoveBarber}
                onChangeBarberStatus={handleChangeBarberStatus}
              />
            </div>

            {/* Right: The 3 Flow Kanban Columns (8 cols on XL) */}
            <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
              
              {/* Column 1: Aguardando (Fila de Espera) */}
              <div className="bg-white border border-slate-200/80 rounded-[2rem] p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Clock size={16} className="text-amber-500" />
                      Aguardando
                    </h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                      Recepção ({waitingList.length})
                    </p>
                  </div>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {waitingList.length}
                  </span>
                </div>

                <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
                  {waitingList.map((item, wIdx) => {
                    const waitMin = calculateWaitMinutes(item.chegada_hora);
                    const isUrgent = waitMin > 30;
                    const isModerate = waitMin > 15 && waitMin <= 30;
                    const isPriority = (item as any).priority;

                    return (
                      <div 
                        key={`wait-item-${item.id || wIdx}-${wIdx}`} 
                        className={`p-4 rounded-2xl border transition-all space-y-3 relative group ${
                          isPriority
                            ? 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-300/40'
                            : 'bg-slate-50/70 border-slate-200/70 hover:border-slate-300'
                        }`}
                      >
                        {/* Top Action Buttons (Prioritize, Desistência, Delete) */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                              {wIdx + 1}º
                            </span>
                            {isPriority && (
                              <span className="bg-amber-400 text-slate-950 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md">
                                Prioritário
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handlePrioritizeCustomer(item.id, isPriority)}
                              title={isPriority ? "Remover prioridade" : "Priorizar cliente na fila"}
                              className={`p-1 rounded-md transition-colors cursor-pointer ${
                                isPriority ? 'text-amber-600 bg-amber-100' : 'text-slate-400 hover:text-amber-600 hover:bg-slate-200'
                              }`}
                            >
                              <ArrowUpCircle size={13} />
                            </button>

                            <button
                              onClick={() => handleMarkDesistencia(item.id, item.cliente_name)}
                              title="Registrar desistência (No-Show)"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <UserMinus size={13} />
                            </button>

                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              title="Remover do fluxo"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div>
                          <h5 className="font-bold text-xs text-slate-900 truncate">{item.cliente_name}</h5>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{item.servico_name}</p>
                        </div>

                        {/* Wait Timer Badge with color alerting */}
                        <div className="flex items-center justify-between text-[10px] font-bold pt-2 border-t border-slate-200/60">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock size={11} className="text-slate-400" />
                            Chegou: {item.chegada_hora}
                          </span>
                          
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isUrgent 
                              ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' 
                              : isModerate 
                              ? 'bg-amber-50 text-amber-700 border-amber-200' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {waitMin}m de espera
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px]">
                          {item.profissional_name ? (
                            <span className="text-[9px] text-slate-600 font-bold max-w-[120px] truncate">
                              Prefere: <strong>{item.profissional_name}</strong>
                            </span>
                          ) : (
                            <span className="text-[8px] text-indigo-700 font-extrabold uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              RODÍZIO
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => { setSelectedFlowItem(item); setAssignModalOpen(true); }}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                        >
                          <Scissors size={12} /> Chamar para Cadeira
                        </button>
                      </div>
                    );
                  })}

                  {waitingList.length === 0 && (
                    <div className="text-center py-12 text-slate-400 italic text-xs">
                      Recepção vazia no momento.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Em Atendimento */}
              <div className="bg-white border border-slate-200/80 rounded-[2rem] p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <Scissors size={16} className="text-blue-600" />
                      Na Cadeira
                    </h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                      Em corte ({servingList.length})
                    </p>
                  </div>
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {servingList.length}
                  </span>
                </div>

                <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
                  {servingList.map((item, sIdx) => (
                    <div key={`serv-item-${item.id || sIdx}-${sIdx}`} className="p-4 bg-blue-50/30 border border-blue-100 rounded-2xl space-y-3">
                      <div>
                        <h5 className="font-bold text-xs text-slate-900 truncate">{item.cliente_name}</h5>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{item.servico_name}</p>
                      </div>

                      {/* Serving Barber Indicator */}
                      <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 shadow-xs">
                        <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                          {item.profissional_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[8px] text-slate-400 font-black uppercase leading-none">Barbeiro:</p>
                          <p className="text-[10px] font-black text-slate-800 truncate mt-0.5">{item.profissional_name}</p>
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
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/10 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                      >
                        <Check size={12} /> Finalizar & Cobrar
                      </button>
                    </div>
                  ))}

                  {servingList.length === 0 && (
                    <div className="text-center py-12 text-slate-400 italic text-xs">
                      Nenhuma cadeira ocupada no momento.
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3: Finalizados Hoje */}
              <div className="bg-white border border-slate-200/80 rounded-[2rem] p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600" />
                      Concluídos
                    </h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                      Finalizados ({completedList.length})
                    </p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                    {completedList.length}
                  </span>
                </div>

                <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
                  {completedList.map((item, cIdx) => {
                    const linkedComanda = comandas.find(c => 
                      c.id === (item as any).comanda_id || 
                      (c as any).daily_flow_id === item.id
                    );
                    const isPaid = linkedComanda?.status === 'fechada';
                    const isPending = linkedComanda?.status === 'aberta' || linkedComanda?.status === 'aguardando_pagamento';
                    const totalValue = linkedComanda ? (linkedComanda.totalAmount || linkedComanda.paidAmount || 0) : 0;
                    const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

                    return (
                      <div key={`comp-item-${item.id || cIdx}-${cIdx}`} className="p-4 bg-white border border-slate-200/80 rounded-2xl space-y-3 shadow-xs hover:border-slate-300 transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-slate-900 truncate">{item.cliente_name}</h5>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">{item.servico_name}</p>
                          </div>
                          {isPaid ? (
                            <div className="flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                              <CheckCircle2 size={11} className="text-emerald-600" />
                              <span>Pago</span>
                            </div>
                          ) : isPending ? (
                            <div className="flex items-center gap-1 text-[9px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                              <Clock size={11} className="text-amber-600" />
                              <span>Aberto</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                              <span>Sem Comanda</span>
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 font-semibold flex items-center justify-between pt-2 border-t border-slate-100">
                          <span>Barbeiro: <strong className="text-slate-700">{item.profissional_name}</strong></span>
                          <span>{item.fim_hora ? `Fim: ${item.fim_hora}` : ''}</span>
                        </div>

                        {linkedComanda && (
                          <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-xl text-[10px] font-mono">
                            <span className="text-slate-500 font-bold">Comanda #{linkedComanda.number}</span>
                            <span className="font-extrabold text-slate-900">{formatMoney(totalValue)}</span>
                          </div>
                        )}

                        <button
                          onClick={() => handleOpenItemComanda(item)}
                          className={`w-full text-[10px] font-black uppercase tracking-wider py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 ${
                            isPaid
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              : isPending
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                              : 'bg-primary hover:bg-slate-800 text-white shadow-sm'
                          }`}
                        >
                          <Receipt size={13} />
                          <span>{isPaid ? 'Ver Comanda' : isPending ? 'Receber Comanda' : 'Abrir Comanda'}</span>
                        </button>
                      </div>
                    );
                  })}

                  {completedList.length === 0 && (
                    <div className="text-center py-12 text-slate-400 italic text-xs">
                      Nenhum serviço finalizado ainda.
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        </>
      ) : (
        /* Historical Queue Table */
        <FlowHistoryTable
          flowItems={rawFlowItems}
          barbers={barbers}
          comandas={comandas}
          onSelectDayForInspection={(date) => setInspectedDate(date)}
          onOpenInOperational={(date) => {
            setSelectedDate(date);
            setFlowTab('operacao');
          }}
        />
      )}

      {/* FLOW DAY DETAILS MODAL (RAY-X / EYE INSPECTOR) */}
      <FlowDayDetailsModal
        isOpen={inspectedDate !== null}
        onClose={() => setInspectedDate(null)}
        date={inspectedDate || ''}
        items={rawFlowItems.filter(item => extractFlowItemDate(item) === inspectedDate)}
        barbers={barbers}
        comandas={comandas}
        onOpenInOperational={(date) => {
          setSelectedDate(date);
          setFlowTab('operacao');
          setInspectedDate(null);
        }}
        onOpenComanda={(item) => handleOpenItemComanda(item)}
      />

      {/* FULLSCREEN TV MODE MODAL */}
      <FlowTVModal
        isOpen={isTVModalOpen}
        onClose={() => setIsTVModalOpen(false)}
        flowItems={filteredFlowItems}
        barbers={barbers}
      />

      {/* MODAL: ADD CUSTOMER TO WAITLIST */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Adicionar ao Fluxo</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Defina a forma de identificação do cliente</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="p-2 bg-white hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors border border-slate-100 shadow-sm cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs Selector */}
              <div className="px-8 pt-6">
                <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setClientSelectionType('sem_cadastro');
                      setClientName('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                      clientSelectionType === 'sem_cadastro'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <UserX size={14} />
                    <span className="text-[10px] sm:text-xs">Sem Cadastro</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setClientSelectionType('cadastrado');
                      setSelectedClientId('');
                      setClientSearchTerm('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                      clientSelectionType === 'cadastrado'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <UserCheck size={14} />
                    <span className="text-[10px] sm:text-xs">Cadastrado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setClientSelectionType('novo_cadastro');
                      setClientName('');
                      setNewClientPhone('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                      clientSelectionType === 'novo_cadastro'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Plus size={14} />
                    <span className="text-[10px] sm:text-xs">Criar Novo</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddToWaitlist} className="p-8 space-y-5 overflow-y-auto flex-1">
                {clientSelectionType === 'sem_cadastro' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome do Cliente Walk-In</label>
                    <input 
                      required 
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Ex: João Silva (Avulso)" 
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-inner" 
                    />
                  </div>
                )}

                {clientSelectionType === 'cadastrado' && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Buscar Cliente Cadastrado</label>
                    <div className="relative">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text"
                        value={clientSearchTerm}
                        onChange={(e) => setClientSearchTerm(e.target.value)}
                        placeholder="Pesquisar por nome ou celular..." 
                        className="w-full pl-11 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-inner" 
                      />
                    </div>

                    <div className="border border-slate-100 rounded-2xl max-h-40 overflow-y-auto bg-slate-50/50 p-2 space-y-1">
                      {registeredClients
                        .filter(c => 
                          c.nome.toLowerCase().includes(clientSearchTerm.toLowerCase()) || 
                          (c.telefone || '').includes(clientSearchTerm) ||
                          (c.phone || '').includes(clientSearchTerm)
                        )
                        .slice(0, 10)
                        .map((client, clIdx) => (
                          <button
                            key={`reg-client-${client.uid || client.id || clIdx}-${clIdx}`}
                            type="button"
                            onClick={() => {
                              setSelectedClientId(client.uid);
                              setClientSearchTerm(client.nome);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                              selectedClientId === client.uid
                                ? 'bg-indigo-600 text-white'
                                : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{client.nome}</span>
                            <span className={`text-[10px] ${selectedClientId === client.uid ? 'text-indigo-200' : 'text-slate-400'}`}>
                              {client.telefone || client.phone || 'Sem celular'}
                            </span>
                          </button>
                        ))}
                      {registeredClients.filter(c => 
                        c.nome.toLowerCase().includes(clientSearchTerm.toLowerCase()) || 
                        (c.telefone || '').includes(clientSearchTerm)
                      ).length === 0 && (
                        <p className="text-center py-4 text-xs text-slate-400 italic">Nenhum cliente encontrado</p>
                      )}
                    </div>
                  </div>
                )}

                {clientSelectionType === 'novo_cadastro' && (
                  <div className="space-y-4 bg-slate-50/50 p-5 rounded-3xl border border-slate-100">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                      <input 
                        required 
                        type="text"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Ex: Pedro Henrique" 
                        className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-sm" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Telefone (Celular)</label>
                      <input 
                        type="tel"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                        placeholder="Ex: (11) 99999-9999" 
                        className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 shadow-sm" 
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Serviço Pretendido</label>
                  <select 
                    required 
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 appearance-none shadow-inner"
                  >
                    <option value="">Selecione o serviço...</option>
                    {services.map((s, sIdx) => <option key={`op-svc-opt-${s.id || sIdx}-${sIdx}`} value={s.id}>{s.nome || s.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Barbeiro Preferido</label>
                  <select 
                    value={preferredBarberId}
                    onChange={(e) => setPreferredBarberId(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 appearance-none shadow-inner"
                  >
                    <option value="next">Próximo do Rodízio (Recomendado)</option>
                    {barbers.map((b, bIdx) => <option key={`op-barber-opt-${b.uid || bIdx}-${bIdx}`} value={b.uid}>{b.nome}</option>)}
                  </select>
                </div>

                <div className="flex gap-4 pt-4 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)} 
                    className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95 cursor-pointer"
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
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Chamar Atendimento</h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">Cliente: {selectedFlowItem.cliente_name}</p>
                </div>
                <button onClick={() => setAssignModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors border border-slate-100 shadow-sm cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-1">Selecione o Barbeiro</label>
                  <div className="space-y-2">
                    {barbers.map((b, i) => {
                      const isFirstDisponivel = barbers.slice(0, i).every(prev => (prev as any).rodizioStatus !== 'disponivel') && (b as any).rodizioStatus === 'disponivel';
                      const status = (b as any).rodizioStatus || 'disponivel';

                      return (
                        <button
                          key={`modal-barber-${b.uid || b.id || i}-${i}`}
                          onClick={() => handleCallClient(selectedFlowItem, b.uid)}
                          className="w-full p-4 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-2xl flex items-center justify-between transition-all active:scale-95 cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center">
                              {b.nome.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="font-bold text-xs text-slate-800">{b.nome}</span>
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

                <div className="pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => setAssignModalOpen(false)} 
                    className="w-full py-4 border border-slate-200 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* COMANDA CHECKOUT MODAL */}
      {isComandaModalOpen && (
        <ComandaModal
          comanda_id={selectedComandaId}
          initialData={comandaInitialData || undefined}
          onClose={() => {
            setIsComandaModalOpen(false);
            setSelectedComandaId(undefined);
            setComandaInitialData(null);
          }}
          onSave={() => {
            setIsComandaModalOpen(false);
            setSelectedComandaId(undefined);
            setComandaInitialData(null);
            if (tenantId) {
              comandaService.syncAgendaWithClosedComandas(tenantId);
            }
          }}
        />
      )}

    </div>
  );
}
