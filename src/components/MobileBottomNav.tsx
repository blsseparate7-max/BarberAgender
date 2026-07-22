import React from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Receipt, 
  Scissors, 
  Menu,
  DollarSign
} from 'lucide-react';
import { TabId } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface MobileBottomNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  onOpenMenu: () => void;
}

export function MobileBottomNav({ activeTab, setActiveTab, onOpenMenu }: MobileBottomNavProps) {
  const { profile } = useAuth();

  // If client or saas_admin, they have their own dedicated portals
  if (!profile || profile.tipo === 'cliente' || profile.tipo === 'saas_admin') {
    return null;
  }

  const isDashboardActive = activeTab === 'dashboard' || activeTab.startsWith('dashboard-');
  const isAgendaActive = activeTab === 'agenda' || activeTab.startsWith('agenda-');
  const isVendasActive = activeTab === 'comandas' || activeTab.startsWith('comandas-') || activeTab.startsWith('financeiro-caixa');
  const isServicosActive = activeTab === 'cadastros' || activeTab.startsWith('cadastros-');

  return (
    <nav 
      aria-label="Navegação rápida mobile" 
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] flex items-center justify-around"
    >
      {/* 1. Dashboard */}
      <button
        onClick={() => setActiveTab('dashboard-overview' as TabId)}
        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${
          isDashboardActive 
            ? 'text-primary font-black scale-105' 
            : 'text-slate-400 hover:text-slate-600 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-lg ${isDashboardActive ? 'bg-primary/10 text-primary' : ''}`}>
          <LayoutDashboard size={20} />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight truncate">Painel</span>
      </button>

      {/* 2. Agenda */}
      <button
        onClick={() => setActiveTab('agenda-main' as TabId)}
        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${
          isAgendaActive 
            ? 'text-primary font-black scale-105' 
            : 'text-slate-400 hover:text-slate-600 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-lg ${isAgendaActive ? 'bg-primary/10 text-primary' : ''}`}>
          <Calendar size={20} />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight truncate">Agenda</span>
      </button>

      {/* 3. Vendas / Caixa */}
      <button
        onClick={() => setActiveTab('comandas-abertas' as TabId)}
        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${
          isVendasActive 
            ? 'text-primary font-black scale-105' 
            : 'text-slate-400 hover:text-slate-600 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-lg ${isVendasActive ? 'bg-primary/10 text-primary' : ''}`}>
          <Receipt size={20} />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight truncate">Vendas</span>
      </button>

      {/* 4. Serviços & Estoque */}
      <button
        onClick={() => setActiveTab('cadastros-servicos' as TabId)}
        className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all min-w-[60px] ${
          isServicosActive 
            ? 'text-primary font-black scale-105' 
            : 'text-slate-400 hover:text-slate-600 font-semibold'
        }`}
      >
        <div className={`p-1 rounded-lg ${isServicosActive ? 'bg-primary/10 text-primary' : ''}`}>
          <Scissors size={20} />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight truncate">Catálogo</span>
      </button>

      {/* 5. Menu Completo (Abre o Drawer) */}
      <button
        onClick={onOpenMenu}
        className="flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all text-slate-500 hover:text-primary min-w-[60px]"
      >
        <div className="p-1 rounded-lg bg-slate-100 text-slate-700">
          <Menu size={20} />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight font-bold text-slate-600">Menu</span>
      </button>
    </nav>
  );
}
