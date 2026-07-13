
import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Users, 
  Clock, 
  Star, 
  Scissors, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  AlertCircle, 
  CheckCircle2, 
  Wallet, 
  Percent, 
  BarChart3, 
  PieChart, 
  Activity, 
  CalendarCheck, 
  UserCheck, 
  Loader2, 
  Filter, 
  Download, 
  RefreshCw,
  History,
  Target,
  Award,
  Zap,
  Lock,
  Unlock,
  CreditCard,
  ArrowRight,
  Copy,
  MapPin,
  Phone,
  Mail,
  Share2,
  Gift
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { dashboardService } from '../services/dashboardService';
import { settingsService } from '../services/settingsService';
import { toast } from 'sonner';
import { Appointment, FinancialTransaction, Commission, UserProfile, TabId } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';

export function Dashboard({ stats: initialStats, setActiveTab, activeSubTab }: { stats: any, setActiveTab: (tab: TabId) => void, activeSubTab?: string }) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [activeInternalTab, setActiveInternalTab] = useState('overview');

  useEffect(() => {
    if (activeSubTab) {
      const tabMap: Record<string, string> = {
        'dashboard-overview': 'overview',
        'dashboard-indicators': 'indicators',
        'dashboard-alerts': 'alerts',
        'dashboard-financial': 'financial',
        'dashboard-agenda': 'agenda'
      };
      const targetInternalTab = tabMap[activeSubTab];
      if (targetInternalTab) {
        setActiveInternalTab(targetInternalTab);
      }
    }
  }, [activeSubTab]);

  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date())
  });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange.start.getTime(), dateRange.end.getTime(), profile?.uid]);

  const loadDashboardData = async () => {
    if (!user || !profile) return;
    setLoading(true);
    setError(null);
    try {
      if (isAdmin || isGerente) {
        const adminData = await dashboardService.getAdminStats(dateRange.start, dateRange.end);
        setData(adminData);
      } else if (profile.tipo === 'barbeiro') {
        const barberData = await dashboardService.getBarberStats(user.uid, dateRange.start, dateRange.end);
        setData(barberData);
      } else if (profile.tipo === 'cliente') {
        const clientData = await dashboardService.getClientStats(user.uid);
        setData(clientData);
      }
    } catch (err: any) {
      console.error("Erro ao carregar dashboard:", err);
      if (err.message?.includes('permissions')) {
        setError('Acesso negado: Você não tem permissão para visualizar estes dados estratégicos.');
      } else {
        setError('Falha ao carregar dados do dashboard: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Sincronizando dados estratégicos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-100 rounded-3xl text-center space-y-4 shadow-sm">
        <p className="text-red-600 font-bold uppercase tracking-widest text-sm">{error}</p>
        <button 
          onClick={loadDashboardData}
          className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all active:scale-95 shadow-sm"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 bg-slate-50 border border-border rounded-[2.5rem] border-dashed shadow-sm">
        <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center text-red-500 shadow-sm">
          <AlertCircle size={32} />
        </div>
        <div className="text-center">
          <h3 className="text-primary font-bold text-lg">Falha na Sincronização</h3>
          <p className="text-muted text-sm max-w-xs mx-auto mt-2 font-medium">Não foi possível carregar os dados do dashboard. Verifique suas permissões ou tente novamente.</p>
        </div>
        <button 
          onClick={loadDashboardData}
          className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all uppercase tracking-widest shadow-sm active:scale-95"
        >
          <RefreshCw size={14} />
          Tentar Novamente
        </button>
      </div>
    );
  }

  if (isAdmin || isGerente) return <AdminDashboard data={data} setDateRange={setDateRange} dateRange={dateRange} refresh={loadDashboardData} setActiveTab={setActiveTab} activeTab={activeInternalTab} />;
  if (profile?.tipo === 'barbeiro') return <BarberDashboard data={data} refresh={loadDashboardData} setActiveTab={setActiveTab} activeTab={activeInternalTab} />;
  if (profile?.tipo === 'cliente') return <ClientDashboard data={data} refresh={loadDashboardData} setActiveTab={setActiveTab} />;

  return null;
}

// --- ADMIN / MANAGER DASHBOARD ---
function AdminDashboard({ data, setDateRange, dateRange, refresh, setActiveTab, activeTab = 'overview' }: any) {
  const [comandasAbertas, setComandasAbertas] = useState<any[]>([]);
  const [clientesDevedores, setClientesDevedores] = useState<any[]>([]);
  const [baixoEstoque, setBaixoEstoque] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  useEffect(() => {
    if (activeTab === 'alerts') {
      const fetchAlertsDetails = async () => {
        setLoadingAlerts(true);
        try {
          // 1. Get Comandas
          const comandasSnap = await getDocs(
            query(collection(db, 'comandas'), where('status', 'not-in', ['fechada', 'cancelada']))
          );
          setComandasAbertas(comandasSnap.docs.map(d => ({ id: d.id, ...d.data() })));

          // 2. Get Debts
          const debtsSnap = await getDocs(
            query(collection(db, 'client_debts'), where('status', 'not-in', ['paga', 'cancelada']))
          );
          setClientesDevedores(debtsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

          // 3. Get Low Stock
          const productsSnap = await getDocs(collection(db, 'products'));
          const lowStock = productsSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((p: any) => p.currentStock <= p.minStock && p.status === 'active');
          setBaixoEstoque(lowStock);
        } catch (err) {
          console.error("Erro ao carregar detalhes dos alertas:", err);
        } finally {
          setLoadingAlerts(false);
        }
      };
      fetchAlertsDetails();
    }
  }, [activeTab]);

  const topBarbers = data?.topBarbers || [];
  const topServices = data?.topServices || [];
  const todayAppointments = (data?.recentAppointments || []).filter((a: any) => a.date === format(new Date(), 'yyyy-MM-dd'));

  // Define tab headers dynamically to feel integrated
  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    overview: { title: 'Dashboard Executivo', subtitle: 'Monitoramento em tempo real da BarberElite.' },
    indicators: { title: 'Indicadores de Performance', subtitle: 'Ranking de barbeiros e desempenho de serviços.' },
    alerts: { title: 'Central de Alertas', subtitle: 'Acompanhamento de comandas, comissão e pendências.' },
    financial: { title: 'Resumo Financeiro', subtitle: 'Faturamento, despesas e acompanhamento de metas.' },
    agenda: { title: 'Agenda do Dia', subtitle: 'Fluxo total de clientes agendados para hoje.' },
  };

  const { title, subtitle } = tabTitles[activeTab] || tabTitles.overview;

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary mb-1">{title}</h1>
          <p className="text-muted text-sm">{subtitle}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-4 py-2 shadow-sm">
            <Calendar size={14} className="text-muted" />
            <input 
              type="date" 
              value={format(dateRange.start, 'yyyy-MM-dd')}
              onChange={(e) => setDateRange({...dateRange, start: parseISO(e.target.value)})}
              className="bg-transparent text-xs text-primary focus:outline-none font-semibold"
            />
            <span className="text-border">|</span>
            <input 
              type="date" 
              value={format(dateRange.end, 'yyyy-MM-dd')}
              onChange={(e) => setDateRange({...dateRange, end: parseISO(e.target.value)})}
              className="bg-transparent text-xs text-primary focus:outline-none font-semibold"
            />
          </div>
          <button 
            onClick={refresh} 
            className="p-2.5 bg-surface border border-border rounded-xl text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm active:scale-95"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="space-y-8"
        >
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <>
              {/* Main KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <KpiCard 
                  title="Faturamento (Mês)" 
                  value={data?.monthlyRevenue || 0} 
                  icon={<DollarSign className="text-emerald-500" />} 
                  trend={`R$ ${(data?.dailyRevenue || 0).toFixed(0)} hoje`} 
                  trendUp={(data?.dailyRevenue || 0) > 0}
                  color="emerald"
                />
                <KpiCard 
                  title="Atendimentos (Mês)" 
                  value={data?.monthlyAppointments || 0} 
                  icon={<Scissors className="text-blue-500" />} 
                  trend={`${data?.dailyAppointments || 0} hoje`} 
                  trendUp={(data?.dailyAppointments || 0) > 0}
                  color="blue"
                  isCurrency={false}
                />
                <KpiCard 
                  title="Ticket Médio" 
                  value={data?.ticketMedio || 0} 
                  icon={<TrendingUp className="text-amber-500" />} 
                  trend="Estável" 
                  trendUp={true}
                  color="amber"
                />
                <KpiCard 
                  title="Clientes Atendidos" 
                  value={data?.totalClients || 0} 
                  icon={<Users className="text-zinc-400" />} 
                  trend="No período" 
                  trendUp={true}
                  color="zinc"
                  isCurrency={false}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="font-bold text-xl text-primary flex items-center gap-3">
                        <Activity size={22} className="text-accent" />
                        Desempenho Financeiro
                      </h3>
                      <p className="text-muted text-[10px] mt-1 uppercase tracking-[0.2em] font-black">Fluxo de caixa dos últimos 7 dias</p>
                    </div>
                  </div>
                  
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data?.chartData || []}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366F1" stopOpacity={0.15}/>
                            <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          stroke="#94A3B8" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          dy={10}
                        />
                        <YAxis 
                          stroke="#94A3B8" 
                          fontSize={10} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(value) => `R$${value}`}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#FFFFFF', 
                            border: '1px solid #E2E8F0', 
                            borderRadius: '16px',
                            fontSize: '11px',
                            fontWeight: '700',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)',
                            padding: '12px'
                          }}
                          itemStyle={{ color: '#6366F1' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="revenue" 
                          stroke="#6366F1" 
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#colorRevenue)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Goals & Alerts Quick Widget */}
                  <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                    <h3 className="font-bold text-xl text-primary mb-6 flex items-center gap-3">
                      <Target size={22} className="text-secondary" />
                      Projeção Mensal
                    </h3>
                    <p className="text-muted text-xs mb-6 font-medium">Progresso em relação à meta mensal estipulada de R$ 25.000.</p>
                    <div className="space-y-5">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs font-black text-slate-400 uppercase mb-1">Atual</p>
                          <p className="text-3xl font-black text-primary tracking-tighter">R$ {safeNumber(data?.monthlyRevenue).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-400 uppercase mb-1">Meta</p>
                          <p className="text-lg font-black text-primary/70 tracking-tighter">R$ 25.000</p>
                        </div>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-accent rounded-full transition-all duration-1000"
                          style={{ width: `${Math.min((safeNumber(data?.monthlyRevenue) / 25000) * 100, 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-muted font-bold text-center uppercase tracking-wider">
                        {((safeNumber(data?.monthlyRevenue) / 25000) * 100).toFixed(0)}% Alcançado
                      </p>
                    </div>
                  </div>

                  {/* Quick Alerts Summary */}
                  <div className="p-6 bg-amber-50/50 border border-amber-100 rounded-[2rem] flex flex-col justify-between shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                        <AlertCircle size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-amber-900 text-sm">Alertas Rápidos</h4>
                        <p className="text-xs text-amber-700/80 mt-1 font-medium">Existem {data?.lowStockCount || 0} produtos com estoque baixo e {data?.activeComandasCount || 0} comandas em aberto.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab('dashboard-alerts')}
                      className="mt-6 w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Resolver Alertas
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* INDICATORS TAB - RANKING DOS BARBEIROS */}
          {activeTab === 'indicators' && (
            <div className="space-y-8">
              <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div>
                    <h2 className="font-bold text-xl text-primary flex items-center gap-3">
                      <Award size={24} className="text-amber-500" />
                      Ranking de Performance de Barbeiros
                    </h2>
                    <p className="text-muted text-xs mt-1">Ranking principal definido pelo faturamento total em atendimentos concluídos.</p>
                  </div>
                  <div className="px-4 py-1.5 bg-slate-50 border border-slate-100 text-[10px] uppercase font-black tracking-widest text-muted rounded-xl self-start">
                    Metragem: Faturamento
                  </div>
                </div>

                {/* PODIUM DISPLAY FOR TOP 3 BARBERS */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-end justify-center py-6 border-b border-slate-100">
                  {/* 2nd Place */}
                  {topBarbers[1] ? (
                    <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-between text-center min-h-[220px] order-2 md:order-1 transition-all hover:scale-[1.03]">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="relative">
                          <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-600 text-xl border-4 border-slate-300 shadow-sm">
                            {topBarbers[1].name.charAt(0)}
                          </div>
                          <div className="absolute -top-2 -right-2 w-7 h-7 bg-slate-300 rounded-full flex items-center justify-center border-2 border-surface shadow text-xs font-black text-slate-800">
                            2º
                          </div>
                        </div>
                        <div>
                          <h4 className="font-black text-primary text-base">{topBarbers[1].name}</h4>
                          <p className="text-[10px] text-muted font-black uppercase tracking-wider">{topBarbers[1].count} Atendimentos</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 w-full">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Faturamento</p>
                        <p className="text-lg font-black text-slate-700">R$ {topBarbers[1].revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden md:block min-h-[220px] order-2 md:order-1" />
                  )}

                  {/* 1st Place */}
                  {topBarbers[0] ? (
                    <div className="bg-gradient-to-b from-amber-50/60 to-amber-50/10 border-2 border-amber-200 rounded-[2.5rem] p-8 shadow-md flex flex-col items-center justify-between text-center min-h-[260px] relative order-1 md:order-2 transition-all hover:scale-[1.03]">
                      <div className="absolute -top-5 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-lg border-2 border-surface text-white">
                        <Star size={18} className="fill-white" />
                      </div>
                      <div className="flex flex-col items-center space-y-3 mt-2">
                        <div className="relative">
                          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center font-bold text-amber-600 text-2xl border-4 border-amber-400 shadow-sm">
                            {topBarbers[0].name.charAt(0)}
                          </div>
                          <div className="absolute -top-2 -right-2 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center border-2 border-surface shadow-md text-xs font-black text-white">
                            1º
                          </div>
                        </div>
                        <div>
                          <h4 className="font-black text-lg text-amber-950">{topBarbers[0].name}</h4>
                          <p className="text-[10px] text-amber-700/80 font-black uppercase tracking-wider">{topBarbers[0].count} Atendimentos</p>
                        </div>
                      </div>
                      <div className="mt-5 pt-4 border-t border-amber-200/50 w-full">
                        <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Faturamento Líder</p>
                        <p className="text-2xl font-black text-amber-600">R$ {topBarbers[0].revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 italic text-muted text-sm my-auto order-1">Nenhum dado de profissional cadastrado.</div>
                  )}

                  {/* 3rd Place */}
                  {topBarbers[2] ? (
                    <div className="bg-slate-50/50 border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col items-center justify-between text-center min-h-[200px] order-3 transition-all hover:scale-[1.03]">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="relative">
                          <div className="w-14 h-14 bg-orange-100/50 rounded-full flex items-center justify-center font-bold text-amber-800 text-lg border-4 border-orange-200 shadow-sm">
                            {topBarbers[2].name.charAt(0)}
                          </div>
                          <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center border-2 border-surface shadow text-[10px] font-black text-white">
                            3º
                          </div>
                        </div>
                        <div>
                          <h4 className="font-black text-primary text-base">{topBarbers[2].name}</h4>
                          <p className="text-[10px] text-muted font-black uppercase tracking-wider">{topBarbers[2].count} Atendimentos</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 w-full">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Faturamento</p>
                        <p className="text-lg font-black text-slate-600">R$ {topBarbers[2].revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden md:block min-h-[200px] order-3" />
                  )}
                </div>

                {/* DETAILED RANKING LIST */}
                <div className="mt-8 space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Tabela Detalhada de Desempenho</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider font-black">
                          <th className="py-3 px-4">Rank</th>
                          <th className="py-3 px-4">Profissional</th>
                          <th className="py-3 px-4 text-center">Atendimentos Completos</th>
                          <th className="py-3 px-4 text-right">Faturamento Bruto</th>
                          <th className="py-3 px-4 text-right">Ticket Médio</th>
                          <th className="py-3 px-4 text-right">Share de Receita</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {topBarbers.map((b: any, index: number) => {
                          const totalStoreRevenue = topBarbers.reduce((acc: number, cur: any) => acc + (cur.revenue || 0), 0) || 1;
                          const share = ((b.revenue || 0) / totalStoreRevenue) * 100;
                          return (
                            <tr key={`ranking-detailed-${b.name}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-4 px-4 font-bold text-primary">
                                {index === 0 && '🥇 '}
                                {index === 1 && '🥈 '}
                                {index === 2 && '🥉 '}
                                {index > 2 && `${index + 1}º `}
                              </td>
                              <td className="py-4 px-4 font-bold text-primary">{b.name}</td>
                              <td className="py-4 px-4 text-center font-bold text-slate-600">{b.count}x</td>
                              <td className="py-4 px-4 text-right font-black text-emerald-600">R$ {(b.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="py-4 px-4 text-right font-bold text-slate-600">R$ {(b.count > 0 ? b.revenue / b.count : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="py-4 px-4 text-right">
                                <div className="flex items-center justify-end gap-3">
                                  <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-primary h-full rounded-full" style={{ width: `${share}%` }} />
                                  </div>
                                  <span className="text-xs font-black text-primary">{share.toFixed(0)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* SERVICES PERFORMANCE SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Top Services Bar chart */}
                <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                  <h3 className="font-bold text-lg text-primary mb-6 flex items-center gap-3">
                    <Zap size={22} className="text-indigo-500" />
                    Serviços Mais Vendidos
                  </h3>
                  <div className="space-y-6">
                    {topServices.map((s: any, i: number) => {
                      const maxCount = Math.max(...topServices.map((x: any) => x.count || 1)) || 1;
                      const progress = ((s.count || 0) / maxCount) * 100;

                      return (
                        <div key={`services-${s.name}-${i}`} className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-primary font-bold">{s.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted font-bold">{s.count} saídas</span>
                              <span className="font-black text-indigo-600">R$ {(s.revenue || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              className="h-full bg-indigo-500 rounded-full"
                              transition={{ duration: 1.2 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Insights and Strategic Tips for the Barbershop */}
                <div className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-8 flex flex-col justify-between shadow-inner">
                  <div>
                    <h3 className="font-bold text-lg text-primary mb-4">💡 Insight Estratégico</h3>
                    <p className="text-sm text-slate-600 leading-relaxed mb-6">
                      Análise de dados do período indica que o profissional <strong className="text-primary">{topBarbers[0]?.name || 'Líder'}</strong> possui o melhor ticket médio. 
                      Oferecer combos promocionais que combinam o serviço de <strong className="text-primary">{topServices[0]?.name || 'Cabelo'}</strong> com bônus de hidratação pode impulsionar o faturamento dos demais barbeiros em até 18%.
                    </p>
                    <div className="p-5 bg-white border border-slate-100 rounded-2xl shadow-sm space-y-3">
                      <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Ação Sugerida</p>
                      <p className="text-xs font-semibold text-primary">Dispare uma campanha de fidelidade direcionando clientes para agendamento com profissionais em horário de menor ocupação.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('configuracoes-parametros')}
                    className="mt-8 w-full py-3.5 bg-primary hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                  >
                    Configurar Regras de Campanha
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="space-y-8">
              {/* Quick Alertas cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <AlertItem 
                  title="Comandas Abertas" 
                  value={data?.activeComandasCount || 0} 
                  icon={<BarChart3 size={18} />} 
                  color="blue"
                  subtitle="Aguardando fechamento no caixa"
                  isCurrency={false}
                />
                <AlertItem 
                  title="Dívida de Clientes (Fiado)" 
                  value={data?.pendingFiado || 0} 
                  icon={<CreditCard size={18} />} 
                  color="red"
                  subtitle={`${data?.debtorClientsCount || 0} clientes inadimplentes`}
                />
                <AlertItem 
                  title="Estoque Crítico" 
                  value={data?.lowStockCount || 0} 
                  icon={<BarChart3 size={18} />} 
                  color="amber"
                  subtitle="Produtos abaixo do estoque mínimo"
                  isCurrency={false}
                />
              </div>

              {loadingAlerts ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="animate-spin text-accent" size={32} />
                  <p className="text-xs text-muted font-bold uppercase tracking-wider animate-pulse">Carregando detalhes do inventário e comissões...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Comandas em Aberto Details List */}
                  <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                    <h3 className="font-bold text-lg text-primary mb-6 flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <CheckCircle2 size={20} className="text-indigo-500" />
                        Comandas Ativas
                      </span>
                      <span className="text-[10px] font-black uppercase bg-indigo-50 px-2.5 py-1 text-indigo-700 rounded-lg">{comandasAbertas.length} abertas</span>
                    </h3>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {comandasAbertas.map((c: any, idx: number) => (
                        <div key={`comanda-list-alert-${c.id || idx}-${idx}`} className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                          <div>
                            <p className="font-bold text-sm text-primary">Comanda #{c.number}</p>
                            <p className="text-[10px] text-muted font-bold uppercase">Cliente: {c.cliente_name || 'Consumidor Final'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-indigo-600">R$ {(c.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <span className="text-[8px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5 uppercase tracking-wide">Pendente</span>
                          </div>
                        </div>
                      ))}
                      {comandasAbertas.length === 0 && (
                        <p className="text-center py-10 text-xs italic text-muted">Nenhuma comanda aberta necessitando fechamento.</p>
                      )}
                    </div>
                  </div>

                  {/* Clientes com Fiado Details List */}
                  <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                    <h3 className="font-bold text-lg text-primary mb-6 flex items-center justify-between">
                      <span className="flex items-center gap-3">
                        <Wallet size={20} className="text-red-500" />
                        Contas Fiadas Pendentes
                      </span>
                      <span className="text-[10px] font-black uppercase bg-red-50 px-2.5 py-1 text-red-700 rounded-lg">R$ {clientesDevedores.reduce((acc, c) => acc + (c.remainingAmount || 0), 0).toLocaleString('pt-BR')}</span>
                    </h3>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {clientesDevedores.map((d: any, idx: number) => (
                        <div key={`debt-list-alert-${d.id || idx}-${idx}`} className="flex items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl">
                          <div>
                            <p className="font-bold text-sm text-primary">{d.cliente_name}</p>
                            <p className="text-[10px] text-muted font-bold uppercase">Aberto em: {d.date}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-red-600">R$ {(d.remainingAmount || d.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            <span className="text-[8px] font-black text-red-700 bg-red-50 border border-red-100 rounded-md px-1.5 py-0.5 uppercase tracking-wide">{d.status}</span>
                          </div>
                        </div>
                      ))}
                      {clientesDevedores.length === 0 && (
                        <p className="text-center py-10 text-xs italic text-muted">Excelente! Nenhuma dívida fiada pendente.</p>
                      )}
                    </div>
                  </div>

                  {/* Baixo Estoque List */}
                  <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm lg:col-span-2">
                    <h3 className="font-bold text-lg text-primary mb-6 flex items-center gap-3">
                      <AlertCircle size={20} className="text-amber-500" />
                      Produtos Abaixo do Estoque Mínimo
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead>
                          <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider font-black">
                            <th className="py-2.5 px-4">Produto</th>
                            <th className="py-2.5 px-4 text-center">Mínimo Permitido</th>
                            <th className="py-2.5 px-4 text-center">Estoque Atual</th>
                            <th className="py-2.5 px-4 text-center">Status</th>
                            <th className="py-2.5 px-4 text-right">Estratégia</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {baixoEstoque.map((p: any, idx: number) => (
                            <tr key={`baixo-estoque-table-${p.id || idx}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4 font-bold text-primary">{p.name}</td>
                              <td className="py-3 px-4 text-center text-slate-500">{p.minStock} unidades</td>
                              <td className="py-3 px-4 text-center font-black text-red-600">{p.currentStock} unidades</td>
                              <td className="py-3 px-4 text-center">
                                <span className="bg-red-50 text-red-700 border border-red-100 rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wide">Risco Rupura</span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button 
                                  onClick={() => setActiveTab('estoque-produtos')}
                                  className="py-1 px-3 bg-primary text-white hover:bg-slate-800 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                >
                                  Fazer Pedido
                                </button>
                              </td>
                            </tr>
                          ))}
                          {baixoEstoque.length === 0 && (
                            <tr>
                              <td colSpan={5} className="text-center py-10 font-medium italic text-muted text-xs">Todos os itens de estoque estão em níveis normais.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FINANCIAL TAB */}
          {activeTab === 'financial' && (
            <div className="space-y-8">
              {/* Main KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                <KpiCard 
                  title="Faturamento Bruto" 
                  value={data?.revenue || 0} 
                  icon={<DollarSign className="text-emerald-500" />} 
                  trend="Acumulado" 
                  trendUp={true}
                  color="emerald"
                />
                <KpiCard 
                  title="Total de Despesas" 
                  value={data?.expenses || 0} 
                  icon={<TrendingDown className="text-red-500" />} 
                  trend="Operacional" 
                  trendUp={false}
                  color="red"
                />
                <KpiCard 
                  title="Lucro Líquido" 
                  value={data?.balance || 0} 
                  icon={<Wallet className="text-blue-500" />} 
                  trend="Resultado" 
                  trendUp={data?.balance >= 0}
                  color="blue"
                />
              </div>

              {/* Commission Details Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm space-y-6">
                  <h3 className="font-bold text-lg text-primary flex items-center gap-3">
                    <Percent size={20} className="text-amber-500" />
                    Comissões Profissionais
                  </h3>
                  <p className="text-xs text-muted leading-relaxed">Detalhamento dos valores devidos e repassados aos barbeiros colaboradores no período atual.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-400">Total de Comissões</p>
                      <p className="text-xl font-black text-slate-700 mt-1">R$ {safeNumber(data?.totalCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl">
                      <p className="text-[10px] font-bold uppercase text-amber-700">Comissões Pendentes</p>
                      <p className="text-xl font-black text-amber-600 mt-1">R$ {safeNumber(data?.pendingCommissions).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setActiveTab('financeiro-comissoes')}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-primary rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                  >
                    Gerenciar Pagamento de Comissão
                  </button>
                </div>

                {/* Goals tracker and breakdown details */}
                <div className="bg-primary rounded-[2.5rem] p-8 text-white relative overflow-hidden group shadow-lg shadow-indigo-900/10">
                  <div className="absolute right-0 bottom-0 opacity-10 text-white translate-x-10 translate-y-10 group-hover:scale-105 transition-transform duration-1000">
                    <TrendingUp size={220} />
                  </div>
                  <div className="relative z-10 space-y-8">
                    <div>
                      <h4 className="font-black text-xl tracking-tight">Performance e Metas</h4>
                      <p className="text-white/50 text-[10px] font-black uppercase tracking-widest mt-1">Gerais da Unidade</p>
                    </div>

                    <div className="space-y-6">
                      <GoalItem label="Crescimento Mensal" current={data?.monthlyRevenue || 0} target={25000} color="emerald" isCurrency />
                      <GoalItem label="Comissão Paga" current={(data?.totalCommissions || 0) - (data?.pendingCommissions || 0)} target={data?.totalCommissions || 1} color="blue" isCurrency />
                    </div>

                    <p className="text-xs text-white/60 leading-relaxed italic">
                      "Utilize técnicas de upselling para atrair clientes em serviços recorrentes de beleza masculina."
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AGENDA TAB */}
          {activeTab === 'agenda' && (
            <div className="space-y-8">
              <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="font-bold text-xl text-primary flex items-center gap-3">
                      <CalendarCheck size={22} className="text-emerald-500" />
                      Atendimentos do Dia — {format(new Date(), 'dd/MM/yyyy')}
                    </h3>
                    <p className="text-muted text-xs mt-1">Listagem operacional ordenada do fluxo de clientes agendados.</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('agenda-main')}
                    className="py-1.5 px-4 bg-primary text-white hover:bg-slate-800 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                  >
                    Abrir Painel Completo de Agenda
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider font-black">
                        <th className="py-3 px-4">Horário</th>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Barbeiro</th>
                        <th className="py-3 px-4">Serviço Solicitado</th>
                        <th className="py-3 px-4 text-right">Valor</th>
                        <th className="py-3 px-4 text-right">Status operacional</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {todayAppointments.map((a: any, idx: number) => {
                        const statusColors: Record<string, string> = {
                          'concluído': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                          'cancelado': 'bg-rose-50 text-rose-700 border-rose-100',
                          'confirmado': 'bg-blue-50 text-blue-700 border-blue-100',
                          'agendado': 'bg-slate-50 text-slate-700 border-slate-100',
                          'em_atendimento': 'bg-amber-50 text-amber-700 border-amber-100',
                        };
                        return (
                          <tr key={`today-agenda-table-${a.id || idx}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-4 font-black text-primary">{a.startTime}</td>
                            <td className="py-4 px-4 font-bold text-primary">{a.cliente_name}</td>
                            <td className="py-4 px-4 font-semibold text-slate-500">{a.profissional_name}</td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2 py-0.5 uppercase tracking-wide">{a.servico_name}</span>
                            </td>
                            <td className="py-4 px-4 text-right font-black text-slate-800">R$ {(a.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="py-4 px-4 text-right">
                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase tracking-wider ${statusColors[a.status] || 'bg-slate-100 text-slate-600'}`}>
                                {a.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {todayAppointments.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-16 italic font-medium text-muted text-xs">Nenhum atendimento agendado para o dia de hoje.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// --- BARBER DASHBOARD ---
function BarberDashboard({ data, refresh, setActiveTab, activeTab = 'overview' }: any) {
  const nextAppointments = data.nextAppointments || [];
  
  // Tab title mapping
  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    overview: { title: 'Minha Performance', subtitle: 'Acompanhe seus atendimentos e ganhos acumulados.' },
    agenda: { title: 'Dossiê da Minha Agenda', subtitle: 'Sua programação operacional de atendimentos hoje.' },
  };

  const { title, subtitle } = tabTitles[activeTab] || tabTitles.overview;

  return (
    <div className="space-y-8 pb-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary mb-1">{title}</h1>
          <p className="text-muted text-sm">{subtitle}</p>
        </div>
        <button 
          onClick={refresh} 
          className="p-2.5 bg-surface border border-border rounded-xl text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm active:scale-95"
        >
          <RefreshCw size={18} />
        </button>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.25 }}
          className="space-y-8"
        >
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <KpiCard 
                  title="Comissão a Receber" 
                  value={data.commissionPending} 
                  icon={<Wallet className="text-amber-500" />} 
                  trend="Aguardando repasse" 
                  trendUp={false}
                  color="amber"
                />
                <KpiCard 
                  title="Total de Comissão (Mês)" 
                  value={data.commissionTotal || 0} 
                  icon={<TrendingUp className="text-emerald-500" />} 
                  trend="Ganhos acumulados" 
                  trendUp={true}
                  color="emerald"
                />
                <KpiCard 
                  title="Meus Atendimentos" 
                  value={data.completedCount} 
                  icon={<UserCheck className="text-blue-500" />} 
                  trend={`${data.appointmentsCount} total no período`} 
                  trendUp={true}
                  color="blue"
                  isCurrency={false}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-surface border border-border rounded-3xl p-8 shadow-sm">
                  <h3 className="font-bold text-lg text-primary mb-8 flex items-center gap-3">
                    <CalendarCheck size={20} className="text-emerald-500" />
                    Próximos Atendimentos
                  </h3>
                  <div className="space-y-4">
                    {nextAppointments.slice(0, 3).map((a: Appointment, idx: number) => (
                      <div key={`next-app-${a.id || idx}-${idx}`} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-accent/30 transition-all shadow-sm">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center font-bold text-xl text-slate-300 group-hover:text-accent transition-colors border border-slate-100 shadow-sm">
                            {a.cliente_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-lg text-primary">{a.cliente_name}</p>
                            <p className="text-xs text-muted font-bold uppercase tracking-widest">{a.servico_name}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-primary">{a.startTime}</p>
                          <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{format(parseISO(a.date), 'dd/MM')}</p>
                        </div>
                      </div>
                    ))}
                    {nextAppointments.length === 0 && (
                      <div className="text-center py-16 text-muted text-sm italic">Você não tem agendamentos pendentes.</div>
                    )}
                  </div>
                </div>

                <div className="bg-surface border border-border rounded-3xl p-8 shadow-sm">
                  <h3 className="font-bold text-lg text-primary mb-8 flex items-center gap-3">
                    <Target size={20} className="text-amber-500" />
                    Metas Pessoais
                  </h3>
                  <div className="space-y-8">
                    <GoalItem label="Atendimentos" current={data?.completedCount || 0} target={100} color="emerald" />
                    <GoalItem label="Comissão" current={data?.commissionTotal || 0} target={2500} color="amber" isCurrency />
                  </div>
                  
                  <div className="mt-12 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl text-center shadow-sm">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">Dica de Performance</p>
                    <p className="text-sm text-slate-600 italic font-medium">"Ofereça serviços adicionais para aumentar seu ticket médio em até 15%."</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'agenda' && (
            <div className="bg-surface border border-border rounded-[2.5rem] p-8 shadow-sm">
              <h3 className="font-bold text-lg text-primary mb-6 flex items-center gap-3">
                <CalendarCheck size={22} className="text-emerald-500" />
                Minha Agenda do Dia — {format(new Date(), 'dd/MM/yyyy')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-border text-muted text-[10px] uppercase tracking-wider font-black">
                      <th className="py-3 px-4">Horário</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Serviço</th>
                      <th className="py-3 px-4 text-right font-black">Valor</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {nextAppointments.map((a: any, idx: number) => {
                      const statusColors: Record<string, string> = {
                        'concluído': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                        'cancelado': 'bg-rose-50 text-rose-700 border-rose-100',
                        'confirmado': 'bg-blue-50 text-blue-700 border-blue-100',
                        'agendado': 'bg-slate-50 text-slate-700 border-slate-100',
                        'em_atendimento': 'bg-amber-50 text-amber-700 border-amber-100',
                      };
                      return (
                        <tr key={`barber-agenda-${a.id || idx}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-4 px-4 font-black text-primary">{a.startTime}</td>
                          <td className="py-4 px-4 font-semibold text-primary">{a.cliente_name}</td>
                          <td className="py-4 px-4">
                            <span className="font-bold text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2 py-0.5 uppercase tracking-wide">{a.servico_name}</span>
                          </td>
                          <td className="py-4 px-4 text-right font-black text-slate-800">R$ {(a.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-4 px-4 text-right">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border uppercase tracking-wider ${statusColors[a.status] || 'bg-slate-100 text-slate-600'}`}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {nextAppointments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-16 italic font-medium text-muted text-xs">Você não possui agendamentos marcados para o dia de hoje.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// --- CLIENT DASHBOARD ---
function ClientDashboard({ data, refresh, setActiveTab }: any) {
  const { profile } = useAuth();
  const { tenant, tenantsList } = useTenant();
  const [copied, setCopied] = useState(false);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [linkingUnit, setLinkingUnit] = useState<string | null>(null);

  const invitationLink = `${window.location.origin}/register?tenant=${tenant?.id || 'barber-elite'}&ref=${profile?.uid || ''}`;

  const copyInvitation = () => {
    navigator.clipboard.writeText(invitationLink);
    setCopied(true);
    toast.success("Link especial de indicação copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLinkUnit = async (targetTenantId: string) => {
    setLinkingUnit(targetTenantId);
    try {
      if (profile?.uid) {
        await updateDoc(doc(db, 'usuarios', profile.uid), {
          tenantId: targetTenantId
        });
      }
      localStorage.setItem('barberelite_tenant_id', targetTenantId);
      toast.success("Barbearia conectada com sucesso!");
      window.location.search = `?tenant=${targetTenantId}`;
    } catch (err) {
      console.error(err);
      toast.error("Erro ao conectar à barbearia.");
    } finally {
      setLinkingUnit(null);
      setShowUnitsModal(false);
    }
  };

  // Safe percentage calculator for subscriptions
  const getSubProgress = (used: number, limit: number) => {
    if (!limit) return 0;
    return Math.min(100, (used / limit) * 100);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Welcome Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary mb-1">Olá, {profile?.nome?.split(' ')[0]}!</h1>
          <p className="text-muted text-sm font-medium">Seja bem-vindo de volta à sua área exclusiva de cliente.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('agenda-main')}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black rounded-xl text-xs transition-all shadow-md active:scale-95 uppercase tracking-widest"
          >
            <CalendarCheck size={16} />
            Agendar Agora
          </button>
          <button 
            onClick={refresh} 
            className="p-2.5 bg-surface border border-border rounded-xl text-muted hover:text-accent hover:border-accent/30 transition-all shadow-sm active:scale-95"
            title="Atualizar painel"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Main Grid: Barbershop official Card + Loyalty Points Visual */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* official Barbershop Unit Card */}
        <div className="lg:col-span-5 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 text-white rounded-3xl p-8 shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[280px]">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/25">
                Barbearia Ativa
              </span>
              <div className="w-10 h-10 rounded-xl bg-zinc-850 border border-zinc-800 flex items-center justify-center font-black text-lg text-emerald-400 overflow-hidden">
                {tenant?.logoUrl ? (
                  <img src={tenant.logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Scissors size={18} />
                )}
              </div>
            </div>

            <h2 className="text-xl font-black tracking-tight mb-1">{tenant?.name || "BarberElite"}</h2>
            <p className="text-zinc-400 text-xs max-w-sm mb-4 font-medium">Você está conectado a esta unidade.</p>
            
            <button 
              type="button" 
              onClick={() => setShowUnitsModal(true)}
              className="text-[10px] uppercase font-black text-emerald-400 hover:text-emerald-300 tracking-widest flex items-center gap-1 bg-zinc-800/50 hover:bg-zinc-800 px-3.5 py-1.5 rounded-xl border border-zinc-700 transition-all"
            >
              Procurar Outra Barbearia ⚡
            </button>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-800/60 text-zinc-300 text-xs font-medium mt-4">
            {tenant?.address && (
              <div className="flex items-start gap-3">
                <MapPin size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                <span>
                  {tenant.address.street}, {tenant.address.city} - {tenant.address.state}
                </span>
              </div>
            )}
            {tenant?.phone && (
              <div className="flex items-center gap-3">
                <Phone size={14} className="text-emerald-400 shrink-0" />
                <span>{tenant.phone}</span>
              </div>
            )}
            {tenant?.email && (
              <div className="flex items-center gap-3">
                <Mail size={14} className="text-emerald-400 shrink-0" />
                <span className="truncate">{tenant.email}</span>
              </div>
            )}
          </div>
        </div>

        {/* Loyalty Program Card (Stunning Visualizer) */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-3xl p-8 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-amber-100">
                  <Award size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-primary">Programa de Fidelidade</h3>
                  <p className="text-xs text-muted">Acumule pontos e resgate descontos especiais.</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-xs font-bold uppercase tracking-wider">
                {data?.points >= 1000 ? "Cliente VIP" : "Club Standard"}
              </span>
            </div>

            {/* Loyalty details & Meter */}
            <div className="grid grid-cols-2 gap-4 mb-6 bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <div>
                <p className="text-[10px] text-muted font-black uppercase tracking-wider mb-1">Meus Pontos</p>
                <p className="text-2xl font-black text-amber-600">{data?.points || 0} <span className="text-xs font-normal text-muted">pts</span></p>
              </div>
              <div>
                <p className="text-[10px] text-muted font-black uppercase tracking-wider mb-1">Meu Cashback</p>
                <p className="text-2xl font-black text-emerald-600">R$ {(data?.cashback || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {/* VIP Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-muted">Progresso para VIP</span>
                <span className="text-primary font-bold">{Math.min(1000, data?.points || 0)} / 1000 pts</span>
              </div>
              <div className="w-full h-3 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((data?.points || 0) / 1000) * 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-muted font-medium pt-1">
                {data?.points >= 1000 
                  ? "⭐ Parabéns! Você é um Cliente VIP e desfruta de prioridades e descontos exclusivos!" 
                  : `Faltam ${1000 - (data?.points || 0)} pontos para você alcançar a categoria VIP e liberar benefícios especiais.`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards: Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard 
          title="Total de Cortes" 
          value={data?.totalCuts || 0} 
          icon={<Scissors className="text-emerald-500" />} 
          trend="Histórico" 
          trendUp={true}
          color="emerald"
          isCurrency={false}
        />
        <KpiCard 
          title="Meu Saldo Líquido" 
          value={data?.balance || 0} 
          icon={<Wallet className="text-blue-500" />} 
          trend="Pré-pago / Adiantado" 
          trendUp={true}
          color="blue"
        />
        <KpiCard 
          title="Saldo a Pagar" 
          value={data?.debt || 0} 
          icon={<AlertCircle className="text-rose-500" />} 
          trend="Fiado / Pendente" 
          trendUp={false}
          color="red"
        />
        <KpiCard 
          title="Barbeiro Preferido" 
          value={0} 
          icon={<Star className="text-amber-500" />} 
          trend="Preferência" 
          trendUp={true}
          color="amber"
          isCurrency={false}
          customValue={data?.favoriteBarber || 'Nenhum'}
        />
      </div>

      {/* active Packages / Subscriptions details */}
      <div className="bg-surface border border-border rounded-3xl p-8 shadow-sm">
        <h3 className="font-bold text-lg text-primary mb-6 flex items-center gap-3">
          <Gift size={20} className="text-indigo-500" />
          Meus Pacotes de Cortes & Assinaturas Ativas
        </h3>

        {data?.subscriptions && data.subscriptions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.subscriptions.map((sub: any) => {
              const isExpired = new Date(sub.endDate) < new Date();
              const isActive = sub.status === 'active' && !isExpired;

              return (
                <div key={sub.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-bold text-base text-primary">{sub.planName}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        isActive 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {isActive ? 'Ativo' : 'Inativo / Expirado'}
                      </span>
                    </div>

                    <div className="space-y-4 mb-4">
                      {/* Haircuts Progress */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-muted">
                          <span>Cortes Utilizados (Mês)</span>
                          <span className="text-primary font-bold">{sub.haircutsUsed || 0} de {sub.haircutsLimit || 4}</span>
                        </div>
                        <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${getSubProgress(sub.haircutsUsed || 0, sub.haircutsLimit || 4)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Beard Progress (if supported) */}
                      {(sub.beardsLimit > 0 || sub.beardsUsed > 0) && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs font-semibold text-muted">
                            <span>Barbas Utilizadas (Mês)</span>
                            <span className="text-primary font-bold">{sub.beardsUsed || 0} de {sub.beardsLimit || 4}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${getSubProgress(sub.beardsUsed || 0, sub.beardsLimit || 4)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200/60 flex items-center justify-between text-xs text-muted font-medium mt-2">
                    <span>Vencimento: <strong>{format(parseISO(sub.endDate), 'dd/MM/yyyy')}</strong></span>
                    <span>Auto-renovável: <strong>{sub.autoRenew ? 'Sim' : 'Não'}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl">
            <p className="text-muted text-sm italic mb-4">Você ainda não possui um plano de assinatura ou pacote ativo.</p>
            <button 
              onClick={() => setActiveTab('assinaturas')}
              className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-sm"
            >
              Conhecer Planos & Pacotes
            </button>
          </div>
        )}
      </div>

      {/* Referral & Invitation Box */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-slate-50 border border-emerald-500/20 rounded-[2rem] p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -ml-12 -mt-12 pointer-events-none"></div>
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-widest">
            <Zap size={14} className="animate-pulse" />
            Indique Amigos, Ganhe Benefícios!
          </div>
          <h3 className="font-extrabold text-xl text-slate-900">Seu Link Especial da Barbearia</h3>
          <p className="text-slate-600 text-sm leading-relaxed font-medium">
            Compartilhe seu link exclusivo de recomendação com seus amigos. Quando eles se cadastrarem e agendarem o primeiro corte, vocês dois acumulam cashback e pontos no clube de fidelidade BarberElite!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto shrink-0 max-w-md">
          <input 
            type="text" 
            readOnly 
            value={invitationLink} 
            className="px-4 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-mono focus:outline-none min-w-[240px] shadow-sm select-all"
          />
          <button 
            onClick={copyInvitation}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-950 hover:bg-zinc-850 text-white font-bold rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 shadow-md"
          >
            {copied ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
            {copied ? 'Copiado!' : 'Copiar Link'}
          </button>
        </div>
      </div>

      {/* Appointments & History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-surface border border-border rounded-3xl p-8 shadow-sm">
          <h3 className="font-bold text-lg text-primary mb-8 flex items-center gap-3">
            <CalendarCheck size={20} className="text-emerald-500" />
            Próximos Agendamentos
          </h3>
          <div className="space-y-4">
            {(data?.upcoming || []).map((a: Appointment, idx: number) => (
              <div key={`client-upcoming-${a.id || idx}-${idx}`} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-500 border border-slate-100 shadow-sm">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-primary">{a.servico_name}</p>
                    <p className="text-xs text-muted font-bold uppercase tracking-widest">Com {a.profissional_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{a.startTime}</p>
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{format(parseISO(a.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            ))}
            {(!data?.upcoming || data.upcoming.length === 0) && (
              <div className="text-center py-16 text-muted text-sm italic">Você não tem agendamentos futuros.</div>
            )}
            <button 
              onClick={() => setActiveTab('agenda-main')}
              className="w-full mt-6 py-3.5 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-sm uppercase tracking-widest active:scale-95"
            >
              Agendar Novo Serviço
            </button>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-3xl p-8 shadow-sm">
          <h3 className="font-bold text-lg text-primary mb-8 flex items-center gap-3">
            <History size={20} className="text-slate-400" />
            Histórico Recente
          </h3>
          <div className="space-y-4">
            {(data?.history || []).map((a: Appointment, idx: number) => (
              <div key={`client-history-${a.id || idx}-${idx}`} className="flex items-center justify-between p-5 bg-slate-50 border border-slate-100 rounded-2xl opacity-80 hover:opacity-100 transition-opacity shadow-sm">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-500/50 border border-slate-100 shadow-sm">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-lg text-primary">{a.servico_name}</p>
                    <p className="text-xs text-muted font-bold uppercase tracking-widest">Com {a.profissional_name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">R$ {(a.price || 0).toFixed(2)}</p>
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{format(parseISO(a.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>
            ))}
            {(!data?.history || data.history.length === 0) && (
              <div className="text-center py-16 text-muted text-sm italic">Nenhum histórico de atendimento encontrado.</div>
            )}
          </div>
        </div>
      </div>

      {/* Units Selection Modal */}
      <AnimatePresence>
        {showUnitsModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface border border-border w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
                <div>
                  <h3 className="font-extrabold text-lg text-primary">Unidades & Barbearias Disponíveis</h3>
                  <p className="text-muted text-xs">Selecione uma das unidades cadastradas no nosso sistema SaaS para conectar e ver seus pontos, serviços e agendamentos.</p>
                </div>
                <button 
                  onClick={() => setShowUnitsModal(false)}
                  className="p-2 text-muted hover:text-primary hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 max-h-[50vh] custom-scrollbar">
                {tenantsList.map((unit) => {
                  const isActive = unit.id === tenant?.id;
                  return (
                    <div 
                      key={unit.id} 
                      className={`p-5 border rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${
                        isActive 
                          ? 'border-emerald-500 bg-emerald-500/5 shadow-sm' 
                          : 'border-border bg-slate-50 hover:bg-slate-100/50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white border border-border rounded-xl flex items-center justify-center font-black text-lg text-emerald-500 overflow-hidden shrink-0">
                          {unit.logoUrl ? (
                            <img src={unit.logoUrl} alt={unit.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Scissors size={20} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base text-primary">{unit.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded border border-emerald-500/25">
                                Ativa
                              </span>
                            )}
                          </div>
                          <p className="text-muted text-xs flex items-center gap-1 mt-1">
                            <MapPin size={12} className="text-muted-foreground shrink-0" />
                            {unit.address?.street ? `${unit.address.street}, ${unit.address.city}` : 'Endereço não configurado'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isActive || linkingUnit === unit.id}
                        onClick={() => handleLinkUnit(unit.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap shrink-0 ${
                          isActive 
                            ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 cursor-not-allowed'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md'
                        }`}
                      >
                        {linkingUnit === unit.id ? 'Conectando...' : isActive ? 'Já Conectado' : 'Conectar Unidade'}
                      </button>
                    </div>
                  );
                })}
                {tenantsList.length === 0 && (
                  <div className="text-center py-8 text-muted italic">Nenhuma barbearia cadastrada no sistema.</div>
                )}
              </div>

              <div className="p-4 border-t border-border bg-zinc-50 dark:bg-zinc-900/50 text-right">
                <button 
                  onClick={() => setShowUnitsModal(false)}
                  className="px-5 py-2.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-850 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- SHARED COMPONENTS ---

const safeNumber = (val: any) => {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  return Number(val);
};

function KpiCard({ title, value, icon, trend, trendUp, color, isCurrency = true, customValue }: any) {
  const numValue = safeNumber(value);
  const colors: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50',
    blue: 'text-indigo-600 bg-indigo-50',
    amber: 'text-amber-600 bg-amber-50',
    zinc: 'text-slate-600 bg-slate-50',
    red: 'text-red-600 bg-red-50'
  };

  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="p-6 bg-surface border border-border rounded-2xl shadow-sm shadow-zinc-200/50 space-y-4 relative overflow-hidden group"
    >
      <div className="flex items-center justify-between relative z-10">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>
          {React.cloneElement(icon as React.ReactElement, { size: 24 })}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${trendUp ? 'text-emerald-600' : 'text-slate-400'}`}>
          {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trend}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-2xl font-bold text-primary tracking-tight">
          {customValue ? customValue : (isCurrency ? `R$ ${numValue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : numValue)}
        </p>
        <p className="text-xs font-medium text-muted mt-1">{title}</p>
      </div>
    </motion.div>
  );
}

function AlertItem({ title, value, icon, subtitle, color, isCurrency = true }: any) {
  const numValue = safeNumber(value);
  const colors: Record<string, string> = {
    red: 'text-red-600 bg-red-50 border-red-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100'
  };

  return (
    <div className={`p-4 bg-surface border ${colors[color].split(' ')[2]} rounded-xl flex items-center justify-between transition-all group cursor-default`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color].split(' ')[0]} ${colors[color].split(' ')[1]}`}>
          {React.cloneElement(icon as React.ReactElement, { size: 18 })}
        </div>
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-wider">{title}</p>
          <p className="text-[10px] text-muted font-medium uppercase">{subtitle}</p>
        </div>
      </div>
      <p className={`text-sm font-bold ${colors[color].split(' ')[0]}`}>{isCurrency ? `R$ ${numValue.toLocaleString('pt-BR')}` : numValue}</p>
    </div>
  );
}

function GoalItem({ label, current, target, color, isCurrency }: any) {
  const numCurrent = safeNumber(current);
  const numTarget = safeNumber(target) || 1;
  const progress = Math.min((numCurrent / numTarget) * 100, 100);
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-500',
    blue: 'bg-indigo-500',
    amber: 'bg-amber-500'
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold">
        <span className="text-muted">{label}</span>
        <span className="text-primary">
          {isCurrency ? `R$ ${numCurrent.toLocaleString('pt-BR')}` : numCurrent} <span className="text-slate-300">/</span> {isCurrency ? `R$ ${numTarget.toLocaleString('pt-BR')}` : numTarget}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={`h-full ${colorClasses[color]} rounded-full`}
        />
      </div>
    </div>
  );
}
