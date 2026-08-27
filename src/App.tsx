
import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PaymentMethodManager } from './components/PaymentMethodManager';
import { CashWidget } from './components/Financeiro/CashWidget';
import { TabId, Stats } from './types';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2, Lock } from 'lucide-react';
import { PagePlaceholder } from './components/PagePlaceholder';
import { OnboardingWelcome } from './components/OnboardingWelcome';
import { MobileBottomNav } from './components/MobileBottomNav';

// Code-split dynamic page imports with React.lazy
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Agenda = React.lazy(() => import('./pages/Agenda').then(m => ({ default: m.Agenda })));
const Clientes = React.lazy(() => import('./pages/Clientes').then(m => ({ default: m.Clientes })));
const Barbeiros = React.lazy(() => import('./pages/Barbeiros').then(m => ({ default: m.Barbeiros })));
const Servicos = React.lazy(() => import('./pages/Servicos').then(m => ({ default: m.Servicos })));
const Comandas = React.lazy(() => import('./pages/Comandas').then(m => ({ default: m.Comandas })));
const Financeiro = React.lazy(() => import('./pages/Financeiro').then(m => ({ default: m.Financeiro })));
const Comissoes = React.lazy(() => import('./pages/Comissoes').then(m => ({ default: m.Comissoes })));
const Relatorios = React.lazy(() => import('./pages/Relatorios').then(m => ({ default: m.Relatorios })));
const Estoque = React.lazy(() => import('./pages/Estoque').then(m => ({ default: m.Estoque })));
const Assinaturas = React.lazy(() => import('./pages/Assinaturas').then(m => ({ default: m.Assinaturas })));
const Pacotes = React.lazy(() => import('./pages/Pacotes').then(m => ({ default: m.Pacotes })));
const Fidelidade = React.lazy(() => import('./pages/Fidelidade').then(m => ({ default: m.Fidelidade })));
const Marketing = React.lazy(() => import('./pages/Marketing').then(m => ({ default: m.Marketing })));
const Insights = React.lazy(() => import('./pages/Insights').then(m => ({ default: m.Insights })));
const Configuracoes = React.lazy(() => import('./pages/Configuracoes').then(m => ({ default: m.Configuracoes })));
const LoginPage = React.lazy(() => import('./pages/Login').then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import('./pages/Register').then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPassword').then(m => ({ default: m.ForgotPasswordPage })));
const Tipos = React.lazy(() => import('./pages/Tipos').then(m => ({ default: m.Tipos })));
const Combos = React.lazy(() => import('./pages/Combos').then(m => ({ default: m.Combos })));
const MensagensUsuarios = React.lazy(() => import('./pages/MensagensUsuarios').then(m => ({ default: m.MensagensUsuarios })));
const NoticiasPromocoes = React.lazy(() => import('./pages/NoticiasPromocoes').then(m => ({ default: m.NoticiasPromocoes })));
const PesquisaSatisfacao = React.lazy(() => import('./pages/PesquisaSatisfacao').then(m => ({ default: m.PesquisaSatisfacao })));
const Lembretes = React.lazy(() => import('./pages/Lembretes').then(m => ({ default: m.Lembretes })));
const CuponsDesconto = React.lazy(() => import('./pages/CuponsDesconto').then(m => ({ default: m.CuponsDesconto })));
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const PortalCliente = React.lazy(() => import('./pages/PortalCliente').then(m => ({ default: m.PortalCliente })));
const PortalBarbeiro = React.lazy(() => import('./pages/PortalBarbeiro').then(m => ({ default: m.PortalBarbeiro })));
const PortalSaaSAdmin = React.lazy(() => import('./pages/PortalSaaSAdmin'));

const PageLoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[350px] w-full p-8">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="animate-spin text-accent w-9 h-9" />
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
        Carregando...
      </span>
    </div>
  </div>
);

const initialStats: Stats = {
  revenue: 12450.00,
  appointments: 48,
  newClients: 12,
  averageTicket: 85.50
};

function MainApp() {
  const { user, profile, loading } = useAuth();
  const { tenant, loading: tenantLoading } = useTenant();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot'>('login');
  const [showLanding, setShowLanding] = useState(true);
  const [initialRegisterRole, setInitialRegisterRole] = useState<'cliente' | 'admin'>('cliente');
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('link_client_id') || params.get('link_id')) {
      setShowLanding(false);
      setAuthView('register');
    }
  }, []);

  useEffect(() => {
    if (profile && (profile.tipo === 'admin' || profile.tipo === 'gerente') && !profile.onboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [profile]);

  // Redirect to permitted tabs based on role to avoid missing permissions errors on mounted pages
  useEffect(() => {
    if (!profile) return;
    
    const role = profile.tipo;
    let isAllowed = false;
    
    if (role === 'admin' || role === 'gerente') {
      isAllowed = true;
    } else if (role === 'barbeiro') {
      const allowedPatterns = [
        'dashboard-overview', 'dashboard', 'agenda-main', 'agenda',
        'comandas', 'comissoes', 'estoque', 'cadastros-clientes', 'fidelidade'
      ];
      isAllowed = allowedPatterns.some(p => activeTab === p || activeTab.startsWith(p + '-'));
    } else if (role === 'cliente') {
      const allowedPatterns = [
        'agenda-main', 'agenda', 'cadastros-pacotes-meus'
      ];
      isAllowed = allowedPatterns.some(p => activeTab === p || activeTab.startsWith(p + '-'));
    }
    
    if (!isAllowed) {
      if (role === 'barbeiro') {
        setActiveTab('dashboard-overview');
      } else if (role === 'cliente') {
        setActiveTab('agenda-main');
      } else {
        setActiveTab('dashboard');
      }
    }
  }, [profile?.tipo, activeTab]);

  if (loading || tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent w-12 h-12" />
          <p className="text-muted font-medium tracking-widest uppercase text-[10px]">
            Carregando {tenant?.name || 'BarberElite'}...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        {showLanding ? (
          <LandingPage 
            activeTenant={tenant}
            onSelectRole={(roleType) => {
              if (roleType === 'dono-registro') {
                setInitialRegisterRole('admin');
                setAuthView('register');
                setShowLanding(false);
              } else if (roleType === 'cliente') {
                setInitialRegisterRole('cliente');
                setAuthView('login');
                setShowLanding(false);
              } else if (roleType === 'cliente-registro') {
                setInitialRegisterRole('cliente');
                setAuthView('register');
                setShowLanding(false);
              } else { // 'profissional'
                setInitialRegisterRole('cliente');
                setAuthView('login');
                setShowLanding(false);
              }
            }}
          />
        ) : authView === 'register' ? (
          <RegisterPage 
            initialRole={initialRegisterRole}
            onLoginClick={() => setAuthView('login')} 
            onBackToLanding={() => setShowLanding(true)}
          />
        ) : authView === 'forgot' ? (
          <ForgotPasswordPage onLoginClick={() => setAuthView('login')} />
        ) : (
          <LoginPage 
            onRegisterClick={() => {
              setInitialRegisterRole('cliente');
              setAuthView('register');
            }} 
            onForgotClick={() => setAuthView('forgot')}
            onBackToLanding={() => setShowLanding(true)}
          />
        )}
      </Suspense>
    );
  }

  if (user && !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent w-12 h-12" />
          <p className="text-muted font-medium tracking-widest uppercase text-[10px]">
            Finalizando configuração da conta...
          </p>
        </div>
      </div>
    );
  }

  // Portal do Superadministrador SaaS
  if (profile && profile.tipo === 'saas_admin') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <PortalSaaSAdmin />
      </Suspense>
    );
  }

  // Portal do Cliente
  if (profile && profile.tipo === 'cliente') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <PortalCliente profile={profile} />
      </Suspense>
    );
  }

  // Portal do Barbeiro
  if (profile && profile.tipo === 'barbeiro') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <PortalBarbeiro profile={profile} />
      </Suspense>
    );
  }

  const renderContent = () => {
    // Dashboard
    if (activeTab === 'dashboard' || activeTab.startsWith('dashboard-')) {
      return <Dashboard stats={initialStats} setActiveTab={setActiveTab} activeSubTab={activeTab} />;
    }
    
    // Agenda
    if (activeTab === 'agenda' || activeTab.startsWith('agenda-')) {
      return profile ? <Agenda currentUser={profile} activeTab={activeTab} /> : null;
    }

    // Cadastros
    if (activeTab === 'cadastros') return <Servicos />;
    if (activeTab === 'cadastros-clientes') return <Clientes />;
    if (activeTab === 'cadastros-profissionais') return <Barbeiros />;
    if (activeTab === 'cadastros-servicos') return <Servicos />;
    if (activeTab === 'cadastros-pacotes') return <Pacotes />;
    if (activeTab === 'cadastros-pacotes-meus') return <Pacotes defaultTab="meus_pacotes" />;
    if (activeTab === 'cadastros-assinantes') {
      if (tenant?.subscriptions_enabled !== true) {
        return (
          <div className="p-8 max-w-xl mx-auto text-center space-y-4 bg-white border border-slate-200 rounded-[2rem] shadow-sm my-12">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Lock size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">Módulo de Assinaturas Desativado</h3>
            <p className="text-sm text-slate-600 font-medium">
              O Clube de Assinaturas e planos VIP não estão ativos no momento para esta barbearia. Solicite a ativação ao administrador do sistema SaaS.
            </p>
          </div>
        );
      }
      return <Assinaturas defaultTab="assinantes" />;
    }
    if (activeTab === 'cadastros-planos') {
      if (tenant?.subscriptions_enabled !== true) return null;
      return <Assinaturas defaultTab="planos" />;
    }
    if (activeTab === 'cadastros-assinaturas') {
      if (tenant?.subscriptions_enabled !== true) return null;
      return <Assinaturas />;
    }
    if (activeTab === 'cadastros-tipos') return <Tipos />;
    if (activeTab === 'cadastros-mensagens') return <MensagensUsuarios />;
    if (activeTab === 'cadastros-noticias') return <NoticiasPromocoes />;
    if (activeTab === 'cadastros-satisfacao') return <PesquisaSatisfacao />;
    if (activeTab === 'cadastros-lembretes') return <Lembretes />;
    if (activeTab === 'cadastros-pacotes') return <Pacotes />;
    if (activeTab === 'cadastros-produtos') return <Estoque />;
    if (activeTab === 'cadastros-cupons') return <CuponsDesconto />;
    if (activeTab === 'cadastros-metodos-pagamento') return <PaymentMethodManager />;
    if (activeTab === 'cadastros-combos') return <Combos />;
    if (activeTab === 'cadastros-categorias') return <Tipos defaultTab="categorias" />;
    
    if (activeTab.startsWith('cadastros-')) return <Clientes />; 

    // Comandas
    if (activeTab === 'comandas' || activeTab.startsWith('comandas-')) {
      return <Comandas activeSubTab={activeTab} />;
    }

    // Financeiro
    if (activeTab === 'financeiro' || activeTab.startsWith('financeiro-')) {
      return <Financeiro activeSubTab={activeTab} />;
    }

    // Estoque
    if (activeTab === 'estoque' || activeTab.startsWith('estoque-')) {
      return <Estoque />;
    }

    // Relatorios
    if (activeTab === 'relatorios' || activeTab.startsWith('relatorios-')) {
      return <Relatorios activeSubTab={activeTab} />;
    }

    // Fidelidade
    if (activeTab === 'fidelidade' || activeTab.startsWith('fidelidade-')) {
      return <Fidelidade activeSubTab={activeTab} />;
    }

    // Configuracoes / Admin
    if (activeTab === 'configuracoes' || activeTab.startsWith('configuracoes-') || activeTab === 'admin' || activeTab.startsWith('admin-')) {
      return <Configuracoes activeSubTab={activeTab} />;
    }

    switch (activeTab) {
      case 'comissoes': return <Comissoes />;
      case 'marketing': return <Marketing />;
      case 'insights': return <Insights />;
      default: return <Dashboard stats={initialStats} setActiveTab={setActiveTab} activeSubTab={activeTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-primary font-sans selection:bg-accent/30 selection:text-accent overflow-x-hidden">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingWelcome 
            profile={profile!} 
            onClose={() => setShowOnboarding(false)} 
            onNavigate={(tabId) => setActiveTab(tabId as any)} 
          />
        )}
      </AnimatePresence>

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />
      
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Header setSidebarOpen={setSidebarOpen} onProfileClick={() => setActiveTab('configuracoes-perfil' as any)} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Suspense fallback={<PageLoadingFallback />}>
                  {renderContent()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <MobileBottomNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onOpenMenu={() => setSidebarOpen(true)} 
      />

      <CashWidget onNavigate={(tabId) => setActiveTab(tabId as TabId)} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <TenantProvider>
          <Toaster position="top-right" richColors closeButton />
          <MainApp />
        </TenantProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
