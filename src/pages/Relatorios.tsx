import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown,
  BarChart3, 
  PieChart, 
  Download, 
  Calendar, 
  Filter, 
  Users, 
  Scissors, 
  ArrowUpRight, 
  ArrowDownRight,
  Target,
  Zap,
  Activity,
  ChevronRight,
  CalendarDays,
  Printer,
  FileText,
  Search,
  Loader2,
  DollarSign,
  Briefcase,
  Package,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  Trophy,
  Medal,
  Crown,
  Award,
  Clock,
  CreditCard,
  Star,
  ThumbsUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, parseISO, startOfDay, endOfDay, subDays, isWithinInterval } from 'date-fns';
import { reportService, ReportFilter } from '../services/reportService';
import { userService } from '../services/userService';
import { subscriptionService } from '../services/subscriptionService';
import { toast } from 'sonner';

type ReportType = 'geral' | 'agendamentos' | 'clientes' | 'profissionais' | 'financeiro' | 'comissoes' | 'estoque';

export function Relatorios({ activeSubTab }: { activeSubTab?: string }) {
  const [activeReport, setActiveReport] = useState<ReportType>('geral');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [professionals, setProfessionals] = useState<any[]>([]);
  
  // Plans and Subscriptions for BI rankings
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  
  const [filters, setFilters] = useState<ReportFilter>({
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    profissional_id: 'all',
    status: 'all'
  });

  useEffect(() => {
    if (activeSubTab) {
      const tabMap: Record<string, ReportType> = {
        'relatorios-geral': 'geral',
        'relatorios-agendamentos': 'agendamentos',
        'relatorios-clientes': 'clientes',
        'relatorios-financeiro': 'financeiro'
      };
      const targetReport = tabMap[activeSubTab];
      if (targetReport && activeReport !== targetReport) {
        setActiveReport(targetReport);
      }
    }
  }, [activeSubTab]);

  useEffect(() => {
    userService.getAllBarbers().then(setProfessionals).catch(err => console.error("Error loading barbers:", err));
    subscriptionService.getPlans().then(setPlans).catch(err => console.error("Error loading subscription plans:", err));
    subscriptionService.getSubscriptions().then(setSubscriptions).catch(err => console.error("Error loading subscriptions:", err));
  }, []);

  useEffect(() => {
    loadReport();
  }, [activeReport, filters.startDate, filters.endDate, filters.profissional_id, filters.status]);

  const loadReport = async () => {
    setLoading(true);
    try {
      let result;
      switch (activeReport) {
        case 'geral':
          result = await reportService.getGeneralReport(filters);
          break;
        case 'agendamentos':
          result = await reportService.getAppointmentsReport(filters);
          break;
        case 'clientes':
          result = await reportService.getClientsReport(filters);
          break;
        case 'profissionais':
          result = await reportService.getProfessionalsReport(filters);
          break;
        case 'financeiro':
          result = await reportService.getFinanceiroReport(filters);
          break;
        case 'comissoes':
          result = await reportService.getComissoesReport(filters);
          break;
        case 'estoque':
          result = await reportService.getInventoryReport(filters);
          break;
        default:
          result = await reportService.getGeneralReport(filters);
      }
      setData(result);
    } catch (error) {
      console.error("Erro ao carregar relatório:", error);
      toast.error("Erro ao carregar os dados do relatório.");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;
    toast.success("Preparando exportação CSV dos relatórios...");
    
    try {
      let csvContent = "data:text/csv;charset=utf-8,";
      
      if (activeReport === 'geral') {
        csvContent += "Metrica,Valor\r\n";
        csvContent += `Faturamento Bruto,R$ ${data.grossRevenue || 0}\r\n`;
        csvContent += `Despesas,R$ ${data.totalExpenses || 0}\r\n`;
        csvContent += `Resultado Liquido,R$ ${data.netRevenue || 0}\r\n`;
        csvContent += `Apenas Pendente,R$ ${data.pendingAmount || 0}\r\n`;
        csvContent += `Ticket Medio,R$ ${data.ticketMedio || 0}\r\n`;
        csvContent += `Atendimentos Realizados,${data.completedAtendimentos || 0}\r\n`;
      } else if (activeReport === 'agendamentos' && data.data) {
        csvContent += "Data,Hora,Cliente,Servico,Profissional,Status,Preco\r\n";
        data.data.forEach((a: any) => {
          csvContent += `"${a.date}","${a.startTime}","${a.cliente_name || 'N/A'}","${a.servico_name || 'N/A'}","${a.profissional_name || 'N/A'}","${a.status}",${a.price || 0}\r\n`;
        });
      } else if (activeReport === 'clientes' && data.debtors) {
        csvContent += "Cliente,Telefone,Divida Total\r\n";
        data.debtors.forEach((d: any) => {
          csvContent += `"${d.nome}","${d.telefone || ''}",${d.divida}\r\n`;
        });
      } else if (activeReport === 'profissionais' && Array.isArray(data)) {
        csvContent += "Nome,Atendimentos,Producao,Comissao,Comissao Pendente,Ticket Medio\r\n";
        data.forEach((p: any) => {
          const tkt = p.atendimentos ? (p.producao / p.atendimentos) : 0;
          csvContent += `"${p.nome}",${p.atendimentos},${p.producao},${p.comissao},${p.comissaoPendente},${tkt}\r\n`;
        });
      } else if (activeReport === 'financeiro' && data.transactions) {
        csvContent += "Data,Descricao,Metodo,Tipo,Valor\r\n";
        data.transactions.forEach((t: any) => {
          csvContent += `"${t.date}","${t.description}","${t.paymentMethod}","${t.type}",${t.amount}\r\n`;
        });
      } else if (activeReport === 'comissoes' && data.data) {
        csvContent += "Data,Profissional,Servico,Base,Status,Comissao\r\n";
        data.data.forEach((c: any) => {
          csvContent += `"${c.date}","${c.profissional_name}","${c.servico_name}",${c.base_value},"${c.status}",${c.commission_value}\r\n`;
        });
      } else if (activeReport === 'estoque' && data.products) {
        csvContent += "Nome,Categoria,Estoque Atual,Estoque Minimo,Preco Venda\r\n";
        data.products.forEach((p: any) => {
          csvContent += `"${p.name}","${p.categoryName || 'N/A'}",${p.currentStock},${p.minStock},${p.salePrice || 0}\r\n`;
        });
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio-${activeReport}-${filters.startDate}-${filters.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      toast.error("Erro na geração do CSV.");
    }
  };

  return (
    <div className="space-y-8 pb-12" id="intel-relatorios-wrapper">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6" id="relatorios-header">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-primary">Relatórios & BI de Operação</h1>
          <p className="text-muted text-sm font-medium mt-1 uppercase tracking-widest text-[10px]">Análise analítica e rankings estratégicos da barbearia</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            id="btn-print-relatorio"
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-primary px-5 py-3 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all shadow-sm active:scale-95 uppercase tracking-widest"
          >
            <Printer size={16} />
            <span>Imprimir</span>
          </button>
          <button 
            id="btn-export-relatorio"
            onClick={exportToCSV}
            className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95 uppercase tracking-widest"
          >
            <Download size={16} />
            <span>Exportar CSV</span>
          </button>
        </div>
      </header>

      {/* Filters Bar */}
      <div className="bg-surface border border-border p-6 rounded-[2rem] shadow-sm flex flex-wrap items-center gap-6" id="filters-container">
        <div className="flex items-center gap-3">
          <Calendar size={18} className="text-accent" />
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <input 
              id="filter-start-date"
              type="date" 
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="bg-transparent text-xs font-bold text-primary outline-none"
            />
            <span className="text-slate-300">|</span>
            <input 
              id="filter-end-date"
              type="date" 
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="bg-transparent text-xs font-bold text-primary outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Scissors size={18} className="text-sky-500" />
          <select 
            id="filter-barber-select"
            value={filters.profissional_id}
            onChange={(e) => setFilters({...filters, profissional_id: e.target.value})}
            className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-primary outline-none cursor-pointer"
          >
            <option value="all">Todos os Profissionais</option>
            {Array.from(new Map((professionals || []).filter(p => p && (p.uid || p.id)).map(p => [p.uid || p.id, p])).values()).map((p: any, index: number) => (
              <option key={`prof-filter-${p.uid || p.id || index}`} value={p.uid || p.id}>{p.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-muted">
          <Search size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">Painel Inteligente Filtrado</span>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 p-1.5 bg-surface border border-border rounded-2.5xl shadow-sm overflow-x-auto no-scrollbar" id="relatorios-tabs-bar">
        {[
          { id: 'geral', label: 'Painel Geral', icon: <Trophy size={16} /> },
          { id: 'agendamentos', label: 'Agendamentos & Horários', icon: <CalendarDays size={16} /> },
          { id: 'clientes', label: 'Clientes & Ranks', icon: <Users size={16} /> },
          { id: 'profissionais', label: 'Rank de Profissionais', icon: <Briefcase size={16} /> },
          { id: 'financeiro', label: 'Finanças & Métodos', icon: <DollarSign size={16} /> },
          { id: 'comissoes', label: 'Comissões de Equipe', icon: <TrendingUp size={16} /> },
          { id: 'estoque', label: 'Produtos & Assinaturas', icon: <Package size={16} /> },
        ].map((tab) => (
          <button
            id={`tab-relatorio-${tab.id}`}
            key={tab.id}
            onClick={() => setActiveReport(tab.id as ReportType)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeReport === tab.id 
                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' 
                : 'text-muted hover:bg-slate-50 hover:text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
            key="loading-indicator"
          >
            <Loader2 className="animate-spin text-accent" size={48} />
            <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] animate-pulse">Consolidando dados reais e calculando ranks...</p>
          </motion.div>
        ) : (
          <motion.div
            key={activeReport}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-8"
          >
            {activeReport === 'geral' && (
              <ReportGeneral 
                data={data} 
                filters={filters} 
                plans={plans} 
                subscriptions={subscriptions} 
              />
            )}
            {activeReport === 'agendamentos' && (
              <ReportAppointments 
                data={data} 
                filters={filters} 
              />
            )}
            {activeReport === 'clientes' && (
              <ReportClients 
                data={data} 
                filters={filters} 
              />
            )}
            {activeReport === 'profissionais' && (
              <ReportProfessionals 
                data={data} 
                filters={filters} 
              />
            )}
            {activeReport === 'financeiro' && (
              <ReportFinanceiro 
                data={data} 
                filters={filters} 
              />
            )}
            {activeReport === 'comissoes' && (
              <ReportComissoes 
                data={data} 
                filters={filters} 
              />
            )}
            {activeReport === 'estoque' && (
              <ReportInventory 
                data={data} 
                filters={filters} 
                plans={plans} 
                subscriptions={subscriptions} 
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 1. REPORT GENERAL (PAINEL GERAL DE LIDERANÇA)
// ==========================================
function ReportGeneral({ data, filters, plans, subscriptions }: { data: any, filters: ReportFilter, plans: any[], subscriptions: any[] }) {
  const [generalStats, setGeneralStats] = useState<any>(null);
  
  useEffect(() => {
    // Collect related charts to create a gorgeous multi-metrics winners card
    const gatherStats = async () => {
      try {
        const apptsRes = await reportService.getAppointmentsReport(filters);
        const barbsRes = await reportService.getProfessionalsReport(filters);
        const invRes = await reportService.getInventoryReport(filters);
        
        // Dynamic calculations for Leaderboard Podium on General Dashboard
        const apptsList = apptsRes.data || [];
        const completedAppts = apptsList.filter((a: any) => a.status === 'concluído');
        
        // A. Top Service (Ranking)
        const serviceCounts: Record<string, { qty: number; revenue: number }> = {};
        completedAppts.forEach((a: any) => {
          if (a.servico_name) {
            if (!serviceCounts[a.servico_name]) {
              serviceCounts[a.servico_name] = { qty: 0, revenue: 0 };
            }
            serviceCounts[a.servico_name].qty++;
            serviceCounts[a.servico_name].revenue += (a.price || 0);
          }
        });
        const topService = Object.entries(serviceCounts)
          .map(([name, stats]) => ({ name, ...stats }))
          .sort((a, b) => b.qty - a.qty)[0] || { name: 'Nenhum', qty: 0, revenue: 0 };

        // B. Top Client (Ranking)
        const clientSpend: Record<string, { name: string; visits: number; spent: number }> = {};
        completedAppts.forEach((a: any) => {
          if (a.cliente_id && a.cliente_name) {
            if (!clientSpend[a.cliente_id]) {
              clientSpend[a.cliente_id] = { name: a.cliente_name, visits: 0, spent: 0 };
            }
            clientSpend[a.cliente_id].visits++;
            clientSpend[a.cliente_id].spent += (a.price || 0);
          }
        });
        const topClientBySpend = Object.values(clientSpend).sort((a, b) => b.spent - a.spent)[0] || { name: 'Sem registros', visits: 0, spent: 0 };

        // C. Top Barber (Leader of team)
        const sortedBarbers = (barbsRes || []).sort((a: any, b: any) => b.producao - a.producao);
        const topBarber = sortedBarbers[0] || { nome: 'Nenhum', producao: 0, atendimentos: 0 };

        // D. Top Product (Giro de estoque)
        const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
        const movementsList = invRes.movements || [];
        movementsList.filter((m: any) => m.type === 'venda').forEach((m: any) => {
          if (m.produto_name || m.productName) {
            const pName = m.produto_name || m.productName;
            if (!productSales[pName]) {
              productSales[pName] = { name: pName, qty: 0, revenue: 0 };
            }
            const qty = Number(m.quantity || m.quantidade || 1);
            productSales[pName].qty += qty;
            productSales[pName].revenue += (Number(m.valorTotal || m.totalPrice || 0));
          }
        });
        const topProduct = Object.values(productSales).sort((a, b) => b.qty - a.qty)[0] || { name: 'Nenhum', qty: 0, revenue: 0 };

        // E. Top Plan (Assinaturas)
        const planCounts: Record<string, number> = {};
        subscriptions.filter(s => s.status === 'active').forEach(s => {
          if (s.planName) {
            planCounts[s.planName] = (planCounts[s.planName] || 0) + 1;
          }
        });
        const topPlan = Object.entries(planCounts)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)[0] || { name: 'Sem assinatura ativa', count: 0 };

        // F. Calculated revenue breakdowns (BI)
        const totalServiceRevenue = completedAppts.reduce((acc: number, a: any) => acc + (a.price || 0), 0);
        const totalProductRevenue = movementsList
          .filter((m: any) => m.type === 'venda')
          .reduce((acc: number, m: any) => acc + (Number(m.valorTotal || m.totalPrice || 0)), 0);

        // G. Service Categories Breakdown Heuristics
        const catStats = {
          corte: { name: 'Cortes & Cabelo', qty: 0, revenue: 0 },
          barba: { name: 'Barboterapia & Barba', qty: 0, revenue: 0 },
          combo: { name: 'Combos Especiais', qty: 0, revenue: 0 },
          quimica: { name: 'Química, Sombr. & Outros', qty: 0, revenue: 0 }
        };

        completedAppts.forEach((a: any) => {
          const sName = (a.servico_name || '').toLowerCase();
          const price = a.price || 0;

          if (sName.includes('combo') || sName.includes('completo') || sName.includes('casadinha') || sName.includes('+') || sName.includes(' e ')) {
            catStats.combo.qty++;
            catStats.combo.revenue += price;
          } else if (sName.includes('barba') || sName.includes('barbo') || sName.includes('navalha')) {
            catStats.barba.qty++;
            catStats.barba.revenue += price;
          } else if (sName.includes('corte') || sName.includes('social') || sName.includes('degrad') || sName.includes('maquina') || sName.includes('máquina') || sName.includes('tesoura') || sName.includes('cabelo')) {
            catStats.corte.qty++;
            catStats.corte.revenue += price;
          } else {
            catStats.quimica.qty++;
            catStats.quimica.revenue += price;
          }
        });

        // H. Client retention calculations
        const clientVisits: Record<string, number> = {};
        completedAppts.forEach((a: any) => {
          if (a.cliente_id) {
            clientVisits[a.cliente_id] = (clientVisits[a.cliente_id] || 0) + 1;
          }
        });
        const clientValues = Object.values(clientVisits);
        const totalUniqueClientsPeriod = clientValues.length;
        const recurringClientsPeriod = clientValues.filter(v => v >= 2).length;
        const recurringPercent = totalUniqueClientsPeriod > 0 ? Math.round((recurringClientsPeriod / totalUniqueClientsPeriod) * 100) : 0;

        setGeneralStats({
          topService,
          topClientBySpend,
          topBarber,
          topProduct,
          topPlan,
          totalServiceRevenue,
          totalProductRevenue,
          catStats,
          retentionStats: {
            totalUnique: totalUniqueClientsPeriod,
            recurring: recurringClientsPeriod,
            percent: recurringPercent
          }
        });
      } catch (err) {
        console.error("Error gathering general stats dashboard:", err);
      }
    };
    gatherStats();
  }, [filters, subscriptions]);

  if (!data) return null;

  // Monthly faturamento goals configuration (dynamic)
  const billingGoal = 25000;
  const progressPercent = Math.min(Math.round(((data.grossRevenue || 0) / billingGoal) * 100), 100);

  return (
    <div className="space-y-8" id="report-general-tab">
      {/* Dynamic KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5" id="general-kpi-grid">
        <ReportKpi title="Faturamento Bruto" value={data.grossRevenue} isCurrency color="emerald" id="kpi-faturamento-bruto" />
        <ReportKpi title="Total em Aberto (Fiados)" value={data.pendingAmount} isCurrency color="red" id="kpi-total-aberto" />
        <ReportKpi title="Ticket Médio" value={data.ticketMedio} isCurrency color="blue" id="kpi-ticket-medio" />
        <ReportKpi title="Atendimentos Concluídos" value={data.completedAtendimentos} isCurrency={false} color="zinc" id="kpi-atendimentos-concluidos" />
      </div>

      {/* Podium & Wall of Fame (Gamer/Visual) */}
      {generalStats && (
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm" id="podium-wall-of-fame">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2.5">
                <Crown className="text-yellow-500 fill-yellow-500" size={24} />
                🏆 Galeria de Líderes do Período
              </h3>
              <p className="text-muted text-xs font-semibold mt-1 uppercase tracking-wider">Top #1 Campeões absolutos com base nos filtros indicados</p>
            </div>
            <span className="text-[10px] bg-yellow-50 text-yellow-600 font-extrabold px-3 py-1.5 rounded-full uppercase tracking-widest border border-yellow-100">
              Desempenho Ouro
            </span>
          </header>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {/* Top Barber */}
            <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center justify-between space-y-4 hover:border-yellow-200 transition-all">
              <div className="w-12 h-12 bg-yellow-100 text-yellow-600 rounded-xl flex items-center justify-center font-black shadow-inner">
                <Scissors size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Profissional Líder</p>
                <h4 className="text-sm font-black text-primary mt-1 line-clamp-1">{generalStats.topBarber?.nome || '—'}</h4>
              </div>
              <div className="bg-yellow-50 border border-yellow-100 px-3 py-1 rounded-xl text-yellow-600 font-black text-xs">
                R$ {generalStats.topBarber?.producao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
              </div>
            </div>

            {/* Top Customer */}
            <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center justify-between space-y-4 hover:border-violet-200 transition-all">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center font-black shadow-inner">
                <Users size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Cliente Mais Fiel</p>
                <h4 className="text-sm font-black text-primary mt-1 line-clamp-1">{generalStats.topClientBySpend?.name || '—'}</h4>
              </div>
              <div className="bg-violet-50 border border-violet-100 px-3 py-1 rounded-xl text-violet-600 font-black text-xs">
                {generalStats.topClientBySpend?.visits || 0} Visitas
              </div>
            </div>

            {/* Top Service */}
            <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center justify-between space-y-4 hover:border-teal-200 transition-all">
              <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center font-black shadow-inner">
                <Award size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Serviço Campeão</p>
                <h4 className="text-sm font-black text-primary mt-1 line-clamp-1">{generalStats.topService?.name || '—'}</h4>
              </div>
              <div className="bg-teal-50 border border-teal-100 px-3 py-1 rounded-xl text-teal-600 font-black text-xs">
                {generalStats.topService?.qty || 0} Realizados
              </div>
            </div>

            {/* Top Product */}
            <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center justify-between space-y-4 hover:border-rose-200 transition-all">
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center font-black shadow-inner">
                <Package size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Produto Mais Vendido</p>
                <h4 className="text-sm font-black text-primary mt-1 line-clamp-1">{generalStats.topProduct?.name || '—'}</h4>
              </div>
              <div className="bg-rose-50 border border-rose-100 px-3 py-1 rounded-xl text-rose-600 font-black text-xs">
                {generalStats.topProduct?.qty || 0} unidades
              </div>
            </div>

            {/* Top Subscription Plan */}
            <div className="bg-slate-50/50 border border-slate-100 p-6 rounded-2xl flex flex-col items-center text-center justify-between space-y-4 hover:border-emerald-200 transition-all">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-black shadow-inner">
                <Zap size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-muted uppercase tracking-widest">Plano em Destaque</p>
                <h4 className="text-sm font-black text-primary mt-1 line-clamp-1">{generalStats.topPlan?.name || '—'}</h4>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-xl text-emerald-600 font-black text-xs">
                {generalStats.topPlan?.count || 0} Ativos
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Goal Target & Flow Structure */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="general-flow-structure">
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl text-primary mb-2 flex items-center gap-3 tracking-tighter">
              <Target size={24} className="text-emerald-500" />
              Meta de Faturamento Mensal
            </h3>
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-8">Acompanhamento de progresso frente ao objetivo de faturamento</p>
          </div>
          
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Progresso Atual ({progressPercent}%)</span>
                <p className="text-2xl font-black text-primary mt-1">R$ {(data.grossRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-muted uppercase tracking-widest">Meta Definida</span>
                <p className="text-xl font-bold text-slate-500 mt-1">R$ {billingGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full relative"
              >
                <span className="absolute right-2 top-0 text-[8px] font-black text-white leading-none">🎯</span>
              </motion.div>
            </div>

            <p className="text-xs text-muted leading-relaxed font-medium bg-emerald-50/50 p-4 border border-emerald-100/30 rounded-2xl">
              💡 {progressPercent >= 100 
                ? 'Espetacular! A meta mensal de faturamento estabelecida para a barbearia já foi totalmente atingida!' 
                : `Faltam apenas R$ ${(billingGoal - data.grossRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para atingir a meta. Continue incentivando as vendas adicionais de produtos e combos.`}
            </p>
          </div>
        </div>

        {/* Financial Flow Summary */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="font-black text-xl text-primary flex items-center gap-3 tracking-tighter">
              <Activity size={24} className="text-accent" />
              Resultado Geral de Caixa
            </h3>
            
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <GeneralMetricItem label="Faturamento Bruto" value={data.grossRevenue} total={data.grossRevenue + data.pendingAmount} isCurrency />
              <GeneralMetricItem label="Total Recebido em Caixa" value={data.grossRevenue} total={data.grossRevenue} isCurrency color="bg-emerald-500" />
              <GeneralMetricItem label="Total com Pagamento Pendente" value={data.pendingAmount} total={data.grossRevenue + data.pendingAmount} isCurrency color="bg-red-500" />
              <GeneralMetricItem label="Despesas Operacionais" value={data.totalExpenses || 0} total={data.grossRevenue || 1} isCurrency color="bg-amber-500" />
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted font-black uppercase tracking-widest">Resultado Líquido Operacional</p>
              <h4 className={`text-2xl font-black tracking-tighter mt-1 ${data.netRevenue >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                R$ {(data.netRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h4>
            </div>
            <span className={`px-3 py-1.5 rounded-xl font-black text-xs border uppercase tracking-wider ${
              data.netRevenue >= 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-red-50 border-red-100 text-red-500'
            }`}>
              {data.netRevenue >= 0 ? 'Lucro Saudável' : 'Prejuízo Operacional'}
            </span>
          </div>
        </div>
      </div>

      {/* NEW SECTION: RAIO-X COMPLETO DO DONO (BI DE CATEGORIAS E PRODUTOS) */}
      {generalStats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="owner-xray-bi-dashboard">
          {/* COMPARATIVO SERVIÇOS VS PRODUTOS */}
          <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between col-span-1">
            <div>
              <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center text-sky-600 shadow-inner mb-6">
                <BarChart3 size={24} />
              </div>
              <h3 className="font-black text-xl text-primary tracking-tighter">
                Serviços vs. Venda de Produtos
              </h3>
              <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1">Comparação de representatividade no caixa</p>
              
              <div className="space-y-6 mt-8">
                {/* Serviços */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500 uppercase tracking-wider">Serviços Prestados</span>
                    <span className="text-primary">R$ {(generalStats.totalServiceRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 rounded-full" 
                      style={{ 
                        width: `${
                          (generalStats.totalServiceRevenue || generalStats.totalProductRevenue) 
                            ? Math.round((generalStats.totalServiceRevenue / (generalStats.totalServiceRevenue + generalStats.totalProductRevenue)) * 100) 
                            : 100
                        }%` 
                      }} 
                    />
                  </div>
                  <p className="text-[10px] text-right font-black text-indigo-600">
                    {Math.round(((generalStats.totalServiceRevenue || 0) / ((generalStats.totalServiceRevenue + generalStats.totalProductRevenue) || 1)) * 100)}% de participação
                  </p>
                </div>

                {/* Produtos */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-500 uppercase tracking-wider">Venda de Produtos</span>
                    <span className="text-primary">R$ {(generalStats.totalProductRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full" 
                      style={{ 
                        width: `${
                          (generalStats.totalServiceRevenue || generalStats.totalProductRevenue) 
                            ? Math.round((generalStats.totalProductRevenue / (generalStats.totalServiceRevenue + generalStats.totalProductRevenue)) * 100) 
                            : 0
                        }%` 
                      }} 
                    />
                  </div>
                  <p className="text-[10px] text-right font-black text-emerald-600">
                    {Math.round(((generalStats.totalProductRevenue || 0) / ((generalStats.totalServiceRevenue + generalStats.totalProductRevenue) || 1)) * 100)}% de participação
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-slate-50/70 border border-slate-100 p-4 rounded-2xl text-xs text-slate-600 font-medium leading-relaxed">
              📌 {generalStats.totalProductRevenue > 0 
                ? `A barbearia possui uma excelente ativação de vendas físicas. Para cada R$ 100,00 faturados em serviços, R$ ${Math.round((generalStats.totalProductRevenue / (generalStats.totalServiceRevenue || 1)) * 100)} são agregados em produtos.`
                : 'Nenhuma venda de produto registrada no período. Que tal treinar a equipe para oferecer pomadas, óleos ou cervejas ao finalizar o serviço?'}
            </div>
          </div>

          {/* RAIO-X DETALHADO POR CATEGORIAS */}
          <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between col-span-2">
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-inner mb-6">
                <PieChart size={24} />
              </div>
              <h3 className="font-black text-xl text-primary tracking-tighter">
                X-Ray de Receita por Categorias de Serviços
              </h3>
              <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1">Análise volumétrica e faturamento por categoria principal</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                {Object.entries(generalStats.catStats || {}).map(([key, cat]: [string, any]) => {
                  const part = generalStats.totalServiceRevenue > 0 
                    ? Math.round((cat.revenue / generalStats.totalServiceRevenue) * 100)
                    : 0;
                  
                  const colors: Record<string, string> = {
                    corte: 'border-l-indigo-500 bg-indigo-50/20 text-indigo-800',
                    barba: 'border-l-amber-500 bg-amber-50/20 text-amber-800',
                    combo: 'border-l-teal-500 bg-teal-50/20 text-teal-800',
                    quimica: 'border-l-purple-500 bg-purple-50/20 text-purple-800'
                  };

                  return (
                    <div 
                      key={key} 
                      className={`border-l-4 p-4 rounded-r-2xl border border-slate-100 flex flex-col justify-between ${colors[key] || 'border-l-slate-400 bg-slate-50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{cat.name}</p>
                          <h4 className="text-base font-black mt-1 text-primary">R$ {cat.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                        </div>
                        <span className="text-xs font-black bg-white px-2 py-0.5 rounded-lg shadow-sm border border-slate-150">
                          {part}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100/30 text-[10px] font-bold text-slate-500">
                        <span>Quantidade: <span className="font-extrabold text-primary">{cat.qty}x</span></span>
                        <span>Ticket M.: <span className="font-extrabold text-primary">R$ {cat.qty > 0 ? Math.round(cat.revenue / cat.qty) : 0}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FIDELIDADE & RECORRÊNCIA DE CLIENTES */}
            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-primary">Índice de Recorrência & Retenção</h4>
                  <p className="text-[10px] text-muted font-bold uppercase tracking-wider">Proporção de clientes fiéis atendidos no período</p>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border shrink-0">
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-500">Clientes Atendidos: <strong className="text-primary">{generalStats.retentionStats?.totalUnique || 0}</strong></p>
                  <p className="text-[10px] font-bold text-slate-500">Recorrentes (2+ visitas): <strong className="text-indigo-600">{generalStats.retentionStats?.recurring || 0}</strong></p>
                </div>
                <div className="px-3.5 py-2 bg-indigo-600 text-white font-black text-sm rounded-xl shadow-md">
                  {generalStats.retentionStats?.percent || 0}% de Retenção
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. REPORT APPOINTMENTS (AGENDAMENTOS, DIAS E HORÁRIOS DE PICO)
// ==========================================
function ReportAppointments({ data, filters }: { data: any, filters: ReportFilter }) {
  const [activeTab, setActiveTab] = useState<'all' | 'peak' | 'hourly'>('all');

  if (!data || !data.stats || !data.data) return null;
  const { stats, data: list } = data;

  // Calculando Ranks de pico de atendimento
  // A. Dias da semana mais populares
  const weekDayMap: Record<number, { count: number; name: string }> = {
    0: { count: 0, name: 'Domingo' },
    1: { count: 0, name: 'Segunda-feira' },
    2: { count: 0, name: 'Terça-feira' },
    3: { count: 0, name: 'Quarta-feira' },
    4: { count: 0, name: 'Quinta-feira' },
    5: { count: 0, name: 'Sexta-feira' },
    6: { count: 0, name: 'Sábado' },
  };

  list.forEach((a: any) => {
    if (a.date) {
      const day = parseISO(a.date).getDay();
      if (weekDayMap[day]) {
        weekDayMap[day].count++;
      }
    }
  });

  const rankedDays = Object.values(weekDayMap)
    .sort((a, b) => b.count - a.count);

  const maxDayCount = Math.max(...rankedDays.map(d => d.count), 1);

  // B. Horários mais populares
  const hourMap: Record<string, number> = {};
  list.forEach((a: any) => {
    if (a.startTime) {
      const hour = a.startTime.substring(0, 5); // Ex: "14:30" -> "14:30" ou "14:00" -> "14:00"
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
  });

  const rankedHours = Object.entries(hourMap)
    .map(([time, count]) => ({ time, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10 Horários de pico

  const maxHourCount = Math.max(...rankedHours.map(h => h.count), 1);

  // C. Ranking de Serviços por Lucratividade e Volume
  const serviceStatsMap: Record<string, { qty: number; totalRev: number }> = {};
  list.forEach((a: any) => {
    if (a.servico_name && a.status === 'concluído') {
      if (!serviceStatsMap[a.servico_name]) {
        serviceStatsMap[a.servico_name] = { qty: 0, totalRev: 0 };
      }
      serviceStatsMap[a.servico_name].qty++;
      serviceStatsMap[a.servico_name].totalRev += (a.price || 0);
    }
  });

  const rankedServices = Object.entries(serviceStatsMap)
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) => b.qty - a.qty);

  const maxServiceQty = Math.max(...rankedServices.map(s => s.qty), 1);

  return (
    <div className="space-y-8" id="report-appointments-tab">
      {/* Metrics mini KPI header */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4" id="appointments-mini-kpis">
        <ReportKpiMini title="Solicitados" value={stats.total} color="zinc" />
        <ReportKpiMini title="Atendidos" value={stats.concluidos} color="emerald" />
        <ReportKpiMini title="Cancelados" value={stats.cancelados} color="red" />
        <ReportKpiMini title="Faltaram" value={stats.faltas} color="amber" />
        <ReportKpiMini title="Confirmados" value={stats.confirmados} color="blue" />
        <ReportKpiMini title="Recorrentes" value={stats.recorrentes} color="purple" />
      </div>

      {/* Sub tabs para rankings específicos */}
      <div className="flex border-b border-border gap-6 pb-2" id="appointments-inner-tabs">
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'all' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          Filas de Atendimento ({list.length})
        </button>
        <button
          onClick={() => setActiveTab('peak')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'peak' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          Dias da Semana de Pico
        </button>
        <button
          onClick={() => setActiveTab('hourly')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'hourly' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          Ranking de Horários & Serviços
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: ALL REGISTERS */}
        {activeTab === 'all' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm"
            key="tab-appt-history"
          >
            <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
              <h3 className="font-black text-lg text-primary tracking-tighter">Histórico de Atendimentos do Período</h3>
              <span className="text-[10px] font-black text-muted bg-slate-100 px-3 py-1 rounded-full uppercase tracking-widest">{list.length} registros</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-border">
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Data / Hora</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Cliente</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Serviço Solicitado</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Profissional</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Canal/Tipo</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor cobrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((a: any, i: number) => (
                    <tr key={`app-${a.id || i}-${i}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-4 whitespace-nowrap">
                        <p className="text-xs font-bold text-primary">{format(parseISO(a.date), 'dd/MM/yyyy')}</p>
                        <p className="text-[10px] text-muted font-medium mt-0.5">{a.startTime}</p>
                      </td>
                      <td className="px-8 py-4">
                        <p className="text-xs font-bold text-primary truncate max-w-[155px]">{a.cliente_name || 'N/A'}</p>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">{a.servico_name || 'Personalizado'}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest">{a.profissional_name || 'Sem designação'}</span>
                      </td>
                      <td className="px-8 py-4">
                        <span className="text-[10px] text-muted uppercase font-semibold">{a.origin === 'recorrente' ? 'Recorrência' : 'App/Painel'}</span>
                      </td>
                      <td className="px-8 py-4">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-8 py-4 text-right">
                        <p className="text-xs font-black text-primary">R$ {(a.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhum agendamento encontrado no período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* TAB 2: PEAK DAYS */}
        {activeTab === 'peak' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            key="tab-appt-peak-days"
          >
            <div className="md:col-span-2 bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
                  <Star className="text-blue-500 fill-blue-500" size={20} />
                  Dias de Maior Ocupação de Agenda
                </h3>
                <p className="text-muted text-xs font-medium uppercase tracking-wider mt-1 mb-8">Gráfico de volume de agendamentos aglomerados por dia da semana</p>
              </div>

              <div className="space-y-6">
                {rankedDays.map((d, idx) => {
                  const pct = Math.round((d.count / maxDayCount) * 100);
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div className="space-y-2.5" key={`rank-day-${d.name}`}>
                      <div className="flex justify-between items-center text-xs font-bold">
                        <span className="text-primary flex items-center gap-2 font-black uppercase text-[10px]">
                          <span className="text-slate-400 w-6 font-mono text-center">{idx < 3 ? medals[idx] : `${idx + 1}º`}</span>
                          {d.name}
                        </span>
                        <span className="text-primary font-black">{d.count} Atendimentos</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            idx === 0 ? 'bg-indigo-600' : idx === 1 ? 'bg-sky-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div className="space-y-6 text-center py-6">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mx-auto shadow-inner">
                  <Clock size={36} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-muted uppercase tracking-widest">Dia Mais Movimentado</p>
                  <h4 className="text-2xl font-black text-primary mt-2">
                    {rankedDays[0]?.count > 0 ? rankedDays[0].name : 'Sem registros'}
                  </h4>
                </div>
                <p className="text-xs text-muted leading-relaxed max-w-xs mx-auto font-medium">
                  De acordo com os registros de agendamentos, o dia de pico da barbearia é <strong>{rankedDays[0]?.name || 'ND'}</strong>. Planeje equipes extras para suprir a demanda neste dia.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: HOURLY & SERVICE RANKING */}
        {activeTab === 'hourly' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
            key="tab-appt-hourly"
          >
            {/* Top Hour Schedules */}
            <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-lg text-primary tracking-tighter flex items-center gap-2">
                  <Clock className="text-sky-500" size={18} />
                  Top 10 Horários de Pico
                </h4>
                <p className="text-muted text-[10px] font-black uppercase tracking-wider mt-1 mb-8">Horas do expediente preferidas pelos clientes</p>
              </div>

              <div className="space-y-5">
                {rankedHours.map((h, idx) => {
                  const pct = Math.round((h.count / maxHourCount) * 100);
                  return (
                    <div className="space-y-2" key={`hour-${h.time}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-primary font-mono bg-sky-50 text-sky-600 px-2 py-0.5 rounded-lg text-[11px]">{h.time}h</span>
                        <span className="font-black text-slate-800">{h.count} reservas</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
                {rankedHours.length === 0 && (
                  <p className="text-center italic text-xs text-muted py-12">Sem dados de horários no período.</p>
                )}
              </div>
            </div>

            {/* Top Services Performed */}
            <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-lg text-primary tracking-tighter flex items-center gap-2">
                  <Scissors className="text-teal-500" size={18} />
                  Ranking de Popularidade de Serviços
                </h4>
                <p className="text-muted text-[10px] font-black uppercase tracking-wider mt-1 mb-8">Serviços que geraram maior volume de caixa no período</p>
              </div>

              <div className="space-y-6">
                {rankedServices.map((s, idx) => {
                  const pct = Math.round((s.qty / maxServiceQty) * 100);
                  const medals = ['🥇', '🥈', '🥉'];
                  return (
                    <div className="space-y-2" key={`serv-${s.name}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-black text-primary uppercase text-[10px] flex items-center gap-2">
                          <span className="text-slate-400 w-5 font-mono">{idx < 3 ? medals[idx] : `${idx + 1}º`}</span>
                          {s.name}
                        </span>
                        <span className="font-semibold text-muted text-[11px]">
                          <strong>{s.qty}x</strong> (R$ {s.totalRev.toLocaleString('pt-BR')})
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            idx === 0 ? 'bg-teal-500' : idx === 1 ? 'bg-sky-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
                {rankedServices.length === 0 && (
                  <p className="text-center italic text-xs text-muted py-12">Sem dados de serviços executados no período.</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 3. REPORT CLIENTS (RANK DE CONSUMO DE CLIENTES E DEVEDORES)
// ==========================================
function ReportClients({ data, filters }: { data: any, filters: ReportFilter }) {
  const [clientRankTab, setClientRankTab] = useState<'ranking' | 'debtors'>('ranking');
  const [clientRankings, setClientRankings] = useState<any[]>([]);

  if (!data || !data.stats || !data.debtors) return null;
  const { stats, debtors } = data;

  useEffect(() => {
    // We calculate Client rankings by fetching details of completed appointments in that filter period
    const fetchClientRanks = async () => {
      try {
        const apptsRes = await reportService.getAppointmentsReport(filters);
        const appts = apptsRes.data || [];
        const completed = appts.filter((a: any) => a.status === 'concluído');
        
        const clientMap: Record<string, any> = {};
        completed.forEach((a: any) => {
          if (a.cliente_id && a.cliente_name) {
            if (!clientMap[a.cliente_id]) {
              clientMap[a.cliente_id] = {
                id: a.cliente_id,
                nome: a.cliente_name,
                telefone: a.cliente_telefone || '',
                appointmentsCount: 0,
                totalSpend: 0,
                preferredBarber: '',
                barberOccurrences: {} as Record<string, number>
              };
            }
            clientMap[a.cliente_id].appointmentsCount++;
            clientMap[a.cliente_id].totalSpend += (a.price || 0);
            
            // Preferência de barbeiro
            if (a.profissional_name) {
              clientMap[a.cliente_id].barberOccurrences[a.profissional_name] = (clientMap[a.cliente_id].barberOccurrences[a.profissional_name] || 0) + 1;
            }
          }
        });

        // Determine best barber for each client
        const rankingsList = Object.values(clientMap).map((c: any) => {
          let favorite = 'Vários';
          let maxCount = 0;
          Object.entries(c.barberOccurrences).forEach(([name, count]: [string, any]) => {
            if (count > maxCount) {
              maxCount = count;
              favorite = name;
            }
          });
          return {
            ...c,
            preferredBarber: favorite
          };
        });

        // Rank by total spent
        rankingsList.sort((a, b) => b.totalSpend - a.totalSpend);
        setClientRankings(rankingsList.slice(0, 15)); // Top 15 Customer Spend
      } catch (err) {
        console.error("Error creating client rankings:", err);
      }
    };
    fetchClientRanks();
  }, [filters]);

  return (
    <div className="space-y-8" id="report-clients-tab">
      {/* Top Client KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5" id="clients-kpis-grid">
        <ReportKpi title="Novos Clientes Cadastrados" value={stats.newClients} isCurrency={false} color="blue" />
        <ReportKpi title="Clientes Recorrentes (Periodo)" value={stats.recurringClients} isCurrency={false} color="emerald" />
        <ReportKpi title="Clientes com Fiados" value={stats.debtorClients} isCurrency={false} color="red" />
        <ReportKpi title="Gasto Médio Base Total" value={stats.debtTotal / (stats.totalClients || 1)} isCurrency color="zinc" />
      </div>

      <div className="flex border-b border-border gap-6 pb-2" id="clients-sub-tabs">
        <button
          onClick={() => setClientRankTab('ranking')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            clientRankTab === 'ranking' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          🏆 Ranking de Consumo (Clientes VIP)
        </button>
        <button
          onClick={() => setClientRankTab('debtors')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            clientRankTab === 'debtors' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          🚨 Lista de Devedores / Fiados Pendentes ({debtors.length})
        </button>
      </div>

      <AnimatePresence mode="wait">
        {clientRankTab === 'ranking' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            key="tab-client-ranking"
          >
            {/* The Top Spend Table */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm">
              <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
                <h3 className="font-black text-lg text-primary tracking-tighter flex items-center gap-2">
                  <Crown className="text-yellow-500 fill-yellow-500" size={20} />
                  Top 15 Clientes de Maior Volume de Compras
                </h3>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 font-extrabold px-3 py-1 rounded-lg uppercase tracking-widest">Altamente Ativos</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest w-16">Rank</th>
                      <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Nome do Cliente</th>
                      <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Atendimentos</th>
                      <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Pref. de Barbeiro</th>
                      <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Faturamento Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clientRankings.map((c: any, index: number) => {
                      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                      return (
                        <tr key={`client-rank-${c.id || index}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-8 py-4 font-mono font-black text-xs text-center">
                            {medal ? <span className="text-xl">{medal}</span> : `${index + 1}º`}
                          </td>
                          <td className="px-8 py-4">
                            <p className="text-xs font-bold text-primary">{c.nome}</p>
                            <p className="text-[9px] text-muted font-bold font-mono">{c.telefone || 'Sem fone'}</p>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className="text-xs font-black text-primary">{c.appointmentsCount}x</span>
                          </td>
                          <td className="px-8 py-4 text-center">
                            <span className="text-[10px] font-bold text-slate-500 uppercase bg-slate-100 px-2 py-1 rounded-md">{c.preferredBarber}</span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <p className="text-xs font-black text-emerald-600">R$ {c.totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                          </td>
                        </tr>
                      );
                    })}
                    {clientRankings.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhum atendimento finalizado no período para classificar ranks.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Retention and Base Size card */}
            <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div className="space-y-6 text-center py-4">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto shadow-inner">
                  <Users size={32} />
                </div>
                <div>
                  <h4 className="text-3xl font-black text-primary tracking-tighter">{stats.totalClients}</h4>
                  <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-2">Clientes Totais na Base</p>
                </div>

                <div className="w-full pt-8 border-t border-slate-100 space-y-5 text-left text-xs font-bold">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Inscritos no Período</span>
                    <span className="text-blue-600 font-black">+{stats.newClients}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest">Taxa de Retenção Ativa</span>
                    <span className="text-emerald-600 font-black">{Math.round((stats.recurringClients / (stats.totalClients || 1)) * 100)}%</span>
                  </div>
                </div>

                <p className="text-xs text-muted leading-relaxed font-semibold bg-indigo-50/30 p-4 border border-indigo-100/20 rounded-2xl text-left mt-6">
                  💡 <strong>Insight de Retenção:</strong> Sua barbearia possui {Math.round((stats.recurringClients / (stats.totalClients || 1)) * 100)}% dos clientes retornando no período selecionado. Excelente índice de fidelidade!
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm"
            key="tab-client-debtors"
          >
            <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
              <h3 className="font-black text-lg text-primary tracking-tighter">Fichas de Clientes com Débitos em Aberto</h3>
              <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">Total Devido: R$ {stats.debtTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Nome Completo</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Telefone / Contato</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Status de Cobrança</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Dívida Consolidada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {debtors.map((d: any, i: number) => (
                    <tr key={`debtor-${d.uid || i}-${i}`} className="hover:bg-red-50/20 transition-colors">
                      <td className="px-8 py-4">
                        <p className="text-xs font-bold text-primary">{d.nome}</p>
                      </td>
                      <td className="px-8 py-4">
                        <p className="text-xs text-muted font-mono">{d.telefone || '-'}</p>
                      </td>
                      <td className="px-8 py-4">
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-red-50 text-red-600 border border-red-100">Necessita Cobrança</span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <p className="text-xs font-black text-red-600">R$ {d.divida.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </td>
                    </tr>
                  ))}
                  {debtors.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhuma conta pendente de pagamento ativo.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 4. REPORT PROFESSIONALS (RANKING DE EQUIPE / PERFORMANCE)
// ==========================================
function ReportProfessionals({ data, filters }: { data: any, filters: ReportFilter }) {
  const [classificator, setClassificator] = useState<'revenue' | 'appointments' | 'ticket'>('revenue');

  if (!data || !Array.isArray(data)) return null;

  // Calculando com base no Classificador
  const sortedProfessionals = [...data].sort((a: any, b: any) => {
    if (classificator === 'appointments') {
      return b.atendimentos - a.atendimentos;
    }
    if (classificator === 'ticket') {
      const ticketA = a.atendimentos ? (a.producao / a.atendimentos) : 0;
      const ticketB = b.atendimentos ? (b.producao / b.atendimentos) : 0;
      return ticketB - ticketA;
    }
    return b.producao - a.producao; // default revenue faturamento
  });

  const maxBilling = Math.max(...data.map(p => p.producao), 1);

  return (
    <div className="space-y-8" id="report-professionals-tab">
      <div className="bg-surface border border-border p-8 rounded-[2.5rem] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
            <Briefcase className="text-indigo-500" size={24} />
            Leaderboard de Performance da Equipe
          </h3>
          <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1">Gere rankings comparativos de profissionais instantaneamente por métricas</p>
        </div>
        
        {/* Classificator buttons */}
        <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-100 rounded-2xl self-start-or-center" id="barbers-classificators">
          <button
            onClick={() => setClassificator('revenue')}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              classificator === 'revenue' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-primary'
            }`}
          >
            Faturamento Bruto
          </button>
          <button
            onClick={() => setClassificator('appointments')}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              classificator === 'appointments' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-primary'
            }`}
          >
            Atendimentos
          </button>
          <button
            onClick={() => setClassificator('ticket')}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              classificator === 'ticket' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-primary'
            }`}
          >
            Ticket Médio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="barbers-dashboard-layout">
        {/* Leaderboard list */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm">
          <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
            <h4 className="font-black text-lg text-primary tracking-tighter">Comissão & Distribuição de Caixa</h4>
            <span className="text-[10px] bg-sky-50 text-sky-600 border border-sky-100 font-extrabold px-3 py-1 rounded-md uppercase tracking-wider">Período Selecionado</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest w-16">Rank</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest">Colaborador</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center">Atendimentos</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Comissão Paga</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Apenas Pendente</th>
                  <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right">Produção Bruta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedProfessionals.map((p: any, index: number) => {
                  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                  const pct = Math.round((p.producao / maxBilling) * 100);
                  const ticket = p.atendimentos ? (p.producao / p.atendimentos) : 0;
                  return (
                    <tr key={`prof-${p.id || index}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-5 font-mono font-black text-xs text-center">
                        {medal ? <span className="text-xl">{medal}</span> : `${index + 1}º`}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 capitalize text-sm">
                            {p.nome?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-black text-primary">{p.nome}</p>
                            <p className="text-[9px] text-muted font-bold uppercase tracking-wider">Ticket M.: R$ {ticket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                        {/* Tiny Progress bar inside list representing proportion */}
                        <div className="w-full h-1 bg-slate-100 rounded-full mt-3 overflow-hidden">
                          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-md">{p.atendimentos}x</span>
                      </td>
                      <td className="px-8 py-5 text-right font-bold text-xs text-emerald-600">
                        R$ {p.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-8 py-5 text-right font-bold text-xs text-amber-500">
                        R$ {p.comissaoPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <p className="text-xs font-black text-primary">R$ {p.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </td>
                    </tr>
                  );
                })}
                {sortedProfessionals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhum profissional com produção registrada no período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dynamic Insights card */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div className="space-y-6">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 shadow-inner">
              <Award size={24} />
            </div>
            <h4 className="font-extrabold text-lg text-primary tracking-tighter">Insights de Equipe</h4>
            <div className="space-y-4 pt-4 border-t border-slate-100 text-xs text-slate-600 font-medium leading-relaxed">
              {sortedProfessionals.length > 0 ? (
                <>
                  <p>
                    🏅 <strong>Destaque em Faturamento:</strong> O barbeiro liderando o período é <strong>{sortedProfessionals[0]?.nome}</strong>, com produção bruta de <strong>R$ {sortedProfessionals[0]?.producao?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
                  </p>
                  <p>
                    📈 <strong>Ticket Médio Líder:</strong> O melhor ticket médio por cliente pertence a <strong>{[...sortedProfessionals].sort((a: any, b: any) => {
                      const tktA = a.atendimentos ? (a.producao / a.atendimentos) : 0;
                      const tktB = b.atendimentos ? (b.producao / b.atendimentos) : 0;
                      return tktB - tktA;
                    })[0]?.nome}</strong>.
                  </p>
                </>
              ) : (
                <p className="italic">Sem dados comparativos suficientes ainda para este período.</p>
              )}
              <p className="bg-slate-50 p-4 border rounded-2xl">
                💡 <strong>Dica operacional:</strong> Monitore de perto a comissão pendente (R$ {sortedProfessionals.reduce((acc, p) => acc + p.comissaoPendente, 0).toLocaleString('pt-BR')}) para agilizar as liquidações nos dias de acerto de contas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. REPORT FINANCEIRO (MÉTODOS DE PAGAMENTO E FLUXO)
// ==========================================
function ReportFinanceiro({ data, filters }: { data: any, filters: ReportFilter }) {
  if (!data || !data.stats || !data.transactions) return null;
  const { stats, transactions, byMethod } = data;

  // Calculando comissão e faturamento por métodos de pagamento para Ranking
  const methodList = Object.entries(byMethod || {})
    .map(([method, amount]: [string, any]) => ({
      method,
      amount
    }))
    .sort((a, b) => b.amount - a.amount);

  const totalBilling = methodList.reduce((acc, m) => acc + m.amount, 0) || 1;

  const translationTable: Record<string, string> = {
    pix: 'Pix instantâneo',
    credito: 'Cartão de Crédito',
    debito: 'Cartão de Débito',
    dinheiro: 'Dinheiro físico',
    saldo_conta: 'Saldo em Conta Clientes',
    outros: 'Outros Métodos'
  };

  // Grouping by categories for Entradas and Saídas
  const incomeCategoryList = useMemo(() => {
    const groups: Record<string, number> = {};
    transactions
      .filter((t: any) => t.type === 'income' && t.status === 'pago')
      .forEach((t: any) => {
        const cat = t.category || 'Outros';
        groups[cat] = (groups[cat] || 0) + (t.amount || 0);
      });
    return Object.entries(groups)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const expenseCategoryList = useMemo(() => {
    const groups: Record<string, number> = {};
    transactions
      .filter((t: any) => t.type === 'expense' && t.status === 'pago')
      .forEach((t: any) => {
        const cat = t.category || 'Outros';
        groups[cat] = (groups[cat] || 0) + (t.amount || 0);
      });
    return Object.entries(groups)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  return (
    <div className="space-y-8" id="report-financial-tab">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5" id="finance-kpi-sub-grid">
        <ReportKpi title="Entradas de Caixa" value={stats.income} isCurrency color="emerald" />
        <ReportKpi title="Custos / Despesas" value={stats.expense} isCurrency color="red" />
        <ReportKpi title="Sangrias e Retiradas" value={stats.sangria} isCurrency color="amber" />
        <ReportKpi title="Resultado Líquido" value={stats.balance} isCurrency color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="financial-bi-grid">
        {/* Left Side: Payment Methods Ranking */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
              <CreditCard className="text-zinc-500" size={22} />
              Ranking de Meios de Pagamento
            </h3>
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1 mb-8">Participação de cada tipo de transação no faturamento</p>
          </div>

          <div className="space-y-6">
            {methodList.map((m, idx) => {
              const pct = Math.round((m.amount / totalBilling) * 100);
              return (
                <div className="space-y-2.5" key={`method-rank-${m.method}`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-primary capitalize text-[11px] flex items-center gap-2">
                      <span className="font-mono text-zinc-400 text-[10px] w-6 text-center font-bold">#{idx + 1}</span>
                      {translationTable[m.method.toLowerCase()] || m.method}
                    </span>
                    <span className="font-bold text-muted text-[11px]">
                      <strong>R$ {m.amount.toLocaleString('pt-BR')}</strong> ({pct}%)
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className={`h-full rounded-full ${
                        idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-indigo-500' : 'bg-slate-400'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
            {methodList.length === 0 && (
              <p className="text-center italic text-xs text-slate-500 py-12">Sem transações consolidadas no período.</p>
            )}
          </div>
        </div>

        {/* Right Side: Detailed historical operations table */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
              <h3 className="font-black text-lg text-primary tracking-tighter">Histórico Financeiro do Período</h3>
              <span className="text-xs font-bold text-muted">{transactions.length} movimentações</span>
            </div>
            
            <div className="overflow-y-auto max-h-[380px] no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-border sticky top-0">
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest bg-slate-50">Data</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest bg-slate-50">Descrição de Transação</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center bg-slate-50">Canal</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center bg-slate-50">Tipo</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right bg-slate-50">Valor total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((t: any, i: number) => (
                    <tr key={`trans-${t.id || i}-${i}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-4">
                        <span className="text-xs font-bold text-primary">{format(parseISO(t.date), 'dd/MM/yyyy')}</span>
                      </td>
                      <td className="px-8 py-4 text-xs font-medium text-slate-600 truncate max-w-[200px]">{t.description}</td>
                      <td className="px-8 py-4 text-center">
                        <span className="text-[9px] font-black text-primary uppercase bg-slate-100 px-2.5 py-1 rounded-lg tracking-widest">{t.paymentMethod}</span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          t.type === 'income' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                          {t.type === 'income' ? 'Entrada' : 'Saída'}
                        </span>
                      </td>
                      <td className={`px-8 py-4 text-right font-black text-xs ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhuma movimentação de fluxo de caixa gravada no período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Categories Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="financial-categories-bi-grid">
        {/* Income Categories */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
              <TrendingUp className="text-emerald-500" size={22} />
              Entradas por Categoria
            </h3>
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1 mb-8">Breakdown de receitas operacionais e entradas</p>
          </div>
          <div className="space-y-6">
            {incomeCategoryList.map((c, idx) => {
              const pct = stats.income > 0 ? Math.round((c.amount / stats.income) * 100) : 0;
              return (
                <div className="space-y-2.5" key={`income-cat-${c.name}`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-primary capitalize text-[11px] flex items-center gap-2">
                      <span className="font-mono text-zinc-400 text-[10px] w-6 text-center font-bold">#{idx + 1}</span>
                      {c.name}
                    </span>
                    <span className="font-bold text-muted text-[11px]">
                      <strong>R$ {c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> ({pct}%)
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className="h-full rounded-full bg-emerald-500"
                    />
                  </div>
                </div>
              );
            })}
            {incomeCategoryList.length === 0 && (
              <p className="text-center italic text-xs text-slate-500 py-12">Nenhuma categoria de entrada registrada no período.</p>
            )}
          </div>
        </div>

        {/* Expense Categories */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
              <TrendingDown className="text-red-500" size={22} />
              Saídas por Categoria
            </h3>
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1 mb-8">Breakdown de despesas corporativas e custos</p>
          </div>
          <div className="space-y-6">
            {expenseCategoryList.map((c, idx) => {
              const pct = stats.expense > 0 ? Math.round((c.amount / stats.expense) * 100) : 0;
              return (
                <div className="space-y-2.5" key={`expense-cat-${c.name}`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-primary capitalize text-[11px] flex items-center gap-2">
                      <span className="font-mono text-zinc-400 text-[10px] w-6 text-center font-bold">#{idx + 1}</span>
                      {c.name}
                    </span>
                    <span className="font-bold text-muted text-[11px]">
                      <strong>R$ {c.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> ({pct}%)
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 1.2, ease: "easeOut" }}
                      className="h-full rounded-full bg-red-500"
                    />
                  </div>
                </div>
              );
            })}
            {expenseCategoryList.length === 0 && (
              <p className="text-center italic text-xs text-slate-500 py-12">Nenhuma categoria de saída registrada no período.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 6. REPORT COMISSOES (PAGAMENTO E ACERTOS DE EQUIPE)
// ==========================================
function ReportComissoes({ data, filters }: { data: any, filters: ReportFilter }) {
  if (!data || !data.stats || !data.data) return null;
  const { stats, data: list } = data;

  // Realizando o ranking de quem recebeu mais comissão consolidada
  const barberCommissions: Record<string, { total: number; pago: number; pendente: number }> = {};
  list.forEach((c: any) => {
    if (c.profissional_id && c.profissional_name) {
      if (!barberCommissions[c.profissional_name]) {
        barberCommissions[c.profissional_name] = { total: 0, pago: 0, pendente: 0 };
      }
      const val = Number(c.commission_value || 0);
      barberCommissions[c.profissional_name].total += val;
      if (c.status === 'pago') {
        barberCommissions[c.profissional_name].pago += val;
      } else {
        barberCommissions[c.profissional_name].pendente += val;
      }
    }
  });

  const rankedCommList = Object.entries(barberCommissions)
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-8" id="report-commissions-tab">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="comm-kpis-grid">
        <ReportKpi title="Total de Comissões Geradas" value={stats.total} isCurrency color="blue" />
        <ReportKpi title="Total Pago (Quitado)" value={stats.pago} isCurrency color="emerald" />
        <ReportKpi title="Pendente para Acerto" value={stats.pendente} isCurrency color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="commissions-bi-layout">
        {/* Commission Ranks by Barber */}
        <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xl text-primary tracking-tighter flex items-center gap-2">
              <Trophy className="text-yellow-500 fill-yellow-500" size={20} />
              Ganhos de Comissão por Barbeiro
            </h3>
            <p className="text-muted text-xs font-semibold uppercase tracking-wider mt-1 mb-8">Ranking de total acumulado por profissional no período</p>
          </div>

          <div className="space-y-6">
            {rankedCommList.map((bArr, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
              const percentPago = bArr.total > 0 ? Math.round((bArr.pago / bArr.total) * 100) : 0;
              return (
                <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl space-y-3 hover:border-slate-200 transition-all" key={`comm-rank-${bArr.name}`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-extrabold text-primary flex items-center gap-2 uppercase text-[10px]">
                      <span className="text-center font-mono text-[10.5px] w-6">{medal ? medal : `${idx + 1}º`}</span>
                      {bArr.name}
                    </span>
                    <span className="font-black text-primary">R$ {bArr.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  
                  {/* Status of payouts bar */}
                  <div className="flex items-center justify-between text-[9px] font-bold text-muted uppercase tracking-wider">
                    <span>Quitada ($ {bArr.pago.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})</span>
                    <span>Pendente ($ {bArr.pendente.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})</span>
                  </div>
                  
                  <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${percentPago}%` }} />
                  </div>
                </div>
              );
            })}
            {rankedCommList.length === 0 && (
              <p className="text-center italic text-xs text-muted py-12">Sem dados de comissionamento.</p>
            )}
          </div>
        </div>

        {/* List historic Details */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="p-8 border-b border-border bg-slate-50/30 flex justify-between items-center">
              <h3 className="font-black text-lg text-primary tracking-tighter">Detalhamento dos Lançamentos de Comissão</h3>
              <span className="text-xs font-bold text-muted">{list.length} registros</span>
            </div>
            
            <div className="overflow-y-auto max-h-[380px] no-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-border sticky top-0">
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest bg-slate-50">Data</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest bg-slate-50">Profissional</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest bg-slate-50">Serviço/Ref.</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center bg-slate-50">Base de Cálculo</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-center bg-slate-50">Status</th>
                    <th className="px-8 py-5 text-[10px] font-black text-muted uppercase tracking-widest text-right bg-slate-50">Comissão Líquida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {list.map((c: any, i: number) => (
                    <tr key={`comm-${c.id || i}-${i}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-4 text-xs font-bold text-slate-800">{format(parseISO(c.date), 'dd/MM/yyyy')}</td>
                      <td className="px-8 py-4 text-xs font-black uppercase text-primary">{c.profissional_name}</td>
                      <td className="px-8 py-4 text-xs text-muted font-medium">{c.servico_name || 'Serviço'}</td>
                      <td className="px-8 py-4 text-center text-xs text-zinc-500">R$ {safeNumber(c.base_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-8 py-4 text-center">
                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          c.status === 'pago' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                        }`}>
                          {c.status === 'pago' ? 'Quitada' : 'A pagar'}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right text-xs font-black text-primary">R$ {safeNumber(c.commission_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-8 py-16 text-center text-muted italic text-xs font-bold uppercase tracking-widest">Nenhuma comissão faturada no período selecionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. REPORT INVENTORY, PRODUCTS & SUBSCRIPTIONS (GESTÃO COMBINADA)
// ==========================================
function ReportInventory({ data, filters, plans, subscriptions }: { data: any, filters: ReportFilter, plans: any[], subscriptions: any[] }) {
  const [toggleCategory, setToggleCategory] = useState<'products' | 'subscriptions'>('products');

  if (!data || !data.stats || !data.products) return null;
  const { stats, products, movements } = data;

  // Calculando Ranking de Produtos mais vendidos
  const productSalesMap: Record<string, { qty: number; revenue: number; categoryName: string; currentStock: number }> = {};
  
  // Initialize map with all products
  products.forEach((p: any) => {
    productSalesMap[p.name || p.id] = { qty: 0, revenue: 0, categoryName: p.categoryName || 'Sem categoria', currentStock: p.currentStock || 0 };
  });

  movements.filter((m: any) => m.type === 'venda').forEach((m: any) => {
    const pName = m.produto_name || m.productName;
    if (pName) {
      if (!productSalesMap[pName]) {
        productSalesMap[pName] = { qty: 0, revenue: 0, categoryName: 'Venda Geral', currentStock: 0 };
      }
      const quantity = Number(m.quantity || m.quantidade || 1);
      productSalesMap[pName].qty += quantity;
      productSalesMap[pName].revenue += (Number(m.valorTotal || m.totalPrice || 0));
    }
  });

  const rankedProducts = Object.entries(productSalesMap)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  const maxProductQty = Math.max(...rankedProducts.map(p => p.qty), 1);

  // Calculando Planos Mais Populares (Assinantes Ativos)
  const activeSubs = subscriptions.filter(s => s.status === 'active');
  const planStatsMap: Record<string, { count: number; mrr: number; limitHair: number; limitBeard: number }> = {};
  
  // Initialize with plans
  plans.forEach(p => {
    planStatsMap[p.name] = { count: 0, mrr: p.price, limitHair: p.haircutsPerMonth, limitBeard: p.beardsPerMonth };
  });

  activeSubs.forEach(s => {
    if (s.planName) {
      if (!planStatsMap[s.planName]) {
        const found = plans.find(p => p.id === s.plano_id);
        const price = found ? found.price : 0;
        planStatsMap[s.planName] = { count: 0, mrr: price, limitHair: 0, limitBeard: 0 };
      }
      planStatsMap[s.planName].count++;
    }
  });

  const rankedPlans = Object.entries(planStatsMap)
    .map(([name, details]) => ({
      name,
      ...details,
      projectedIncome: details.count * details.mrr
    }))
    .sort((a, b) => b.count - a.count);

  const maxPlanCount = Math.max(...rankedPlans.map(p => p.count), 1);

  return (
    <div className="space-y-8" id="report-inventory-tab">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 text-center" id="inventory-kpi-row">
        <ReportKpi title="Catálogo de Produtos" value={stats.totalProducts} isCurrency={false} color="zinc" />
        <ReportKpi title="Estoque Próximo ao Fim (Critico)" value={stats.lowStockCount} isCurrency={false} color="red" />
        <ReportKpi title="Vendas de Produtos" value={stats.totalSales} isCurrency={false} color="emerald" />
        <ReportKpi title="Garantia MRR (Assinantes)" value={activeSubs.reduce((acc, s) => {
          const plan = plans.find(p => p.id === s.plano_id);
          return acc + (plan ? plan.price : 0);
        }, 0)} isCurrency color="blue" />
      </div>

      {/* Sub tabs para rankings específicos */}
      <div className="flex border-b border-border gap-6 pb-2" id="inventory-sub-navigation">
        <button
          onClick={() => setToggleCategory('products')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            toggleCategory === 'products' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          📦 Ranking de Giro de Produtos
        </button>
        <button
          onClick={() => setToggleCategory('subscriptions')}
          className={`pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            toggleCategory === 'subscriptions' ? 'border-primary text-primary font-extrabold' : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          👑 Ranking de Planos de Assinatura
        </button>
      </div>

      <AnimatePresence mode="wait">
        {toggleCategory === 'products' ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            key="tab-inventory-products"
          >
            {/* Products Sales Rank Table */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-lg text-primary tracking-tighter flex items-center gap-2">
                  <Package className="text-zinc-500" size={18} />
                  Top Produtos Vendidos do Estoque
                </h4>
                <p className="text-muted text-[10px] font-black uppercase tracking-wider mt-1 mb-8">Relação de itens físicos com maior saída comercial</p>
              </div>

              <div className="space-y-5">
                {rankedProducts.map((p, idx) => {
                  const pct = Math.round((p.qty / maxProductQty) * 100);
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
                  return (
                    <div className="space-y-2" key={`prod-row-${p.name}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-primary flex items-center gap-2 text-[10.5px]">
                          <span className="text-center font-mono text-[10.5px] w-6 bg-slate-100 p-0.5 rounded-md">{medal ? medal : `#${idx + 1}`}</span>
                          {p.name}
                        </span>
                        <span className="font-black text-slate-800 text-[11px]">
                          {p.qty} vendas <span className="text-muted font-normal">(Estoque atual: {p.currentStock})</span>
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            idx === 0 ? 'bg-sky-500' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
                {rankedProducts.length === 0 && (
                  <p className="text-center italic text-xs text-muted py-12">Nenhuma venda de produto gravada no período.</p>
                )}
              </div>
            </div>

            {/* Alerta de estoque critico */}
            <div className="bg-surface border border-border rounded-[2.5rem] overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="p-8 border-b border-border bg-slate-50/20">
                  <h4 className="font-black text-sm text-primary uppercase tracking-wider text-rose-500 flex items-center gap-2">
                    <AlertCircle size={16} />
                    Alertas Críticos de Reposição
                  </h4>
                </div>
                
                <div className="p-6 divide-y divide-slate-100 max-h-[350px] overflow-y-auto no-scrollbar">
                  {products.filter((p: any) => p.currentStock <= p.minStock).map((p: any, i: number) => (
                    <div className="py-4 flex justify-between items-center" key={`critical-${p.id || i}`}>
                      <div>
                        <p className="text-xs font-bold text-primary">{p.name}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{p.categoryName || 'Catálogo'}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-red-500 bg-red-50 border border-red-100 px-2.5 py-1 rounded-lg">Critico: {p.currentStock} ún.</span>
                        <p className="text-[9px] text-muted font-bold mt-1">Reposição estipulada em {p.minStock}</p>
                      </div>
                    </div>
                  ))}
                  {products.filter((p: any) => p.currentStock <= p.minStock).length === 0 && (
                    <p className="text-center italic text-xs text-muted py-12">Todos os níveis saudáveis.</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            key="tab-inventory-subscriptions"
          >
            {/* Active Subscription plans ranked by revenue contribution */}
            <div className="lg:col-span-2 bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div>
                <h4 className="font-black text-lg text-primary tracking-tighter flex items-center gap-2">
                  <Crown className="text-yellow-500 fill-yellow-500" size={18} />
                  Ranking de Adesões a Planos de Clube
                </h4>
                <p className="text-muted text-[10px] font-black uppercase tracking-wider mt-1 mb-8">Planos recorrentes com mais assinantes ativos na barbearia</p>
              </div>

              <div className="space-y-6">
                {rankedPlans.map((pl, idx) => {
                  const pct = Math.round((pl.count / maxPlanCount) * 100);
                  const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '';
                  return (
                    <div className="space-y-3" key={`plan-row-${pl.name}`}>
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-primary flex items-center gap-2 text-[10.5px]">
                          <span className="text-center font-mono text-[10px] w-6 bg-slate-100 p-0.5 rounded-md">{medal ? medal : `#${idx + 1}`}</span>
                          {pl.name}
                        </span>
                        <span className="font-black text-rose-500 font-mono text-[11px]">
                          {pl.count} ativos <span className="text-muted font-semibold font-sans font-[11px]">(Projeção MRR: R$ {pl.projectedIncome.toLocaleString('pt-BR')})</span>
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            idx === 0 ? 'bg-gradient-to-r from-yellow-500 to-amber-300' : 'bg-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
                {rankedPlans.length === 0 && (
                  <p className="text-center italic text-xs text-muted py-12">Sem assinantes e planos configurados ou ativos para este período.</p>
                )}
              </div>
            </div>

            {/* MRR Recurring projection card */}
            <div className="bg-surface border border-border rounded-[2.5rem] p-10 shadow-sm flex flex-col justify-between">
              <div className="space-y-6 text-center py-4">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 mx-auto shadow-inner">
                  <TrendingUp size={32} />
                </div>
                <div>
                  <h4 className="text-3xl font-black text-primary tracking-tighter">R$ {activeSubs.reduce((acc, s) => {
                    const plan = plans.find(p => p.id === s.plano_id);
                    return acc + (plan ? plan.price : 0);
                  }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h4>
                  <p className="text-[10px] text-muted font-black uppercase tracking-widest mt-2">Faturamento Recorrente Mensal (MRR)</p>
                </div>

                <div className="w-full pt-8 border-t border-slate-100 space-y-4 text-xs font-bold text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-muted text-[10px] uppercase">Assinantes Ativos</span>
                    <span className="text-emerald-500 font-black">{activeSubs.length}</span>
                  </div>
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-muted text-[10px] uppercase">Planos Catalogados</span>
                    <span className="text-primary font-black">{plans.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const safeNumber = (val: any) => {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  return Number(val);
};

function ReportKpi({ title, value, isCurrency = false, color = 'zinc', id }: { title: string, value: any, isCurrency?: boolean, color?: string, id?: string }) {
  const getGradient = () => {
    switch(color) {
      case 'emerald': return 'from-emerald-50 to-teal-50 text-emerald-700 border-emerald-100';
      case 'red': return 'from-red-50 to-orange-50 text-red-700 border-red-100';
      case 'blue': return 'from-blue-50 to-indigo-50 text-blue-700 border-blue-100';
      case 'purple': return 'from-purple-50 to-violet-50 text-purple-700 border-purple-100';
      default: return 'from-slate-50 to-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getSubText = () => {
    switch(color) {
      case 'emerald': return 'Valores recebidos consolidados';
      case 'red': return 'Valores em contas pendentes';
      case 'blue': return 'Média realizada por comanda';
      default: return 'Volume registrado no período';
    }
  };

  const formattedValue = isCurrency 
    ? `R$ ${safeNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
    : value ?? 0;

  return (
    <div className={`bg-gradient-to-tr ${getGradient()} border p-6 rounded-3xl shadow-sm text-left`} id={id}>
      <p className="text-[10px] font-black uppercase tracking-widest text-[#718096]">{title}</p>
      <h3 className="text-3xl font-black tracking-tight mt-3 text-slate-900">{formattedValue}</h3>
      <p className="text-[9px] text-[#A0AEC0] font-bold uppercase tracking-wider mt-1">{getSubText()}</p>
    </div>
  );
}

function ReportKpiMini({ title, value, color = 'zinc' }: { title: string, value: any, color?: string }) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    zinc: 'bg-slate-50 text-primary border-slate-200'
  }[color] || 'bg-slate-50 text-primary border-slate-100';

  return (
    <div className={`border p-4 rounded-2xl ${colorClasses} text-center`}>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      <p className="text-lg font-black mt-1">{value ?? 0}</p>
    </div>
  );
}

function GeneralMetricItem({ label, value, total, isCurrency = false, color = 'bg-primary' }: { label: string, value: any, total: number, isCurrency?: boolean, color?: string }) {
  const safeTotal = total <= 0 ? 1 : total;
  const pct = Math.min(Math.round((safeNumber(value) / safeTotal) * 100), 100);
  const formattedVal = isCurrency 
    ? `R$ ${safeNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
    : value ?? 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-xs font-bold">
        <span className="text-slate-600 text-[11px]">{label}</span>
        <span className="text-slate-900 text-[11.5px] font-black">{formattedVal} <span className="text-xs font-semibold text-slate-400">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-slate-100 border border-slate-50 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const getStyle = () => {
    switch (status?.toLowerCase()) {
      case 'concluído':
      case 'concluido':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'cancelado':
        return 'bg-red-50 text-red-600 border-red-100';
      case 'falta':
      case 'ausente':
        return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'agendado':
      case 'confirmado':
        return 'bg-blue-50 text-blue-600 border-blue-100';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStyle()}`}>
      {status ?? 'Desconhecido'}
    </span>
  );
}

