
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { Agenda } from './pages/Agenda';
import { Clientes } from './pages/Clientes';
import { Barbeiros } from './pages/Barbeiros';
import { Servicos } from './pages/Servicos';
import { Comandas } from './pages/Comandas';
import { Financeiro } from './pages/Financeiro';
import { Comissoes } from './pages/Comissoes';
import { Relatorios } from './pages/Relatorios';
import { Estoque } from './pages/Estoque';
import { Assinaturas } from './pages/Assinaturas';
import { Pacotes } from './pages/Pacotes';
import { Fidelidade } from './pages/Fidelidade';
import { Marketing } from './pages/Marketing';
import { Insights } from './pages/Insights';
import { Configuracoes } from './pages/Configuracoes';
import { PaymentMethodManager } from './components/PaymentMethodManager';
import { CashWidget } from './components/Financeiro/CashWidget';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { TabId, Stats } from './types';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { PagePlaceholder } from './components/PagePlaceholder';

// Novas importações de submenus solicitados
import { Tipos } from './pages/Tipos';
import { Combos } from './pages/Combos';
import { MensagensUsuarios } from './pages/MensagensUsuarios';
import { NoticiasPromocoes } from './pages/NoticiasPromocoes';
import { PesquisaSatisfacao } from './pages/PesquisaSatisfacao';
import { Lembretes } from './pages/Lembretes';
import { CuponsDesconto } from './pages/CuponsDesconto';
import { LandingPage } from './pages/LandingPage';
import { PortalCliente } from './pages/PortalCliente';
import { PortalBarbeiro } from './pages/PortalBarbeiro';
import PortalSaaSAdmin from './pages/PortalSaaSAdmin';
import { OnboardingWelcome } from './components/OnboardingWelcome';

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
    if (showLanding) {
      return (
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
            } else { // 'profissional'
              setInitialRegisterRole('cliente');
              setAuthView('login');
              setShowLanding(false);
            }
          }}
        />
      );
    }

    if (authView === 'register') {
      return (
        <RegisterPage 
          initialRole={initialRegisterRole}
          onLoginClick={() => setAuthView('login')} 
          onBackToLanding={() => setShowLanding(true)}
        />
      );
    }
    if (authView === 'forgot') {
      return <ForgotPasswordPage onLoginClick={() => setAuthView('login')} />;
    }
    return (
      <LoginPage 
        onRegisterClick={() => {
          setInitialRegisterRole('cliente');
          setAuthView('register');
        }} 
        onForgotClick={() => setAuthView('forgot')}
        onBackToLanding={() => setShowLanding(true)}
      />
    );
  }

  // Portal do Superadministrador SaaS
  if (profile && profile.tipo === 'saas_admin') {
    return <PortalSaaSAdmin />;
  }

  // Portal do Cliente
  if (profile && profile.tipo === 'cliente') {
    return <PortalCliente profile={profile} />;
  }

  // Portal do Barbeiro
  if (profile && profile.tipo === 'barbeiro') {
    return <PortalBarbeiro profile={profile} />;
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
    if (activeTab === 'cadastros-clientes') return <Clientes />;
    if (activeTab === 'cadastros-profissionais') return <Barbeiros />;
    if (activeTab === 'cadastros-servicos') return <Servicos />;
    if (activeTab === 'cadastros-pacotes') return <Pacotes />;
    if (activeTab === 'cadastros-pacotes-meus') return <Pacotes defaultTab="meus_pacotes" />;
    if (activeTab === 'cadastros-assinantes') return <Assinaturas defaultTab="assinantes" />;
    if (activeTab === 'cadastros-planos') return <Assinaturas defaultTab="planos" />;
    if (activeTab === 'cadastros-consumo') return <Pacotes defaultTab="pacotes_consumo" />;
    if (activeTab === 'cadastros-assinaturas') return <Assinaturas />;
    if (activeTab === 'cadastros-tipos') return <Tipos />;
    if (activeTab === 'cadastros-mensagens') return <MensagensUsuarios />;
    if (activeTab === 'cadastros-noticias') return <NoticiasPromocoes />;
    if (activeTab === 'cadastros-satisfacao') return <PesquisaSatisfacao />;
    if (activeTab === 'cadastros-lembretes') return <Lembretes />;
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
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
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
