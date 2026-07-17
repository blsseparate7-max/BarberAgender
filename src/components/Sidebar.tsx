
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Users, 
  Scissors, 
  DollarSign, 
  TrendingUp, 
  Package, 
  Settings,
  X,
  UserCheck,
  Percent,
  CreditCard,
  Megaphone,
  Award,
  Lightbulb,
  LogOut,
  Receipt,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Box,
  PieChart,
  Heart,
  Briefcase,
  Layers,
  Ticket,
  ClipboardList,
  Wallet,
  History,
  CheckCircle2,
  PlusCircle,
  UserPlus,
  Clock,
  Ban,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  BarChart3,
  UserCog,
  FileSearch,
  Lock
} from 'lucide-react';
import { TabId, DailyCash } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { cashService } from '../services/cashService';

interface SidebarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

interface SubItem {
  id: TabId;
  label: string;
  roles: string[];
}

interface MenuItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  roles: string[];
  subItems?: SubItem[];
}

export function Sidebar({ activeTab, setActiveTab, isOpen, setIsOpen }: SidebarProps) {
  const { profile, overrideRole, setOverrideRole } = useAuth();
  const { tenant } = useTenant();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [currentCash, setCurrentCash] = useState<DailyCash | null>(null);

  useEffect(() => {
    if (profile?.tipo === 'admin' || profile?.tipo === 'gerente') {
      const unsubscribe = cashService.subscribeToCurrentCash((cash) => {
        setCurrentCash(cash);
      });
      return () => unsubscribe();
    }
  }, [profile?.tipo]);

  // Expand the menu that contains the active tab
  useEffect(() => {
    const parentMenu = MENU_STRUCTURE.find(menu => 
      menu.subItems?.some(sub => sub.id === activeTab)
    );
    if (parentMenu && !expandedMenus[parentMenu.id]) {
      setExpandedMenus(prev => ({ ...prev, [parentMenu.id]: true }));
    }
  }, [activeTab]);

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  const handleNavItemClick = (tab: TabId) => {
    setActiveTab(tab);
    if (window.innerWidth < 768) {
      setIsOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  const MENU_STRUCTURE: MenuItem[] = [
    {
      id: 'dashboard',
      label: 'Painéis & Indicadores',
      icon: <LayoutDashboard size={20} />,
      roles: ['admin', 'gerente', 'barbeiro'],
      subItems: [
        { id: 'dashboard-overview', label: 'Resumo Geral', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'dashboard-indicators', label: 'Metas da Equipe', roles: ['admin', 'gerente'] },
        { id: 'insights', label: 'Insights de IA', roles: ['admin', 'gerente'] },
        { id: 'dashboard-alerts', label: 'Alertas Operacionais', roles: ['admin', 'gerente'] },
        { id: 'dashboard-financial', label: 'Visão de Faturamento', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'agenda',
      label: 'Agenda & Atendimento',
      icon: <Calendar size={20} />,
      roles: ['admin', 'gerente', 'barbeiro', 'cliente'],
      subItems: [
        { id: 'agenda-main', label: 'Quadro de Horários', roles: ['admin', 'gerente', 'barbeiro', 'cliente'] },
        { id: 'agenda-operations', label: 'Painel de Fluxo (Salão)', roles: ['admin', 'gerente'] },
        { id: 'agenda-appointments', label: 'Lista de Reservas', roles: ['admin', 'gerente'] },
        { id: 'agenda-recurring', label: 'Horários Fixos / Recorrentes', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'comandas',
      label: 'Vendas & Caixa Diário',
      icon: <Receipt size={20} />,
      roles: ['admin', 'gerente', 'barbeiro'],
      subItems: [
        { id: 'comandas-nova', label: 'Lançar Nova Venda', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'comandas-abertas', label: 'Comandas em Aberto', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'comandas-checkout', label: 'Frente de Caixa (PDV)', roles: ['admin', 'gerente'] },
        { id: 'financeiro-caixa', label: 'Caixa de Hoje', roles: ['admin', 'gerente'] },
        { id: 'comandas-historico', label: 'Histórico de Vendas', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'comandas-fiadas', label: 'Controle de Fiados / Pendentes', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'fidelidade',
      label: 'Clientes & Fidelização',
      icon: <Users size={20} />,
      roles: ['admin', 'gerente', 'cliente', 'barbeiro'],
      subItems: [
        { id: 'cadastros-clientes', label: 'Fichas de Clientes', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'cadastros-assinantes', label: 'Planos de Assinatura (VIP)', roles: ['admin', 'gerente'] },
        { id: 'cadastros-pacotes', label: 'Pacotes de Sessões', roles: ['admin', 'gerente'] },
        { id: 'fidelidade-programa', label: 'Programa de Cashback', roles: ['admin', 'gerente', 'cliente'] },
        { id: 'cadastros-cupons', label: 'Cupons de Desconto', roles: ['admin', 'gerente'] },
        { id: 'cadastros-satisfacao', label: 'Pesquisa de Satisfação', roles: ['admin', 'gerente'] },
        { id: 'cadastros-mensagens', label: 'Mensagens Automáticas', roles: ['admin', 'gerente'] },
        { id: 'cadastros-noticias', label: 'Avisos & Promoções', roles: ['admin', 'gerente'] },
        { id: 'cadastros-lembretes', label: 'Lembretes Internos', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'comissoes',
      label: 'Equipe & Comissões',
      icon: <UserCheck size={20} />,
      roles: ['admin', 'gerente', 'barbeiro'],
      subItems: [
        { id: 'cadastros-profissionais', label: 'Cadastro de Barbeiros', roles: ['admin', 'gerente'] },
        { id: 'financeiro-comissoes', label: 'Apuração de Comissões', roles: ['admin', 'gerente'] },
        { id: 'comissoes', label: 'Minhas Comissões', roles: ['barbeiro'] },
        { id: 'dashboard-agenda', label: 'Minha Agenda de Hoje', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'agenda-availability', label: 'Escalas de Trabalho', roles: ['admin', 'gerente'] },
        { id: 'agenda-blocks', label: 'Bloqueios de Horários', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'cadastros',
      label: 'Serviços & Estoque',
      icon: <Scissors size={20} />,
      roles: ['admin', 'gerente', 'cliente', 'barbeiro'],
      subItems: [
        { id: 'cadastros-servicos', label: 'Catálogo de Serviços', roles: ['admin', 'gerente', 'cliente'] },
        { id: 'cadastros-combos', label: 'Combos Promocionais', roles: ['admin', 'gerente'] },
        { id: 'cadastros-produtos', label: 'Catálogo de Produtos', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'estoque-produtos', label: 'Controle de Estoque', roles: ['admin', 'gerente', 'barbeiro'] },
        { id: 'estoque-movimentacoes', label: 'Movimentações de Produtos', roles: ['admin', 'gerente'] },
        { id: 'estoque-inventario', label: 'Auditoria de Inventário', roles: ['admin', 'gerente'] },
        { id: 'cadastros-tipos', label: 'Categorias & Tipos', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'financeiro',
      label: 'Financeiro & Relatórios',
      icon: <DollarSign size={20} />,
      roles: ['admin', 'gerente'],
      subItems: [
        { id: 'financeiro-historico', label: 'Histórico de Fechamentos', roles: ['admin', 'gerente'] },
        { id: 'financeiro-contas-pagar', label: 'Contas a Pagar', roles: ['admin', 'gerente'] },
        { id: 'financeiro-contas-receber', label: 'Contas a Receber', roles: ['admin', 'gerente'] },
        { id: 'financeiro-fluxo', label: 'Fluxo de Caixa (DRE)', roles: ['admin', 'gerente'] },
        { id: 'cadastros-metodos-pagamento', label: 'Configurar Meios de Pgto', roles: ['admin', 'gerente'] },
        { id: 'relatorios-geral', label: 'Relatório de Desempenho', roles: ['admin', 'gerente'] },
        { id: 'relatorios-agendamentos', label: 'Análise de Agendas', roles: ['admin', 'gerente'] },
        { id: 'relatorios-clientes', label: 'Análise de Clientes', roles: ['admin', 'gerente'] },
        { id: 'relatorios-financeiro', label: 'Análise Financeira', roles: ['admin', 'gerente'] },
      ]
    },
    {
      id: 'configuracoes',
      label: 'Configurações',
      icon: <Settings size={20} />,
      roles: ['admin', 'gerente'],
      subItems: [
        { id: 'configuracoes-parametros', label: 'Dados da Barbearia', roles: ['admin', 'gerente'] },
        { id: 'configuracoes-rodizio', label: 'Regras de Rodízio', roles: ['admin', 'gerente'] },
        { id: 'configuracoes-funcionamento', label: 'Horários de Expediente', roles: ['admin', 'gerente'] },
        { id: 'admin-usuarios', label: 'Operadores & Acessos', roles: ['admin'] },
        { id: 'admin-logs', label: 'Auditoria & Logs', roles: ['admin'] },
      ]
    }
  ];

  const filteredMenu = MENU_STRUCTURE.filter(item => 
    profile && item.roles.includes(profile.tipo)
  );

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 flex flex-col 
      transition-transform duration-300 ease-in-out transform
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:translate-x-0 md:static md:w-64 lg:w-72
    `}>
      <div className="p-8 flex flex-col h-full">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="w-12 h-12 rounded-2xl object-cover shadow-xl shadow-primary/10" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20">
                <Scissors className="text-white w-6 h-6" />
              </div>
            )}
            <h1 className="text-2xl font-black tracking-tight text-primary leading-tight truncate max-w-[140px]" title={tenant?.name || "BarberElite"}>
              {tenant?.name || "BarberElite"}
            </h1>
          </div>
          <button onClick={() => setIsOpen(false)} className="md:hidden p-2.5 text-slate-400 hover:text-primary bg-slate-50 rounded-xl border border-slate-100">
            <X size={24} />
          </button>
        </div>

        <nav className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {filteredMenu.map((item) => {
            const isExpanded = expandedMenus[item.id];
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isActive = activeTab === item.id || item.subItems?.some(sub => sub.id === activeTab);

            return (
              <div key={item.id} className="space-y-1.5">
                <button 
                  onClick={() => hasSubItems ? toggleMenu(item.id) : handleNavItemClick(item.id)}
                  className={`w-full flex items-center justify-between px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all group active:scale-[0.98] ${
                    isActive 
                      ? 'bg-primary text-white shadow-lg shadow-primary/10' 
                      : 'text-muted hover:text-primary hover:bg-slate-50 border border-transparent hover:border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`${isActive ? 'text-white' : 'text-slate-400 group-hover:text-accent'} transition-colors`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </div>
                  {hasSubItems && (
                    <span className={`${isActive ? 'text-white/50' : 'text-slate-300 group-hover:text-slate-500'} transition-colors`}>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  )}
                </button>

                {hasSubItems && isExpanded && (
                  <div className="ml-10 space-y-1 border-l-2 border-slate-100 pl-5 py-1">
                    {item.subItems?.filter(sub => profile && sub.roles.includes(profile.tipo)).map(sub => (
                      <button
                        key={sub.id}
                        onClick={() => handleNavItemClick(sub.id)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] ${
                          activeTab === sub.id
                            ? 'text-accent bg-accent/5 border border-accent/10 shadow-sm'
                            : 'text-muted hover:text-primary hover:bg-slate-50'
                        }`}
                      >
                        <span>{sub.label}</span>
                        {sub.id === 'financeiro-caixa' && (profile?.tipo === 'admin' || profile?.tipo === 'gerente') && (
                          <span className={`w-1.5 h-1.5 rounded-full ${currentCash ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="pt-6 border-t border-slate-100 space-y-4">
          {profile?.isSaaSAdmin && (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
              <span className="block text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-2.5 text-center">
                ⚙️ Simulador de Perfil
              </span>
              <select
                value={profile?.tipo || 'cliente'}
                onChange={(e) => {
                  if (setOverrideRole) {
                    setOverrideRole(e.target.value as any);
                  }
                }}
                className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-[10px] font-extrabold uppercase tracking-widest text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all cursor-pointer text-center outline-none"
              >
                <option value="admin">👑 Dono (Admin)</option>
                <option value="gerente">💼 Gerente</option>
                <option value="barbeiro">💈 Barbeiro</option>
                <option value="cliente">👤 Cliente</option>
              </select>
            </div>
          )}

          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-muted hover:text-red-600 hover:bg-red-50 transition-all group active:scale-[0.98]"
          >
            <span className="text-slate-400 group-hover:text-red-600 transition-colors">
              <LogOut size={20} />
            </span>
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
