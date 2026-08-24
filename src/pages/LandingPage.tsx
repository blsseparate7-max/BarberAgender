import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, 
  Calendar, 
  Shield, 
  Sparkles, 
  TrendingUp, 
  User, 
  Users, 
  Briefcase, 
  ArrowRight, 
  Star, 
  CheckCircle2, 
  Phone, 
  ChevronDown, 
  Calculator, 
  Zap, 
  DollarSign, 
  Clock, 
  Check, 
  Layers, 
  Smartphone, 
  BarChart3, 
  X, 
  MessageSquare,
  Building2,
  Lock,
  Search,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
  Award,
  CreditCard
} from 'lucide-react';
import { tenantService, TenantProfile, SaaSPlan } from '../services/tenantService';
import { LandingForum } from '../components/landing/LandingForum';

interface LandingPageProps {
  onSelectRole: (role: 'cliente' | 'profissional' | 'dono-registro' | 'cliente-registro') => void;
  activeTenant: TenantProfile | null;
}

const WHATSAPP_NUMBER = '5543999227226';
const WHATSAPP_BASE_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function LandingPage({ onSelectRole, activeTenant }: LandingPageProps) {
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'apresentacao' | 'forum' | 'simulador' | 'planos'>('apresentacao');

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
    // Carregar planos SaaS cadastrados no sistema
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

  const showcaseModules = [
    {
      title: "Clube de Assinaturas (Recorrência)",
      tag: "Mais Lucro",
      icon: Sparkles,
      headline: "Receita Previsível no Piloto Automático",
      description: "Crie planos mensais para corte e barba com cobrança automática no Cartão de Crédito integrada com o Asaas. O cliente assina uma vez e a mensalidade cai no seu caixa todo mês, cortando ou não.",
      benefits: [
        "Cobrança recorrente automática no Cartão de Crédito",
        "Abatimento automático de créditos de cortes na comanda",
        "Fim do faturamento instável em dias chuvosos",
        "Retenção de clientes blindada contra a concorrência"
      ],
      previewStats: {
        label: "Receita Recorrente Estimada",
        val: "R$ 6.600,00/mês",
        sub: "60 clientes a R$ 110/mês garantidos"
      }
    },
    {
      title: "Agendamento Online 24h",
      tag: "Zero WhatsApp",
      icon: Calendar,
      headline: "Seus Clientes Agendam Sozinhos em 10 Segundos",
      description: "Disponibilize um link exclusivo na bio do Instagram e WhatsApp da sua barbearia. O cliente escolhe o barbeiro favorito, o serviço, a data e a hora sem precisar mandar mensagem nem parar o corte de ninguém.",
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
      description: "Defina porcentagens personalizadas por profissional para serviços e produtos. O sistema desconta taxas de cartão e vales automaticamente, permitindo que cada barbeiro acompanhe seus ganhos em tempo real.",
      benefits: [
        "Comissões diferenciadas por serviço e produto",
        "Divisão proporcional de taxas de máquina de cartão",
        "Controle transparente de vales e adiantamentos",
        "Fechamento semanal ou mensal em 1 clique com relatório"
      ],
      previewStats: {
        label: "Fechamento de Comissões",
        val: "100% Automático",
        sub: "Extrato diário no celular de cada barbeiro"
      }
    },
    {
      title: "Comandas & Frente de Caixa",
      tag: "Agilidade",
      icon: Briefcase,
      headline: "Frente de Caixa (PDV) Rápida e Estoque Integrado",
      description: "Abra e feche comandas em segundos. Lance cervejas, pomadas, minoxidil e gorjetas junto aos cortes com múltiplos métodos de pagamento e baixa instantânea de estoque.",
      benefits: [
        "Comandas individuais com múltiplos serviços e produtos",
        "Pagamento em Dinheiro, Pix, Débito, Crédito e Clube",
        "Alerta de estoque baixo para reposição imediata",
        "Fechamento de caixa cego para evitar divergências"
      ],
      previewStats: {
        label: "Velocidade de Caixa",
        val: "< 15 segundos",
        sub: "Para lançar, cobrar e emitir comprovante"
      }
    },
    {
      title: "Painel do Barbeiro no Celular",
      tag: "Praticidade",
      icon: Smartphone,
      headline: "Tudo o que o Barbeiro Precisa na Palma da Mão",
      description: "Cada colaborador tem seu próprio acesso restrito no celular para ver a grade de horários, adicionar observações sobre os clientes e checar sua produção diária sem ter acesso aos dados confidenciais do dono.",
      benefits: [
        "Acesso restrito e seguro por login individual",
        "Visualização clara dos horários do dia",
        "Histórico de preferências de corte de cada cliente",
        "Motivação diária com visualização dos ganhos"
      ],
      previewStats: {
        label: "Satisfação da Equipe",
        val: "10x mais foco",
        sub: "Fim das planilhas e cadernos de papel"
      }
    },
    {
      title: "DRE & Gestão Financeira",
      tag: "Controle Total",
      icon: BarChart3,
      headline: "Lucratividade Real e Controle Financeiro Blindado",
      description: "Saiba exatamente para onde vai cada centavo da sua barbearia. Tenha controle de contas a pagar, custos fixos, faturamento bruto e lucro líquido real com gráficos intuitivos.",
      benefits: [
        "DRE Gerencial e Fluxo de Caixa Diário",
        "Controle de Contas a Pagar (aluguel, água, energia, produtos)",
        "Gráficos de serviços mais rentáveis e horários de pico",
        "Exportação de relatórios em PDF e planilhas"
      ],
      previewStats: {
        label: "Saúde Financeira",
        val: "Controle 360°",
        sub: "Decisões baseadas em números reais"
      }
    }
  ];

  const faqs = [
    {
      question: "Como funciona o teste grátis para a minha barbearia?",
      answer: "É muito simples e sem burocracia! Você entra em contato com o nosso suporte pelo WhatsApp, nós criamos o ambiente exclusivo da sua barbearia em menos de 5 minutos, configuramos seus serviços e liberamos o acesso para você e toda a sua equipe testarem na prática."
    },
    {
      question: "Como funciona o Clube de Assinaturas (recorrência)?",
      answer: "O sistema possui integração nativa com o Asaas para cobrança recorrente automática no Cartão de Crédito. Seus clientes assinam um plano mensal (ex: 4 cortes/mês por R$ 110), a mensalidade é cobrada automaticamente todo mês e o sistema controla os cortes utilizados."
    },
    {
      question: "Preciso instalar algum aplicativo ou programa pesado?",
      answer: "Não! O nosso sistema é 100% em nuvem (PWA). Você, seus barbeiros e seus clientes podem acessar pelo celular, tablet ou computador através do navegador, com máxima velocidade e sem ocupar memória do aparelho."
    },
    {
      question: "Como funciona a comissão dos barbeiros?",
      answer: "O sistema calcula tudo automaticamente em tempo real! Você define a porcentagem de comissão para cada profissional por serviço ou produto. Cada barbeiro tem seu próprio login para conferir o extrato diário, eliminando brigas e planilhas de papel."
    },
    {
      question: "Como os meus clientes vão agendar?",
      answer: "Sua barbearia recebe um link exclusivo e personalizado (ex: app.rull.com.br/suabarbearia ou QR Code) para colocar na bio do Instagram, no WhatsApp e no balcão. O cliente escolhe o barbeiro, data e horário em segundos."
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500 selection:text-zinc-950">
      {/* Luzes de Fundo Ambientais */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 right-10 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[160px] pointer-events-none -z-10" />

      {/* Banner Superior caso acesse com link de barbearia específica */}
      {isSpecificTenant && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-4 py-2.5 text-xs text-emerald-200 sticky top-0 z-50 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>
                Você está acessando a página da barbearia: <strong className="text-white font-bold">{activeTenant.name}</strong>
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
                Ver Plataforma Geral
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Fixo */}
      <header className={`border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky ${isSpecificTenant ? 'top-[41px]' : 'top-0'} z-40`} id="landing-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-4">
          
          {/* Logo */}
          <div 
            onClick={() => setActiveTab('apresentacao')}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-zinc-950 font-black shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent block leading-tight">
                Rull
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest block">
                Sistema para Barbearias
              </span>
            </div>
          </div>

          {/* Navegação Principal por Abas */}
          <nav className="hidden lg:flex items-center gap-1 bg-zinc-900/70 p-1.5 rounded-2xl border border-zinc-800/80 text-xs font-bold">
            <button
              onClick={() => {
                setActiveTab('apresentacao');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'apresentacao'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Zap size={14} />
              <span>Apresentação & Recursos</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('forum');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'forum'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md font-black'
                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/60'
              }`}
            >
              <MessageSquare size={14} className={activeTab === 'forum' ? 'text-zinc-950' : 'text-emerald-400'} />
              <span>Fórum & Assinaturas</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.2 rounded font-black ml-0.5">
                NOVO
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('simulador');
                const el = document.getElementById('simulador');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'simulador'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <Calculator size={14} />
              <span>Simulador de Lucro</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('planos');
                const el = document.getElementById('planos');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
                activeTab === 'planos'
                  ? 'bg-emerald-500 text-zinc-950 shadow-md font-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
              }`}
            >
              <CreditCard size={14} />
              <span>Planos</span>
            </button>
          </nav>

          {/* Ações de Conversão & Login */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onSelectRole('profissional')}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 transition-all flex items-center gap-2"
              title="Acessar painel da barbearia ou agendamento"
            >
              <User size={15} className="text-emerald-400" />
              <span>Entrar no Sistema</span>
            </button>

            <a
              href={getWhatsAppLink("Olá! Gostaria de falar com o suporte para testar e cadastrar o sistema na minha barbearia.")}
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

        {/* Barra de Abas Mobile */}
        <div className="lg:hidden flex items-center justify-around border-t border-zinc-900/80 bg-zinc-950/95 px-2 py-1.5 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab('apresentacao')}
            className={`py-1 px-2.5 rounded-lg flex items-center gap-1 ${
              activeTab === 'apresentacao' ? 'bg-emerald-500 text-zinc-950 font-black' : 'text-zinc-400'
            }`}
          >
            <Zap size={12} />
            <span>Recursos</span>
          </button>

          <button
            onClick={() => setActiveTab('forum')}
            className={`py-1 px-2.5 rounded-lg flex items-center gap-1 ${
              activeTab === 'forum' ? 'bg-emerald-500 text-zinc-950 font-black' : 'text-emerald-400'
            }`}
          >
            <MessageSquare size={12} />
            <span>Fórum & Dúvidas</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('apresentacao');
              setTimeout(() => {
                const el = document.getElementById('simulador');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            className="py-1 px-2.5 rounded-lg text-zinc-400 flex items-center gap-1"
          >
            <Calculator size={12} />
            <span>Simulador</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('apresentacao');
              setTimeout(() => {
                const el = document.getElementById('planos');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }}
            className="py-1 px-2.5 rounded-lg text-zinc-400 flex items-center gap-1"
          >
            <CreditCard size={12} />
            <span>Planos</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Renderizado com Base na Aba Ativa */}
      {activeTab === 'forum' ? (
        <LandingForum />
      ) : (
        <>
          {/* Hero Section (Foco em Vendas e Recorrência) */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 pt-12 pb-16 md:pt-20 md:pb-24 text-center" id="hero">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs text-emerald-400 font-bold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                <span>O Sistema Definitivo de Gestão e Clube de Assinaturas</span>
              </div>

              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08] text-white">
                Transforme sua barbearia em uma <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">máquina de receita previsível</span>
              </h1>

              <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed">
                Acabe com a instabilidade de faturamento nos dias lentos. Tenha <strong className="text-zinc-200">Clube de Assinaturas automático no Cartão de Crédito</strong>, agendamento online 24h, cálculo exato de comissões e fechamento de caixa blindado.
              </p>

              {/* Botões de Ação Hero */}
              <div className="pt-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a
                  href={getWhatsAppLink("Olá! Quero solicitar um teste grátis do sistema para a minha barbearia.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-8 py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/25 hover:scale-[1.02]"
                >
                  <Phone size={20} />
                  <span>Solicitar Teste Grátis no WhatsApp</span>
                </a>

                <button
                  onClick={() => setActiveTab('forum')}
                  className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 px-6 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
                >
                  <MessageSquare size={18} />
                  <span>Ver Fórum & Guia de Assinaturas</span>
                </button>
              </div>

              {/* Selos de Confiança */}
              <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-zinc-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Recorrência no Cartão (Asaas)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Comissões Automáticas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>100% em Nuvem (Sem Instalar)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span>Suporte Humanizado</span>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Destaque: O Poder do Clube de Assinaturas (Estilo CashBarber / Ravus) */}
          <section className="relative z-10 bg-gradient-to-b from-zinc-900/40 to-zinc-950 border-y border-zinc-900 py-20" id="clube-assinaturas">
            <div className="max-w-7xl mx-auto px-6">
              <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full">
                  O Maior Diferencial do Mercado
                </span>
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                  Por que as barbearias de elite usam o Clube de Assinaturas?
                </h2>
                <p className="text-zinc-400 text-base leading-relaxed">
                  O modelo tradicional de barbearia sofre com dias de chuva, feriados e semanas fracas. Com o Clube de Assinaturas do nosso sistema, você garante o faturamento fixo todo mês, receba o cliente cortando ou não!
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-4 hover:border-emerald-500/30 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <TrendingUp size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-white">Receita Fixa & Previsível</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Saiba exatamente quanto vai entrar no seu caixa no primeiro dia do mês. Pague suas contas com tranquilidade e invista no crescimento da sua barbearia.
                  </p>
                </div>

                <div className="bg-zinc-900/50 border border-emerald-500/40 p-8 rounded-3xl space-y-4 relative shadow-xl shadow-emerald-500/5 hover:border-emerald-500 transition-all">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                    100% Automático
                  </span>
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Zap size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-white">Cobrança Direta via Asaas</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Cobrança recorrente no Cartão de Crédito com baixa automática. A cada 30 dias a mensalidade renova sozinha sem você precisar cobrar comprovante no balcão.
                  </p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-4 hover:border-emerald-500/30 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Shield size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-white">Fidelização Blindada</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">
                    Clientes que assinam o clube não vão na concorrência! Eles frequentam sua barbearia com mais frequência e consomem muito mais produtos do seu estoque.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Showcase Interativo de Módulos (Estilo Pontualíssimo / AppBarber) */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 py-20" id="showcase-modulos">
            <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                Tudo o que sua barbearia precisa
              </span>
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                Construído para quem vive o dia a dia da barbearia
              </h2>
              <p className="text-zinc-400 text-sm sm:text-base">
                Clique nos módulos abaixo e conheça como cada parte do sistema resolve problemas reais:
              </p>
            </div>

            {/* Abas dos Módulos */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 max-w-5xl mx-auto scrollbar-none mb-8">
              {showcaseModules.map((mod, idx) => {
                const Icon = mod.icon;
                const isSelected = selectedModule === idx;
                return (
                  <button
                    key={idx}
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

            {/* Painel do Módulo Selecionado */}
            <div className="max-w-5xl mx-auto bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
              <div className="grid md:grid-cols-12 gap-8 items-center">
                {/* Texto e Benefícios */}
                <div className="md:col-span-7 space-y-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                      {showcaseModules[selectedModule].tag}
                    </span>
                  </div>

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
                      href={getWhatsAppLink(`Olá! Vi o recurso de "${showcaseModules[selectedModule].title}" no site e gostaria de testar na minha barbearia.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-6 py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 hover:scale-[1.02]"
                    >
                      <Phone size={15} />
                      <span>Testar Este Recurso no WhatsApp</span>
                    </a>
                  </div>
                </div>

                {/* Mockup / Card Visual do Módulo */}
                <div className="md:col-span-5 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-xl relative">
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500/80" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                    </div>
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Painel Operacional</span>
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
                        <span>Acesso Mobile:</span>
                        <span className="text-white font-bold">Liberado (PWA)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Simulador Interativo de Faturamento com Mockup da Tela Real do Sistema */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="simulador">
            <div className="max-w-6xl mx-auto bg-zinc-900/60 border border-zinc-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl relative overflow-hidden space-y-12">
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

              {/* Header do Simulador */}
              <div className="text-center space-y-3 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold border border-emerald-500/20">
                  <Calculator size={14} />
                  <span>Simulador de Lucro do Clube & Demonstração da Tela</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
                  Quanto a sua barbearia pode faturar no piloto automático?
                </h2>
                <p className="text-zinc-400 text-sm sm:text-base">
                  Arraste os controles abaixo, veja a mágica da recorrência e confira exatamente como a tela do Clube de Assinaturas funciona dentro do sistema:
                </p>
              </div>

              {/* Grid: Sliders de Controle + Resultado Financeiro */}
              <div className="grid lg:grid-cols-12 gap-8 items-center">
                {/* Controles e Sliders */}
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

                  {/* Resumo Rápido */}
                  <div className="pt-2 flex items-center gap-3 text-xs text-zinc-400">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>Calculado com base em cobrança recorrente automática no Cartão de Crédito via Asaas.</span>
                  </div>
                </div>

                {/* Card de Faturamento Estimado */}
                <div className="lg:col-span-5 bg-gradient-to-b from-zinc-950 to-zinc-900 border border-emerald-500/40 p-8 rounded-3xl text-center space-y-6 shadow-2xl relative">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                    Projeção em Tempo Real
                  </span>

                  <div className="space-y-1 pt-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Receita Mensal Garantida (MRR)</span>
                    <div className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tight">
                      R$ {monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[11px] text-zinc-500 block">Cai no seu caixa todo mês com previsibilidade</span>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-4 space-y-1">
                    <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Faturamento Anual Recorrente</span>
                    <div className="text-2xl sm:text-3xl font-black text-white">
                      R$ {yearlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  <a
                    href={getWhatsAppLink(`Olá! Simulei um faturamento de R$ ${monthlyRevenue.toLocaleString('pt-BR')}/mês com ${subscribersCount} assinantes e quero ativar o Clube de Assinaturas na minha barbearia!`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15 hover:scale-[1.02]"
                  >
                    <Sparkles size={16} />
                    <span>Ativar Clube na Minha Barbearia</span>
                  </a>
                </div>
              </div>

              {/* MOCKUP INTERATIVO: Demonstração da Tela Real do Sistema na Aba de Assinaturas */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                      Tela Real do Sistema
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      Visão do Painel: Clube de Assinaturas & Recorrência
                    </h3>
                  </div>
                  <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Sincronizado com os sliders acima
                  </span>
                </div>

                {/* Moldura da Interface do Software */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl">
                  {/* Topo da Janela do App */}
                  <div className="bg-zinc-900/80 px-6 py-4 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                      </div>
                      <div className="h-4 w-px bg-zinc-800 mx-1" />
                      <div className="flex items-center gap-2 text-xs font-bold text-zinc-300">
                        <Sparkles size={14} className="text-emerald-400" />
                        <span>Módulo: Gestão do Clube de Assinaturas</span>
                      </div>
                    </div>

                    {/* Abas simuladas do sistema */}
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="bg-emerald-500 text-zinc-950 px-3 py-1 rounded-lg">
                        Assinantes Ativos ({subscribersCount})
                      </span>
                      <span className="text-zinc-400 bg-zinc-800/60 px-3 py-1 rounded-lg hidden sm:inline-block">
                        Planos Cadastrados (3)
                      </span>
                      <span className="text-zinc-400 bg-zinc-800/60 px-3 py-1 rounded-lg hidden sm:inline-block">
                        Extrato Asaas
                      </span>
                    </div>
                  </div>

                  {/* Corpo da Tela do Sistema */}
                  <div className="p-6 sm:p-8 space-y-6">
                    {/* Linha de KPIs do Painel da Barbearia */}
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl space-y-1">
                        <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">MRR (Faturamento Recorrente)</span>
                        <div className="text-2xl font-black text-emerald-400">
                          R$ {monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[10px] text-emerald-500/90 font-semibold flex items-center gap-1">
                          <TrendingUp size={11} /> +100% garantido no início do mês
                        </span>
                      </div>

                      <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl space-y-1">
                        <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Membros Ativos no Clube</span>
                        <div className="text-2xl font-black text-white">{subscribersCount} Clientes</div>
                        <span className="text-[10px] text-zinc-500 font-semibold">
                          Renovação automática no Cartão
                        </span>
                      </div>

                      <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl space-y-1">
                        <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Integração Financeira</span>
                        <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 pt-1">
                          <ShieldCheck size={16} /> Gateway Asaas Conectado
                        </div>
                        <span className="text-[10px] text-zinc-500 font-semibold">
                          Taxas reduzidas e repasse seguro
                        </span>
                      </div>
                    </div>

                    {/* Tabela / Lista Real de Assinantes Simulada */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-2">
                        <span>Últimas Assinaturas Recorrentes Processadas:</span>
                        <span className="text-emerald-400 text-[11px]">Cobrança em Cartão de Crédito</span>
                      </div>

                      <div className="space-y-2">
                        {/* Assinante 1 */}
                        <div className="bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/40 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
                              LF
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white">Lucas Ferreira</span>
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                                  PLANO VIP CABELO & BARBA
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400">Cartão Mastercard **** 8821 • R$ {subscriptionPrice},00/mês</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs self-end sm:self-auto">
                            <div className="text-right">
                              <span className="text-emerald-400 font-bold block">4/4 Cortes Restantes</span>
                              <span className="text-[10px] text-zinc-500">Renovado automaticamente</span>
                            </div>
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1">
                              <CheckCircle2 size={12} /> Ativo
                            </span>
                          </div>
                        </div>

                        {/* Assinante 2 */}
                        <div className="bg-zinc-900/40 border border-zinc-800/80 hover:border-emerald-500/40 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-sm shrink-0">
                              MA
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white">Matheus Albuquerque</span>
                                <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full">
                                  PLANO CORTE ILIMITADO
                                </span>
                              </div>
                              <p className="text-xs text-zinc-400">Cartão Visa **** 4119 • R$ {subscriptionPrice},00/mês</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs self-end sm:self-auto">
                            <div className="text-right">
                              <span className="text-emerald-400 font-bold block">Cortes Abatidos no PDV</span>
                              <span className="text-[10px] text-zinc-500">Saldo atualizado na comanda</span>
                            </div>
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1">
                              <CheckCircle2 size={12} /> Ativo
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Comparativo Visual: Sem o Sistema vs Com o Sistema */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="comparativo">
            <div className="text-center mb-16 space-y-4">
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                Comparativo Real
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Como é o dia a dia na sua barbearia hoje?
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
              {/* Card Negativo (Sem Sistema) */}
              <div className="bg-red-950/20 border border-red-500/20 p-8 rounded-3xl space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 font-black">
                    <X size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-red-200">Sem o Sistema Rull</h3>
                </div>
                <ul className="space-y-4 text-sm text-zinc-400">
                  <li className="flex items-start gap-3">
                    <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Faturamento instável que cai drasticamente em dias de chuva e início de semana.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Barbeiros parando o corte a todo momento para responder agendamento no WhatsApp.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Horas perdidas no fim de semana calculando comissões em papéis ou planilhas confusas.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <X size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <span>Clientes esquecendo horários marcados e deixando a cadeira vazia.</span>
                  </li>
                </ul>
              </div>

              {/* Card Positivo (Com Sistema) */}
              <div className="bg-emerald-950/20 border border-emerald-500/40 p-8 rounded-3xl space-y-6 shadow-xl shadow-emerald-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-black">
                    <Check size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-emerald-300">Com o Sistema Rull</h3>
                </div>
                <ul className="space-y-4 text-sm text-zinc-300">
                  <li className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Receita previsível e garantida todo mês com o Clube de Assinaturas automático.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Clientes agendam sozinhos 24h pelo link personalizado na bio do Instagram.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Comissões fechadas em 1 clique com transparência e histórico para os profissionais.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>Frente de caixa, controle de comandas, estoque e financeiro 100% blindados.</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Planos e Valores */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="planos">
            <div className="text-center mb-16 space-y-4">
              <span className="text-emerald-400 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                Investimento Inteligente
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                Planos Sob Medida para o Tamanho da sua Equipe
              </h2>
              <p className="text-zinc-400 max-w-xl mx-auto text-sm sm:text-base">
                Sem pegadinhas ou taxas escondidas. O cadastro e ativação do teste grátis são realizados diretamente pelo nosso suporte!
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {plans.length > 0 ? (
                plans.map((p) => (
                  <div 
                    key={p.id} 
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
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{p.description}</p>
                  </div>

                  <div>
                    <div className="flex items-baseline">
                      <span className="text-4xl font-black text-white">R$ {p.priceMonthly}</span>
                      <span className="text-zinc-500 text-xs font-bold ml-1">/mês</span>
                    </div>
                    <p className="text-xs text-emerald-400 font-semibold mt-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg py-1 px-3 inline-block">
                      Até {p.maxBarbers} profissionais/barbeiros
                    </p>
                  </div>

                  <div className="border-t border-zinc-800/80 pt-5 space-y-3">
                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Incluso no plano:</p>
                    <ul className="space-y-2.5 text-xs text-zinc-300">
                      {(p.features || []).map((feat, idx) => (
                        <li key={idx} className="flex items-center gap-2.5">
                          <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink(`Olá! Gostaria de testar e cadastrar minha barbearia no plano "${p.name}" (R$ ${p.priceMonthly}/mês, até ${p.maxBarbers} barbeiros).`)}
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
            /* Fallback default plans */
            <>
              {/* Bronze */}
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
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Painel do Barbeiro no Celular</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Start" (R$ 99/mês, até 3 barbeiros).')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all bg-zinc-800 hover:bg-zinc-700 text-white"
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>

              {/* Silver (Popular) */}
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
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Relatórios Gerenciais Exportáveis</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Pro" (R$ 199/mês, até 8 barbeiros).')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full block py-4 px-4 rounded-xl font-black text-xs text-center uppercase tracking-widest transition-all bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 hover:scale-[1.02]"
                  >
                    Solicitar Teste Grátis
                  </a>
                </div>
              </div>

              {/* Gold */}
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
                      <li className="flex items-center gap-2.5">
                        <CheckCircle2 className="text-emerald-500 w-4 h-4 shrink-0" />
                        <span>Consultoria de Ativação do Clube</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8">
                  <a 
                    href={getWhatsAppLink('Olá! Gostaria de testar e cadastrar minha barbearia no plano "Elite" (R$ 299/mês, Barbeiros Ilimitados).')}
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

      {/* Dúvidas Frequentes (FAQ) */}
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
                key={index}
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
              Pronto para levar sua barbearia para o próximo nível?
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
      </>
      )}

      {/* Footer Profissional */}
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
            <button onClick={() => setActiveTab('apresentacao')} className="hover:text-emerald-400 transition-colors">
              Recursos
            </button>
            <button onClick={() => setActiveTab('forum')} className="hover:text-emerald-400 transition-colors text-emerald-400">
              Fórum & Dúvidas
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
