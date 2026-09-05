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
  Info,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  QrCode,
  Copy,
  ExternalLink,
  Receipt,
  SkipForward,
  Wallet,
  FileText,
  CheckCheck,
  Sparkles,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, isBefore, startOfDay, addMonths } from 'date-fns';
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

  // Search/Filters/View Mode/Pagination for Assinantes (Gestão)
  const [searchQuery, setSearchQuery] = useState('');
  const [subViewMode, setSubViewMode] = useState<'list' | 'grid'>('list');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [subPlanFilter, setSubPlanFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, subStatusFilter, subPlanFilter, itemsPerPage]);

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
  const [deletePlanTarget, setDeletePlanTarget] = useState<SubscriptionPlan | null>(null);
  const [assignActivationType, setAssignActivationType] = useState<'manual' | 'asaas'>('manual');
  const [assignSelectedClientId, setAssignSelectedClientId] = useState<string>('');
  const [assignClientCpf, setAssignClientCpf] = useState<string>('');
  const [assignClientEmail, setAssignClientEmail] = useState<string>('');

  const isValidCPF = (cpf: string) => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;
    return true;
  };

  const formatCpfMask = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length > 9) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if (digits.length > 6) return digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (digits.length > 3) return digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return digits;
  };
  
  // State for Asaas Charge Result Modal (Pix QR Code, Copy/Paste, Payment Link)
  const [createdChargeData, setCreatedChargeData] = useState<{
    id: string;
    paymentUrl?: string;
    pixCopiaECola?: string;
    pixQrCodeUrl?: string;
    planName?: string;
    price?: number;
    clientName?: string;
    status?: string;
  } | null>(null);
  const [showCreatedChargeModal, setShowCreatedChargeModal] = useState(false);

  // State for Skip Invoice / Baixa Manual Modal
  const [skipInvoiceSub, setSkipInvoiceSub] = useState<Subscription | null>(null);
  const [isSkippingInvoice, setIsSkippingInvoice] = useState(false);
  const [isSyncingAsaas, setIsSyncingAsaas] = useState(false);

  // State for Invoices History Modal
  const [invoicesHistorySub, setInvoicesHistorySub] = useState<Subscription | null>(null);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const [planShowInPortal, setPlanShowInPortal] = useState(true);
  const [planAllowedPaymentMethods, setPlanAllowedPaymentMethods] = useState<('PIX' | 'CREDIT_CARD')[]>(['PIX', 'CREDIT_CARD']);
  const [planAllowClientCancel, setPlanAllowClientCancel] = useState(true);

  // States for viewing subscriber details & updating dates
  const [selectedSubDetail, setSelectedSubDetail] = useState<Subscription | null>(null);
  const [subUsages, setSubUsages] = useState<any[]>([]);
  const [loadingSubUsages, setLoadingSubUsages] = useState(false);
  const [newSubStartDate, setNewSubStartDate] = useState('');
  const [newSubEndDate, setNewSubEndDate] = useState('');
  const [isSavingSubDates, setIsSavingSubDates] = useState(false);
  const [planComissaoTipo, setPlanComissaoTipo] = useState<'fixo' | 'pool_atendimentos' | 'pool_pontos'>('fixo');
  const [planComissaoPoolPorcentagem, setPlanComissaoPoolPorcentagem] = useState(50);
  const [planComissaoFixaValor, setPlanComissaoFixaValor] = useState(10.00);
  const [planPontosCorte, setPlanPontosCorte] = useState(1);
  const [planPontosBarba, setPlanPontosBarba] = useState(1);
  const [planPontosOutros, setPlanPontosOutros] = useState(0.5);
  const [planPontosServicos, setPlanPontosServicos] = useState<Record<string, number>>({});
  const [planServices, setPlanServices] = useState<any[]>([]);
  const [selectedPlanServiceId, setSelectedPlanServiceId] = useState<string>('');

  const handleAddPlanService = () => {
    if (!selectedPlanServiceId) {
      toast.error('Selecione um serviço para adicionar.');
      return;
    }
    if (planServices.some(ps => ps.serviceId === selectedPlanServiceId)) {
      toast.error('Este serviço já está na assinatura.');
      return;
    }
    const service = services.find(s => s.id === selectedPlanServiceId);
    if (!service) return;

    const defaultPoints = service.nome.toLowerCase().includes('sobrancelha') ? 0.5 : 1;

    setPlanServices([
      ...planServices,
      {
        serviceId: service.id,
        name: service.nome,
        limit: 4,
        isUnlimited: false,
        points: defaultPoints
      }
    ]);
    setPlanPontosServicos(prev => ({ ...prev, [service.id]: defaultPoints }));
    setSelectedPlanServiceId('');
  };

  const handleRemovePlanService = (serviceId: string) => {
    setPlanServices(planServices.filter(ps => ps.serviceId !== serviceId));
  };

  const handleUpdatePlanService = (serviceId: string, fields: Partial<any>) => {
    setPlanServices(planServices.map(ps => {
      if (ps.serviceId === serviceId) {
        return { ...ps, ...fields };
      }
      return ps;
    }));
  };

  const [commDateMode, setCommDateMode] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [commStartDate, setCommStartDate] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [commEndDate, setCommEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [commBarberFilter, setCommBarberFilter] = useState<string>('all');
  const [commCycleFilter, setCommCycleFilter] = useState<string>('all');
  const [selectedBarberDetailModal, setSelectedBarberDetailModal] = useState<any | null>(null);

  const [allUsages, setAllUsages] = useState<any[]>([]);
  const [barbeiros, setBarbeiros] = useState<UserProfile[]>([]);
  const [releasedRuns, setReleasedRuns] = useState<Record<string, any>>({});
  const [loadingUsages, setLoadingUsages] = useState(false);
  const [postingCommissions, setPostingCommissions] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [historyBarberFilter, setHistoryBarberFilter] = useState<string>('all');

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
        userService.getAllBarbers(),
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

      // Fetch Subscription plans, clients, and usage history/commission data
      const [p, s, c, usages, b, runsSnap] = await Promise.all([
        subscriptionService.getPlans(),
        subscriptionService.getSubscriptions(profile?.tipo === 'cliente' ? user?.uid : undefined),
        canManage ? userService.getAllClients() : Promise.resolve([]),
        canManage ? subscriptionService.getAllUsageHistory() : Promise.resolve([]),
        canManage ? userService.getAllBarbers() : Promise.resolve([]),
        canManage ? getDocs(collection(db, 'subscription_commission_runs')) : Promise.resolve({ forEach: () => {} } as any)
      ]);
      setPlans(p);
      setSubscriptions(s);
      
      if (canManage) {
        setClients(c.filter(client => client.ativo !== false));
        setAllUsages(usages);
        setBarbeiros(b);
        
        const runs: Record<string, any> = {};
        if (runsSnap && typeof runsSnap.forEach === 'function') {
          runsSnap.forEach((doc: any) => {
            runs[doc.id] = doc.data();
          });
        }
        setReleasedRuns(runs);
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
    let unsubSubs: (() => void) | undefined;

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

      // Subscriptions real-time listener
      unsubSubs = subscriptionService.subscribeToSubscriptions(
        profile?.tipo === 'cliente' ? user?.uid : undefined,
        (updatedSubs) => {
          setSubscriptions(updatedSubs);
        }
      );
    };

    loadData();
    setupListeners();

    return () => {
      if (unsubServ) unsubServ();
      if (unsubProd) unsubProd();
      if (unsubSubs) unsubSubs();
    };
  }, [profile?.uid, profile?.tipo, activeTab, user?.uid, canManage]);

  // Auto-sync & poll status when charge modal is displayed
  useEffect(() => {
    if (!showCreatedChargeModal || !createdChargeData || createdChargeData.status === 'active') return;

    // 1. Instant check against real-time subscriptions array
    const activeSub = subscriptions.find(s => 
      (s.id === createdChargeData.id || 
       s.externalReference === `client_sub:${createdChargeData.id}` || 
       s.asaasInvoiceId === createdChargeData.id || 
       s.asaasSubscriptionId === createdChargeData.id) && 
      s.status === 'active' && (s.asaasPaymentStatus === 'received' || s.activationType === 'manual')
    );

    if (activeSub) {
      setCreatedChargeData(prev => prev ? { ...prev, status: 'active' } : null);
      toast.success("Pagamento verificado! Assinatura ativada.");
      loadData();
      setTimeout(() => setShowCreatedChargeModal(false), 1500);
      return;
    }

    // 2. Polling /api/saas/payment/check-status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/saas/payment/check-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentId: createdChargeData.id, subscriptionId: createdChargeData.id })
        });
        if (res.ok) {
          const data = await res.json();
          const currentStatus = String(data.status || '').toUpperCase();
          const isGenuinelyPaid = data.isPaid === true || ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'RECEIVED_IN_CASH_FEE'].includes(currentStatus);
          if (isGenuinelyPaid) {
            setCreatedChargeData(prev => prev ? { ...prev, status: 'active' } : null);
            toast.success("Pagamento identificado no Asaas! Assinatura ativada com sucesso.");
            await loadData();
            setTimeout(() => setShowCreatedChargeModal(false), 1500);
          }
        }
      } catch (err) {
        console.warn("Polling charge status error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [showCreatedChargeModal, createdChargeData?.id, createdChargeData?.status, subscriptions]);

  useEffect(() => {
    if (showPlanModal) {
      if (editingPlan) {
        setPlanShowInPortal(editingPlan.showInPortal ?? true);
        setPlanAllowedPaymentMethods(editingPlan.allowedPaymentMethods || ['PIX', 'CREDIT_CARD']);
        setPlanAllowClientCancel(editingPlan.allowClientCancel ?? true);
        setPlanComissaoTipo((editingPlan as any).comissao_tipo || 'fixo');
        setPlanComissaoPoolPorcentagem((editingPlan as any).comissao_pool_porcentagem ?? 50);
        setPlanComissaoFixaValor((editingPlan as any).comissao_fixa_valor ?? 10.00);
        setPlanPontosCorte((editingPlan as any).pontos_corte ?? 1);
        setPlanPontosBarba((editingPlan as any).pontos_barba ?? 1);
        setPlanPontosOutros((editingPlan as any).pontos_outros ?? 0.5);
        setPlanPontosServicos((editingPlan as any).pontos_servicos || {});
        
        let initialServices = editingPlan.services || [];
        const ptsMap = (editingPlan as any).pontos_servicos || {};
        if (initialServices.length === 0) {
          const loadedServices: any[] = [];
          if (editingPlan.haircutsPerMonth && editingPlan.haircutsPerMonth > 0) {
            const corteService = services.find(s => s.nome.toLowerCase().includes('corte') || s.nome.toLowerCase().includes('cabelo') || s.nome.toLowerCase().includes('hair'));
            if (corteService) {
              loadedServices.push({
                serviceId: corteService.id,
                name: corteService.nome,
                limit: editingPlan.haircutsPerMonth,
                isUnlimited: editingPlan.haircutsPerMonth >= 999,
                points: ptsMap[corteService.id] !== undefined ? ptsMap[corteService.id] : 1
              });
            }
          }
          if (editingPlan.beardsPerMonth && editingPlan.beardsPerMonth > 0) {
            const barbaService = services.find(s => s.nome.toLowerCase().includes('barba') || s.nome.toLowerCase().includes('beard'));
            if (barbaService) {
              loadedServices.push({
                serviceId: barbaService.id,
                name: barbaService.nome,
                limit: editingPlan.beardsPerMonth,
                isUnlimited: editingPlan.beardsPerMonth >= 999,
                points: ptsMap[barbaService.id] !== undefined ? ptsMap[barbaService.id] : 1
              });
            }
          }
          initialServices = loadedServices;
        } else {
          initialServices = initialServices.map((ps: any) => ({
            ...ps,
            points: ps.points !== undefined ? ps.points : (ptsMap[ps.serviceId] !== undefined ? ptsMap[ps.serviceId] : (ps.name?.toLowerCase().includes('sobrancelha') ? 0.5 : 1))
          }));
        }
        setPlanServices(initialServices);

        setPlanDiscounts(editingPlan.discounts || []);
        setDiscountItemId('');
        setDiscountPercentage(10);
      } else {
        setPlanShowInPortal(true);
        setPlanAllowedPaymentMethods(['PIX', 'CREDIT_CARD']);
        setPlanAllowClientCancel(true);
        setPlanComissaoTipo('fixo');
        setPlanComissaoPoolPorcentagem(50);
        setPlanComissaoFixaValor(10.00);
        setPlanPontosCorte(1);
        setPlanPontosBarba(1);
        setPlanPontosOutros(0.5);
        setPlanPontosServicos({});
        setPlanServices([]);
        setPlanDiscounts([]);
        setDiscountItemId('');
        setDiscountPercentage(10);
      }
    }
  }, [showPlanModal, editingPlan, services]);

  // Handle plan assignments (assign subscription)
  const { execute: handleAssignSubscription, isLoading: isAssigningSub } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    const formData = new FormData(e.currentTarget);
    const cliente_id = formData.get('clientId') as string;
    const client = clients.find(c => c.uid === cliente_id);
    
    if (!client) return;

    const activationType = formData.get('activationType') as 'manual' | 'asaas';
    const autoRenew = formData.get('autoRenew') === 'on';

    // Para qualquer tipo de assinatura (manual ou asaas), CPF e E-mail válidos são obrigatórios
    const rawEmail = assignClientEmail.trim() || client.email || '';
    if (!rawEmail || !rawEmail.includes('@')) {
      toast.error("O E-mail do cliente é obrigatório para registrar uma assinatura. Por favor, informe um e-mail válido.");
      return;
    }

    const rawCpf = assignClientCpf || (formData.get('clientCpf') as string) || client.cpf || (client as any).cpfCnpj || '';
    const cleanCpf = rawCpf.replace(/\D/g, '');

    if (!cleanCpf || cleanCpf.length !== 11) {
      toast.error("Por favor, informe o CPF completo (11 dígitos) do cliente.");
      return;
    }

    if (!isValidCPF(cleanCpf)) {
      toast.error("O CPF informado para o cliente é inválido. Verifique os números digitados.");
      return;
    }

    // Salva CPF e E-mail no documento do cliente no Firestore se ainda não estiver salvo ou se tiver mudado
    if (client.uid) {
      try {
        await updateDoc(doc(db, 'usuarios', client.uid), {
          email: rawEmail,
          cpf: cleanCpf,
          cpfCnpj: cleanCpf,
          updatedAt: serverTimestamp()
        });
        client.email = rawEmail;
        client.cpf = cleanCpf;
        (client as any).cpfCnpj = cleanCpf;
      } catch (e) {
        console.warn("Aviso ao atualizar dados do cliente em Assinaturas:", e);
      }
    }

    if (activationType === 'asaas') {
      const billingType = (formData.get('billingType') as 'PIX' | 'CREDIT_CARD') || 'PIX';

      try {
        const res = await subscriptionService.createAsaasSubscription({
          cliente_id: client.uid,
          cliente_name: client.nome,
          plano_id: selectedPlan.id,
          ownerEmail: rawEmail,
          ownerCpfCnpj: cleanCpf,
          billingType
        });

        toast.success(`Assinatura via Asaas gerada com sucesso para ${client.nome}!`);
        setShowAssignModal(false);
        setAssignSelectedClientId('');
        setAssignClientCpf('');
        setAssignClientEmail('');
        loadData();

        if (res) {
          setCreatedChargeData({
            id: res.id,
            paymentUrl: res.paymentUrl,
            pixCopiaECola: res.pixCopiaECola,
            pixQrCodeUrl: res.pixQrCodeUrl,
            planName: selectedPlan.name,
            price: selectedPlan.price,
            clientName: client.nome,
            status: 'pending',
            billingType: billingType
          });
          setShowCreatedChargeModal(true);
        }
        setSelectedPlan(null);
      } catch (err: any) {
        console.error("Erro ao gerar assinatura Asaas:", err);
        toast.error(err.message || "Erro ao conectar com Asaas para gerar cobrança.");
      }
    } else {
      setComandaInitialData({
        cliente_id: client.uid,
        cliente_name: client.nome,
        origin: 'balcao' as const,
        items: [
          {
            id: `assinatura-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            type: 'assinatura' as const,
            referencia_id: selectedPlan.id,
            name: `Assinatura: ${selectedPlan.name}`,
            quantity: 1,
            unitPrice: selectedPlan.price,
            totalPrice: selectedPlan.price,
            isCortesia: false,
            generateCommission: true,
            metadata: {
              autoRenew
            }
          }
        ]
      });
      setShowAssignModal(false);
      setSelectedPlan(null);
      setShowComandaModal(true);
    }
  });

  const handleViewSubDetail = async (sub: Subscription) => {
    setSelectedSubDetail(sub);
    setNewSubStartDate(sub.startDate);
    setNewSubEndDate(sub.endDate);
    setLoadingSubUsages(true);
    try {
      const history = await subscriptionService.getUsageHistory(sub.id);
      setSubUsages(history);
    } catch (err) {
      console.error("Erro ao carregar histórico de uso da assinatura:", err);
      toast.error("Não foi possível carregar o histórico de atendimentos.");
    } finally {
      setLoadingSubUsages(false);
    }
  };

  const handleSaveSubDates = async () => {
    if (!selectedSubDetail) return;
    setIsSavingSubDates(true);
    try {
      await subscriptionService.updateSubscriptionDates(selectedSubDetail.id, newSubStartDate, newSubEndDate);
      toast.success("Datas da assinatura atualizadas com sucesso!");
      await loadData();
      setSelectedSubDetail(prev => prev ? { ...prev, startDate: newSubStartDate, endDate: newSubEndDate } : null);
    } catch (err) {
      console.error("Erro ao atualizar datas da assinatura:", err);
      toast.error("Erro ao salvar novas datas da assinatura.");
    } finally {
      setIsSavingSubDates(false);
    }
  };

  // Action to confirm Asaas payment (simulate webhook)
  const handleConfirmAsaasPayment = async (subId: string) => {
    try {
      // 1. Confirm local Firestore subscription
      await subscriptionService.confirmAsaasSubscriptionPayment(subId);
      
      // 2. Try to simulate sandbox payment confirmation on Asaas
      const sub = subscriptions.find(s => s.id === subId);
      if (sub && sub.asaasInvoiceId) {
        try {
          await fetch('/api/saas/payment/simulate-receive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentId: sub.asaasInvoiceId })
          });
          console.log("[Asaas] Simulação de recebimento disparada com sucesso.");
        } catch (simErr) {
          console.warn("[Asaas] Falha ao disparar simulação de recebimento no Asaas (comum se produção ou off-line):", simErr);
        }
      }

      toast.success("Pagamento confirmado! Assinatura ativada e sincronizada com sucesso.");
      loadData();
    } catch (error: any) {
      console.error("Erro ao confirmar pagamento Asaas:", error);
      toast.error(error.message || "Erro ao confirmar pagamento.");
    }
  };

  const handleOpenChargeModal = (sub: Subscription) => {
    const plan = plans.find(p => p.id === sub.plano_id);
    setCreatedChargeData({
      id: sub.id,
      paymentUrl: sub.paymentUrl,
      pixCopiaECola: sub.pixCopiaECola,
      pixQrCodeUrl: sub.pixQrCodeUrl,
      planName: plan?.name || 'Assinatura',
      price: plan?.price || 0,
      clientName: sub.cliente_name,
      status: sub.status,
      billingType: sub.billingType || (sub.pixQrCodeUrl ? 'PIX' : 'CREDIT_CARD')
    });
    setShowCreatedChargeModal(true);
  };

  // Action to retry/recobrar subscription payment via Asaas / Credit Card
  const handleRecobrarSubscription = async (subId: string) => {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) {
      toast.error("Assinatura não encontrada.");
      return;
    }

    const toastId = toast.loading(`Enviando nova cobrança no cartão para ${sub.cliente_name}...`);

    try {
      const res = await fetch("/api/saas/subscription/retry-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subId })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Falha ao reenviar cobrança.");
      }

      toast.success(`Cobrança de cartão reenviada com sucesso para ${sub.cliente_name}!`, { id: toastId });

      const plan = plans.find(p => p.id === sub.plano_id);
      setCreatedChargeData({
        id: sub.id,
        paymentUrl: data.paymentUrl || sub.paymentUrl,
        pixCopiaECola: data.pixCopiaECola || sub.pixCopiaECola,
        pixQrCodeUrl: data.pixQrCodeUrl || sub.pixQrCodeUrl,
        planName: sub.planName || plan?.name || 'Assinatura',
        price: plan?.price || 0,
        clientName: sub.cliente_name,
        status: 'pending',
        billingType: sub.billingType || 'CREDIT_CARD'
      });
      setShowCreatedChargeModal(true);
      loadData();
    } catch (error: any) {
      console.error("Erro ao recobrar assinatura:", error);
      toast.error(error.message || "Erro ao efetuar recobrança.", { id: toastId });
    }
  };

  // Action to Skip Invoice / Baixa Manual no Caixa
  const handleSkipInvoice = async (params: {
    subscriptionId: string;
    paymentMethod: string;
    amount: number;
    notes?: string;
    launchInCash?: boolean;
    cancelAsaasInvoice?: boolean;
  }) => {
    setIsSkippingInvoice(true);
    const toastId = toast.loading("Registrando baixa no caixa e renovando assinatura...");
    try {
      const res = await fetch("/api/saas/subscription/skip-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params,
          userId: user?.uid || profile?.uid || 'admin',
          userName: profile?.nome || 'Administrador'
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Falha ao dar baixa manual.");
      }

      toast.success(data.message || "Fatura pulada com sucesso e pagamento lançado no caixa!", { id: toastId });
      setSkipInvoiceSub(null);
      await loadData();
    } catch (err: any) {
      console.error("Erro ao pular fatura:", err);
      toast.error(err.message || "Erro ao registrar baixa manual.", { id: toastId });
    } finally {
      setIsSkippingInvoice(false);
    }
  };

  // Action to fetch invoices history (local transactions + Asaas)
  const handleViewInvoices = async (sub: Subscription) => {
    setInvoicesHistorySub(sub);
    setLoadingInvoices(true);
    setInvoicesList([]);
    try {
      const customerId = (sub as any).asaasCustomerId || '';
      const clienteId = sub.cliente_id || '';
      let loadedInvoices: any[] = [];

      // 1. Fetch Unified Invoices (Asaas API + Non-duplicate Local Transactions) from Backend
      try {
        const res = await fetch(`/api/saas/subscription/invoices?subscriptionId=${encodeURIComponent(sub.id)}&customerId=${encodeURIComponent(customerId)}&clienteId=${encodeURIComponent(clienteId)}`);
        if (res.ok) {
          const data = await res.json();
          loadedInvoices = data.invoices || [];
        }
      } catch (apiErr) {
        console.warn("Aviso ao buscar faturas no backend, tentando busca local direta:", apiErr);
      }

      // 2. Fallback to Local Transactions only if backend returned empty and failed
      if (loadedInvoices.length === 0) {
        try {
          const transRef = collection(db, 'financial_transactions');
          const q = query(
            transRef,
            where('tenantId', '==', (profile as any)?.tenantId || 'gbcortes7')
          );
          const snap = await getDocs(q);
          snap.forEach(docSnap => {
            const data = docSnap.data();
            const isCategorySub = data.category === 'Assinaturas' || data.category === 'Planos' || data.type === 'assinatura';
            const matchesClient = (sub.cliente_id && data.cliente_id === sub.cliente_id) || 
                                  (sub.cliente_name && data.description?.toLowerCase().includes(sub.cliente_name.toLowerCase()));
            
            if (isCategorySub && matchesClient) {
              loadedInvoices.push({
                id: docSnap.id,
                date: data.date || (typeof data.createdAt === 'string' ? data.createdAt.substring(0, 10) : ''),
                dueDate: data.settlement_date || data.date || '',
                amount: data.amount || data.net_amount || 0,
                status: data.status === 'pago' ? 'RECEIVED' : (data.status === 'pendente' ? 'PENDING' : 'OVERDUE'),
                statusLabel: data.status === 'pago' ? 'Paga no Balcão' : 'Pendente',
                billingType: data.paymentMethod ? String(data.paymentMethod).toUpperCase() : 'BALCAO',
                billingTypeLabel: data.paymentMethod === 'dinheiro' ? 'Dinheiro (Balcão)' : (data.paymentMethod === 'pix' ? 'Pix Balcão' : (data.paymentMethod === 'debito' ? 'Cartão Débito (Maquininha)' : (data.paymentMethod === 'credito' ? 'Cartão Crédito (Maquininha)' : 'Balcão / Caixa'))),
                description: data.description || 'Assinatura (Balcão)',
                source: 'local'
              });
            }
          });
        } catch (localErr) {
          console.warn("Aviso ao buscar transações locais:", localErr);
        }
      }

      // Sort invoices by date descending
      loadedInvoices.sort((a, b) => {
        const dateA = new Date(a.date || a.dueDate || 0).getTime();
        const dateB = new Date(b.date || b.dueDate || 0).getTime();
        return dateB - dateA;
      });

      setInvoicesList(loadedInvoices);
    } catch (err) {
      console.error("Erro ao buscar histórico de faturas:", err);
      toast.error("Erro ao carregar faturas.");
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Action to register subscriber benefit usage
  const { execute: handleRegisterUsage, isLoading: isRegisteringUsage } = useAsyncAction(async (subId: string, type: string, serviceId?: string) => {
    try {
      const service = services.find(s => s.id === serviceId);
      await subscriptionService.registerUsage(
        subId,
        type,
        undefined,
        undefined,
        undefined,
        service?.preco || 0,
        serviceId,
        service?.nome
      );
      loadData();
      toast.success("Utilização registrada no clube de benefícios!");
    } catch (error: any) {
      console.error("Erro ao registrar uso:", error);
      toast.error(error.message || "Não foi possível registrar o uso.");
    }
  });

  // Action to manually renew subscription
  const handleManualRenewSubscription = async (subId: string) => {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) {
      toast.error("Assinatura não encontrada.");
      return;
    }

    // Check if subscription is active and not yet due for renewal
    if (sub.status === 'active' && sub.endDate) {
      const endDate = new Date(sub.endDate + 'T23:59:59');
      const today = new Date();
      const diffTime = endDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        const formattedExp = format(parseISO(sub.endDate), 'dd/MM/yyyy');
        toast.info(
          `A assinatura de ${sub.cliente_name} ainda está ativa até ${formattedExp} (${diffDays} dia${diffDays > 1 ? 's' : ''} restante${diffDays > 1 ? 's' : ''}). A renovação/cobrança estará disponível no dia do vencimento!`,
          { duration: 5000 }
        );
        return;
      }
    }

    const plan = plans.find(p => p.id === sub.plano_id);
    const planPrice = plan?.price || 0;

    setComandaInitialData({
      cliente_id: sub.cliente_id,
      cliente_name: sub.cliente_name,
      origin: 'balcao' as const,
      items: [
        {
          id: `assinatura-renovacao-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          type: 'assinatura' as const,
          referencia_id: sub.plano_id,
          name: `Renovação de Assinatura: ${sub.planName || plan?.name || 'Plano'}`,
          quantity: 1,
          unitPrice: planPrice,
          totalPrice: planPrice,
          isCortesia: false,
          generateCommission: true,
          metadata: {
            subscriptionId: sub.id,
            isRenewal: true
          }
        }
      ]
    });
    setShowComandaModal(true);
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

  // Action to delete subscription plan with safety confirm
  const handleConfirmDeletePlan = async () => {
    if (!deletePlanTarget) return;
    try {
      await subscriptionService.deletePlan(deletePlanTarget.id);
      toast.success(`Plano "${deletePlanTarget.name}" excluído com sucesso.`);
      setDeletePlanTarget(null);
      if (editingPlan?.id === deletePlanTarget.id) {
        setShowPlanModal(false);
        setEditingPlan(null);
      }
      loadData();
    } catch (error: any) {
      console.error("Erro ao excluir plano:", error);
      toast.error(error.message || "Erro ao excluir plano de assinatura.");
    }
  };

  // Action to sync all Asaas subscriptions manually
  const handleSyncAsaasSubscriptions = async () => {
    setIsSyncingAsaas(true);
    try {
      const res = await subscriptionService.syncAllAsaasSubscriptions();
      if (res.success) {
        toast.success(res.message || "Sincronização com Asaas concluída!");
        await loadData();
      } else {
        toast.error(res.error || "Erro ao sincronizar assinaturas com o Asaas.");
      }
    } catch (error: any) {
      console.error("Erro na sincronização Asaas:", error);
      toast.error("Falha ao comunicar com o servidor para sincronização.");
    } finally {
      setIsSyncingAsaas(false);
    }
  };

  // Action to save plans (create/edit)
  const { execute: handleSavePlan, isLoading: isSavingPlan } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const corteItem = planServices.find(s => s.name.toLowerCase().includes('corte') || s.name.toLowerCase().includes('cabelo') || s.name.toLowerCase().includes('hair'));
    const barbaItem = planServices.find(s => s.name.toLowerCase().includes('barba') || s.name.toLowerCase().includes('beard'));

    const haircutsPerMonth = corteItem ? (corteItem.isUnlimited ? 999 : corteItem.limit) : 0;
    const beardsPerMonth = barbaItem ? (barbaItem.isUnlimited ? 999 : barbaItem.limit) : 0;

    const pontosServicosObj: Record<string, number> = { ...planPontosServicos };
    planServices.forEach(ps => {
      if (ps.points !== undefined) {
        pontosServicosObj[ps.serviceId] = ps.points;
      }
    });

    const planData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: Number(formData.get('price')),
      haircutsPerMonth,
      beardsPerMonth,
      services: planServices,
      extraBenefits: (formData.get('extraBenefits') as string).split(',').map(s => s.trim()).filter(Boolean),
      status: formData.get('status') as 'active' | 'inactive',
      showInPortal: planShowInPortal,
      allowedPaymentMethods: planAllowedPaymentMethods,
      allowClientCancel: planAllowClientCancel,
      comissao_tipo: planComissaoTipo,
      comissao_pool_porcentagem: planComissaoPoolPorcentagem,
      comissao_fixa_valor: planComissaoFixaValor,
      pontos_corte: planPontosCorte,
      pontos_barba: planPontosBarba,
      pontos_outros: planPontosOutros,
      pontos_servicos: pontosServicosObj,
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
    const matchesSearch = 
      s.cliente_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.planName && s.planName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesStatus = false;
    if (subStatusFilter === 'all') {
      matchesStatus = true;
    } else if (subStatusFilter === 'active') {
      matchesStatus = s.status === 'active';
    } else if (subStatusFilter === 'pending') {
      matchesStatus = s.status === 'pending';
    } else if (subStatusFilter === 'expired') {
      matchesStatus = s.status === 'expired' || s.status === 'canceled' || s.status === 'overdue' || s.status === 'paused';
    } else {
      matchesStatus = s.status === subStatusFilter;
    }

    const matchesPlan = subPlanFilter === 'all' || s.plano_id === subPlanFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const totalPages = Math.ceil(filteredSubscriptions.length / itemsPerPage) || 1;
  const paginatedSubscriptions = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSubscriptions.slice(start, start + itemsPerPage);
  }, [filteredSubscriptions, currentPage, itemsPerPage]);

  // --- GESTÃO DE COMISSÕES DE ASSINATURA ---
  const isSubActiveInMonth = (sub: Subscription, monthStr: string) => {
    if (!sub.startDate) return false;
    const startYm = sub.startDate.slice(0, 7);
    const endYm = sub.endDate ? sub.endDate.slice(0, 7) : startYm;
    return startYm <= monthStr && endYm >= monthStr;
  };

  const filteredUsages = React.useMemo(() => {
    return allUsages.filter(u => {
      if (!u.date) return false;
      if (commDateMode === 'month') {
        return u.date.startsWith(selectedMonth);
      } else {
        return u.date >= commStartDate && u.date <= commEndDate;
      }
    });
  }, [allUsages, commDateMode, selectedMonth, commStartDate, commEndDate]);

  const activeSubsForSelectedMonth = React.useMemo(() => {
    return subscriptions.filter(s => {
      if (!s.startDate) return false;
      if (commDateMode === 'month') {
        return isSubActiveInMonth(s, selectedMonth);
      } else {
        const start = s.startDate;
        const end = s.endDate || s.startDate;
        return start <= commEndDate && end >= commStartDate;
      }
    });
  }, [subscriptions, commDateMode, selectedMonth, commStartDate, commEndDate]);

  const activeSubs = activeSubsForSelectedMonth;

  const totalSubRevenue = React.useMemo(() => {
    return activeSubsForSelectedMonth.reduce((acc, s) => {
      const plan = plans.find(p => p.id === s.plano_id);
      return acc + (plan?.price || 0);
    }, 0);
  }, [activeSubsForSelectedMonth, plans]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Multi-cycle individual subscription calculation grouped into barber pot total
  const calculatedCommissionsData = React.useMemo(() => {
    const currentRunKeyLocal = commDateMode === 'month' ? selectedMonth : `${commStartDate}_${commEndDate}`;
    const isMonthReleasedLocal = !!releasedRuns[currentRunKeyLocal];

    const allPots = barbeiros.map(barber => {
      let totalReleasedCommission = 0;
      let totalInProgressCommission = 0;
      let totalCuts = 0;
      let totalBeards = 0;
      let totalOthers = 0;
      let totalPoints = 0;

      const servicesSummaryMap: Record<string, number> = {};

      const barberUsages = filteredUsages.filter(u => u.profissional_id === barber.uid);
      barberUsages.forEach(u => {
        if (u.type === 'haircut') totalCuts++;
        else if (u.type === 'beard') totalBeards++;
        else totalOthers++;

        const sName = (u.service_name || u.servico_name || (u.type === 'haircut' ? 'Corte' : u.type === 'beard' ? 'Barba' : 'Outro Serviço')).trim();
        servicesSummaryMap[sName] = (servicesSummaryMap[sName] || 0) + 1;
      });

      const attendedServices = Object.entries(servicesSummaryMap).map(([name, count]) => ({
        name,
        count
      })).sort((a, b) => b.count - a.count);

      const subBreakdownList: Array<{
        subId: string;
        clientName: string;
        planName: string;
        planPrice: number;
        cycleStart: string;
        cycleEnd: string;
        isCycleReleased: boolean;
        comissaoTipo: string;
        totalSubUsages: number;
        barberSubUsages: number;
        subPoolValue: number;
        earnedCommission: number;
      }> = [];

      subscriptions.forEach(sub => {
        const plan = plans.find(p => p.id === sub.plano_id);
        if (!plan) return;

        // Is cycle closed (endDate <= today or expired/canceled)?
        const isCycleReleased = sub.endDate <= todayStr || sub.status === 'expired' || sub.status === 'canceled';

        // Check if this subscription cycle is relevant to the selected period
        let isRelevant = false;
        if (commDateMode === 'month') {
          if (isCycleReleased) {
            // For released cycles, we account for them in the month of their endDate
            isRelevant = !!(sub.endDate && sub.endDate.startsWith(selectedMonth));
          } else {
            // For in-progress cycles, we show them if they are active/overlapping in that month
            isRelevant = isSubActiveInMonth(sub, selectedMonth);
          }
        } else {
          // Range mode
          if (isCycleReleased) {
            isRelevant = sub.endDate >= commStartDate && sub.endDate <= commEndDate;
          } else {
            const start = sub.startDate;
            const end = sub.endDate || sub.startDate;
            isRelevant = start <= commEndDate && end >= commStartDate;
          }
        }

        if (!isRelevant) return;

        const planPrice = plan.price || 0;
        const poolPct = (plan as any).comissao_pool_porcentagem ?? 50;
        const subPoolValue = planPrice * (poolPct / 100);
        const comissaoTipo = (plan as any).comissao_tipo || 'fixo';

        // Fetch ALL usages within the entire cycle duration of this subscription (unfiltered by selectedMonth!)
        const subUsages = allUsages.filter(u => 
          u.plano_id === plan.id && 
          (u.assinatura_id === sub.id || u.sub_id === sub.id || u.cliente_id === sub.cliente_id || u.cliente_name === sub.cliente_name) &&
          u.date >= sub.startDate &&
          u.date <= sub.endDate
        );
        const barberSubUsages = subUsages.filter(u => u.profissional_id === barber.uid);

        if (subUsages.length === 0 && barberSubUsages.length === 0) return;

        let earnedCommission = 0;

        if (comissaoTipo === 'fixo') {
          const fixedVal = (plan as any).comissao_fixa_valor ?? 10.00;
          earnedCommission = barberSubUsages.length * fixedVal;
        } else if (comissaoTipo === 'pool_atendimentos') {
          if (subUsages.length > 0) {
            earnedCommission = subPoolValue * (barberSubUsages.length / subUsages.length);
          }
        } else if (comissaoTipo === 'pool_pontos') {
          const wCorte = (plan as any).pontos_corte ?? 1;
          const wBarba = (plan as any).pontos_barba ?? 1;
          const wOutro = (plan as any).pontos_outros ?? 0.5;

          const getPoints = (u: any) => {
            const customPoints = (plan as any).pontos_servicos;
            if (customPoints && u.service_id && typeof customPoints[u.service_id] === 'number') {
              return customPoints[u.service_id];
            }
            if (u.type === 'haircut') return wCorte;
            if (u.type === 'beard') return wBarba;
            return wOutro;
          };

          const totalSubPoints = subUsages.reduce((sum, u) => sum + getPoints(u), 0);
          const barberSubPoints = barberSubUsages.reduce((sum, u) => sum + getPoints(u), 0);

          if (totalSubPoints > 0) {
            earnedCommission = subPoolValue * (barberSubPoints / totalSubPoints);
            totalPoints += barberSubPoints;
          }
        }

        if (earnedCommission > 0 || barberSubUsages.length > 0) {
          if (isCycleReleased) {
            totalReleasedCommission += isMonthReleasedLocal ? 0 : earnedCommission;
          } else {
            totalInProgressCommission += earnedCommission;
          }

          subBreakdownList.push({
            subId: sub.id,
            clientName: sub.cliente_name,
            planName: plan.name,
            planPrice,
            cycleStart: sub.startDate,
            cycleEnd: sub.endDate,
            isCycleReleased,
            comissaoTipo,
            totalSubUsages: subUsages.length,
            barberSubUsages: barberSubUsages.length,
            subPoolValue,
            earnedCommission
          });
        }
      });

      return {
        uid: barber.uid,
        nome: barber.nome || barber.displayName || 'Profissional',
        foto: barber.foto || barber.photoURL || '',
        totalCuts,
        totalBeards,
        totalOthers,
        totalServices: barberUsages.length,
        totalPoints,
        attendedServices,
        totalReleasedCommission,
        totalInProgressCommission,
        totalPot: totalReleasedCommission + totalInProgressCommission,
        subBreakdownList
      };
    });

    const filteredBarberPots = allPots.filter(b => {
      if (commBarberFilter !== 'all' && b.uid !== commBarberFilter) return false;
      return true;
    }).map(b => {
      let breakdown = b.subBreakdownList;
      if (commCycleFilter === 'released') {
        breakdown = breakdown.filter(i => i.isCycleReleased);
      } else if (commCycleFilter === 'in_progress') {
        breakdown = breakdown.filter(i => !i.isCycleReleased);
      }
      return {
        ...b,
        subBreakdownList: breakdown
      };
    });

    return {
      allPots,
      barberPots: filteredBarberPots
    };
  }, [barbeiros, subscriptions, plans, filteredUsages, todayStr, commBarberFilter, commCycleFilter, releasedRuns, commDateMode, selectedMonth, commStartDate, commEndDate]);

  const totalReleasedCommissionsPool = React.useMemo(() => {
    const currentRunKeyLocal = commDateMode === 'month' ? selectedMonth : `${commStartDate}_${commEndDate}`;
    const isMonthReleasedLocal = !!releasedRuns[currentRunKeyLocal];
    if (isMonthReleasedLocal) return 0;
    return calculatedCommissionsData.allPots.reduce((acc, b) => acc + b.totalReleasedCommission, 0);
  }, [calculatedCommissionsData, releasedRuns, commDateMode, selectedMonth, commStartDate, commEndDate]);

  const totalInProgressCommissionsPool = React.useMemo(() => {
    return activeSubsForSelectedMonth.reduce((acc, s) => {
      const isCycleReleased = s.endDate <= todayStr || s.status === 'expired' || s.status === 'canceled';
      if (isCycleReleased) return acc;
      const plan = plans.find(p => p.id === s.plano_id);
      if (!plan) return acc;
      const poolPct = (plan as any).comissao_pool_porcentagem ?? 50;
      return acc + (plan.price * (poolPct / 100));
    }, 0);
  }, [activeSubsForSelectedMonth, plans, todayStr]);

  const calculatedCommissions = React.useMemo(() => {
    return calculatedCommissionsData.allPots.map(p => ({
      uid: p.uid,
      nome: p.nome,
      foto: p.foto,
      cuts: p.totalCuts,
      beards: p.totalBeards,
      others: p.totalOthers,
      totalServices: p.totalServices,
      points: p.totalPoints,
      commission: p.totalPot
    }));
  }, [calculatedCommissionsData]);

  const totalCommissionsToRelease = totalReleasedCommissionsPool;

  const totalProjectedCommissionPool = React.useMemo(() => {
    return activeSubsForSelectedMonth.reduce((acc, s) => {
      const plan = plans.find(p => p.id === s.plano_id);
      if (!plan) return acc;
      const poolPct = (plan as any).comissao_pool_porcentagem ?? 50;
      return acc + (plan.price * (poolPct / 100));
    }, 0);
  }, [activeSubsForSelectedMonth, plans]);

  const houseNetRevenue = totalSubRevenue - totalCommissionsToRelease;
  const currentRunKey = commDateMode === 'month' ? selectedMonth : `${commStartDate}_${commEndDate}`;
  const isMonthReleased = !!releasedRuns[currentRunKey];
  const releasedRunInfo = releasedRuns[currentRunKey];

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

  const usagesByPlan = React.useMemo(() => {
    const groups: Record<string, {
      planId: string;
      planName: string;
      price: number;
      usages: any[];
    }> = {};

    filteredUsages.forEach(u => {
      const pId = u.plano_id || 'unknown';
      if (!groups[pId]) {
        const plan = plans.find(p => p.id === pId);
        groups[pId] = {
          planId: pId,
          planName: u.plano_name || plan?.name || 'Outro / Sem Plano',
          price: plan?.price || 0,
          usages: []
        };
      }
      groups[pId].usages.push(u);
    });

    return Object.values(groups).sort((a, b) => b.usages.length - a.usages.length);
  }, [filteredUsages, plans]);

  const handleReleaseCommissions = async () => {
    if (totalCommissionsToRelease <= 0) {
      toast.error("Nenhuma comissão de ciclo liberado para lançar neste período.");
      return;
    }
    
    setPostingCommissions(true);
    try {
      let periodLabel = '';
      if (commDateMode === 'month') {
        const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: ptBR });
        periodLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
      } else {
        periodLabel = `${format(parseISO(commStartDate), 'dd/MM/yyyy')} a ${format(parseISO(commEndDate), 'dd/MM/yyyy')}`;
      }

      const promises = calculatedCommissionsData.allPots
        .filter(b => b.totalReleasedCommission > 0)
        .map(async (b) => {
          const commData = {
            profissional_id: b.uid,
            profissional_name: b.nome,
            servico_name: `Rateio Pote Assinaturas - Liberado (${periodLabel})`,
            base_value: b.totalServices,
            commission_percentage: 100,
            commission_value: Number(b.totalReleasedCommission.toFixed(2)),
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

      const barbersBreakdown = calculatedCommissionsData.allPots
        .filter(b => b.totalReleasedCommission > 0)
        .map(b => ({
          profissional_id: b.uid,
          profissional_name: b.nome,
          commission_value: Number(b.totalReleasedCommission.toFixed(2)),
          totalServices: b.totalServices
        }));

      await setDoc(doc(db, 'subscription_commission_runs', currentRunKey), {
        releasedAt: new Date().toISOString(),
        releasedBy: profile?.nome || 'Administrador',
        totalAmount: Number(totalCommissionsToRelease.toFixed(2)),
        period: currentRunKey,
        periodLabel,
        barbersBreakdown
      });

      toast.success(`Pote de comissões liberadas (${periodLabel}) lançado com sucesso no financeiro!`);
      loadComissoesData();
    } catch (error) {
      console.error("Erro ao lançar comissões do pote:", error);
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
            <button
              type="button"
              onClick={handleSyncAsaasSubscriptions}
              disabled={isSyncingAsaas}
              className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 transition shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              title="Sincronizar pagamentos do Asaas com o Caixa Diário e Fluxo de Caixa"
            >
              <RefreshCw size={15} className={isSyncingAsaas ? "animate-spin" : ""} />
              <span>{isSyncingAsaas ? "Sincronizando..." : "Sincronizar Asaas"}</span>
            </button>
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
          <StatCard title="Assinantes Ativos" value={activeSubsForSelectedMonth.length} icon={<Users className="text-blue-600" />} />
          <StatCard title="Receita Recorrente" value={totalSubRevenue} icon={<TrendingUp className="text-emerald-600" />} isCurrency />
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
        <div className="space-y-4">
          {/* Quick Status Category Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Card 1: Ativos */}
            <button
              type="button"
              onClick={() => setSubStatusFilter('active')}
              className={`p-4 rounded-3xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                subStatusFilter === 'active'
                  ? 'bg-emerald-500/10 border-emerald-500/40 ring-2 ring-emerald-500/20 shadow-md scale-[1.01]'
                  : 'bg-white border-slate-200/80 hover:border-emerald-300 hover:bg-emerald-50/30 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ativas
                </span>
                <span className="text-sm font-black text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                  {subscriptions.filter(s => s.status === 'active').length}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold leading-tight">Clube de benefícios ativado e pronto para uso</p>
            </button>

            {/* Card 2: Aguardando Pagamento (Asaas) */}
            <button
              type="button"
              onClick={() => setSubStatusFilter('pending')}
              className={`p-4 rounded-3xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                subStatusFilter === 'pending'
                  ? 'bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20 shadow-md scale-[1.01]'
                  : 'bg-white border-slate-200/80 hover:border-amber-300 hover:bg-amber-50/30 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  Aguardando Pgto
                </span>
                <span className="text-sm font-black text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  {subscriptions.filter(s => s.status === 'pending').length}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold leading-tight">Exclusivo Asaas (Aguardando Pix/Boleto ou Webhook)</p>
            </button>

            {/* Card 3: Atrasados e Expirados */}
            <button
              type="button"
              onClick={() => setSubStatusFilter('expired')}
              className={`p-4 rounded-3xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                subStatusFilter === 'expired'
                  ? 'bg-rose-500/10 border-rose-500/40 ring-2 ring-rose-500/20 shadow-md scale-[1.01]'
                  : 'bg-white border-slate-200/80 hover:border-rose-300 hover:bg-rose-50/30 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  Atrasadas / Expiradas
                </span>
                <span className="text-sm font-black text-rose-800 bg-rose-100 px-2.5 py-0.5 rounded-full">
                  {subscriptions.filter(s => s.status === 'expired' || s.status === 'canceled' || s.status === 'overdue' || s.status === 'paused').length}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold leading-tight">Assinaturas vencidas, pausadas ou canceladas</p>
            </button>

            {/* Card 4: Todos os Assinantes */}
            <button
              type="button"
              onClick={() => setSubStatusFilter('all')}
              className={`p-4 rounded-3xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                subStatusFilter === 'all'
                  ? 'bg-indigo-500/10 border-indigo-500/40 ring-2 ring-indigo-500/20 shadow-md scale-[1.01]'
                  : 'bg-white border-slate-200/80 hover:border-indigo-300 hover:bg-indigo-50/30 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <Users size={13} className="text-indigo-600" />
                  Todos os Assinantes
                </span>
                <span className="text-sm font-black text-indigo-900 bg-indigo-100 px-2.5 py-0.5 rounded-full">
                  {subscriptions.length}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-bold leading-tight">Visão geral unificada de toda a carteira</p>
            </button>
          </div>

          <div className="bg-slate-50 p-4 border border-slate-200/80 rounded-3xl space-y-3 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  placeholder="Buscar por nome, plano ou ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-semibold text-primary shadow-sm transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Filter */}
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3 py-1.5 shadow-sm">
                  <Filter size={13} className="text-slate-400" />
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Status:</span>
                  <select
                    value={subStatusFilter}
                    onChange={(e) => setSubStatusFilter(e.target.value)}
                    className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer"
                  >
                    <option value="all">Todos ({subscriptions.length})</option>
                    <option value="active">🟢 Ativas ({subscriptions.filter(s => s.status === 'active').length})</option>
                    <option value="pending">⏳ Aguardando Pgto - Asaas ({subscriptions.filter(s => s.status === 'pending').length})</option>
                    <option value="expired">🔴 Atrasados / Expirados ({subscriptions.filter(s => s.status === 'expired' || s.status === 'canceled' || s.status === 'overdue' || s.status === 'paused').length})</option>
                    <option value="paused">⏸️ Pausadas</option>
                    <option value="canceled">❌ Canceladas</option>
                  </select>
                </div>

              {/* Plan Filter */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3 py-1.5 shadow-sm">
                <Star size={13} className="text-slate-400" />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Plano:</span>
                <select
                  value={subPlanFilter}
                  onChange={(e) => setSubPlanFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer"
                >
                  <option value="all">Todos os Planos</option>
                  {plans.map((p, pIdx) => (
                    <option key={`sub-plan-opt-${p.id || pIdx}-${pIdx}`} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Items per page */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-2xl px-3 py-1.5 shadow-sm">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Exibir:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="bg-transparent text-xs font-bold text-primary outline-none cursor-pointer"
                >
                  <option value={10}>10 / pág</option>
                  <option value={25}>25 / pág</option>
                  <option value={50}>50 / pág</option>
                  <option value={100}>100 / pág</option>
                </select>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center bg-slate-200/70 p-1 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => setSubViewMode('list')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    subViewMode === 'list'
                      ? 'bg-white text-primary shadow-sm font-black'
                      : 'text-slate-500 hover:text-primary'
                  }`}
                  title="Exibir em Lista (Ideal para grande volume de clientes)"
                >
                  <List size={15} />
                  <span className="hidden sm:inline text-[11px] uppercase tracking-wider">Lista</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubViewMode('grid')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    subViewMode === 'grid'
                      ? 'bg-white text-primary shadow-sm font-black'
                      : 'text-slate-500 hover:text-primary'
                  }`}
                  title="Exibir em Cards (Modo Visual Quadrado)"
                >
                  <LayoutGrid size={15} />
                  <span className="hidden sm:inline text-[11px] uppercase tracking-wider">Cards</span>
                </button>
              </div>
            </div>
          </div>

          {/* Subheader info counter */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-semibold px-1 pt-1 border-t border-slate-200/60">
            <span>
              Mostrando <strong className="text-primary font-black">{filteredSubscriptions.length}</strong> {filteredSubscriptions.length === 1 ? 'assinante' : 'assinantes'}
              {(subStatusFilter !== 'all' || subPlanFilter !== 'all' || searchQuery) && (
                <button 
                  type="button"
                  onClick={() => { setSearchQuery(''); setSubStatusFilter('all'); setSubPlanFilter('all'); }}
                  className="ml-2 text-indigo-600 hover:underline font-bold cursor-pointer"
                >
                  (limpar filtros)
                </button>
              )}
            </span>
            <span className="font-bold text-slate-600">
              Receita deste grupo: <strong className="text-emerald-700 font-black">R$ {filteredSubscriptions.reduce((acc, s) => acc + (plans.find(p => p.id === s.plano_id)?.price || 0), 0).toFixed(2)}/mês</strong>
            </span>
          </div>
        </div>
      </div>
      )}

      {/* TAB 1: Planos de Assinatura (Cadastro e Venda) */}
      {activeTab === 'assinaturas_planos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan, planIdx) => (
            <PlanCard 
              key={`plan-card-tab1-${plan.id || planIdx}-${planIdx}`} 
              plan={plan} 
              isAdmin={canManage}
              onEdit={() => { setEditingPlan(plan); setShowPlanModal(true); }}
              onDelete={() => setDeletePlanTarget(plan)}
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
              <h3 className="text-lg font-bold text-primary mb-1">Nenhum assinante encontrado</h3>
              <p className="text-muted text-sm max-w-xs mx-auto font-medium">Ajuste os filtros de busca ou cadastre um novo cliente no clube.</p>
            </div>
          ) : (
            <>
              {subViewMode === 'list' ? (
                <div className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="p-4 pl-6">Assinante / Cliente</th>
                          <th className="p-4">Plano Contratado</th>
                          <th className="p-4">Status & Pgto</th>
                          <th className="p-4">Vencimento & Renovação</th>
                          <th className="p-4">Uso no Mês</th>
                          <th className="p-4 pr-6 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {paginatedSubscriptions.map((sub, subIdx) => {
                          const plan = plans.find(p => p.id === sub.plano_id);
                          const matchedClient = clients.find(c => c.uid === sub.cliente_id);
                          const clientPhone = matchedClient?.telefone || matchedClient?.whatsapp || '';
                          
                          return (
                            <SubscriptionTableRow 
                              key={`sub-table-row-${sub.id || subIdx}-${subIdx}`}
                              sub={sub}
                              plan={plan}
                              clientPhone={clientPhone}
                              matchedClient={matchedClient}
                              isAdmin={canManage}
                              onRegisterUsage={handleRegisterUsage}
                              onRenew={handleManualRenewSubscription}
                              onRecobrar={handleRecobrarSubscription}
                              onSkipInvoice={setSkipInvoiceSub}
                              onViewInvoices={handleViewInvoices}
                              onToggleAutoRenew={handleToggleAutoRenew}
                              onStatusChange={handleUpdateSubscriptionStatus}
                              onDelete={(id) => setDeleteSubId(id)}
                              onConfirmAsaasPayment={handleConfirmAsaasPayment}
                              onShowChargeModal={handleOpenChargeModal}
                              onViewDetail={handleViewSubDetail}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {paginatedSubscriptions.map((sub, subIdx) => {
                    const matchedClient = clients.find(c => c.uid === sub.cliente_id);
                    const clientPhone = matchedClient?.telefone || matchedClient?.whatsapp || '';
                    return (
                      <SubscriptionCard 
                        key={`sub-grid-card-${sub.id || subIdx}-${subIdx}`} 
                        sub={sub} 
                        plan={plans.find(p => p.id === sub.plano_id)}
                        clientPhone={clientPhone}
                        matchedClient={matchedClient}
                        isAdmin={canManage}
                        onRegisterUsage={handleRegisterUsage}
                        onRenew={handleManualRenewSubscription}
                        onRecobrar={handleRecobrarSubscription}
                        onSkipInvoice={setSkipInvoiceSub}
                        onViewInvoices={handleViewInvoices}
                        onToggleAutoRenew={handleToggleAutoRenew}
                        onStatusChange={handleUpdateSubscriptionStatus}
                        onDelete={(id) => setDeleteSubId(id)}
                        onConfirmAsaasPayment={handleConfirmAsaasPayment}
                        onShowChargeModal={handleOpenChargeModal}
                        onViewDetail={handleViewSubDetail}
                        isClient={false}
                      />
                    );
                  })}
                </div>
              )}

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200/80 px-2">
                  <div className="text-xs text-slate-500 font-semibold">
                    Página <strong className="text-primary font-black">{currentPage}</strong> de <strong className="text-primary font-black">{totalPages}</strong> ({filteredSubscriptions.length} assinantes no total)
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition shadow-sm"
                      title="Página Anterior"
                    >
                      <ChevronLeft size={16} />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, idx, arr) => {
                        const prevP = arr[idx - 1];
                        const showEllipsis = prevP && p - prevP > 1;
                        return (
                          <React.Fragment key={`page-num-${p}-${idx}`}>
                            {showEllipsis && <span className="px-1 text-slate-400 font-bold">...</span>}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(p)}
                              className={`w-8 h-8 rounded-xl text-xs font-black transition cursor-pointer ${
                                currentPage === p
                                  ? 'bg-primary text-white shadow-sm'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {p}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 border border-slate-200 rounded-xl bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer transition shadow-sm"
                      title="Próxima Página"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2.5: Comissões & Relatórios de Assinatura */}
      {activeTab === 'assinantes_comissoes' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Control Header & Filters */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-slate-50 p-6 border border-slate-100 rounded-[2rem] shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                <DollarSign size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase text-primary tracking-widest">Apuração de Comissões e Pote por Ciclo</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cálculo individual por assinatura agrupado no pote do barbeiro</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
              {/* Date Mode Toggle */}
              <div className="flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-bold shadow-sm">
                <button
                  type="button"
                  onClick={() => setCommDateMode('month')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${commDateMode === 'month' ? 'bg-primary text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Mês
                </button>
                <button
                  type="button"
                  onClick={() => setCommDateMode('range')}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${commDateMode === 'range' ? 'bg-primary text-white shadow-sm font-black' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Período
                </button>
              </div>

              {commDateMode === 'month' ? (
                <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-white border border-slate-200 outline-none rounded-xl py-2 px-3 text-xs font-black text-primary cursor-pointer font-bold shadow-sm"
                >
                  {(() => {
                    const list = [];
                    const now = new Date();
                    for (let i = 0; i < 12; i++) {
                      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                      const year = d.getFullYear();
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const label = format(d, 'MMMM yyyy', { locale: ptBR });
                      list.push({ value: `${year}-${month}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
                    }
                    return list.map((m, mIdx) => (
                      <option key={`mth-opt-comm-${m.value}-${mIdx}`} value={m.value}>{m.label}</option>
                    ));
                  })()}
                </select>
              ) : (
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2 py-1 rounded-xl shadow-sm">
                  <input 
                    type="date" 
                    value={commStartDate}
                    onChange={(e) => setCommStartDate(e.target.value)}
                    className="text-xs font-bold text-slate-700 outline-none bg-transparent"
                  />
                  <span className="text-slate-300 font-bold">até</span>
                  <input 
                    type="date" 
                    value={commEndDate}
                    onChange={(e) => setCommEndDate(e.target.value)}
                    className="text-xs font-bold text-slate-700 outline-none bg-transparent"
                  />
                </div>
              )}

              {/* Barber Filter */}
              <select
                value={commBarberFilter}
                onChange={(e) => setCommBarberFilter(e.target.value)}
                className="bg-white border border-slate-200 outline-none rounded-xl py-2 px-3 text-xs font-bold text-slate-700 cursor-pointer shadow-sm"
              >
                <option value="all">Todos os Barbeiros</option>
                {barbeiros.map((b, bIdx) => (
                  <option key={`comm-barber-opt-${b.uid || bIdx}-${bIdx}`} value={b.uid}>{b.nome || b.displayName || 'Barbeiro'}</option>
                ))}
              </select>

              {/* Cycle Status Filter */}
              <select
                value={commCycleFilter}
                onChange={(e) => setCommCycleFilter(e.target.value)}
                className="bg-white border border-slate-200 outline-none rounded-xl py-2 px-3 text-xs font-bold text-slate-700 cursor-pointer shadow-sm"
              >
                <option value="all">Todos os Ciclos</option>
                <option value="released">🟢 Somente Liberados (Ciclos Vencidos)</option>
                <option value="in_progress">🟡 Somente Em Andamento (Provisórios)</option>
              </select>

              <button
                type="button"
                onClick={loadComissoesData}
                disabled={loadingUsages}
                className="p-2.5 border border-slate-200 text-slate-500 bg-white rounded-xl hover:bg-slate-100 transition flex items-center justify-center cursor-pointer shadow-sm"
                title="Atualizar dados"
              >
                <RefreshCw size={14} className={loadingUsages ? "animate-spin" : ""} />
              </button>

              {isMonthReleased ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm">
                  <CheckCircle size={14} />
                  <span>Pote Lançado no Financeiro</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleReleaseCommissions}
                  disabled={postingCommissions || loadingUsages || totalCommissionsToRelease === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition duration-200 shadow-md shadow-indigo-500/10 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2 cursor-pointer"
                >
                  {postingCommissions ? <Loader2 className="animate-spin" size={14} /> : <DollarSign size={14} />}
                  <span>Lançar Pote Liberado</span>
                </button>
              )}
            </div>
          </div>

          {/* Aggregate Analytical Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
            <div className="bg-white border border-emerald-200/80 p-5 rounded-[2rem] shadow-sm relative overflow-hidden">
              <div className="w-1.5 h-full bg-emerald-500 absolute left-0 top-0"></div>
              <span className="text-[9px] font-black uppercase text-emerald-600 tracking-widest block mb-1">Pote Geral Liberado (Liberado p/ Repasse)</span>
              <span className="text-2xl font-black text-emerald-700">
                R$ {totalReleasedCommissionsPool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-400 block mt-1 uppercase font-black">Ciclos concluídos / renovados</span>
            </div>

            <div className="bg-white border border-amber-200/80 p-5 rounded-[2rem] shadow-sm relative overflow-hidden">
              <div className="w-1.5 h-full bg-amber-500 absolute left-0 top-0"></div>
              <span className="text-[9px] font-black uppercase text-amber-600 tracking-widest block mb-1">Pote Em Andamento (Provisório)</span>
              <span className="text-2xl font-black text-amber-600">
                R$ {totalInProgressCommissionsPool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-400 block mt-1 uppercase font-black">Ciclos ativos até vencimento</span>
            </div>
            
            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Receita Total de Assinaturas</span>
              <span className="text-xl font-black text-slate-800">
                R$ {totalSubRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Soma de {activeSubs.length} planos no período</span>
            </div>

            <div className="bg-white border border-slate-200/80 p-5 rounded-[2rem] shadow-sm">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Receita Líquida Retida</span>
              <span className="text-xl font-black text-indigo-600">
                R$ {houseNetRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-bold text-slate-450 block mt-1 uppercase font-black">Valor retido pela casa após repasses</span>
            </div>
          </div>

          {/* Explanatory Banner for Cycle Rule */}
          <div className="bg-gradient-to-r from-indigo-50/90 via-blue-50/40 to-slate-50 border border-indigo-100 p-5 rounded-[2rem] shadow-sm flex gap-4 items-start">
            <div className="p-2.5 bg-white text-indigo-600 rounded-xl shadow-sm border border-indigo-50 shrink-0">
              <Info size={18} />
            </div>
            <div className="space-y-1">
              <h5 className="text-xs font-black text-indigo-950 uppercase tracking-wider">Como funciona o cálculo do Pote de Assinaturas?</h5>
              <p className="text-slate-600 text-xs leading-relaxed font-medium">
                Cada cliente possui seu próprio ciclo de renovação da assinatura. O cálculo é realizado de forma <strong>individual por assinatura</strong> com base no uso de cortes do cliente. Para o barbeiro, apresentamos <strong>1 valor total do pote de assinaturas</strong> para manter o extrato limpo e objetivo.
                As comissões de ciclos ativos pertencem ao <strong>Pote Em Andamento (Provisório)</strong>. Assim que o ciclo da assinatura se encerra ou é renovado, o valor é migrado automaticamente para o <strong>Pote Liberado</strong> para repasse financeiro!
              </p>
            </div>
          </div>

          {/* SEÇÃO PRINCIPAL: 1 VALOR TOTAL DO POTE POR BARBEIRO COM DETALHAMENTO EXPANDÍVEL */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h5 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                <Briefcase size={14} className="text-indigo-600" />
                <span>Extrato do Pote de Assinaturas por Barbeiro</span>
              </h5>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {calculatedCommissionsData.barberPots.length} profissional(is)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {calculatedCommissionsData.barberPots.map((barberPot, bpIdx) => (
                <div 
                  key={`barber-pot-${barberPot.uid || bpIdx}-${bpIdx}`} 
                  className="bg-white border border-slate-200/90 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-4">
                    {/* Header do Barbeiro */}
                    <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100/80 overflow-hidden flex items-center justify-center shrink-0">
                        {barberPot.foto ? (
                          <img src={barberPot.foto} alt={barberPot.nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Users size={20} className="text-indigo-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-black text-slate-800 truncate">{barberPot.nome}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {barberPot.totalServices} atendimento(s) no clube
                        </span>
                      </div>
                    </div>

                    {/* VALOR TODO DO POTE HIGHLIGHT */}
                    <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-center space-y-1">
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Total Acumulado do Pote</span>
                      <span className="text-2xl font-black text-slate-900 block">
                        R$ {barberPot.totalPot.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* DESMEMBRAMENTO DE LIBERADO vs PROVISÓRIO */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-emerald-50/80 border border-emerald-100 rounded-xl p-3 space-y-0.5">
                        <span className="text-[9px] font-black uppercase text-emerald-700 block tracking-wider flex items-center gap-1">
                          <CheckCircle size={10} />
                          <span>Pote Liberado</span>
                        </span>
                        <span className="text-sm font-black text-emerald-800 block">
                          R$ {barberPot.totalReleasedCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[8px] font-bold text-emerald-600 block uppercase">Ciclos encerrados</span>
                      </div>

                      <div className="bg-amber-50/80 border border-amber-100 rounded-xl p-3 space-y-0.5">
                        <span className="text-[9px] font-black uppercase text-amber-700 block tracking-wider flex items-center gap-1">
                          <Clock size={10} />
                          <span>Em Andamento</span>
                        </span>
                        <span className="text-sm font-black text-amber-800 block">
                          R$ {barberPot.totalInProgressCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[8px] font-bold text-amber-600 block uppercase">Provisório do ciclo</span>
                      </div>
                    </div>

                    {/* RESUMO DOS ATENDIMENTOS REAIS */}
                    <div className="bg-slate-50/80 border border-slate-150 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Serviços Atendidos</span>
                        <span className="text-[10px] font-bold text-slate-600">
                          {barberPot.totalServices} total
                        </span>
                      </div>

                      {barberPot.attendedServices && barberPot.attendedServices.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {barberPot.attendedServices.map((srv: any, sIdx: number) => {
                            const nameLower = srv.name.toLowerCase();
                            let icon = '✂️';
                            if (nameLower.includes('barba')) icon = '💈';
                            else if (nameLower.includes('sobrancelha') || nameLower.includes('acabamento') || nameLower.includes('pezinho')) icon = '✨';
                            else if (nameLower.includes('platinado') || nameLower.includes('luzes') || nameLower.includes('quimica') || nameLower.includes('alisamento')) icon = '🧪';
                            else if (nameLower.includes('hidrat')) icon = '💧';

                            return (
                              <span 
                                key={`pot-srv-${barberPot.uid}-${srv.name}-${sIdx}`}
                                className="inline-flex items-center gap-1 bg-white border border-slate-200/80 px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-slate-700 shadow-2xs"
                              >
                                <span>{icon}</span>
                                <span>{srv.count} {srv.name}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-1 text-center">
                          <span className="text-[10px] font-medium text-slate-400 italic">
                            Nenhum serviço atendido no ciclo
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AÇÕES: BOTÃO VER DETALHAMENTO DE ASSINATURAS */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBarberDetailModal(barberPot)}
                      className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                    >
                      <Eye size={14} />
                      <span>Ver Detalhamento das Assinaturas ({barberPot.subBreakdownList.length})</span>
                    </button>
                  </div>
                </div>
              ))}

              {calculatedCommissionsData.barberPots.length === 0 && (
                <div className="col-span-full bg-white border border-slate-200 rounded-[2rem] p-12 text-center space-y-2">
                  <p className="text-slate-500 font-bold text-sm">Nenhum valor de pote encontrado para os filtros selecionados.</p>
                  <p className="text-slate-400 text-xs">Tente alterar o período ou o filtro de barbeiros.</p>
                </div>
              )}
            </div>
          </div>

          {/* Utilização de Serviços por Plano */}
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <h5 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <Scissors size={14} className="text-indigo-600" />
                  <span>Utilização de Serviços por Plano</span>
                </h5>
                <p className="text-slate-500 text-[11px] font-semibold">
                  Acompanhe quais planos geraram atendimentos no período selecionado
                </p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-2xl shrink-0 flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider">Total de Serviços:</span>
                <span className="text-base font-black">{filteredUsages.length} atendimentos</span>
              </div>
            </div>

            {usagesByPlan.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-slate-400 text-xs font-bold">Nenhum serviço realizado sob assinatura neste período.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {usagesByPlan.map((item, itemIdx) => {
                  const isExpanded = expandedPlanId === item.planId;
                  
                  const barberBreakdown: Record<string, number> = {};
                  item.usages.forEach(u => {
                    const bName = u.profissional_name || 'Desconhecido';
                    barberBreakdown[bName] = (barberBreakdown[bName] || 0) + 1;
                  });

                  return (
                    <div key={`usage-plan-${item.planId || itemIdx}-${itemIdx}`} className="transition-colors">
                      <div 
                        onClick={() => setExpandedPlanId(isExpanded ? null : item.planId)}
                        className="p-5 flex items-center justify-between hover:bg-slate-50/50 cursor-pointer transition select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-600 shrink-0">
                            <CreditCard size={18} />
                          </div>
                          <div>
                            <h6 className="text-xs font-black text-slate-800 uppercase tracking-wider">{item.planName}</h6>
                            <span className="text-[10px] font-bold text-slate-400 uppercase font-black">
                              Valor do Plano: R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-xs font-black text-slate-800 block">
                              {item.usages.length} {item.usages.length === 1 ? 'serviço' : 'serviços'}
                            </span>
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">
                              {Math.round((item.usages.length / (filteredUsages.length || 1)) * 100)}% do total
                            </span>
                          </div>
                          <div className="text-slate-400">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden bg-slate-50/40 border-t border-slate-100"
                          >
                            <div className="p-5 space-y-5">
                              <div className="space-y-2">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Atendimentos por Profissional</span>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(barberBreakdown).map(([barberName, count], bIdx) => (
                                    <div key={`b-breakdown-${barberName}-${bIdx}`} className="bg-white border border-slate-200/65 px-3 py-1.5 rounded-full text-[10px] font-bold text-slate-600 shadow-sm flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                      <span>{barberName}:</span>
                                      <span className="font-black text-indigo-600">{count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block">Histórico de Atendimentos</span>
                                <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
                                  <div className="max-h-60 overflow-y-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-slate-50 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b">
                                          <th className="p-3">Data</th>
                                          <th className="p-3">Cliente</th>
                                          <th className="p-3">Profissional</th>
                                          <th className="p-3">Serviço</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-150 text-[11px] font-semibold text-slate-600">
                                        {item.usages.map((u: any, uIdx: number) => (
                                          <tr key={`u-row-${u.id || uIdx}-${uIdx}`} className="hover:bg-slate-50/50 transition">
                                            <td className="p-3 whitespace-nowrap">
                                              {format(parseISO(u.date), 'dd/MM/yyyy')}
                                            </td>
                                            <td className="p-3 font-bold text-slate-700">
                                              {u.cliente_name || 'Assinante'}
                                            </td>
                                            <td className="p-3">
                                              {u.profissional_name || 'Desconhecido'}
                                            </td>
                                            <td className="p-3">
                                              <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md text-[9px] font-black uppercase">
                                                {u.service_name || (u.type === 'haircut' ? 'Corte' : u.type === 'beard' ? 'Barba' : 'Outro')}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico de Repasses de Potes Lançados */}
          <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden animate-fade-in mt-6" id="comission_history_panel">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="space-y-1">
                <h5 className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                  <History size={14} className="text-indigo-600" />
                  <span>Histórico de Repasses de Potes Lançados</span>
                </h5>
                <p className="text-slate-500 text-[11px] font-semibold">
                  Relatório gerencial de comissões pagas de assinaturas, detalhado profissional por profissional
                </p>
              </div>

              {/* Select Professional Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Filtrar Profissional:</span>
                <select
                  value={historyBarberFilter}
                  onChange={(e) => setHistoryBarberFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 outline-none rounded-xl py-2 px-3 text-xs font-bold text-slate-700 cursor-pointer shadow-sm focus:border-indigo-500 focus:bg-white transition"
                  id="history_barber_filter"
                >
                  <option value="all">Todos os Profissionais</option>
                  {barbeiros.map((b, bIdx) => (
                    <option key={`hist-barber-opt-${b.uid || bIdx}-${bIdx}`} value={b.uid}>{b.nome || b.displayName || 'Barbeiro'}</option>
                  ))}
                </select>
              </div>
            </div>

            {Object.keys(releasedRuns).length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mx-auto border border-slate-100 shadow-sm">
                  <History size={20} />
                </div>
                <p className="text-slate-500 font-bold text-sm">Nenhum pote de comissões de assinatura lançado ainda.</p>
                <p className="text-slate-400 text-xs">Os lançamentos efetuados no financeiro aparecerão aqui para acompanhamento histórico.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse border-spacing-0">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] font-black text-slate-450 uppercase tracking-widest border-b font-mono">
                      <th className="p-4 text-slate-450 font-black">Período / Referência</th>
                      <th className="p-4 text-slate-450 font-black">Data do Lançamento</th>
                      <th className="p-4 text-slate-450 font-black">Autorizado por</th>
                      <th className="p-4 text-right text-slate-450 font-black">Valor Total do Pote</th>
                      <th className="p-4 text-right text-slate-450 font-black">Comissão do Profissional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-600">
                    {Object.values(releasedRuns)
                      .sort((a: any, b: any) => {
                        return b.period.localeCompare(a.period);
                      })
                      .map((run: any, runIdx: number) => {
                        let barberCommValue = 0;
                        let foundBarber = false;

                        if (run.barbersBreakdown && Array.isArray(run.barbersBreakdown)) {
                          const matching = run.barbersBreakdown.find((item: any) => item.profissional_id === historyBarberFilter);
                          if (matching) {
                            barberCommValue = matching.commission_value;
                            foundBarber = true;
                          }
                        }

                        if (historyBarberFilter !== 'all' && !foundBarber) {
                          return null;
                        }

                        return (
                          <tr key={`released-run-${run.period || run.id || runIdx}-${runIdx}`} className="hover:bg-slate-50/50 transition duration-150">
                            <td className="p-4 whitespace-nowrap">
                              <span className="font-black text-slate-800 uppercase bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] tracking-wider">
                                {run.periodLabel || run.period}
                              </span>
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-500 font-medium">
                              {run.releasedAt ? format(parseISO(run.releasedAt), 'dd/MM/yyyy HH:mm') : 'N/A'}
                            </td>
                            <td className="p-4 whitespace-nowrap text-slate-500 font-medium">
                              {run.releasedBy || 'Administrador'}
                            </td>
                            <td className="p-4 text-right font-black text-slate-900 whitespace-nowrap">
                              R$ {run.totalAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                            </td>
                            <td className="p-4 text-right whitespace-nowrap">
                              {historyBarberFilter === 'all' ? (
                                <div className="flex flex-col items-end gap-1">
                                  {run.barbersBreakdown && Array.isArray(run.barbersBreakdown) && run.barbersBreakdown.length > 0 ? (
                                    <div className="flex flex-wrap justify-end gap-1 max-w-[300px]">
                                      {run.barbersBreakdown.map((item: any, itemIdx: number) => (
                                        <span 
                                          key={`barber-bd-${item.profissional_id || itemIdx}-${itemIdx}`} 
                                          className="bg-indigo-50 border border-indigo-100/60 text-indigo-700 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase"
                                          title={item.profissional_name}
                                        >
                                          {item.profissional_name?.split(' ')[0]}: <strong className="font-black">R$ {item.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic text-[10px]">Detalhamento indisponível</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-emerald-700 font-black text-xs bg-emerald-50 border border-emerald-150 px-2.5 py-1 rounded-lg">
                                  R$ {barberCommValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
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
                  const now = new Date();
                  for (let i = 0; i < 12; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const label = format(d, 'MMMM yyyy', { locale: ptBR });
                    list.push({ value: `${year}-${month}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
                  }
                  return list.map((m, mIdx) => (
                    <option key={`mth-opt-rend-${m.value}-${mIdx}`} value={m.value}>{m.label}</option>
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
                  {calculatedCommissions.map((barber, bIdx) => {
                    const sharePct = filteredUsages.length > 0 
                      ? Math.round((barber.totalServices / filteredUsages.length) * 100) 
                      : 0;

                    return (
                      <div key={`calc-barber-${barber.uid || bIdx}-${bIdx}`} className="flex items-center gap-4">
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
                        <tr key={`client-stat-${client.clientId || 'c'}-${idx}`} className="hover:bg-slate-50/50 transition">
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
              {subscriptions.map((sub, sIdx) => (
                <SubscriptionCard 
                  key={`sub-card-client-${sub.id || sIdx}-${sIdx}`} 
                  sub={sub} 
                  plan={plans.find(p => p.id === sub.plano_id)}
                  isAdmin={false}
                  onRegisterUsage={() => {}}
                  onViewInvoices={handleViewInvoices}
                  onToggleAutoRenew={handleToggleAutoRenew}
                  onStatusChange={handleUpdateSubscriptionStatus}
                  onShowChargeModal={handleOpenChargeModal}
                  onViewDetail={handleViewSubDetail}
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
              {plans.filter(p => p.status === 'active' && p.showInPortal !== false).map((plan, pIdx) => (
                <PlanCard 
                  key={`plan-card-available-${plan.id || pIdx}-${pIdx}`} 
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

      <ConfirmationModal
        isOpen={!!deletePlanTarget}
        onClose={() => setDeletePlanTarget(null)}
        onConfirm={handleConfirmDeletePlan}
        title="Excluir Plano de Assinatura"
        description={
          deletePlanTarget && subscriptions.filter(s => s.plano_id === deletePlanTarget.id && (s.status === 'active' || s.status === 'pending')).length > 0
            ? `Atenção: Existem ${subscriptions.filter(s => s.plano_id === deletePlanTarget.id && (s.status === 'active' || s.status === 'pending')).length} assinante(s) ativo(s) neste plano (${deletePlanTarget.name}). Deseja realmente excluir este plano?`
            : `Deseja realmente excluir o plano "${deletePlanTarget?.name}"? Esta ação removerá o plano permanentemente.`
        }
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

      {/* MODAL: DETALHES DA ASSINATURA & HISTÓRICO DE ATENDIMENTOS */}
      <AnimatePresence>
        {selectedSubDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border border-slate-200 rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl my-8 text-primary outline-none flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div>
                  <h2 className="text-xl font-black text-slate-800">
                    Detalhes do Assinante
                  </h2>
                  <p className="text-muted text-xs font-bold uppercase tracking-widest mt-1">
                    Histórico de atendimentos e ajuste de vencimento
                  </p>
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setSelectedSubDetail(null);
                    setSubUsages([]);
                  }} 
                  className="p-2 text-slate-400 hover:text-primary transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-8 overflow-y-auto">
                {/* Subscriber Profile & Subscription Summary */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                      {(() => {
                        const matched = clients.find(c => c.uid === selectedSubDetail.cliente_id);
                        return (matched as any)?.foto || (matched as any)?.photoURL ? (
                          <img 
                            src={(matched as any)?.foto || (matched as any)?.photoURL} 
                            alt={selectedSubDetail.cliente_name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <Users size={24} className="text-slate-400" />
                        );
                      })()}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg leading-tight">{selectedSubDetail.cliente_name}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-black text-accent uppercase tracking-widest">{selectedSubDetail.planName}</span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                          selectedSubDetail.status === 'active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : selectedSubDetail.status === 'pending'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : selectedSubDetail.status === 'paused'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : selectedSubDetail.status === 'canceled'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          {selectedSubDetail.status === 'active' 
                            ? 'Ativa' 
                            : selectedSubDetail.status === 'pending'
                            ? 'Aguardando Pagamento'
                            : selectedSubDetail.status === 'paused'
                            ? 'Pausada'
                            : selectedSubDetail.status === 'canceled'
                            ? 'Cancelada'
                            : 'Expirada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-auto flex flex-row md:flex-col justify-between md:items-end gap-1.5 pt-4 md:pt-0 border-t md:border-t-0 border-slate-200/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Mensalidade</span>
                    <span className="text-xl font-black text-emerald-600 block">
                      R$ {(plans.find(p => p.id === selectedSubDetail.plano_id)?.price || 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Main Content Layout Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  
                  {/* Left Column: Manage Dates & Plan Info */}
                  <div className="lg:col-span-5 space-y-6">
                    {/* Alterar Data de Vencimento Form */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Calendar size={16} className="text-accent" />
                        <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Ajustar Datas do Ciclo</h4>
                      </div>

                      <div className="space-y-3.5">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Data de Início</label>
                          <input 
                            type="date" 
                            value={newSubStartDate}
                            onChange={(e) => setNewSubStartDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-accent focus:bg-white transition-all"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Data de Vencimento</label>
                          <input 
                            type="date" 
                            value={newSubEndDate}
                            onChange={(e) => setNewSubEndDate(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-accent focus:bg-white transition-all"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSaveSubDates}
                          disabled={isSavingSubDates || (newSubStartDate === selectedSubDetail.startDate && newSubEndDate === selectedSubDetail.endDate)}
                          className="w-full py-3 bg-accent hover:bg-accent-hover disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {isSavingSubDates ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <span>Salvar Novas Datas</span>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Subscription Rules summary */}
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
                      <h4 className="font-bold text-slate-700 text-[10px] uppercase tracking-wider font-black">Informações de Renovação</h4>
                      <div className="text-[11px] font-medium text-slate-500 leading-relaxed space-y-2">
                        <div className="flex justify-between">
                          <span>Renovação:</span>
                          <strong className="text-slate-700 font-extrabold">{selectedSubDetail.autoRenew ? 'Automática' : 'Manual'}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Assinatura desde:</span>
                          <strong className="text-slate-700 font-extrabold">
                            {selectedSubDetail.startDate ? format(parseISO(selectedSubDetail.startDate), 'dd/MM/yyyy') : '-'}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span>Vencimento atual:</span>
                          <strong className="text-slate-700 font-extrabold">
                            {selectedSubDetail.endDate ? format(parseISO(selectedSubDetail.endDate), 'dd/MM/yyyy') : '-'}
                          </strong>
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Right Column: History of Usages */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History size={16} className="text-accent" />
                        <h4 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Histórico de Atendimentos no Ciclo</h4>
                      </div>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-150 font-black px-2 py-0.5 rounded-lg uppercase tracking-wider">
                        {subUsages.length} {subUsages.length === 1 ? 'Uso' : 'Usos'}
                      </span>
                    </div>

                    {loadingSubUsages ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                        <Loader2 size={24} className="animate-spin text-accent" />
                        <span className="text-xs font-bold text-slate-500">Buscando atendimentos...</span>
                      </div>
                    ) : subUsages.length === 0 ? (
                      <div className="bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl p-10 text-center">
                        <AlertCircle size={28} className="text-slate-300 mx-auto mb-2.5" />
                        <p className="text-xs font-extrabold text-slate-600 mb-0.5">Nenhum atendimento realizado</p>
                        <p className="text-[11px] text-slate-400 font-medium">Este assinante ainda não utilizou os benefícios neste ciclo.</p>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                        <div className="overflow-x-auto max-h-[280px]">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black text-slate-500 uppercase tracking-wider">
                                <th className="p-3 pl-4">Serviço</th>
                                <th className="p-3">Data</th>
                                <th className="p-3">Profissional</th>
                                <th className="p-3 pr-4 text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-600">
                              {subUsages.map((usage, uIdx) => (
                                <tr key={`sub-usage-${usage.id || uIdx}-${uIdx}`} className="hover:bg-slate-50/50 transition">
                                  <td className="p-3 pl-4 font-extrabold text-slate-800">
                                    {usage.service_name || (usage.type === 'haircut' ? 'Corte de Cabelo' : 'Barba')}
                                  </td>
                                  <td className="p-3">
                                    {usage.date ? format(parseISO(usage.date), 'dd/MM/yyyy') : '-'}
                                  </td>
                                  <td className="p-3 font-semibold text-slate-700 font-bold">
                                    {usage.profissional_name || '-'}
                                  </td>
                                  <td className="p-3 pr-4 text-right font-extrabold text-emerald-600">
                                    {usage.valor_servico ? `R$ ${usage.valor_servico.toFixed(2)}` : 'Incluso'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubDetail(null);
                    setSubUsages([]);
                  }}
                  className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer"
                >
                  Fechar Detalhes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CADASTRO / EDIÇÃO DE PLANO */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="bg-white border border-slate-200 rounded-[2rem] w-full max-w-3xl overflow-hidden shadow-2xl my-auto text-primary outline-none flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-black shrink-0">
                    <Star size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 leading-tight">
                      {editingPlan ? `Editar Plano: ${editingPlan.name}` : 'Criar Novo Plano de Assinatura'}
                    </h2>
                    <p className="text-muted text-xs font-bold uppercase tracking-wider mt-0.5">
                      Configurar regras de faturamento recorrente, serviços inclusos e comissões
                    </p>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowPlanModal(false)} 
                  className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleSavePlan} className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* SEÇÃO 1: DADOS BÁSICOS & PREÇO */}
                <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-500" />
                      1. Identificação & Preço do Plano
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status:</span>
                      <select 
                        name="status" 
                        defaultValue={editingPlan?.status || 'active'} 
                        className="bg-white border border-slate-200 rounded-xl py-1 px-3 text-xs font-extrabold text-primary outline-none cursor-pointer focus:border-accent"
                      >
                        <option value="active">🟢 Ativo / Disponível</option>
                        <option value="inactive">🔴 Inativo / Oculto</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                        Nome do Plano *
                      </label>
                      <input 
                        required 
                        type="text" 
                        name="name" 
                        defaultValue={editingPlan?.name || ''} 
                        placeholder="Ex: Clube do Cabelo & Barba Premium" 
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder:text-slate-350" 
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                        Valor Mensal (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-xs font-black text-slate-400">R$</span>
                        <input 
                          required 
                          type="number" 
                          name="price" 
                          step="0.01" 
                          defaultValue={editingPlan?.price || ''} 
                          placeholder="99.90" 
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-extrabold text-emerald-700 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition-all font-mono placeholder:text-slate-350" 
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                      Descrição Comercial *
                    </label>
                    <textarea 
                      required 
                      name="description" 
                      defaultValue={editingPlan?.description || ''} 
                      placeholder="Ex: Cortes e barbas ilimitados durante todo o mês com direito a descontos exclusivos em pomadas e bebidas." 
                      rows={2} 
                      className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-4 text-xs font-semibold text-slate-800 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all resize-none placeholder:text-slate-350" 
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                      Benefícios Extras (Separar por vírgula)
                    </label>
                    <input 
                      type="text" 
                      name="extraBenefits" 
                      defaultValue={editingPlan?.extraBenefits.join(', ') || ''} 
                      placeholder="Ex: Chopp cortesia, 10% off em produtos, Atendimento VIP" 
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-4 text-xs font-semibold text-slate-800 focus:outline-none focus:border-accent transition-all placeholder:text-slate-350" 
                    />
                  </div>
                </div>

                {/* SEÇÃO 2: SERVIÇOS INCLUSOS NA ASSINATURA */}
                <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                        <Scissors size={16} className="text-indigo-600" />
                        2. Serviços Inclusos no Plano
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Adicione os serviços que o assinante tem direito e configure limites ou peso para repasses
                      </p>
                    </div>
                    <span className="text-[10px] font-extrabold bg-indigo-50 border border-indigo-100 text-indigo-700 px-3 py-1 rounded-full self-start sm:self-auto">
                      {planServices.length} {planServices.length === 1 ? 'serviço incluso' : 'serviços inclusos'}
                    </span>
                  </div>

                  {/* Seletor para Adicionar Serviço */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex-1">
                      <select
                        value={selectedPlanServiceId}
                        onChange={(e) => setSelectedPlanServiceId(e.target.value)}
                        className="w-full bg-transparent border-0 py-2 px-3 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                      >
                        <option value="">Selecione um serviço do catálogo para adicionar...</option>
                        {services.map((s, sIdx) => (
                          <option key={`ps-svc-opt-${s.id || sIdx}-${sIdx}`} value={s.id}>
                            {s.nome} — R$ {(s.preco ?? s.price ?? 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPlanService}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Plus size={16} />
                      <span>Incluir no Plano</span>
                    </button>
                  </div>

                  {/* Lista de Serviços Inclusos */}
                  {planServices.length > 0 ? (
                    <div className="space-y-3">
                      {planServices.map((ps, psIdx) => (
                        <div 
                          key={`plan-svc-card-${ps.serviceId || psIdx}-${psIdx}`} 
                          className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                        >
                          {/* Nome e Preço Referência */}
                          <div className="flex items-center gap-3 min-w-[200px]">
                            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                              <Scissors size={18} />
                            </div>
                            <div>
                              <h4 className="text-xs font-black text-slate-900 leading-tight">{ps.name}</h4>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                {services.find(s => s.id === ps.serviceId)?.preco ? `Avulso: R$ ${services.find(s => s.id === ps.serviceId)?.preco.toFixed(2)}` : 'Serviço cadastrado'}
                              </p>
                            </div>
                          </div>

                          {/* Controles de Limite & Peso */}
                          <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
                            
                            {/* Toggle Ilimitado / Quantidade */}
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                              <label className="flex items-center gap-2 text-xs font-black text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ps.isUnlimited}
                                  onChange={(e) => handleUpdatePlanService(ps.serviceId, { isUnlimited: e.target.checked })}
                                  className="accent-indigo-600 w-4 h-4 rounded cursor-pointer"
                                />
                                <span>Ilimitado</span>
                              </label>

                              {!ps.isUnlimited && (
                                <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                                  <input
                                    type="number"
                                    min="1"
                                    value={ps.limit}
                                    onChange={(e) => handleUpdatePlanService(ps.serviceId, { limit: Math.max(1, Number(e.target.value)) })}
                                    className="w-12 bg-white border border-slate-200 rounded-lg py-1 px-1 text-xs text-center font-black text-slate-900 outline-none focus:border-indigo-500"
                                  />
                                  <span className="text-[10px] font-bold text-slate-500 uppercase">/mês</span>
                                </div>
                              )}
                            </div>

                            {/* Pontos / Peso */}
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl" title="Peso de pontos para cálculo em comissão por rateio (pool)">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Peso:</span>
                              <input
                                type="text"
                                placeholder="1"
                                value={ps.points !== undefined ? ps.points : 1}
                                onChange={(e) => {
                                  const val = e.target.value.replace(',', '.');
                                  const num = val === '' ? 1 : Number(val);
                                  const finalNum = isNaN(num) ? 1 : num;
                                  handleUpdatePlanService(ps.serviceId, { points: finalNum });
                                  setPlanPontosServicos(prev => ({ ...prev, [ps.serviceId]: finalNum }));
                                }}
                                className="w-12 bg-white border border-slate-200 rounded-lg py-1 px-1 text-xs text-center font-black text-indigo-700 outline-none focus:border-indigo-500"
                              />
                              <span className="text-[10px] font-bold text-slate-400">pts</span>
                            </div>

                            {/* Botão Remover */}
                            <button
                              type="button"
                              onClick={() => handleRemovePlanService(ps.serviceId)}
                              title="Remover serviço da assinatura"
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-white border border-dashed border-slate-200 rounded-2xl text-center space-y-1">
                      <Scissors size={24} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs text-slate-600 font-bold">Nenhum serviço incluso ainda</p>
                      <p className="text-[10px] text-slate-400 font-medium">Selecione os serviços acima que farão parte deste plano de assinatura.</p>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 3: COMISSIONAMENTO & REPASSE DOS PROFISSIONAIS */}
                <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                  <div className="border-b border-slate-200/60 pb-3">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <Percent size={16} className="text-indigo-600" />
                      3. Modelo de Comissão para os Barbeiros
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Como o valor da assinatura será repassado para a equipe quando realizarem os atendimentos
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setPlanComissaoTipo('fixo')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        planComissaoTipo === 'fixo'
                          ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/10 shadow-sm'
                          : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-900 mb-1">Comissão Fixa</div>
                      <div className="text-[10px] text-slate-500 font-medium leading-snug">
                        Valor fixo em R$ pago por cada atendimento realizado.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPlanComissaoTipo('pool_atendimentos')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        planComissaoTipo === 'pool_atendimentos'
                          ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/10 shadow-sm'
                          : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-900 mb-1">Pool por Quantidade</div>
                      <div className="text-[10px] text-slate-500 font-medium leading-snug">
                        % da mensalidade rateada pela soma total de atendimentos do ciclo.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPlanComissaoTipo('pool_pontos')}
                      className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        planComissaoTipo === 'pool_pontos'
                          ? 'bg-white border-indigo-600 ring-2 ring-indigo-600/10 shadow-sm'
                          : 'bg-white/60 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-black text-slate-900 mb-1">Pool por Pontos (Peso)</div>
                      <div className="text-[10px] text-slate-500 font-medium leading-snug">
                        Rateio proporcional ao peso de cada serviço realizado no ciclo.
                      </div>
                    </button>
                  </div>

                  {planComissaoTipo === 'fixo' ? (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">
                        Valor Fixo Pago por Serviço ao Barbeiro (R$)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="relative w-48">
                          <span className="absolute left-3.5 top-2 text-xs font-black text-slate-400">R$</span>
                          <input 
                            type="number" 
                            step="0.01" 
                            value={planComissaoFixaValor} 
                            onChange={(e) => setPlanComissaoFixaValor(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-3 text-sm font-black text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-mono" 
                          />
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          O profissional recebe este valor creditado em sua ficha a cada serviço do assinante.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block">
                        % da Mensalidade Destinado ao Fundo de Rateio (Pool)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="relative w-36">
                          <input 
                            type="number" 
                            min="1" 
                            max="100" 
                            value={planComissaoPoolPorcentagem} 
                            onChange={(e) => setPlanComissaoPoolPorcentagem(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-black text-slate-900 outline-none focus:bg-white focus:border-indigo-500 font-mono text-center" 
                          />
                          <span className="absolute right-3.5 top-2 text-xs font-black text-slate-400">%</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-semibold">
                          Ex: Se o plano custa R$ 100,00 com 50%, R$ 50,00 serão divididos entre os barbeiros que atenderam o cliente no ciclo.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* SEÇÃO 4: DESCONTOS EXTRAS PARA ASSINANTES */}
                <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                  <div className="border-b border-slate-200/60 pb-3">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <Tag size={16} className="text-indigo-600" />
                      4. Descontos Exclusivos para Assinantes deste Plano
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                      Descontos especiais em produtos do estoque ou outros serviços avulsos
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                        Item ou Categoria
                      </label>
                      <select
                        value={discountItemId}
                        onChange={(e) => setDiscountItemId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-800 outline-none cursor-pointer focus:border-accent"
                      >
                        <option value="">Selecione um item ou categoria...</option>
                        <optgroup label="Categorias Gerais">
                          <option value="all_services">Todos os Serviços</option>
                          <option value="all_products">Todos os Produtos</option>
                        </optgroup>
                        <optgroup label="Serviços Individuais">
                          {services.map((s, sIdx) => (
                            <option key={`servico_${s.id || sIdx}_${sIdx}`} value={`servico_${s.id}`}>
                              Serviço: {s.nome} (R$ {(s.preco ?? s.price ?? 0).toFixed(2)})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Produtos Individuais">
                          {products.map((p, pIdx) => (
                            <option key={`product_${p.id || pIdx}_${pIdx}`} value={`product_${p.id}`}>
                              Produto: {p.name} (R$ {(p.salePrice ?? p.preco ?? 0).toFixed(2)})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                        % Desconto
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={discountPercentage}
                          onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-7 text-xs font-black text-slate-900 outline-none focus:border-accent text-center font-mono"
                          placeholder="10"
                        />
                        <span className="absolute right-3 top-2 text-xs font-black text-slate-400">%</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddDiscount}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      <Plus size={16} />
                      <span>Adicionar</span>
                    </button>
                  </div>

                  {planDiscounts.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                      {planDiscounts.map((discount, dIdx) => (
                        <div
                          key={`discount-item-${discount.itemId || dIdx}-${dIdx}`}
                          className="bg-white border border-slate-200 p-2.5 rounded-xl flex items-center justify-between shadow-xs font-bold text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0">
                              {discount.itemType === 'all_services' || discount.itemType === 'servico' ? 'Serviço' : 'Produto'}
                            </span>
                            <span className="text-slate-800 text-xs truncate">{discount.itemName}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-emerald-700 font-black text-xs">
                              {discount.percentage}% OFF
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveDiscount(discount.itemId)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SEÇÃO 5: CONFIGURAÇÕES DE PAGAMENTO & PORTAL */}
                <div className="bg-slate-50/60 border border-slate-200/80 p-5 rounded-2xl space-y-4">
                  <div className="border-b border-slate-200/60 pb-3">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                      <CreditCard size={16} className="text-indigo-600" />
                      5. Pagamento & Exibição no Portal
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Formas de Pagamento */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-2.5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                        Formas de Pagamento Permitidas
                      </span>
                      <div className="flex flex-col gap-2 text-xs font-bold text-slate-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={planAllowedPaymentMethods.includes('PIX')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPlanAllowedPaymentMethods(prev => [...prev, 'PIX']);
                              } else {
                                if (planAllowedPaymentMethods.length <= 1) {
                                  toast.error('Pelo menos uma forma de pagamento deve permanecer selecionada.');
                                  return;
                                }
                                setPlanAllowedPaymentMethods(prev => prev.filter(m => m !== 'PIX'));
                              }
                            }}
                            className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                          />
                          <span>⚡ PIX (Instantâneo)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={planAllowedPaymentMethods.includes('CREDIT_CARD')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPlanAllowedPaymentMethods(prev => [...prev, 'CREDIT_CARD']);
                              } else {
                                if (planAllowedPaymentMethods.length <= 1) {
                                  toast.error('Pelo menos uma forma de pagamento deve permanecer selecionada.');
                                  return;
                                }
                                setPlanAllowedPaymentMethods(prev => prev.filter(m => m !== 'CREDIT_CARD'));
                              }
                            }}
                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                          />
                          <span>💳 Cartão de Crédito Recorrente</span>
                        </label>
                      </div>
                    </div>

                    {/* Exibição e Cancelamento */}
                    <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">Exibir no Portal do Cliente</span>
                          <span className="text-[9px] text-slate-400 font-medium block">Visível para contratação online</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPlanShowInPortal(!planShowInPortal)}
                          className={`w-11 h-6 rounded-full transition relative shrink-0 cursor-pointer ${planShowInPortal ? 'bg-emerald-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition shadow-md ${planShowInPortal ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">Cancelamento pelo Cliente</span>
                          <span className="text-[9px] text-slate-400 font-medium block">Permite o cliente cancelar no app</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPlanAllowClientCancel(!planAllowClientCancel)}
                          className={`w-11 h-6 rounded-full transition relative shrink-0 cursor-pointer ${planAllowClientCancel ? 'bg-emerald-600' : 'bg-slate-300'}`}
                        >
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition shadow-md ${planAllowClientCancel ? 'left-6' : 'left-1'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Modal Footer Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 font-bold shrink-0">
                  {editingPlan && canManage ? (
                    <button 
                      type="button" 
                      onClick={() => setDeletePlanTarget(editingPlan)} 
                      className="w-full sm:w-auto px-4 py-3 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 size={16} />
                      <span>Excluir este Plano</span>
                    </button>
                  ) : (
                    <div className="hidden sm:block" />
                  )}

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button 
                      type="button" 
                      onClick={() => setShowPlanModal(false)} 
                      className="flex-1 sm:flex-none px-6 py-3.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 uppercase tracking-wider hover:bg-slate-100 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit" 
                      disabled={isSavingPlan}
                      className="flex-1 sm:flex-none px-8 py-3.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingPlan ? (
                        <>
                          <Loader2 className="animate-spin" size={16} />
                          <span>Salvando...</span>
                        </>
                      ) : (
                        <span>Salvar Plano</span>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal: Vincular Assinante */}
      <AnimatePresence>
        {showAssignModal && selectedPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border rounded-[2rem] w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto"
            >
              <div className="p-6 border-b flex items-center justify-between bg-slate-50/50 shrink-0">
                <div>
                  <h2 className="text-xl font-bold text-primary">Ativar Assinatura de Cliente</h2>
                  <p className="text-muted text-xs font-bold uppercase tracking-widest mt-1">Plano Escolhido: {selectedPlan.name}</p>
                </div>
                <button type="button" onClick={() => setShowAssignModal(false)} className="p-2 text-slate-400 hover:text-primary transition-colors cursor-pointer">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAssignSubscription} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Buscar Cliente</label>
                    <select 
                      name="clientId" 
                      required 
                      value={assignSelectedClientId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setAssignSelectedClientId(id);
                        const c = clients.find(cl => cl.uid === id);
                        const existingCpf = c?.cpf || (c as any)?.cpfCnpj || '';
                        setAssignClientCpf(formatCpfMask(existingCpf));
                        setAssignClientEmail(c?.email || '');
                      }}
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none cursor-pointer font-extrabold"
                    >
                      <option value="">Selecione o Cliente do Clube...</option>
                      {clients.map((c, index) => (
                        <option key={`assign-client-${c.uid || index}-${index}`} value={c.uid}>
                          {c.nome} {c.cpf ? `(CPF: ${formatCpfMask(c.cpf)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Tipo de Cadastro / Ativação</label>
                    <select 
                      name="activationType" 
                      required 
                      value={assignActivationType} 
                      onChange={(e) => setAssignActivationType(e.target.value as 'manual' | 'asaas')} 
                      className="w-full bg-slate-50 border border-slate-150 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:border-accent/50 focus:bg-white transition-all text-primary outline-none cursor-pointer font-extrabold"
                    >
                      <option value="manual">Cadastro Manual (Ativar agora abrindo Caixa/PDV)</option>
                      <option value="asaas">Cadastro via Asaas (Fica Pendente até simular pagamento ou webhook)</option>
                    </select>
                  </div>

                  {assignSelectedClientId && (
                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                      <p className="font-extrabold uppercase tracking-wide text-[10px] text-slate-500">Dados Cadastrais do Cliente (Obrigatórios):</p>
                      
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">
                          E-mail do Cliente
                        </label>
                        <input 
                          type="email" 
                          name="clientEmail" 
                          value={assignClientEmail}
                          onChange={(e) => setAssignClientEmail(e.target.value)}
                          placeholder="cliente@email.com" 
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-accent"
                          required
                        />
                      </div>

                      <div className="space-y-1 text-left">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-700 block">CPF do Cliente</label>
                          {assignClientCpf && isValidCPF(assignClientCpf.replace(/\D/g, '')) ? (
                            <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <ShieldCheck size={12} />
                              CPF Válido
                            </span>
                          ) : assignClientCpf ? (
                            <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              Aguardando 11 dígitos
                            </span>
                          ) : null}
                        </div>
                        <input 
                          type="text" 
                          name="clientCpf" 
                          value={assignClientCpf}
                          onChange={(e) => setAssignClientCpf(formatCpfMask(e.target.value))}
                          placeholder="000.000.000-00" 
                          maxLength={14}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-accent font-mono"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {assignActivationType === 'manual' ? (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl text-xs text-emerald-800 space-y-1">
                      <p className="font-extrabold uppercase tracking-wide text-[10px] text-emerald-600">Fluxo Manual:</p>
                      <p>O cliente assina na hora. O sistema irá abrir o Caixa/PDV para você lançar o recebimento no dinheiro, cartão ou fiado.</p>
                    </div>
                  ) : (
                    <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs text-purple-800 space-y-4">
                      <div>
                        <p className="font-extrabold uppercase tracking-wide text-[10px] text-purple-600">Fluxo Asaas (Cobrança Online):</p>
                        <p className="text-[11px] mt-0.5">A assinatura é criada como <strong className="text-purple-900 font-extrabold">pendente</strong> e é liberada quando o cliente conclui o Pix ou Cartão de Crédito.</p>
                      </div>

                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-black uppercase tracking-wider text-purple-900 block">Forma de Pagamento</label>
                        <select 
                          name="billingType"
                          className="w-full bg-white border border-purple-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-500 cursor-pointer"
                        >
                          {(!selectedPlan.allowedPaymentMethods || selectedPlan.allowedPaymentMethods.includes('PIX')) && (
                            <option value="PIX">⚡ Pix Instantâneo (QR Code + Copia e Cola)</option>
                          )}
                          {(!selectedPlan.allowedPaymentMethods || selectedPlan.allowedPaymentMethods.includes('CREDIT_CARD')) && (
                            <option value="CREDIT_CARD">💳 Cartão de Crédito Recorrente (Cobrança Mensal)</option>
                          )}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                    <input type="checkbox" name="autoRenew" id="autoRenew" defaultChecked className="w-5 h-5 accent-accent rounded-lg cursor-pointer" />
                    <label htmlFor="autoRenew" className="text-sm font-bold text-primary cursor-pointer select-none">Renovação Mensal Automática</label>
                  </div>
                </div>

                <div className="p-4 sm:p-6 border-t bg-slate-50/50 flex gap-3 shrink-0 font-bold">
                  <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-3.5 sm:py-4 border border-slate-200 rounded-xl text-xs sm:text-sm text-muted uppercase tracking-widest hover:bg-slate-100 transition-all cursor-pointer">Cancelar</button>
                  <button 
                    type="submit" 
                    className="flex-[2] py-3.5 sm:py-4 bg-primary text-white rounded-xl text-xs sm:text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95 cursor-pointer font-extrabold"
                  >
                    {assignActivationType === 'manual' ? 'Ir para o Caixa / PDV' : 'Criar Pendente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Cobrança Asaas Criada (Pix QR Code e Link Fatura) */}
      <AnimatePresence>
        {showCreatedChargeModal && createdChargeData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center font-black">
                    <QrCode size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Cobrança Asaas</h3>
                    <p className="text-xs font-bold text-slate-500">
                      {createdChargeData.clientName} • {createdChargeData.planName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreatedChargeModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                <div className="p-4 bg-purple-50/60 border border-purple-200/60 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-purple-600 tracking-wider">Valor do Plano</p>
                    <p className="text-2xl font-black text-purple-950">
                      R$ {(createdChargeData.price || 0).toFixed(2)}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 border border-purple-300 rounded-full text-xs font-extrabold uppercase tracking-wide">
                    {createdChargeData.status === 'active' || createdChargeData.status === 'received' ? '✅ Pago' : '⏳ Aguardando Pagamento'}
                  </span>
                </div>

                {/* Method-specific content */}
                {createdChargeData.billingType === 'CREDIT_CARD' ? (
                  <div className="space-y-4 bg-blue-50/60 border border-blue-200/60 p-5 rounded-2xl text-center">
                    <div className="w-12 h-12 bg-blue-100 border border-blue-300 text-blue-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <CreditCard size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Cadastro de Cartão de Crédito</p>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed">
                        Para ativar a assinatura recorrente, o cliente deve cadastrar o cartão de crédito com total segurança no ambiente de checkout homologado do Asaas.
                      </p>
                    </div>
                    {createdChargeData.paymentUrl && (
                      <div className="pt-2">
                        <a
                          href={createdChargeData.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <ExternalLink size={14} />
                          <span>Ir para Checkout de Cartão Asaas</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* QR Code Section */}
                    {createdChargeData.pixQrCodeUrl ? (
                      <div className="text-center space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Escaneie o QR Code Pix abaixo:</p>
                        <div className="p-3 bg-white rounded-2xl inline-block border shadow-sm">
                          <img 
                            src={createdChargeData.pixQrCodeUrl} 
                            alt="QR Code Pix" 
                            className="w-48 h-48 mx-auto object-contain rounded-xl"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <p className="text-xs text-slate-500 font-bold">Cobrança registrada com sucesso no Asaas.</p>
                      </div>
                    )}

                    {/* Pix Copia e Cola */}
                    {createdChargeData.pixCopiaECola && (
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Pix Copia e Cola:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={createdChargeData.pixCopiaECola}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-700 truncate"
                          />
                          <button
                            onClick={() => {
                              if (createdChargeData.pixCopiaECola) {
                                navigator.clipboard.writeText(createdChargeData.pixCopiaECola);
                                toast.success("Código Pix copiado!");
                              }
                            }}
                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                          >
                            <Copy size={14} />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Fatura Link */}
                    {createdChargeData.paymentUrl && (
                      <div className="pt-2">
                        <a
                          href={createdChargeData.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <ExternalLink size={16} />
                          <span>Abrir Link de Pagamento no Asaas</span>
                        </a>
                      </div>
                    )}
                  </>
                )}

                {/* Confirm Action for Admin */}
                {canManage && createdChargeData.status !== 'active' && (
                  <div className="pt-4 border-t border-slate-100 space-y-2 text-center">
                    <p className="text-[11px] text-slate-500 font-bold">
                      O pagamento é identificado automaticamente via Webhook. Você também pode ativar manualmente se desejar:
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleConfirmAsaasPayment(createdChargeData.id);
                        setShowCreatedChargeModal(false);
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
                    >
                      <CheckCircle size={16} />
                      <span>Confirmar Pagamento e Ativar Assinatura</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreatedChargeModal(false)}
                  className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: PULAR FATURA / BAIXA MANUAL NO CAIXA */}
      <AnimatePresence>
        {skipInvoiceSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center font-black shadow-sm">
                    <SkipForward size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Pular Fatura / Baixa Manual</h3>
                    <p className="text-xs font-bold text-slate-500">
                      Registrar pagamento avulso e renovar assinatura
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSkipInvoiceSub(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const paymentMethod = formData.get('paymentMethod') as string;
                  const amount = Number(formData.get('amount')) || 0;
                  const notes = formData.get('notes') as string;
                  const launchInCash = formData.get('launchInCash') === 'on';
                  const cancelAsaasInvoice = formData.get('cancelAsaasInvoice') === 'on';

                  handleSkipInvoice({
                    subscriptionId: skipInvoiceSub.id,
                    paymentMethod,
                    amount,
                    notes,
                    launchInCash,
                    cancelAsaasInvoice
                  });
                }}
                className="p-6 space-y-5 overflow-y-auto max-h-[75vh]"
              >
                {/* Client & Plan Info Card */}
                <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Assinante & Plano</span>
                    <h4 className="text-sm font-black text-slate-900">{skipInvoiceSub.cliente_name}</h4>
                    <span className="text-xs font-bold text-indigo-600">
                      {plans.find(p => p.id === skipInvoiceSub.plano_id)?.name || 'Plano de Assinatura'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">Novo Vencimento</span>
                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                      +1 mês a partir de hoje
                    </span>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} className="text-indigo-600" />
                    <span>Valor Recebido (R$)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    defaultValue={plans.find(p => p.id === skipInvoiceSub.plano_id)?.price || 0}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3.5 text-base font-black text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition shadow-sm"
                  />
                  <p className="text-[10px] font-bold text-slate-400">
                    Valor que será registrado como entrada financeira no caixa.
                  </p>
                </div>

                {/* Payment Method */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <Wallet size={14} className="text-indigo-600" />
                    <span>Forma de Pagamento Recebida</span>
                  </label>
                  <select
                    name="paymentMethod"
                    defaultValue="pix"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition cursor-pointer shadow-sm"
                  >
                    <option value="dinheiro">💵 Dinheiro (Balcão)</option>
                    <option value="pix">⚡ Pix (Chave / QR Code no Balcão)</option>
                    <option value="cartao_debito">💳 Cartão de Débito (Maquininha)</option>
                    <option value="cartao_credito">💳 Cartão de Crédito (Maquininha do Balcão)</option>
                    <option value="outro">🏷️ Outro / Cortesia / Acordo</option>
                  </select>
                </div>

                {/* Observations */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-600" />
                    <span>Observações (Opcional)</span>
                  </label>
                  <input
                    type="text"
                    name="notes"
                    placeholder="Ex: Cliente pagou em dinheiro no balcão"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition shadow-sm"
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl cursor-pointer hover:bg-emerald-50 transition select-none">
                    <input
                      type="checkbox"
                      name="launchInCash"
                      defaultChecked
                      className="w-4 h-4 mt-0.5 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div className="text-left">
                      <span className="text-xs font-black text-emerald-900 block">Lançar no Caixa Aberto da Barbearia</span>
                      <span className="text-[10px] font-semibold text-emerald-700 block">
                        Cria movimentação de entrada no turno de caixa atual com a forma de pagamento escolhida.
                      </span>
                    </div>
                  </label>

                  {skipInvoiceSub.activationType === 'asaas' && (
                    <label className="flex items-start gap-3 p-3 bg-purple-50/60 border border-purple-200/60 rounded-xl cursor-pointer hover:bg-purple-50 transition select-none">
                      <input
                        type="checkbox"
                        name="cancelAsaasInvoice"
                        defaultChecked
                        className="w-4 h-4 mt-0.5 accent-purple-600 rounded cursor-pointer"
                      />
                      <div className="text-left">
                        <span className="text-xs font-black text-purple-950 block">Cancelar / Ignorar cobrança pendente do Asaas</span>
                        <span className="text-[10px] font-semibold text-purple-800 block">
                          Evita que o cartão do cliente seja cobrado em duplicidade no gateway online.
                        </span>
                      </div>
                    </label>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSkipInvoiceSub(null)}
                    disabled={isSkippingInvoice}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSkippingInvoice}
                    className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSkippingInvoice ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        <span>Confirmar Baixa e Renovar</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: HISTÓRICO DE FATURAS PAGAS */}
      <AnimatePresence>
        {invoicesHistorySub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black shadow-sm">
                    <Receipt size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Histórico de Faturas & Pagamentos</h3>
                    <p className="text-xs font-bold text-slate-500">
                      {invoicesHistorySub.cliente_name} • {plans.find(p => p.id === invoicesHistorySub.plano_id)?.name || 'Assinatura'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInvoicesHistorySub(null);
                    setInvoicesList([]);
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-4">
                {loadingInvoices ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto" />
                    <p className="text-xs font-bold text-slate-500">Consultando faturas locais e no Asaas...</p>
                  </div>
                ) : invoicesList.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mx-auto">
                      <FileText size={24} />
                    </div>
                    <p className="text-sm font-black text-slate-700">Nenhuma fatura registrada ainda</p>
                    <p className="text-xs font-semibold text-slate-400">
                      Os pagamentos efetuados via cartão, Pix ou baixa no caixa serão listados aqui.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b">
                          <th className="p-3.5">Data / Vencimento</th>
                          <th className="p-3.5">Descrição / Origem</th>
                          <th className="p-3.5">Método</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right font-black">Valor</th>
                          <th className="p-3.5 text-center">Comprovante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {invoicesList.map((inv, idx) => {
                          const isPaid = inv.status === 'RECEIVED' || inv.status === 'CONFIRMED' || inv.status === 'pago' || inv.status === 'active' || inv.status === 'received';
                          const isOverdue = inv.status === 'OVERDUE' || inv.status === 'overdue';
                          
                          let statusLabel = 'Pendente';
                          let statusClass = 'bg-amber-50 text-amber-700 border-amber-200';

                          if (isPaid) {
                            statusLabel = 'Paga';
                            statusClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                          } else if (isOverdue) {
                            statusLabel = 'Atrasada';
                            statusClass = 'bg-rose-50 text-rose-700 border-rose-200';
                          }

                          const dateFormatted = inv.paymentDate 
                            ? format(parseISO(inv.paymentDate), 'dd/MM/yyyy') 
                            : (inv.dueDate ? format(parseISO(inv.dueDate), 'dd/MM/yyyy') : (inv.date ? format(parseISO(inv.date), 'dd/MM/yyyy') : '-'));

                          return (
                            <tr key={`inv-${inv.id || 'i'}-${idx}`} className="hover:bg-slate-50/70 transition">
                              <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">
                                {dateFormatted}
                              </td>
                              <td className="p-3.5 text-slate-600">
                                <div className="font-bold text-slate-800">{inv.description || 'Assinatura Mensal'}</div>
                                <span className="text-[9px] text-slate-400 font-extrabold uppercase">
                                  {inv.source === 'asaas' ? 'Gateway Asaas' : 'Baixa Balcão / Caixa'}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase">
                                  {inv.billingType || inv.forma_pagamento || 'Cartão'}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${statusClass}`}>
                                  {isPaid && <CheckCheck size={10} />}
                                  <span>{statusLabel}</span>
                                </span>
                              </td>
                              <td className="p-3.5 text-right font-black text-slate-900 text-sm whitespace-nowrap">
                                R$ {Number(inv.value || inv.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3.5 text-center">
                                {inv.invoiceUrl || inv.bankSlipUrl || inv.paymentUrl ? (
                                  <a
                                    href={inv.invoiceUrl || inv.bankSlipUrl || inv.paymentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg inline-flex items-center gap-1 text-[10px] font-black uppercase transition"
                                    title="Abrir fatura / comprovante"
                                  >
                                    <ExternalLink size={12} />
                                    <span>Ver</span>
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">-</span>
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

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-slate-500">
                  Total de {invoicesList.length} faturas encontradas
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setInvoicesHistorySub(null);
                    setInvoicesList([]);
                  }}
                  className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedBarberDetailModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 overflow-hidden flex items-center justify-center shrink-0">
                    {selectedBarberDetailModal.foto ? (
                      <img src={selectedBarberDetailModal.foto} alt={selectedBarberDetailModal.nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Users size={20} className="text-indigo-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-wide">
                      Extrato do Pote - {selectedBarberDetailModal.nome}
                    </h3>
                    <p className="text-[11px] font-bold text-slate-400">
                      Acompanhamento individual de cada assinatura que compõe o pote
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedBarberDetailModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Sub-Header Stats */}
              <div className="p-5 bg-indigo-50/50 border-b border-indigo-100/60 grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-400 block tracking-wider">Total do Pote</span>
                  <span className="text-lg font-black text-slate-900">
                    R$ {(isMonthReleased ? selectedBarberDetailModal.totalInProgressCommission : selectedBarberDetailModal.totalPot).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-emerald-600 block tracking-wider">Pote Liberado</span>
                  <span className="text-lg font-black text-emerald-700">
                    R$ {(isMonthReleased ? 0 : selectedBarberDetailModal.totalReleasedCommission).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-amber-600 block tracking-wider">Em Andamento</span>
                  <span className="text-lg font-black text-amber-600">
                    R$ {selectedBarberDetailModal.totalInProgressCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Modal Table Content */}
              <div className="p-6 overflow-y-auto space-y-4">
                {selectedBarberDetailModal.subBreakdownList.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-xs font-bold">Nenhuma assinatura registrada para este barbeiro no período.</p>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-black text-slate-450 uppercase tracking-widest border-b">
                          <th className="p-3.5">Assinante / Cliente</th>
                          <th className="p-3.5">Plano Contratado</th>
                          <th className="p-3.5 text-center">Vigência do Ciclo</th>
                          <th className="p-3.5 text-center">Atendimentos</th>
                          <th className="p-3.5 text-center">Status do Ciclo</th>
                          <th className="p-3.5 text-right font-black">Comissão</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {selectedBarberDetailModal.subBreakdownList.map((item: any, idx: number) => (
                          <tr key={`barber-sub-bd-${item.clientUid || item.planId || idx}-${idx}`} className="hover:bg-slate-50/60 transition">
                            <td className="p-3.5 font-bold text-slate-900">
                              {item.clientName || 'Cliente Assinante'}
                            </td>
                            <td className="p-3.5 text-slate-600">
                              <div>{item.planName}</div>
                              <span className="text-[9px] text-slate-400 font-bold">R$ {item.planPrice.toFixed(2)}/mês</span>
                            </td>
                            <td className="p-3.5 text-center text-slate-500 font-mono text-[11px]">
                              {format(parseISO(item.cycleStart), 'dd/MM')} a {format(parseISO(item.cycleEnd), 'dd/MM')}
                            </td>
                            <td className="p-3.5 text-center font-bold">
                              <span className="text-indigo-600 font-black">{item.barberSubUsages}</span>
                              <span className="text-slate-400 font-medium"> de {item.totalSubUsages} total</span>
                            </td>
                            <td className="p-3.5 text-center">
                              {item.isCycleReleased ? (
                                <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                  <CheckCircle size={10} />
                                  <span>{isMonthReleased ? 'Lançado' : 'Liberado'}</span>
                                </span>
                              ) : (
                                <span className="bg-amber-50 border border-amber-200 text-amber-700 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                  <Clock size={10} />
                                  <span>Em Andamento</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-right font-black text-indigo-700 text-sm">
                              R$ {item.earnedCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedBarberDetailModal(null)}
                  className="px-6 py-2.5 bg-primary text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-800 transition cursor-pointer"
                >
                  Fechar Extrato
                </button>
              </div>
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
  onDelete?: () => void;
  onAssign: () => void;
}

function PlanCard({ plan, isAdmin, onEdit, onDelete, onAssign }: PlanCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 flex flex-col h-full group hover:border-accent/30 transition-all shadow-sm relative overflow-hidden">
      <div className="flex items-start justify-between mb-6">
        <div className="w-14 h-14 bg-accent/5 border border-accent/10 rounded-2xl flex items-center justify-center text-accent shadow-sm">
          <Star size={28} />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button 
              type="button"
              onClick={onEdit} 
              title="Editar Plano"
              className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
            >
              <Edit2 size={18} />
            </button>
            {onDelete && (
              <button 
                type="button"
                onClick={onDelete} 
                title="Excluir Plano"
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
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
        {plan.services && plan.services.length > 0 ? (
          plan.services.map((ps, psIdx) => (
            <BenefitItem 
              key={`plan-benefit-${ps.serviceId || psIdx}-${psIdx}`} 
              icon={<Scissors size={14} />} 
              text={ps.isUnlimited ? `${ps.name} Ilimitados` : `${ps.limit} ${ps.name} por mês`} 
            />
          ))
        ) : (
          <>
            <BenefitItem icon={<Scissors size={14} />} text={plan.haircutsPerMonth >= 999 ? 'Cortes Ilimitados' : `${plan.haircutsPerMonth} Cortes por mês`} />
            {plan.beardsPerMonth > 0 && (
              <BenefitItem icon={<Zap size={14} />} text={plan.beardsPerMonth >= 999 ? 'Barbas Ilimitadas' : `${plan.beardsPerMonth} Barbas por mês`} />
            )}
          </>
        )}
        {plan.extraBenefits.map((benefit, i) => (
          <BenefitItem key={`extra-benefit-${i}`} icon={<CheckCircle2 size={14} />} text={benefit} />
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

// Helper to determine if subscription needs payment recovery (only show Recobrar if overdue / failed after due date)
const isSubOverdueOrFailed = (sub: Subscription) => {
  if ((sub.status as string) === 'canceled') return false;
  const isPastDue = isBefore(parseISO(sub.endDate), startOfDay(new Date()));
  const asaasStatus = (sub as any).asaasPaymentStatus;
  return (
    (sub.status as string) === 'overdue' ||
    sub.status === 'expired' ||
    (sub.status === 'pending' && isPastDue) ||
    asaasStatus === 'OVERDUE' ||
    asaasStatus === 'overdue' ||
    asaasStatus === 'FAILED' ||
    asaasStatus === 'failed'
  );
};

// Helper for Smart WhatsApp URL
function getSmartWhatsAppUrl(clientPhone: string | undefined, clientName: string, sub: Subscription, planName: string, planPrice: number) {
  if (!clientPhone) return null;
  const rawPhone = clientPhone.replace(/\D/g, '');
  if (!rawPhone || rawPhone.length < 10) return null;
  const formattedPhone = rawPhone.length >= 10 && !rawPhone.startsWith('55') ? `55${rawPhone}` : rawPhone;
  
  const endDateStr = sub.endDate ? format(parseISO(sub.endDate), 'dd/MM/yyyy') : '';
  const paymentLink = sub.paymentUrl || '';
  const isOverdue = (sub.status as string) === 'overdue' || sub.status === 'expired' || (sub.status === 'pending' && isBefore(parseISO(sub.endDate), startOfDay(new Date())));

  let message = '';
  if (isOverdue) {
    message = `Olá, ${clientName}! 👋 Tudo bem?\nPassando para avisar que sua assinatura do plano *${planName}* (R$ ${planPrice.toFixed(2)}) está pendente ou com renovação pendente.\nPara regularizar e continuar utilizando seus benefícios sem interrupções${paymentLink ? `, acesse o link: ${paymentLink}` : ''}.\nSe já realizou o pagamento ou deseja pagar no balcão, estamos à disposição! 💈`;
  } else if (sub.status === 'pending') {
    message = `Olá, ${clientName}! 👋 Tudo bem?\nSua assinatura do plano *${planName}* (R$ ${planPrice.toFixed(2)}) foi gerada e está aguardando confirmação.${paymentLink ? `\nVocê pode acessar sua fatura / Pix aqui: ${paymentLink}` : ''}\nQualquer dúvida é só nos chamar! 💈`;
  } else {
    message = `Olá, ${clientName}! 👋 Tudo bem?\nPassando para lembrar que sua assinatura do plano *${planName}* está ativa com vencimento em *${endDateStr}*.\nSe precisar agendar seus horários ou tirar qualquer dúvida, estamos à disposição! 💈`;
  }

  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

interface SubscriptionCardProps {
  key?: React.Key;
  sub: Subscription;
  plan?: SubscriptionPlan;
  clientPhone?: string;
  matchedClient?: UserProfile;
  isAdmin: boolean;
  onRegisterUsage: (id: string, type: string, serviceId?: string) => void;
  onRenew?: (id: string) => void;
  onRecobrar?: (id: string) => void;
  onSkipInvoice?: (sub: Subscription) => void;
  onViewInvoices?: (sub: Subscription) => void;
  onToggleAutoRenew?: (id: string, autoRenew: boolean) => void;
  onStatusChange?: (id: string, status: SubscriptionStatus) => void;
  onDelete?: (id: string) => void;
  onConfirmAsaasPayment?: (id: string) => void;
  onShowChargeModal?: (sub: Subscription) => void;
  onViewDetail?: (sub: Subscription) => void;
  isClient?: boolean;
}

function SubscriptionCard({ 
  sub, 
  plan, 
  clientPhone,
  matchedClient,
  isAdmin, 
  onRegisterUsage, 
  onRenew, 
  onRecobrar,
  onSkipInvoice,
  onViewInvoices,
  onToggleAutoRenew, 
  onStatusChange, 
  onDelete,
  onConfirmAsaasPayment,
  onShowChargeModal,
  onViewDetail,
  isClient 
}: SubscriptionCardProps) {
  if (!plan) return null;

  const statusColors: Record<SubscriptionStatus, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    expired: 'bg-red-50 text-red-600 border-red-100',
    canceled: 'bg-slate-50 text-slate-600 border-slate-100',
    paused: 'bg-amber-50 text-amber-600 border-amber-100',
    pending: 'bg-purple-50 text-purple-600 border-purple-100'
  };

  const showRecobrar = isAdmin && onRecobrar && isSubOverdueOrFailed(sub);
  const whatsappUrl = getSmartWhatsAppUrl(clientPhone, sub.cliente_name, sub, plan.name, plan.price);

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 space-y-8 shadow-sm group hover:border-accent/20 transition-all flex flex-col justify-between h-full">
      <div className="space-y-8">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center shadow-sm">
              <ShieldCheck className="text-accent" size={24} />
            </div>
            <div 
              className="cursor-pointer group/clientName select-none"
              onClick={() => onViewDetail?.(sub)}
              title="Clique para ver detalhes e atendimentos"
            >
              <h4 className="font-bold text-primary hover:text-accent transition-colors font-black flex items-center gap-1.5">
                {sub.cliente_name}
                <Eye size={12} className="text-slate-400 opacity-0 group-hover/clientName:opacity-100 transition-opacity" />
              </h4>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-[10px] font-bold text-muted uppercase tracking-widest font-black">{plan.name}</span>
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${statusColors[sub.status]} font-black`}>
                  {sub.status === 'pending' ? 'Aguardando Pagamento' : sub.status}
                </span>
                {sub.activationType === 'asaas' && (
                  <span className="text-[8px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded-lg tracking-widest">
                    Asaas
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1 font-black">Vence em</p>
            <p className="text-sm font-bold text-primary font-black">{format(parseISO(sub.endDate), 'dd/MM/yyyy')}</p>
          </div>
        </div>

        {sub.status === 'pending' && sub.activationType === 'asaas' && (
          <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-2xl flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2 text-purple-900 font-bold text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping shrink-0" />
                <span>Aguardando Pix de R$ {plan.price.toFixed(2)} (Asaas)</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {onShowChargeModal && (sub.paymentUrl || sub.pixCopiaECola || sub.pixQrCodeUrl) && (
                <button
                  type="button"
                  onClick={() => onShowChargeModal(sub)}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <QrCode size={13} />
                  <span>Ver Fatura / Pix QR Code</span>
                </button>
              )}

              {showRecobrar && (
                <button
                  type="button"
                  onClick={() => onRecobrar?.(sub.id)}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  title="Recobrar assinatura (gerar nova cobrança de cartão no Asaas)"
                >
                  <CreditCard size={13} />
                  <span>Recobrar</span>
                </button>
              )}

              {isAdmin && onConfirmAsaasPayment && (
                <button
                  type="button"
                  onClick={() => onConfirmAsaasPayment(sub.id)}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Confirmar Pix</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plan.services && plan.services.length > 0 ? (
            plan.services.map((ps, psIdx) => {
              const used = (sub.serviceUsages && sub.serviceUsages[ps.serviceId]) || 0;
              const typeLabel = ps.name.toLowerCase().includes('corte') || ps.name.toLowerCase().includes('cabelo') || ps.name.toLowerCase().includes('hair') ? 'haircut' : (ps.name.toLowerCase().includes('barba') || ps.name.toLowerCase().includes('beard') ? 'beard' : 'other');
              return (
                <UsageIndicator 
                  key={`sub-usage-${ps.serviceId || psIdx}-${psIdx}`} 
                  label={ps.name} 
                  used={used} 
                  total={ps.isUnlimited ? 999 : ps.limit} 
                  onAdd={isAdmin && sub.status === 'active' ? () => onRegisterUsage(sub.id, typeLabel, ps.serviceId) : undefined}
                />
              );
            })
          ) : (
            <>
              <UsageIndicator 
                label="Cortes" 
                used={sub.haircutsUsed} 
                total={plan.haircutsPerMonth} 
                onAdd={isAdmin && sub.status === 'active' ? () => onRegisterUsage(sub.id, 'haircut') : undefined}
              />
              {plan.beardsPerMonth > 0 && (
                <UsageIndicator 
                  label="Barbas" 
                  used={sub.beardsUsed} 
                  total={plan.beardsPerMonth} 
                  onAdd={isAdmin && sub.status === 'active' ? () => onRegisterUsage(sub.id, 'beard') : undefined}
                />
              )}
            </>
          )}
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
          <button
            type="button"
            onClick={() => onViewDetail?.(sub)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
            title="Ver histórico de uso, atendimentos e gerenciar datas"
          >
            <Eye size={11} />
            <span>Detalhes</span>
          </button>

          {/* Botão de Histórico de Faturas */}
          {onViewInvoices && (
            <button
              type="button"
              onClick={() => onViewInvoices(sub)}
              className="flex items-center gap-1 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Ver histórico de pagamentos e faturas"
            >
              <Receipt size={11} />
              <span>Faturas</span>
            </button>
          )}

          {/* Botão WhatsApp com mensagem pré-formatada */}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Chamar cliente no WhatsApp sobre a assinatura"
            >
              <MessageCircle size={11} />
              <span>WhatsApp</span>
            </a>
          )}

          {/* Botão Pular Fatura / Baixa Manual no Caixa */}
          {isAdmin && onSkipInvoice && (
            <button
              type="button"
              onClick={() => onSkipInvoice(sub)}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-600 hover:text-white transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Pular fatura e lançar pagamento recebido no caixa"
            >
              <SkipForward size={11} />
              <span>Pular Fatura</span>
            </button>
          )}

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

          {showRecobrar && (
            <button
              type="button"
              onClick={() => onRecobrar?.(sub.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white transition rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer font-black"
              title="Recobrar assinatura (enviar nova cobrança no cartão/Asaas)"
            >
              <CreditCard size={11} />
              <span>Recobrar</span>
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

interface SubscriptionTableRowProps {
  key?: string;
  sub: Subscription;
  plan?: SubscriptionPlan;
  clientPhone?: string;
  matchedClient?: UserProfile;
  isAdmin: boolean;
  onRegisterUsage: (id: string, type: string, serviceId?: string) => void;
  onRenew?: (id: string) => void;
  onRecobrar?: (id: string) => void;
  onSkipInvoice?: (sub: Subscription) => void;
  onViewInvoices?: (sub: Subscription) => void;
  onToggleAutoRenew?: (id: string, autoRenew: boolean) => void;
  onStatusChange?: (id: string, status: SubscriptionStatus) => void;
  onDelete?: (id: string) => void;
  onConfirmAsaasPayment?: (id: string) => void;
  onShowChargeModal?: (sub: Subscription) => void;
  onViewDetail?: (sub: Subscription) => void;
}

function SubscriptionTableRow({
  sub,
  plan,
  clientPhone,
  matchedClient,
  isAdmin,
  onRegisterUsage,
  onRenew,
  onRecobrar,
  onSkipInvoice,
  onViewInvoices,
  onToggleAutoRenew,
  onStatusChange,
  onDelete,
  onConfirmAsaasPayment,
  onShowChargeModal,
  onViewDetail
}: SubscriptionTableRowProps) {
  if (!plan) return null;

  const statusColors: Record<SubscriptionStatus, { bg: string; text: string; border: string; label: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Ativa' },
    expired: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Expirada' },
    canceled: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', label: 'Cancelada' },
    paused: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Pausada' },
    pending: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Aguardando Pgto' }
  };

  const currentStatus = statusColors[sub.status] || statusColors.active;

  // Calculate days remaining or overdue
  const endDateObj = parseISO(sub.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = endDateObj.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let daysBadgeText = '';
  let daysBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';

  if (sub.status === 'pending') {
    if (diffDays > 0) {
      daysBadgeText = `Aguardando Pgto (${diffDays}d restantes)`;
    } else if (diffDays === 0) {
      daysBadgeText = 'Aguardando Pgto (Vence Hoje)';
    } else {
      daysBadgeText = `Aguardando Pgto (Atrasado ${Math.abs(diffDays)}d)`;
    }
    daysBadgeClass = 'bg-purple-50 text-purple-700 border-purple-200 font-bold';
  } else if (diffDays > 0) {
    daysBadgeText = `Vence em ${diffDays}d`;
    daysBadgeClass = diffDays <= 5 ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (diffDays === 0) {
    daysBadgeText = 'Vence Hoje!';
    daysBadgeClass = 'bg-red-100 text-red-800 border-red-300 font-black animate-pulse';
  } else {
    daysBadgeText = `Atrasado ${Math.abs(diffDays)}d`;
    daysBadgeClass = 'bg-red-50 text-red-700 border-red-200 font-bold';
  }

  // Format WhatsApp Link with smart text
  const whatsappUrl = getSmartWhatsAppUrl(clientPhone, sub.cliente_name, sub, plan.name, plan.price);
  const showRecobrar = isAdmin && onRecobrar && isSubOverdueOrFailed(sub);

  return (
    <tr className="hover:bg-slate-50/70 transition border-b border-slate-100">
      {/* Assinante / Cliente */}
      <td className="p-4 pl-6">
        <div 
          className="flex items-center gap-3 cursor-pointer group/client select-none"
          onClick={() => onViewDetail?.(sub)}
          title="Clique para ver detalhes e atendimentos"
        >
          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm group-hover/client:border-accent transition-colors">
            {(matchedClient as any)?.foto || (matchedClient as any)?.photoURL ? (
              <img src={(matchedClient as any)?.foto || (matchedClient as any)?.photoURL} alt={sub.cliente_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <Users size={16} className="text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <span className="font-extrabold text-slate-800 text-xs block truncate group-hover/client:text-accent transition-colors flex items-center gap-1">
              {sub.cliente_name}
              <Eye size={11} className="text-slate-400 opacity-0 group-hover/client:opacity-100 transition-opacity" />
            </span>
            {clientPhone ? (
              <span className="text-[10px] text-slate-400 font-medium block truncate">{clientPhone}</span>
            ) : (
              <span className="text-[10px] text-slate-350 italic block">Sem telefone</span>
            )}
          </div>
        </div>
      </td>

      {/* Plano & Valor */}
      <td className="p-4">
        <div>
          <span className="font-black text-slate-800 text-xs block">{plan.name}</span>
          <span className="text-[11px] font-bold text-emerald-600 block">R$ {plan.price.toFixed(2)}/mês</span>
        </div>
      </td>

      {/* Status & Canal */}
      <td className="p-4">
        <div className="flex flex-col items-start gap-1">
          <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}`}>
            {currentStatus.label}
          </span>
          {sub.activationType === 'asaas' && (
            <span className="text-[8px] font-extrabold uppercase bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded tracking-widest">
              Asaas
            </span>
          )}
          {sub.activationType === 'asaas' && (sub.paymentUrl || sub.pixCopiaECola || sub.pixQrCodeUrl) && (
            <button
              type="button"
              onClick={() => onShowChargeModal?.(sub)}
              className="mt-1 text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-all"
              title="Ver QR Code Pix e Link de Pagamento Asaas"
            >
              <QrCode size={10} />
              <span>Ver Fatura / Pix</span>
            </button>
          )}
          {showRecobrar && (
            <button
              type="button"
              onClick={() => onRecobrar?.(sub.id)}
              className="mt-1 text-[9px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-600 hover:text-white px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-all"
              title="Recobrar cobrança de cartão de crédito no Asaas"
            >
              <CreditCard size={10} />
              <span>Recobrar</span>
            </button>
          )}
          {sub.status === 'pending' && sub.activationType === 'asaas' && isAdmin && onConfirmAsaasPayment && (
            <button
              type="button"
              onClick={() => onConfirmAsaasPayment(sub.id)}
              className="mt-1 text-[9px] font-bold text-purple-700 hover:underline flex items-center gap-1 cursor-pointer"
              title="Simular Webhook: Confirmar Pix"
            >
              <RefreshCw size={10} className="animate-spin" />
              <span>Confirmar Pix</span>
            </button>
          )}
        </div>
      </td>

      {/* Vencimento & Renovação */}
      <td className="p-4">
        <div>
          <span className="font-extrabold text-slate-700 text-xs block">{format(parseISO(sub.endDate), 'dd/MM/yyyy')}</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${daysBadgeClass}`}>
              {daysBadgeText}
            </span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${sub.autoRenew ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              {sub.autoRenew ? 'Auto' : 'Manual'}
            </span>
          </div>
        </div>
      </td>

      {/* Uso no Mês */}
      <td className="p-4">
        <div className="space-y-1 max-w-[160px]">
          {plan.services && plan.services.length > 0 ? (
            plan.services.map((ps, psIdx) => {
              const used = (sub.serviceUsages && sub.serviceUsages[ps.serviceId]) || 0;
              const typeLabel = ps.name.toLowerCase().includes('corte') || ps.name.toLowerCase().includes('cabelo') || ps.name.toLowerCase().includes('hair') ? 'haircut' : (ps.name.toLowerCase().includes('barba') || ps.name.toLowerCase().includes('beard') ? 'beard' : 'other');
              return (
                <div key={`sub-cell-${ps.serviceId || psIdx}-${psIdx}`} className="flex items-center justify-between text-[10px] font-bold bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                  <span className="truncate text-slate-600 max-w-[80px]">{ps.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-800 font-black">{used}/{ps.isUnlimited ? '∞' : ps.limit}</span>
                    {isAdmin && sub.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => onRegisterUsage(sub.id, typeLabel, ps.serviceId)}
                        className="p-0.5 text-indigo-600 hover:bg-indigo-100 rounded cursor-pointer transition"
                        title={`Registrar ${ps.name}`}
                      >
                        <Plus size={10} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex items-center gap-2 text-[10px] font-bold">
              <span className="bg-slate-50 border px-1.5 py-0.5 rounded">Cortes: {sub.haircutsUsed}/{plan.haircutsPerMonth >= 999 ? '∞' : plan.haircutsPerMonth}</span>
              {plan.beardsPerMonth > 0 && (
                <span className="bg-slate-50 border px-1.5 py-0.5 rounded">Barbas: {sub.beardsUsed}/{plan.beardsPerMonth >= 999 ? '∞' : plan.beardsPerMonth}</span>
              )}
            </div>
          )}
        </div>
      </td>

      {/* Ações Rápidas */}
      <td className="p-4 pr-6 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Ver Detalhes */}
          <button
            type="button"
            onClick={() => onViewDetail?.(sub)}
            className="p-2 bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Ver histórico de uso, atendimentos e gerenciar datas"
          >
            <Eye size={14} />
          </button>

          {/* Histórico de Faturas Pagas */}
          {onViewInvoices && (
            <button
              type="button"
              onClick={() => onViewInvoices(sub)}
              className="p-2 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              title="Histórico de Faturas e Pagamentos"
            >
              <Receipt size={14} />
            </button>
          )}

          {/* WhatsApp Link com mensagem automática */}
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xl transition cursor-pointer"
              title="Mandar mensagem WhatsApp de cobrança / lembrete"
            >
              <MessageCircle size={14} />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="p-2 bg-slate-50 border border-slate-100 text-slate-300 rounded-xl cursor-not-allowed"
              title="Sem telefone cadastrado"
            >
              <MessageCircle size={14} />
            </button>
          )}

          {/* Pular Fatura / Baixa Manual no Caixa */}
          {isAdmin && onSkipInvoice && (
            <button
              type="button"
              onClick={() => onSkipInvoice(sub)}
              className="p-2 bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-600 hover:text-white rounded-xl transition cursor-pointer"
              title="Pular fatura e registrar recebimento no caixa"
            >
              <SkipForward size={14} />
            </button>
          )}

          {/* Renovar */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onRenew?.(sub.id)}
              className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-xl transition cursor-pointer"
              title="Renovar por +1 mês"
            >
              <RefreshCw size={14} />
            </button>
          )}

          {/* Recobrar (somente após vencimento / falha de cobrança) */}
          {showRecobrar && (
            <button
              type="button"
              onClick={() => onRecobrar?.(sub.id)}
              className="p-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white rounded-xl transition cursor-pointer"
              title="Recobrar (Enviar nova cobrança no cartão Asaas)"
            >
              <CreditCard size={14} />
            </button>
          )}

          {/* Toggle Auto Renew */}
          <button
            type="button"
            onClick={() => onToggleAutoRenew?.(sub.id, !sub.autoRenew)}
            className={`p-2 border rounded-xl transition cursor-pointer ${
              sub.autoRenew
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
            title={sub.autoRenew ? "Desativar renovação automática" : "Ativar renovação automática"}
          >
            <Zap size={14} />
          </button>

          {/* Pausar / Ativar */}
          {isAdmin && sub.status === 'active' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'paused')}
              className="px-2 py-1 bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer"
              title="Pausar benefícios"
            >
              Pausar
            </button>
          )}
          {isAdmin && sub.status === 'paused' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'active')}
              className="px-2 py-1 bg-emerald-600 border border-emerald-700 text-white hover:bg-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer"
              title="Ativar benefícios"
            >
              Ativar
            </button>
          )}

          {/* Cancelar */}
          {sub.status !== 'canceled' && (
            <button
              type="button"
              onClick={() => onStatusChange?.(sub.id, 'canceled')}
              className="p-2 bg-red-50 border border-red-200 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition cursor-pointer"
              title="Cancelar plano"
            >
              <XCircle size={14} />
            </button>
          )}

          {/* Excluir */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onDelete?.(sub.id)}
              className="p-2 bg-slate-50 border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-xl transition cursor-pointer"
              title="Excluir do banco"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
