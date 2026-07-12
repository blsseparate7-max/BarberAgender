import React, { useState, useEffect } from 'react';
import { 
  Percent, 
  DollarSign, 
  Calendar, 
  Filter, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight, 
  Clock, 
  CreditCard, 
  Wallet, 
  Search,
  MoreVertical,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
  ArrowRightLeft,
  Lock,
  Unlock,
  FileText,
  Download,
  X,
  User,
  History,
  TrendingUp,
  UserCheck,
  ArrowLeft,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Commission, CommissionPayout, CommissionStatus, UserProfile } from '../types';
import { commissionService } from '../services/commissionService';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { ProfessionalCommissionsDetail } from '../components/Financeiro/ProfessionalCommissionsDetail';

export function Comissoes() {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'commissions' | 'payouts'>('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ pending: 0, paid: 0, total: 0, totalBase: 0, count: 0 });
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayout[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  
  // Drill-down state
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedBarberName, setSelectedBarberName] = useState<string | null>(null);

  // Filters
  const [selectedBarber, setSelectedBarber] = useState(profile?.tipo === 'barbeiro' ? user?.uid : '');
  const [selectedStatus, setSelectedStatus] = useState<CommissionStatus | ''>('');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  // Modal states
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);

  useEffect(() => {
    loadBarbers();
  }, []);

  useEffect(() => {
    loadData();
  }, [dateRange.start, dateRange.end, selectedBarber, selectedStatus]);

  const loadBarbers = async () => {
    try {
      const data = await userService.getAllBarbers();
      setBarbers(data);
    } catch (error) {
      console.error("Erro ao carregar barbeiros:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const barberId = profile?.tipo === 'barbeiro' ? user?.uid : selectedBarber;
      
      const [statsData, commissionsData, payoutsData] = await Promise.all([
        commissionService.getCommissionStats(barberId, dateRange.start, dateRange.end),
        commissionService.getCommissions({ 
          profissional_id: barberId, 
          status: selectedStatus || undefined,
          startDate: dateRange.start,
          endDate: dateRange.end
        }),
        commissionService.getPayouts(barberId)
      ]);
      
      setStats(statsData);
      setCommissions(commissionsData);
      setPayouts(payoutsData);
    } catch (error) {
      console.error("Erro ao carregar dados de comissões:", error);
    } finally {
      setLoading(false);
    }
  };

  const { execute: handleRegisterPayout, isLoading: isRegisteringPayout } = useAsyncAction(async (barberId: string, amount: number, commissionIds: string[], notes: string) => {
    if (!user) return;
    const barber = barbers.find(b => b.uid === barberId);
    if (!barber) return;

    try {
      await commissionService.registerPayout({
        profissional_id: barberId,
        profissional_name: barber.nome,
        amount,
        commission_ids: commissionIds,
        date: format(new Date(), 'yyyy-MM-dd'),
        responsible_id: user.uid,
        responsible_name: profile?.nome || 'Admin',
        period_start: format(new Date(), 'yyyy-MM-dd'), // Fallback
        period_end: format(new Date(), 'yyyy-MM-dd'), // Fallback
        transaction_id: `PAY-${Date.now()}`,
        notes
      });
      loadData();
      setIsPayoutModalOpen(false);
    } catch (error) {
      console.error("Erro ao registrar repasse:", error);
    }
  });

  // If barber logged in, redirect directly to their own detail
  if (profile?.tipo === 'barbeiro' && user) {
    return (
      <ProfessionalCommissionsDetail 
        professionalId={user.uid}
        professionalName={profile.nome || 'Meu Usuário'}
        dateRange={{ start: dateRange.start, end: dateRange.end }}
      />
    );
  }

  // Admin Drill-down to specific professional
  if (selectedBarberId && selectedBarberName) {
    return (
      <div className="space-y-6">
        <button 
          onClick={() => {
            setSelectedBarberId(null);
            setSelectedBarberName(null);
            loadData();
          }}
          className="flex items-center gap-2 text-muted hover:text-primary font-bold text-xs bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all"
        >
          <ArrowLeft size={14} />
          Voltar para Painel de Equipe
        </button>
        <ProfessionalCommissionsDetail 
          professionalId={selectedBarberId}
          professionalName={selectedBarberName}
          dateRange={{ start: dateRange.start, end: dateRange.end }}
          onBack={() => {
            setSelectedBarberId(null);
            setSelectedBarberName(null);
            loadData();
          }}
        />
      </div>
    );
  }

  // Calculate roster summary dynamically in memory based on loaded data for perfect real-time feedback
  const teamRoster = barbers.map(barber => {
    const barberComms = commissions.filter(c => c.profissional_id === barber.uid);
    const pending = barberComms.filter(c => c.status === 'pendente').reduce((acc, c) => acc + c.commission_value, 0);
    const paid = barberComms.filter(c => c.status === 'pago').reduce((acc, c) => acc + c.commission_value, 0);
    const totalBase = barberComms.reduce((acc, c) => acc + c.base_value, 0);
    const count = barberComms.length;

    return {
      uid: barber.uid,
      nome: barber.nome,
      email: barber.email,
      pending,
      paid,
      totalBase,
      count
    };
  });

  // Get dynamic colors for avatars based on initials
  const getAvatarBg = (name: string) => {
    const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
    const colors = [
      'bg-slate-100 text-slate-700 border-slate-200',
      'bg-blue-50 text-blue-700 border-blue-100',
      'bg-emerald-50 text-emerald-700 border-emerald-100',
      'bg-amber-50 text-amber-700 border-amber-100',
      'bg-purple-50 text-purple-700 border-purple-100',
      'bg-rose-50 text-rose-700 border-rose-100'
    ];
    return colors[code % colors.length];
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Redesigned Premium Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-850 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
        {/* Aesthetic Background Lighting */}
        <div className="absolute -right-24 -bottom-24 w-60 h-60 bg-blue-500 rounded-full blur-[100px] opacity-15" />
        <div className="absolute left-1/3 -top-20 w-40 h-40 bg-emerald-500 rounded-full blur-[80px] opacity-10" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-950/60 px-3 py-1 rounded-full border border-blue-900/50">
              Painel Financeiro
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
              Gestão de Comissões
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm max-w-xl">
              Monitore os ganhos da equipe, acerte vales adiantados, visualize recibos e registre repasses com precisão matemática.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Date Range Selectors */}
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 rounded-2xl px-4 py-2.5">
              <Calendar size={15} className="text-slate-400" />
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                className="bg-transparent text-xs text-white focus:outline-none font-bold select-none cursor-pointer"
              />
              <span className="text-slate-600 font-medium">|</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                className="bg-transparent text-xs text-white focus:outline-none font-bold select-none cursor-pointer"
              />
            </div>

            {(isAdmin || isGerente) && (
              <button 
                onClick={() => setIsPayoutModalOpen(true)}
                className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-950 px-5 py-3 rounded-2xl font-black text-xs transition-all shadow-lg active:scale-95"
              >
                <ArrowRightLeft size={16} />
                <span>Registrar Repasse</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Redesigned Bento Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Comissão Pendente" 
          value={stats.pending} 
          icon={<Clock className="text-amber-500" size={18} />} 
          color="amber"
          subtitle="Aguardando liquidação"
        />
        <StatCard 
          title="Comissão Repassada" 
          value={stats.paid} 
          icon={<CheckCircle2 className="text-emerald-500" size={18} />} 
          color="emerald"
          subtitle="Ganhos liquidados no período"
        />
        <StatCard 
          title="Faturamento Base" 
          value={stats.totalBase} 
          icon={<TrendingUp className="text-blue-500" size={18} />} 
          color="blue"
          subtitle="Valor total dos serviços"
        />
        <StatCard 
          title="Atendimentos Realizados" 
          value={stats.count} 
          icon={<UserCheck className="text-slate-500" size={18} />} 
          color="zinc"
          subtitle="Serviços comissionados"
          isCurrency={false}
        />
      </div>

      {/* Main Team Roster & Historical Subsections */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'overview' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'
              }`}
            >
              Visão da Equipe
            </button>
            <button 
              onClick={() => setActiveTab('commissions')}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'commissions' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'
              }`}
            >
              Extrato Geral
            </button>
            <button 
              onClick={() => setActiveTab('payouts')}
              className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeTab === 'payouts' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-950'
              }`}
            >
              Histórico de Repasses
            </button>
          </div>

          <div className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">
            {teamRoster.length} profissionais listados
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white border border-slate-100 rounded-3xl shadow-xs">
            <Loader2 className="animate-spin text-blue-500" size={36} />
            <p className="text-slate-500 text-xs font-bold animate-pulse uppercase tracking-wider">Calculando balanços de comissões...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* TAB 1: TEAM OVERVIEW (ROSTER DETAILED) */}
            {activeTab === 'overview' && (
              <motion.div 
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300"
              >
                {teamRoster.map((barber, index) => {
                  const avatarColorClass = getAvatarBg(barber.nome);
                  const isPending = barber.pending > 0;
                  
                  return (
                    <div 
                      key={`roster-card-${barber.uid || index}`}
                      className="bg-white border border-slate-200 rounded-[2rem] p-6 hover:border-slate-350 hover:shadow-md transition-all duration-300 flex flex-col justify-between shadow-xs group"
                    >
                      {/* Barber Basic Header */}
                      <div className="flex items-center gap-4 mb-5 pb-4 border-b border-slate-100">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border font-black text-lg shadow-xs shrink-0 ${avatarColorClass}`}>
                          {getInitials(barber.nome)}
                        </div>
                        <div className="overflow-hidden">
                          <h3 className="font-black text-slate-900 group-hover:text-blue-600 transition-colors truncate">{barber.nome}</h3>
                          <p className="text-[10px] text-slate-400 font-bold truncate uppercase tracking-wider">{barber.email}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase mt-1.5 border ${
                            isPending ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            {isPending ? 'Repasse Pendente' : 'Balanço Zerado'}
                          </span>
                        </div>
                      </div>

                      {/* Barber Mini stats */}
                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5 text-left">
                        <div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Pendente</span>
                          <span className={`text-base font-black font-mono ${isPending ? 'text-amber-600' : 'text-slate-500'}`}>
                            R$ {barber.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="border-l border-slate-200 pl-4">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Repassado</span>
                          <span className="text-base font-black font-mono text-emerald-600">
                            R$ {barber.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Quick Ratios */}
                      <div className="space-y-3 mb-5 text-xs text-slate-650 font-semibold">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Faturamento gerado:</span>
                          <span className="font-extrabold text-slate-800">R$ {barber.totalBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Atendimentos feitos:</span>
                          <span className="font-extrabold text-slate-800">{barber.count} serviços</span>
                        </div>
                      </div>

                      {/* View Action Drill-down Button */}
                      <button 
                        onClick={() => {
                          setSelectedBarberId(barber.uid);
                          setSelectedBarberName(barber.nome);
                        }}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <FileText size={14} />
                        Acessar Ficha & Recibos
                        <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* TAB 2: GENERAL COMMISSIONS LIST (DETAILED LEDGER) */}
            {activeTab === 'commissions' && (
              <motion.div 
                key="commissions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs animate-in fade-in"
              >
                <div className="p-6 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-[200px]">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select 
                        value={selectedBarber}
                        onChange={(e) => setSelectedBarber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 transition-colors appearance-none"
                      >
                        <option value="">Todos os Profissionais</option>
                        {barbers.map((b, index) => (
                          <option key={`barber-opt-${b.uid || index}`} value={b.uid}>{b.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="relative min-w-[150px]">
                      <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select 
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value as CommissionStatus)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs font-bold text-slate-800 focus:outline-none focus:border-slate-400 transition-colors appearance-none"
                      >
                        <option value="">Todos os Status</option>
                        <option value="pendente">Pendente</option>
                        <option value="pago">Pago</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      // Simulating detailed ledger download
                      const csvContent = "data:text/csv;charset=utf-8," 
                        + ["Data,Profissional,Serviço,Valor Base,Comissão (%),A Receber,Status"].join(",") + "\n"
                        + commissions.map(c => `"${format(new Date(c.date), 'dd/MM/yyyy')}","${c.profissional_name}","${c.servico_name}",${c.base_value},${c.commission_percentage},${c.commission_value},"${c.status}"`).join("\n");
                      const encodedUri = encodeURI(csvContent);
                      const link = document.createElement("a");
                      link.setAttribute("href", encodedUri);
                      link.setAttribute("download", `comissoes_${dateRange.start}_a_${dateRange.end}.csv`);
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-950 transition-colors text-xs font-black uppercase tracking-widest bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200"
                  >
                    <Download size={15} />
                    Exportar Planilha
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Profissional</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Serviço / Item</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor Base</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Comissão %</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor Cota</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commissions.map((c, index) => (
                        <tr key={`comm-tr-${c.id || index}`} className="hover:bg-slate-50/50 transition-colors align-middle">
                          <td className="px-6 py-4 text-xs text-slate-400 font-bold">{format(new Date(c.date), 'dd/MM/yyyy')}</td>
                          <td className="px-6 py-4 text-xs font-black text-slate-900">{c.profissional_name}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 font-bold">{c.servico_name}</td>
                          <td className="px-6 py-4 text-xs text-slate-400 font-bold font-mono">R$ {c.base_value.toFixed(2)}</td>
                          <td className="px-6 py-4 text-xs text-slate-400 font-bold font-mono">{c.commission_percentage}%</td>
                          <td className="px-6 py-4 text-xs font-black text-emerald-600 font-mono">R$ {c.commission_value.toFixed(2)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase border ${
                              c.status === 'pago' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {c.status === 'pago' ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {commissions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-16 text-center text-slate-400 font-medium italic">
                            Nenhuma comissão encontrada para os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* TAB 3: REGISTERED PAYOUTS HISTORY */}
            {activeTab === 'payouts' && (
              <motion.div 
                key="payouts"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in"
              >
                {payouts.map((p, index) => (
                  <div 
                    key={`payout-card-${p.id || index}`} 
                    className="bg-white border border-slate-200 rounded-3xl p-6 hover:border-slate-350 transition-all shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shadow-xs">
                            <ArrowRightLeft size={18} />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-sm">{p.profissional_name}</p>
                            <p className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">{format(new Date(p.date), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-emerald-600 font-mono">R$ {p.amount.toFixed(2)}</p>
                          <p className="text-[8px] text-slate-400 uppercase font-extrabold tracking-wider">{p.commissionIds?.length || 0} comissões</p>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 uppercase tracking-wider font-black">
                          <span>Responsável</span>
                          <span className="text-slate-800 font-bold">{p.responsibleName}</span>
                        </div>
                        {p.notes && (
                          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-550 italic leading-relaxed font-semibold">
                            "{p.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <div className="col-span-full text-center py-20 text-slate-400 italic text-sm bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                    Nenhum histórico de repasse registrado no período.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Payout Modal */}
      <AnimatePresence>
        {isPayoutModalOpen && (
          <PayoutModal 
            barbers={barbers}
            onClose={() => setIsPayoutModalOpen(false)}
            onConfirm={handleRegisterPayout}
            isRegistering={isRegisteringPayout}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Redesigned premium stat card component with subtle glowing effects
function StatCard({ title, value, icon, color, subtitle, isCurrency = true }: { title: string, value: number, icon: React.ReactNode, color: string, subtitle: string, isCurrency?: boolean }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50/70 border-emerald-100 text-emerald-600 shadow-emerald-500/5',
    blue: 'bg-blue-50/70 border-blue-100 text-blue-600 shadow-blue-500/5',
    amber: 'bg-amber-50/70 border-amber-100 text-amber-600 shadow-amber-500/5',
    zinc: 'bg-slate-50/80 border-slate-150 text-slate-600 shadow-slate-500/5'
  };

  return (
    <div className={`p-6 rounded-3xl border shadow-sm ${colors[color]} flex flex-col justify-between h-36 text-left`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-xs border border-slate-100">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-mono">
          {isCurrency ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value}
        </p>
        <p className="text-[10px] text-slate-450 font-bold tracking-wide mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

// Payout modal component with pristine layouts and loaders
function PayoutModal({ barbers, onClose, onConfirm, isRegistering }: { barbers: UserProfile[], onClose: () => void, onConfirm: (bId: string, am: number, ids: string[], n: string) => void, isRegistering: boolean }) {
  const [selectedBarber, setSelectedBarber] = useState('');
  const [pendingCommissions, setPendingCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (selectedBarber) {
      loadPending();
    } else {
      setPendingCommissions([]);
    }
  }, [selectedBarber]);

  const loadPending = async () => {
    setLoading(true);
    try {
      const data = await commissionService.getCommissions({ profissional_id: selectedBarber, status: 'pendente' });
      setPendingCommissions(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = pendingCommissions.reduce((acc, c) => acc + c.commission_value, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-150 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-black text-slate-900">Registrar Repasse de Cota</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Selecionar Profissional</label>
            <select 
              value={selectedBarber}
              onChange={(e) => setSelectedBarber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-bold text-slate-800 focus:outline-none focus:border-slate-400 transition-colors outline-none"
            >
              <option value="">Selecione um profissional...</option>
              {barbers.map((b, index) => (
                <option key={`barber-modal-opt-${b.uid || index}`} value={b.uid}>{b.nome}</option>
              ))}
            </select>
          </div>

          {selectedBarber && (
            <div className="space-y-4 animate-in fade-in duration-250">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-150 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Acerto Bruto Pendente</p>
                {loading ? (
                  <Loader2 className="animate-spin mx-auto text-blue-500" size={24} />
                ) : (
                  <>
                    <p className="text-3xl font-black text-emerald-600 font-mono">R$ {totalAmount.toFixed(2)}</p>
                    <p className="text-xs text-slate-500 mt-1 font-bold">{pendingCommissions.length} comissões aguardando pagamento</p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Descrição / Observações (Opcional)</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-sm font-semibold focus:outline-none focus:border-slate-400 transition-colors text-slate-800 h-24 resize-none"
                  placeholder="Ex: Pagamento referente ao período quinzenal."
                />
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button 
              disabled={!selectedBarber || totalAmount === 0 || loading || isRegistering}
              onClick={() => onConfirm(selectedBarber, totalAmount, pendingCommissions.map(c => c.id), notes)}
              className="flex-[2] py-3.5 bg-slate-900 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
            >
              {isRegistering ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Confirmar Repasse
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
