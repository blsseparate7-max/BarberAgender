import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Users, 
  Settings, 
  ChevronRight, 
  Star, 
  Scissors, 
  Zap, 
  Calendar,
  MoreVertical,
  Edit2,
  Trash2,
  Loader2,
  ShieldCheck,
  TrendingUp,
  History,
  UserPlus,
  X,
  RefreshCw,
  Search,
  Filter,
  ShoppingBag,
  CheckCircle,
  Eye,
  Undo2,
  BookOpen,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { subscriptionService } from '../services/subscriptionService';
import { userService } from '../services/userService';
import { SubscriptionPlan, Subscription, SubscriptionStatus, UserProfile, Service } from '../types';
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
  where
} from 'firebase/firestore';
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

interface PackageConfig {
  id: string;
  name: string;
  cutsCount: number;
  originalPrice: number;
  promotionalPrice: number;
  expiresDays: number;
  active: boolean;
  serviceId?: string;
  serviceName?: string;
}

interface PackageUsage {
  usedAt: string;
  notes?: string;
  index: number;
}

interface PackageSale {
  id: string;
  clientId: string;
  clientName: string;
  packageId: string;
  packageName: string;
  totalCuts: number;
  remainingCuts: number;
  pricePaid: number;
  soldAt: string;
  usages?: PackageUsage[];
  serviceId?: string;
  serviceName?: string;
}

interface AssinaturasProps {
  defaultTab?: 'assinaturas' | 'pacotes' | 'assinantes' | 'planos' | 'consumo';
}

export function Assinaturas({ defaultTab }: AssinaturasProps) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  // Tabs structure:
  // - 'assinaturas_planos' (Cadastro de Planos e Vendas)
  // - 'assinantes_gestao' (Gestores e Ativos)
  // - 'pacotes_modelos' (Cadastro de Pacotes)
  // - 'pacotes_consumo' (Vendas de Pacotes e cortes)
  // - 'meu_plano' (Para Clientes logados - Assinatura)
  // - 'meus_pacotes' (Para Clientes logados - Pacotes)
  const getInitialTabState = () => {
    if (profile?.tipo === 'cliente') {
      if (defaultTab === 'pacotes') {
        return 'meus_pacotes';
      }
      return 'meu_plano';
    }
    if (defaultTab === 'pacotes') {
      return 'pacotes_modelos';
    }
    if (defaultTab === 'assinantes') {
      return 'assinantes_gestao';
    }
    if (defaultTab === 'planos') {
      return 'assinaturas_planos';
    }
    if (defaultTab === 'consumo') {
      return 'pacotes_consumo';
    }
    return 'assinaturas_planos';
  };

  const [activeTab, setActiveTab] = useState<
    'assinaturas_planos' | 'assinantes_gestao' | 'pacotes_modelos' | 'pacotes_consumo' | 'meu_plano' | 'meus_pacotes'
  >(getInitialTabState());

  useEffect(() => {
    if (profile?.tipo === 'cliente') {
      if (defaultTab === 'pacotes') {
        setActiveTab('meus_pacotes');
      } else {
        setActiveTab('meu_plano');
      }
    } else if (defaultTab) {
      if (defaultTab === 'pacotes') {
        setActiveTab('pacotes_modelos');
      } else if (defaultTab === 'assinantes') {
        setActiveTab('assinantes_gestao');
      } else if (defaultTab === 'planos') {
        setActiveTab('assinaturas_planos');
      } else if (defaultTab === 'consumo') {
        setActiveTab('pacotes_consumo');
      }
    }
  }, [defaultTab, profile?.tipo]);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Package states
  const [packages, setPackages] = useState<PackageConfig[]>([]);
  const [sales, setSales] = useState<PackageSale[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  // Search/Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [salesFilter, setSalesFilter] = useState<'all' | 'active' | 'consumed'>('all');

  // Modals for Subscriptions
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  // Modals for Packages
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageConfig | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPkgId, setSelectedPkgId] = useState('');
  const [salePrice, setSalePrice] = useState(200);

  // Package usages panel
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Confirmation Modals
  const [deletePackageId, setDeletePackageId] = useState<string | null>(null);
  const [deleteSaleId, setDeleteSaleId] = useState<string | null>(null);
  const [deductCutSale, setDeductCutSale] = useState<PackageSale | null>(null);
  const [revertCutSale, setRevertCutSale] = useState<{ sale: PackageSale; usageIndex: number } | null>(null);

  // Package Config form states
  const [pkgName, setPkgName] = useState('');
  const [pkgCuts, setPkgCuts] = useState(5);
  const [pkgPricePerService, setPkgPricePerService] = useState<number | ''>('');
  const [pkgOrigPrice, setPkgOrigPrice] = useState(250);
  const [pkgPromoPrice, setPkgPromoPrice] = useState(200);
  const [pkgExpires, setPkgExpires] = useState(90);
  const [pkgNoExpiration, setPkgNoExpiration] = useState(false);
  const [pkgActive, setPkgActive] = useState(true);
  const [pkgServiceId, setPkgServiceId] = useState('');

  useEffect(() => {
    if (profile?.tipo === 'cliente' && activeTab !== 'meu_plano' && activeTab !== 'meus_pacotes') {
      setActiveTab('meu_plano');
    }
  }, [profile?.tipo]);

  const loadData = async () => {
    setLoading(true);
    try {
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
    let unsubPkg: (() => void) | undefined;
    let unsubSales: (() => void) | undefined;
    let unsubServ: (() => void) | undefined;

    const setupListeners = () => {
      // Fetch package configs, sales & services via onSnapshot (for instant updates)
      const pathConfigs = 'pacotes_config';
      const qPackages = query(collection(db, pathConfigs), orderBy('cutsCount', 'asc'));
      unsubPkg = onSnapshot(qPackages, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as PackageConfig));
        setPackages(docs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, pathConfigs);
      });

      const pathSales = 'pacotes_vendas';
      let qSales;
      if (profile?.tipo === 'cliente') {
        qSales = query(collection(db, pathSales), where('clientId', '==', user?.uid));
      } else {
        qSales = query(collection(db, pathSales), orderBy('soldAt', 'desc'));
      }

      unsubSales = onSnapshot(qSales, (snap) => {
        let docs = snap.docs.map(d => {
          const data = d.data();
          return { 
            id: d.id, 
            ...data,
            usages: data.usages ? [...data.usages] : []
          } as PackageSale;
        });
        
        if (profile?.tipo === 'cliente') {
          docs = docs.sort((a, b) => b.soldAt.localeCompare(a.soldAt));
        }
        setSales(docs);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, pathSales);
      });

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
    };

    loadData();
    setupListeners();

    return () => {
      if (unsubPkg) unsubPkg();
      if (unsubSales) unsubSales();
      if (unsubServ) unsubServ();
    };
  }, [profile?.uid, profile?.tipo, activeTab, user?.uid, canManage]);

  // Sync edit package config forms
  useEffect(() => {
    if (editingPackage) {
      setPkgName(editingPackage.name);
      setPkgCuts(editingPackage.cutsCount);
      setPkgPricePerService(editingPackage.pricePerService !== undefined && editingPackage.pricePerService !== null ? editingPackage.pricePerService : '');
      setPkgOrigPrice(editingPackage.originalPrice);
      setPkgPromoPrice(editingPackage.promotionalPrice);
      setPkgExpires(editingPackage.expiresDays || 0);
      setPkgNoExpiration(editingPackage.noExpiration || false);
      setPkgActive(editingPackage.active);
      setPkgServiceId(editingPackage.serviceId || '');
    } else {
      setPkgName('');
      setPkgCuts(5);
      setPkgPricePerService('');
      setPkgOrigPrice(250);
      setPkgPromoPrice(200);
      setPkgExpires(90);
      setPkgNoExpiration(false);
      setPkgActive(true);
      setPkgServiceId('');
    }
  }, [editingPackage]);

  // Recalculating default pricing when service changes, cuts count changes, or price per service changes
  useEffect(() => {
    if (pkgServiceId && services.length > 0) {
      const selectedService = services.find(s => s.id === pkgServiceId);
      if (selectedService) {
        const servicePrice = selectedService.preco ?? selectedService.price ?? 0;
        setPkgOrigPrice(servicePrice * pkgCuts);
        
        // Auto-calculate the promo price based on price per service if provided!
        if (pkgPricePerService !== '' && Number(pkgPricePerService) > 0) {
          setPkgPromoPrice(Number(pkgPricePerService) * pkgCuts);
        }
      }
    }
  }, [pkgServiceId, pkgCuts, pkgPricePerService, services]);

  // Handle plan assignments (assign subscription)
  const { execute: handleAssignSubscription, isLoading: isAssigning } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;
    
    const formData = new FormData(e.currentTarget);
    const cliente_id = formData.get('clientId') as string;
    const client = clients.find(c => c.uid === cliente_id);
    
    if (!client) return;

    try {
      await subscriptionService.createSubscription({
        cliente_id,
        cliente_name: client.nome,
        plano_id: selectedPlan.id,
        autoRenew: formData.get('autoRenew') === 'on'
      });
      setShowAssignModal(false);
      setSelectedPlan(null);
      loadData();
      toast.success(`Assinatura ativada com sucesso para ${client.nome}!`);
    } catch (error) {
      console.error("Erro ao vincular assinatura:", error);
      toast.error("Ocorreu um erro ao vincular a assinatura.");
    }
  });

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

  // Action: Save package configuration template
  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgName.trim()) {
      toast.error('Preencha o nome do pacote.');
      return;
    }
    if (pkgCuts <= 0 || pkgOrigPrice <= 0 || pkgPromoPrice <= 0 || (!pkgNoExpiration && pkgExpires <= 0)) {
      toast.error('Insira valores maiores que zero.');
      return;
    }

    const selectedService = services.find(s => s.id === pkgServiceId);

    const payload = {
      name: pkgName.trim(),
      cutsCount: Number(pkgCuts),
      pricePerService: pkgPricePerService !== '' ? Number(pkgPricePerService) : null,
      originalPrice: Number(pkgOrigPrice),
      promotionalPrice: Number(pkgPromoPrice),
      expiresDays: pkgNoExpiration ? 0 : Number(pkgExpires),
      noExpiration: pkgNoExpiration,
      active: pkgActive,
      serviceId: pkgServiceId || '',
      serviceName: selectedService ? (selectedService.nome || selectedService.name || '') : ''
    };

    const path = 'pacotes_config';
    try {
      if (editingPackage) {
        await updateDoc(doc(db, path, editingPackage.id), payload);
        toast.success(`Pacote "${pkgName}" atualizado com sucesso!`);
      } else {
        await addDoc(collection(db, path), payload);
        toast.success(`Pacote "${pkgName}" criado com sucesso!`);
      }
      setShowPackageModal(false);
      setEditingPackage(null);
    } catch (err) {
      handleFirestoreError(err, editingPackage ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  // Toggle active configs
  const handleTogglePackageActive = async (pkg: PackageConfig) => {
    if (!canManage) return;
    const path = 'pacotes_config';
    try {
      await updateDoc(doc(db, path, pkg.id), { active: !pkg.active });
      toast.success(`Modelo de pacote marcado como ${!pkg.active ? 'Ativo' : 'Inativo'}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Safe configurations deletion
  const handleConfirmDeletePackage = async () => {
    if (!deletePackageId) return;
    const path = 'pacotes_config';
    try {
      await deleteDoc(doc(db, path, deletePackageId));
      toast.success('Modelo de pacote excluído com sucesso.');
      setDeletePackageId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Handle active client packages registration (Vender Pacote)
  const handleSellPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId || !selectedPkgId) {
      toast.error('Preencha o cliente e o modelo do pacote!');
      return;
    }
    const client = clients.find(c => c.uid === selectedClientId);
    const pkg = packages.find(p => p.id === selectedPkgId);
    if (!client || !pkg) return;

    const path = 'pacotes_vendas';
    try {
      await addDoc(collection(db, path), {
        clientId: client.uid,
        clientName: client.nome,
        packageId: pkg.id,
        packageName: pkg.name,
        totalCuts: pkg.cutsCount,
        remainingCuts: pkg.cutsCount,
        pricePaid: Number(salePrice),
        pricePerService: pkg.pricePerService !== undefined && pkg.pricePerService !== null ? pkg.pricePerService : null,
        noExpiration: pkg.noExpiration || false,
        expiresDays: pkg.expiresDays || 0,
        soldAt: new Date().toISOString(),
        usages: [],
        serviceId: pkg.serviceId || '',
        serviceName: pkg.serviceName || ''
      });
      toast.success(`Plano fidelidade associado e ativado para ${client.nome}!`);
      setShowSaleModal(false);
      setSelectedClientId('');
      setSelectedPkgId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Live consumption check-ins for package slices (Usar 1 Corte)
  const handleConfirmDeductCut = async () => {
    if (!deductCutSale) return;
    if (deductCutSale.remainingCuts <= 0) {
      toast.error('Este pacote já foi completamente consumido.');
      return;
    }

    const path = 'pacotes_vendas';
    const usageIndex = (deductCutSale.usages?.length || 0) + 1;
    const newUsage: PackageUsage = {
      usedAt: new Date().toISOString(),
      notes: `Consumo do corte Nº ${usageIndex}`,
      index: usageIndex
    };

    const updatedUsages = deductCutSale.usages ? [...deductCutSale.usages, newUsage] : [newUsage];

    try {
      await updateDoc(doc(db, path, deductCutSale.id), {
        remainingCuts: deductCutSale.remainingCuts - 1,
        usages: updatedUsages
      });
      toast.success(`Faturamento de 1 corte registrado para ${deductCutSale.clientName}!`);
      setDeductCutSale(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Revert/refund a package slice consumption check-in
  const handleConfirmRevertCut = async () => {
    if (!revertCutSale) return;
    const { sale, usageIndex } = revertCutSale;
    const path = 'pacotes_vendas';

    const updatedUsages = (sale.usages || []).filter(u => u.index !== usageIndex);

    try {
      await updateDoc(doc(db, path, sale.id), {
        remainingCuts: sale.remainingCuts + 1,
        usages: updatedUsages
      });
      toast.success('Uso de corte desfeito!');
      setRevertCutSale(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  // Safe package sale deletion (Estorno)
  const handleConfirmDeleteSale = async () => {
    if (!deleteSaleId) return;
    const path = 'pacotes_vendas';
    try {
      await deleteDoc(doc(db, path, deleteSaleId));
      toast.success('Venda de pacote estornada com sucesso.');
      setDeleteSaleId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Filter lists in memory
  const filteredPackages = packages.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = !showActiveOnly || p.active;
    return matchesSearch && matchesActive;
  });

  const filteredSales = sales.filter(s => {
    const matchesSearch = s.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.packageName.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (salesFilter === 'active') {
      return matchesSearch && s.remainingCuts > 0;
    }
    if (salesFilter === 'consumed') {
      return matchesSearch && s.remainingCuts === 0;
    }
    return matchesSearch;
  });

  // Aggregated package stats
  const totalPurchasedPriceObj = sales.reduce((sum, s) => sum + s.pricePaid, 0);
  const activeRemainingCutsObj = sales.reduce((sum, s) => sum + s.remainingCuts, 0);
  const totalCutsSoldObj = sales.reduce((sum, s) => sum + s.totalCuts, 0);
  const totalCutsConsumedObj = totalCutsSoldObj - activeRemainingCutsObj;

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
          <h1 className="text-3xl font-black tracking-tight text-primary mb-1">Assinaturas, Planos & Pacotes</h1>
          <p className="text-muted text-sm font-medium">Recorrência, faturamentos antecipados e controle de consumo dos clientes.</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            {['assinaturas_planos'].includes(activeTab) && (
              <button 
                onClick={() => { setEditingPlan(null); setShowPlanModal(true); }}
                className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition shadow-md active:scale-95"
              >
                <Plus size={15} />
                <span>Novo Plano</span>
              </button>
            )}
            {['pacotes_modelos'].includes(activeTab) && (
              <button 
                onClick={() => { setEditingPackage(null); setShowPackageModal(true); }}
                className="flex items-center gap-2 px-5 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition shadow-md active:scale-95"
              >
                <Plus size={15} />
                <span>Criar Pacote</span>
              </button>
            )}
            {['pacotes_consumo'].includes(activeTab) && (
              <button 
                onClick={() => {
                  setSalePrice(200);
                  setShowSaleModal(true);
                }}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/10 active:scale-95"
              >
                <ShoppingBag size={15} />
                <span>Vender Pacote</span>
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
          <StatCard title="Pacotes Vendidos" value={`R$ ${totalPurchasedPriceObj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={<ShoppingBag className="text-amber-500" />} />
          <StatCard title="Cortes em Haver" value={`${activeRemainingCutsObj} sessões`} icon={<Clock className="text-rose-600" />} />
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
              active={activeTab === 'pacotes_modelos'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('pacotes_modelos');
              }} 
              label="Modelos de Pacotes" 
              icon={<Award size={14} />} 
            />
            <TabButton 
              active={activeTab === 'pacotes_consumo'} 
              onClick={() => {
                setSearchQuery('');
                setActiveTab('pacotes_consumo');
              }} 
              label="Consumo de Pacotes" 
              icon={<Scissors size={14} />} 
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
            <TabButton 
              active={activeTab === 'meus_pacotes'} 
              onClick={() => setActiveTab('meus_pacotes')} 
              label="Meus Pacotes" 
              icon={<ShoppingBag size={14} />} 
            />
          </>
        )}
      </div>

      {/* Advanced Filter Box for Active Tabs */}
      {['pacotes_modelos', 'pacotes_consumo'].includes(activeTab) && (
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 p-4 border border-slate-100 rounded-3xl">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder={activeTab === 'pacotes_modelos' ? "Filtrar pacote pelo nome..." : "Buscar por cliente ou pacote..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-slate-50 focus:border-slate-400 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium text-primary shadow-sm transition"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {activeTab === 'pacotes_modelos' ? (
              <button
                type="button"
                onClick={() => setShowActiveOnly(!showActiveOnly)}
                className={`flex items-center gap-2 border px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-wider transition ${
                  showActiveOnly 
                    ? 'bg-primary border-primary text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Filter size={12} />
                <span>Ativos apenas</span>
              </button>
            ) : (
              <div className="flex bg-white border border-slate-200 rounded-2xl p-1 gap-1">
                {(['all', 'active', 'consumed'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSalesFilter(option)}
                    className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                      salesFilter === option 
                        ? 'bg-primary text-white' 
                        : 'text-slate-500 hover:text-primary'
                    }`}
                  >
                    {option === 'all' && 'Todos'}
                    {option === 'active' && 'Em Aberto'}
                    {option === 'consumed' && 'Consumido'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE TUB CONTENTS */}

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
            <div className="col-span-full py-12 text-center text-slate-405 font-bold italic">Nenhum plano configurado.</div>
          )}
        </div>
      )}

      {/* TAB 2: Assinantes Ativos */}
      {activeTab === 'assinantes_gestao' && (
        <div className="space-y-6 animate-fade-in">
          {subscriptions.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CreditCard size={32} className="text-slate-350" />
              </div>
              <h3 className="text-lg font-bold text-primary mb-1">Nenhum assinante cadastrado</h3>
              <p className="text-muted text-sm max-w-xs mx-auto font-medium">Ainda não há clientes pagando recorrência no Clube de Assinaturas.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {subscriptions.map(sub => (
                <SubscriptionCard 
                  key={sub.id} 
                  sub={sub} 
                  plan={plans.find(p => p.id === sub.plano_id)}
                  isAdmin={canManage}
                  onRegisterUsage={handleRegisterUsage}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Modelos de Pacotes */}
      {activeTab === 'pacotes_modelos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
          {filteredPackages.length === 0 ? (
            <div className="col-span-full bg-white border-2 border-dashed border-slate-200 rounded-[2rem] py-16 text-center shadow-sm flex flex-col items-center justify-center">
              <Award size={28} className="text-slate-400 mb-2" />
              <h4 className="text-sm font-black uppercase tracking-tight">Nenhum pacote catalogado</h4>
              <p className="text-muted text-xs max-w-xs mx-auto mt-1 font-bold">
                Crie um modelo para vender sessões pré-pagas com desconto acumulado.
              </p>
            </div>
          ) : (
            filteredPackages.map(pkg => {
              const discountPercent = Math.round((1 - (pkg.promotionalPrice / pkg.originalPrice)) * 100);
              return (
                <motion.div 
                  layout
                  key={pkg.id} 
                  className={`bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all relative ${
                    pkg.active ? 'border-slate-200' : 'border-red-100 opacity-70 bg-red-50/5'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <span className={`text-[8px] font-black px-2.5 py-1 rounded-full uppercase border ${
                        pkg.active 
                          ? 'bg-amber-50 border-amber-250 text-amber-700' 
                          : 'bg-slate-150 border-slate-200 text-slate-500'
                      }`}>
                        Economia de {discountPercent}%
                      </span>
                      {canManage && (
                        <div className="flex items-center gap-1">
                          <button 
                            type="button"
                            onClick={() => {
                              setEditingPackage(pkg);
                              setShowPackageModal(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-50"
                            title="Editar pacote"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleTogglePackageActive(pkg)}
                            className={`p-1.5 rounded-lg ${pkg.active ? 'text-slate-400 hover:text-amber-500' : 'text-slate-400 hover:text-emerald-500'}`}
                            title={pkg.active ? "Inativar" : "Ativar"}
                          >
                            {pkg.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeletePackageId(pkg.id)}
                            className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    <h3 className="text-lg font-extrabold text-primary mt-4 tracking-tight leading-tight">{pkg.name}</h3>
                    {pkg.serviceName && (
                      <p className="text-[10px] font-black uppercase text-accent tracking-wider mt-1.5 bg-accent/5 px-2.5 py-0.5 rounded-md inline-block">
                        🛠️ {pkg.serviceName}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-3 text-slate-500 text-xs font-semibold">
                      <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                      <span>{pkg.cutsCount} utilizações inclusas</span>
                    </div>
                  </div>

                  <div className="pt-5 border-t border-slate-100 mt-6 flex items-end justify-between">
                    <div>
                      <p className="text-[9px] text-slate-400 line-through font-bold leading-none mb-1">R$ {pkg.originalPrice.toFixed(2)}</p>
                      <p className="text-xl font-black text-emerald-600 leading-none">R$ {pkg.promotionalPrice.toFixed(2)}</p>
                    </div>
                    <span className="text-[9px] text-slate-500 font-extrabold bg-slate-100/60 px-3 py-1.5 rounded-xl border border-slate-200/45">
                      Válido por {pkg.expiresDays} dias
                    </span>
                  </div>

                  {!pkg.active && (
                    <span className="absolute top-5 right-24 bg-red-500 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-md">
                      Suspenso
                    </span>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: Consumo e Venda de Pacotes */}
      {activeTab === 'pacotes_consumo' && (
        <div className="space-y-4 animate-fade-in">
          {filteredSales.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2rem] py-16 text-center shadow-sm flex flex-col items-center justify-center">
              <ShoppingBag size={28} className="text-slate-400 mb-2" />
              <h4 className="text-sm font-black uppercase tracking-tight">Nenhuma venda de pacote localizada</h4>
              <p className="text-muted text-xs max-w-xs mx-auto font-bold mt-1 leading-relaxed">
                Nenhum faturamento de pacote coincide com os filtros do painel.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                      <th className="p-5">Cliente</th>
                      <th className="p-5">Pacote Adquirido</th>
                      <th className="p-5">Preço Pago</th>
                      <th className="p-5">Saldo de Sessões</th>
                      <th className="p-5 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredSales.map(sale => {
                      const percentRemaining = Math.max(0, Math.round((sale.remainingCuts / sale.totalCuts) * 100));
                      const isExpanded = expandedSaleId === sale.id;
                      const hasUsages = sale.usages && sale.usages.length > 0;

                      return (
                        <React.Fragment key={sale.id}>
                          <tr className="hover:bg-slate-50/40 transition-all font-bold text-primary">
                            <td className="p-5">
                              <div>
                                <p className="font-extrabold text-slate-800 leading-tight">{sale.clientName}</p>
                                <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">ID: {sale.clientId.substring(0, 8)}</p>
                              </div>
                            </td>
                            <td className="p-5">
                              <p className="text-sm font-black text-slate-800 leading-none">{sale.packageName}</p>
                              {sale.serviceName && (
                                <p className="text-[10px] text-accent font-black uppercase tracking-wider mt-1 bg-accent/5 px-2.5 py-0.5 rounded-md inline-block">
                                  🛠️ {sale.serviceName}
                                </p>
                              )}
                            </td>
                            <td className="p-5">
                              <p className="text-xs font-bold text-slate-400 line-through leading-none mb-1">
                                {(() => {
                                  const config = packages.find(p => p.id === sale.packageId);
                                  const originalVal = config ? config.originalPrice : (sale.pricePaid * 1.25);
                                  return `R$ ${originalVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                                })()}
                              </p>
                              <p className="text-sm font-black text-emerald-600 leading-none">
                                R$ {sale.pricePaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </td>
                            <td className="p-5">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                                    <div 
                                      className={`h-full transition-all duration-500 rounded-full ${
                                        percentRemaining > 40 ? 'bg-emerald-500' : percentRemaining > 15 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${percentRemaining}%` }}
                                    />
                                  </div>
                                  <span className={`text-xs font-black tracking-tight ${
                                    sale.remainingCuts > 0 ? 'text-slate-700' : 'text-slate-400 font-bold line-through'
                                  }`}>
                                    {sale.totalCuts - sale.remainingCuts} de {sale.totalCuts} consumidos
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-[9px] font-black uppercase text-slate-450">
                                    Saldo restante: <strong className="text-slate-700 font-black">{sale.remainingCuts} sessões</strong>
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="p-5 text-right flex justify-end gap-2 items-center">
                              <button 
                                type="button"
                                onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                                className="p-2 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition flex items-center justify-center gap-1"
                                title="Histórico de consumo"
                              >
                                <Eye size={14} />
                                <span className="text-[9px] uppercase font-black tracking-widest pl-0.5 hidden sm:inline">Histórico</span>
                              </button>

                              <button 
                                type="button"
                                disabled={sale.remainingCuts <= 0}
                                onClick={() => setDeductCutSale(sale)}
                                className="bg-primary hover:bg-slate-800 text-white text-[9px] font-black uppercase px-4 py-2.5 rounded-xl transition duration-200 shadow-sm disabled:opacity-30 disabled:scale-100 active:scale-95 shrink-0"
                              >
                                Usar 1 Corte
                              </button>

                              {canManage && (
                                <button 
                                  type="button"
                                  onClick={() => setDeleteSaleId(sale.id)} 
                                  className="text-slate-350 hover:text-red-500 p-2.5 rounded-xl hover:bg-red-50/50"
                                  title="Estornar pacote vendido"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Consumption history expandable panel */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="bg-slate-50/60 p-6 border-b border-slate-100">
                                <div className="max-w-3xl mx-auto space-y-4">
                                  <div className="flex items-center justify-between border-b pb-2">
                                    <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-1.5">
                                      <BookOpen size={14} className="text-indigo-600" />
                                      <span>Log do Cartão de Consumo</span>
                                    </h4>
                                    <span className="text-[9px] font-black text-slate-400 uppercase">
                                      Vendido em: {new Date(sale.soldAt).toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>

                                  {!hasUsages ? (
                                    <div className="py-6 text-center text-slate-400 italic font-bold text-xs">
                                      Nenhum corte do pacote foi utilizado ainda. Clique em "Usar 1 Corte" para registrar faturamentos.
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {sale.usages?.map((usage, idx) => (
                                        <div 
                                          key={`${sale.id}-use-${usage.index || idx}`} 
                                          className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-xl hover:border-slate-350 transition"
                                        >
                                          <div className="flex items-center gap-3.5">
                                            <div className="w-6.5 h-6.5 bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center rounded-lg font-black text-[10px]">
                                              #{usage.index}
                                            </div>
                                            <div>
                                              <p className="text-xs font-extrabold text-primary">Corte Marcado com Sucesso</p>
                                              <p className="text-[9px] font-medium text-slate-450">
                                                Consumido em: {new Date(usage.usedAt).toLocaleDateString('pt-BR')} às {new Date(usage.usedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                              </p>
                                            </div>
                                          </div>

                                          {canManage && (
                                            <button
                                              type="button"
                                              onClick={() => setRevertCutSale({ sale, usageIndex: usage.index })}
                                              className="flex items-center gap-1 bg-slate-50 border hover:bg-slate-100 text-slate-500 hover:text-indigo-600 p-2 rounded-lg transition text-[9px] font-black uppercase tracking-widest"
                                              title="Estornar este uso de corte"
                                            >
                                              <Undo2 size={12} />
                                              <span>Desfazer</span>
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                />
              ))}
            </div>
          )}

          {/* Show pricing templates for quick subscription discovery */}
          <div className="pt-6">
            <h3 className="font-bold text-slate-800 text-base mb-6 flex items-center gap-2">
              <Star size={18} className="text-accent" />
              Nossos Planos Disponíveis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.filter(p => p.status === 'active').map(plan => (
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

      {/* CLIENT TAB 2: Meus Pacotes */}
      {activeTab === 'meus_pacotes' && (
        <div className="space-y-6">
          {sales.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-border rounded-[2rem] p-12 text-center shadow-sm">
              <div className="w-16 h-16 bg-white border border-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <ShoppingBag size={32} className="text-slate-350" />
              </div>
              <h3 className="text-lg font-bold text-primary mb-1">Nenhum pacote de cortes em haver</h3>
              <p className="text-muted text-sm max-w-sm mx-auto font-medium mb-4">Adquira pacotes fidelidade de forma rápida e ganhe descontos nas suas visitas periódicas!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sales.map(sale => {
                const percentRemaining = Math.max(0, Math.round((sale.remainingCuts / sale.totalCuts) * 100));
                return (
                  <div key={sale.id} className="bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                    <div>
                      <span className="text-[8px] font-black px-2.5 py-1 bg-slate-100 rounded-full uppercase border text-slate-500">
                        Pacote Adquirido
                      </span>
                      <h3 className="text-lg font-extrabold mt-3 text-slate-800">{sale.packageName}</h3>
                      {sale.serviceName && (
                        <p className="text-[10px] text-accent font-black uppercase mt-1 bg-accent/5 px-2 py-0.5 rounded-md inline-block">🛠️ {sale.serviceName}</p>
                      )}
                      
                      <div className="mt-5 space-y-3">
                        <div className="flex justify-between text-xs font-bold text-slate-450 uppercase">
                          <span>Sessões em Haver</span>
                          <span className="text-primary">{sale.remainingCuts} de {sale.totalCuts}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${percentRemaining}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t mt-6 flex justify-between items-center text-[10px] text-slate-400 font-bold">
                      <span>Adquirido em {new Date(sale.soldAt).toLocaleDateString('pt-BR')}</span>
                      <button 
                        type="button" 
                        onClick={() => setExpandedSaleId(expandedSaleId === sale.id ? null : sale.id)} 
                        className="text-accent underline cursor-pointer"
                      >
                        {expandedSaleId === sale.id ? "Esconder Log" : "Ver Consultas de Usos"}
                      </button>
                    </div>

                    {expandedSaleId === sale.id && (
                      <div className="mt-4 bg-slate-50 p-4 border border-slate-150 rounded-2xl space-y-2 text-xs">
                        <p className="font-extrabold border-b pb-1">Histórico de Visitas (Consumo):</p>
                        {sale.usages && sale.usages.length > 0 ? (
                          sale.usages.map((u, i) => (
                            <div key={i} className="flex justify-between py-1 text-[11px] text-slate-650 font-semibold border-b border-dashed border-slate-205/60 last:border-b-0">
                              <span>Sessão Nº {u.index}</span>
                              <span>{new Date(u.usedAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-400 italic text-[10px]">Ainda não há nenhum consumo lançado para este pacote.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Show available package packages templates */}
          <div className="pt-6">
            <h3 className="font-bold text-slate-800 text-base mb-6 flex items-center gap-2">
              <Award size={18} className="text-primary" />
              Veja nossa grade de pacotes com Descontos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {packages.filter(p => p.active).map(pkg => (
                <div key={pkg.id} className="bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">{pkg.name}</h3>
                    {pkg.serviceName && <span className="text-[8px] uppercase tracking-wider font-extrabold text-accent bg-accent/5 px-2 py-0.5 rounded-md inline-block mt-1">🛠️ {pkg.serviceName}</span>}
                    <p className="text-xs text-slate-500 font-bold mt-2">Leve {pkg.cutsCount} utilizações do mesmo serviço pagando menos!</p>
                  </div>
                  <div className="pt-4 border-t mt-5 flex justify-between items-end">
                    <div>
                      <p className="text-[9px] text-slate-400 line-through">De R$ {pkg.originalPrice.toFixed(2)}</p>
                      <p className="text-base font-black text-emerald-650">Por R$ {pkg.promotionalPrice.toFixed(2)}</p>
                    </div>
                    <span className="text-[9px] text-slate-500 font-extrabold bg-slate-50 px-2 py-1 rounded border border-slate-100">Expira em {pkg.expiresDays} dias</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOGS & FORM MODALS */}

      {/* Confirmation: Delete Package Config */}
      <ConfirmationModal 
        isOpen={deletePackageId !== null} 
        onClose={() => setDeletePackageId(null)} 
        onConfirm={handleConfirmDeletePackage} 
        title="Apagar Modelo de Pacote" 
        description="Deseja mesmo remover permanentemente esta regra de pacote? Vendas prévias efetuadas vinculadas a este ID continuarão ativas no consumo dos clientes."
        confirmLabel="Remover"
        variant="danger"
      />

      {/* Confirmation: Estornar Venda de Pacote */}
      <ConfirmationModal 
        isOpen={deleteSaleId !== null} 
        onClose={() => setDeleteSaleId(null)} 
        onConfirm={handleConfirmDeleteSale} 
        title="Estornar Venda de Pacote" 
        description="Tem certeza que dejesa estornar a compra deste pacote? O saldo restante de cortes será cancelado permanentemente para este cliente e faturamentos vinculados serão limpos."
        confirmLabel="Estornar Venda"
        variant="danger"
      />

      {/* Confirmation: Usar 1 corte */}
      <ConfirmationModal 
        isOpen={deductCutSale !== null} 
        onClose={() => setDeductCutSale(null)} 
        onConfirm={handleConfirmDeductCut} 
        title="Registrar Consumo de Corte" 
        description={`Confirmar a utilização de 1 sessão/corte no pacote de "${deductCutSale?.packageName}" para o cliente "${deductCutSale?.clientName}"? Isto debitará 1 saldo.`}
        confirmLabel="Confirmar Uso"
      />

      {/* Confirmation: Reverter 1 Corte */}
      <ConfirmationModal 
        isOpen={revertCutSale !== null} 
        onClose={() => setRevertCutSale(null)} 
        onConfirm={handleConfirmRevertCut} 
        title="Desfazer Uso de Corte" 
        description={`Confirmar estorno do consumo #${revertCutSale?.usageIndex} para o cliente ${revertCutSale?.sale.clientName}? Isto devolverá 1 saldo de corte ao pacote.`}
        confirmLabel="Reverter"
      />

      {/* Form Modal: Plan Configuration (Add / Edit) */}
      <AnimatePresence>
        {showPlanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white border rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
                <h2 className="text-xl font-bold text-primary">{editingPlan ? 'Editar Plano de Assinatura' : 'Novo Plano de Assinatura'}</h2>
                <button type="button" onClick={() => setShowPlanModal(false)} className="p-2 text-slate-400 hover:text-primary transition-colors">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSavePlan} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Nome do Plano</label>
                    <input name="name" defaultValue={editingPlan?.name} required className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none font-medium" placeholder="Ex: Clube de assinatura VIP" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Preço Mensal (R$)</label>
                    <input name="price" type="number" step="0.01" defaultValue={editingPlan?.price} required className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none font-medium" placeholder="0.00" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Descrição</label>
                    <textarea name="description" defaultValue={editingPlan?.description} rows={2} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none resize-none font-medium" placeholder="Ex: Cortes e barbas ilimitados todo mês..." />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Cortes por Mês</label>
                    <input name="haircutsPerMonth" type="number" defaultValue={editingPlan?.haircutsPerMonth || 4} required className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Barbas por Mês</label>
                    <input name="beardsPerMonth" type="number" defaultValue={editingPlan?.beardsPerMonth || 0} required className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none font-medium" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Benefícios Extras (separados por vírgula)</label>
                    <input name="extraBenefits" defaultValue={editingPlan?.extraBenefits.join(', ')} placeholder="Café grátis no atendimento, 10% de desconto em mercadorias de revenda..." className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Status</label>
                    <select name="status" defaultValue={editingPlan?.status || 'active'} className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-accent/50 transition-all text-primary outline-none cursor-pointer font-medium appearance-none">
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 font-bold">
                  <button type="button" onClick={() => setShowPlanModal(false)} className="flex-1 py-4 border border-slate-200 rounded-xl text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={isSavingPlan}
                    className="flex-[2] py-4 bg-primary text-white rounded-xl text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
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
                  <button type="button" onClick={() => setShowAssignModal(false)} className="flex-1 py-4 border border-slate-205 rounded-xl text-sm text-muted uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={isAssigning}
                    className="flex-[2] py-4 bg-primary text-white rounded-xl text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isAssigning ? <Loader2 className="animate-spin" size={18} /> : 'Ativar Assinatura'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal: Pacote Configuration (Add / Edit) */}
      <AnimatePresence>
        {showPackageModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleSavePackage}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border rounded-[2rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">
                    {editingPackage ? 'Editar Pacote' : 'Novo Modelo de Pacote'}
                  </h3>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-1">Configurar limite de cortes pré-pagos</p>
                </div>
                <button type="button" onClick={() => setShowPackageModal(false)} className="bg-slate-100 p-2 rounded-xl text-slate-500 hover:text-primary transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Vincular Serviço Integrado</label>
                  <select
                    required
                    value={pkgServiceId}
                    onChange={e => {
                      const val = e.target.value;
                      setPkgServiceId(val);
                      // Auto populate name if empty
                      const selected = services.find(s => s.id === val);
                      if (selected && (!pkgName || pkgName.startsWith('Pacote Fidelidade') || pkgName === '')) {
                        setPkgName(`Pacote Fidelidade - ${selected.nome || selected.name}`);
                      }
                    }}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl cursor-pointer font-bold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50"
                  >
                    <option value="">-- Selecione o Serviço do Catálogo --</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.nome || s.name} (R$ {(s.preco ?? s.price ?? 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Nome Comercial do Pacote</label>
                  <input 
                    required
                    type="text" 
                    value={pkgName} 
                    onChange={e => setPkgName(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50 transition"
                    placeholder="Ex: Pacote de Cortes Premium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Sessões / Cortes</label>
                    <input 
                      required
                      type="number" 
                      min="1"
                      value={pkgCuts} 
                      onChange={e => setPkgCuts(Number(e.target.value))}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl font-bold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Dias de Validade</label>
                    <input 
                      required={!pkgNoExpiration}
                      disabled={pkgNoExpiration}
                      type="number"
                      min="1"
                      placeholder="Sem validade"
                      value={pkgNoExpiration ? '' : pkgExpires} 
                      onChange={e => setPkgExpires(Number(e.target.value))}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl font-bold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50 disabled:opacity-50"
                    />
                    <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                      <input 
                        type="checkbox" 
                        id="pkgNoExpCheck" 
                        checked={pkgNoExpiration} 
                        onChange={e => setPkgNoExpiration(e.target.checked)}
                        className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer" 
                      />
                      <label htmlFor="pkgNoExpCheck" className="text-[10px] font-bold text-slate-500 cursor-pointer selection:bg-transparent">Sem validade (não expira)</label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Preço Unitário</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">R$</span>
                      <input 
                        type="number" 
                        min="0.01"
                        step="0.01"
                        placeholder="25.00"
                        value={pkgPricePerService} 
                        onChange={e => setPkgPricePerService(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border py-3.5 pl-7 pr-2 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50"
                      />
                    </div>
                    <span className="text-[8px] text-slate-400 mt-1 block text-center italic leading-none">Ex: 25.00</span>
                  </div>
                  
                  <div className="col-span-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Total Balcão</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">R$</span>
                      <input 
                        required
                        type="number" 
                        min="1"
                        step="0.01"
                        value={pkgOrigPrice} 
                        onChange={e => setPkgOrigPrice(Number(e.target.value))}
                        className="w-full bg-slate-50 border py-3.5 pl-7 pr-2 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50"
                      />
                    </div>
                  </div>

                  <div className="col-span-1">
                    <label className="text-[10px] uppercase text-slate-500 tracking-wider block mb-1.5 ml-1">Total Pacote</label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-extrabold">R$</span>
                      <input 
                        required
                        type="number" 
                        min="1"
                        step="0.01"
                        value={pkgPromoPrice} 
                        onChange={e => setPkgPromoPrice(Number(e.target.value))}
                        className="w-full bg-slate-50 border py-3.5 pl-7 pr-2 rounded-xl text-xs font-bold outline-none focus:bg-white focus:ring-4 focus:ring-slate-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    id="pkgActiveCheck" 
                    checked={pkgActive} 
                    onChange={e => setPkgActive(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer" 
                  />
                  <label htmlFor="pkgActiveCheck" className="text-xs font-bold text-slate-705 cursor-pointer selection:bg-transparent">Modelo Ativo e Disponível para Faturamento</label>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowPackageModal(false)}
                  className="py-4 border border-slate-200 hover:bg-slate-50 text-muted rounded-2xl text-[10px] uppercase tracking-widest font-black"
                >
                  Fechar
                </button>
                <button 
                  type="submit"
                  className="col-span-2 py-4 bg-primary hover:bg-slate-800 text-white rounded-2xl text-[10px] uppercase tracking-widest font-black transition shadow-lg shadow-slate-900/10"
                >
                  {editingPackage ? 'Salvar Regulamento' : 'Registrar Modelo'}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal: Vender Pacote */}
      <AnimatePresence>
        {showSaleModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleSellPackage}
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border rounded-[2rem] shadow-2xl p-8 w-full max-w-sm space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight">Associar Pacote a Cliente</h3>
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-1">Efetue a venda do pacote de cortes pré-pago</p>
                </div>
                <button type="button" onClick={() => setShowSaleModal(false)} className="bg-slate-100 p-2 rounded-xl text-slate-500 hover:text-primary transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Selecionar Cliente Proprietário</label>
                  <select 
                    required
                    value={selectedClientId}
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full bg-slate-50 border p-3 rounded-xl cursor-pointer font-extrabold outline-none focus:bg-white"
                  >
                    <option value="">-- Escolher Cliente --</option>
                    {clients.map(c => (
                      <option key={c.uid} value={c.uid}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Selecionar Pacote Catalogado</label>
                  <select 
                    required
                    value={selectedPkgId}
                    onChange={e => {
                      const val = e.target.value;
                      setSelectedPkgId(val);
                      const matched = packages.find(p => p.id === val);
                      if (matched) {
                        setSalePrice(matched.promotionalPrice);
                      }
                    }}
                    className="w-full bg-slate-50 border p-3 rounded-xl cursor-pointer font-extrabold outline-none focus:bg-white"
                  >
                    <option value="">-- Escolher Regulamento --</option>
                    {packages.filter(p => p.active).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Sessões: {p.cutsCount} | Preço: R$ {p.promotionalPrice.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-slate-400 block mb-1">Preço Efetivado de Venda</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                    <input 
                      required
                      type="number" 
                      min="1"
                      step="0.01"
                      value={salePrice} 
                      onChange={e => setSalePrice(Number(e.target.value))}
                      className="w-full bg-slate-50 border py-3 pl-9 pr-4 rounded-xl font-black outline-none focus:bg-white"
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold mt-1.5 leading-tight">Gera automaticamente uma transação consolidada nas contas do sistema.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowSaleModal(false)}
                  className="py-4 border border-slate-205 hover:bg-slate-50 text-muted rounded-2xl text-[10px] uppercase tracking-widest font-black"
                >
                  Fechar
                </button>
                <button 
                  type="submit"
                  className="col-span-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] uppercase tracking-widest font-black transition shadow-lg shadow-emerald-500/10"
                >
                  Confirmar Faturamento
                </button>
              </div>
            </motion.form>
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
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{title}</p>
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
          ? 'bg-white text-primary shadow-sm border border-slate-100' 
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
            className="p-2 text-slate-350 hover:text-primary hover:bg-slate-50 rounded-xl transition-all"
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
          <span className="text-xs font-bold text-slate-400 ml-2 uppercase tracking-widest">/mês</span>
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
          className="w-full py-4 bg-slate-50 border border-slate-100 text-primary rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
        >
          Vincular Cliente
        </button>
      )}
      
      {plan.status === 'inactive' && (
        <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest">
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
}

function SubscriptionCard({ sub, plan, isAdmin, onRegisterUsage }: SubscriptionCardProps) {
  if (!plan) return null;

  const statusColors: Record<SubscriptionStatus, string> = {
    active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    expired: 'bg-red-50 text-red-600 border-red-100',
    canceled: 'bg-slate-50 text-slate-600 border-slate-100',
    paused: 'bg-amber-50 text-amber-600 border-amber-100',
    pending: 'bg-blue-50 text-blue-600 border-blue-100'
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[2rem] p-8 space-y-8 shadow-sm group hover:border-accent/20 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center shadow-sm">
            <ShieldCheck className="text-accent" size={24} />
          </div>
          <div>
            <h4 className="font-bold text-primary group-hover:text-accent transition-colors">{sub.cliente_name}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-muted uppercase tracking-widest">{plan.name}</span>
              <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-lg border ${statusColors[sub.status]}`}>
                {sub.status}
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Vence em</p>
          <p className="text-sm font-bold text-primary">{format(parseISO(sub.endDate), 'dd/MM/yyyy')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <UsageIndicator 
          label="Cortes" 
          used={sub.haircutsUsed} 
          total={plan.haircutsPerMonth} 
          onAdd={isAdmin ? () => onRegisterUsage(sub.id, 'haircut') : undefined}
        />
        <UsageIndicator 
          label="Barbas" 
          used={sub.beardsUsed} 
          total={plan.beardsPerMonth} 
          onAdd={isAdmin && plan.beardsPerMonth > 0 ? () => onRegisterUsage(sub.id, 'beard') : undefined}
        />
      </div>

      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted">
          <RefreshCw size={14} className={sub.autoRenew ? 'text-emerald-300 animate-spin-slow' : 'text-slate-300'} />
          <span className="text-[10px] font-bold uppercase tracking-widest">
            {sub.autoRenew ? 'Renovação Mensal Automática' : 'Renovação Manual'}
          </span>
        </div>
      </div>
    </div>
  );
}

function UsageIndicator({ label, used, total, onAdd }: any) {
  const percentage = Math.min((used / total) * 100, 100);
  
  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl relative group shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="text-sm font-bold text-primary">{used} / {total}</p>
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
