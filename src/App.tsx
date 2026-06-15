
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
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';
import { PagePlaceholder } from './components/PagePlaceholder';

// Novas importações de submenus solicitados
import { Tipos } from './pages/Tipos';
import { MensagensUsuarios } from './pages/MensagensUsuarios';
import { NoticiasPromocoes } from './pages/NoticiasPromocoes';
import { PesquisaSatisfacao } from './pages/PesquisaSatisfacao';
import { Lembretes } from './pages/Lembretes';
import { CuponsDesconto } from './pages/CuponsDesconto';

const initialStats: Stats = {
  revenue: 12450.00,
  appointments: 48,
  newClients: 12,
  averageTicket: 85.50
};

function MainApp() {
  const { user, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot'>('login');

  // Remover redirecionamento forçado para permitir dashboard do cliente
  /*
  useEffect(() => {
    if (profile?.tipo === 'cliente' && (activeTab === 'dashboard' || activeTab.startsWith('dashboard-'))) {
      setActiveTab('agenda');
    }
  }, [profile, activeTab]);
  */

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent w-12 h-12" />
          <p className="text-muted font-medium tracking-widest uppercase text-[10px]">Carregando BarberElite...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'register') {
      return <RegisterPage onLoginClick={() => setAuthView('login')} />;
    }
    if (authView === 'forgot') {
      return <ForgotPasswordPage onLoginClick={() => setAuthView('login')} />;
    }
    return (
      <LoginPage 
        onRegisterClick={() => setAuthView('register')} 
        onForgotClick={() => setAuthView('forgot')}
      />
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
    if (activeTab === 'cadastros-clientes') return <Clientes />;
    if (activeTab === 'cadastros-profissionais') return <Barbeiros />;
    if (activeTab === 'cadastros-servicos') return <Servicos />;
    if (activeTab === 'cadastros-pacotes') return <Assinaturas defaultTab="pacotes" />;
    if (activeTab === 'cadastros-pacotes-meus') return <Assinaturas defaultTab="pacotes" />;
    if (activeTab === 'cadastros-assinantes') return <Assinaturas defaultTab="assinantes" />;
    if (activeTab === 'cadastros-planos') return <Assinaturas defaultTab="planos" />;
    if (activeTab === 'cadastros-consumo') return <Assinaturas defaultTab="consumo" />;
    if (activeTab === 'cadastros-assinaturas') return <Assinaturas />;
    if (activeTab === 'cadastros-tipos') return <Tipos />;
    if (activeTab === 'cadastros-mensagens') return <MensagensUsuarios />;
    if (activeTab === 'cadastros-noticias') return <NoticiasPromocoes />;
    if (activeTab === 'cadastros-satisfacao') return <PesquisaSatisfacao />;
    if (activeTab === 'cadastros-lembretes') return <Lembretes />;
    if (activeTab === 'cadastros-produtos') return <Estoque />;
    if (activeTab === 'cadastros-cupons') return <CuponsDesconto />;
    if (activeTab === 'cadastros-metodos-pagamento') return <PaymentMethodManager />;
    if (activeTab === 'cadastros-combos') return <PagePlaceholder title="Gestão de Combos" tabId={activeTab} onBack={() => setActiveTab('dashboard')} />;
    if (activeTab === 'cadastros-categorias') return <PagePlaceholder title="Categorias" tabId={activeTab} onBack={() => setActiveTab('dashboard')} />;
    
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
      case 'comissoes': return <Financeiro activeSubTab="financeiro-comissoes" />;
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

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
      />
      
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        <Header setSidebarOpen={setSidebarOpen} />
        
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
        <Toaster position="top-right" richColors closeButton />
        <MainApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
