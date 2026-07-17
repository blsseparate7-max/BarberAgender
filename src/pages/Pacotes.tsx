import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Users, 
  Edit2, 
  Trash2, 
  Loader2, 
  History, 
  X, 
  Search, 
  ShoppingBag, 
  CheckCircle, 
  Eye, 
  Undo2, 
  BookOpen, 
  Award, 
  Info,
  Calendar,
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services/userService';
import { UserProfile, Service } from '../types';
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
  getDocs
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
  noExpiration?: boolean;
  active: boolean;
  serviceId?: string;
  serviceName?: string;
  pricePerService?: number | null;
  showInPortal?: boolean;
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
  pricePerService?: number | null;
  noExpiration?: boolean;
  expiresDays?: number;
}

interface PacotesProps {
  defaultTab?: 'pacotes_consumo' | 'pacotes_modelos' | 'meus_pacotes';
}

export function Pacotes({ defaultTab }: PacotesProps) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  const getInitialTabState = () => {
    if (profile?.tipo === 'cliente') {
      return 'meus_pacotes';
    }
    if (defaultTab) {
      return defaultTab;
    }
    return 'pacotes_consumo';
  };

  const [activeTab, setActiveTab] = useState<'pacotes_consumo' | 'pacotes_modelos' | 'meus_pacotes'>(getInitialTabState());

  useEffect(() => {
    if (profile?.tipo === 'cliente') {
      setActiveTab('meus_pacotes');
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, profile?.tipo]);

  const [packages, setPackages] = useState<PackageConfig[]>([]);
  const [sales, setSales] = useState<PackageSale[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [salesFilter, setSalesFilter] = useState<'all' | 'active' | 'consumed'>('all');

  // Modals for Packages
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageConfig | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedPkgId, setSelectedPkgId] = useState('');
  const [salePrice, setSalePrice] = useState<number | ''>('');

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
  const [pkgShowInPortal, setPkgShowInPortal] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      if (canManage) {
        const c = await userService.getAllClients();
        setClients(c.filter(client => client.ativo !== false));
      }
    } catch (error) {
      console.error("Erro ao carregar dados estáticos de pacotes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubPkg: (() => void) | undefined;
    let unsubSales: (() => void) | undefined;
    let unsubServ: (() => void) | undefined;

    const setupListeners = () => {
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
  }, [profile?.uid, profile?.tipo, user?.uid, canManage]);

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
      setPkgShowInPortal(editingPackage.showInPortal ?? true);
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
      setPkgShowInPortal(true);
    }
  }, [editingPackage]);

  // Recalculating default pricing when service changes, cuts count changes, or price per service changes
  useEffect(() => {
    if (pkgServiceId && services.length > 0) {
      const selectedService = services.find(s => s.id === pkgServiceId);
      if (selectedService) {
        const servicePrice = selectedService.preco ?? selectedService.price ?? 0;
        setPkgOrigPrice(servicePrice * pkgCuts);
        
        if (pkgPricePerService !== '' && Number(pkgPricePerService) > 0) {
          setPkgPromoPrice(Number(pkgPricePerService) * pkgCuts);
        }
      }
    }
  }, [pkgServiceId, pkgCuts, pkgPricePerService, services]);

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
      serviceName: selectedService ? (selectedService.nome || selectedService.name || '') : '',
      showInPortal: pkgShowInPortal
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
      setSalePrice('');
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

  const filteredSales = sales.filter(sale => {
    const matchesSearch = sale.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          sale.packageName.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (salesFilter === 'active') {
      return matchesSearch && sale.remainingCuts > 0;
    }
    if (salesFilter === 'consumed') {
      return matchesSearch && sale.remainingCuts <= 0;
    }
    return matchesSearch;
  });

  // Calculate high-level stats
  const totalModelsCount = packages.length;
  const activeModelsCount = packages.filter(p => p.active).length;
  const totalSalesCount = sales.length;
  const activeSalesCount = sales.filter(s => s.remainingCuts > 0).length;
  const totalRevenueGenerated = sales.reduce((sum, s) => sum + s.pricePaid, 0);

  return (
    <div className="space-y-8 pb-12 outline-none">
      {/* Title Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 border border-slate-100 p-6 rounded-[2rem] shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-primary uppercase tracking-tight">Gestão de Pacotes de Cortes</h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Crie, venda e gerencie pacotes de cortes pré-pagos e fidelize seus clientes recorrentes.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button 
              type="button"
              onClick={() => {
                setEditingPackage(null);
                setShowPackageModal(true);
              }}
              className="px-5 py-3.5 bg-primary hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              <span>Novo Modelo</span>
            </button>

            <button 
              type="button"
              disabled={packages.filter(p => p.active).length === 0}
              onClick={() => {
                setSelectedClientId('');
                setSelectedPkgId('');
                setSalePrice('');
                setShowSaleModal(true);
              }}
              className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ShoppingBag size={16} />
              <span>Vender Pacote</span>
            </button>
          </div>
        )}
      </div>

      {/* Analytics Bento Grid */}
      {canManage && profile?.tipo !== 'cliente' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 bg-white border border-slate-200 rounded-[2rem] space-y-4 shadow-sm">
            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
              <Award size={18} />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">{activeModelsCount} / {totalModelsCount}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Modelos Ativos</p>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-[2rem] space-y-4 shadow-sm">
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center shadow-sm text-emerald-600">
              <ShoppingBag size={18} />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">{totalSalesCount}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Total de Pacotes Vendidos</p>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-[2rem] space-y-4 shadow-sm">
            <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center shadow-sm text-amber-600">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">{activeSalesCount}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Pacotes em Haver</p>
            </div>
          </div>

          <div className="p-6 bg-white border border-slate-200 rounded-[2rem] space-y-4 shadow-sm">
            <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
              <DollarSign size={18} />
            </div>
            <div>
              <p className="text-2xl font-black text-primary">R$ {totalRevenueGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Faturamento Bruto</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs navigation panel */}
      {canManage && profile?.tipo !== 'cliente' && (
        <div className="flex border-b border-slate-100 gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
          <button 
            type="button"
            onClick={() => {
              setActiveTab('pacotes_consumo');
              setSearchQuery('');
            }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'pacotes_consumo' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-slate-500 hover:text-primary hover:bg-slate-50/50'
            }`}
          >
            <ShoppingBag size={14} />
            Consumo & Vendas de Pacotes
          </button>

          <button 
            type="button"
            onClick={() => {
              setActiveTab('pacotes_modelos');
              setSearchQuery('');
            }}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'pacotes_modelos' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-slate-500 hover:text-primary hover:bg-slate-50/50'
            }`}
          >
            <Award size={14} />
            Modelos de Pacotes Catalogados
          </button>
        </div>
      )}

      {/* SEARCH AND FILTERS */}
      {profile?.tipo !== 'cliente' && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder={activeTab === 'pacotes_modelos' ? "Buscar modelo de pacote..." : "Buscar venda por cliente ou pacote..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-xs font-semibold outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-primary"
            />
          </div>

          {activeTab === 'pacotes_modelos' ? (
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="activeModelsOnly" 
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
              <label htmlFor="activeModelsOnly" className="text-xs font-bold text-slate-600 select-none cursor-pointer">
                Exibir apenas modelos ativos
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filtro:</span>
              <select
                value={salesFilter}
                onChange={(e: any) => setSalesFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-black text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Todas as vendas</option>
                <option value="active">Em aberto (saldo &gt; 0)</option>
                <option value="consumed">Esgotados (saldo = 0)</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* CORE WORKSPACE CONTENT PANEL */}
      <div className="space-y-6">
        
        {/* TAB 1: Consumo e Venda de Pacotes */}
        {activeTab === 'pacotes_consumo' && profile?.tipo !== 'cliente' && (
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
                                  <p className="text-[10px] text-accent font-black uppercase tracking-wider mt-1.5 bg-accent/5 px-2.5 py-0.5 rounded-md inline-block">
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
                                  className="bg-primary hover:bg-slate-800 text-white text-[9px] font-black uppercase px-4 py-2.5 rounded-xl transition duration-200 shadow-sm disabled:opacity-30 disabled:scale-100 active:scale-95 shrink-0 cursor-pointer"
                                >
                                  Usar 1 Corte
                                </button>

                                {canManage && (
                                  <button 
                                    type="button"
                                    onClick={() => setDeleteSaleId(sale.id)} 
                                    className="text-slate-350 hover:text-red-500 p-2.5 rounded-xl hover:bg-red-50/50 cursor-pointer"
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
                                                className="flex items-center gap-1 bg-slate-50 border hover:bg-slate-100 text-slate-500 hover:text-indigo-600 p-2 rounded-lg transition text-[9px] font-black uppercase tracking-widest cursor-pointer"
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

        {/* TAB 2: Modelos de Pacotes */}
        {activeTab === 'pacotes_modelos' && profile?.tipo !== 'cliente' && (
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
                const discountPercent = pkg.originalPrice > 0 ? Math.round((1 - (pkg.promotionalPrice / pkg.originalPrice)) * 100) : 0;
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
                              className="p-1.5 text-slate-400 hover:text-primary rounded-lg hover:bg-slate-50 cursor-pointer"
                              title="Editar pacote"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              type="button"
                              onClick={() => handleTogglePackageActive(pkg)}
                              className={`p-1.5 rounded-lg cursor-pointer ${pkg.active ? 'text-slate-400 hover:text-amber-500' : 'text-slate-400 hover:text-emerald-500'}`}
                              title={pkg.active ? "Inativar" : "Ativar"}
                            >
                              {pkg.active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                            </button>
                            <button 
                              type="button"
                              onClick={() => setDeletePackageId(pkg.id)}
                              className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer"
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
                        {pkg.noExpiration ? 'Sem expiração' : `Válido por ${pkg.expiresDays} dias`}
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

        {/* CLIENT TAB: Meus Pacotes */}
        {profile?.tipo === 'cliente' && (
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
                {packages.filter(p => p.active && p.showInPortal !== false).map(pkg => {
                  const discountPercent = pkg.originalPrice > 0 ? Math.round((1 - (pkg.promotionalPrice / pkg.originalPrice)) * 100) : 0;
                  return (
                    <div key={pkg.id} className="bg-white border rounded-[2rem] p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition relative">
                      <div>
                        <div className="flex justify-between">
                          <span className="text-[8px] font-black px-2.5 py-1 bg-emerald-50 border border-emerald-150 text-emerald-700 rounded-full uppercase">
                            Economize {discountPercent}%
                          </span>
                        </div>
                        <h4 className="text-base font-extrabold mt-4 text-slate-800">{pkg.name}</h4>
                        {pkg.serviceName && (
                          <p className="text-[10px] text-accent font-black uppercase mt-1.5 bg-accent/5 px-2.5 py-0.5 rounded-md inline-block">🛠️ {pkg.serviceName}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-3 text-slate-500 text-xs font-semibold">
                          <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                          <span>{pkg.cutsCount} sessões inclusas</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t mt-6 flex items-end justify-between">
                        <div>
                          <p className="text-[9px] text-slate-400 line-through font-semibold leading-none mb-1">R$ {pkg.originalPrice.toFixed(2)}</p>
                          <p className="text-lg font-black text-emerald-600 leading-none">R$ {pkg.promotionalPrice.toFixed(2)}</p>
                        </div>
                        <span className="text-[8px] text-slate-400 font-extrabold bg-slate-50 px-2 py-1 rounded-lg border">
                          {pkg.noExpiration ? 'Sem limite de validade' : `Validade: ${pkg.expiresDays} dias`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONFIRMATION DIALOGS */}
      <ConfirmationModal
        isOpen={!!deletePackageId}
        onClose={() => setDeletePackageId(null)}
        onConfirm={handleConfirmDeletePackage}
        title="Excluir Modelo de Pacote"
        description="Deseja realmente excluir este modelo de pacote permanentemente? Esta alteração não afetará os pacotes já comprados pelos clientes."
      />

      <ConfirmationModal
        isOpen={!!deleteSaleId}
        onClose={() => setDeleteSaleId(null)}
        onConfirm={handleConfirmDeleteSale}
        title="Estornar Venda de Pacote"
        description="Deseja realmente excluir e estornar esta venda de pacote do cliente? Isso removerá o saldo de sessões dele e os logs de consumo."
      />

      <ConfirmationModal
        isOpen={!!deductCutSale}
        onClose={() => setDeductCutSale(null)}
        onConfirm={handleConfirmDeductCut}
        title="Lançar Consumo de Corte"
        description={`Confirmar a utilização de 1 sessão/corte no pacote de "${deductCutSale?.clientName}"? Isto deduzirá 1 unidade do saldo disponível.`}
      />

      <ConfirmationModal
        isOpen={!!revertCutSale}
        onClose={() => setRevertCutSale(null)}
        onConfirm={handleConfirmRevertCut}
        title="Desfazer Lançamento de Consumo"
        description={`Deseja realmente desfazer a utilização nº ${revertCutSale?.usageIndex} e estornar o saldo correspondente de volta para o cliente?`}
      />

      {/* MODAL: CADASTRO / EDIÇÃO DE MODELO DE PACOTE */}
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
                  <label htmlFor="pkgActiveCheck" className="text-xs font-bold text-slate-700 cursor-pointer selection:bg-transparent">Modelo Ativo e Disponível para Faturamento</label>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <input 
                    type="checkbox" 
                    id="pkgShowInPortalCheck" 
                    checked={pkgShowInPortal} 
                    onChange={e => setPkgShowInPortal(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer" 
                  />
                  <label htmlFor="pkgShowInPortalCheck" className="text-xs font-bold text-emerald-700 cursor-pointer selection:bg-transparent">Disponível no Portal do Cliente (Comprar online)</label>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowPackageModal(false)}
                  className="py-4 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-2xl text-[10px] uppercase tracking-widest font-black"
                >
                  Fechar
                </button>
                <button 
                  type="submit"
                  className="col-span-2 py-4 bg-primary hover:bg-slate-800 text-white rounded-2xl text-[10px] uppercase tracking-widest font-black transition shadow-lg shadow-slate-900/10 cursor-pointer"
                >
                  {editingPackage ? 'Salvar Regulamento' : 'Registrar Modelo'}
                </button>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: VENDER PACOTE PARA CLIENTE */}
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
                      } else {
                        setSalePrice('');
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
                      onChange={e => setSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
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
                  className="py-4 border border-slate-205 hover:bg-slate-50 text-slate-500 rounded-2xl text-[10px] uppercase tracking-widest font-black"
                >
                  Fechar
                </button>
                <button 
                  type="submit"
                  className="col-span-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] uppercase tracking-widest font-black transition shadow-lg shadow-emerald-500/10 cursor-pointer"
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
