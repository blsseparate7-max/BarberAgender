
import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Edit2, 
  Trash2, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ShoppingCart, 
  UserMinus, 
  BarChart3, 
  ChevronRight,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Tag,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { inventoryService } from '../services/inventoryService';
import { Product, ProductCategory, InventoryMovement, MovementType, ProductType } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function Estoque() {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'movements' | 'categories'>('products');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [movementType, setMovementType] = useState<MovementType>('entrada');

  // Categories Tab state
  const [categoryInput, setCategoryInput] = useState('');
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);

  // Custom Alert / Confirm Modal States
  const [alertModal, setAlertModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'error' | 'warning' | 'success';
  } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Real-time synchronization
  useEffect(() => {
    setLoading(true);
    let loadedProducts = false;
    let loadedCategories = false;
    let loadedMovements = false;
    let loadedSuppliers = false;

    const checkLoading = () => {
      if (loadedProducts && loadedCategories && loadedMovements && loadedSuppliers) {
        setLoading(false);
      }
    };

    // 1. Subscribe to Products
    const qProducts = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(data);
      loadedProducts = true;
      checkLoading();
    }, (error) => {
      console.error("Erro ao assinar produtos:", error);
      loadedProducts = true;
      checkLoading();
    });

    // 2. Subscribe to Categories
    const qCategories = query(collection(db, 'product_categories'), orderBy('name', 'asc'));
    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductCategory));
      setCategories(data);
      loadedCategories = true;
      checkLoading();
    }, (error) => {
      console.error("Erro ao assinar categorias:", error);
      loadedCategories = true;
      checkLoading();
    });

    // 3. Subscribe to Movements
    const qMovements = query(collection(db, 'inventory_movements'), orderBy('date', 'desc'), orderBy('createdAt', 'desc'));
    const unsubscribeMovements = onSnapshot(qMovements, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryMovement));
      setMovements(data);
      loadedMovements = true;
      checkLoading();
    }, (error) => {
      console.error("Erro ao assinar movimentações:", error);
      loadedMovements = true;
      checkLoading();
    });

    // 4. Subscribe to Suppliers (Fornecedores)
    const qSuppliers = query(collection(db, 'tipos_fornecedores'), orderBy('name', 'asc'));
    const unsubscribeSuppliers = onSnapshot(qSuppliers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSuppliers(data);
      loadedSuppliers = true;
      checkLoading();
    }, (error) => {
      console.error("Erro ao assinar fornecedores:", error);
      loadedSuppliers = true;
      checkLoading();
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
      unsubscribeMovements();
      unsubscribeSuppliers();
    };
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.categoria_id === filterCategory;
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const lowStockProducts = products.filter(p => p.currentStock <= p.minStock && p.status === 'active');

  const { execute: handleSaveProduct, isLoading: isSavingProduct } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const fornecedorId = formData.get('fornecedorId') as string;
    const productData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      categoria_id: formData.get('categoryId') as string,
      categoryName: categories.find(c => c.id === formData.get('categoryId'))?.name || '',
      costPrice: Number(formData.get('costPrice')),
      salePrice: Number(formData.get('salePrice')),
      currentStock: Number(formData.get('currentStock')),
      minStock: Number(formData.get('minStock')),
      type: formData.get('type') as ProductType,
      status: formData.get('status') as 'active' | 'inactive',
      fornecedor_id: fornecedorId || '',
      fornecedor_name: suppliers.find(s => s.id === fornecedorId)?.name || '',
    };

    try {
      if (editingProduct) {
        await inventoryService.updateProduct(editingProduct.id, productData);
      } else {
        await inventoryService.createProduct(productData);
      }
      setShowProductModal(false);
      setEditingProduct(null);
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
    }
  });

  const { execute: handleRegisterMovement, isLoading: isRegisteringMovement } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct || !user || !profile) return;

    const formData = new FormData(e.currentTarget);
    const quantity = Number(formData.get('quantity'));
    const reason = formData.get('reason') as string;
    const amount = Number(formData.get('amount'));
    const paymentMethod = formData.get('paymentMethod') as string;

    try {
      const financialData = (movementType === 'venda' || movementType === 'emerald' || movementType === 'entrada') && amount > 0 ? {
        amount,
        paymentMethod: paymentMethod || 'dinheiro',
        category: movementType === 'venda' ? 'Venda de Produtos' : 'Compra de Produtos'
      } : undefined;

      await inventoryService.registerMovement({
        produto_id: selectedProduct.id,
        productName: selectedProduct.name,
        type: movementType,
        quantity,
        reason,
        profissional_id: user.uid,
        profissional_name: profile.displayName,
        date: format(new Date(), 'yyyy-MM-dd')
      }, financialData);
      setShowMovementModal(false);
      setSelectedProduct(null);
    } catch (error: any) {
      console.error("Erro ao registrar movimentação:", error);
    }
  });

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryInput.trim()) return;

    try {
      if (editingCategory) {
        await inventoryService.updateCategory(editingCategory.id, categoryInput.trim());
        setEditingCategory(null);
      } else {
        await inventoryService.createCategory(categoryInput.trim());
      }
      setCategoryInput('');
    } catch (error) {
      console.error("Erro ao salvar categoria:", error);
    }
  };

  const confirmDeleteCategory = (category: ProductCategory) => {
    const usageCount = products.filter(p => p.categoria_id === category.id).length;
    if (usageCount > 0) {
      setAlertModal({
        show: true,
        title: 'Operação Bloqueada',
        message: `Não é possível excluir a categoria "${category.name}" porque existem ${usageCount} produto(s) associado(s) a ela. Altere ou exclua os produtos vinculados antes de tentar excluir a categoria.`,
        type: 'warning'
      });
      return;
    }

    setConfirmModal({
      show: true,
      title: 'Excluir Categoria?',
      message: `Tem certeza que deseja excluir permanentemente a categoria "${category.name}"? Esta ação não poderá ser desfeita.`,
      onConfirm: async () => {
        try {
          await inventoryService.deleteCategory(category.id);
        } catch (error) {
          console.error("Erro ao excluir categoria:", error);
        }
      }
    });
  };

  const confirmDeleteProduct = (product: Product) => {
    const productMovements = movements.filter(m => m.produto_id === product.id);
    
    if (productMovements.length > 0) {
      setConfirmModal({
        show: true,
        title: 'Excluir Produto com Histórico?',
        message: `Este produto possui ${productMovements.length} movimentação(ões) registrada(s) no estoque. Excluir o produto apagará o registro dele, mas a exclusão poderá deixar referências vazias no histórico de movimentações. Recomendamos desativar o produto (colocá-lo como Inativo). Deseja deletar permanentemente mesmo assim?`,
        onConfirm: async () => {
          try {
            await inventoryService.deleteProduct(product.id);
          } catch (error) {
            console.error("Erro ao excluir produto:", error);
          }
        }
      });
    } else {
      setConfirmModal({
        show: true,
        title: 'Excluir Produto?',
        message: `Você tem certeza que deseja excluir permanentemente o produto "${product.name}"? Esta ação não pode ser desfeita.`,
        onConfirm: async () => {
          try {
            await inventoryService.deleteProduct(product.id);
          } catch (error) {
            console.error("Erro ao excluir produto:", error);
          }
        }
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted font-medium animate-pulse tracking-widest uppercase text-xs">Gerenciando inventário...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary mb-1">Gestão de Estoque</h1>
          <p className="text-muted text-sm">Controle de insumos, produtos e movimentações.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => { setEditingProduct(null); setShowProductModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-sm active:scale-95"
          >
            <Plus size={18} />
            Novo Produto
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard 
          title="Total de Produtos" 
          value={products.length} 
          icon={<Package className="text-blue-500" />} 
          color="blue"
        />
        <SummaryCard 
          title="Estoque Baixo" 
          value={lowStockProducts.length} 
          icon={<AlertTriangle className="text-amber-500" />} 
          color="amber"
          alert={lowStockProducts.length > 0}
        />
        <SummaryCard 
          title="Valor em Estoque" 
          value={products.reduce((acc, p) => acc + (p.costPrice * p.currentStock), 0)} 
          icon={<BarChart3 className="text-emerald-500" />} 
          color="emerald"
          isCurrency
        />
        <SummaryCard 
          title="Movimentações (Mês)" 
          value={movements.length} 
          icon={<History className="text-slate-400" />} 
          color="zinc"
        />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100/50 border border-border rounded-2xl w-fit">
        <TabButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} label="Produtos" icon={<Package size={16} />} />
        <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} label="Movimentações" icon={<History size={16} />} />
        <TabButton active={activeTab === 'categories'} onClick={() => setActiveTab('categories')} label="Categorias" icon={<Tag size={16} />} />
      </div>

      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input 
                type="text" 
                placeholder="Buscar produto por nome..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-surface border border-border rounded-xl text-primary focus:outline-none focus:border-accent/50 transition-all shadow-sm font-medium"
              />
            </div>
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-3 bg-surface border border-border rounded-xl text-primary focus:outline-none focus:border-accent/50 transition-all text-sm font-bold shadow-sm appearance-none"
            >
              <option value="all">Todas Categorias</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-3 bg-surface border border-border rounded-xl text-primary focus:outline-none focus:border-accent/50 transition-all text-sm font-bold shadow-sm appearance-none"
            >
              <option value="all">Todos Status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProducts.map(product => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onEdit={() => { setEditingProduct(product); setShowProductModal(true); }}
                onMovement={(type) => { setSelectedProduct(product); setMovementType(type); setShowMovementModal(true); }}
                onDelete={() => confirmDeleteProduct(product)}
                isAdmin={isAdmin || isGerente}
              />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Data</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Produto</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Qtd</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Motivo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4 text-xs text-muted font-bold">{format(parseISO(m.date), 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-primary group-hover:text-accent transition-colors">{m.productName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg border ${
                        m.type === 'entrada' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        m.type === 'saida' ? 'bg-red-50 text-red-600 border-red-100' :
                        m.type === 'consumo_interno' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                        m.type === 'venda' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-slate-50 text-slate-600 border-slate-100'
                      }`}>
                        {m.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-primary">{m.quantity}</td>
                    <td className="px-6 py-4 text-xs text-slate-500 font-medium">{m.reason}</td>
                    <td className="px-6 py-4 text-xs text-muted font-bold">{m.profissional_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card to Create/Edit Category */}
          <div className="lg:col-span-1 bg-surface border border-border rounded-2xl p-6 space-y-6 h-fit shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                <Tag size={18} className="text-accent" />
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <p className="text-muted text-xs mt-1">
                {editingCategory ? 'Altere o nome da categoria selecionada.' : 'Cadastre uma nova categoria para os seus produtos.'}
              </p>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Nome da Categoria</label>
                <input 
                  type="text"
                  name="categoryName"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  placeholder="Ex: Shampoos, Ceras, Pomadas..."
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium text-sm"
                />
              </div>
              <div className="flex gap-2 pt-2">
                {editingCategory && (
                  <button 
                    type="button" 
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryInput('');
                    }}
                    className="flex-1 py-3 border border-border text-muted rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                )}
                <button 
                  type="submit" 
                  className="flex-1 py-3 bg-primary hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                >
                  {editingCategory ? 'Mudar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>

          {/* List of Categories */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-border">
              <h2 className="text-lg font-bold text-primary">Categorias Cadastradas</h2>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-widest px-2.5 py-1 rounded-full">
                {categories.length} {categories.length === 1 ? 'Categoria' : 'Categorias'}
              </span>
            </div>
            {categories.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
                <Tag size={40} className="text-slate-300 animate-pulse" />
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Nenhuma categoria cadastrada</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {categories.map((cat) => {
                  const productCount = products.filter(p => p.categoria_id === cat.id).length;
                  return (
                    <div key={cat.id} className="flex items-center justify-between py-4 group hover:bg-slate-50/30 px-2 -mx-2 rounded-xl transition-all">
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800 text-sm group-hover:text-accent transition-colors">{cat.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          {productCount} {productCount === 1 ? 'produto associado' : 'produtos associados'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => {
                            setEditingCategory(cat);
                            setCategoryInput(cat.name);
                          }}
                          className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-705 transition-all w-8 h-8 flex items-center justify-center"
                          title="Editar Nome"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => confirmDeleteCategory(cat)}
                          className="p-2 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 transition-all w-8 h-8 flex items-center justify-center"
                          title="Excluir Categoria"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showProductModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
                <h2 className="text-xl font-bold text-primary">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
                <button onClick={() => setShowProductModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-muted transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleSaveProduct} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Nome do Produto</label>
                    <input name="name" defaultValue={editingProduct?.name} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Categoria</label>
                    <select name="categoryId" defaultValue={editingProduct?.categoria_id} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Descrição</label>
                    <textarea name="description" defaultValue={editingProduct?.description} rows={2} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium resize-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Preço de Custo (R$)</label>
                    <input name="costPrice" type="number" step="0.01" defaultValue={editingProduct?.costPrice} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Preço de Venda (R$)</label>
                    <input name="salePrice" type="number" step="0.01" defaultValue={editingProduct?.salePrice} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Estoque Inicial</label>
                    <input name="currentStock" type="number" defaultValue={editingProduct?.currentStock || 0} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Estoque Mínimo</label>
                    <input name="minStock" type="number" defaultValue={editingProduct?.minStock || 5} required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Tipo de Produto</label>
                    <select name="type" defaultValue={editingProduct?.type || 'venda'} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                      <option value="venda">Para Venda</option>
                      <option value="uso_interno">Uso Interno</option>
                      <option value="ambos">Ambos</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Status</label>
                    <select name="status" defaultValue={editingProduct?.status || 'active'} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Fornecedor</label>
                    <select name="fornecedorId" defaultValue={editingProduct?.fornecedor_id || ''} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                      <option value="">Sem Fornecedor</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowProductModal(false)} className="flex-1 py-4 border border-border text-muted rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" disabled={isSavingProduct} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
                    {isSavingProduct && <Loader2 size={18} className="animate-spin" />}
                    Salvar Produto
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showMovementModal && selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-primary uppercase tracking-tight">Registrar {movementType.replace('_', ' ')}</h2>
                  <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-1">{selectedProduct.name}</p>
                </div>
                <button onClick={() => setShowMovementModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-muted transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleRegisterMovement} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Quantidade</label>
                  <input name="quantity" type="number" required min="1" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                </div>

                {(movementType === 'venda' || movementType === 'entrada') && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Valor Total (R$)</label>
                      <input name="amount" type="number" step="0.01" placeholder="0.00" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Pagamento</label>
                      <select name="paymentMethod" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium appearance-none">
                        <option value="dinheiro">Dinheiro</option>
                        <option value="pix">PIX</option>
                        <option value="cartao_credito">Crédito</option>
                        <option value="cartao_debito">Débito</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Motivo / Observação</label>
                  <textarea name="reason" required rows={3} placeholder="Ex: Reposição de estoque, Venda direta, Consumo em bancada..." className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium resize-none" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowMovementModal(false)} className="flex-1 py-4 border border-border text-muted rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" disabled={isRegisteringMovement} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
                    {isRegisteringMovement && <Loader2 size={18} className="animate-spin" />}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Custom Confirmation Modal */}
        {confirmModal && confirmModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-6"
            >
              <div className="flex items-center gap-3 text-amber-600">
                <AlertTriangle size={24} />
                <h3 className="text-lg font-bold text-primary">{confirmModal.title}</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setConfirmModal(null)} 
                  className="flex-1 py-3 border border-border text-muted rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }} 
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Custom Alert Modal */}
        {alertModal && alertModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-6"
            >
              <div className="flex items-center gap-3">
                {alertModal.type === 'error' && <XCircle size={24} className="text-red-500" />}
                {alertModal.type === 'warning' && <AlertTriangle size={24} className="text-amber-500" />}
                {alertModal.type === 'success' && <CheckCircle2 size={24} className="text-emerald-500" />}
                <h3 className="text-lg font-bold text-primary">{alertModal.title}</h3>
              </div>
              <p className="text-slate-600 text-sm leading-relaxed">{alertModal.message}</p>
              <button 
                type="button" 
                onClick={() => setAlertModal(null)} 
                className="w-full py-3 bg-primary hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95"
              >
                Atendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ title, value, icon, color, isCurrency, alert }: any) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-600',
    amber: 'bg-amber-50 border-amber-100 text-amber-600',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    zinc: 'bg-slate-50 border-slate-100 text-slate-600',
    red: 'bg-red-50 border-red-100 text-red-600'
  };

  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} space-y-4 shadow-sm ${alert ? 'animate-pulse' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 bg-white/80 rounded-xl flex items-center justify-center shadow-sm">
          {icon}
        </div>
        {alert && <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Atenção</span>}
      </div>
      <div>
        <p className="text-2xl font-bold text-primary">
          {isCurrency ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value}
        </p>
        <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">{title}</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
        active ? 'bg-white text-accent shadow-sm border border-border' : 'text-muted hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

interface ProductCardProps {
  key?: React.Key;
  product: Product;
  onEdit: () => void;
  onMovement: (type: MovementType) => void;
  onDelete: () => void;
  isAdmin: boolean;
}

function ProductCard({ product, onEdit, onMovement, onDelete, isAdmin }: ProductCardProps) {
  const isLowStock = product.currentStock <= product.minStock;

  return (
    <motion.div 
      layout
      className={`bg-surface border ${isLowStock ? 'border-amber-200 bg-amber-50/30' : 'border-border'} rounded-2xl p-6 space-y-6 group hover:border-accent/30 transition-all shadow-sm`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center border ${
            product.type === 'venda' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
            product.type === 'uso_interno' ? 'bg-blue-50 text-blue-600 border-blue-100' :
            'bg-amber-50 text-amber-600 border-amber-100'
          }`}>
            <Package size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg text-primary group-hover:text-accent transition-colors leading-tight">{product.name}</h3>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{product.categoryName}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${product.status === 'active' ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{product.status === 'active' ? 'Ativo' : 'Inativo'}</span>
              </div>
              {product.fornecedor_name && (
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Fornecedor: <span className="text-slate-700 font-black">{product.fornecedor_name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={onEdit} 
            className="p-2 hover:bg-slate-100 rounded-xl text-muted hover:text-primary transition-all w-8 h-8 flex items-center justify-center"
            title="Editar Produto"
          >
            <Edit2 size={16} />
          </button>
          {isAdmin && (
            <button 
              onClick={onDelete} 
              className="p-2 hover:bg-red-50 rounded-xl text-red-400 hover:text-red-600 transition-all w-8 h-8 flex items-center justify-center"
              title="Excluir Produto"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-slate-50/50 rounded-xl border border-border shadow-sm">
          <p className="text-[9px] font-bold text-muted uppercase tracking-widest mb-1">Estoque Atual</p>
          <p className={`text-xl font-bold ${isLowStock ? 'text-amber-600' : 'text-primary'}`}>{product.currentStock}</p>
        </div>
        <div className="p-3 bg-slate-50/50 rounded-xl border border-border shadow-sm">
          <p className="text-[9px] font-bold text-muted uppercase tracking-widest mb-1">Preço Venda</p>
          <p className="text-xl font-bold text-emerald-600">R$ {product.salePrice.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <ActionButton onClick={() => onMovement('entrada')} icon={<PlusCircle size={14} />} label="Entrada" color="emerald" />
        <ActionButton onClick={() => onMovement('saida')} icon={<MinusCircle size={14} />} label="Saída" color="red" />
        <ActionButton onClick={() => onMovement('consumo_interno')} icon={<UserMinus size={14} />} label="Consumo" color="blue" />
        <ActionButton onClick={() => onMovement('venda')} icon={<ShoppingCart size={14} />} label="Venda" color="amber" />
      </div>

      {isLowStock && (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
          <AlertTriangle size={16} className="text-amber-600" />
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Abaixo do estoque mínimo ({product.minStock})</p>
        </div>
      )}
    </motion.div>
  );
}

function ActionButton({ onClick, icon, label, color }: any) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white',
    red: 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white',
    blue: 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-600 hover:text-white',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-600 hover:text-white'
  };

  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all border ${colors[color]}`}
    >
      {icon}
      {label}
    </button>
  );
}
