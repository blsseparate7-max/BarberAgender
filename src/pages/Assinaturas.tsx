import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Users, 
  Star, 
  Scissors, 
  Zap, 
  Calendar,
  Edit2,
  Trash2,
  Loader2,
  ShieldCheck,
  TrendingUp,
  History,
  X,
  RefreshCw,
  Search,
  Filter,
  CheckCircle,
  Eye,
  DollarSign,
  Percent,
  Briefcase,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { subscriptionService } from '../services/subscriptionService';
import { userService } from '../services/userService';
import { SubscriptionPlan, Subscription, SubscriptionStatus, UserProfile, Service, Product, SubscriptionDiscount } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  updateDoc, 
  query, 
  orderBy,
  where,
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { toast } from 'sonner';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ComandaModal } from '../components/Comanda/ComandaModal';

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

interface AssinaturasProps {
  defaultTab?: 'assinaturas' | 'assinantes' | 'planos';
}

export function Assinaturas({ defaultTab }: AssinaturasProps) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  const getInitialTabState = () => {
    if (profile?.tipo === 'cliente') {
      return 'meu_plano';
    }
    if (defaultTab === 'assinantes') {
      return 'assinantes_gestao';
    }
    if (defaultTab === 'planos') {
      return 'assinaturas_planos';
    }
    return 'assinaturas_planos';
  };

  const [activeTab, setActiveTab] = useState<
    'assinaturas_planos' | 'assinantes_gestao' | 'assinantes_comissoes' | 'assinaturas_rendimento' | 'meu_plano'
  >(getInitialTabState());

  useEffect(() => {
    if (profile?.tipo === 'cliente') {
      setActiveTab('meu_plano');
    } else if (defaultTab) {
      if (defaultTab === 'assinantes') {
        setActiveTab('assinantes_gestao');
      } else if (defaultTab === 'planos') {
        setActiveTab('assinaturas_planos');
      }
    }
  }, [defaultTab, profile?.tipo]);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Modals for Subscriptions
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  // Comanda Modal Sync
  const [comandaInitialData, setComandaInitialData] = useState<any | null>(null);
  const [showComandaModal, setShowComandaModal] = useState(false);

  // Product state for discounts
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  // Discounts states
  const [planDiscounts, setPlanDiscounts] = useState<SubscriptionDiscount[]>([]);
  const [discountItemId, setDiscountItemId] = useState<string>('');
  const [discountPercentage, setDiscountPercentage] = useState<number>(10);

  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);

  const [planShowInPortal, setPlanShowInPortal] = useState(true);
  const [planComissaoTipo, setPlanComissaoTipo] = useState<'fixo' | 'pool_atendimentos' | 'pool_pontos'>('fixo');
  const [planComissaoPoolPorcentagem, setPlanComissaoPoolPorcentagem] = useState(50);
  const [planComissaoFixaValor, setPlanComissaoFixaValor] = useState(10.00);
  const [planPontosCorte, setPlanPontosCorte] = useState(1);
  const [planPontosBarba, setPlanPontosBarba] = useState(1);
  const [planPontosOutros, setPlanPontosOutros] = useState(0.5);

  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [allUsages, setAllUsages] = useState<any[]>([]);
  const [barbeiros, setBarbeiros] = useState<UserProfile[]>([]);
  const [releasedRuns, setReleasedRuns] = useState<Record<string, any>>({});
  const [loadingUsages, setLoadingUsages] = useState(false);
  const [postingCommissions, setPostingCommissions] = useState(false);

  const handleAddDiscount = () => {
    if (!discountItemId) {
      toast.error('Selecione um item para o desconto.');
      return;
    }
    if (discountPercentage <= 0 || discountPercentage > 100) {
      toast.error('A porcentagem de desconto deve ser entre 1% e 100%.');
      return;
    }

    if (planDiscounts.some(d => d.itemId === discountItemId)) {
      toast.error('Este item já possui desconto definido.');
      return;
    }

    let itemName = '';
    let itemType: 'servico' | 'product' | 'all_services' | 'all_products' = 'servico';

    if (discountItemId === 'all_services') {
      itemName = 'Todos os Serviços';
      itemType = 'all_services';
    } else if (discountItemId === 'all_products') {
      itemName = 'Todos os Produtos';
      itemType = 'all_products';
    } else if (discountItemId.startsWith('servico_')) {
      const sId = discountItemId.replace('servico_', '');
      const service = services.find(s => s.id === sId);
      itemName = service ? `Serviço: ${service.nome}` : 'Serviço';
      itemType = 'servico';
    } else if (discountItemId.startsWith('product_')) {
      const pId = discountItemId.replace('product_', '');
      const product = products.find(p => p.id === pId);
      itemName = product ? `Produto: ${product.name}` : 'Produto';
      itemType = 'product';
    }

    const newDiscount: SubscriptionDiscount = {
      itemId: discountItemId,
      itemName,
      itemType,
      percentage: discountPercentage
    };

    setPlanDiscounts([...planDiscounts, newDiscount]);
    setDiscountItemId('');
    setDiscountPercentage(10);
    toast.success('Desconto adicionado!');
  };

  const handleRemoveDiscount = (itemId: string) => {
    setPlanDiscounts(planDiscounts.filter(d => d.itemId !== itemId));
  };

  const loadComissoesData = async () => {
    setLoadingUsages(true);
    try {
      const [usages, b, runsSnap] = await Promise.all([
        subscriptionService.getAllUsageHistory(),
        userService.getUsersByRole('barbeiro'),
        getDocs(collection(db, 'subscription_commission_runs'))
      ]);
      setAllUsages(usages);
      setBarbeiros(b);
      
      const runs: Record<string, any> = {};
      runsSnap.forEach(doc => {
        runs[doc.id] = doc.data();
      });
      setReleasedRuns(runs);
    } catch (error) {
      console.error("Erro ao carregar dados de comissão:", error);
    } finally {
      setLoadingUsages(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'assinantes_comissoes' || activeTab === 'assinaturas_rendimento') {
      loadComissoesData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (profile?.tipo === 'cliente' && activeTab !== 'meu_plano') {
      setActiveTab('meu_plano');
    }
  }, [profile?.tipo]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Process reactive renewals for expired/renewed subscriptions
      try {
        const renewalResults = await subscriptionService.processReactiveRenewals();
        if (renewalResults.renewed > 0 || renewalResults.expired > 0) {
          toast.info(
            `Fidelidade Recorrente: ${renewalResults.renewed} renovadas automaticamente, ${renewalResults.expired} expiradas.`
          );
        }
      } catch (err) {
        console.error("Erro no processamento de renovações reativas:", err);
      }

      // Fetch Subscription plans & clients
      const [p, s, c] = await Promise.all([
        subscriptionService.getPlans(),
        subscriptionService.getSubscriptions(profile?.tipo === 'cliente' ? user?.uid : undefined),
        canManage ? userService.getAllClients() : Promise.resolve([])
      ]);
      setPlans(p);
      setSubscriptions(s);
      
      if (canManage) {
        setClients(c.filter(client => client.ativo !== false));
      }
    } catch (error) {
      console.error("Erro ao carregar dados estáticos de assinaturas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubServ: (() => void) | undefined;
    let unsubProd: (() => void) | undefined;

    const setupListeners = () => {
      // Services snapshot
      unsubServ = onSnapshot(
        query(collection(db, 'services'), orderBy('nome', 'asc')),
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setServices(docs.filter(s => s.active !== false));
        },
        (error) => {
          console.error('Erro ao buscar serviços:', error);
        }
      );

      // Products snapshot
      unsubProd = onSnapshot(
        query(collection(db, 'products'), orderBy('name', 'asc')),
        (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setProducts(docs.filter(p => p.active !== false));
        },
        (error) => {
          console.error('Erro ao buscar produtos:', error);
        }
      );
    };

    loadData();
    setupListeners();

    return () => {
      if (unsubServ) unsubServ();
      if (unsubProd) unsubProd();
    };
  }, [profile?.uid, profile?.tipo, activeTab, user?.uid, canManage]);

  useEffect(() => {
    if (showPlanModal) {
      if (editingPlan) {
        setPlanShowInPortal(editingPlan.showInPortal ?? true);
        setPlanComissaoTipo((editingPlan as any).comissao_tipo || 'fixo');
        setPlanComissaoPoolPorcentagem((editingPlan as any).comissao_pool_porcentagem ?? 50);
        setPlanComissaoFixaValor((editingPlan as any).comissao_fixa_valor ?? 10.00);
        setPlanPontosCorte((editingPlan as any).pontos_corte ?? 1);
        setPlanPontosBarba((editingPlan as any).pontos_barba ?? 1);
        setPlanPontosOutros((editingPlan as any).pontos_outros ?? 0.5);
        setPlanDiscounts(editingPlan.discounts || []);
        setDiscountItemId('');
        setDiscountPercentage(10);
      } else {
        setPlanShowInPortal(true);
        setPlanComissaoTipo('fixo');
        setPlanComissaoPoolPorcentagem(50);
        setPlanComissaoFixaValor(10.00);
        setPlanPontosCorte(1);
        setPlanPontosBarba(1);
        setPlanPontosOutros(0.5);
        setPlanDiscounts([]);
        setDiscountItemId('');
        setDiscountPercentage(10);
      }
    }
  }, [showPlanModal, editingPlan]);

  // Handle plan assignments (assign subscription)
  const handleAssignSubscription = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    const formData = new FormData(e.currentTarget);
    const cliente_id = formData.get('clientId') as string;
    const client = clients.find(c => c.uid === cliente_id);
    
    if (!client) return;

    const autoRenew = formData.get('autoRenew') === 'on';

    setComandaInitialData({
      cliente_id: client.uid,
      cliente_name: client.nome,
      origin: 'balcao' as const,
      items: [
        {
          id: `subscription-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          type: 'assinatura' as const,
          referencia_id: selectedPlan.id,
          name: `Venda Plano: ${selectedPlan.name}`,
          quantity: 1,
          unitPrice: selectedPlan.price,
          totalPrice: selectedPlan.price,
          isCortesia: false,
          generateCommission: false,
          metadata: {
            autoRenew
          }
        }
      ]
    });

    setShowAssignModal(false);
    setSelectedPlan(null);
    setShowComandaModal(true);
  };

  // Action to register subscriber benefit usage
  const { execute: handleRegisterUsage, isLoading: isRegisteringUsage } = useAsyncAction(async (subId: string, type: 'haircut' | 'beard') => {
    try {
      await subscriptionService.registerUsage(subId, type);
      loadData();
      toast.success("Utilização registrada no clube de benefícios!");
    } catch (error: any) {
      console.error("Erro ao registrar uso:", error);
      toast.error(error.message || "Não foi possível registrar o uso.");
    }
  });

  // Action to manually renew subscription
  const handleManualRenewSubscription = async (subId: string) => {
    try {
      const newEndDate = await subscriptionService.renewSubscription(subId);
      toast.success(`Assinatura renovada com sucesso! Nova vigência até: ${format(parseISO(newEndDate), 'dd/MM/yyyy')}`);
      loadData();
    } catch (error: any) {
      console.error("Erro ao renovar assinatura:", error);
      toast.error(error.message || "Não foi possível renovar a assinatura.");
    }
  };

  // Action to toggle autoRenew
  const handleToggleAutoRenew = async (subId: string, autoRenew: boolean) => {
    try {
      await subscriptionService.toggleAutoRenew(subId, autoRenew);
      toast.success(`Renovação automática ${autoRenew ? 'ativada' : 'desativada'} com sucesso!`);
      loadData();
    } catch (error: any) {
      console.error("Erro ao alterar renovação automática:", error);
      toast.error(error.message || "Erro ao atualizar configuração.");
    }
  };

  // Action to change subscription status (pause, cancel, etc)
  const handleUpdateSubscriptionStatus = async (subId: string, status: SubscriptionStatus) => {
    const statusLabels: Record<SubscriptionStatus, string> = {
      active: 'ativada',
      expired: 'expirada',
      canceled: 'cancelada',
      paused: 'pausada',
      pending: 'marcada como pendente'
    };
    try {
      await subscriptionService.updateSubscriptionStatus(subId, status);
      toast.success(`Assinatura ${statusLabels[status]} com sucesso!`);
      loadData();
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      toast.error(error.message || "Erro ao atualizar status da assinatura.");
    }
  };

  // Action to delete subscription with modal confirm
  const handleConfirmDeleteSubscription = async () => {
    if (!deleteSubId) return;
    try {
      await subscriptionService.deleteSubscription(deleteSubId);
      toast.success("Assinatura excluída com sucesso.");
      setDeleteSubId(null);
      loadData();
    } catch (error: any) {
      console.error("Erro ao excluir assinatura:", error);
      toast.error(error.message || "Erro ao excluir assinatura.");
    }
  };

  // Action to save plans (create/edit)
  const { execute: handleSavePlan, isLoading: isSavingPlan } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const planData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: Number(formData.get('price')),
      haircutsPerMonth: Number(formData.get('haircutsPerMonth')),
      beardsPerMonth: Number(formData.get('beardsPerMonth')),
      extraBenefits: (formData.get('extraBenefits') as string).split(',').map(s => s.trim()).filter(Boolean),
      status: formData.get('status') as 'active' | 'inactive',
      showInPortal: planShowInPortal,
      comissao_tipo: planComissaoTipo,
      comissao_pool_porcentagem: planComissaoPoolPorcentagem,
      comissao_fixa_valor: planComissaoFixaValor,
      pontos_corte: planPontosCorte,
      pontos_barba: planPontosBarba,
      pontos_outros: planPontosOutros,
      discounts: planDiscounts,
    };

    try {
      if (editingPlan) {
        await subscriptionService.updatePlan(editingPlan.id, planData);
        toast.success(`Plano "${planData.name}" atualizado!`);
      } else {
        await subscriptionService.createPlan(planData);
        toast.success(`Plano "${planData.name}" criado com sucesso!`);
      }
      setShowPlanModal(false);
      setEditingPlan(null);
      loadData();
    } catch (error) {
      console.error("Erro ao salvar plano:", error);
      toast.error("Aconteceu um erro ao tentar salvar o plano de assinatura.");
    }
  });

  // Filter lists in memory
  const filteredSubscriptions = subscriptions.filter(s => {
    return s.cliente_name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // --- GESTÃO DE COMISSÕES DE ASSINATURA ---
  const filteredUsages = allUsages.filter(u => u.date && u.date.startsWith(selectedMonth));
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const totalSubRevenue = activeSubs.reduce((acc, s) => {
    const plan = plans.find(p => p.id === s.plano_id);
    return acc + (plan?.price || 0);
  }, 0);

  const calculatedCommissions = barbeiros.map(barber => {
    let barberCuts = 0;
    let barberBeards = 0;
    let barberOthers = 0;
    let barberPoints = 0;
    let barberCommission = 0;

    const barberUsages = filteredUsages.filter(u => u.profissional_id === barber.uid);

    barberUsages.forEach(u => {
      if (u.type === 'haircut') barberCuts++;
      else if (u.type === 'beard') barberBeards++;
      else barberOthers++;
    });

    plans.forEach(plan => {
      const planActiveSubs = activeSubs.filter(s => s.plano_id === plan.id);
      const planRevenue = planActiveSubs.length * plan.price;
      const poolPct = (plan as any).comissao_pool_porcentagem ?? 50;
      const planPool = planRevenue * (poolPct / 100);

      const planType = (plan as any).comissao_tipo || 'fixo';

      const planUsages = filteredUsages.filter(u => u.plano_id === plan.id);
      const barberPlanUsages = planUsages.filter(u => u.profissional_id === barber.uid);

      if (planType === 'fixo') {
        const fixedVal = (plan as any).comissao_fixa_valor ?? 10.00;
        barberCommission += barberPlanUsages.length * fixedVal;
      } else if (planType === 'pool_atendimentos') {
        if (planUsages.length > 0) {
          barberCommission += planPool * (barberPlanUsages.length / planUsages.length);
        }
      } else if (planType === 'pool_pontos') {
        const wCorte = (plan as any).pontos_corte ?? 1;
        const wBarba = (plan as any).pontos_barba ?? 1;
        const wOutro = (plan as any).pontos_outros ?? 0.5;

        const totalPlanPoints = planUsages.reduce((sum, u) => {
          if (u.type === 'haircut') return sum + wCorte;
          if (u.type === 'beard') return sum + wBarba;
          return sum + wOutro;
        }, 0);

        const barberPlanPoints = barberPlanUsages.reduce((sum, u) => {
          if (u.type === 'haircut') return sum + wCorte;
          if (u.type === 'beard') return sum + wBarba;
          return sum + wOutro;
        }, 0);

        if (totalPlanPoints > 0) {
          barberCommission += planPool * (barberPlanPoints / totalPlanPoints);
          barberPoints += barberPlanPoints;
        }
      }
    });

    return {
      uid: barber.uid,
      nome: barber.nome || barber.displayName || 'Profissional',
      foto: barber.foto || barber.photoURL || '',
      cuts: barberCuts,
      beards: barberBeards,
      others: barberOthers,
      totalServices: barberUsages.length,
      points: barberPoints,
      commission: barberCommission
    };
  });

  const totalCommissionsToRelease = calculatedCommissions.reduce((acc, c) => acc + c.commission, 0);
  const isMonthReleased = !!releasedRuns[selectedMonth];
  const releasedRunInfo = releasedRuns[selectedMonth];

  // --- RENDIMENTO & PERFORMANCE DE ASSINATURAS ---
  const totalValueIfAvulso = filteredUsages.reduce((sum, u) => sum + (u.valor_servico || (u.type === 'haircut' ? 50 : 35)), 0);
  const clientSavings = totalValueIfAvulso - totalSubRevenue;
  const clientSavingsPercent = totalValueIfAvulso > 0 ? (clientSavings / totalValueIfAvulso) * 100 : 0;
  const avgVisitsPerActiveSub = activeSubs.length > 0 ? (filteredUsages.length / activeSubs.length).toFixed(1) : '0';

  const usagesByClient: Record<string, { 
    name: string; 
    usages: any[]; 
    clientId: string;
  }> = {};

  filteredUsages.forEach(u => {
    const key = u.cliente_id || u.cliente_name || 'Desconhecido';
    if (!usagesByClient[key]) {
      usagesByClient[key] = {
        name: u.cliente_name || 'Cliente Assinante',
        usages: [],
        clientId: u.cliente_id || ''
      };
    }
    usagesByClient[key].usages.push(u);
  });

  const clientStats = Object.values(usagesByClient).map(item => {
    const uList = item.usages;
    const totalCuts = uList.filter(u => u.type === 'haircut').length;
    const totalBeards = uList.filter(u => u.type === 'beard').length;
    const totalOthers = uList.length - totalCuts - totalBeards;

    const sub = subscriptions.find(s => s.cliente_id === item.clientId || s.cliente_name === item.name);
    const plan = sub ? plans.find(p => p.id === sub.plano_id) : null;
    const planPrice = plan?.price || 0;

    const avulsoValue = uList.reduce((sum, u) => sum + (u.valor_servico || (u.type === 'haircut' ? 50 : 35)), 0);
    const savings = avulsoValue - planPrice;

    const matchedClient = clients.find(c => c.uid === item.clientId);
    const foto = matchedClient?.foto || matchedClient?.photoURL || '';

    return {
      clientId: item.clientId,
      name: item.name,
      foto,
      totalVisits: uList.length,
      totalCuts,
      totalBeards,
      totalOthers,
      planName: plan?.name || sub?.planName || 'Plano Personalizado',
      planPrice,
      avulsoValue,
      savings
    };
  }).sort((a, b) => b.totalVisits - a.totalVisits);

  const totalCutsCount = filteredUsages.filter(u => u.type === 'haircut').length;
  const totalBeardsCount = filteredUsages.filter(u => u.type === 'beard').length;
  const totalOthersCount = filteredUsages.length - totalCutsCount - totalBeardsCount;

  const cutsPercent = filteredUsages.length > 0 ? Math.round((totalCutsCount / filteredUsages.length) * 100) : 0;
  const beardsPercent = filteredUsages.length > 0 ? Math.round((totalBeardsCount / filteredUsages.length) * 100) : 0;
  const othersPercent = filteredUsages.length > 0 ? Math.round((totalOthersCount / filteredUsages.length) * 100) : 0;

  const handleReleaseCommissions = async () => {
    if (totalCommissionsToRelease === 0) {
      toast.error("Nenhuma comissão calculada para lançar neste período.");
      return;
    }
    
    setPostingCommissions(true);
    try {
      const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: ptBR });
      const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

      const promises = calculatedCommissions
        .filter(c => c.commission > 0)
        .map(async (c) => {
          const commData = {
            profissional_id: c.uid,
            profissional_name: c.nome,
            servico_name: `Rateio Assinatura - ${monthLabelCap}`,
            base_value: c.totalServices,
            commission_percentage: 100,
            commission_value: Number(c.commission.toFixed(2)),
            status: 'pendente' as const,
            commission_type: 'assinatura' as const,
            date: format(new Date(), 'yyyy-MM-dd'),
          };
          
          await addDoc(collection(db, 'commissions'), {
            ...commData,
            tenantId: (profile as any)?.tenantId || 'default',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });

      await Promise.all(promises);

      await setDoc(doc(db, 'subscription_commission_runs', selectedMonth), {
        releasedAt: new Date().toISOString(),
        releasedBy: profile?.nome || 'Administrador',
        totalAmount: Number(totalCommissionsToRelease.toFixed(2)),
        subscribersCount: activeSubs.length,
        servicesCount: filteredUsages.length,
        period: selectedMonth
      });

      toast.success(`Comissões de ${monthLabelCap} lançadas com sucesso para os profissionais!`);
      loadComissoesData();
    } catch (error) {
      console.error("Erro ao lançar comissões:", error);
      toast.error("Erro ao processar lançamento das comissões.");
    } finally {
      setPostingCommissions(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Acessando portal de benefícios...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 text-primary">
      {/* Title Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary mb-1">Assinaturas e Recorrência</h1>
          <p className="text-muted text-sm font-medium">Controle de planos, renovações, mensais de assinantes e performance do clube.</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            {['assinaturas_planos'].includes(activeTab) && (
              <button 
                onClick={() => { setEditingPlan(null); setShowPlanModal(true); }}
                className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition shadow-md active:scale-95 cursor-pointer"
              >
                <Plus size={15} />
                <span>Novo Plano</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Aggregate Analytical Panels for Admins */}
      {canManage && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Assinantes Ativos" value={subscriptions.filter(s => s.status === 'active').length} icon={<Users className="text-blue-600" />} />
          <StatCard title="Receita Recorrente" value={subscriptions.filter(s => s.status === 'active').reduce((acc, s) => acc + (plans.find(p => p.id === s.plano_id)?.price || 0), 0)} icon={<TrendingUp className="text-emerald-600" />} isCurrency />
          <StatCard title="Economia de Clientes" value={`R$ ${Math.max(0, clientSavings).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<Percent className="text-indigo-600" />} />
          <StatCard title="Visitas Sob Assinatura" value={`${filteredUsages.length} vezes`} icon={<Clock className="text-rose-600" />} />
        </div>
      )}

      {/* Primary Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center bg-slate-100 border p-1 rounded-2xl w-fit gap-1 shadow-inner">
        {canManage ? (
          <>
            <TabButton 
              active={activeTab === 'assinaturas_planos'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('assinaturas_planos');
              }} 
              label="Planos de Assinatura" 
              icon={<Star size={14} />} 
            />
            <TabButton 
              active={activeTab === 'assinantes_gestao'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('assinantes_gestao');
              }} 
              label="Assinantes (Gestão)" 
              icon={<Users size={14} />} 
            />
            <TabButton 
              active={activeTab === 'assinantes_comissoes'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('assinantes_comissoes');
              }} 
              label="Comissões & Relatórios" 
              icon={<DollarSign size={14} />} 
            />
            <TabButton 
              active={activeTab === 'assinaturas_rendimento'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('assinaturas_rendimento');
              }} 
              label="Rendimento & Performance" 
              icon={<TrendingUp size={14} />} 
            />
          </>
        ) : (
          <>
            <TabButton 
              active={activeTab === 'meu_plano'} 
              onClick={() => setActiveTab('meu_plano')} 
              label="Minha Assinatura" 
              icon={<ShieldCheck size={14} />} 
            />
          </>
        )}
      </div>

      {/* Advanced Filter Box for Active Tabs */}
      {['assinantes_gestao'].includes(activeTab) && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-4 border border-slate-100 rounded-3xl">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar assinante por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-slate-50 focus:border-slate-400 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium text-primary shadow-sm transition"
            />
          </div>
        </div>
      )}

      {/* TAB 1: Planos de Assinatura (Cadastro e Venda) */}
      {activeTab === 'assinaturas_planos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map(plan => (
            <PlanCard 
              key={plan.id} 
              plan={plan} 
              isAdmin={canManage}
              onEdit={() => { setEditingPlan(plan); setShowPlanModal(true); }}
              onAssign={() => { setSelectedPlan(plan); setShowAssignModal(true); }}
            />
          ))}
          {plans.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 font-bold italic">Nenhum plano configurado.</div>
          )}
        </div>
      )}

      {/* TAB 2: Assinantes Ativos */}
      {activeTab === 'assinantes_gestao' && (
        <div className="space-y-6 animate-fade-in">
          {filteredSubscriptions.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CreditCard size={32} className="text-slate-350" />
              </div>
              <h3 className="text-lg font-bold text-primary mb-1">Nenhum assinante cadastrado</h3>
              <p className="text-muted text-sm max-w-xs mx-auto font-medium">Ainda não há clientes pagando recorrência no Clube de Assinaturas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredSubscriptions.map(sub => (
                <SubscriptionCard 
                  key={sub.id} 
                  sub={sub} 
                  plan={plans.find(p => p.id === sub.plano_id)}
                  isAdmin={canManage}
                  onRegisterUsage={handleRegisterUsage}
                  onRenew={handleManualRenewSubscription}
                  onToggleAutoRenew={handleToggleAutoRenew}
                  onStatusChange={handleUpdateSubscriptionStatus}
                  onDelete={(id) => setDeleteSubId(id)}
                  isClient={false}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2.5: Comissões & Relatórios de Assinatura */}
      {activeTab === 'assinantes_comissoes' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-6 border border-slate-100 rounded-[2rem] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                <DollarSign size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase text-primary tracking-widest">Apuração de Comissões</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Período mensal de fechamento e rateio</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-slate-200 outline-none rounded-xl py-2.5 px-3 text-xs font-black text-primary cursor-pointer font-bold"
              >
                {(() => {
                  const list = [];
                  const date = new Date();
                  for (let i = 0; i < 12; i++) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const label = format(date, 'MMMM yyyy', { locale: ptBR });
                    list.push({ value: `${year}-${month}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
                    date.setMonth(date.getMonth() - 1);
                  }
                  return list.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ));
                })()}
              </select>

              <button
                type="button"
                onClick={loadComissoesData}
                disabled={loadingUsages}
                className="p-3 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-100 transition flex items-center justify-center cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw size={14} className={loadingUsages ? "animate-spin" : ""} />
              </button>

              {isMonthReleased ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm">
                  <CheckCircle size={14} />
                  <span>Lançado no Financeiro</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleReleaseCommissions}
                  disabled={postingCommissions || loadingUsages || totalCommissionsToRelease === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2 cursor-pointer"
                >
                  {postingCommissions ? <Loader2 className="animate-spin" size={14} /> : <DollarSign size={14} />}
                  <span>Lançar Comissões</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Receita de Assinaturas Ativas</span>
              <span className="text-xl font-black text-slate-800">
                R$ {totalSubRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Soma de {activeSubs.length} planos ativos</span>
            </div>
            
            <div className="bg-white border p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Comissões Calculadas</span>
              <span className="text-xl font-black text-indigo-600">
                R$ {totalCommissionsToRelease.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Rateio de comissão mensal</span>
            </div>

            <div className="bg-white border p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Cortes Realizados</span>
              <span className="text-xl font-black text-slate-800">
                {totalCutsCount} atendimentos
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Utilização de cabelo</span>
            </div>

            <div className="bg-white border p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Barbas Realizadas</span>
              <span className="text-xl font-black text-slate-800">
                {totalBeardsCount} atendimentos
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Utilização de barba</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h5 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                <Briefcase size={14} className="text-indigo-600" />
                <span>Rateio por Profissional</span>
              </h5>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                {calculatedCommissions.length} barbeiros ativos
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-450 uppercase tracking-widest border-b">
                    <th className="p-5">Barbeiro</th>
                    <th className="p-5 text-center">Cortes</th>
                    <th className="p-5 text-center">Barbas</th>
                    <th className="p-5 text-center font-bold">Total Serviços</th>
                    <th className="p-5 text-right font-black">Comissão Rateada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {calculatedCommissions.map(c => (
                    <tr key={c.uid} className="hover:bg-slate-50/50 transition">
                      <td className="p-5 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border overflow-hidden flex items-center justify-center">
                          {c.foto ? (
                            <img src={c.foto} alt={c.nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Users size={14} className="text-slate-400" />
                          )}
                        </div>
                        <span className="font-extrabold text-slate-800">{c.nome}</span>
                      </td>
                      <td className="p-5 text-center text-slate-600 font-bold">{c.cuts}x</td>
                      <td className="p-5 text-center text-slate-600 font-bold">{c.beards}x</td>
                      <td className="p-5 text-center font-black text-indigo-600">{c.totalServices} serviços</td>
                      <td className="p-5 text-right font-black text-emerald-600">R$ {c.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {calculatedCommissions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400 italic">Nenhum profissional com dados registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2.75: Rendimento & Performance das Assinaturas */}
      {activeTab === 'assinaturas_rendimento' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-6 border border-slate-100 rounded-[2rem] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                <TrendingUp size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase text-primary tracking-widest">Rendimento & Analytics</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Métricas de saúde e viabilidade financeira</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <select 
                value={selectedMonth} 
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white border border-slate-200 outline-none rounded-xl py-2.5 px-3 text-xs font-black text-primary cursor-pointer font-bold"
              >
                {(() => {
                  const list = [];
                  const date = new Date();
                  for (let i = 0; i < 12; i++) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const label = format(date, 'MMMM yyyy', { locale: ptBR });
                    list.push({ value: `${year}-${month}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
                    date.setMonth(date.getMonth() - 1);
                  }
                  return list.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ));
                })()}
              </select>

              <button
                type="button"
                onClick={loadComissoesData}
                disabled={loadingUsages}
                className="p-3 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-100 transition flex items-center justify-center cursor-pointer"
                title="Atualizar dados"
              >
                <RefreshCw size={14} className={loadingUsages ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border p-5 rounded-[2rem] shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Receita Real das Assinaturas</span>
                <span className="text-xl font-black text-slate-800 block">
                  R$ {totalSubRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-450 block mt-2 uppercase font-black">
                {activeSubs.length} assinantes ativos no mês
              </span>
            </div>

            <div className="bg-white border p-5 rounded-[2rem] shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Equivalente se Fosse Avulso</span>
                <span className="text-xl font-black text-slate-800 block">
                  R$ {totalValueIfAvulso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] font-bold text-indigo-600 block mt-2 uppercase font-black">
                Faturamento avulso projetado
              </span>
            </div>

            <div className="bg-white border p-5 rounded-[2rem] shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Economia Líquida dos Clientes</span>
                <span className={`text-xl font-black block ${clientSavings > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  R$ {Math.abs(clientSavings).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <span className="text-[9px] font-bold text-slate-450 block mt-2 uppercase font-black">
                {clientSavings > 0 
                  ? `${clientSavingsPercent.toFixed(0)}% de economia média` 
                  : 'Geração de margem de retenção'}
              </span>
            </div>

            <div className="bg-white border p-5 rounded-[2rem] shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Utilização das Assinaturas</span>
                <span className="text-xl font-black text-slate-800 block">
                  {avgVisitsPerActiveSub} visitas/mês
                </span>
              </div>
              <span className="text-[9px] font-bold text-indigo-600 block mt-2 uppercase font-black">
                Média por assinante ativo
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
              <h5 className="text-xs font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Scissors size={14} className="text-slate-500" />
                <span>Perfil de Consumo das Assinaturas</span>
              </h5>

              {filteredUsages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold italic text-xs">
                  Sem serviços registrados neste período.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                        <span>Cortes de Cabelo</span>
                        <span>{totalCutsCount} ({cutsPercent}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${cutsPercent}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                        <span>Serviços de Barba</span>
                        <span>{totalBeardsCount} ({beardsPercent}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${beardsPercent}%` }} />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 mb-1">
                        <span>Sobrancelha & Outros adicionais</span>
                        <span>{totalOthersCount} ({othersPercent}%)</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-400 rounded-full" style={{ width: `${othersPercent}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 border rounded-2xl text-[11px] font-medium text-slate-600">
                    O ticket médio que seria gerado por atendimento sob assinatura é de{' '}
                    <strong className="text-slate-800 font-black">
                      R$ {((filteredUsages.length > 0 ? totalValueIfAvulso / filteredUsages.length : 0)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}
                    </strong>{' '}
                    com base no valor de tabela dos serviços.
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm">
              <h5 className="text-xs font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                <Users size={14} className="text-slate-500" />
                <span>Distribuição por Barbeiro</span>
              </h5>

              {filteredUsages.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-bold italic text-xs">
                  Sem atendimentos registrados por profissionais neste mês.
                </div>
              ) : (
                <div className="space-y-4 max-h-[220px] overflow-y-auto pr-1">
                  {calculatedCommissions.map(barber => {
                    const sharePct = filteredUsages.length > 0 
                      ? Math.round((barber.totalServices / filteredUsages.length) * 100) 
                      : 0;

                    return (
                      <div key={barber.uid} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-slate-100 border overflow-hidden flex items-center justify-center shrink-0">
                          {barber.foto ? (
                            <img src={barber.foto} alt={barber.nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Users size={14} className="text-slate-400" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-700 font-bold">
                            <span className="truncate">{barber.nome}</span>
                            <span>{barber.totalServices} serviços ({sharePct}%)</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${sharePct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Subscriber Engagement Table */}
          <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h5 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                <History size={14} className="text-slate-500" />
                <span>Ranking de Engajamento de Clientes</span>
              </h5>
              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full uppercase tracking-wider">
                Quem mais usa a Assinatura
              </span>
            </div>

            {loadingUsages ? (
              <div className="py-20 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-indigo-600" size={28} />
                <span className="text-xs font-bold uppercase tracking-widest">Carregando métricas de engajamento...</span>
              </div>
            ) : clientStats.length === 0 ? (
              <div className="py-16 text-center text-slate-400 font-bold italic text-xs">
                Nenhum cliente ativo utilizou a assinatura no mês selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black text-slate-450 uppercase tracking-widest border-b">
                      <th className="p-5">Assinante</th>
                      <th className="p-5">Plano Vigente</th>
                      <th className="p-5 text-center">Frequência no Mês</th>
                      <th className="p-5 text-center">Detalhamento</th>
                      <th className="p-5 text-right">Custo Avulso Equivalente</th>
                      <th className="p-5 text-right">Saldo do Cliente (Mês)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clientStats.map((client, idx) => {
                      const isHighUser = client.totalVisits >= 3;

                      return (
                        <tr key={client.clientId || idx} className="hover:bg-slate-50/50 transition">
                          <td className="p-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-slate-100 border overflow-hidden flex items-center justify-center shrink-0">
                                {client.foto ? (
                                  <img src={client.foto} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <Users size={16} className="text-slate-400" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-black text-slate-800 leading-tight">{client.name}</p>
                                  {isHighUser && (
                                    <span className="bg-indigo-100 text-indigo-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                      SUPER ATIVO
                                    </span>
                                  )}
                                </div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase">Assinante Recorrente</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <div>
                              <span className="inline-block bg-slate-100 border border-slate-150 text-slate-700 text-[9px] font-black px-2.5 py-1 rounded-full uppercase mb-0.5">
                                {client.planName}
                              </span>
                              <p className="text-[9px] font-bold text-slate-400">
                                Pago: R$ {client.planPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                              </p>
                            </div>
                          </td>
                          <td className="p-5 text-center">
                            <span className="text-sm font-black text-slate-800">{client.totalVisits}x</span>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase font-black">atendimentos</span>
                          </td>
                          <td className="p-5 text-center">
                            <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-slate-500">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-full">{client.totalCuts} Cortes</span>
                              <span className="bg-slate-100 px-2 py-0.5 rounded-full">{client.totalBeards} Barbas</span>
                              {client.totalOthers > 0 && (
                                <span className="bg-slate-100 px-2 py-0.5 rounded-full">{client.totalOthers} Outros</span>
                              )}
                            </div>
                          </td>
                          <td className="p-5 text-right font-bold text-xs text-slate-700">
                            R$ {client.avulsoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-5 text-right">
                            {client.savings > 0 ? (
                              <div>
                                <span className="text-xs font-black text-emerald-600">
                                  Economizou R$ {client.savings.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[8px] font-bold text-slate-450 block uppercase font-black tracking-wider text-emerald-500">cliente economizou</span>
                              </div>
                            ) : (
                              <div>
                                <span className="text-xs font-black text-slate-600">
                                  Roteou R$ {Math.abs(client.savings).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                                <span className="text-[8px] font-bold text-slate-450 block uppercase tracking-wider text-slate-405 font-black">margem barbearia</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CLIENT SPECIFIC VIEWS */}

      {/* CLIENT TAB 1: Minha Assinatura */}
      {activeTab === 'meu_plano' && (
        <div className="space-y-6">
          {subscriptions.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-border rounded-[2rem] p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CreditCard size={32} className="text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-primary mb-1">Nenhuma assinatura ativa</h3>
              <p className="text-muted text-sm max-w-sm mx-auto font-medium">Você ainda não assinou nenhum de nossos planos de fidelidade recorrente. Escolha um plano ao lado ou fale com o balcão!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {subscriptions.map(sub => (
                <SubscriptionCard 
                  key={sub.id} 
                  sub={sub} 
                  plan={plans.find(p => p.id === sub.plano_id)}
                  isAdmin={false}
                  onRegisterUsage={() => {}}
                  onToggleAutoRenew={handleToggleAutoRenew}
                  onStatusChange={handleUpdateSubscriptionStatus}
                  isClient={true}
                />
              ))}
            </div>
          )}

          <div className="pt-6">
            <h3 className="font-bold text-slate-800 text-base mb-6 flex items-center gap-2 font-black">
              <Star size={18} className="text-accent" />
              NOSSOS PLANOS DISPONÍVEIS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.filter(p => p.status === 'active' && p.showInPortal !== false).map(plan => (
                <PlanCard 
                  key={plan.id} 
                  plan={plan} 
                  isAdmin={false}
                  onEdit={() => {}}
                  onAssign={() => {}}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOGS */}
      <ConfirmationModal
        isOpen={!!deleteSubId}
        onClose={() => setDeleteSubId(null)}
        onConfirm={handleConfirmDeleteSubscription}
        title="Excluir Assinatura Permanentemente"
        description="Deseja realmente excluir esta assinatura permanentemente do banco de dados? O cliente perderá o acesso imediato ao Clube de Benefícios."
      />

      {showComandaModal && comandaInitialData && (
        <ComandaModal
          initialData={comandaInitialData}
          onClose={() => {
            setShowComandaModal(false);
            setComandaInitialData(null);
          }}
          onSave={() => {
            setShowComandaModal(false);
            setComandaInitialData(null);
            loadData();
          }}
        />
      )}

      {/* MODAL: CADASTRO / EDIÇÃO DE PLANO */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl my-8 text-primary outline-none"
            >
              <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-primary">
                    {editingPlan ? `Editar Plano: ${editingPlan.name}` : 'Criar Novo Plano de Assinatura'}
                  </h2>
                  <p className="text-muted text-xs font-bold uppercase tracking-widest mt-1">Configurar regras de faturamento recorrente</p>
                </div>
                <button type="button" onClick={() => setShowPlanModal(false)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSavePlan} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-bold text-sm">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest ml-1">Nome do Plano</label>
                      <input required type="text" name="name" defaultValue={editingPlan?.name || ''} placeholder="Ex: Clube do Cabelo Premium" className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none font-semibold" />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest ml-1">Descrição Comercial</label>
                      <textarea required name="description" defaultValue={editingPlan?.description || ''} placeholder="Ex: Cortes de cabelo ilimitados e descontos exclusivos em produtos." rows={3} className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none font-semibold resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest ml-1">Valor Mensal (R$)</label>
                        <input required type="number" name="price" step="0.01" defaultValue={editingPlan?.price || ''} placeholder="99.90" className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none font-extrabold" />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest ml-1">Status</label>
                        <select name="status" defaultValue={editingPlan?.status || 'active'} className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none cursor-pointer font-extrabold">
                          <option value="active">Ativo / Disponível</option>
                          <option value="inactive">Inativo / Oculto</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border border-dashed border-slate-200 p-4 rounded-xl bg-slate-50/40">
                      <div>
                        <label className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest ml-1">Cortes / mês</label>
                        <input required type="number" name="haircutsPerMonth" defaultValue={editingPlan?.haircutsPerMonth ?? 4} min="0" className="w-full bg-white border border-slate-150 rounded-xl py-2 px-3 text-sm focus:outline-none text-primary outline-none font-bold text-center" />
                        <span className="text-[8px] text-slate-400 mt-1 block text-center uppercase tracking-wider font-semibold">Cabelo Inclusos</span>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-indigo-800 uppercase tracking-widest ml-1">Barbas / mês</label>
                        <input required type="number" name="beardsPerMonth" defaultValue={editingPlan?.beardsPerMonth ?? 0} min="0" className="w-full bg-white border border-slate-150 rounded-xl py-2 px-3 text-sm focus:outline-none text-primary outline-none font-bold text-center" />
                        <span className="text-[8px] text-slate-400 mt-1 block text-center uppercase tracking-wider font-semibold">Barba Inclusas</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-550 uppercase tracking-widest ml-1">Benefícios Extras (Separar por vírgula)</label>
                      <input type="text" name="extraBenefits" defaultValue={editingPlan?.extraBenefits.join(', ') || ''} placeholder="Ex: Cafezinho cortesia, 10% off em pomadas" className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none font-semibold" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* CONFIGURAÇÃO DE COMISSIONAMENTO DO PLANO */}
                    <div className="border border-indigo-150 p-5 rounded-2xl bg-indigo-50/20 space-y-4">
                      <div className="flex items-center gap-2">
                        <Percent className="text-indigo-600" size={18} />
                        <h4 className="text-xs font-black text-indigo-950 uppercase tracking-widest">Modelo de Comissão para Profissionais</h4>
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-indigo-800 uppercase tracking-widest">Forma de Comissão por Atendimento</label>
                        <select 
                          value={planComissaoTipo} 
                          onChange={(e: any) => setPlanComissaoTipo(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-primary outline-none cursor-pointer mt-1 font-bold"
                        >
                          <option value="fixo">Comissão Fixa (Valor fixo por atendimento)</option>
                          <option value="pool_atendimentos">Rateio no Pool de Atendimentos (Por quantidade)</option>
                          <option value="pool_pontos">Rateio no Pool de Pontos (Por peso do serviço)</option>
                        </select>
                      </div>

                      {planComissaoTipo === 'fixo' && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-indigo-800 uppercase tracking-widest">Valor Fixo Pago por Serviço (R$)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            value={planComissaoFixaValor} 
                            onChange={(e) => setPlanComissaoFixaValor(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-primary outline-none font-bold" 
                          />
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">O profissional ganha este valor a cada corte/barba realizado do assinante.</p>
                        </div>
                      )}

                      {planComissaoTipo !== 'fixo' && (
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-indigo-800 uppercase tracking-widest">% do Faturamento do Plano Destinado ao Pool</label>
                          <input 
                            type="number" 
                            min="1" 
                            max="100" 
                            value={planComissaoPoolPorcentagem} 
                            onChange={(e) => setPlanComissaoPoolPorcentagem(Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-primary outline-none font-bold" 
                          />
                          <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Este percentual da mensalidade do assinante será acumulado num fundo para rateio mensal.</p>
                        </div>
                      )}

                      {planComissaoTipo === 'pool_pontos' && (
                        <div className="space-y-3 pt-2 border-t">
                          <p className="text-[9px] font-bold uppercase text-indigo-900">Peso de Pontuação dos Atendimentos</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cabelo (pts)</label>
                              <input 
                                type="number" 
                                step="0.1" 
                                value={planPontosCorte} 
                                onChange={(e) => setPlanPontosCorte(Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-primary outline-none text-center font-bold" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Barba (pts)</label>
                              <input 
                                type="number" 
                                step="0.1" 
                                value={planPontosBarba} 
                                onChange={(e) => setPlanPontosBarba(Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-primary outline-none text-center font-bold" 
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Outros (pts)</label>
                              <input 
                                type="number" 
                                step="0.1" 
                                value={planPontosOutros} 
                                onChange={(e) => setPlanPontosOutros(Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-primary outline-none text-center font-bold" 
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* CONFIGURAÇÃO DE DESCONTOS DA ASSINATURA */}
                    <div className="border border-slate-150 p-5 rounded-2xl bg-indigo-50/20 space-y-4">
                      <div className="flex items-center gap-2">
                        <Percent className="text-indigo-600" size={18} />
                        <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest font-black">Regulamento de Descontos Adicionais</h4>
                      </div>

                      <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                        Defina quais itens (serviços ou produtos) possuem desconto para os assinantes deste plano. Você pode selecionar itens específicos ou categorias gerais ("Todos os Serviços", "Todos os Produtos").
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="space-y-1.5 sm:col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Item / Categoria</label>
                          <select
                            value={discountItemId}
                            onChange={(e) => setDiscountItemId(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-primary outline-none cursor-pointer font-bold"
                          >
                            <option value="">-- Selecione o item ou categoria --</option>
                            <optgroup label="Categorias Gerais">
                              <option value="all_services">Todos os Serviços</option>
                              <option value="all_products">Todos os Produtos</option>
                            </optgroup>
                            <optgroup label="Serviços Individuais">
                              {services.map(s => (
                                <option key={`servico_${s.id}`} value={`servico_${s.id}`}>
                                  Serviço: {s.nome} (R$ {(s.preco ?? s.price ?? 0).toFixed(2)})
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Produtos Individuais">
                              {products.map(p => (
                                <option key={`product_${p.id}`} value={`product_${p.id}`}>
                                  Produto: {p.name} (R$ {(p.salePrice ?? p.preco ?? 0).toFixed(2)})
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">% Desconto</label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={discountPercentage}
                                onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-primary outline-none font-bold"
                                placeholder="10"
                              />
                              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">%</span>
                            </div>
                            <button
                              type="button"
                              onClick={handleAddDiscount}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 rounded-xl text-sm transition-all flex items-center justify-center shrink-0 active:scale-95 cursor-pointer"
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        </div>
                      </div>

                      {planDiscounts.length > 0 ? (
                        <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                          {planDiscounts.map((discount) => (
                            <div
                              key={discount.itemId}
                              className="bg-white border border-slate-150 p-2.5 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors font-bold text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md tracking-wider bg-indigo-50 border border-indigo-150 text-indigo-700 font-black">
                                  {discount.itemType === 'all_services' || discount.itemType === 'servico' ? 'Serviço' : 'Produto'}
                                </span>
                                <span className="text-slate-700">{discount.itemName}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-emerald-600 font-black">
                                  {discount.percentage}% de Desconto
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveDiscount(discount.itemId)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-200 rounded-xl p-4 text-center">
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nenhum desconto configurado para esta assinatura</p>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
                      <div>
                        <h5 className="text-xs font-bold text-primary uppercase tracking-wider">Disponível no Portal do Cliente</h5>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Exibir este plano para assinatura online</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPlanShowInPortal(!planShowInPortal)}
                        className={`w-12 h-6 rounded-full transition relative shrink-0 cursor-pointer ${planShowInPortal ? 'bg-emerald-600' : 'bg-slate-350'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition shadow-md ${planShowInPortal ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 font-bold">
                  <button type="button" onClick={() => setShowPlanModal(false)} className="flex-1 py-4 border border-slate-200 rounded-xl text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer">Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={isSavingPlan}
                    className="flex-[2] py-4 bg-primary text-white rounded-xl text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    {isSavingPlan ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Plano'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal: Vincular Assinante */}
      <AnimatePresence>
        {showAssignModal && selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-primary">Ativar Assinatura de Cliente</h2>
                  <p className="text-muted text-xs font-bold uppercase tracking-widest mt-1">Plano Escolhido: {selectedPlan.name}</p>
                </div>
                <button type="button" onClick={() => setShowAssignModal(false)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAssignSubscription} className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Buscar Cliente</label>
                  <select name="clientId" required className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none cursor-pointer font-extrabold">
                    <option value="">Selecione o Cliente do Clube...</option>
                    {clients.map((c, index) => <option key={`assign-client-${c.uid || index}-${index}`} value={c.uid}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <input type="checkbox" name="autoRenew" id="autoRenew" defaultChecked className="w-5 h-5 accent-accent rounded-lg cursor-pointer" />
                  <label htmlFor="autoRenew" className="text-sm font-bold text-primary cursor-pointer select-none">Renovação Mensal Automática</label>
                </div>
                <div className="flex gap-3 pt-4 font-bold">
                  <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-4 border border-slate-205 rounded-xl text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer">Cancelar</button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-4 bg-primary text-white rounded-xl text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                  >
                    Ir para o Caixa / PDV
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon, isCurrency }: any) {
  return (
    <div className="p-6 bg-white border border-slate-200 rounded-[2rem] space-y-4 shadow-sm">
      <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black text-primary">
          {isCurrency ? `R$ ${value.toFixed(2)}` : value}
        </p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 font-black">{title}</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: any) {
  return (
    <button 
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
        active 
          ? 'bg-white text-primary shadow-sm border border-slate-100 font-black' 
          : 'text-slate-500 hover:text-primary hover:bg-slate-50/50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

interface PlanCardProps {
  key?: React.Key;
  plan: SubscriptionPlan;
  isAdmin: boolean;
  onEdit: () => void;
  onAssign: () => void;
}

function PlanCard({ plan, isAdmin, onEdit, onAssign }: PlanCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 flex flex-col h-full group hover:border-accent/30 transition-all shadow-sm relative overflow-hidden">
      <div className="flex items-start justify-between mb-6">
        <div className="w-14 h-14 bg-accent/5 border border-accent/10 rounded-2xl flex items-center justify-center text-accent shadow-sm">
          <Star size={28} />
        </div>
        {isAdmin && (
          <button 
            type="button"
            onClick={onEdit} 
            className="p-2 text-slate-300 hover:text-primary hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
          >
            <Edit2 size={18} />
          </button>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-2xl font-bold text-primary mb-2 group-hover:text-accent transition-colors">{plan.name}</h3>
        <p className="text-muted text-sm line-clamp-2 font-medium">{plan.description}</p>
      </div>

      <div className="mb-8">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold text-muted">R$</span>
          <span className="text-4xl font-bold text-primary">{plan.price.toFixed(2).split('.')[0]}</span>
          <span className="text-sm font-bold text-muted">,{plan.price.toFixed(2).split('.')[1]}</span>
          <span className="text-xs font-bold text-slate-400 ml-2 uppercase tracking-widest font-black">/mês</span>
        </div>
      </div>

      <div className="space-y-4 flex-1 mb-8">
        <BenefitItem icon={<Scissors size={14} />} text={`${plan.haircutsPerMonth} Cortes por mês`} />
        {plan.beardsPerMonth > 0 && <BenefitItem icon={<Zap size={14} />} text={`${plan.beardsPerMonth} Barbas por mês`} />}
        {plan.extraBenefits.map((benefit, i) => (
          <BenefitItem key={i} icon={<CheckCircle2 size={14} />} text={benefit} />
        ))}
      </div>

      {isAdmin && (
        <button 
          type="button"
          onClick={onAssign}
          className="w-full py-4 bg-slate-50 border border-slate-100 text-primary rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
        >
          Vincular Cliente
        </button>
      )}
      
      {plan.status === 'inactive' && (
        <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest font-black">
          Inativo
        </div>
      )}
    </div>
  );
}

interface BenefitItemProps {
  key?: React.Key;
  icon: React.ReactNode;
  text: string;
}

function BenefitItem({ icon, text }: BenefitItemProps) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <div className="text-accent">{icon}</div>
      <span className="text-xs font-bold uppercase tracking-widest">{text}</span>
    </div>
  );
}

interface SubscriptionCardProps {
  key?: React.Key;
  sub: Subscription;
  plan?: SubscriptionPlan;
  isAdmin: boolean;
  onRegisterUsage: (id: string, type: 'haircut' | 'beard') => void;
  onRenew?: (id: string) => void;
  onToggleAutoRenew?: (id: string, autoRenew: boolean) => void;
  onStatusChange?: (id: string, status: SubscriptionStatus) => void;
  onDelete?: (id: string) => void;
  isClient?: boolean;
}

function SubscriptionCard({ 
  sub, 
  plan, 
  isAdmin, 
  onRegisterUsage, 
  onRenew, 
  onToggleAutoRenew, 
  onStatusChange, 
  onDelete,
  isClient 
}: SubscriptionCardProps) {
  if (!plan) return null;

  const statusColors: Record<SubscriptionStatus, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    expired: 'bg-red-50 text-red-600 border-red-100',
    canceled: 'bg-slate-50 text-slate-600 border-slate-100',
    paused: 'bg-amber-50 text-amber-600 border-amber-100',
    pending: 'bg-blue-50 text-blue-600 border-blue-100'
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 space-y-8 shadow-sm group hover:border-accent/20 transition-all flex flex-col justify-between h-full">
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="text-accent" size={24} />
            </div>
            <div>
              <h4 className="font-bold text-primary group-hover:text-accent transition-colors font-black">{sub.cliente_name}</h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-muted uppercase tracking-widest font-black">{plan.name}</span>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${statusColors[sub.status]} font-black`}>
                  {sub.status}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 font-black">Vence em</p>
            <p className="text-sm font-bold text-primary font-black">{format(parseISO(sub.endDate), 'dd/MM/yyyy')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <UsageIndicator 
            label="Cortes" 
            used={sub.haircutsUsed} 
            total={plan.haircutsPerMonth} 
            onAdd={isAdmin && sub.status === 'active' ? () => onRegisterUsage(sub.id, 'haircut') : undefined}
          />
          <UsageIndicator 
            label="Barbas" 
            used={sub.beardsUsed} 
            total={plan.beardsPerMonth} 
            onAdd={isAdmin && sub.status === 'active' && plan.beardsPerMonth > 0 ? () => onRegisterUsage(sub.id, 'beard') : undefined}
          />
        </div>

        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted">
            <RefreshCw size={14} className={sub.autoRenew ? 'text-emerald-500' : 'text-slate-300'} />
            <span className="text-[10px] font-bold uppercase tracking-widest font-black">
              {sub.autoRenew ? 'Renovação Mensal Automática' : 'Renovação Manual'}
            </span>
          </div>
        </div>
      </div>

      {(isAdmin || isClient) && (
        <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end mt-4">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onRenew?.(sub.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 border border-indigo-150 text-indigo-700 hover:bg-indigo-100 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Renovar assinatura por mais 1 mês"
            >
              <RefreshCw size={11} />
              <span>Renovar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onToggleAutoRenew?.(sub.id, !sub.autoRenew)}
            className={`flex items-center gap-1 px-3 py-1.5 border transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black ${
              sub.autoRenew
                ? 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100'
                : 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
            }`}
            title={sub.autoRenew ? "Desativar renovação automática" : "Ativar renovação automática"}
          >
            <span>{sub.autoRenew ? 'Desativar Auto' : 'Ativar Auto'}</span>
          </button>

          {isAdmin && sub.status === 'active' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'paused')}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Pausar benefícios da assinatura"
            >
              <span>Pausar</span>
            </button>
          )}
          {isAdmin && sub.status === 'paused' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'active')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 border border-emerald-700 text-white hover:bg-emerald-700 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Reativar benefícios da assinatura"
            >
              <span>Ativar</span>
            </button>
          )}

          {sub.status !== 'canceled' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'canceled')}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 border border-red-150 text-red-600 hover:bg-red-100 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Cancelar plano permanentemente"
            >
              <span>Cancelar</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete?.(sub.id)}
              className="flex items-center justify-center p-2 bg-slate-50 border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-400 transition rounded-xl cursor-pointer"
              title="Apagar permanentemente do banco"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UsageIndicator({ label, used, total, onAdd }: any) {
  const percentage = Math.min((used / total) * 100, 100);
  
  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative group shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-black">{label}</p>
        <p className="text-sm font-bold text-primary font-black">{used} / {total}</p>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${percentage >= 100 ? 'bg-red-500' : 'bg-accent'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {onAdd && used < total && (
        <button 
          type="button"
          onClick={onAdd}
          className="absolute -top-2 -right-2 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95 cursor-pointer"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}
