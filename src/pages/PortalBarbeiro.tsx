import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar, 
  Users, 
  DollarSign, 
  Package, 
  User, 
  LogOut, 
  Search, 
  Phone, 
  Clock, 
  TrendingUp, 
  CheckCircle2, 
  Play, 
  XCircle, 
  Target, 
  Edit3, 
  Save, 
  Plus, 
  ChevronRight, 
  AlertTriangle, 
  Scissors,
  Check,
  AlertCircle,
  Lock,
  Unlock,
  Trash2,
  ArrowRightLeft,
  Loader2,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  ChevronDown,
  Star,
  Camera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { getActiveTenantId } from '../services/tenantService';
import { appointmentService } from '../services/appointmentService';
import { commissionService } from '../services/commissionService';
import { inventoryService } from '../services/inventoryService';
import { agendaBlockService } from '../services/agendaBlockService';
import { teamGoalService, TeamGoal } from '../services/teamGoalService';
import { subscriptionService } from '../services/subscriptionService';
import { calculateProfessionalLedger } from '../services/ledgerService';
import { AppointmentModal } from '../components/Agenda/AppointmentModal';
import { ComandaModal } from '../components/Comanda/ComandaModal';
import { AgendaGeneral } from '../components/Agenda/AgendaGeneral';
import { ImageCropModal } from '../components/ImageCropModal';
import { NotificationBell } from '../components/NotificationBell';
import { UserProfile, Appointment, Product, Commission, AppointmentStatus, AgendaBlock, ProfessionalAdvance, ProfessionalPayment } from '../types';
import { toast } from 'sonner';
import { format, parse, addDays, startOfDay, endOfDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PortalBarbeiroProps {
  profile: UserProfile;
}

export function PortalBarbeiro({ profile }: PortalBarbeiroProps) {
  const [activeTab, setActiveTab] = useState<'agenda' | 'clientes' | 'comissao' | 'estoque' | 'perfil' | 'avaliacoes'>('agenda');
  
  // Real-time synced profile state
  const [currentProfile, setCurrentProfile] = useState<UserProfile>(profile);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile document with Firestore in real-time
  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = onSnapshot(doc(db, 'usuarios', profile.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentProfile({
          uid: snap.id,
          ...data,
          fotoUrl: data.fotoUrl || data.avatarUrl || data.photoURL || '',
          avatarUrl: data.avatarUrl || data.fotoUrl || data.photoURL || ''
        } as UserProfile);
      }
    }, (error) => {
      console.warn("Snapshot notice on PortalBarbeiro usuarios listener:", error?.message || error);
    });
    return () => unsub();
  }, [profile?.uid]);

  const handleFotoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
    if (!isJpeg) {
      toast.error('Por favor, selecione uma imagem no formato JPEG/JPG.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setTempImageSrc(event.target.result as string);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveCroppedPhoto = async (croppedBase64: string) => {
    setIsCropModalOpen(false);
    setIsSavingPhoto(true);
    try {
      await updateDoc(doc(db, 'usuarios', profile.uid), {
        fotoUrl: croppedBase64,
        avatarUrl: croppedBase64,
        photoURL: croppedBase64,
        updatedAt: serverTimestamp()
      });
      setCurrentProfile(prev => ({
        ...prev,
        fotoUrl: croppedBase64,
        avatarUrl: croppedBase64,
        photoURL: croppedBase64
      }));
      toast.success("Foto de perfil atualizada e sincronizada com sucesso!");
    } catch (err) {
      console.error("Erro ao atualizar foto do barbeiro:", err);
      toast.error("Erro ao salvar foto de perfil.");
    } finally {
      setIsSavingPhoto(false);
    }
  };
  
  // Tab states: Agenda
  const { isSaaSAdminUser, setOverrideRole } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);

  // New Modals State for Barber manual control
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [isManualComandaOpen, setIsManualComandaOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ time: string, profissional_id: string } | null>(null);

  const comandaInitialData = React.useMemo(() => {
    if (!selectedAppointment) return undefined;
    return {
      agendamento_id: selectedAppointment.id,
      cliente_id: selectedAppointment.cliente_id,
      cliente_name: selectedAppointment.cliente_name,
      profissional_id: selectedAppointment.profissional_id,
      profissional_name: selectedAppointment.profissional_name,
      observations: selectedAppointment.notes,
      items: [{
        id: `item-${selectedAppointment.id}-${Date.now()}`,
        type: 'servico' as const,
        referencia_id: selectedAppointment.servico_id,
        name: selectedAppointment.servico_name,
        quantity: 1,
        unitPrice: selectedAppointment.price,
        totalPrice: selectedAppointment.price,
        profissional_id: selectedAppointment.profissional_id,
        profissional_name: selectedAppointment.profissional_name,
        isCortesia: false,
        generateCommission: true
      }]
    };
  }, [selectedAppointment]);
  
  // Tab states: Agenda Blocks
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockStartTime, setBlockStartTime] = useState('09:00');
  const [blockEndTime, setBlockEndTime] = useState('10:00');
  const [blockReason, setBlockReason] = useState('');
  
  // Tab states: Clientes
  const [clientes, setClientes] = useState<UserProfile[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  
  // Tab states: Comissão
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [advances, setAdvances] = useState<ProfessionalAdvance[]>([]);
  const [payouts, setPayouts] = useState<ProfessionalPayment[]>([]);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendente' | 'pago'>('todos');
  const [typeFilter, setTypeFilter] = useState<'todos' | 'comissao' | 'vale'>('todos');
  const [loadingCommissions, setLoadingCommissions] = useState(true);
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [personalDailyGoal, setPersonalDailyGoal] = useState<number>(() => {
    const saved = localStorage.getItem(`barber_daily_goal_${profile.uid}`);
    return saved ? parseInt(saved, 10) : 5; // Default 5 clients
  });
  const [personalMonthlyGoal, setPersonalMonthlyGoal] = useState<number>(() => {
    const saved = localStorage.getItem(`barber_monthly_goal_${profile.uid}`);
    return saved ? parseFloat(saved) : 2500; // Default R$ 2500 in commissions
  });
  const [newDailyGoal, setNewDailyGoal] = useState<string>('');
  const [newMonthlyGoal, setNewMonthlyGoal] = useState<string>('');

  // Tab states: Estoque
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Horizontal date-strip list centered around selectedDate
  const dateStrip = React.useMemo(() => {
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      const d = addDays(selectedDate, i);
      dates.push({
        iso: format(d, 'yyyy-MM-dd'),
        dayName: format(d, 'EEE', { locale: ptBR }).replace('.', ''),
        dayNum: format(d, 'd'),
        label: format(d, "dd 'de' MMMM", { locale: ptBR }),
        isToday: isToday(d)
      });
    }
    return dates;
  }, [selectedDate]);

  // 1. Listen to Appointments
  useEffect(() => {
    setLoadingAppointments(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const unsubscribe = appointmentService.subscribeToAppointments(
      { date: dateStr, profissional_id: profile.uid },
      (data) => {
        setAppointments(data);
        setLoadingAppointments(false);
      }
    );
    return () => unsubscribe();
  }, [selectedDate, profile.uid]);

  // 1.1. Listen to Agenda Blocks
  useEffect(() => {
    setLoadingBlocks(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const unsubscribe = agendaBlockService.subscribeToBlocks(
      { date: dateStr, profissional_id: profile.uid },
      (data) => {
        setBlocks(data);
        setLoadingBlocks(false);
      }
    );
    return () => unsubscribe();
  }, [selectedDate, profile.uid]);

  // 2. Subscribe to all Clients at mount
  useEffect(() => {
    const unsubscribe = userService.subscribeToAllClients(true, (data) => {
      setClientes(data);
    });
    subscriptionService.getAllSubscriptionsSystem().then(setSubscriptions).catch(() => {});
    return () => unsubscribe();
  }, []);

  // 3. Fetch Commissions and Financial Data in real-time
  useEffect(() => {
    if (profile?.uid) {
      setLoadingCommissions(true);
      const proTenant = profile.tenantId || getActiveTenantId();

      const refreshAllFinancial = async () => {
        try {
          await commissionService.fixLuizMiguelAndOtherProfessionalsCommissions(proTenant);
          const [commsData, advsData, payoutsData] = await Promise.all([
            commissionService.getCommissions({ profissional_id: profile.uid, tenantId: proTenant }),
            commissionService.getAdvances({ profissional_id: profile.uid, profissional_name: profile.nome, tenantId: proTenant }),
            commissionService.getPayouts(profile.uid, proTenant)
          ]);
          setCommissions(commsData);
          console.log("=== DEBUG LUIZ MIGUEL COMMISSIONS (TODAY 2026-09-05) ===", commsData.filter(c => (c.date || '').includes('2026-09-05')).map(c => ({
            id: c.id,
            cliente: c.cliente_name,
            servico: c.servico_name,
            valor: c.commission_value,
            data: c.date,
            status: c.status,
            createdAt: c.createdAt
          })));
          setAdvances(advsData);
          setPayouts(payoutsData);
        } catch (e) {
          console.warn("Error refreshing financial data in PortalBarbeiro:", e);
        } finally {
          setLoadingCommissions(false);
        }
      };

      refreshAllFinancial();

      // Realtime listeners for commissions, comandas, advances, accounts payable, cash movements
      const qComms = query(collection(db, 'commissions'), where('profissional_id', '==', profile.uid));
      const unsubComms = onSnapshot(qComms, () => { refreshAllFinancial(); }, (e) => console.warn(e));

      const qComandas = query(collection(db, 'comandas'));
      const unsubComandas = onSnapshot(qComandas, () => { refreshAllFinancial(); }, (e) => console.warn(e));

      const qAdvs = query(collection(db, 'professional_advances'), where('profissional_id', '==', profile.uid));
      const unsubAdvs = onSnapshot(qAdvs, () => { refreshAllFinancial(); }, (e) => console.warn(e));

      const qPay = query(collection(db, 'accounts_payable'), where('profissional_id', '==', profile.uid));
      const unsubPay = onSnapshot(qPay, () => { refreshAllFinancial(); }, (e) => console.warn(e));

      const qCash = query(collection(db, 'cash_movements'));
      const unsubCash = onSnapshot(qCash, () => { refreshAllFinancial(); }, (e) => console.warn(e));

      return () => {
        unsubComms();
        unsubComandas();
        unsubAdvs();
        unsubPay();
        unsubCash();
      };
    }
  }, [profile?.uid, profile?.tenantId, profile?.nome]);

  // Tab states: Avaliações
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Subscribe to reviews in real-time
  useEffect(() => {
    if (!profile?.uid) return;
    setLoadingReviews(true);
    const q = query(
      collection(db, 'avaliacoes'),
      where('profissional_id', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const loadedReviews = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort reviews newest first
      const sorted = loadedReviews.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setReviews(sorted);
      setLoadingReviews(false);
    }, (err) => {
      console.error("Error loading reviews:", err);
      setLoadingReviews(false);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  const [assignedTeamGoals, setAssignedTeamGoals] = useState<TeamGoal[]>([]);

  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = teamGoalService.subscribeToGoals((goals) => {
      const mine = goals.filter(g => !g.profissional_id || g.profissional_id === profile.uid);
      setAssignedTeamGoals(mine);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // 4. Fetch Products when entering Estoque tab
  useEffect(() => {
    if (activeTab === 'estoque') {
      setLoadingProducts(true);
      inventoryService.getProducts()
        .then(data => {
          setProducts(data);
          setLoadingProducts(false);
        })
        .catch(err => {
          console.error(err);
          toast.error('Erro ao carregar estoque de produtos.');
          setLoadingProducts(false);
        });
    }
  }, [activeTab]);

  // Update appointment status
  const handleUpdateStatus = async (appointmentId: string, newStatus: AppointmentStatus) => {
    try {
      await appointmentService.updateAppointment(appointmentId, { status: newStatus });
      toast.success(`Status atualizado para ${newStatus.replace('_', ' ')}!`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao atualizar status: ${err.message || err}`);
    }
  };

  // Create a block
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockStartTime >= blockEndTime) {
      toast.error('O horário de término deve ser posterior ao horário de início.');
      return;
    }

    try {
      await agendaBlockService.createBlock({
        profissional_id: profile.uid,
        profissional_name: profile.nome,
        date: format(selectedDate, 'yyyy-MM-dd'),
        startTime: blockStartTime,
        endTime: blockEndTime,
        reason: blockReason.trim() || 'Bloqueio de agenda',
        isGeneral: false
      });
      toast.success('Horário bloqueado com sucesso!');
      setIsBlockModalOpen(false);
      setBlockReason('');
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao bloquear horário: ${err.message || err}`);
    }
  };

  // Delete/unblock a time
  const handleUnblockTime = async (blockId: string) => {
    try {
      await agendaBlockService.deleteBlock(blockId);
      toast.success('Horário desbloqueado com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao desbloquear horário: ${err.message || err}`);
    }
  };

  const handleNewAppointment = (time?: string, profissional_id?: string) => {
    setSelectedTimeSlot(time && profissional_id ? { time, profissional_id } : { time: '09:00', profissional_id: profile.uid });
    setSelectedAppointment(null);
    setIsAppointmentModalOpen(true);
  };

  const handleOpenAppointment = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsAppointmentModalOpen(true);
  };

  const handleOpenComanda = (app: Appointment) => {
    setSelectedAppointment(app);
    setIsComandaModalOpen(true);
  };

  // Save personal goals
  const handleSaveGoals = (e: React.FormEvent) => {
    e.preventDefault();
    const daily = parseInt(newDailyGoal, 10);
    const monthly = parseFloat(newMonthlyGoal);
    
    if (isNaN(daily) || daily <= 0) {
      toast.error('Por favor, informe uma meta diária válida maior que zero.');
      return;
    }
    if (isNaN(monthly) || monthly <= 0) {
      toast.error('Por favor, informe uma meta mensal válida maior que zero.');
      return;
    }

    setPersonalDailyGoal(daily);
    setPersonalMonthlyGoal(monthly);
    localStorage.setItem(`barber_daily_goal_${profile.uid}`, daily.toString());
    localStorage.setItem(`barber_monthly_goal_${profile.uid}`, monthly.toString());
    setIsEditingGoal(false);
    toast.success('Metas de estímulo pessoal salvas com sucesso!');
  };

  // Filter clients
  const filteredClientes = clientes.filter(c => {
    const term = clientSearchTerm.toLowerCase();
    return c.nome.toLowerCase().includes(term) || 
           (c.telefone && c.telefone.includes(term)) ||
           (c.email && c.email.toLowerCase().includes(term));
  });

  // Filter products
  const filteredProducts = products.filter(p => {
    const term = productSearchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || 
           (p.categoryName && p.categoryName.toLowerCase().includes(term));
  });

  // Calculate statistics for Commission tab using unified ledger engine
  const ledger = React.useMemo(() => {
    const currentBarberProfile: UserProfile = {
      uid: profile.uid,
      nome: profile.nome || 'Barbeiro',
      email: profile.email,
      tipo: 'barbeiro',
      ativo: true,
      saldo_atual: 0,
      total_gasto: 0,
      total_pago: 0,
      percentual_comissao: profile.percentual_comissao,
      commission_percentage: profile.commission_percentage
    } as UserProfile;
    const currentMonthStr = format(selectedDate, 'yyyy-MM');
    return calculateProfessionalLedger(currentBarberProfile, commissions, advances, currentMonthStr);
  }, [profile, commissions, advances, selectedDate]);

  const stats = React.useMemo(() => {
    // 1. Pending commission (Comissão pendente bruta menos vales pendentes)
    const toReceiveCommissions = ledger.comissaoPendenteBruta;
    const pendingAdvances = ledger.valesPendentes;
    const toReceive = ledger.saldoPendenteLiquido;

    // 2. Customers served today
    const servedTodayCount = appointments
      .filter(app => app.status === 'concluído')
      .length;

    // 3. This month's total generated commission
    const receivedThisMonth = ledger.comissaoGeradaMes;

    return {
      toReceiveCommissions,
      pendingAdvances,
      toReceive,
      servedTodayCount,
      receivedThisMonth
    };
  }, [ledger, appointments]);

  // Filtered commissions and advances based on the selected date range and status/type filters
  const filteredCommissions = React.useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return commissions.filter(c => {
      const cDate = (c.date || '').split('T')[0];
      
      // Rule: Subscription commissions only enter the active extract and count when they have matured (cDate <= todayStr)
      const isSubscriptionComm = c.commission_type === 'assinatura' || c.servico_name?.toLowerCase().includes('assinatura') || c.servico_name?.toLowerCase().includes('pote') || c.servico_name?.toLowerCase().includes('rateio assinatura');
      if (isSubscriptionComm && cDate > todayStr) {
        return false;
      }

      // Date filter
      if (startDate && cDate < startDate) return false;
      if (endDate && cDate > endDate) return false;
      // Status filter
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      return true;
    });
  }, [commissions, startDate, endDate, statusFilter]);

  const filteredAdvances = React.useMemo(() => {
    return advances.filter(a => {
      const aDate = (a.date || '').split('T')[0];
      // Date filter
      if (startDate && aDate < startDate) return false;
      if (endDate && aDate > endDate) return false;
      // Status filter
      if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
      return true;
    });
  }, [advances, startDate, endDate, statusFilter]);

  // Combined and sorted transactions list for the detailed statement
  const transactionsList = React.useMemo(() => {
    const list: Array<
      | { type: 'comissao'; id: string; date: string; title: string; clientName?: string; value: number; status: string; commissionType?: string }
      | { type: 'vale'; id: string; date: string; title: string; description: string; value: number; status: string }
    > = [];

    if (typeFilter === 'todos' || typeFilter === 'comissao') {
      const regularComms = filteredCommissions.filter(c => c.commission_type !== 'assinatura' && !c.servico_name?.toLowerCase().includes('assinatura') && !c.servico_name?.toLowerCase().includes('pote'));
      const subscriptionComms = filteredCommissions.filter(c => c.commission_type === 'assinatura' || c.servico_name?.toLowerCase().includes('assinatura') || c.servico_name?.toLowerCase().includes('pote'));

      regularComms.forEach(c => {
        list.push({
          type: 'comissao',
          id: c.id,
          date: c.date,
          title: c.servico_name || 'Comissão de Atendimento',
          clientName: c.cliente_name || 'Cliente Avulso',
          value: c.commission_value || c.amount || 0,
          status: c.status || 'pendente',
          commissionType: c.commission_type
        });
      });

      const subCommsByDate: Record<string, typeof subscriptionComms> = {};
      subscriptionComms.forEach(c => {
        const d = c.date || format(new Date(), 'yyyy-MM-dd');
        if (!subCommsByDate[d]) subCommsByDate[d] = [];
        subCommsByDate[d].push(c);
      });

      Object.entries(subCommsByDate).forEach(([date, comms]) => {
        const totalVal = comms.reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
        const hasPending = comms.some(c => c.status === 'pendente');
        list.push({
          type: 'comissao',
          id: `sub_group_${date}`,
          date: date,
          title: 'Comissão do Pote de Assinaturas',
          clientName: `${comms.length} assinatura(s) agrupada(s)`,
          value: totalVal,
          status: hasPending ? 'pendente' : 'pago',
          commissionType: 'assinatura'
        });
      });
    }

    if (typeFilter === 'todos' || typeFilter === 'vale') {
      filteredAdvances.forEach(a => {
        list.push({
          type: 'vale',
          id: a.id,
          date: a.date,
          title: 'Retirada / Vale',
          description: a.description || 'Adiantamento',
          value: a.amount || 0,
          status: a.status || 'pendente'
        });
      });
    }

    // Sort transactions by date descending, then by value/id
    return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [filteredCommissions, filteredAdvances, typeFilter]);

  // Summaries based strictly on the selected filters
  const periodStats = React.useMemo(() => {
    const totalComissoesGeradas = filteredCommissions.reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    const totalComissoesPagas = filteredCommissions.filter(c => c.status === 'pago').reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    const totalComissoesPendentes = filteredCommissions.filter(c => c.status === 'pendente').reduce((sum, c) => sum + (c.commission_value || c.amount || 0), 0);
    
    const totalVales = filteredAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalValesPagos = filteredAdvances.filter(a => a.status === 'pago').reduce((sum, a) => sum + (a.amount || 0), 0);
    const totalValesPendentes = filteredAdvances.filter(a => a.status !== 'pago').reduce((sum, a) => sum + (a.amount || 0), 0);

    const saldoLiquidoPeriodo = totalComissoesGeradas - totalVales;

    return {
      totalComissoesGeradas,
      totalComissoesPagas,
      totalComissoesPendentes,
      totalVales,
      totalValesPagos,
      totalValesPendentes,
      saldoLiquidoPeriodo
    };
  }, [filteredCommissions, filteredAdvances]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('Desconectado com sucesso.');
    } catch (err) {
      toast.error('Erro ao sair.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* Superadmin Mode Banner */}
      {isSaaSAdminUser && (
        <div className="bg-indigo-600 text-white px-4 py-2 text-xs font-black flex items-center justify-between shadow-md z-30">
          <div className="flex items-center gap-2">
            <span>Simulação de Perfil (Portal do Barbeiro)</span>
          </div>
          <button
            onClick={() => setOverrideRole(null)}
            className="bg-white text-indigo-950 hover:bg-slate-100 px-3 py-1 rounded-lg text-[10px] uppercase font-extrabold tracking-wider transition-all"
          >
            🚀 Voltar ao Painel SaaS
          </button>
        </div>
      )}

      {/* Header Banner */}
      <header className="bg-slate-900 text-white pt-6 pb-12 px-4 shadow-md rounded-b-[2rem] relative shrink-0 z-30">
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 opacity-95 rounded-b-[2rem] overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl" />
          <div className="absolute top-1/2 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-xl" />
        </div>

        <div className="max-w-md mx-auto flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-12 h-12 rounded-2xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black text-xl shadow-inner uppercase overflow-hidden relative group cursor-pointer"
              title="Toque para alterar foto de perfil"
            >
              {currentProfile.fotoUrl || currentProfile.avatarUrl ? (
                <img 
                  src={currentProfile.fotoUrl || currentProfile.avatarUrl} 
                  alt={currentProfile.nome} 
                  className="w-full h-full object-cover"
                />
              ) : (
                currentProfile.nome.substring(0, 2)
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera size={14} />
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-widest text-indigo-300">Painel do Barbeiro</p>
              <h2 className="text-lg font-black tracking-tight">{currentProfile.nome}</h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button 
              onClick={handleLogout}
              className="p-2.5 bg-slate-800/80 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-xl transition border border-slate-700/50"
              title="Sair do Sistema"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full mx-auto px-4 -mt-6 relative z-10 max-w-4xl pb-24">
        
        {/* AGENDA TAB */}
        {activeTab === 'agenda' && (
          <div className="space-y-4">
            
            {/* Horizontal date selection bar */}
            <div className="bg-white border border-slate-200/80 p-4 rounded-3xl shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-indigo-600" />
                  <span className="text-xs font-black uppercase text-slate-400 tracking-wider">
                    Visualizar Escala
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  {!isToday(selectedDate) && (
                    <button
                      onClick={() => setSelectedDate(new Date())}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-indigo-100 transition active:scale-95"
                    >
                      Hoje
                    </button>
                  )}
                  
                  <span className="text-xs font-black text-indigo-600">
                    {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                  </span>

                  <div className="relative">
                    <input
                      type="date"
                      value={format(selectedDate, 'yyyy-MM-dd')}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDate(parse(e.target.value, 'yyyy-MM-dd', new Date()));
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    />
                    <button className="bg-slate-50 hover:bg-slate-100 text-slate-600 p-1.5 rounded-lg border border-slate-200 transition flex items-center justify-center">
                      <Calendar size={14} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 pr-2">
                {dateStrip.map((d, dIdx) => {
                  const isSelected = d.iso === format(selectedDate, 'yyyy-MM-dd');
                  return (
                    <button
                       key={`barber-date-strip-${d.iso || dIdx}-${dIdx}`}
                       onClick={() => setSelectedDate(parse(d.iso, 'yyyy-MM-dd', new Date()))}
                       className={`flex flex-col items-center justify-center min-w-[50px] h-[64px] rounded-2xl transition border ${
                        isSelected 
                          ? 'bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-950/25 scale-105' 
                          : d.isToday
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-extrabold'
                            : 'bg-slate-50 border-slate-200/70 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[9px] uppercase font-bold tracking-wider leading-none mb-1.5">
                        {d.dayName}
                      </span>
                      <span className="text-base font-black leading-none">
                        {d.dayNum}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Today Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">
                  {stats.servedTodayCount}
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Atendidos Hoje</p>
                  <p className="text-xs font-black text-slate-700">De {appointments.length} agendados</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <DollarSign size={16} />
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Comissão Pendente</p>
                  <p className="text-xs font-black text-slate-700">R$ {stats.toReceive.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Agenda Hourly Grid */}
            <div className="bg-white border border-slate-200/80 p-1.5 rounded-3xl shadow-sm overflow-hidden">
              <AgendaGeneral
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                barbers={[profile]}
                appointments={appointments}
                clients={clientes}
                subscriptions={subscriptions}
                blocks={blocks}
                onNewAppointment={handleNewAppointment}
                onOpenAppointment={handleOpenAppointment}
                onOpenComanda={handleOpenComanda}
                loading={loadingAppointments || loadingBlocks}
              />
            </div>

          </div>
        )}

        {/* CLIENTES TAB */}
        {activeTab === 'clientes' && (
          <div className="space-y-4">
            
            {/* Search client input */}
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-3xl shadow-sm space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Users size={13} className="text-indigo-600" />
                Listagem de Clientes
              </span>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, tel ou email..."
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* Clients display */}
            <div className="space-y-3">
              {loadingClientes ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Acessando cadastro de clientes...</p>
                </div>
              ) : filteredClientes.length === 0 ? (
                <div className="bg-white border rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Users className="text-slate-300 w-10 h-10" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Nenhum cliente</h4>
                  <p className="text-slate-400 text-[11px] max-w-xs font-semibold leading-relaxed">
                    Nenhum resultado corresponde à sua pesquisa. Tente digitar outros termos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredClientes.map((cliente, cIdx) => (
                    <div 
                      key={`cli-item-${cliente.uid || cIdx}-${cIdx}`}
                      className="bg-white border border-slate-200/80 p-4 rounded-3xl shadow-sm flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-black text-slate-800 leading-snug">
                            {cliente.nome}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {cliente.email}
                          </p>
                        </div>
                        
                        {cliente.telefone && (
                          <a
                            href={`https://wa.me/55${cliente.telefone.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl transition"
                          >
                            <Phone size={11} />
                            WhatsApp
                          </a>
                        )}
                      </div>

                      {/* Observations / Preferences */}
                      {(cliente.observacoes || cliente.preferences) && (
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-[10px] font-semibold text-slate-500">
                          <span className="font-black text-slate-600 uppercase text-[8px] tracking-wider block mb-1">Dicas & Preferências de Estilo</span>
                          {cliente.observacoes || cliente.preferences}
                        </div>
                      )}

                      {/* Basic details */}
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-2 border-t border-slate-100/50">
                        <span>Total de visitas: <span className="text-slate-600 font-black">{cliente.appointmentsCount || 0}</span></span>
                        <span>Última visita: <span className="text-slate-600 font-black">{cliente.lastVisit ? new Date(cliente.lastVisit + 'T12:00:00').toLocaleDateString('pt-BR') : 'Primeira vez'}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMISSÃO TAB */}
        {activeTab === 'comissao' && (
          <div className="space-y-4">
            
            {/* AUDITORIA DE COMISSÕES DE HOJE (05/09/2026) */}
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl text-xs space-y-2">
              <div className="font-black text-amber-900 uppercase tracking-wide flex items-center justify-between">
                <span>🔍 Auditoria de Comissões de Hoje (05/09/2026)</span>
                <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                  {commissions.filter(c => (c.date || '').includes('2026-09-05')).length} registros
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {commissions.filter(c => (c.date || '').includes('2026-09-05')).length === 0 ? (
                  <p className="text-amber-700 italic">Nenhuma comissão registrada para hoje (05/09/2026).</p>
                ) : (
                  commissions.filter(c => (c.date || '').includes('2026-09-05')).map((c, i) => {
                    let timeStr = 'Hora não informada';
                    if (c.createdAt) {
                      const sec = c.createdAt.seconds || (typeof c.createdAt === 'number' ? c.createdAt / 1000 : 0);
                      if (sec) {
                        timeStr = new Date(sec * 1000).toLocaleTimeString('pt-BR');
                      }
                    }
                    return (
                      <div key={c.id || i} className="bg-white/90 p-2.5 rounded-2xl border border-amber-200/60 flex items-center justify-between font-medium">
                        <div>
                          <span className="font-bold text-slate-800">{c.cliente_name || 'Cliente'}</span>
                          <span className="text-slate-500 text-[10px] block">{c.servico_name || 'Serviço'} • <strong className="text-amber-700">{timeStr}</strong></span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-emerald-600">R$ {Number(c.commission_value || 0).toFixed(2)}</span>
                          <span className="text-[9px] block text-slate-400 capitalize">{c.status}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Header / Primary Stats */}
            <div className="bg-slate-900 text-white p-5 rounded-3xl shadow-md space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />
              
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1.5">
                  <DollarSign size={13} className="text-emerald-400" />
                  Saldo Líquido a Receber
                </span>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  A Receber Geral
                </span>
              </div>

              <div>
                <p className="text-3xl font-black tracking-tight text-white">
                  R$ {stats.toReceive.toFixed(2)}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-300 font-medium mt-1.5 pt-2 border-t border-slate-800">
                  <span>Comissões Pendentes: <strong className="text-emerald-400 font-bold">R$ {stats.toReceiveCommissions.toFixed(2)}</strong></span>
                  {stats.pendingAdvances > 0 && (
                    <span>Vales Pendentes: <strong className="text-rose-400 font-bold">- R$ {stats.pendingAdvances.toFixed(2)}</strong></span>
                  )}
                </div>
              </div>
            </div>

            {/* Filtros de Data e Status */}
            <div className="bg-white border border-slate-200/80 p-4.5 rounded-3xl shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Filter size={13} className="text-indigo-600" />
                  Filtrar Produção & Vales
                </span>
                <button
                  onClick={() => {
                    const d = new Date();
                    setStartDate(format(new Date(d.getFullYear(), d.getMonth(), 1), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                    setStatusFilter('todos');
                    setTypeFilter('todos');
                    toast.success('Filtros restaurados!');
                  }}
                  className="text-[10px] font-bold text-indigo-600 hover:underline uppercase"
                >
                  Limpar Filtros
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">De (Início)</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Até (Fim)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Status de Repasse</label>
                  <select
                    value={statusFilter}
                    onChange={(e: any) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="todos">Todos os Status</option>
                    <option value="pendente">Pendente (A receber)</option>
                    <option value="pago">Pago (Repassado)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 ml-1">Tipo de Registro</label>
                  <select
                    value={typeFilter}
                    onChange={(e: any) => setTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="todos">Todos os Registros</option>
                    <option value="comissao">Comissões Apenas</option>
                    <option value="vale">Vales/Retiradas</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Resumo Financeiro do Período */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    Gerado
                  </p>
                  <p className="text-sm font-black text-slate-800">
                    R$ {periodStats.totalComissoesGeradas.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Comissões produzidas</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Recebido
                  </p>
                  <p className="text-sm font-black text-emerald-600">
                    R$ {periodStats.totalComissoesPagas.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Valores repassados</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-amber-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Pendente
                  </p>
                  <p className="text-sm font-black text-amber-600">
                    R$ {periodStats.totalComissoesPendentes.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">A receber no período</p>
              </div>

              <div className="bg-white border border-slate-200/80 p-3 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black text-rose-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Retiradas
                  </p>
                  <p className="text-sm font-black text-rose-600">
                    R$ {periodStats.totalVales.toFixed(2)}
                  </p>
                </div>
                <p className="text-[8px] text-slate-400 font-semibold mt-1.5">Adiantamentos pegos</p>
              </div>
            </div>

            {/* Stimulus Goals Section */}
            <div className="bg-white border border-slate-200/80 p-4.5 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                  <Target size={14} className="text-indigo-600" />
                  Metas de Estímulo Pessoal
                </span>
                <button
                  onClick={() => {
                    setNewDailyGoal(personalDailyGoal.toString());
                    setNewMonthlyGoal(personalMonthlyGoal.toString());
                    setIsEditingGoal(!isEditingGoal);
                  }}
                  className="text-[10px] font-black text-indigo-600 hover:underline uppercase flex items-center gap-1"
                >
                  <Edit3 size={11} />
                  {isEditingGoal ? 'Cancelar' : 'Ajustar'}
                </button>
              </div>

              <AnimatePresence mode="wait">
                {isEditingGoal ? (
                  <motion.form 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    onSubmit={handleSaveGoals}
                    className="space-y-3 bg-slate-50 border p-3.5 rounded-2xl"
                  >
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Configurar Suas Metas</p>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">Meta diária (Clientes atendidos hoje)</label>
                      <input
                        type="number"
                        required
                        value={newDailyGoal}
                        onChange={(e) => setNewDailyGoal(e.target.value)}
                        placeholder="Ex: 5"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">Meta mensal (R$ de comissão total no mês)</label>
                      <input
                        type="number"
                        required
                        value={newMonthlyGoal}
                        onChange={(e) => setNewMonthlyGoal(e.target.value)}
                        placeholder="Ex: 3000"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Save size={12} />
                      Salvar Novas Metas
                    </button>
                  </motion.form>
                ) : (
                  <div className="space-y-4">
                    
                    {/* Goal 1: Daily clients served */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-600">Foco do Dia: Clientes Atendidos</span>
                        <span className="text-indigo-600 font-black">{stats.servedTodayCount} / {personalDailyGoal}</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (stats.servedTodayCount / personalDailyGoal) * 100)}%` }}
                        />
                      </div>
                      
                      {/* Motivational text */}
                      <p className="text-[10px] text-slate-400 font-semibold italic">
                        {stats.servedTodayCount >= personalDailyGoal 
                          ? 'Excelente! Meta diária concluída! Continue brilhando! 🌟' 
                          : `Faltam apenas ${personalDailyGoal - stats.servedTodayCount} atendimentos hoje para bater sua meta!`}
                      </p>
                    </div>

                    {/* Goal 2: Monthly commissions earned */}
                    <div className="space-y-1.5 border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-600">Estímulo do Mês: Comissão Gerada</span>
                        <span className="text-indigo-600 font-black">R$ {stats.receivedThisMonth.toFixed(2)} / R$ {personalMonthlyGoal.toFixed(2)}</span>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border">
                        <div 
                          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, (stats.receivedThisMonth / personalMonthlyGoal) * 100)}%` }}
                        />
                      </div>
                      
                      {/* Motivational text */}
                      <p className="text-[10px] text-slate-400 font-semibold italic">
                        {stats.receivedThisMonth >= personalMonthlyGoal 
                          ? 'Extraordinário! Meta de comissão do mês alcançada! Que success! 🚀' 
                          : `Falta R$ ${(personalMonthlyGoal - stats.receivedThisMonth).toFixed(2)} para alcançar a sua meta financeira pessoal.`}
                      </p>
                    </div>

                    {/* Official Admin / Team Goals */}
                    {assignedTeamGoals.length > 0 && (
                      <div className="space-y-3 border-t border-slate-100 pt-3 mt-3">
                        <p className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">Metas e Bônus da Gestão</p>
                        {assignedTeamGoals.map((tg, tgIdx) => {
                          const currentVal = tg.tipo === 'faturamento' ? stats.receivedThisMonth : stats.servedTodayCount;
                          const percent = Math.min(100, Math.round((currentVal / (tg.valorMeta || 1)) * 100));
                          const isAchieved = currentVal >= tg.valorMeta;

                          return (
                            <div key={`tg-${tg.id || tgIdx}-${tgIdx}`} className="bg-indigo-50/40 p-3 rounded-2xl border border-indigo-100/60 space-y-1.5">
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span className="text-primary">{tg.titulo} ({tg.periodo})</span>
                                <span className={isAchieved ? 'text-emerald-600 font-black' : 'text-slate-600'}>
                                  {tg.tipo === 'faturamento' ? `R$ ${currentVal.toFixed(2)}` : `${currentVal}x`} / {tg.valorMeta} ({percent}%)
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${isAchieved ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] pt-0.5">
                                <span className="text-slate-500 italic">
                                  Bônus: <strong className="text-emerald-600">R$ {tg.valorBonus.toFixed(2)}</strong>
                                </span>
                                <span className={isAchieved ? 'text-emerald-700 font-bold' : 'text-muted'}>
                                  {isAchieved ? '🎉 Meta Batida!' : 'Em andamento'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </div>

            {/* Detailed Transaction Statement */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Extrato Detalhado do Período ({transactionsList.length})
                </h3>
                <span className="text-[9px] bg-indigo-50 text-indigo-700 font-extrabold px-2 py-0.5 rounded-full border border-indigo-100">
                  Apenas Valores Líquidos
                </span>
              </div>

              {loadingCommissions ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Carregando repasses e histórico...</p>
                </div>
              ) : transactionsList.length === 0 ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <DollarSign className="text-slate-300 w-10 h-10 mx-auto" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Sem movimentações</h4>
                  <p className="text-slate-400 text-[10px] max-w-xs font-semibold leading-relaxed">
                    Nenhuma comissão ou retirada encontrada no período selecionado com os filtros ativos.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactionsList.map((item, idx) => {
                    const isComm = item.type === 'comissao';
                    return (
                      <div 
                        key={`${item.type}-${item.id || idx}-${idx}`}
                        className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center justify-between hover:border-indigo-100 transition-colors duration-150"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isComm 
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                              : 'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            {isComm ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 truncate">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span>{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : 'Data Indefinida'}</span>
                              {isComm && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span className="text-slate-500 truncate">Cliente: {item.clientName}</span>
                                </>
                              )}
                              {!isComm && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                                  <span className="text-rose-500/80 font-bold truncate">{item.description}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-3">
                          <p className={`text-xs font-black ${isComm ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isComm ? '+' : '-'} R$ {item.value.toFixed(2)}
                          </p>
                          <span className={`text-[8px] font-black uppercase tracking-wider ${
                            item.status === 'pago' 
                              ? 'text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100' 
                              : 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100'
                          }`}>
                            {item.status || 'pendente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ESTOQUE TAB */}
        {activeTab === 'estoque' && (
          <div className="space-y-4">
            
            {/* Search and context */}
            <div className="bg-white border border-slate-200/80 p-3.5 rounded-3xl shadow-sm space-y-3">
              <span className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Package size={13} className="text-indigo-600" />
                Consulta de Estoque
              </span>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar pomadas, óleos, lâminas..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 transition"
                />
              </div>
            </div>

            {/* Stock Level Warning banner */}
            {products.some(p => p.currentStock <= p.minStock) && (
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-amber-800 flex items-start gap-2.5 shadow-sm">
                <AlertTriangle className="shrink-0 mt-0.5 text-amber-600" size={16} />
                <div className="space-y-0.5">
                  <h5 className="text-[11px] font-black uppercase tracking-wider">Produtos com Estoque Baixo!</h5>
                  <p className="text-[10px] text-amber-750 font-semibold leading-normal">
                    Existem itens abaixo do limite mínimo recomendado. Avise o gerente para providenciar reposição.
                  </p>
                </div>
              </div>
            )}

            {/* Product list */}
            <div className="space-y-3">
              {loadingProducts ? (
                <div className="bg-white border rounded-3xl p-10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Acessando níveis de estoque...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
                  <Package className="text-slate-300 w-10 h-10" />
                  <h4 className="font-extrabold text-slate-700 text-sm">Nenhum produto</h4>
                  <p className="text-slate-400 text-[11px] max-w-xs font-semibold leading-relaxed">
                    Nenhum produto em estoque corresponde à sua pesquisa.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredProducts.map((prod, idx) => {
                    const isLow = prod.currentStock <= prod.minStock;
                    return (
                      <div 
                        key={`barber-prod-${prod.id || idx}-${idx}`}
                        className="bg-white border border-slate-200/80 p-3.5 rounded-2xl shadow-sm flex items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <h4 className="text-xs font-black text-slate-800 leading-snug">
                            {prod.name}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              {prod.categoryName || 'Produto'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              Preço venda: <span className="text-slate-700 font-extrabold">R$ {(prod.salePrice || 0).toFixed(2)}</span>
                            </span>
                          </div>
                        </div>

                        {/* Stock counter indicator */}
                        <div className="text-right">
                          <p className={`text-sm font-black ${isLow ? 'text-amber-600' : 'text-slate-800'}`}>
                            {prod.currentStock} un
                          </p>
                          <span className={`text-[8px] font-black uppercase tracking-wider block ${
                            isLow ? 'text-amber-600 bg-amber-50 px-1 rounded border border-amber-100' : 'text-slate-400'
                          }`}>
                            {isLow ? 'Recarga Urgente' : `Mínimo: ${prod.minStock}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AVALIACOES TAB */}
        {activeTab === 'avaliacoes' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200/80 p-6 rounded-[2rem] shadow-sm text-center space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sua Média de Avaliação</h3>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-5xl font-black text-slate-800">
                    {reviews.length > 0 
                      ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length).toFixed(1)
                      : '0.0'}
                  </span>
                  <div className="flex flex-col items-start">
                    <div className="flex text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const score = reviews.length > 0 ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length) : 0;
                        return (
                          <Star 
                            key={`score-star-${i}`} 
                            size={16} 
                            fill={i < Math.round(score) ? 'currentColor' : 'none'} 
                            className={i < Math.round(score) ? 'text-amber-500' : 'text-slate-300'} 
                          />
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      {reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Distibution bars */}
              <div className="space-y-1.5 pt-2 border-t border-slate-150">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = reviews.filter((r) => r.rating === stars).length;
                  const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
                  return (
                    <div key={`star-dist-${stars}`} className="flex items-center gap-3 text-xs font-bold text-slate-600">
                      <span className="w-3 text-right">{stars}</span>
                      <Star size={10} fill="currentColor" className="text-amber-500" />
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-slate-400 text-[10px]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* List of Reviews */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider block ml-1">Comentários dos Clientes</h4>

              {loadingReviews ? (
                <div className="py-12 flex justify-center text-slate-400">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : reviews.length > 0 ? (
                <div className="space-y-3">
                  {reviews.map((review, revIdx) => (
                    <div key={`review-item-${review.id || revIdx}-${revIdx}`} className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-bold text-xs text-slate-800">{review.cliente_name}</h5>
                          <p className="text-[9px] text-slate-400 font-medium">
                            {review.createdAt?.seconds 
                              ? format(new Date(review.createdAt.seconds * 1000), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
                              : 'Recentemente'}
                          </p>
                        </div>
                        <div className="flex text-amber-500">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star 
                              key={`rev-item-star-${review.id || revIdx}-${i}`} 
                              size={12} 
                              fill={i < review.rating ? 'currentColor' : 'none'} 
                              className={i < review.rating ? 'text-amber-500' : 'text-slate-200'} 
                            />
                          ))}
                        </div>
                      </div>

                      {review.comentario ? (
                        <p className="text-xs text-slate-600 font-medium italic bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          "{review.comentario}"
                        </p>
                      ) : (
                        <p className="text-xs text-slate-450 italic font-semibold">Sem comentário escrito.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center bg-white border border-dashed border-slate-200 rounded-[2rem]">
                  <p className="text-xs text-slate-400 font-semibold">Nenhuma avaliação recebida ainda.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PERFIL TAB */}
        {activeTab === 'perfil' && (
          <div className="space-y-4">
            
            {/* Detailed Professional Card */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-3xl bg-indigo-50 border-2 border-indigo-200 text-indigo-600 flex items-center justify-center text-3xl font-black uppercase shadow-inner overflow-hidden cursor-pointer hover:border-indigo-600 transition-all"
                    title="Alterar foto de perfil"
                  >
                    {currentProfile.fotoUrl || currentProfile.avatarUrl ? (
                      <img 
                        src={currentProfile.fotoUrl || currentProfile.avatarUrl} 
                        alt={currentProfile.nome} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      currentProfile.nome.substring(0, 2)
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white rounded-3xl">
                      <Camera size={18} />
                      <span className="text-[8px] font-black uppercase mt-1">Alterar</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 bg-indigo-600 text-white p-1.5 rounded-xl shadow-md hover:bg-indigo-700 transition"
                    title="Alterar Foto"
                  >
                    <Camera size={12} />
                  </button>
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-800 leading-tight">{currentProfile.nome}</h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">{currentProfile.email}</p>
                  
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500 font-semibold">
                    <Star size={12} fill="currentColor" className="text-amber-500" />
                    <span className="font-extrabold text-slate-700">
                      {reviews.length > 0 
                        ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length).toFixed(1)
                        : '0.0'}
                    </span>
                    <span>({reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'})</span>
                  </div>

                  <p className="text-[10px] bg-indigo-50 text-indigo-700 font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border border-indigo-100 mt-2.5 inline-block">
                    Barbeiro Parceiro
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-2.5 text-xs font-bold text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">Sua Comissão de Contrato</span>
                  <span className="text-indigo-600 font-black text-sm">
                    {currentProfile.percentual_comissao || currentProfile.commission_percentage || 0}%
                  </span>
                </div>
                
                {currentProfile.especialidade && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Sua Especialidade Principal</span>
                    <span className="text-slate-700 font-extrabold">
                      {currentProfile.especialidade}
                    </span>
                  </div>
                )}

                {currentProfile.telefone && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Telefone de Contato</span>
                    <span className="text-slate-700 font-extrabold">{currentProfile.telefone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Working hours scale summary */}
            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 mb-2">
                <Clock size={14} className="text-indigo-600" />
                Sua Escala Operacional
              </h4>

              {profile.horario_de_trabalho && profile.horario_de_trabalho.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {profile.horario_de_trabalho.map((wh, whIdx) => (
                    <div key={`wh-day-${wh.dayOfWeek || whIdx}-${whIdx}`} className="bg-slate-50 border p-2.5 rounded-xl text-center">
                      <p className="text-[9px] text-slate-400 font-black uppercase">
                        {wh.dayOfWeek === 1 ? 'Segunda' :
                         wh.dayOfWeek === 2 ? 'Terça' :
                         wh.dayOfWeek === 3 ? 'Quarta' :
                         wh.dayOfWeek === 4 ? 'Quinta' :
                         wh.dayOfWeek === 5 ? 'Sexta' :
                         wh.dayOfWeek === 6 ? 'Sábado' : 'Domingo'}
                      </p>
                      {wh.isOpen ? (
                        <p className="text-xs font-black text-indigo-700 mt-0.5">
                          {wh.startTime} - {wh.endTime}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-400 italic mt-0.5">
                          Folga
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-50 border p-3 rounded-xl text-slate-450 italic text-xs font-bold justify-center">
                  <AlertCircle size={14} />
                  <span>Nenhum horário de expediente cadastrado pelo dono.</span>
                </div>
              )}
            </div>

            {/* Simulator switcher for easily switching profiles in development context */}
            <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-[2rem] shadow-sm text-center">
              <p className="text-xs font-black text-indigo-950 flex items-center justify-center gap-1.5">
                <Scissors size={14} className="text-indigo-600" />
                Painel do Profissional
              </p>
              <p className="text-[10px] text-indigo-700/80 mt-1 max-w-xs mx-auto leading-relaxed font-semibold">
                Este portal foi otimizado para celulares dos barbeiros. Você pode ver sua agenda em tempo real, gerenciar comissões e acompanhar estoque.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Fixed bottom simple bottom navigation menu bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200/80 px-2 py-2 shadow-2xl z-50 rounded-t-3xl max-w-md mx-auto">
        <div className="grid grid-cols-6 gap-1 text-center">
          
          <button
            onClick={() => setActiveTab('agenda')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'agenda' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Calendar size={18} className={`mb-1 transition-transform ${activeTab === 'agenda' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Agenda</span>
          </button>

          <button
            onClick={() => setActiveTab('clientes')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'clientes' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Users size={18} className={`mb-1 transition-transform ${activeTab === 'clientes' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Clientes</span>
          </button>

          <button
            onClick={() => setActiveTab('comissao')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'comissao' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <DollarSign size={18} className={`mb-1 transition-transform ${activeTab === 'comissao' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Comissão</span>
          </button>

          <button
            onClick={() => setActiveTab('avaliacoes')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'avaliacoes' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Star size={18} className={`mb-1 transition-transform ${activeTab === 'avaliacoes' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Avaliar</span>
          </button>

          <button
            onClick={() => setActiveTab('estoque')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'estoque' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <Package size={18} className={`mb-1 transition-transform ${activeTab === 'estoque' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Estoque</span>
          </button>

          <button
            onClick={() => setActiveTab('perfil')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition-all ${
              activeTab === 'perfil' 
                ? 'text-indigo-600 font-black' 
                : 'text-slate-450 hover:text-slate-700 font-bold'
            }`}
          >
            <User size={18} className={`mb-1 transition-transform ${activeTab === 'perfil' ? 'scale-110 text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[9px] uppercase tracking-wider">Perfil</span>
          </button>

        </div>
      </nav>

      {/* Block Time Modal */}
      <AnimatePresence>
        {isBlockModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-slate-900/60 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="bg-white rounded-t-[2.5rem] sm:rounded-[2rem] border border-slate-200 shadow-2xl p-6 w-full max-w-sm space-y-4 pb-8 sm:pb-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                  <Lock size={15} className="text-red-600" />
                  Bloquear Agenda
                </h3>
                <button
                  onClick={() => setIsBlockModalOpen(false)}
                  className="text-xs font-black uppercase text-slate-400 hover:text-slate-600 px-2 py-1 rounded-xl transition"
                >
                  Fechar
                </button>
              </div>

              <form onSubmit={handleCreateBlock} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Data Selecionada
                  </label>
                  <p className="text-xs font-extrabold text-slate-700 bg-slate-50 border p-2.5 rounded-xl">
                    {dateStrip.find(d => d.iso === format(selectedDate, 'yyyy-MM-dd'))?.label || format(selectedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Início
                    </label>
                    <input
                      type="time"
                      required
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.target.value)}
                      className="w-full text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Término
                    </label>
                    <input
                      type="time"
                      required
                      value={blockEndTime}
                      onChange={(e) => setBlockEndTime(e.target.value)}
                      className="w-full text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Motivo (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Almoço, Compromisso pessoal..."
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider py-3.5 rounded-2xl shadow-md transition"
                >
                  Confirmar Bloqueio
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modals for Manual Management */}
      <AppointmentModal 
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSuccess={() => {
          setIsAppointmentModalOpen(false);
          toast.success("Agenda atualizada!");
        }}
        appointment={selectedAppointment}
        currentUser={profile}
        initialTime={selectedTimeSlot?.time}
        initialProfissionalId={selectedTimeSlot?.profissional_id || profile.uid || profile.id}
        onOpenComanda={handleOpenComanda}
      />

      {isComandaModalOpen && selectedAppointment && comandaInitialData && (
        <ComandaModal 
          comanda_id={selectedAppointment.comanda_id}
          onClose={() => setIsComandaModalOpen(false)}
          onSave={() => {
            setIsComandaModalOpen(false);
            setSelectedAppointment(null);
          }}
          initialData={comandaInitialData}
        />
      )}

      {isManualComandaOpen && (
        <ComandaModal 
          onClose={() => setIsManualComandaOpen(false)}
          onSave={() => {
            setIsManualComandaOpen(false);
          }}
          initialData={{
            profissional_id: profile.uid,
            profissional_name: profile.nome,
            origin: 'balcao',
            status: 'aberta'
          }}
        />
      )}

      {/* Hidden File Input for photo upload */}
      <input 
        type="file"
        ref={fileInputRef}
        onChange={handleFotoFileSelect}
        accept="image/jpeg,image/jpg"
        className="hidden"
      />

      {/* Photo Crop Modal */}
      <ImageCropModal 
        isOpen={isCropModalOpen}
        imageSrc={tempImageSrc}
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={handleSaveCroppedPhoto}
      />

      {/* Floating Action Button (FAB) (+) */}
      <div className="fixed bottom-6 right-6 z-[9990]">
        <AnimatePresence>
          {isFabOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsFabOpen(false)}
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[-1]"
              />
              
              {/* Menu Options */}
              <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 15 }}
                className="mb-3 flex flex-col items-end gap-2.5"
              >
                <button
                  onClick={() => {
                    setIsFabOpen(false);
                    handleNewAppointment('09:00', profile.uid);
                  }}
                  className="flex items-center gap-2.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-indigo-500/30 font-black text-xs active:scale-95 transition-all group"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider">Novo Agendamento</span>
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                    <Calendar size={15} className="text-white" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsFabOpen(false);
                    setIsManualComandaOpen(true);
                  }}
                  className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-emerald-500/30 font-black text-xs active:scale-95 transition-all group"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider">Abrir Comanda</span>
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                    <ArrowRightLeft size={15} className="text-white" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    setIsFabOpen(false);
                    setIsBlockModalOpen(true);
                  }}
                  className="flex items-center gap-2.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-2xl shadow-xl border border-rose-500/30 font-black text-xs active:scale-95 transition-all group"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider">Bloquear Horário</span>
                  <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center">
                    <Lock size={15} className="text-white" />
                  </div>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setIsFabOpen(prev => !prev)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 active:scale-90 border border-white/20 ${
            isFabOpen
              ? 'bg-slate-800 text-white rotate-45'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105'
          }`}
          title="Ações Rápidas"
        >
          <Plus size={28} strokeWidth={3} />
        </button>
      </div>

    </div>
  );
}
