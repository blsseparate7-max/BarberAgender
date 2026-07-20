import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Loader2, 
  Settings, 
  Tag, 
  CreditCard, 
  TrendingDown, 
  TrendingUp, 
  Building, 
  Truck, 
  Heart, 
  Award, 
  Percent, 
  MessageSquare,
  Palette,
  Phone,
  Package,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  FileText,
  Smartphone,
  Copy,
  Check,
  DollarSign,
  Activity,
  FileQuestion,
  HelpCircle,
  Edit3,
  X,
  UserCheck
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  deleteDoc, 
  query, 
  orderBy,
  updateDoc,
  serverTimestamp,
  where
} from 'firebase/firestore';
import { toast } from 'sonner';
import { useTenant } from '../contexts/TenantContext';

type SubTypeId = 
  | 'categorias' 
  | 'formas_pagamento' 
  | 'despesas' 
  | 'receitas' 
  | 'contas_banco' 
  | 'equipamentos' 
  | 'fornecedores' 
  | 'tipos_anamnese' 
  | 'bandeiras' 
  | 'deducoes' 
  | 'mensagens';

interface TypeItem {
  id: string;
  name: string;
  extra?: string;
  
  // Enriched fields stored persistently in Firestore
  color?: string; // categories
  tax?: number; // payment methods
  compensationDays?: number; // payment methods
  periodicity?: string; // expenses
  description?: string; // recipes / general
  initialBalance?: number; // bank accounts
  bankType?: string; // bank accounts
  maintenanceMonths?: number; // equipment
  equipmentStatus?: string; // equipment
  phone?: string; // suppliers
  mainProduct?: string; // suppliers
  instructions?: string; // anamnesis
  cardType?: string; // card brands
  deductionType?: 'percentual' | 'fixo'; // deductions
  deductionValue?: number; // deductions
  body?: string; // ready messages
}

export function Tipos({ defaultTab = 'categorias' }: { defaultTab?: SubTypeId }) {
  const { tenantId } = useTenant();
  const [activeSub, setActiveSub] = useState<SubTypeId>(defaultTab);
  const [items, setItems] = useState<TypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form general state
  const [editingItem, setEditingItem] = useState<TypeItem | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemExtra, setNewItemExtra] = useState('');

  // Specialized states
  const [color, setColor] = useState('#4f46e5'); // categories
  const [tax, setTax] = useState(''); // payment methods
  const [compensationDays, setCompensationDays] = useState('0'); // payment methods
  const [periodicity, setPeriodicity] = useState('Mensal'); // expenses
  const [description, setDescription] = useState(''); // recipes / bank / general
  const [initialBalance, setInitialBalance] = useState(''); // bank accounts
  const [bankType, setBankType] = useState('Corrente'); // bank accounts
  const [maintenanceMonths, setMaintenanceMonths] = useState('3'); // equipment
  const [equipmentStatus, setEquipmentStatus] = useState('Operacional'); // equipment
  const [phone, setPhone] = useState(''); // suppliers
  const [mainProduct, setMainProduct] = useState(''); // suppliers
  const [instructions, setInstructions] = useState(''); // anamnesis
  const [cardType, setCardType] = useState('Ambos'); // card brands
  const [deductionType, setDeductionType] = useState<'percentual' | 'fixo'>('fixo'); // deductions
  const [deductionValue, setDeductionValue] = useState(''); // deductions
  const [body, setBody] = useState(''); // messages
  
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const menuConfig = [
    { id: 'categorias', name: 'Categorias', icon: <Tag size={16} />, collection: 'tipos_categorias' },
    { id: 'formas_pagamento', name: 'Formas de Pagamento', icon: <CreditCard size={16} />, collection: 'tipos_pagamentos' },
    { id: 'despesas', name: 'Tipos de Despesas', icon: <TrendingDown size={16} />, collection: 'tipos_despesas' },
    { id: 'receitas', name: 'Tipos de Receitas', icon: <TrendingUp size={16} />, collection: 'tipos_receitas' },
    { id: 'contas_banco', name: 'Contas de Banco', icon: <Building size={16} />, collection: 'tipos_contas' },
    { id: 'equipamentos', name: 'Equipamentos', icon: <Settings size={16} />, collection: 'tipos_equipamentos' },
    { id: 'fornecedores', name: 'Fornecedores', icon: <Truck size={16} />, collection: 'tipos_fornecedores' },
    { id: 'tipos_anamnese', name: 'Tipos de Anamnese', icon: <Heart size={16} />, collection: 'tipos_anamnese' },
    { id: 'bandeiras', name: 'Bandeiras de Cartão', icon: <Award size={16} />, collection: 'tipos_bandeiras' },
    { id: 'deducoes', name: 'Deduções Disponíveis', icon: <Percent size={16} />, collection: 'tipos_deducoes' },
    { id: 'mensagens', name: 'Mensagens Prontas', icon: <MessageSquare size={16} />, collection: 'tipos_mensagens' },
  ];

  const currentMenu = menuConfig.find(m => m.id === activeSub)!;

  // Modern preset colors for categories
  const categoryColors = [
    { hex: '#4f46e5', label: 'Indigo Royal' },
    { hex: '#0ea5e9', label: 'Sky Blue' },
    { hex: '#10b981', label: 'Emerald Mint' },
    { hex: '#f59e0b', label: 'Amber Gold' },
    { hex: '#ef4444', label: 'Rose Intense' },
    { hex: '#8b5cf6', label: 'Amethyst Violet' },
    { hex: '#0f172a', label: 'Slate Charcoal' },
    { hex: '#ec4899', label: 'Fuschia Pink' },
  ];

  // Fetch registers
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    // Reset editing states on tab change
    handleResetForm();
    
    const q = query(
      collection(db, currentMenu.collection), 
      where('tenantId', '==', tenantId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as TypeItem));
      docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setItems(docs);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching data:", error);
      setItems([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeSub, tenantId]);

  const handleResetForm = () => {
    setEditingItem(null);
    setNewItemName('');
    setNewItemExtra('');
    
    // Reset specialized fields
    setColor('#4f46e5');
    setTax('');
    setCompensationDays('0');
    setPeriodicity('Mensal');
    setDescription('');
    setInitialBalance('');
    setBankType('Corrente');
    setMaintenanceMonths('3');
    setEquipmentStatus('Operacional');
    setPhone('');
    setMainProduct('');
    setInstructions('');
    setCardType('Ambos');
    setDeductionType('fixo');
    setDeductionValue('');
    setBody('');
  };

  const startEditItem = (item: TypeItem) => {
    setEditingItem(item);
    setNewItemName(item.name);
    setNewItemExtra(item.extra || '');
    
    // Fill specialized fields
    if (item.color) setColor(item.color);
    if (item.tax !== undefined) setTax(item.tax.toString());
    if (item.compensationDays !== undefined) setCompensationDays(item.compensationDays.toString());
    if (item.periodicity) setPeriodicity(item.periodicity);
    if (item.description) setDescription(item.description);
    if (item.initialBalance !== undefined) setInitialBalance(item.initialBalance.toString());
    if (item.bankType) setBankType(item.bankType);
    if (item.maintenanceMonths !== undefined) setMaintenanceMonths(item.maintenanceMonths.toString());
    if (item.equipmentStatus) setEquipmentStatus(item.equipmentStatus);
    if (item.phone) setPhone(item.phone);
    if (item.mainProduct) setMainProduct(item.mainProduct);
    if (item.instructions) setInstructions(item.instructions);
    if (item.cardType) setCardType(item.cardType);
    if (item.deductionType) setDeductionType(item.deductionType);
    if (item.deductionValue !== undefined) setDeductionValue(item.deductionValue.toString());
    if (item.body) setBody(item.body);
  };

  // Prepares the extra field dynamically for backwards compatibility
  const buildExtraField = (): string => {
    switch (activeSub) {
      case 'formas_pagamento':
        const txVal = parseFloat(tax) || 0;
        return `Taxa: ${txVal}% | Comp: ${compensationDays}d`;
      case 'deducoes':
        const dedVal = parseFloat(deductionValue) || 0;
        return deductionType === 'percentual' ? `Abate: ${dedVal}%` : `Abate: R$ ${dedVal.toFixed(2)}`;
      case 'contas_banco':
        const balVal = parseFloat(initialBalance) || 0;
        return `${bankType} | Início: R$ ${balVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      case 'equipamentos':
        return `Manut: ${maintenanceMonths}m | ${equipmentStatus}`;
      case 'fornecedores':
        return `${mainProduct ? `${mainProduct} | ` : ''}${phone || 'Sem fone'}`;
      case 'mensagens':
        return body.length > 50 ? body.substring(0, 50) + '...' : body;
      case 'categorias':
        return `Cor: ${color}`;
      case 'bandeiras':
        return `Uso: ${cardType}`;
      case 'tipos_anamnese':
        return instructions ? (instructions.length > 40 ? instructions.substring(0, 40) + '...' : instructions) : 'Ficha clínica';
      case 'despesas':
        return `Freq: ${periodicity}`;
      case 'receitas':
        return description || 'Entrada financeira';
      default:
        return newItemExtra.trim();
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      toast.error('Preencha o nome do item / parâmetro.');
      return;
    }

    const calculatedExtra = buildExtraField();

    // Prepare full document object
    const payload: any = {
      name: newItemName.trim(),
      extra: calculatedExtra,
      updatedAt: serverTimestamp()
    };

    // Sub-tab specific field mapping
    if (activeSub === 'categorias') {
      payload.color = color;
    } else if (activeSub === 'formas_pagamento') {
      payload.tax = parseFloat(tax) || 0;
      payload.compensationDays = parseInt(compensationDays) || 0;
    } else if (activeSub === 'despesas') {
      payload.periodicity = periodicity;
    } else if (activeSub === 'receitas') {
      payload.description = description;
    } else if (activeSub === 'contas_banco') {
      payload.initialBalance = parseFloat(initialBalance) || 0;
      payload.bankType = bankType;
    } else if (activeSub === 'equipamentos') {
      payload.maintenanceMonths = parseInt(maintenanceMonths) || 12;
      payload.equipmentStatus = equipmentStatus;
    } else if (activeSub === 'fornecedores') {
      payload.phone = phone;
      payload.mainProduct = mainProduct;
    } else if (activeSub === 'tipos_anamnese') {
      payload.instructions = instructions;
    } else if (activeSub === 'bandeiras') {
      payload.cardType = cardType;
    } else if (activeSub === 'deducoes') {
      payload.deductionType = deductionType;
      payload.deductionValue = parseFloat(deductionValue) || 0;
    } else if (activeSub === 'mensagens') {
      payload.body = body;
    }

    try {
      payload.tenantId = tenantId;
      if (editingItem) {
        // Mode edit
        const itemRef = doc(db, currentMenu.collection, editingItem.id);
        await updateDoc(itemRef, payload);
        toast.success('Parâmetro alterado com sucesso!');
      } else {
        // Mode create
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, currentMenu.collection), payload);
        toast.success(`Adicionado em ${currentMenu.name}!`);
      }
      handleResetForm();
    } catch (err) {
      console.error(err);
      toast.error('Ocorreu um erro ao salvar o parâmetro.');
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (confirm(`Deseja realmente excluir irreversiblemente o item "${name}" do configurador?`)) {
      try {
        await deleteDoc(doc(db, currentMenu.collection, id));
        toast.success('Excluído com sucesso do catálogo de parâmetros.');
        if (editingItem?.id === id) {
          handleResetForm();
        }
      } catch (err) {
        console.error(err);
        toast.error('Erro ao deletar item.');
      }
    }
  };

  // Variable inserter helper for template messages
  const insertVariable = (variableToken: string) => {
    if (!bodyTextareaRef.current) return;
    const start = bodyTextareaRef.current.selectionStart;
    const end = bodyTextareaRef.current.selectionEnd;
    const currentText = body;
    const updated = currentText.substring(0, start) + variableToken + currentText.substring(end);
    setBody(updated);
    
    // Restore focus and cursor position
    setTimeout(() => {
      if (bodyTextareaRef.current) {
        bodyTextareaRef.current.focus();
        bodyTextareaRef.current.selectionStart = bodyTextareaRef.current.selectionEnd = start + variableToken.length;
      }
    }, 50);
  };

  // Emulation of dynamic variable replacements for Mock Mobile live message preview
  const getRenderedMessagePreview = (): string => {
    if (!body) return 'Escreva uma mensagem no editor para visualizar a prévia aqui...';
    return body
      .replace(/{nome_cliente}/g, 'Arthur Pendragon')
      .replace(/{nome_barbeiro}/g, 'Matheus (Barbeiro)')
      .replace(/{data_hora_agendamento}/g, 'Sexta às 14:00')
      .replace(/{valor_total_servico}/g, 'R$ 70,00')
      .replace(/{link_agendamento}/g, 'barba.app/ArthurP');
  };

  // Search filter
  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (item.extra && item.extra.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-10 pb-16 text-primary">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary">Configurador de Parâmetros e Tipos</h1>
          <p className="text-muted text-sm font-medium mt-1">
            Modifique, estruture e personalize todos os dicionários de dados do sistema em tempo real.
          </p>
        </div>
        <div className="text-right hidden sm:block bg-slate-50 border p-3.5 rounded-2xl">
          <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Tabelas Ativas</p>
          <p className="text-xs font-black text-primary">{menuConfig.length} Parâmetros Globais</p>
        </div>
      </header>

      <div className="flex flex-col xl:flex-row gap-8 items-start">
        {/* Left Side Menu List with active configuration indicators */}
        <nav className="w-full xl:w-80 bg-white border border-slate-200 rounded-[2rem] p-4 space-y-1.5 shadow-sm flex flex-col shrink-0">
          <p className="text-[10px] font-black uppercase text-muted tracking-wide px-3 mb-3">Tabelas e Modelos</p>
          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {menuConfig.map(m => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveSub(m.id as SubTypeId);
                  handleResetForm();
                }}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all text-left ${
                  activeSub === m.id 
                    ? 'bg-primary text-white font-black shadow-md shadow-primary/10' 
                    : 'text-muted hover:text-primary hover:bg-slate-50 border border-transparent'
                }`}
              >
                <div className={`${activeSub === m.id ? 'text-white' : 'text-slate-400'}`}>
                  {m.icon}
                </div>
                <span className="truncate flex-1">{m.name}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Dynamic configurations Right Panel */}
        <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm w-full space-y-8">
          <div className="border-b border-slate-100 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">{currentMenu.icon}</span>
                <h3 className="text-xl font-black uppercase tracking-tight text-primary">
                  Gestão de {currentMenu.name}
                </h3>
              </div>
              <p className="text-xs text-muted font-bold mt-1.5 leading-relaxed">
                Adicione, altere e exclua registros para a tabela "{currentMenu.collection}".
              </p>
            </div>
            {editingItem && (
              <button 
                onClick={handleResetForm}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200 hover:bg-amber-100"
              >
                <X size={12} />
                <span>Cancelar Edição ({newItemName})</span>
              </button>
            )}
          </div>

          {/* MASTER DYNAMIC INPUT FORM */}
          <form 
            onSubmit={handleAddItem} 
            className={`p-6 sm:p-8 rounded-3xl border transition-all ${
              editingItem 
                ? 'bg-amber-50/40 border-amber-200/80 shadow-amber-50/50' 
                : 'bg-slate-50 border-slate-100'
            } flex flex-col gap-6`}
          >
            {editingItem && (
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Modo Edição de Parâmetro Conectado</span>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PRIMARY NAME FIELD */}
              <div className="space-y-2">
                <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                  Nome do Item / Opção <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder={`Ex: ${
                    activeSub === 'categorias' ? 'Tratamento de Barba' :
                    activeSub === 'formas_pagamento' ? 'PIX Premiado' :
                    activeSub === 'contas_banco' ? 'Banco Santander' : 'Escreva o nome do item'
                  }`}
                  className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                />
              </div>

              {/* DYNAMIC SECONDARY FIELDS ACCORDING TO THE SELECTED SUBTAB */}
              {activeSub === 'categorias' && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                    Cor Visual Representativa
                  </label>
                  <div className="flex flex-wrap gap-2.5">
                    {categoryColors.map(preset => (
                      <button
                        type="button"
                        key={preset.hex}
                        onClick={() => setColor(preset.hex)}
                        title={preset.label}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-transform active:scale-90 ${
                          color === preset.hex 
                            ? 'border-black scale-105 shadow-md shadow-black/10' 
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {color === preset.hex && (
                          <div className="w-2.5 h-2.5 bg-white rounded-full mix-blend-difference" />
                        )}
                      </button>
                    ))}
                    <input 
                      type="color" 
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="w-9 h-9 rounded-xl border border-slate-200 p-0.5 cursor-pointer"
                      title="Escolher cor personalizada"
                    />
                  </div>
                </div>
              )}

              {activeSub === 'formas_pagamento' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Taxa de Operação/Adquirente (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={tax}
                      onChange={e => setTax(e.target.value)}
                      placeholder="Ex: 1.99"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Dias para Liquidação / Compensação
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={compensationDays}
                      onChange={e => setCompensationDays(e.target.value)}
                      placeholder="Ex: 1 (D+1)"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                </>
              )}

              {activeSub === 'despesas' && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                    Periodicidade Recorrente
                  </label>
                  <select
                    value={periodicity}
                    onChange={e => setPeriodicity(e.target.value)}
                    className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition cursor-pointer"
                  >
                    <option value="Mensal">Mensal (Aluguel, Luz...)</option>
                    <option value="Eventual">Eventual (Manutenções...)</option>
                    <option value="Diária">Diária (Insumos diários...)</option>
                    <option value="Semanal">Semanal (Limpezas...)</option>
                    <option value="Anual">Anual (Taxas associativos...)</option>
                  </select>
                </div>
              )}

              {activeSub === 'receitas' && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                    Descrição do Canal de Entrada
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Ex: Venda de Shampoos e Pomadas"
                    className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                  />
                </div>
              )}

              {activeSub === 'contas_banco' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Saldo Inicial de Abertura (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={initialBalance}
                      onChange={e => setInitialBalance(e.target.value)}
                      placeholder="0,00"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Tipo de Conta Financeira
                    </label>
                    <select
                      value={bankType}
                      onChange={e => setBankType(e.target.value)}
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition cursor-pointer"
                    >
                      <option value="Corrente">🏦 Conta Corrente PJ</option>
                      <option value="Poupança">💰 Conta Poupança / Investimento</option>
                      <option value="Caixa Físico">💵 Caixa Interno / Gaveta Física</option>
                    </select>
                  </div>
                </>
              )}

              {activeSub === 'equipamentos' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Ciclo de Manutenção Preventiva (Meses)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={maintenanceMonths}
                      onChange={e => setMaintenanceMonths(e.target.value)}
                      placeholder="Ex: 3"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Situação / Status Atual
                    </label>
                    <select
                      value={equipmentStatus}
                      onChange={e => setEquipmentStatus(e.target.value)}
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition cursor-pointer"
                    >
                      <option value="Operacional">🟢 Operacional / Em uso</option>
                      <option value="Manutenção Necessária">🟡 Manutenção Necessária</option>
                      <option value="Avariado / Parado">🔴 Avariado / Fora de serviço</option>
                    </select>
                  </div>
                </>
              )}

              {activeSub === 'fornecedores' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Telefone / WhatsApp Comercial
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Ex: (11) 98765-4321"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Produto Principal Fornecido
                    </label>
                    <input
                      type="text"
                      value={mainProduct}
                      onChange={e => setMainProduct(e.target.value)}
                      placeholder="Ex: Shampoos, Cervejas, Toalhas"
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                </>
              )}

              {activeSub === 'tipos_anamnese' && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                    Instrução / Pergunta de Diagnóstico Capilar ou Alergia
                  </label>
                  <input
                    type="text"
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    placeholder="Ex: O cliente possui alergias ou hipersensibilidade a álcool isopropílico no pós-barba?"
                    className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                  />
                </div>
              )}

              {activeSub === 'bandeiras' && (
                <div className="space-y-2">
                  <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                    Modalidade de Cartão
                  </label>
                  <select
                    value={cardType}
                    onChange={e => setCardType(e.target.value)}
                    className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition cursor-pointer"
                  >
                    <option value="Ambos">💳 Ambos (Débito e Crédito)</option>
                    <option value="Crédito">🔴 Apenas Crédito</option>
                    <option value="Débito">🟢 Apenas Débito</option>
                  </select>
                </div>
              )}

              {activeSub === 'deducoes' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Tipo de Valor do Abatimento
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-inner">
                      <button
                        type="button"
                        onClick={() => setDeductionType('fixo')}
                        className={`py-2 text-[10px] font-black uppercase rounded-xl transition ${
                          deductionType === 'fixo' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Desconto Fixo (R$)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeductionType('percentual')}
                        className={`py-2 text-[10px] font-black uppercase rounded-xl transition ${
                          deductionType === 'percentual' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Abatimento %
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                      Valor Dedução {deductionType === 'percentual' ? '(%)' : '(R$)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={deductionValue}
                      onChange={e => setDeductionValue(e.target.value)}
                      placeholder={deductionType === 'percentual' ? '10%' : '5,00'}
                      className="w-full p-3.5 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition"
                    />
                  </div>
                </>
              )}

              {activeSub === 'mensagens' && (
                <div className="md:col-span-2 space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] text-muted font-black uppercase tracking-wider block">
                        Modelo de Mensagem (WhatsApp CRM)
                      </label>
                      <span className="text-[9px] font-bold text-accent bg-accent/5 px-2 py-0.5 rounded-md hover:underline cursor-pointer">
                        Suporta quebra de linhas
                      </span>
                    </div>
                    <textarea
                      ref={bodyTextareaRef}
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      placeholder="Olá, {nome_cliente}! Seu agendamento com {nome_barbeiro} está confirmado para {data_hora_agendamento}. Obrigado!"
                      rows={4}
                      className="w-full p-4 bg-white border border-slate-200 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-sm text-primary font-bold rounded-2xl shadow-sm transition resize-none leading-relaxed"
                    />
                  </div>

                  {/* Variables trigger bank */}
                  <div className="bg-slate-100 border border-slate-200/40 p-4 rounded-2xl space-y-3">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                      Clique para injetar placeholders dinâmicos:
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        onClick={() => insertVariable('{nome_cliente}')}
                        className="text-[9px] font-black bg-white hover:bg-slate-50 border px-3 py-1.5 rounded-lg text-indigo-700 shadow-sm"
                      >
                        👤 Nome do Cliente
                      </button>
                      <button
                        type="button"
                        onClick={() => insertVariable('{nome_barbeiro}')}
                        className="text-[9px] font-black bg-white hover:bg-slate-50 border px-3 py-1.5 rounded-lg text-amber-700 shadow-sm"
                      >
                        💈 Nome do Barbeiro
                      </button>
                      <button
                        type="button"
                        onClick={() => insertVariable('{data_hora_agendamento}')}
                        className="text-[9px] font-black bg-white hover:bg-slate-50 border px-3 py-1.5 rounded-lg text-emerald-700 shadow-sm"
                      >
                        📅 Data & Horário
                      </button>
                      <button
                        type="button"
                        onClick={() => insertVariable('{valor_total_servico}')}
                        className="text-[9px] font-black bg-white hover:bg-slate-50 border px-3 py-1.5 rounded-lg text-rose-700 shadow-sm"
                      >
                        💵 Valor do Serviço
                      </button>
                      <button
                        type="button"
                        onClick={() => insertVariable('{link_agendamento}')}
                        className="text-[9px] font-black bg-white hover:bg-slate-50 border px-3 py-1.5 rounded-lg text-cyan-700 shadow-sm"
                      >
                        🔗 Link Agendamento
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200/40">
              <button 
                type="submit"
                className={`px-8 py-3.5 ${
                  editingItem ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/10' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10'
                } font-black text-white rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 active:scale-95 transition-all shadow-md`}
              >
                {editingItem ? <Edit3 size={16} /> : <Plus size={16} />}
                <span>{editingItem ? 'Salvar Alterações' : 'Adicionar Parâmetro'}</span>
              </button>
            </div>
          </form>

          {/* DYNAMIC SEARCH BAR */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 self-start sm:self-center">
              Registros no Catálogo ({filteredItems.length})
            </h4>
            <div className="w-full sm:w-80">
              <input 
                type="text"
                placeholder={`🔎 Filtrar ${currentMenu.name}...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full py-2.5 px-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary"
              />
            </div>
          </div>

          {/* SPECIAL WHATSAPP MOBILE WRITER LIVE MOCKUP */}
          {activeSub === 'mensagens' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/50 p-6 rounded-[2rem] border border-slate-100">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wide text-primary flex items-center gap-2 mb-2">
                  <Smartphone size={16} className="text-emerald-600" />
                  <span>Emulador Prévio do WhatsApp</span>
                </h4>
                <p className="text-[10px] text-muted font-bold leading-relaxed mb-4">
                  Veja ao lado como o texto formatado chegará ao celular de Arthur Pendragon instantaneamente.
                </p>
              </div>
              
              <div className="relative bg-[#efeae2] border border-slate-200 p-4 rounded-3xl min-h-[160px] flex flex-col justify-between shadow-inner">
                {/* Visual phone screen header */}
                <div className="flex items-center gap-2 pb-2.5 border-b border-black/5 mb-3">
                  <div className="w-7 h-7 rounded-full bg-slate-400 text-white font-black text-[10px] flex items-center justify-center shadow-sm">Ap</div>
                  <div>
                    <h5 className="text-[11px] font-black text-slate-800">Barber Club Sincronizado</h5>
                    <p className="text-[8px] text-emerald-600 font-bold">Online</p>
                  </div>
                </div>

                {/* Message bubble */}
                <div className="bg-[#d9fdd3] text-slate-800 p-3 rounded-2xl shadow-sm text-xs relative max-w-[90%] font-bold leading-relaxed whitespace-pre-line self-start">
                  {getRenderedMessagePreview()}
                  <div className="text-[8px] text-slate-500 text-right mt-1.5 flex items-center justify-end gap-1 font-normal">
                    <span>14:02</span>
                    <span className="text-sky-500 font-black">✓✓</span>
                  </div>
                </div>

                {/* Simulated field */}
                <div className="text-[9px] text-slate-400 text-center mt-4">
                  * Os campos entre chaves {"{}"} são dinamizados pelo banco.
                </div>
              </div>
            </div>
          )}

          {/* RENDERING CONFIG LIST IN MODERN GRID CARDS */}
          {items.length === 0 ? (
            <div className="py-16 border-2 border-dashed border-slate-200 rounded-[2.5rem] text-center text-sm md:text-base text-muted font-medium italic">
              Nenhum registro configurado para a tabela "{currentMenu.name}".
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted font-bold italic">
              Nenhum item correspondente à busca "{searchTerm}".
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.map(item => {
                  // Advanced decorative styles according to tab class
                  let leftBorderColor = 'border-l-primary';
                  let iconElement: React.ReactNode = <Settings size={16} className="text-slate-400" />;
                  
                  if (activeSub === 'categorias') {
                    leftBorderColor = `border-l-[${item.color || '#4f46e5'}]`;
                    iconElement = <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color || '#4f46e5' }} />;
                  } else if (activeSub === 'formas_pagamento') {
                    leftBorderColor = 'border-l-emerald-500';
                    iconElement = <CreditCard size={16} className="text-emerald-500" />;
                  } else if (activeSub === 'despesas') {
                    leftBorderColor = 'border-l-rose-500';
                    iconElement = <TrendingDown size={16} className="text-rose-500" />;
                  } else if (activeSub === 'receitas') {
                    leftBorderColor = 'border-l-blue-500';
                    iconElement = <TrendingUp size={16} className="text-blue-500" />;
                  } else if (activeSub === 'contas_banco') {
                    leftBorderColor = 'border-l-indigo-500';
                    iconElement = <Building size={16} className="text-indigo-500" />;
                  } else if (activeSub === 'equipamentos') {
                    leftBorderColor = item.equipmentStatus?.includes('🟢') || item.equipmentStatus === 'Operacional' ? 'border-l-emerald-500' : 'border-l-amber-500';
                    iconElement = <Settings size={16} className="text-slate-500" />;
                  } else if (activeSub === 'fornecedores') {
                    leftBorderColor = 'border-l-cyan-500';
                    iconElement = <Truck size={16} className="text-cyan-500" />;
                  } else if (activeSub === 'tipos_anamnese') {
                    leftBorderColor = 'border-l-purple-500';
                    iconElement = <Heart size={16} className="text-purple-500" />;
                  } else if (activeSub === 'bandeiras') {
                    leftBorderColor = 'border-l-amber-500';
                    iconElement = <Award size={16} className="text-amber-500" />;
                  } else if (activeSub === 'deducoes') {
                    leftBorderColor = 'border-l-red-500';
                    iconElement = <Percent size={16} className="text-red-500" />;
                  } else if (activeSub === 'mensagens') {
                    leftBorderColor = 'border-l-green-600';
                    iconElement = <MessageSquare size={16} className="text-green-650" />;
                  }

                  return (
                    <div 
                      key={item.id} 
                      className={`bg-white border-y border-r border-l-4 ${leftBorderColor} rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-300 group ${
                        editingItem?.id === item.id ? 'ring-2 ring-amber-400 bg-amber-50/10' : ''
                      }`}
                      style={activeSub === 'categorias' ? { borderLeftColor: item.color || '#4f46e5' } : undefined}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className="p-2.5 bg-slate-50 rounded-xl group-hover:bg-slate-100 transition">
                          {iconElement}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-sm text-primary tracking-tight truncate">
                            {item.name}
                          </p>
                          {item.extra && (
                            <p className="text-[10px] text-muted font-bold mt-1 tracking-wider uppercase truncate">
                              {item.extra}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 ml-3">
                        <button 
                          onClick={() => startEditItem(item)}
                          className="p-2 text-slate-350 hover:text-indigo-600 rounded-xl hover:bg-slate-50 transition active:scale-95"
                          title="Editar registros"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button 
                          onClick={() => handleDeleteItem(item.id, item.name)}
                          className="p-2 text-slate-350 hover:text-red-500 hover:bg-red-50/10 rounded-xl transition active:scale-95"
                          title="Excluir do catálogo"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
