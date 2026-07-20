import React, { useState, useEffect } from 'react';
import { 
  Scissors, 
  Plus, 
  Clock, 
  DollarSign, 
  MoreVertical, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Tag,
  ChevronRight,
  X,
  AlertCircle,
  LayoutGrid,
  Settings2,
  Check,
  Award,
  Sparkles,
  Layers,
  ChevronDown,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Service, ServiceCategory, UserProfile } from '../types';
import { serviceService } from '../services/serviceService';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { toast } from 'sonner';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { collection, onSnapshot, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Category Aesthetic Mapping for bespoke badges and cards styling
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  'cabelo': { bg: 'bg-indigo-50/70', text: 'text-indigo-600', border: 'border-indigo-100', accent: 'bg-indigo-500' },
  'barba': { bg: 'bg-emerald-50/70', text: 'text-emerald-600', border: 'border-emerald-100', accent: 'bg-emerald-500' },
  'combo': { bg: 'bg-amber-50/70', text: 'text-amber-600', border: 'border-amber-100', accent: 'bg-amber-500' },
  'estética': { bg: 'bg-rose-50/70', text: 'text-rose-600', border: 'border-rose-100', accent: 'bg-rose-500' },
  'default': { bg: 'bg-slate-50/70', text: 'text-slate-600', border: 'border-slate-100', accent: 'bg-slate-450' }
};

const getCategoryStyle = (catName: string) => {
  const norm = catName.toLowerCase().trim();
  if (CATEGORY_STYLES[norm]) return CATEGORY_STYLES[norm];
  if (norm.includes('combo') || norm.includes('casado')) return CATEGORY_STYLES['combo'];
  if (norm.includes('corte') || norm.includes('cabelo') || norm.includes('penteado')) return CATEGORY_STYLES['cabelo'];
  if (norm.includes('barba') || norm.includes('navalha')) return CATEGORY_STYLES['barba'];
  if (norm.includes('estet') || norm.includes('facial') || norm.includes('limpeza')) return CATEGORY_STYLES['estética'];
  return CATEGORY_STYLES['default'];
};

export function Servicos() {
  const { isAdmin, isGerente } = useAuth();
  const canManage = isAdmin || isGerente;

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Modal states
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  // Safe Delete States
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Live Real-Time Synchronized Subscriptions (onSnapshot)
  useEffect(() => {
    setLoading(true);
    // Services direct listener to avoid REST polling lag or flickers
    const qServices = query(collection(db, 'services'), orderBy('nome', 'asc'));
    const unsubscribeServices = onSnapshot(qServices, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      setServices(docs);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao assinar carregamento em tempo real de serviços:", error);
      setLoading(false);
      toast.error("Erro ao carregar serviços em tempo real.");
    });

    // Categories direct listener
    const qCategories = query(collection(db, 'service_categories'), orderBy('order', 'asc'));
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceCategory));
      setCategories(docs);

      // Semeia categorias iniciais se o catálogo estiver 100% zerado
      if (docs.length === 0 && canManage) {
        const defaults = ['Cabelo', 'Barba', 'Combo', 'Estética'];
        Promise.all(defaults.map((name, i) => serviceService.createCategory(name, i)))
          .catch(err => console.error("Erro ao estruturar esquema inicial de categorias:", err));
      }
    }, (error) => {
      console.error("Erro ao assinar categorias em tempo real:", error);
    });

    return () => {
      unsubscribeServices();
      unsubscribeCategories();
    };
  }, [canManage]);

  const filteredServices = services.filter(s => {
    const nome = s.nome || s.name || '';
    const descricao = s.descricao || s.description || '';
    const categoria = s.categoria || s.category || '';

    const matchesSearch = nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          descricao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || categoria === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Toggle active/inactive status smoothly with automatic refresh
  const handleToggleStatus = async (service: Service) => {
    if (!canManage) return;
    try {
      await serviceService.updateService(service.id, { active: !service.active });
      toast.success(`Serviço "${service.nome || service.name}" marcado como ${!service.active ? 'Ativo' : 'Inativo'}`);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast.error("Não foi possível alterar o status do serviço.");
    }
  };

  const { execute: handleDelete, isLoading: isDeleting } = useAsyncAction(async (id: string) => {
    if (!canManage) return;
    try {
      await serviceService.deleteService(id);
      toast.success("Serviço excluído do catálogo com sucesso.");
      setConfirmDeleteId(null);
    } catch (error) {
      console.error("Erro ao excluir serviço:", error);
      toast.error("Não foi possível excluir o serviço.");
    }
  });

  // Metrics calculation for the Top Summary Bar
  const totalCount = services.length;
  const activeCount = services.filter(s => s.active).length;
  const inactiveCount = totalCount - activeCount;
  const totalCategoriesCount = categories.length;

  return (
    <div className="space-y-8 pb-16 text-primary">
      {/* Header Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 border-b border-slate-100 pb-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary mb-1">Catálogo de Serviços</h1>
          <p className="text-muted text-sm font-medium">
            Gerencie os serviços, tabelas de comissão, durações operacionais e regras de cortesia do seu estabelecimento.
          </p>
        </div>
        <div className="flex gap-3 shrink-0 self-start sm:self-center">
          {canManage && (
            <button 
              onClick={() => setIsCategoryModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-700 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-50 transition shadow-sm active:scale-95"
            >
              <Tag size={15} className="text-slate-500" />
              <span>Categorias</span>
            </button>
          )}
          {canManage && (
            <button 
              onClick={() => {
                setEditingService(null);
                setIsServiceModalOpen(true);
              }}
              className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-emerald-700 transition shadow-md shadow-emerald-600/10 active:scale-95"
            >
              <Plus size={16} />
              <span>Adicionar Serviço</span>
            </button>
          )}
        </div>
      </header>

      {/* Analytics Summary Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Serviços Cadastrados', value: totalCount, icon: Scissors, color: 'text-indigo-650 bg-indigo-50 border-indigo-100/50' },
          { label: 'Serviços Ativos', value: activeCount, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100/50' },
          { label: 'Cortesias / Especiais', value: services.filter(s => s.permite_cortesia).length, icon: Award, color: 'text-amber-600 bg-amber-50 border-amber-100/50' },
          { label: 'Categorias Ativas', value: totalCategoriesCount, icon: Layers, color: 'text-rose-600 bg-rose-50 border-rose-100/50' }
        ].map((stat, i) => (
          <div key={i} className={`bg-white border rounded-3xl p-4 flex items-center gap-4 shadow-sm`}>
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border ${stat.color} shrink-0`}>
              <stat.icon size={20} />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider leading-none mb-1">{stat.label}</p>
              <p className="text-xl font-black text-primary leading-none">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filters Segmented Control */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Buscar por nome do serviço ou palavras-chave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 outline-none focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium text-primary shadow-sm transition"
          />
        </div>
        
        {/* Horizontal Scrollable Category Pills */}
        <div className="flex bg-slate-100 border p-1 rounded-2xl shadow-inner w-full md:w-auto shrink-0 justify-start overflow-x-auto gap-1 no-scrollbar max-w-full">
          <button 
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
              selectedCategory === 'all' 
                ? 'bg-white text-primary shadow-sm' 
                : 'text-slate-500 hover:text-primary'
            }`}
          >
            Todos ({services.length})
          </button>
          {categories.map((cat, index) => {
            const count = services.filter(s => s.categoria === cat.name).length;
            return (
              <button 
                key={`cat-filter-${cat.id || index}-${index}`}
                onClick={() => setSelectedCategory(cat.name)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${
                  selectedCategory === cat.name 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-primary'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Service list section */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white border rounded-[2rem] shadow-sm animate-pulse">
          <Loader2 className="animate-spin text-indigo-600" size={48} />
          <p className="text-muted animate-pulse font-black tracking-widest uppercase text-xs">Sincronizando catálogo...</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] py-20 text-center shadow-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center mb-4 text-slate-350">
            <Scissors size={28} />
          </div>
          <h3 className="text-lg font-black text-primary uppercase tracking-tight mb-1">Nenhum serviço encontrado</h3>
          <p className="text-muted text-sm max-w-xs mx-auto font-bold leading-relaxed text-slate-450">
            Ajuste a sua busca, selecione outra categoria ou crie um novo serviço no botão superior.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredServices.map((service, index) => (
            <ServiceCard 
              key={`srv-card-${service.id || index}-${index}`} 
              service={service} 
              canManage={canManage}
              onEdit={() => {
                setEditingService(service);
                setIsServiceModalOpen(true);
              }}
              onToggleStatus={() => handleToggleStatus(service)}
              onDelete={() => setConfirmDeleteId(service.id)}
            />
          ))}
        </div>
      )}

      {/* Safe deletes and actions forms */}
      <AnimatePresence>
        {isServiceModalOpen && (
          <ServiceModal 
            service={editingService}
            categories={categories}
            onClose={() => setIsServiceModalOpen(false)}
          />
        )}
        {isCategoryModalOpen && (
          <CategoryModal 
            categories={categories}
            onClose={() => setIsCategoryModalOpen(false)}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Excluir Serviço"
        description="Tem certeza que de deseja excluir de forma permanente este serviço? Esta ação não pode ser desfeita e pode impactar comissões históricas e relatórios que citem este serviço."
        variant="danger"
        confirmLabel="Confirmar Exclusão"
      />
    </div>
  );
}

// PREMIUM COLORFUL AND INTERACTIVE SERVICE CARD
interface ServiceCardProps {
  key?: React.Key;
  service: Service;
  canManage: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}

function ServiceCard({ service, canManage, onEdit, onToggleStatus, onDelete }: ServiceCardProps) {
  const [showOptions, setShowOptions] = useState(false);

  const nome = service.nome || service.name;
  const preco = service.preco ?? service.price ?? 0;
  const duracao = service.duracao_minutos ?? service.duration ?? 0;
  const categoria = service.categoria || service.category || 'Geral';
  const descricao = service.descricao || service.description;

  const style = getCategoryStyle(categoria);

  return (
    <motion.div 
      layout
      className={`bg-white border rounded-[2.5rem] p-6 shadow-sm relative overflow-visible flex flex-col justify-between group transition-all duration-300 hover:shadow-md ${
        service.active 
          ? 'border-slate-200 hover:border-slate-300' 
          : 'border-red-150-f100 bg-red-50/5 opacity-70 grayscale'
      }`}
    >
      <div>
        {/* Dynamic header options */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="flex items-center gap-3.5">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-inner shrink-0 ${
              service.active ? `${style.bg} ${style.border} ${style.text}` : 'bg-slate-100 border-slate-200 text-slate-400'
            }`}>
              <Scissors size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-lg text-primary tracking-tight truncate leading-tight group-hover:text-indigo-650 transition-colors">
                {nome}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-md border ${
                  service.active ? `${style.bg} ${style.border} ${style.text}` : 'bg-slate-100 border-slate-250 text-slate-400'
                }`}>
                  {categoria}
                </span>
                
                {service.permite_cortesia && (
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-600 text-[8px] font-black uppercase tracking-widest rounded-md flex items-center gap-0.5">
                    <Sparkles size={8} />
                    <span>Cortesia</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action options menu trigger */}
          {canManage && (
            <div className="relative">
              <button 
                onClick={() => setShowOptions(!showOptions)}
                className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-50 border border-transparent rounded-xl transition flex items-center justify-center"
              >
                <MoreVertical size={16} />
              </button>

              <AnimatePresence>
                {showOptions && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowOptions(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 overflow-hidden"
                    >
                      <button 
                        onClick={() => {
                          onEdit();
                          setShowOptions(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition text-left"
                      >
                        <Edit2 size={13} className="text-slate-400" />
                        <span>Editar Serviço</span>
                      </button>
                      <button 
                        onClick={() => {
                          onToggleStatus();
                          setShowOptions(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-slate-500 hover:bg-slate-50 hover:text-emerald-500 transition text-left border-y border-slate-100"
                      >
                        {service.active ? (
                          <>
                            <XCircle size={13} className="text-red-400" />
                            <span className="text-red-600">Desativar</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            <span className="text-emerald-600">Ativar</span>
                          </>
                        )}
                      </button>
                      <button 
                        onClick={() => {
                          onDelete();
                          setShowOptions(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-xs uppercase font-black text-red-650 hover:bg-red-50 transition text-left"
                      >
                        <Trash2 size={13} className="text-red-400" />
                        <span>Excluir</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Description body */}
        <p className="text-slate-500 text-xs min-h-[44px] font-semibold leading-relaxed mb-6 line-clamp-3">
          {descricao || 'Nenhuma descrição detalhada cadastrada para este item.'}
        </p>
      </div>

      {/* Footer Parameters */}
      <div className="grid grid-cols-2 gap-3.5 pt-4 border-t border-slate-100 bg-slate-50/40 p-4 -mx-6 -mb-6 rounded-b-[2.5rem] divide-x divide-slate-250/20">
        <div className="space-y-1 pl-2">
          <div className="flex items-center gap-1 text-slate-400 font-black uppercase text-[8px] tracking-wider">
            <Clock size={11} />
            <span>Tempo Estimado</span>
          </div>
          <p className="text-xs font-black text-primary">{duracao} min</p>
        </div>
        <div className="space-y-1 pl-4">
          <div className="flex items-center gap-1 text-emerald-600 font-black uppercase text-[8px] tracking-wider">
            <DollarSign size={11} />
            <span>Preço Base</span>
          </div>
          <p className="text-xs font-black text-emerald-600">
            R$ {preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {!service.active && (
        <div className="absolute top-5 right-12 bg-red-500 text-white text-[8px] font-black uppercase px-2.5 py-1 rounded-full shadow-sm tracking-widest border border-red-400">
          Suspenso
        </div>
      )}
    </motion.div>
  );
}

// PREMIUM TABBED SERVICE MODAL WITH BEAUTIFUL COMMISSION OVERRIDES LIST
interface ServiceModalProps {
  service: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
}

function ServiceModal({ service, categories, onClose }: ServiceModalProps) {
  const [activeTab, setActiveTab] = useState<'dados' | 'comissao'>('dados');
  const [permiteCortesia, setPermiteCortesia] = useState(service?.permite_cortesia || false);
  const [showInPortal, setShowInPortal] = useState(service?.showInPortal ?? true);
  const [tipoComissao, setTipoComissao] = useState<'padrao' | 'percentual' | 'fixo'>(service?.tipo_comissao || 'padrao');
  const [valorComissao, setValorComissao] = useState<number>(service?.valor_comissao || 0);

  const [professionals, setProfessionals] = useState<UserProfile[]>([]);
  const [comissoesPorProfissional, setComissoesPorProfissional] = useState<Record<string, { tipo: 'padrao' | 'percentual' | 'fixo'; valor: number }>>(
    service?.comissoes_por_profissional || {}
  );
  const [barbeirosIds, setBarbeirosIds] = useState<string[]>(service?.barbeiros_ids || []);
  const hasInitializedBarbeiros = React.useRef(false);

  // Sync state helpers
  const [nome, setNome] = useState(service?.nome || service?.name || '');
  const [descricao, setDescricao] = useState(service?.descricao || service?.description || '');
  const [duracao_minutos, setDuracaoMinutos] = useState(service?.duracao_minutos || service?.duration || 30);
  const [preco, setPreco] = useState(service?.preco ?? service?.price ?? 35);
  const [categoria, setCategoria] = useState(service?.categoria || service?.category || '');

  // Real-time live synchronization of available professionals
  useEffect(() => {
    // Only fetch active query for barbers to avoid matching client users
    const qProf = query(collection(db, 'usuarios'), orderBy('nome', 'asc'));
    const unsubscribeProf = onSnapshot(qProf, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      // Show only active barbers/managers
      const barbersOnly = docs.filter(u => (u.tipo === 'barbeiro' || u.tipo === 'gerente') && u.ativo !== false);
      setProfessionals(barbersOnly);

      // Default to all active barbers if service is new or has no saved barbeiros_ids yet
      if (!hasInitializedBarbeiros.current) {
        if (!service || !service.barbeiros_ids) {
          setBarbeirosIds(barbersOnly.map(b => b.uid));
        }
        hasInitializedBarbeiros.current = true;
      }
    }, (error) => {
      console.error("Erro ao carregar profissionais:", error);
    });

    return () => unsubscribeProf();
  }, [service]);

  // Establish fallback category if empty
  useEffect(() => {
    if (!categoria && categories.length > 0) {
      setCategoria(categories[0].name);
    }
  }, [categories, categoria]);

  const { execute: handleSubmit, isLoading: isSaving } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("O nome do serviço é obrigatório.");
      return;
    }
    
    if (preco < 0 || duracao_minutos <= 0) {
      toast.error("Insira taxas positivas corretas.");
      return;
    }

    const payload = {
      nome: nome.trim(),
      name: nome.trim(),
      descricao: descricao.trim(),
      description: descricao.trim(),
      duracao_minutos: Number(duracao_minutos),
      duration: Number(duracao_minutos),
      preco: Number(preco),
      price: Number(preco),
      categoria,
      category: categoria,
      permite_cortesia: permiteCortesia,
      tipo_comissao: tipoComissao,
      valor_comissao: tipoComissao === 'padrao' ? 0 : valorComissao,
      comissoes_por_profissional: comissoesPorProfissional,
      barbeiros_ids: barbeirosIds,
      showInPortal,
      active: service ? service.active : true
    };

    try {
      if (service) {
        await serviceService.updateService(service.id, payload);
        toast.success(`Serviço "${nome}" atualizado em tempo real!`);
      } else {
        await serviceService.createService(payload);
        toast.success(`Serviço "${nome}" cadastrado com sucesso!`);
      }
      onClose();
    } catch (error) {
      console.error("Erro ao salvar serviço em tempo real:", error);
      toast.error("Ocorreu um erro ao salvar configurações.");
    }
  });

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
              {service ? 'Configurar Serviço do Catálogo' : 'Adicionar Novo Serviço'}
            </h2>
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5 text-slate-500">
              {service ? `Ajustando chaves e regras para ${service.nome || service.name}` : 'Desenvolva de forma completa as regras do serviço'}
            </p>
          </div>
          <button onClick={onClose} className="p-2.5 text-slate-450 hover:text-primary hover:bg-slate-100/60 rounded-xl transition">
            <X size={18} />
          </button>
        </div>

        {/* Segmented Form Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/20">
          <button
            type="button"
            onClick={() => setActiveTab('dados')}
            className={`flex-1 py-3 text-xs uppercase font-black tracking-widest text-center border-b-2 transition ${
              activeTab === 'dados' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-450 hover:text-slate-700 hover:bg-slate-50/40'
            }`}
          >
            📋 1. Informações Básicas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('comissao')}
            className={`flex-1 py-3 text-xs uppercase font-black tracking-widest text-center border-b-2 transition ${
              activeTab === 'comissao' 
                ? 'border-indigo-600 text-indigo-600 bg-white' 
                : 'border-transparent text-slate-450 hover:text-slate-700 hover:bg-slate-50/40'
            }`}
          >
            💰 2. Regras de Comissão / Taxas
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 min-h-[320px] max-h-[58vh]">
            
            {/* TAB 1: BASIC INFORMATION DATA */}
            {activeTab === 'dados' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome do Serviço</label>
                    <input 
                      required
                      type="text" 
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                      placeholder="Ex: Corte Degradê Navalhado"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Descrição Comercial</label>
                    <textarea 
                      value={descricao}
                      onChange={e => setDescricao(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition min-h-[85px] resize-none"
                      placeholder="Descreva detalhes ou as etapas inclusas neste serviço..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Duração (Minutos)</label>
                    <div className="relative">
                      <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        required
                        type="number"
                        min="5"
                        step="5"
                        value={duracao_minutos === 0 ? '' : duracao_minutos}
                        onFocus={(e) => e.target.select()}
                        onChange={e => setDuracaoMinutos(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-sm font-semibold text-primary outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Preço Base (R$)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600" size={16} />
                      <input 
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={preco === 0 ? '' : preco}
                        onFocus={(e) => e.target.select()}
                        onChange={e => setPreco(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 pl-11 pr-4 text-sm font-bold text-primary outline-none transition"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Categoria Vinculada</label>
                    <select 
                      value={categoria}
                      onChange={e => setCategoria(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-semibold text-primary outline-none cursor-pointer focus:bg-white focus:ring-4 focus:ring-indigo-50"
                    >
                      {categories.map((cat, index) => (
                        <option key={`cat-sel-${cat.id || index}-${index}`} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Permitir como Cortesia?</label>
                    <button
                      type="button"
                      onClick={() => setPermiteCortesia(!permiteCortesia)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                        permiteCortesia 
                          ? 'bg-amber-50 border-amber-200 text-amber-700' 
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wider">Permitido</span>
                      <div className={`w-10 h-5 rounded-full relative transition-all ${permiteCortesia ? 'bg-amber-500' : 'bg-slate-350'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${permiteCortesia ? 'left-5.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Disponível no Portal do Cliente?</label>
                    <button
                      type="button"
                      onClick={() => setShowInPortal(!showInPortal)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                        showInPortal 
                          ? 'bg-emerald-50 border-emerald-250 text-emerald-700' 
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      <span className="text-xs font-black uppercase tracking-wider">{showInPortal ? 'Exibido' : 'Oculto'}</span>
                      <div className={`w-10 h-5 rounded-full relative transition-all ${showInPortal ? 'bg-emerald-500' : 'bg-slate-350'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${showInPortal ? 'left-5.5' : 'left-0.5'}`} />
                      </div>
                    </button>
                  </div>

                  <div className="sm:col-span-2 space-y-3 bg-slate-50 p-4.5 rounded-3xl border border-slate-100">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1 flex items-center gap-1">
                        👥 Profissionais que Realizam este Serviço
                      </label>
                      <p className="text-[9px] text-slate-450 italic font-bold uppercase tracking-wider mt-0.5 ml-1">
                        Marque apenas os barbeiros ativos que fazem este trabalho específico na escala.
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                      {professionals.map((prof) => {
                        const isChecked = barbeirosIds.includes(prof.uid);
                        return (
                          <button
                            key={`link-barber-${prof.uid}`}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setBarbeirosIds(barbeirosIds.filter(id => id !== prof.uid));
                              } else {
                                setBarbeirosIds([...barbeirosIds, prof.uid]);
                              }
                            }}
                            className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-900 font-extrabold'
                                : 'bg-white border-slate-100 text-slate-550 hover:bg-slate-50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                              isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                            }`}>
                              {isChecked && <Check size={11} strokeWidth={3} />}
                            </div>
                            <div>
                              <p className="text-xs leading-none">{prof.nome || prof.name}</p>
                              <span className="text-[8px] font-black uppercase text-slate-450 mt-1 block leading-none">
                                {prof.ativo !== false ? '● ATIVO NA ESCALA' : '○ INATIVO'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: RULES AND SPECIFIC COMMISSIONS OVERRIDES */}
            {activeTab === 'comissao' && (
              <div className="space-y-6">
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4.5 space-y-4">
                  <h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-250/20 pb-2.5">
                    <Settings2 size={14} className="text-indigo-650" />
                    <span>Regra Geral de Comissão</span>
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider">Tipo Base de Apuração</label>
                      <select 
                        value={tipoComissao}
                        onChange={(e) => setTipoComissao(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs font-bold text-primary cursor-pointer outline-none transition"
                      >
                        <option value="padrao">Comissão Padrão do Cadastro</option>
                        <option value="percentual">Percentual Fixo (%)</option>
                        <option value="fixo">Dinheiro / Valor Fixo (R$)</option>
                      </select>
                    </div>

                    {tipoComissao !== 'padrao' && (
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-550 uppercase tracking-wider">
                          {tipoComissao === 'percentual' ? 'Taxa Porcentual (%)' : 'Taxa Dinheiro (R$)'}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                            {tipoComissao === 'percentual' ? '%' : 'R$'}
                          </span>
                          <input 
                            type="number"
                            required
                            min="0"
                            step={tipoComissao === 'percentual' ? '1' : '0.01'}
                            value={valorComissao === 0 ? '' : valorComissao}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setValorComissao(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-3.5 text-xs font-black text-primary outline-none"
                            placeholder={tipoComissao === 'percentual' ? 'Ex: 55' : 'Ex: 27.50'}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-450 italic font-medium leading-relaxed bg-white p-3 rounded-2xl border border-slate-200/40">
                    💡 {tipoComissao === 'padrao' && 'Será considerada a comissão individual preenchida na aba Equipe/Barbeiros para cada respectivo faturamento.'}
                    {tipoComissao === 'percentual' && `Neste serviço o profissional receberá exatamente ${valorComissao}% de comissão fixa, sobrepondo o valor padrão de seu cadastro.`}
                    {tipoComissao === 'fixo' && `Neste serviço o profissional receberá exatamente R$ ${valorComissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de comissão fixa, independente do valor final do serviço.`}
                  </p>
                </div>

                {/* Overrides Subpanel for custom individual staff rules */}
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-4.5 space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-250/20 pb-2">
                      <Award size={14} className="text-emerald-500" />
                      <span>Exceções Individuais por Profissional</span>
                    </h4>
                    <p className="text-[9px] text-slate-450 italic font-bold uppercase tracking-wider mt-1.5">
                      Personalize regras especiais de faturamento se houver aprendizes ou seniores com taxas diferenciadas.
                    </p>
                  </div>

                  <div className="space-y-2 max-h-[190px] overflow-y-auto pr-1">
                    {professionals.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center italic py-2 font-bold select-none">Nenhum profissional listado.</p>
                    ) : (
                      professionals.map((prof, index) => {
                        const override = comissoesPorProfissional[prof.uid] || { tipo: 'padrao', valor: 0 };
                        
                        const getInitials = (n: string) => n.split(' ').map(p => p.charAt(0)).slice(0, 2).join('').toUpperCase();

                        return (
                          <div 
                            key={`prof-override-${prof.uid || index}-${index}`} 
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 transition-all"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-slate-150 text-indigo-650 flex items-center justify-center font-black text-xs uppercase border border-slate-200/50">
                                {getInitials(prof.nome || prof.name || '')}
                              </div>
                              <div>
                                <p className="text-xs font-extrabold text-primary leading-tight">{prof.nome || prof.name}</p>
                                <p className="text-[8px] font-black uppercase text-slate-400 mt-0.5 leading-none">
                                  Meta: R$ {prof.meta_mensal || prof.monthly_goal || 0} | Cadastro: {prof.percentual_comissao || prof.commission_percentage || 0}%
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                              <select 
                                value={override.tipo}
                                onChange={(e) => {
                                  const nt = e.target.value as any;
                                  setComissoesPorProfissional({
                                    ...comissoesPorProfissional,
                                    [prof.uid]: { tipo: nt, valor: nt === 'padrao' ? 0 : override.valor }
                                  });
                                }}
                                className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-3 text-[10px] font-bold text-slate-600 outline-none cursor-pointer hover:border-slate-350 transition-colors"
                              >
                                <option value="padrao">Regra Geral</option>
                                <option value="percentual">Fixo (%)</option>
                                <option value="fixo">Fixo (R$)</option>
                              </select>

                              {override.tipo !== 'padrao' && (
                                <div className="relative w-20 shrink-0">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-slate-400">
                                    {override.tipo === 'percentual' ? '%' : 'R$'}
                                  </span>
                                  <input 
                                    type="number"
                                    required
                                    min="0"
                                    step={override.tipo === 'percentual' ? '1' : '0.01'}
                                    value={override.valor === 0 ? '' : override.valor}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      setComissoesPorProfissional({
                                        ...comissoesPorProfissional,
                                        [prof.uid]: { tipo: override.tipo, valor: e.target.value === '' ? '' : Number(e.target.value) }
                                      });
                                    }}
                                    placeholder={override.tipo === 'percentual' ? '50' : '20.00'}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 pl-5.5 pr-1 text-[10px] font-black text-primary outline-none"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
            
          </div>

          {/* Modal action buttons */}
          <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-4 mt-auto">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 border border-slate-250 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-600 bg-white hover:bg-slate-50 active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="flex-[2] py-3.5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition shadow-md shadow-slate-900/15 flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="animate-spin animate-pulse" size={16} /> : <Check size={16} />}
              <span>{isSaving ? 'Gravando...' : service ? 'Salvar Configurações' : 'Gravar no Catálogo'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// PREMIUM CATEGORY SCALE EDITOR
interface CategoryModalProps {
  categories: ServiceCategory[];
  onClose: () => void;
}

function CategoryModal({ categories, onClose }: CategoryModalProps) {
  const [newCategory, setNewCategory] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { execute: handleAdd, isLoading: loading } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    
    try {
      await serviceService.createCategory(newCategory.trim(), categories.length);
      setNewCategory('');
      toast.success(`Categoria "${newCategory.trim()}" criada com sucesso!`);
    } catch (error) {
      console.error("Erro ao catalogar categoria:", error);
      toast.error("Ocorreu um erro ao criar categoria.");
    }
  });

  const handleDeleteCategory = async (id: string) => {
    try {
      await serviceService.deleteCategory(id);
      toast.success("Categoria removida com sucesso. Serviços vinculados continuam seguros.");
      setConfirmDeleteId(null);
    } catch (error) {
      console.error("Erro ao deletar categoria:", error);
      toast.error("Não foi possível remover a categoria.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-md font-black uppercase text-primary tracking-tight">Gerenciar Categorias</h2>
            <p className="text-[10px] text-muted font-bold uppercase tracking-wider text-slate-500 mt-0.5">Defina grupos para segmentar o painel rápido</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-450 hover:text-primary transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <form onSubmit={handleAdd} className="flex gap-2">
            <input 
              type="text"
              placeholder="Digite nova categoria..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm font-semibold outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 transition-all text-primary"
            />
            <button 
              type="submit"
              disabled={loading || !newCategory.trim()}
              className="bg-primary text-white p-3.5 rounded-xl hover:bg-slate-800 transition disabled:opacity-50 active:scale-95 flex items-center justify-center shadow-md shadow-slate-900/10 shrink-0"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            </button>
          </form>

          <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
            {categories.map((cat, index) => (
              <div 
                key={`cat-list-${cat.id || index}-${index}`} 
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl group hover:border-slate-200 transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  <span className="text-sm font-bold text-slate-700">{cat.name}</span>
                </div>
                <button 
                  onClick={() => setConfirmDeleteId(cat.id)}
                  className="p-1 px-1.5 bg-white border text-red-500 rounded-lg hover:bg-red-50 border-slate-150-f100 transition-colors opacity-0 group-hover:opacity-100"
                  title="remover categoria"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <ConfirmationModal
          isOpen={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => confirmDeleteId && handleDeleteCategory(confirmDeleteId)}
          title="Excluir Categoria"
          description="Tem certeza que deseja apagar esta categoria? Os serviços vinculados de forma direta a ela não serão apagados, mas voltarão para a categoria geral por segurança."
          variant="danger"
          confirmLabel="Excluir"
        />
      </motion.div>
    </div>
  );
}
