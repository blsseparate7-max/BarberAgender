import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  Edit3, 
  X, 
  Sparkles, 
  Percent, 
  Check, 
  TrendingUp, 
  Package, 
  Scissors,
  CheckCircle2,
  HelpCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { comboService } from '../services/comboService';
import { serviceService } from '../services/serviceService';
import { inventoryService } from '../services/inventoryService';
import { Combo, Service, Product } from '../types';
import { toast } from 'sonner';

export function Combos() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCombo, setEditingCombo] = useState<Combo | null>(null);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [showInPortal, setShowInPortal] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [combosData, servicesData, productsData] = await Promise.all([
        comboService.getCombos(false),
        serviceService.getServices(true),
        inventoryService.getProducts()
      ]);
      setCombos(combosData);
      setServices(servicesData);
      setProducts(productsData);
    } catch (error) {
      console.error("Erro ao carregar dados dos combos:", error);
      toast.error("Ocorreu um erro ao buscar dados no servidor.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingCombo(null);
    setNome('');
    setDescricao('');
    setPreco('');
    setSelectedServices([]);
    setSelectedProducts([]);
    setActive(true);
    setShowInPortal(true);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (combo: Combo) => {
    setEditingCombo(combo);
    setNome(combo.nome);
    setDescricao(combo.descricao || '');
    setPreco(combo.preco.toString());
    setSelectedServices(combo.servicos_ids || []);
    setSelectedProducts(combo.produtos_ids || []);
    setActive(combo.active);
    setShowInPortal(combo.showInPortal ?? true);
    setIsFormOpen(true);
  };

  const handleToggleService = (serviceId: string) => {
    setSelectedServices(prev => 
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleToggleProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // Calculate sum of original values of selected services and products
  const getOriginalTotal = () => {
    let total = 0;
    selectedServices.forEach(srvId => {
      const srv = services.find(s => s.id === srvId);
      if (srv) {
        total += srv.preco || srv.price || 0;
      }
    });
    selectedProducts.forEach(prodId => {
      const prod = products.find(p => p.id === prodId);
      if (prod) {
        total += prod.price || 0;
      }
    });
    return total;
  };

  const originalTotal = getOriginalTotal();
  const comboPrecoNum = parseFloat(preco) || 0;
  const savings = originalTotal > comboPrecoNum ? originalTotal - comboPrecoNum : 0;
  const discountPct = originalTotal > 0 ? Math.round((savings / originalTotal) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("O nome do combo é obrigatório.");
      return;
    }
    if (selectedServices.length === 0 && selectedProducts.length === 0) {
      toast.error("Selecione ao menos um serviço ou produto para compor o combo.");
      return;
    }
    if (comboPrecoNum <= 0) {
      toast.error("Defina um preço promocional válido para o combo.");
      return;
    }

    setSaving(true);
    const payload: Partial<Combo> = {
      nome: nome.trim(),
      descricao: descricao.trim(),
      preco: comboPrecoNum,
      servicos_ids: selectedServices,
      produtos_ids: selectedProducts,
      active,
      showInPortal
    };

    try {
      if (editingCombo) {
        await comboService.updateCombo(editingCombo.id, payload);
        toast.success("Combo atualizado com sucesso!");
      } else {
        await comboService.createCombo(payload);
        toast.success("Combo criado com sucesso!");
      }
      setIsFormOpen(false);
      fetchInitialData();
    } catch (error) {
      console.error("Erro ao salvar combo:", error);
      toast.error("Não foi possível salvar o combo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Tem certeza que deseja excluir o combo "${name}"?`)) {
      try {
        await comboService.deleteCombo(id);
        toast.success("Combo excluído com sucesso.");
        fetchInitialData();
      } catch (error) {
        console.error("Erro ao deletar combo:", error);
        toast.error("Não foi possível excluir o combo.");
      }
    }
  };

  const filteredCombos = combos.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.descricao && c.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent w-10 h-10" />
        <p className="text-muted text-xs font-bold uppercase tracking-widest">Carregando Combos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary">Gestão de Combos & Combinações</h1>
          <p className="text-muted text-sm font-medium mt-1">
            Crie ofertas agressivas unindo múltiplos serviços e produtos com preços promocionais inteligentes.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="bg-accent hover:bg-accent/90 text-white font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-2xl flex items-center gap-2 shadow-lg shadow-accent/20 active:scale-95 transition"
        >
          <Plus size={16} />
          <span>Novo Combo</span>
        </button>
      </header>

      {/* Stats/Overview strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Sparkles size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-muted tracking-wide">Combos Cadastrados</p>
            <h3 className="text-2xl font-black text-primary">{combos.length}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-muted tracking-wide">Combos Ativos</p>
            <h3 className="text-2xl font-black text-primary">{combos.filter(c => c.active).length}</h3>
          </div>
        </div>
        <div className="bg-white border border-slate-200 p-6 rounded-3xl flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
            <Percent size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-muted tracking-wide">Desconto Médio Praticado</p>
            <h3 className="text-2xl font-black text-primary">
              {combos.length > 0 
                ? `${Math.round(combos.reduce((acc, c) => {
                    // Calculate individual discount
                    let orig = 0;
                    c.servicos_ids.forEach(sid => { const s = services.find(sv => sv.id === sid); if (s) orig += s.preco || s.price || 0; });
                    c.produtos_ids.forEach(pid => { const p = products.find(pd => pd.id === pid); if (p) orig += p.price || 0; });
                    const sav = orig > c.preco ? orig - c.preco : 0;
                    return acc + (orig > 0 ? (sav / orig) * 100 : 0);
                  }, 0) / combos.length)}%`
                : '0%'
              }
            </h3>
          </div>
        </div>
      </div>

      {/* Main layout with List */}
      <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-lg font-black uppercase tracking-wider text-slate-700">Pacotes e Ofertas Atuais</h2>
          <div className="w-full sm:w-80">
            <input 
              type="text"
              placeholder="Buscar combos..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary"
            />
          </div>
        </div>

        {filteredCombos.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-[2rem] italic text-muted">
            {searchTerm ? "Nenhum combo correspondente encontrado." : "Nenhum combo cadastrado até o momento. Clique em 'Novo Combo' para começar!"}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCombos.map(combo => {
              // Calculate details for this specific combo card
              let origPrice = 0;
              const detailsList: string[] = [];

              combo.servicos_ids.forEach(sid => {
                const s = services.find(sv => sv.id === sid);
                if (s) {
                  origPrice += s.preco || s.price || 0;
                  detailsList.push(`✂️ ${s.nome}`);
                }
              });

              combo.produtos_ids.forEach(pid => {
                const p = products.find(pd => pd.id === pid);
                if (p) {
                  origPrice += p.price || 0;
                  detailsList.push(`📦 ${p.name}`);
                }
              });

              const comboSavings = origPrice > combo.preco ? origPrice - combo.preco : 0;
              const comboDiscountPct = origPrice > 0 ? Math.round((comboSavings / origPrice) * 100) : 0;

              return (
                <div 
                  key={combo.id}
                  className={`border rounded-3xl p-6 transition-all flex flex-col justify-between hover:shadow-md ${
                    combo.active 
                      ? 'bg-white border-slate-200' 
                      : 'bg-slate-50/70 border-slate-200/50 opacity-75'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          combo.active 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {combo.active ? <Check size={10} /> : <X size={10} />}
                          <span>{combo.active ? 'Ativo' : 'Inativo'}</span>
                        </span>
                      </div>
                      {comboDiscountPct > 0 && (
                        <span className="bg-red-500 text-white font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full">
                          -{comboDiscountPct}% OFF
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-primary leading-tight">{combo.nome}</h3>
                      {combo.descricao && (
                        <p className="text-muted text-xs mt-1 font-medium leading-relaxed line-clamp-2">
                          {combo.descricao}
                        </p>
                      )}
                    </div>

                    {/* Items involved in this combo */}
                    <div className="bg-slate-50 p-3.5 rounded-2xl space-y-1.5">
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Itens inclusos:</p>
                      <ul className="space-y-1">
                        {detailsList.map((itemStr, index) => (
                          <li key={index} className="text-xs font-bold text-slate-700 truncate">
                            {itemStr}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Pricing and Action row */}
                  <div className="pt-5 border-t border-slate-100 mt-5 flex justify-between items-end">
                    <div>
                      {comboSavings > 0 && (
                        <p className="text-[10px] text-slate-400 font-bold line-through">
                          De R$ {origPrice.toFixed(2)}
                        </p>
                      )}
                      <p className="text-xl font-black text-primary">
                        R$ {combo.preco.toFixed(2)}
                      </p>
                      {comboSavings > 0 && (
                        <p className="text-[9px] text-emerald-600 font-bold mt-0.5">
                          Economia de R$ {comboSavings.toFixed(2)}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(combo)}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 transition"
                        title="Editar combo"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(combo.id, combo.nome)}
                        className="p-2.5 bg-rose-50 hover:bg-rose-100 rounded-xl text-rose-600 transition"
                        title="Excluir combo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FORM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-primary">
                  {editingCombo ? "Editar Combo Promocional" : "Novo Combo Promocional"}
                </h3>
                <p className="text-xs text-muted font-bold">Configure serviços, produtos e defina a taxa de desconto.</p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">Nome Comercial do Combo</label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Combo Cabelo, Barba & Pomada"
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-xl shadow-sm transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">Status</label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 border p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActive(true)}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg transition flex items-center justify-center gap-1.5 ${
                        active ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Eye size={12} />
                      <span>Ativo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActive(false)}
                      className={`py-2 text-[10px] font-black uppercase rounded-lg transition flex items-center justify-center gap-1.5 ${
                        !active ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <EyeOff size={12} />
                      <span>Inativo</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-muted font-black uppercase tracking-wider block">Descrição Comercial (Curta)</label>
                <input
                  type="text"
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  placeholder="Ex: O corte de cabelo clássico, modelagem da barba e leve uma pomada modeladora de brinde."
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-xl shadow-sm transition"
                />
              </div>

              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div>
                  <h5 className="text-xs font-bold text-primary uppercase tracking-wider">Disponível no Portal do Cliente</h5>
                  <p className="text-[9px] text-slate-450 font-bold uppercase tracking-widest mt-0.5">Exibir este pacote/combo para compra no portal do cliente</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInPortal(!showInPortal)}
                  className={`w-12 h-6 rounded-full transition relative shrink-0 ${showInPortal ? 'bg-emerald-600' : 'bg-slate-350'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition shadow-md ${showInPortal ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              {/* Composition Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Services List Column */}
                <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-indigo-600 pb-2 border-b border-slate-100">
                    <Scissors size={16} />
                    <h4 className="text-xs font-black uppercase tracking-wider">Incluir Serviços</h4>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                    {services.length === 0 ? (
                      <p className="text-[11px] text-muted italic font-medium">Nenhum serviço disponível.</p>
                    ) : (
                      services.map(srv => (
                        <label 
                          key={srv.id} 
                          className="flex items-center justify-between p-2.5 bg-white border rounded-xl hover:bg-slate-50 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={selectedServices.includes(srv.id)}
                              onChange={() => handleToggleService(srv.id)}
                              className="accent-primary rounded"
                            />
                            <div className="text-[11px] font-bold text-primary max-w-[150px] truncate">
                              {srv.nome}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-slate-500">
                            R$ {(srv.preco || srv.price || 0).toFixed(2)}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Products List Column */}
                <div className="border border-slate-100 p-4 rounded-2xl bg-slate-50/50 space-y-3">
                  <div className="flex items-center gap-2 text-amber-600 pb-2 border-b border-slate-100">
                    <Package size={16} />
                    <h4 className="text-xs font-black uppercase tracking-wider">Incluir Produtos</h4>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                    {products.length === 0 ? (
                      <p className="text-[11px] text-muted italic font-medium">Nenhum produto em estoque.</p>
                    ) : (
                      products.map(prod => (
                        <label 
                          key={prod.id} 
                          className="flex items-center justify-between p-2.5 bg-white border rounded-xl hover:bg-slate-50 cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={selectedProducts.includes(prod.id)}
                              onChange={() => handleToggleProduct(prod.id)}
                              className="accent-primary rounded"
                            />
                            <div className="text-[11px] font-bold text-primary max-w-[150px] truncate">
                              {prod.name}
                            </div>
                          </div>
                          <span className="text-[10px] font-black text-slate-500">
                            R$ {(prod.price || 0).toFixed(2)}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic calculations & pricing inputs */}
              <div className="bg-slate-100/80 border p-5 rounded-3xl space-y-4">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                  <span>Valor Original Somado:</span>
                  <span className="text-sm font-black text-slate-700">R$ {originalTotal.toFixed(2)}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">Preço Promocional do Combo (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={preco}
                      onChange={e => setPreco(e.target.value)}
                      placeholder="Ex: 85.00"
                      className="w-full p-3 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-black rounded-xl shadow-sm transition"
                    />
                  </div>

                  {/* Calculations Preview widget */}
                  <div className="bg-white border rounded-2xl p-3 flex flex-col justify-center items-center h-[76px] shadow-sm">
                    {discountPct > 0 ? (
                      <>
                        <div className="flex items-center gap-1 text-emerald-600 font-black text-sm">
                          <TrendingUp size={16} />
                          <span>{discountPct}% de Economia!</span>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold mt-0.5">
                          Desconto de R$ {savings.toFixed(2)} para o cliente
                        </p>
                      </>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-bold italic text-center leading-relaxed">
                        Defina o valor promocional menor que o total original para calcular economia.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Form submit/cancel */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-6 py-3 border border-slate-200 text-slate-500 hover:text-slate-800 text-xs font-black uppercase tracking-widest rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest px-8 py-3 rounded-xl flex items-center gap-2 shadow-md shadow-emerald-500/10 transition active:scale-95 disabled:opacity-50"
                >
                  {saving && <Loader2 className="animate-spin w-3 h-3" />}
                  <span>{editingCombo ? "Salvar Alterações" : "Criar Combo"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
