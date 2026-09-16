import React, { useState, useEffect, useMemo } from 'react';
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
  Printer,
  RefreshCw,
  Building2,
  Receipt,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, differenceInCalendarDays, addDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Commission, CommissionPayout, CommissionStatus, ProfessionalAdvance, UserProfile } from '../types';
import { commissionService } from '../services/commissionService';
import { comandaService } from '../services/comandaService';
import { userService } from '../services/userService';
import { calculateProfessionalLedger } from '../services/ledgerService';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ProfessionalCommissionsDetail } from '../components/Financeiro/ProfessionalCommissionsDetail';
import { CommissionAuditRecoveryModal } from '../components/Financeiro/CommissionAuditRecoveryModal';
import { toast } from 'sonner';

export function Comissoes() {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const { tenantId } = useTenant();
  const [activeTab, setActiveTab] = useState<'overview' | 'payouts'>('overview');
  const [loading, setLoading] = useState(true);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [allCommissionsLive, setAllCommissionsLive] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayout[]>([]);
  const [advances, setAdvances] = useState<ProfessionalAdvance[]>([]);
  const [allAdvancesLive, setAllAdvancesLive] = useState<ProfessionalAdvance[]>([]);
  const [allComandasLive, setAllComandasLive] = useState<any[]>([]);
  const [allAppointmentsLive, setAllAppointmentsLive] = useState<any[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  
  // Drill-down state
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [selectedBarberName, setSelectedBarberName] = useState<string | null>(null);

  // Quick payout initial barber
  const [initialPayoutBarberId, setInitialPayoutBarberId] = useState<string>('');

  // Filters
  const [selectedBarber, setSelectedBarber] = useState(profile?.tipo === 'barbeiro' ? user?.uid : '');
  const [selectedStatus, setSelectedStatus] = useState<CommissionStatus | ''>('');
  const [dateRange, setDateRange] = useState({
    start: '2026-09-01',
    end: '2026-09-16'
  });

  // Modal states
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Helper para garantir que a diferença nunca ultrapasse 31 dias (1 mês)
  const handleStartDateChange = (newStart: string) => {
    if (!newStart) return;
    const sDate = parseISO(newStart);
    const eDate = parseISO(dateRange.end);
    const diff = differenceInCalendarDays(eDate, sDate);
    
    if (diff < 0) {
      // Se data inicial for posterior à final, ajusta data final para igual à inicial
      setDateRange({ start: newStart, end: newStart });
    } else if (diff > 31) {
      // Trava no máximo em 31 dias
      toast.info('Período limitado a no máximo 1 mês (31 dias). Ajustando data final.');
      const maxEnd = format(addDays(sDate, 31), 'yyyy-MM-dd');
      setDateRange({ start: newStart, end: maxEnd });
    } else {
      setDateRange({ ...dateRange, start: newStart });
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    if (!newEnd) return;
    const sDate = parseISO(dateRange.start);
    const eDate = parseISO(newEnd);
    const diff = differenceInCalendarDays(eDate, sDate);

    if (diff < 0) {
      // Se data final for anterior à inicial, ajusta início
      setDateRange({ start: newEnd, end: newEnd });
    } else if (diff > 31) {
      // Trava no máximo em 31 dias
      toast.info('Período limitado a no máximo 1 mês (31 dias). Ajustando data inicial.');
      const maxStart = format(addDays(eDate, -31), 'yyyy-MM-dd');
      setDateRange({ start: maxStart, end: newEnd });
    } else {
      setDateRange({ ...dateRange, end: newEnd });
    }
  };

  useEffect(() => {
    loadBarbers();
    if (tenantId) {
      commissionService.purgeOrphanedCommissions(tenantId);
      if (tenantId === 'gbcortes7') {
        commissionService.purgePreSeptemberData('gbcortes7');
      }
    }
  }, [tenantId]);

  // Live Subscription for all commissions, advances, comandas and appointments of the tenant
  useEffect(() => {
    if (!tenantId) return;
    
    const commConstraints = tenantId === 'gbcortes7' 
      ? [where('tenantId', 'in', [tenantId, ''])] 
      : [where('tenantId', '==', tenantId)];
    const qCom = query(collection(db, 'commissions'), ...commConstraints);
    const unsubCom = onSnapshot(qCom, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));
      setAllCommissionsLive(docs);
    });

    const advConstraints = tenantId === 'gbcortes7' 
      ? [where('tenantId', 'in', [tenantId, ''])] 
      : [where('tenantId', '==', tenantId)];
    const qAdv = query(collection(db, 'professional_advances'), ...advConstraints);
    const unsubAdv = onSnapshot(qAdv, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalAdvance));
      setAllAdvancesLive(docs);
    });

    const cmdConstraints = tenantId === 'gbcortes7'
      ? [where('tenantId', 'in', [tenantId, ''])]
      : [where('tenantId', '==', tenantId)];
    const qCmd = query(collection(db, 'comandas'), ...cmdConstraints);
    const unsubCmd = onSnapshot(qCmd, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllComandasLive(docs);
    });

    const aptConstraints = tenantId === 'gbcortes7'
      ? [where('tenantId', 'in', [tenantId, ''])]
      : [where('tenantId', '==', tenantId)];
    const qApt = query(collection(db, 'appointments'), ...aptConstraints);
    const unsubApt = onSnapshot(qApt, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllAppointmentsLive(docs);
    });

    return () => {
      unsubCom();
      unsubAdv();
      unsubCmd();
      unsubApt();
    };
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [dateRange.start, dateRange.end, selectedBarber, selectedStatus, tenantId]);

  const [isSettlingPreSeptember, setIsSettlingPreSeptember] = useState(false);

  const handleManualSettlePreSeptember = async () => {
    if (!tenantId) return;
    setIsSettlingPreSeptember(true);
    try {
      const res = await commissionService.settleHistoricalPendingBeforeSeptember(tenantId);
      if (res.commissionsSettled > 0 || res.advancesSettled > 0 || res.payablesSettled > 0 || res.comandasSettled > 0) {
        toast.success(`Acerto de implantação: ${res.commissionsSettled} comissões e ${res.advancesSettled} vales anteriores a 01/09 foram baixados.`);
      } else {
        toast.success("Nenhuma pendência anterior a 01/09 encontrada. Tudo regularizado!");
      }
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao realizar acerto pré-setembro.");
    } finally {
      setIsSettlingPreSeptember(false);
    }
  };

  // Automatic data purges/settlements disabled to protect real balances and historical comanda sync.

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
      
      const [commissionsData, payoutsData, advancesData] = await Promise.all([
        commissionService.getCommissions({ 
          profissional_id: barberId, 
          status: selectedStatus || undefined,
          startDate: dateRange.start,
          endDate: dateRange.end
        }),
        commissionService.getPayouts(barberId),
        commissionService.getAdvances({
          profissional_id: barberId || undefined,
          startDate: dateRange.start,
          endDate: dateRange.end
        })
      ]);
      
      setCommissions(commissionsData);
      setPayouts(payoutsData);
      setAdvances(advancesData);
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
        period_start: dateRange.start,
        period_end: dateRange.end,
        transaction_id: `PAY-${Date.now()}`,
        notes
      });
      toast.success(`Repasse de R$ ${amount.toFixed(2)} registrado com sucesso!`);
      loadData();
      setIsPayoutModalOpen(false);
    } catch (error) {
      console.error("Erro ao registrar repasse:", error);
    }
  });

  // Calculate roster summary with unified ledger - 100% synchronized with Barbeiros and Financeiro
  const effectiveCommissions = allCommissionsLive.length > 0 ? allCommissionsLive : commissions;
  const effectiveAdvances = allAdvancesLive.length > 0 ? allAdvancesLive : advances;

  const teamRoster = useMemo(() => {
    return barbers.map(barber => {
      const ledger = calculateProfessionalLedger(
        barber, 
        effectiveCommissions, 
        effectiveAdvances,
        dateRange.start,
        dateRange.end,
        allComandasLive,
        allAppointmentsLive
      );
      
      // Parte que fica com a barbearia do serviço deste barbeiro
      const parteBarbearia = Math.max(0, ledger.faturamentoBrutoMes - ledger.comissaoGeradaMes);

      return {
        uid: barber.uid,
        nome: barber.nome,
        email: barber.email,
        percentualComissao: ledger.percentualComissao,
        grossPending: ledger.comissaoPendenteBruta,
        pendingAdvances: ledger.valesPendentes,
        pending: ledger.saldoPendenteLiquido,
        paid: ledger.comissaoRepassadaMes,
        totalBase: ledger.faturamentoBrutoMes,
        comissaoGeradaMes: ledger.comissaoGeradaMes,
        parteBarbearia,
        count: ledger.totalAtendimentosMes,
        faturamentoBrutoTotal: ledger.faturamentoBrutoTotal,
        comissaoGeradaTotal: ledger.comissaoGeradaTotal,
        totalAtendimentosTotal: ledger.totalAtendimentosTotal
      };
    });
  }, [barbers, effectiveCommissions, effectiveAdvances, dateRange.start, dateRange.end, allComandasLive, allAppointmentsLive]);

  // Barbeiro em foco ativo no select (se houver)
  const activeSelectedBarberObj = useMemo(() => {
    if (!selectedBarber) return null;
    return teamRoster.find(b => b.uid === selectedBarber) || null;
  }, [selectedBarber, teamRoster]);

  // Cálculos financeiros claros e transparentes de acordo com o filtro
  // Se selecionou barbeiro específico -> métricas do barbeiro
  // Se selecionou "Todos" -> soma de toda a equipe
  const displayMetrics = useMemo(() => {
    if (activeSelectedBarberObj) {
      return {
        isIndividual: true,
        nome: activeSelectedBarberObj.nome,
        percentual: activeSelectedBarberObj.percentualComissao,
        // 1. Valor produzido pelo profissional no período
        valorProduzido: activeSelectedBarberObj.totalBase,
        // Comissão Bruta gerada
        comissaoBruta: activeSelectedBarberObj.comissaoGeradaMes,
        // 3. Vale que já retirou (vales pendentes a abater)
        valesRetirados: activeSelectedBarberObj.pendingAdvances,
        // 2. Valor líquido a receber (saldo a transferir no pix)
        valorAReceber: activeSelectedBarberObj.pending,
        // 4. Valor que fica pra barbearia
        valorBarbearia: activeSelectedBarberObj.parteBarbearia,
        // Já repassado
        jaRepassado: activeSelectedBarberObj.paid,
        atendimentos: activeSelectedBarberObj.count
      };
    }

    // Visão Geral de Todos os Barbeiros
    const valorProduzido = teamRoster.reduce((acc, b) => acc + b.totalBase, 0);
    const comissaoBruta = teamRoster.reduce((acc, b) => acc + b.comissaoGeradaMes, 0);
    const valesRetirados = teamRoster.reduce((acc, b) => acc + b.pendingAdvances, 0);
    const valorAReceber = teamRoster.reduce((acc, b) => acc + b.pending, 0);
    const valorBarbearia = Math.max(0, valorProduzido - comissaoBruta);
    const jaRepassado = teamRoster.reduce((acc, b) => acc + b.paid, 0);
    const atendimentos = teamRoster.reduce((acc, b) => acc + b.count, 0);

    return {
      isIndividual: false,
      nome: 'Toda a Barbearia',
      percentual: null,
      valorProduzido,
      comissaoBruta,
      valesRetirados,
      valorAReceber,
      valorBarbearia,
      jaRepassado,
      atendimentos
    };
  }, [activeSelectedBarberObj, teamRoster]);

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
          className="flex items-center gap-2 text-slate-700 hover:text-slate-900 font-bold text-xs bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          Voltar para Painel de Comissões
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
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header Card - Clean, Objetivo & Moderno */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 border border-slate-800 shadow-lg relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-950/80 px-2.5 py-0.5 rounded-md border border-blue-900/60">
                Fechamento & Acertos
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Máximo 31 dias por consulta
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Comissões da Barbearia
            </h1>
            <p className="text-slate-400 text-xs max-w-xl leading-relaxed">
              Consulte com clareza o valor produzido por profissional, os vales retirados, o repasse líquido a transferir e quanto fica no caixa da casa.
            </p>
          </div>

          {/* Quick Date Range Selectors with max 31-day constraint */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-2xl px-3.5 py-2">
              <Calendar size={14} className="text-slate-400 shrink-0" />
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none font-bold select-none cursor-pointer"
                title="Data inicial (limite máximo de 31 dias)"
              />
              <span className="text-slate-600 font-medium">até</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none font-bold select-none cursor-pointer"
                title="Data final"
              />
            </div>

            {/* Botões Rápidos de Período (Nunca ultrapassam 31 dias) */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setDateRange({
                  start: format(startOfDay(new Date()), 'yyyy-MM-dd'),
                  end: format(endOfDay(new Date()), 'yyyy-MM-dd')
                })}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setDateRange({
                  start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
                  end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
                })}
                className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
              >
                Este Mês
              </button>
            </div>

            {(isAdmin || isGerente) && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={loadData}
                  title="Atualizar dados"
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-bold transition-all shadow-xs cursor-pointer"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : ''} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsAuditModalOpen(true)}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 px-3.5 py-2.5 rounded-xl font-black text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Auditoria & Reconciliação Cirúrgica (01 a 16/09)"
                >
                  <ShieldCheck size={15} />
                  <span>Auditoria 01 a 16/09</span>
                </button>

                <button 
                  onClick={() => {
                    setInitialPayoutBarberId(selectedBarber || '');
                    setIsPayoutModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-black text-xs transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <DollarSign size={15} />
                  <span>Pagar Repasse</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SELETOR DE PROFISSIONAL EM DESTAQUE LIMPO */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black shrink-0 border border-blue-100">
            <User size={20} />
          </div>
          <div className="flex-1 min-w-[200px] max-w-md">
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
              Filtrar por Profissional:
            </label>
            <select
              value={selectedBarber}
              onChange={(e) => setSelectedBarber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-900 text-sm font-black py-2.5 px-3 rounded-xl outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              <option value="">💈 Todos os Profissionais (Visão Geral da Barbearia)</option>
              {teamRoster.map((b) => (
                <option key={`opt-b-${b.uid}`} value={b.uid}>
                  ✂️ {b.nome} ({b.percentualComissao || 50}% de comissão)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Indicador de quem está selecionado */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {selectedBarber ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-bold">
                Exibindo apenas: <strong className="text-slate-900">{activeSelectedBarberObj?.nome}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedBarber('')}
                className="text-[11px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Limpar Filtro
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-bold bg-slate-100 px-3 py-1.5 rounded-lg">
              Mostrando consolidação de toda a equipe ({teamRoster.length} barbeiros)
            </span>
          )}
        </div>
      </div>

      {/* OS 4 NÚMEROS DE OURO: CLAREZA TOTAL DO DONO DA BARBEARIA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. VALOR PRODUZIDO PELO PROFISSIONAL */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs flex flex-col justify-between min-h-[140px] text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
              1. Valor Produzido
            </span>
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 tracking-tight font-mono">
              R$ {displayMetrics.valorProduzido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
              {displayMetrics.atendimentos} atendimentos no período
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              {displayMetrics.isIndividual ? `Total faturado por ${displayMetrics.nome}` : 'Produção bruta total da equipe'}
            </p>
          </div>
        </div>

        {/* 2. VALE QUE JÁ RETIROU */}
        <div className="bg-rose-50/50 border border-rose-100 rounded-3xl p-5 shadow-xs flex flex-col justify-between min-h-[140px] text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-wider">
              2. Vales Retirados
            </span>
            <div className="w-8 h-8 bg-white text-rose-600 rounded-xl flex items-center justify-center border border-rose-200 shadow-2xs">
              <Receipt size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-rose-700 tracking-tight font-mono">
              - R$ {displayMetrics.valesRetirados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-rose-900/70 font-semibold mt-0.5">
              Adiantamentos a abater do saldo
            </p>
            <p className="text-[10px] text-rose-500 font-bold mt-0.5">
              {displayMetrics.valesRetirados > 0 ? 'Já descontado do valor a receber' : 'Nenhum vale pendente'}
            </p>
          </div>
        </div>

        {/* 3. VALOR A RECEBER (LÍQUIDO A PAGAR AO BARBEIRO) */}
        <div className={`border rounded-3xl p-5 shadow-xs flex flex-col justify-between min-h-[140px] text-left ${
          displayMetrics.valorAReceber < 0 
            ? 'bg-amber-50/60 border-amber-200' 
            : 'bg-emerald-50/60 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-black uppercase tracking-wider ${
              displayMetrics.valorAReceber < 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}>
              3. Valor a Receber (Líquido)
            </span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-2xs ${
              displayMetrics.valorAReceber < 0 
                ? 'bg-white text-amber-600 border-amber-200' 
                : 'bg-white text-emerald-600 border-emerald-200'
            }`}>
              <DollarSign size={16} />
            </div>
          </div>
          <div>
            <p className={`text-2xl font-black tracking-tight font-mono ${
              displayMetrics.valorAReceber < 0 ? 'text-amber-900' : 'text-emerald-800'
            }`}>
              {displayMetrics.valorAReceber < 0 
                ? `- R$ ${Math.abs(displayMetrics.valorAReceber).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                : `R$ ${displayMetrics.valorAReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </p>
            <p className={`text-[11px] font-semibold mt-0.5 ${
              displayMetrics.valorAReceber < 0 ? 'text-amber-800' : 'text-emerald-900/80'
            }`}>
              {displayMetrics.valorAReceber < 0 ? 'Barbeiro deve à barbearia' : 'Valor exato para transferir no Pix'}
            </p>
            <p className={`text-[10px] font-bold mt-0.5 ${
              displayMetrics.valorAReceber < 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}>
              Bruto R$ {displayMetrics.comissaoBruta.toFixed(2)} - Vales R$ {displayMetrics.valesRetirados.toFixed(2)}
            </p>
          </div>
        </div>

        {/* 4. VALOR QUE FICA PRA BARBEARIA */}
        <div className="bg-purple-50/60 border border-purple-200 rounded-3xl p-5 shadow-xs flex flex-col justify-between min-h-[140px] text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider">
              4. Fica com a Barbearia
            </span>
            <div className="w-8 h-8 bg-white text-purple-700 rounded-xl flex items-center justify-center border border-purple-200 shadow-2xs">
              <Building2 size={16} />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-purple-950 tracking-tight font-mono">
              R$ {displayMetrics.valorBarbearia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-purple-800 font-semibold mt-0.5">
              Margem líquida da casa sobre serviços
            </p>
            <p className="text-[10px] text-purple-600 font-bold mt-0.5">
              {displayMetrics.valorProduzido > 0 
                ? `${Math.round((displayMetrics.valorBarbearia / displayMetrics.valorProduzido) * 100)}% do total produzido` 
                : 'Cota retida pela barbearia'}
            </p>
          </div>
        </div>
      </div>

      {/* ABAS INFERIORES: ACERTOS DA EQUIPE / HISTÓRICO DE REPASSES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60">
            <button 
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'overview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {selectedBarber ? `Acerto de ${activeSelectedBarberObj?.nome || 'Profissional'}` : 'Acertos por Barbeiro'}
            </button>
            <button 
              onClick={() => setActiveTab('payouts')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === 'payouts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Histórico de Repasses Pagos
            </button>
          </div>

          <div className="text-slate-400 font-bold text-xs hidden sm:block">
            {teamRoster.filter(b => !selectedBarber || b.uid === selectedBarber).length} profissional(is) no período
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 bg-white border border-slate-200 rounded-3xl">
            <Loader2 className="animate-spin text-blue-500" size={32} />
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Calculando valores com exatidão...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* ABA 1: CARDS VERTICAIS DE ACERTO (ZERO SCROLL HORIZONTAL, 100% MOBILE FRIENDLY) */}
            {activeTab === 'overview' && (
              <motion.div 
                key="overview-vertical-cards"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {teamRoster
                  .filter(b => !selectedBarber || b.uid === selectedBarber)
                  .map((barber, index) => {
                    const avatarColorClass = getAvatarBg(barber.nome);
                    const isNegative = barber.pending < 0;
                    const isZero = barber.pending === 0;

                    return (
                      <div 
                        key={`barber-card-${barber.uid}-${index}`}
                        className="bg-white border border-slate-200 hover:border-slate-300 rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between"
                      >
                        {/* 1. Header do Barbeiro */}
                        <div>
                          <div className="flex items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm border shrink-0 ${avatarColorClass}`}>
                                {getInitials(barber.nome)}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-black text-slate-900 text-sm truncate">{barber.nome}</h4>
                                <p className="text-[11px] text-slate-400 font-semibold truncate">{barber.count} atendimentos no período</p>
                              </div>
                            </div>
                            <span className="bg-slate-100 text-slate-700 font-black text-xs px-2.5 py-1 rounded-xl shrink-0 border border-slate-200">
                              {barber.percentualComissao || 50}%
                            </span>
                          </div>

                          {/* 2. Demonstração Vertical dos Valores */}
                          <div className="py-3.5 space-y-2.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium">1. Produzido (Total Serviços):</span>
                              <span className="font-mono font-bold text-slate-900">
                                R$ {barber.totalBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium">Comissão Bruta ({barber.percentualComissao || 50}%):</span>
                              <span className="font-mono font-bold text-slate-700">
                                R$ {barber.comissaoGeradaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-rose-600 font-medium">2. Vales Retirados:</span>
                              <span className="font-mono font-bold text-rose-600">
                                {barber.pendingAdvances > 0 
                                  ? `- R$ ${barber.pendingAdvances.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                                  : 'R$ 0,00'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                              <span className="text-purple-700 font-medium flex items-center gap-1">
                                <Building2 size={13} className="text-purple-600" />
                                4. Fica com a Barbearia:
                              </span>
                              <span className="font-mono font-bold text-purple-950">
                                R$ {barber.parteBarbearia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* 3. Bloco em Destaque: 3. VALOR A RECEBER (LÍQUIDO A PAGAR NO PIX) */}
                          <div className={`p-3.5 rounded-2xl mb-4 border ${
                            isNegative 
                              ? 'bg-amber-50 border-amber-200' 
                              : isZero 
                              ? 'bg-slate-50 border-slate-200' 
                              : 'bg-emerald-50 border-emerald-200'
                          }`}>
                            <span className={`text-[10px] font-black uppercase tracking-wider block ${
                              isNegative ? 'text-amber-800' : isZero ? 'text-slate-500' : 'text-emerald-800'
                            }`}>
                              3. A Pagar ao Barbeiro (Pix)
                            </span>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className={`text-xl font-black font-mono tracking-tight ${
                                isNegative ? 'text-amber-900' : isZero ? 'text-slate-700' : 'text-emerald-900'
                              }`}>
                                {isNegative 
                                  ? `- R$ ${Math.abs(barber.pending).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                  : `R$ ${barber.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                              </span>
                              {barber.paid > 0 && (
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  Já pago: R$ {barber.paid.toFixed(2)}
                                </span>
                              )}
                            </div>
                            {isNegative && (
                              <p className="text-[10px] text-amber-700 font-bold mt-1">
                                Barbeiro deve à barbearia (vales superaram comissões).
                              </p>
                            )}
                          </div>
                        </div>

                        {/* 4. Ações: Pagar Repasse & Ver Extrato */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setInitialPayoutBarberId(barber.uid);
                              setIsPayoutModalOpen(true);
                            }}
                            className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                          >
                            <DollarSign size={14} />
                            <span>Pagar Repasse</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBarberId(barber.uid);
                              setSelectedBarberName(barber.nome);
                            }}
                            className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer"
                          >
                            <FileText size={14} />
                            <span>Ver Extrato</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </motion.div>
            )}

            {/* ABA 3: HISTÓRICO DE REPASSES */}
            {activeTab === 'payouts' && (
              <motion.div 
                key="payouts-clean"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {payouts.map((p, index) => (
                  <div 
                    key={`payout-card-${p.id || index}`} 
                    className="bg-white border border-slate-200 rounded-3xl p-5 hover:border-slate-350 transition-all shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shadow-2xs">
                            <ArrowRightLeft size={16} />
                          </div>
                          <div>
                            <p className="font-black text-slate-900 text-sm">{p.profissional_name}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">{format(new Date(p.date), 'dd/MM/yyyy')}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-emerald-600 font-mono">R$ {p.amount.toFixed(2)}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-extrabold tracking-wider">{p.commissionIds?.length || 0} comissões</p>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-black">
                          <span>Responsável</span>
                          <span className="text-slate-800 font-bold">{p.responsibleName}</span>
                        </div>
                        {p.notes && (
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600 italic">
                            "{p.notes}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <div className="col-span-full text-center py-16 text-slate-400 italic text-sm bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                    Nenhum histórico de repasse registrado no período selecionado.
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
            initialBarberId={initialPayoutBarberId}
            onClose={() => setIsPayoutModalOpen(false)}
            onConfirm={handleRegisterPayout}
            isRegistering={isRegisteringPayout}
          />
        )}

        <CommissionAuditRecoveryModal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          tenantId={tenantId || 'gbcortes7'}
          startDate={dateRange.start || '2026-09-01'}
          endDate={dateRange.end || '2026-09-15'}
          onSuccess={() => {
            loadData();
            toast.success("Dados do período reconciliados com o banco de dados!");
          }}
        />
      </AnimatePresence>
    </div>
  );
}

// Payout modal component with pristine layouts and loaders
function PayoutModal({ barbers, initialBarberId, onClose, onConfirm, isRegistering }: { barbers: UserProfile[], initialBarberId?: string, onClose: () => void, onConfirm: (bId: string, am: number, ids: string[], n: string) => void, isRegistering: boolean }) {
  const [selectedBarber, setSelectedBarber] = useState(initialBarberId || '');
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
                <option key={`barber-modal-opt-${b.uid || index}-${index}`} value={b.uid}>{b.nome}</option>
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
              className="flex-1 py-3.5 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button 
              disabled={!selectedBarber || totalAmount === 0 || loading || isRegistering}
              onClick={() => onConfirm(selectedBarber, totalAmount, pendingCommissions.map(c => c.id), notes)}
              className="flex-[2] py-3.5 bg-slate-900 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition-all shadow-md flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              {isRegistering ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>Confirmar Pagamento</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

