import React, { useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  DollarSign, 
  Users, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Scissors, 
  ShoppingBag,
  PartyPopper,
  Check,
  Plus,
  Trash2,
  Lock,
  Mail,
  Percent,
  PercentCircle,
  Briefcase
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { userService } from '../services/userService';
import { serviceService } from '../services/serviceService';
import { inventoryService } from '../services/inventoryService';
import { getActiveTenantId } from '../services/tenantService';
import { UserProfile } from '../types';
import { toast } from 'sonner';

interface OnboardingWelcomeProps {
  profile: UserProfile;
  onClose: () => void;
  onNavigate: (tabId: string) => void;
}

export function OnboardingWelcome({ profile, onClose, onNavigate }: OnboardingWelcomeProps) {
  const [step, setStep] = useState(1);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const totalSteps = 5;

  // Step 2 State - Professionals
  const [profName, setProfName] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profSpecialty, setProfSpecialty] = useState('');
  const [profCommission, setProfCommission] = useState('50');
  const [profPassword, setProfPassword] = useState('');
  const [addedProfessionals, setAddedProfessionals] = useState<any[]>([]);

  // Step 3 State - Services
  const [serviceName, setServiceName] = useState('');
  const [serviceCategory, setServiceCategory] = useState('Cabelo');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDuration, setServiceDuration] = useState('30');
  const [addedServices, setAddedServices] = useState<any[]>([]);

  // Step 4 State - Products
  const [productName, setProductName] = useState('');
  const [productSalePrice, setProductSalePrice] = useState('');
  const [productCostPrice, setProductCostPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const [productMinStock] = useState('5');
  const [addedProducts, setAddedProducts] = useState<any[]>([]);

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      await userService.updateUserProfile(profile.uid, {
        onboardingCompleted: true
      });
      onClose();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      onClose();
    } finally {
      setIsFinishing(false);
    }
  };

  const handleAddProfessional = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    if (!profName.trim()) {
      toast.error('O nome do profissional é obrigatório.');
      return false;
    }
    if (!profEmail.trim()) {
      toast.error('O e-mail do profissional é obrigatório.');
      return false;
    }
    if (!profPassword.trim() || profPassword.length < 6) {
      toast.error('A senha é obrigatória e deve ter no mínimo 6 caracteres.');
      return false;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        nome: profName.trim(),
        email: profEmail.toLowerCase().trim(),
        especialidade: profSpecialty.trim() || 'Corte e Barba',
        specialty: profSpecialty.trim() || 'Corte e Barba',
        percentual_comissao: Number(profCommission) || 50,
        commission_percentage: Number(profCommission) || 50,
        ativo: true,
        tipo: 'barbeiro',
        password: profPassword.trim(),
        tenantId: profile.tenantId || getActiveTenantId(),
      };
      
      const newProf = await userService.createUser(payload);
      setAddedProfessionals(prev => [...prev, newProf]);
      
      // Reset inputs
      setProfName('');
      setProfEmail('');
      setProfSpecialty('');
      setProfCommission('50');
      setProfPassword('');
      
      toast.success(`Profissional ${payload.nome} cadastrado com sucesso!`);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao cadastrar profissional.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddService = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    if (!serviceName.trim()) {
      toast.error('O nome do serviço é obrigatório.');
      return false;
    }
    if (!servicePrice) {
      toast.error('O preço do serviço é obrigatório.');
      return false;
    }

    setIsSaving(true);
    try {
      const payload = {
        nome: serviceName.trim(),
        categoria: serviceCategory.trim() || 'Cabelo',
        preco: Number(servicePrice) || 0,
        duracao_minutos: Number(serviceDuration) || 30,
        active: true,
        tenantId: profile.tenantId || getActiveTenantId(),
      };
      
      const id = await serviceService.createService(payload);
      setAddedServices(prev => [...prev, { id, ...payload }]);
      
      // Reset inputs
      setServiceName('');
      setServiceCategory('Cabelo');
      setServicePrice('');
      setServiceDuration('30');
      
      toast.success(`Serviço ${payload.nome} adicionado com sucesso!`);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao cadastrar serviço.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddProduct = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    if (!productName.trim()) {
      toast.error('O nome do produto é obrigatório.');
      return false;
    }
    if (!productSalePrice) {
      toast.error('O preço de venda é obrigatório.');
      return false;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        name: productName.trim(),
        salePrice: Number(productSalePrice) || 0,
        costPrice: Number(productCostPrice) || 0,
        currentStock: Number(productStock) || 0,
        minStock: Number(productMinStock) || 5,
        categoria_id: '',
        categoryName: 'Geral',
        type: 'venda',
        status: 'active',
        tenantId: profile.tenantId || getActiveTenantId(),
      };
      
      const id = await inventoryService.createProduct(payload);
      setAddedProducts(prev => [...prev, { id, ...payload }]);
      
      // Reset inputs
      setProductName('');
      setProductSalePrice('');
      setProductCostPrice('');
      setProductStock('');
      
      toast.success(`Produto ${payload.name} adicionado com sucesso!`);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao cadastrar produto.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Helper function to handle step transition and auto-save filled data
  const handleNextStep = async () => {
    if (step === 2) {
      // If user typed anything in professional name or email, try to auto-add
      if (profName.trim() || profEmail.trim() || profPassword.trim()) {
        const success = await handleAddProfessional();
        if (!success) return; // Do not advance if creation failed
      }
    } else if (step === 3) {
      // If user typed anything in service name or price, try to auto-add
      if (serviceName.trim() || servicePrice) {
        const success = await handleAddService();
        if (!success) return; // Do not advance if creation failed
      }
    } else if (step === 4) {
      // If user typed anything in product name or price, try to auto-add
      if (productName.trim() || productSalePrice) {
        const success = await handleAddProduct();
        if (!success) return; // Do not advance if creation failed
      }
    }
    setStep(step + 1);
  };

  // Skip step or onboarding entirely
  const handleSkipOrCancel = async () => {
    setIsFinishing(true);
    try {
      await userService.updateUserProfile(profile.uid, {
        onboardingCompleted: true
      });
      toast.info('Onboarding pulado. Você poderá cadastrar profissionais, serviços e produtos a qualquer momento no menu lateral!');
      onClose();
    } catch (err) {
      console.error('Error skipping onboarding:', err);
      onClose();
    } finally {
      setIsFinishing(false);
    }
  };

  const stepsContent = [
    // STEP 1: Welcome
    {
      title: "Boas-vindas ao seu Novo Sistema!",
      subtitle: `Olá, ${profile.nome.split(' ')[0]}! Vamos deixar sua barbearia pronta para faturar.`,
      icon: <PartyPopper className="text-amber-500 w-12 h-12" />,
      content: (
        <div className="space-y-4 text-slate-600 text-sm font-semibold">
          <p className="leading-relaxed">
            Parabéns pelo cadastro! Para que você possa testar e ver as funcionalidades de <strong className="text-slate-900">agenda, comandas, cálculo de comissões e fluxo de caixa</strong> em ação, criamos um assistente de onboarding rápido.
          </p>
          
          <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs">
            <CheckCircle2 className="shrink-0 mt-0.5 text-emerald-600" size={16} />
            <div>
              <p className="font-extrabold text-emerald-900 uppercase tracking-wide">💡 Cadastro não obrigatório, mas recomendado!</p>
              <p className="mt-1 leading-relaxed text-slate-650 font-medium">Você pode pular este onboarding clicando em "Pular tudo" abaixo. Porém, configurar pelo menos 1 barbeiro, 1 serviço e 1 produto inicial ajuda a preencher a barbearia e testar as comandas e a agenda imediatamente!</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-bold text-slate-700">
            <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 mt-0.5">
                <Users size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-900 font-extrabold">1. Equipe / Barbeiros</p>
                <p className="text-[11px] text-slate-500 mt-1">Crie barbeiros com e-mail e senha para acesso imediato ao painel deles.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 mt-0.5">
                <Scissors size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-900 font-extrabold">2. Serviços & Preços</p>
                <p className="text-[11px] text-slate-500 mt-1">Defina corte, barba, combos de atendimento e tempo de duração.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },

    // STEP 2: Professionals
    {
      title: "Cadastre sua Equipe (Passo 1/3)",
      subtitle: "Adicione os barbeiros e defina suas credenciais de acesso",
      icon: <Users className="text-indigo-500 w-12 h-12" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Aqui você define o nome do barbeiro e a comissão dele. Ao cadastrar, as credenciais de e-mail e senha que você definir ficarão <strong className="text-slate-900">ativas no mesmo instante</strong> para ele fazer login e acessar o painel do barbeiro!
          </p>

          <form onSubmit={handleAddProfessional} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Nome Completo</label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Pedro Barbeiro"
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Especialidade</label>
                <input 
                  type="text"
                  placeholder="Ex: Degradê, Barba, Visagismo"
                  value={profSpecialty}
                  onChange={(e) => setProfSpecialty(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Comissão (%)</label>
                <div className="relative">
                  <PercentCircle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="number"
                    min="0"
                    max="100"
                    value={profCommission}
                    onChange={(e) => setProfCommission(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">E-mail de Login</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="email"
                    required
                    placeholder="barbeiro@email.com"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Senha de Login</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="password"
                    required
                    placeholder="Mínimo 6 dígitos"
                    value={profPassword}
                    onChange={(e) => setProfPassword(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Plus size={14} />
              Cadastrar Barbeiro
            </button>
          </form>

          {/* List of added professionals in this onboarding */}
          {addedProfessionals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Profissionais Adicionados ({addedProfessionals.length})</h4>
              <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1">
                {addedProfessionals.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl shadow-sm text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-indigo-100 text-indigo-700 font-bold rounded-lg flex items-center justify-center">
                        {p.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900">{p.nome}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">{p.especialidade} • Comissão {p.percentual_comissao}%</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase">Login Ativo</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },

    // STEP 3: Services
    {
      title: "Cadastre seus Serviços (Passo 2/3)",
      subtitle: "Quais cortes, barbas e tratamentos você oferece?",
      icon: <Scissors className="text-emerald-500 w-12 h-12" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Configure seu catálogo inicial de serviços com o respectivo preço de tabela e o tempo médio gasto na execução para que seus horários fiquem sincronizados na agenda.
          </p>

          <form onSubmit={handleAddService} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Nome do Serviço</label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Corte Degradê Social"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Categoria</label>
                <select
                  value={serviceCategory}
                  onChange={(e) => setServiceCategory(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="Cabelo">Cabelo</option>
                  <option value="Barba">Barba</option>
                  <option value="Combo">Combo (Corte + Barba)</option>
                  <option value="Química">Química / Tintura</option>
                  <option value="Estética">Estética / Limpeza de Pele</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Preço de Venda (R$)</label>
                <input 
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Ex: 45.00"
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Tempo Estimado (Minutos)</label>
                <select
                  value={serviceDuration}
                  onChange={(e) => setServiceDuration(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="15">15 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">60 minutos (1 hora)</option>
                  <option value="90">90 minutos (1.5h)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-emerald-650 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Plus size={14} />
              Adicionar Serviço
            </button>
          </form>

          {/* List of added services in this onboarding */}
          {addedServices.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Serviços Adicionados ({addedServices.length})</h4>
              <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1">
                {addedServices.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl shadow-sm text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-emerald-100 text-emerald-700 font-bold rounded-lg flex items-center justify-center">
                        <Scissors size={12} />
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900">{s.nome}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">{s.categoria} • {s.duracao_minutos} min</p>
                      </div>
                    </div>
                    <span className="font-black text-emerald-600 text-xs">R$ {Number(s.preco).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },

    // STEP 4: Products
    {
      title: "Cadastre seus Produtos (Passo 3/3)",
      subtitle: "Controle as pomadas, shampoos e cervejas do estoque",
      icon: <ShoppingBag className="text-amber-500 w-12 h-12" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Adicione produtos para vender aos clientes na finalização do corte de cabelo e acompanhe o fluxo de caixa de mercadorias.
          </p>

          <form onSubmit={handleAddProduct} className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Nome do Produto</label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Pomada Modeladora Efeito Matte"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Estoque Inicial (Unidades)</label>
                <input 
                  type="number"
                  min="0"
                  required
                  placeholder="Ex: 15"
                  value={productStock}
                  onChange={(e) => setProductStock(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Preço de Venda (R$)</label>
                <input 
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Ex: 35.00"
                  value={productSalePrice}
                  onChange={(e) => setProductSalePrice(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Preço de Custo (R$)</label>
                <input 
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Ex: 15.00"
                  value={productCostPrice}
                  onChange={(e) => setProductCostPrice(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Plus size={14} />
              Adicionar Produto
            </button>
          </form>

          {/* List of added products in this onboarding */}
          {addedProducts.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Produtos Adicionados ({addedProducts.length})</h4>
              <div className="max-h-[120px] overflow-y-auto space-y-1.5 pr-1">
                {addedProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl shadow-sm text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-amber-100 text-amber-700 font-bold rounded-lg flex items-center justify-center">
                        <ShoppingBag size={12} />
                      </div>
                      <div>
                        <p className="font-extrabold text-slate-900">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-semibold">Estoque: {p.currentStock} un</p>
                      </div>
                    </div>
                    <span className="font-black text-amber-600 text-xs">R$ {Number(p.salePrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },

    // STEP 5: Finished
    {
      title: "Tudo Pronto e Configurado!",
      subtitle: "Parabéns, sua barbearia está de portas abertas",
      icon: <CheckCircle2 className="text-emerald-500 w-12 h-12" />,
      content: (
        <div className="space-y-5 text-center py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full shadow-inner border border-emerald-100 mb-2">
            <Check size={36} strokeWidth={3} />
          </div>
          
          <div>
            <h3 className="font-black text-base text-slate-900">Configuração Inicial Concluída!</h3>
            <p className="text-xs text-slate-500 font-semibold mt-1 max-w-sm mx-auto leading-relaxed">
              Você cadastrou os dados principais da sua barbearia. Agora você pode abrir comandas, agendar cortes e começar a testar todo o fluxo financeiro!
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto pt-2 font-bold text-slate-700 text-xs uppercase tracking-wider">
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
              <p className="text-indigo-600 text-base font-black">{addedProfessionals.length}</p>
              <p className="text-[8px] text-slate-400 font-black mt-1">Barbeiros</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
              <p className="text-emerald-600 text-base font-black">{addedServices.length}</p>
              <p className="text-[8px] text-slate-400 font-black mt-1">Serviços</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-3 rounded-2xl">
              <p className="text-amber-600 text-base font-black">{addedProducts.length}</p>
              <p className="text-[8px] text-slate-400 font-black mt-1">Produtos</p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = stepsContent[step - 1];

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-white rounded-[36px] shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Illustration & Indicator */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-6 text-white relative overflow-hidden flex items-center gap-5 shrink-0">
          <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-xl -ml-10 -mb-10 pointer-events-none" />
          
          <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-3xl border border-white/10 flex-shrink-0">
            {currentStepData.icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black tracking-widest uppercase text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Passo {step} de {totalSteps}
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight mt-1 truncate">{currentStepData.title}</h2>
            <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{currentStepData.subtitle}</p>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="h-1 w-full bg-slate-100 flex shrink-0">
          {[...Array(totalSteps)].map((_, i) => (
            <div 
              key={i} 
              className={`h-full flex-1 transition-all duration-300 ${
                i < step ? 'bg-emerald-500' : 'bg-slate-100'
              } ${i > 0 ? 'border-l border-white' : ''}`}
            />
          ))}
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 overflow-y-auto">
          {currentStepData.content}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-[36px] shrink-0">
          {/* Back Button */}
          {step > 1 && step < totalSteps ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-slate-600 hover:text-slate-900 transition-all bg-white hover:bg-slate-100 rounded-xl border border-slate-200"
            >
              <ArrowLeft size={14} />
              Voltar
            </button>
          ) : (
            <button
              onClick={handleSkipOrCancel}
              disabled={isFinishing}
              className="px-4 py-2.5 text-xs font-extrabold text-slate-400 hover:text-red-500 transition-all rounded-xl"
            >
              Pular Tudo
            </button>
          )}

          {/* Action buttons */}
          {step < totalSteps ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-black text-slate-500 hover:text-slate-800 transition-all bg-white hover:bg-slate-100 rounded-xl border border-slate-200"
              >
                Pular Etapa
              </button>
              <button
                onClick={handleNextStep}
                className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all rounded-xl shadow-lg shadow-emerald-600/10"
              >
                Avançar
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleFinish}
              disabled={isFinishing}
              className="flex items-center gap-1.5 px-6 py-3 text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all rounded-xl shadow-lg shadow-emerald-600/10 ml-auto disabled:opacity-50"
            >
              {isFinishing ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Check size={14} />
                  Acessar Painel de Controle
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
