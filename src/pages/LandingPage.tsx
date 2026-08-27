import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, 
  Calendar, 
  Shield, 
  Sparkles, 
  TrendingUp, 
  User, 
  Briefcase, 
  ArrowRight, 
  CheckCircle2, 
  Phone, 
  ChevronDown, 
  Calculator, 
  Zap, 
  DollarSign, 
  Check, 
  Smartphone, 
  X, 
  ShieldCheck, 
  CreditCard
} from 'lucide-react';
import { tenantService, TenantProfile, SaaSPlan } from '../services/tenantService';

interface LandingPageProps {
  onSelectRole: (role: 'cliente' | 'profissional' | 'dono-registro' | 'cliente-registro') => void;
  activeTenant: TenantProfile | null;
}

const WHATSAPP_NUMBER = '5543999227226';
const WHATSAPP_BASE_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function LandingPage({ onSelectRole, activeTenant }: LandingPageProps) {
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Simulador de Faturamento Recorrente (Clube de Assinaturas)
  const [subscribersCount, setSubscribersCount] = useState<number>(60);
  const [subscriptionPrice, setSubscriptionPrice] = useState<number>(110);

  // Módulo selecionado no Showcase de Recursos
  const [selectedModule, setSelectedModule] = useState<number>(0);

  const isSpecificTenant = Boolean(activeTenant);

  // Cálculos do simulador
  const monthlyRevenue = subscribersCount * subscriptionPrice;
  const yearlyRevenue = monthlyRevenue * 12;

  useEffect(() => {
    // Carregar planos SaaS cadastrados no Portal SaaS
    tenantService.listPlans()
      .then((list) => {
        setPlans(list.filter(p => p.active !== false));
      })
      .catch((err) => console.error('Erro ao carregar planos SaaS:', err));
  }, []);

  const handleDisconnectTenant = () => {
    localStorage.removeItem('barberelite_tenant_id');
    const url = new URL(window.location.href);
    url.searchParams.delete('tenant');
    url.searchParams.delete('tenantId');
    window.history.pushState({}, '', url.pathname + url.search);
    window.location.reload();
  };

  const getWhatsAppLink = (message: string) => {
    return `${WHATSAPP_BASE_URL}?text=${encodeURIComponent(message)}`;
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const showcaseModules = [
    {
      title: "Clube de Assinaturas",
      tag: "Recorrência Mensal",
      icon: Sparkles,
      headline: "Receita Garantida no Início do Mês",
      description: "Crie planos mensais para corte e barba com cobrança automática no Cartão de Crédito integrada via Asaas. O cliente assina uma vez e a mensalidade cai no seu caixa todo mês com previsibilidade total.",
      benefits: [
        "Cobrança recorrente no Cartão de Crédito sem complicação",
        "Abatimento automático de créditos de cortes no caixa",
        "Fim do faturamento instável em dias chuvosos ou semanas lentas",
        "Fidelização absoluta do cliente contra a concorrência"
      ],
      previewStats: {
        label: "Receita Recorrente Estimada",
        val: `R$ ${monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`,
        sub: `${subscribersCount} assinantes ativos no seu clube`
      }
    },
    {
      title: "Agendamento Online 24h",
      tag: "Zero WhatsApp",
      icon: Calendar,
      headline: "Seus Clientes Agendam Sozinhos em 10 Segundos",
      description: "Disponibilize um link exclusivo na bio do Instagram e WhatsApp da sua barbearia. O cliente escolhe o barbeiro favorito, o serviço e a hora sem precisar mandar mensagem.",
      benefits: [
        "Link personalizado e QR Code para balcão e redes",
        "Lembretes automáticos de horário que evitam faltas",
        "Sem necessidade de baixar aplicativo pesado",
        "Disponibilidade 24 horas por dia, 7 dias por semana"
      ],
      previewStats: {
        label: "Agendamentos Concluídos",
        val: "+85% no automático",
        sub: "Barbeiros 100% focados na cadeira"
      }
    },
    {
      title: "Comissões & Barbeiros",
      tag: "Sem Conflitos",
      icon: DollarSign,
      headline: "Cálculo Exato de Comissões e Extrato no Celular",
      description: "Defina porcentagens personalizadas por profissional para serviços e produtos. O sistema desconta taxas e vales automaticamente com total transparência.",
      benefits: [
        "Comissões diferenciadas por serviço e produto",
        "Divisão proporcional de taxas de maquininha",
        "Controle transparente de vales e adiantamentos",
        "Fechamento semanal ou mensal em 1 clique"
      ],
      previewStats: {
        label: "Fechamento de Comissões",
        val: "100% Automático",
        sub: "Extrato transparente no celular do barbeiro"
      }
    },
    {
      title: "Comandas & Frente de Caixa",
      tag: "Agilidade",
      icon: Briefcase,
      headline: "Frente de Caixa (PDV) Rápida e Estoque Integrado",
      description: "Abra e feche comandas em segundos. Lance cervejas, pomadas e minoxidil junto aos cortes com múltiplos métodos de pagamento e baixa de estoque.",
      benefits: [
        "Comandas individuais para múltiplos serviços e produtos",
        "Pagamento em Pix, Cartão, Dinheiro e Saldo do Clube",
        "Alerta de estoque baixo para reposição de produtos",
        "Fechamento cego de caixa para evitar divergências"
      ],
      previewStats: {
        label: "Velocidade de Caixa",
        val: "< 15 segundos",
        sub: "Lançar, cobrar e fechar a comanda"
      }
    }
  ];

  const faqs = [
    {
      question: "Como funciona o teste grátis para a minha barbearia?",
      answer: "É muito simples e sem burocracia! Você entra em contato com o nosso suporte pelo WhatsApp, nós ativamos o ambiente exclusivo da sua barbearia em menos de 5 minutos e liberamos o acesso para você e sua equipe testarem na prática."
    },
    {
      question: "Como funciona o Clube de Assinaturas (recorrência)?",
      answer: "O sistema possui integração nativa com o Asaas para cobrança recorrente automática no Cartão de Crédito. Seus clientes assinam o plano mensal (ex: 4 cortes/mês por R$ 110), a mensalidade renova automaticamente todo mês e o sistema controla os cortes disponíveis."
    },
    {
      question: "Preciso instalar algum aplicativo ou programa pesado?",
      answer: "Não! O nosso sistema é 100% em nuvem. Você, seus barbeiros e seus clientes podem acessar pelo celular, tablet ou computador direto pelo navegador, com máxima velocidade e sem ocupar memória do aparelho."
    },
    {
      question: "Como funciona o cálculo de comissão dos barbeiros?",
      answer: "O sistema calcula tudo automaticamente em tempo real! Você define a porcentagem de comissão por profissional para serviços e produtos. Cada barbeiro visualiza seu extrato individual no celular, eliminando cadernos e planilhas."
    },
    {
      question: "Como os meus clientes realizam o agendamento?",
      answer: "Sua barbearia recebe um link exclusivo (ex: app.rull.com.br/suabarbearia ou QR Code) para colocar na bio do Instagram e WhatsApp. O cliente escolhe o barbeiro, data e horário em poucos toques."
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500 selection:text-zinc-950">
      {/* Luzes de Fundo Ambientais */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed top-1/3 right-10 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* Banner Superior se acessado com contexto de barbearia específica */}
      {isSpecificTenant && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/30 px-4 py-2 text-xs text-emerald-200 sticky top-0 z-50 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>
                Barbearia ativa: <strong className="text-white font-bold">{activeTenant.name}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  localStorage.setItem('barberelite_tenant_id', activeTenant.id);
                  onSelectRole('cliente');
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-3.5 py-1 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Calendar size={13} />
                <span>Agendar Horário</span>
              </button>
              <button
                onClick={handleDisconnectTenant}
                className="text-zinc-400 hover:text-white underline text-[11px] transition-colors"
              >
                Ver Sistema Geral
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Fixo Minimalista */}
      <header className={`border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky ${isSpecificTenant ? 'top-[37px]' : 'top-0'} z-40`} id="landing-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          
          {/* Logo */}
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-zinc-950 font-black shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight text-white block leading-tight">
                Rull
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest block">
                Sistema para Barbearias
              </span>
            </div>
          </div>

          {/* Links de Navegação */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-zinc-400">
            <button 
              onClick={() => scrollToSection('clube-assinaturas')} 
              className="hover:text-emerald-400 transition-colors flex items-center gap-1.5"
            >
              <Sparkles size={14} className="text-emerald-400" />
              <span>Clube de Assinaturas</span>
            </button>

            <button 
              onClick={() => scrollToSection('recursos')} 
              className="hover:text-white transition-colors"
            >
              Recursos
            </button>

            <button 
              onClick={() => scrollToSection('simulador')} 
              className="hover:text-white transition-colors"
            >
              Simulador
            </button>

            <button 
              onClick={() => scrollToSection('planos')} 
              className="hover:text-white transition-colors"
            >
              Planos
            </button>

            <button 
              onClick={() => scrollToSection('faq')} 
              className="hover:text-white transition-colors"
            >
              Dúvidas
            </button>
          </nav>

          {/* Ações de Conversão & Login */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onSelectRole('profissional')}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-all flex items-center gap-2"
              title="Acessar painel da barbearia ou agendamento"
            >
              <User size={15} className="text-emerald-400" />
              <span>Entrar no Sistema</span>
            </button>

            <a
              href={getWhatsAppLink("Olá! Gostaria de falar com o suporte para testar o sistema na minha barbearia.")}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all shadow-lg shadow-emerald-500/15 flex items-center gap-2 hover:scale-[1.02] shrink-0"
            >
              <Phone size={15} />
              <span className="hidden sm:inline">Testar Grátis</span>
              <span className="sm:hidden">Testar</span>
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-16 md:pt-20 md:pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6 max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs text-emerald-400 font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gestão Completa & Clube de Assinaturas no Cartão</span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08] text-white">
            A sua barbearia com <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">faturamento garantido</span> todo mês.
          </h1>

          <p className="text-base sm:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed">
            Elimine a instabilidade nos dias lentos. Tenha <strong className="text-zinc-200">Clube de Assinaturas recorrente no Cartão</strong>, agendamento online 24h na bio e fechamento de comissões sem complicações.
          </p>

          {/* Botão de Ação Principal */}
          <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={getWhatsAppLink("Olá! Quero solicitar um teste grátis do sistema para a minha barbearia.")}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-8 py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 hover:scale-[1.02]"
            >
              <Phone size={20} />
              <span>Solicitar Teste Grátis no WhatsApp</span>
            </a>

            <button
              onClick={() => scrollToSection('simulador')}
              className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-6 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
            >
              <Calculator size={18} className="text-emerald-400" />
              <span>Simular Lucro Recorrente</span>
            </button>
          </div>

          {/* Selos de Garantia */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-zinc-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Recorrência Automática (Asaas)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Agendamento 24h sem App</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Comissões no Celular</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-500" />
              <span>Suporte Humanizado</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Pilar Principal: Clube de Assinaturas */}
      <section className="relative z-10 bg-gradient-to-b from-zinc-900/40 to-zinc-950 border-y border-zinc-900 py-20" id="clube-assinaturas">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
            <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
              Diferencial Competitivo
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
              Por que ter um Clube de Assinaturas na sua barbearia?
            </h2>
            <p className="text-zinc-400 text-base leading-relaxed">
              O modelo tradicional sofre com semanas paradas e dias chuvosos. Com o Clube de Assinaturas, você garante o pagamento fixo no dia 1, receba o cliente cortando ou não!
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-4 hover:border-emerald-500/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp size={24} />
              </div>
              <h3 className="text-xl font-bold text-white">Receita Fixa & Previsível</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Saiba exatamente quanto vai faturar no início do mês. Honre seus compromissos com tranquilidade e invista na expansão da barbearia.
              </p>
            </div>

            <div className="bg-zinc-900/50 border border-emerald-500/40 p-8 rounded-3xl space-y-4 relative shadow-xl shadow-emerald-500/5 hover:border-emerald-500 transition-all">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                100% Automático
              </span>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Zap size={24} />
              </div>
              <h3 className="text-xl font-bold text-white">Cobrança no Cartão (Asaas)</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                A mensalidade renova a cada 30 dias automaticamente no cartão do cliente. Sem necessidade de cobrar comprovantes no balcão.
              </p>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-4 hover:border-emerald-500/30 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Shield size={24} />
              </div>
              <h3 className="text-xl font-bold text-white">Fidelização Blindada</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Clientes assinantes não frequentam a concorrência. Eles mantêm o visual sempre em dia e consomem mais produtos do seu estoque.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Showcase dos 4 Módulos do Sistema */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20" id="recursos">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            Módulos Essenciais
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            Tudo o que sua barbearia precisa em um só lugar
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">
            Selecione abaixo e veja como cada módulo otimiza a rotina da sua equipe:
          </p>
        </div>

        {/* Abas dos Módulos */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-4 max-w-4xl mx-auto scrollbar-none mb-8">
          {showcaseModules.map((mod, idx) => {
            const Icon = mod.icon;
            const isSelected = selectedModule === idx;
            return (
              <button
                key={`showcase-tab-${idx}`}
                onClick={() => setSelectedModule(idx)}
                className={`px-4 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20 scale-[1.02]'
                    : 'bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                <Icon size={16} className={isSelected ? 'text-zinc-950' : 'text-emerald-400'} />
                <span>{mod.title}</span>
              </button>
            );
          })}
        </div>

        {/* Card do Módulo Selecionado */}
        <div className="max-w-5xl mx-auto bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="grid md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7 space-y-6">
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full inline-block">
                {showcaseModules[selectedModule].tag}
              </span>

              <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                {showcaseModules[selectedModule].headline}
              </h3>

              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                {showcaseModules[selectedModule].description}
              </p>

              <ul className="space-y-3 pt-2">
                {showcaseModules[selectedModule].benefits.map((b, bIdx) => (
                  <li key={bIdx} className="flex items-start gap-3 text-xs sm:text-sm text-zinc-300 font-medium">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4">
                <a
                  href={getWhatsAppLink(`Olá! Tenho interesse no módulo "${showcaseModules[selectedModule].title}" e quero testar no sistema.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 hover:scale-[1.02]"
                >
                  <Phone size={15} />
                  <span>Testar Este Módulo no WhatsApp</span>
                </a>
              </div>
            </div>

            {/* Mockup do Módulo */}
            <div className="md:col-span-5 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-xl relative">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Painel Rull</span>
              </div>

              <div className="space-y-4">
                <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                    {showcaseModules[selectedModule].previewStats.label}
                  </span>
                  <div className="text-2xl font-black text-emerald-400">
                    {showcaseModules[selectedModule].previewStats.val}
                  </div>
                  <span className="text-[11px] text-zinc-500 block">
                    {showcaseModules[selectedModule].previewStats.sub}
                  </span>
                </div>

                <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-zinc-400 font-semibold">
                    <span>Status do Sistema:</span>
                    <span className="text-emerald-400 flex items-center gap-1 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Ativo em Nuvem
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400 font-semibold">
                    <span>Sincronização:</span>
                    <span className="text-white font-bold">Tempo Real</span>
                  </div>
                  <div className="flex items-center justify-between text-zinc-400 font-semibold">
                    <span>Disponibilidade:</span>
                    <span className="text-white font-bold">100% Mobile & Web</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Simulador Interativo de Faturamento */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="simulador">
        <div className="max-w-5xl mx-auto bg-zinc-900/60 border border-zinc-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden space-y-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

          {/* Header do Simulador */}
          <div className="text-center space-y-3 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold border border-emerald-500/20">
              <Calculator size={14} />
              <span>Calculadora de Recorrência</span>
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              Quanto a sua barbearia pode faturar no piloto automático?
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base">
              Ajuste a quantidade de assinantes e o valor da mensalidade para ver a receita garantida do seu clube:
            </p>
          </div>

          {/* Grid de Sliders e Projeção */}
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-8 bg-zinc-950/60 border border-zinc-800/80 p-6 sm:p-8 rounded-3xl">
              {/* Slider Assinantes */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300 font-bold">Número de Clientes Assinantes:</span>
                  <span className="text-emerald-400 font-black text-lg bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                    {subscribersCount} assinantes
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={subscribersCount}
                  onChange={(e) => setSubscribersCount(Number(e.target.value))}
                  className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>10 clientes</span>
                  <span>150 clientes</span>
                  <span>300 clientes</span>
                </div>
              </div>

              {/* Slider Mensalidade */}
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-zinc-300 font-bold">Valor Médio da Mensalidade:</span>
                  <span className="text-emerald-400 font-black text-lg bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/20">
                    R$ {subscriptionPrice},00/mês
                  </span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="250"
                  step="5"
                  value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(Number(e.target.value))}
                  className="w-full h-2.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>R$ 60/mês</span>
                  <span>R$ 150/mês</span>
                  <span>R$ 250/mês</span>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3 text-xs text-zinc-400">
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                <span>Cobrança automática recorrente via Cartão de Crédito com integração Asaas.</span>
              </div>
            </div>

            {/* Projeção de Faturamento */}
            <div className="lg:col-span-5 bg-gradient-to-b from-zinc-950 to-zinc-900 border border-emerald-500/40 p-8 rounded-3xl text-center space-y-6 shadow-2xl relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                Receita Estimada
              </span>

              <div className="space-y-1 pt-2">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Faturamento Mensal Fixo</span>
                <div className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight">
                  R$ {monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <span className="text-[11px] text-zinc-500 block">Entra no caixa todo mês com previsibilidade</span>
              </div>

              <div className="border-t border-zinc-800/80 pt-4 space-y-1">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Acumulado em 1 Ano</span>
                <div className="text-2xl sm:text-3xl font-black text-white">
                  R$ {yearlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <a
                href={getWhatsAppLink(`Olá! Simulei um faturamento de R$ ${monthlyRevenue.toLocaleString('pt-BR')}/mês com ${subscribersCount} assinantes e quero criar o Clube de Assinaturas na minha barbearia!`)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 hover:scale-[1.02]"
              >
                <Sparkles size={16} />
                <span>Ativar Clube na Minha Barbearia</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Planos Oficiais do Sistema (Puxados do PortalSaaS) */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="planos">
        <div className="text-center mb-16 space-y-4">
          <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            Planos Oficiais do Sistema
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Planos Sob Medida para a sua Barbearia
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto text-sm sm:text-base">
            Valores transparentes e contratação sem fidelidade. O cadastro e ativação são feitos na hora com nosso suporte!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.length > 0 ? (
            plans.map((p, pIdx) => (
              <div 
                key={`lp-plan-${p.id || pIdx}-${pIdx}`} 
                className={`bg-zinc-900/40 border p-8 rounded-3xl flex flex-col justify-between transition-all relative group hover:scale-[1.01] ${
                  p.popular 
                    ? 'border-emerald-500 bg-zinc-900/70 shadow-xl shadow-emerald-500/10' 
                    : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                    Mais Escolhido
                  </span>
                )}

                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-white">{p.name}</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{p.description || 'Plano completo de gestão e agendamento para sua barbearia.'}</p>
                  </div>

                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-black text-white">R$ {p.priceMonthly}</span>
                      <span className="text-zinc-500 text-xs font-bold ml-1">/mês</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-semibold mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1 px-3 inline-block">
                      Até {p.maxBarbers > 90 ? 'Ilimitados' : p.maxBarbers} profissionais
                    </p>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Recursos Inclusos:</p>
                    <ul className="space-y-2.5 text-xs text-zinc-300">
                      {(p.features && p.features.length > 0) ? (
                        p.features.map((feat, idx) => (
                          <li key={`feat-${p.id || pIdx}-${idx}`} className="flex items-center gap-2.5">
                            <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                            <span>{feat}</span>
                          </li>
                        ))
                      ) : (
                        <>
                          <li className="flex items-center gap-2.5">
                            <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                            <span>Agendamento Online 24h</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                            <span>Clube de Assinaturas (Recorrência)</span>
                          </li>
                          <li className="flex items-center gap-2.5">
                            <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                            <span>Controle de Comandas & Comissões</span>
                          </li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink(`Olá! Gostaria de testar e cadastrar minha barbearia no plano "${p.name}" (R$ ${p.priceMonthly}/mês).`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all ${
                      p.popular
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 hover:scale-[1.02]'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                    }`}
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>
            ))
          ) : (
            /* Fallback de apresentação se ainda não houverem planos criados no PortalSaaS */
            <>
              <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-between transition-all hover:border-zinc-700">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-white">Plano Start</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">Ideal para barbeiros autônomos e barbearias em início de operação.</p>
                  </div>

                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-black text-white">R$ 99</span>
                      <span className="text-zinc-500 text-xs font-bold ml-1">/mês</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-semibold mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1 px-3 inline-block">
                      Até 3 profissionais
                    </p>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Incluso no plano:</p>
                    <ul className="space-y-2.5 text-xs text-zinc-300">
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Agendamento Online 24h</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Clube de Assinaturas (Recorrência)</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Controle de Comandas & Caixa</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Start" (R$ 99/mês).')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all bg-zinc-800 hover:bg-zinc-700 text-white"
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>

              <div className="bg-zinc-900/70 border border-emerald-500 p-8 rounded-3xl flex flex-col justify-between transition-all relative shadow-xl shadow-emerald-500/10 group hover:scale-[1.01]">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                  Mais Escolhido
                </span>

                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-white">Plano Pro</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">Perfeito para barbearias consolidadas com equipes completas.</p>
                  </div>

                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-black text-white">R$ 199</span>
                      <span className="text-zinc-500 text-xs font-bold ml-1">/mês</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-semibold mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1 px-3 inline-block">
                      Até 8 profissionais
                    </p>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Incluso no plano:</p>
                    <ul className="space-y-2.5 text-xs text-zinc-300">
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Tudo do Plano Start</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Comissões Automáticas Avançadas</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Gestão Financeira & Estoque</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Pro" (R$ 199/mês).')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 hover:scale-[1.02]"
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-800 p-8 rounded-3xl flex flex-col justify-between transition-all hover:border-zinc-700">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-2xl font-black text-white">Plano Elite</h4>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">A solução completa e ilimitada para grandes barbearias e redes.</p>
                  </div>

                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-black text-white">R$ 299</span>
                      <span className="text-zinc-500 text-xs font-bold ml-1">/mês</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-semibold mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1 px-3 inline-block">
                      Profissionais Ilimitados
                    </p>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Incluso no plano:</p>
                    <ul className="space-y-2.5 text-xs text-zinc-300">
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Tudo do Plano Pro</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Suporte Prioritário VIP</span>
                      </li>
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Treinamento de Equipe Especializado</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Elite" (R$ 299/mês).')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all bg-zinc-800 hover:bg-zinc-700 text-white"
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Dúvidas Frequentes (FAQ Accordion) */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 py-20 border-t border-zinc-900" id="faq">
        <div className="text-center mb-16 space-y-4">
          <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            Tire Suas Dúvidas
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            Perguntas Frequentes
          </h2>
          <p className="text-zinc-400 text-sm">
            Tudo o que você precisa saber sobre o cadastro, teste e funcionamento do sistema.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div 
                key={`faq-item-${index}`}
                className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 font-bold text-white hover:text-emerald-400 transition-colors"
                >
                  <span className="text-sm sm:text-base">{faq.question}</span>
                  <ChevronDown 
                    size={18} 
                    className={`text-zinc-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`} 
                  />
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-6 pb-5 text-xs sm:text-sm text-zinc-400 leading-relaxed border-t border-zinc-800/40 pt-4">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA Final */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900">
        <div className="bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-zinc-950 border border-emerald-500/30 rounded-[2.5rem] p-10 sm:p-16 text-center space-y-6 max-w-5xl mx-auto relative overflow-hidden shadow-2xl">
          <div className="space-y-3">
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Pronto para levar sua barbearia ao próximo nível?
            </h2>
            <p className="text-zinc-400 text-sm sm:text-base max-w-xl mx-auto">
              Fale agora mesmo com nossa equipe de suporte pelo WhatsApp. Criamos o acesso da sua barbearia na hora para você testar gratuitamente!
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={getWhatsAppLink("Olá! Gostaria de falar com o suporte para testar e cadastrar o sistema na minha barbearia.")}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-8 py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 hover:scale-[1.02]"
            >
              <Phone size={20} />
              <span>Chamar Suporte no WhatsApp</span>
            </a>

            <button
              onClick={() => onSelectRole('profissional')}
              className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 px-8 py-4 rounded-2xl font-bold text-base transition-all"
            >
              Fazer Login
            </button>
          </div>
        </div>
      </section>

      {/* Footer Minimalista */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-12 px-6 text-zinc-500 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-zinc-950 font-black">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-zinc-200">Rull — Sistema para Barbearias</span>
              <p className="text-[11px] text-zinc-500">Gestão Completa, Agendamento Online & Clube de Assinaturas</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-zinc-400 font-semibold">
            <button onClick={() => scrollToSection('clube-assinaturas')} className="hover:text-emerald-400 transition-colors">
              Clube de Assinaturas
            </button>
            <button onClick={() => scrollToSection('recursos')} className="hover:text-emerald-400 transition-colors">
              Recursos
            </button>
            <button onClick={() => scrollToSection('planos')} className="hover:text-emerald-400 transition-colors">
              Planos
            </button>
            <button onClick={() => onSelectRole('profissional')} className="hover:text-emerald-400 transition-colors">
              Entrar no Sistema
            </button>
            <a 
              href={getWhatsAppLink("Olá! Gostaria de falar com o suporte do sistema Rull.")}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              Suporte WhatsApp: (43) 99922-7226
            </a>
          </div>

          <div className="text-zinc-600 text-center md:text-right">
            © {new Date().getFullYear()} Rull Barbearias. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
