import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Calendar, Plus, Printer, DollarSign, TrendingUp, Percent, 
  Receipt, CheckCircle2, Wallet, Briefcase, FileText, History, Loader2, Info,
  Scissors, Coffee, Box, Sparkles, Tag, Users, X, ChevronRight, Filter
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { auth, db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { commissionService } from '../../services/commissionService';
import { cashService } from '../../services/cashService';
import { financialService } from '../../services/financialService';
import { Commission, ProfessionalAdvance, ProfessionalPayment } from '../../types';

interface DetailProps {
  professionalId: string;
  professionalName: string;
  dateRange: { start: string; end: string };
  onBack: () => void;
}

export function ProfessionalCommissionsDetail({ professionalId, professionalName, dateRange, onBack }: DetailProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  
  const [allCommissions, setAllCommissions] = useState<Commission[]>([]);
  const [allAdvances, setAllAdvances] = useState<ProfessionalAdvance[]>([]);
  const [payouts, setPayouts] = useState<ProfessionalPayment[]>([]);
  const [isOpenCash, setIsOpenCash] = useState<any>(null);

  // Compute filtered period lists and all-time ledger totals reactively
  const commissions = React.useMemo(() => {
    return allCommissions.filter(c => c.date >= dateRange.start && c.date <= dateRange.end);
  }, [allCommissions, dateRange.start, dateRange.end]);

  const advances = React.useMemo(() => {
    return allAdvances.filter(a => a.date >= dateRange.start && a.date <= dateRange.end);
  }, [allAdvances, dateRange.start, dateRange.end]);

  const allTimePendingCommissions = React.useMemo(() => {
    return allCommissions.filter(c => c.status === 'pendente');
  }, [allCommissions]);

  const allTimePendingAdvances = React.useMemo(() => {
    return allAdvances.filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'));
  }, [allAdvances]);
  
  const [activeSubTab, setActiveSubTab] = useState<'analytical' | 'vales' | 'repasse' | 'payroll'>('analytical');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isValeModalOpen, setIsValeModalOpen] = useState(false);

  // States to choose which vales to deduct from current payout session
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<string[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<'pendente' | 'pago' | 'todas'>('pendente');

  const [paymentData, setPaymentData] = useState({
    amount: 0, // gross commission amount being settled in this action
    notes: '',
    selectedIds: [] as string[],
    source: 'financeiro',
    paymentMethod: 'pix'
  });

  const [valeData, setValeData] = useState({
    amount: '',
    description: '',
    source: 'financeiro',
    paymentMethod: 'pix'
  });

  // Reactive listeners to avoid any manual reload and give live synchronization
  useEffect(() => {
    setLoading(true);

    const commsQuery = query(collection(db, 'commissions'), where('profissional_id', '==', professionalId));
    const unsubComms = onSnapshot(commsQuery, (snapshot) => {
      const commsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Commission));
      setAllCommissions(commsList);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar comissões detalhadas:", error);
      setLoading(false);
    });

    const advsQuery = query(collection(db, 'professional_advances'), where('profissional_id', '==', professionalId));
    const unsubAdvs = onSnapshot(advsQuery, (snapshot) => {
      const advsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalAdvance));
      setAllAdvances(advsList);
    }, (error) => {
      console.error("Erro ao escutar vales detalhados:", error);
    });

    const payoutsQuery = query(collection(db, 'professional_payments'), where('profissional_id', '==', professionalId));
    const unsubPayouts = onSnapshot(payoutsQuery, (snapshot) => {
      const payoutsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfessionalPayment));
      setPayouts(payoutsList);
    }, (error) => {
      console.error("Erro ao escutar pagamentos detalhados:", error);
    });

    const unsubCash = onSnapshot(collection(db, 'caixa_diario'), (snapshot) => {
      const openCash = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find((c: any) => c.status === 'open');
      setIsOpenCash(openCash || null);
    }, (error) => {
      console.error("Erro ao escutar caixas em detalhamento:", error);
    });

    return () => {
      unsubComms();
      unsubAdvs();
      unsubPayouts();
      unsubCash();
    };
  }, [professionalId]);

  // Handle auto calculations on lists changing
  useEffect(() => {
    const activePendingComms = commissions.filter(c => c.status === 'pendente');
    const pendingIds = activePendingComms.map(c => c.id);
    const pendingTotal = activePendingComms.reduce((acc, c) => acc + c.commission_value, 0);

    setPaymentData(prev => ({ 
      ...prev, 
      selectedIds: pendingIds, 
      amount: pendingTotal,
      notes: `Fechamento período de ${format(parseISO(dateRange.start), 'dd/MM')} a ${format(parseISO(dateRange.end), 'dd/MM')}`
    }));
  }, [commissions, dateRange.start, dateRange.end]);

  useEffect(() => {
    setPaymentData(prev => ({
      ...prev,
      source: isOpenCash ? 'caixa' : 'financeiro',
      paymentMethod: isOpenCash ? 'dinheiro' : 'pix'
    }));
    setValeData(prev => ({
      ...prev,
      source: isOpenCash ? 'caixa' : 'financeiro',
      paymentMethod: isOpenCash ? 'dinheiro' : 'pix'
    }));
  }, [isOpenCash]);

  useEffect(() => {
    setSelectedAdvanceIds(allTimePendingAdvances.map(a => a.id));
  }, [allTimePendingAdvances]);

  // Handle Register Payment (Repasse)
  const handleRegisterPayment = async () => {
    if (!user || paymentData.amount <= 0) return;

    try {
      const todayString = new Date().toISOString().split('T')[0];
      const txId = paymentData.source === 'caixa' ? `TX-CASH-${Date.now()}` : `TX-FIN-${Date.now()}`;
      
      // Vales seleccionados para deduzir / descontar
      const deductedAdvances = allTimePendingAdvances.filter(a => selectedAdvanceIds.includes(a.id));
      const totalAdjustmentDeduction = deductedAdvances.reduce((acc, a) => acc + a.amount, 0);
      
      // Valor líquido final pago = Commissions selecionadas - Vales descontados
      const finalNetPaidAmount = Math.max(0, paymentData.amount - totalAdjustmentDeduction);

      // 1. Submit payout batch update in commissionService
      await commissionService.registerPayout({
        profissional_id: professionalId,
        profissional_name: professionalName,
        commission_ids: paymentData.selectedIds,
        advance_ids: selectedAdvanceIds,
        amount: finalNetPaidAmount, // actual net bank transfer/cash amount paid
        date: todayString,
        period_start: dateRange.start,
        period_end: dateRange.end,
        responsible_id: user.uid,
        responsible_name: profile?.nome || 'Admin',
        transaction_id: txId,
        notes: paymentData.notes + (totalAdjustmentDeduction > 0 ? ` (Descontado R$ ${totalAdjustmentDeduction.toFixed(2)} em Vales)` : '')
      });

      // 2. Register financial accounting record
      if (paymentData.source === 'caixa' && isOpenCash) {
        await cashService.addMovement({
          caixa_id: isOpenCash.id,
          type: 'expense',
          category: 'Repasse Comissões',
          description: `Repasse Líquido - ${professionalName} (Ref ${dateRange.start} a ${dateRange.end})`,
          amount: finalNetPaidAmount,
          paymentMethod: paymentData.paymentMethod as any,
          is_receivable: false,
          usuario_id: user.uid,
          usuario_name: profile?.nome || 'Admin',
          date: todayString
        });
      } else {
        await financialService.createTransaction({
          type: 'expense',
          category: 'Repasse Comissões (Parceiros)',
          description: `Repasse Líquido - ${professionalName} (Ref ${dateRange.start} a ${dateRange.end})`,
          amount: finalNetPaidAmount,
          net_amount: finalNetPaidAmount,
          fee_amount: 0,
          paymentMethod: paymentData.paymentMethod as any,
          date: todayString,
          settlement_date: todayString,
          status: 'pago',
          is_settled: true,
          profissional_id: professionalId,
          profissional_name: professionalName,
          responsavel_id: user.uid,
          responsavel_name: profile?.nome || 'Admin'
        });
      }

      toast.success("Pagamento de comissão registrado com sucesso!");
      setIsPaymentModalOpen(false);
    } catch (error) {
      console.error("Erro ao registrar pagamento:", error);
      toast.error("Erro ao registrar pagamento.");
    }
  };

  // Handle Adding Vale / Adiantamento
  const handleRegisterValeFromDetail = async () => {
    if (!valeData.amount || !user) return;

    try {
      const amount = parseFloat(valeData.amount);
      if (isNaN(amount) || amount <= 0) {
        toast.error("Valor inválido");
        return;
      }

      const todayString = new Date().toISOString().split('T')[0];
      const advanceId = await commissionService.registerAdvance({
        profissional_id: professionalId,
        profissional_name: professionalName,
        amount,
        description: valeData.description || 'Vale/Adiantamento Avulso',
        date: todayString,
        status: 'pendente',
        responsible_id: user.uid,
        responsible_name: profile?.nome || 'Admin'
      });

      if (valeData.source === 'caixa' && isOpenCash) {
        await cashService.addMovement({
          caixa_id: isOpenCash.id,
          type: 'expense',
          category: 'Parceiro Adiantamento (Vale)',
          description: `Saída Vale/Adiantamento p/ ${professionalName} - ${valeData.description || 'Adiant.'}`,
          amount,
          paymentMethod: valeData.paymentMethod as any,
          is_receivable: false,
          usuario_id: user.uid,
          usuario_name: profile?.nome || 'Admin',
          date: todayString
        });
      } else {
        await financialService.createTransaction({
          type: 'expense',
          category: 'Controle de Vales (Parceiros)',
          description: `Adiantamento Vale - ${professionalName} (${valeData.description || 'Adi.'})`,
          amount,
          net_amount: amount,
          fee_amount: 0,
          paymentMethod: valeData.paymentMethod as any,
          date: todayString,
          settlement_date: todayString,
          status: 'pago',
          is_settled: true,
          profissional_id: professionalId,
          profissional_name: professionalName,
          responsavel_id: user.uid,
          responsavel_name: profile?.nome || 'Admin'
        });
      }

      toast.success("Vale registrado com sucesso!");
      setIsValeModalOpen(false);
      setValeData({ amount: '', description: '', source: isOpenCash ? 'caixa' : 'financeiro', paymentMethod: isOpenCash ? 'dinheiro' : 'pix' });
    } catch (error) {
      console.error("Erro ao registrar vale:", error);
      toast.error("Erro ao registrar vale.");
    }
  };

  const handlePrintSummary = () => {
    window.print();
  };

  // 1. Categorize Filtered Period Commissions to show clear granular insights
  const periodCommissionsByCategory = (() => {
    let servicos = 0;
    let vendas = 0;
    let gorjetas = 0;
    let assinaturas = 0;

    commissions.forEach(c => {
      const type = c.commission_type || (
        c.servico_name?.toLowerCase().includes('gorjeta') ? 'gorjeta' :
        (c.servico_name?.toLowerCase().includes('assinatura') || c.servico_name?.toLowerCase().includes('plano') || c.servico_name?.toLowerCase().includes('pacote')) ? 'assinatura' :
        (c.servico_name?.toLowerCase().includes('produto') || c.servico_name?.toLowerCase().includes('venda')) ? 'venda' :
        'servico'
      );

      if (type === 'gorjeta') {
        gorjetas += c.commission_value || 0;
      } else if (type === 'assinatura') {
        assinaturas += c.commission_value || 0;
      } else if (type === 'venda' || type === 'produto') {
        vendas += c.commission_value || 0;
      } else {
        servicos += c.commission_value || 0;
      }
    });

    return { servicos, vendas, gorjetas, assinaturas };
  })();

  const totals = {
    produced: commissions.reduce((acc, c) => acc + (c.base_value || 0), 0),
    commission: commissions.reduce((acc, c) => acc + (c.commission_value || 0), 0),
    pending: commissions.filter(c => c.status === 'pendente').reduce((acc, c) => acc + (c.commission_value || 0), 0),
    advances: advances.reduce((acc, a) => acc + (a.amount || 0), 0),
    paid: payouts.reduce((acc, p) => acc + (p.date >= dateRange.start && p.date <= dateRange.end ? p.amount : 0), 0)
  };

  // 2. All-time actual pending totals to display correct global ledger to user
  const allTimePendingCommissionsTotal = allTimePendingCommissions.reduce((acc, c) => acc + (c.commission_value || 0), 0);
  const allTimePendingAdvancesTotal = allTimePendingAdvances.reduce((acc, a) => acc + (a.amount || 0), 0);
  const realBalanceToPayAllTime = allTimePendingCommissionsTotal - allTimePendingAdvancesTotal;

  // Selected deduction total inside the Payout Modal
  const currentSelectedAdvancesTotal = allTimePendingAdvances
    .filter(a => selectedAdvanceIds.includes(a.id))
    .reduce((acc, a) => acc + a.amount, 0);

  // Detailed breakdown mapped directly to the design layout requested in user's uploaded receipt mockup
  const detailedBreakdown = (() => {
    let servicos = 0;
    let produtos = 0;
    let pacotes = 0;
    let gorjetas = 0;
    let remuneracoes = 0;
    let bonificacoes = 0;
    let assinaturas = 0;
    let auxiliar = 0;

    commissions.forEach(c => {
      const name = (c.servico_name || '').toLowerCase();
      const type = c.commission_type || '';

      if (type === 'gorjeta' || name.includes('gorjeta') || name.includes('caixinha') || name.includes('tip')) {
        gorjetas += c.commission_value || 0;
      } else if (type === 'assinatura' || name.includes('assinatura') || name.includes('plano') || name.includes('club')) {
        assinaturas += c.commission_value || 0;
      } else if (name.includes('pacote') || name.includes('combo')) {
        pacotes += c.commission_value || 0;
      } else if (name.includes('remunera') || name.includes('salário') || name.includes('fixo')) {
        remuneracoes += c.commission_value || 0;
      } else if (name.includes('bônus') || name.includes('bonus') || name.includes('bonific')) {
        bonificacoes += c.commission_value || 0;
      } else if (name.includes('auxiliar') || name.includes('ajudante')) {
        auxiliar += c.commission_value || 0;
      } else if (type === 'venda' || type === 'produto' || name.includes('produto') || name.includes('venda')) {
        produtos += c.commission_value || 0;
      } else {
        servicos += c.commission_value || 0;
      }
    });

    const valesValue = allTimePendingAdvancesTotal; // All pending vales historically
    const descontosValue = commissions.filter(c => c.commission_value < 0).reduce((acc, c) => acc + Math.abs(c.commission_value), 0);
    const deducoesValue = 0;
    const comandasValue = 0; // standard open ticket placeholder

    const subtotalBruto = servicos + produtos + pacotes + gorjetas + remuneracoes + bonificacoes + assinaturas + auxiliar;
    const totalLiquido = Math.max(0, subtotalBruto - valesValue - descontosValue - deducoesValue - comandasValue);

    return {
      servicos,
      produtos,
      pacotes,
      gorjetas,
      remuneracoes,
      bonificacoes,
      assinaturas,
      auxiliar,
      vales: valesValue,
      descontos: descontosValue,
      deducoes: deducoesValue,
      comandas: comandasValue,
      bruto: subtotalBruto,
      total: totalLiquido
    };
  })();

  return (
    <>
      <div id="professional-commissions-detail" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 print:hidden">
        {/* Header Detail */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
          <div className="flex items-center gap-4">
            <button 
              id="btn-back-commissions-detail"
              onClick={onBack}
              className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all active:scale-95 shadow-sm"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-2xl font-black text-primary">{professionalName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="px-3 py-1 bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg">Profissional de Elite</span>
                <span className="text-muted text-xs font-medium">Balanço e Detalhamento da Cota-Parte</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100/90 border border-slate-200/50 rounded-2xl px-4 py-2.5 shadow-sm text-xs font-semibold text-primary">
              <Calendar className="text-slate-500" size={14} />
              <span>Intervalo Lido: <strong className="font-extrabold">{format(new Date(dateRange.start + 'T00:00:00'), 'dd/MM/yyyy')}</strong> até <strong className="font-extrabold">{format(new Date(dateRange.end + 'T00:00:00'), 'dd/MM/yyyy')}</strong></span>
            </div>
            <button 
              id="btn-print-commissions"
              onClick={handlePrintSummary}
              className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-primary rounded-2xl transition-all shadow-sm active:scale-95"
              title="Exportar PDF / Imprimir Ficha de Repasse"
            >
              <Printer size={20} />
            </button>
            <button 
              id="btn-launch-advance"
              onClick={() => setIsValeModalOpen(true)}
              className="flex items-center gap-2 bg-amber-500 text-white px-5 py-3 rounded-2xl font-black text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/10 active:scale-95"
            >
              <Plus size={18} />
              Lançar Vale (Adiantamento)
            </button>
            <button 
              id="btn-view-receipt"
              onClick={() => setShowReceiptModal(true)}
              className="flex items-center gap-2 bg-rose-500 text-white px-5 py-3 rounded-2xl font-black text-sm hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/10 active:scale-95"
              title="Visualizar Demonstrativo Bruto / Acertos"
            >
              <FileText size={18} />
              Demonstrativo Bruto
            </button>
            <button 
              id="btn-register-payout"
              onClick={() => {
                // Pre-select gross Commissions value
                setPaymentData(prev => ({
                  ...prev,
                  amount: totals.pending,
                  selectedIds: commissions.filter(c => c.status === 'pendente').map(c => c.id)
                }));
                // Automatically include all active vales
                setSelectedAdvanceIds(allTimePendingAdvances.map(a => a.id));
                setIsPaymentModalOpen(true);
              }}
              disabled={totals.pending <= 0 && allTimePendingCommissionsTotal <= 0}
              className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-primary transition-all shadow-lg shadow-primary/10 active:scale-95"
            >
              <DollarSign size={18} />
              Liquidara Acertos
            </button>
          </div>
        </header>

        {/* Global Bookkeeping Warning */}
        {allTimePendingCommissionsTotal !== totals.pending && (
          <div className="p-4 bg-blue-50 border border-blue-100/70 rounded-2xl text-blue-800 text-xs flex items-center gap-3">
            <Info size={18} className="text-blue-500 shrink-0" />
            <p className="font-medium">
              Nota: Este profissional tem <strong>R$ {allTimePendingCommissionsTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> em comissões pendentes acumuladas totais (incluindo outros períodos fora do intervalo visual ajustado acima).
            </p>
          </div>
        )}

        {/* Stats Board */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <SummaryCard title="Produção Bruta (Filtro)" value={totals.produced} icon={<TrendingUp size={18} />} color="slate" />
          <SummaryCard title="Comissão Gerada (Filtro)" value={totals.commission} icon={<PercentIcon size={18} />} color="emerald" />
          <SummaryCard title="Vales Ativos (Histórico)" value={allTimePendingAdvancesTotal} icon={<Receipt size={18} />} color="amber" negative />
          <SummaryCard title="Já Payouts (Filtro)" value={totals.paid} icon={<CheckCircle2 size={18} />} color="blue" />
          <SummaryCard title="Total Geral a Pagar" value={realBalanceToPayAllTime} icon={<Wallet size={18} />} color="primary" highlight />
        </div>

        {/* Detailed Commission Categorization Chart Row */}
        <div className="bg-slate-50 border border-slate-200/60 rounded-[2.5rem] p-6 lg:p-8">
          <h3 className="text-xs font-black uppercase text-primary tracking-widest mb-6">Detalhamento das Receitas de Comissão (Deste Período)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* SERVIÇOS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase text-muted tracking-wider mb-1">Comissão de Serviços</p>
              <p className="text-xl font-bold text-primary">R$ {periodCommissionsByCategory.servicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <div className="w-full bg-slate-100 h-1 mt-3 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full" 
                  style={{ width: `${totals.commission > 0 ? (periodCommissionsByCategory.servicos / totals.commission) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* PRODUTOS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase text-muted tracking-wider mb-1">Comissão de Vendas/Produtos</p>
              <p className="text-xl font-bold text-primary">R$ {periodCommissionsByCategory.vendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <div className="w-full bg-slate-100 h-1 mt-3 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full" 
                  style={{ width: `${totals.commission > 0 ? (periodCommissionsByCategory.vendas / totals.commission) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* GORJETAS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase text-muted tracking-wider mb-1">Gorjetas Recebidas (Clientes)</p>
              <p className="text-xl font-bold text-primary">R$ {periodCommissionsByCategory.gorjetas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <div className="w-full bg-slate-100 h-1 mt-3 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full" 
                  style={{ width: `${totals.commission > 0 ? (periodCommissionsByCategory.gorjetas / totals.commission) * 100 : 0}%` }}
                />
              </div>
            </div>
            {/* ASSINATURAS */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase text-muted tracking-wider mb-1">Comissão de Assinaturas/Pacotes</p>
              <p className="text-xl font-bold text-primary">R$ {periodCommissionsByCategory.assinaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              <div className="w-full bg-slate-100 h-1 mt-3 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-500 h-full" 
                  style={{ width: `${totals.commission > 0 ? (periodCommissionsByCategory.assinaturas / totals.commission) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Analytical Content */}
        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[500px]">
          {/* Sub-Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50/50 p-2 gap-1 overflow-x-auto no-scrollbar">
            <SubTabButton isActive={activeSubTab === 'analytical'} onClick={() => setActiveSubTab('analytical')} label="Analítico (Serviços)" icon={<Briefcase size={16} />} />
            <SubTabButton isActive={activeSubTab === 'vales'} onClick={() => setActiveSubTab('vales')} label="Vales / Adiantamentos" icon={<FileText size={16} />} />
            <SubTabButton isActive={activeSubTab === 'repasse'} onClick={() => setActiveSubTab('repasse')} label="Histórico de Repasses" icon={<History size={16} />} />
            <SubTabButton isActive={activeSubTab === 'payroll'} onClick={() => setActiveSubTab('payroll')} label="Folha de Pagamento" icon={<Receipt size={16} />} />
          </div>

          <div className="p-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-primary" size={40} />
                <p className="text-muted text-sm font-medium">Processando relatório analítico...</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {activeSubTab === 'analytical' && (() => {
                  const displayedCommissions = commissions.filter(c => {
                    if (commissionStatusFilter === 'pendente') return c.status === 'pendente';
                    if (commissionStatusFilter === 'pago') return c.status === 'pago';
                    return true;
                  });

                  return (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="analytical">
                      {/* Três Opções: Pagas, Não Pagas, Todas */}
                      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                        <div className="text-left">
                          <p className="text-xs font-black text-primary uppercase tracking-widest mb-1">Status do Lançamento</p>
                          <p className="text-[11px] text-slate-500 font-medium">Veja o histórico fechado (pago) ou aberto (não pago) do profissional neste período</p>
                        </div>
                        <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto border border-slate-200/40">
                          <button
                            type="button"
                            onClick={() => setCommissionStatusFilter('pendente')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                              commissionStatusFilter === 'pendente'
                                ? 'bg-white text-primary shadow-sm ring-1 ring-slate-200/50'
                                : 'text-slate-500 hover:text-primary'
                            }`}
                          >
                            Não Pagas
                          </button>
                          <button
                            type="button"
                            onClick={() => setCommissionStatusFilter('pago')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                              commissionStatusFilter === 'pago'
                                ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200/50'
                                : 'text-slate-500 hover:text-primary'
                            }`}
                          >
                            Pagas
                          </button>
                          <button
                            type="button"
                            onClick={() => setCommissionStatusFilter('todas')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                              commissionStatusFilter === 'todas'
                                ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                                : 'text-slate-500 hover:text-primary'
                            }`}
                          >
                            Todas / Geral
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto -mx-8">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/30">
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Data</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Comanda</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Serviço/Produto</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right font-medium">Categoria</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor Venda</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">%</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right">Cota Parcial</th>
                              <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {displayedCommissions.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-8 py-16 text-center text-slate-400 font-medium italic text-xs">
                                  Nenhuma comissão encontrada nesta opção para o período selecionado.
                                </td>
                              </tr>
                            ) : (
                              displayedCommissions.map((c, index) => {
                                const typeLabel = c.commission_type === 'gorjeta' ? 'Gorjeta' :
                                                  c.commission_type === 'venda' ? 'Venda' :
                                                  c.commission_type === 'assinatura' ? 'Assinatura' : 'Serviço';
                                return (
                                  <tr key={`comm-det-${c.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-5 text-sm font-bold text-slate-500">{format(parseISO(c.date), 'dd/MM/yyyy')}</td>
                                    <td className="px-8 py-5 font-black text-primary text-sm">#{c.comanda_number}</td>
                                    <td className="px-8 py-5">
                                      <p className="text-sm font-bold text-primary">{c.servico_name}</p>
                                      <p className="text-[10px] text-muted font-bold truncate max-w-[150px]">{c.cliente_name || 'Cliente Consumidor'}</p>
                                    </td>
                                    <td className="px-8 py-5 text-right font-bold text-xs text-slate-500">{typeLabel}</td>
                                    <td className="px-8 py-5 text-right text-sm font-medium text-slate-500">R$ {c.base_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-8 py-5 text-center text-[10px] font-black text-slate-400">{c.commission_percentage}%</td>
                                    <td className="px-8 py-5 text-right text-sm font-black text-primary">R$ {c.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-8 py-5 text-center">
                                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                        c.status === 'pago' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                                      }`}>
                                        {c.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  );
                })()}

                {activeSubTab === 'vales' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="vales">
                    <div className="overflow-x-auto -mx-8 text-left">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50/30">
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Data</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Descrição</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Responsável</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Status / Liquidado em</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {advances.map((a, index) => (
                            <tr key={`adv-det-${a.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-8 py-5 text-sm font-bold text-slate-500">{format(parseISO(a.date), 'dd/MM/yyyy')}</td>
                              <td className="px-8 py-5 text-sm font-bold text-primary">{a.description}</td>
                              <td className="px-8 py-5 text-xs text-muted font-medium">{a.responsible_name || 'Administrador'}</td>
                              <td className="px-8 py-5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${a.status === 'pago' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                  {a.status === 'pago' ? 'DEDUZIDO NO REPASSE' : 'EM ABERTO'}
                                </span>
                              </td>
                              <td className="px-8 py-5 text-right text-sm font-black text-red-600">-R$ {a.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {advances.length === 0 && (
                            <tr><td colSpan={5} className="px-8 py-20 text-center text-muted font-medium italic">Nenhum vale registrado no período.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeSubTab === 'repasse' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="repasse">
                    <div className="overflow-x-auto -mx-8 text-left">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-slate-50/30">
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Data do Pagamento</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Período de Ref.</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Transação / Comentário</th>
                            <th className="px-8 py-4 text-[10px] font-black text-muted uppercase tracking-widest text-right">Valor Recebido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {payouts.map((p, index) => (
                            <tr key={`payout-det-${p.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-8 py-5 text-sm font-bold text-slate-700">{format(parseISO(p.date), 'dd/MM/yyyy')}</td>
                              <td className="px-8 py-5 text-xs font-bold text-muted uppercase tracking-widest">{format(parseISO(p.period_start), 'dd/MM')} a {format(parseISO(p.period_end), 'dd/MM')}</td>
                              <td className="px-8 py-5">
                                <p className="text-xs text-slate-400 font-mono">{p.transaction_id}</p>
                                {p.notes && <p className="text-[10px] text-muted font-medium mt-0.5">{p.notes}</p>}
                              </td>
                              <td className="px-8 py-5 text-right text-sm font-black text-emerald-600">R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {payouts.length === 0 && (
                            <tr><td colSpan={4} className="px-8 py-20 text-center text-muted font-medium italic">Nenhum repasse registrado.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {activeSubTab === 'payroll' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} key="payroll">
                    <div className="max-w-2xl mx-auto p-10 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-inner text-left">
                      <div className="flex justify-between items-start mb-10">
                        <div>
                          <h4 className="text-xl font-bold text-primary">Folha de Movimentação</h4>
                          <p className="text-xs text-muted font-bold uppercase tracking-widest mt-1">Ref: {format(parseISO(dateRange.start), 'dd/MM/yyyy')} a {format(parseISO(dateRange.end), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-primary uppercase tracking-widest">{professionalName}</p>
                          <p className="text-[10px] text-muted font-bold block">ID: {professionalId.slice(0, 8)}</p>
                        </div>
                      </div>

                      {/* Detail Breakdown of Commission Categories */}
                      <div className="bg-white/80 p-6 rounded-3xl border border-slate-200/50 mb-6 space-y-3.5">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-100 pb-1.5">Receitas por Categoria</h5>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Serviços Criados (+)</span>
                          <span className="font-bold text-slate-700">R$ {periodCommissionsByCategory.servicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Vendas de Balcão (+)</span>
                          <span className="font-bold text-slate-700">R$ {periodCommissionsByCategory.vendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Gorjetas Clientes (+)</span>
                          <span className="font-bold text-slate-700">R$ {periodCommissionsByCategory.gorjetas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 font-medium">Assinaturas/Planos (+)</span>
                          <span className="font-bold text-slate-700">R$ {periodCommissionsByCategory.assinaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>

                      <div className="space-y-4 border-t border-b border-slate-200 py-8 mb-8">
                        <PayrollRow label="Total Comissões Geradas (+)" value={totals.commission} />
                        <PayrollRow label="Adiantamentos/Vales no Período (-)" value={totals.advances} isNegative />
                        <PayrollRow label="Repasses Previstos / Pagos (-)" value={totals.paid} isNegative />
                      </div>

                      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                        <span className="text-primary font-black text-sm uppercase tracking-wide">Saldo Líquido Período</span>
                        <span className="text-xl font-black text-primary">R$ {(totals.commission - totals.advances - totals.paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex justify-between items-center bg-primary text-white p-6 rounded-3xl mt-4 shadow-md">
                        <span className="font-black text-sm uppercase tracking-wide">SALDO PENDENTE HISTÓRICO GERAL</span>
                        <span className="text-xl font-black">R$ {realBalanceToPayAllTime.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-12">BarberElite © Todos os direitos reservados</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Payment Settlement Modal with Vale selection checklist */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div id="modal-payment-settlement" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsPaymentModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden text-left">
              <div className="p-8 pb-4 max-h-[85vh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-primary">Liquidara Acertos</h3>
                    <p className="text-xs text-muted font-semibold mt-1">Settle e deduza vales do profissional</p>
                  </div>
                  <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><Plus className="rotate-45" size={24} /></button>
                </div>
                
                <div className="space-y-5">
                  {/* Bullet math */}
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-2">
                      <span>Comissão a Settle (+)</span>
                      <span>R$ {paymentData.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold text-red-500 mb-4">
                      <span>Desconto de Vales Selecionados (-)</span>
                      <span>-R$ {currentSelectedAdvancesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                      <span className="text-sm font-black text-primary">Saldo Líquido p/ Transferência</span>
                      <span className="text-2xl font-black text-emerald-600">R$ {Math.max(0, paymentData.amount - currentSelectedAdvancesTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Vales checklists */}
                  {allTimePendingAdvances.length > 0 ? (
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-primary ml-1">Selecione Valos/Adiantamentos para Dedução:</label>
                      <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-150 rounded-2xl p-3 space-y-2">
                        {allTimePendingAdvances.map(adv => (
                          <label key={`chk-adv-${adv.id}`} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-slate-200/60 cursor-pointer hover:bg-slate-50">
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox"
                                checked={selectedAdvanceIds.includes(adv.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAdvanceIds([...selectedAdvanceIds, adv.id]);
                                  } else {
                                    setSelectedAdvanceIds(selectedAdvanceIds.filter(id => id !== adv.id));
                                  }
                                }}
                                className="rounded text-primary focus:ring-primary w-4 h-4"
                              />
                              <div>
                                <p className="font-bold text-primary">{adv.description}</p>
                                <p className="text-[10px] text-muted">{format(parseISO(adv.date), 'dd/MM/yyyy')}</p>
                              </div>
                            </div>
                            <span className="font-black text-red-500">R$ {adv.amount.toFixed(2)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 text-amber-700 text-xs rounded-2xl font-medium border border-amber-100 flex items-center gap-2">
                      <Info size={14} />
                      Nenhum vale ativo em aberto para descontar no momento. Off-set zerado!
                    </div>
                  )}

                  {/* ORIGEM DO DINHEIRO PARA REPASSE */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Origem do Financiamento</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentData({ ...paymentData, source: 'caixa', paymentMethod: 'dinheiro' })}
                        disabled={!isOpenCash}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 ${
                          paymentData.source === 'caixa'
                            ? 'border-emerald-600 bg-emerald-50/50 text-emerald-800 ring-2 ring-emerald-500/10'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                        } ${!isOpenCash ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="text-xs font-black uppercase tracking-wider block">Registrar no Caixa</span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${isOpenCash ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                            {isOpenCash ? 'Aberto' : 'Fechado'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">Retira do caixa físico de hoje da barbearia.</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentData({ ...paymentData, source: 'financeiro', paymentMethod: 'pix' })}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 ${
                          paymentData.source === 'financeiro'
                            ? 'border-emerald-600 bg-emerald-50/50 text-emerald-800 ring-2 ring-emerald-500/10'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                        }`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="text-xs font-black uppercase tracking-wider block">Financeiro Geral</span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold uppercase tracking-wide">
                            Geral
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">Sai das contas ou bancos gerais integrados.</p>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Meio de Transferência</label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                    >
                      {paymentData.source === 'caixa' ? (
                        <>
                          <option value="dinheiro">Dinheiro (Espécie da Gaveta)</option>
                          <option value="pix">Pix (Registrado no Caixa)</option>
                        </>
                      ) : (
                        <>
                          <option value="pix">Pix (Transferência Direta Banco)</option>
                          <option value="transferencia">Transferência TED / DOC</option>
                          <option value="dinheiro">Dinheiro (Retirada de cofres)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Observações do Pagamento</label>
                    <textarea 
                      placeholder="Ex: Pagamento referente à quinzena ou mês corrente"
                      value={paymentData.notes}
                      onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-primary/5 transition-all h-20 resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-8 pt-4 bg-slate-50 border-t border-slate-100 flex gap-4 w-full">
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-3xl font-black text-sm hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleRegisterPayment}
                  className="flex-1 py-4 bg-primary text-white rounded-3xl font-black text-sm hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} />
                  Confirmar e Registrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vale Registration Modal */}
      <AnimatePresence>
        {isValeModalOpen && (
          <div id="modal-register-vale" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsValeModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden text-left">
              <div className="p-8 pb-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-primary">Lançar Vale</h3>
                  <button onClick={() => setIsValeModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400"><Plus className="rotate-45" size={24} /></button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Valor do Adiantamento</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">R$</span>
                      <input 
                        type="number" 
                        placeholder="0,00"
                        step="0.01"
                        value={valeData.amount}
                        onChange={(e) => setValeData({ ...valeData, amount: e.target.value })}
                        className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-xl text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Motivo / Descrição</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Vale adiantamento combustível / emergência"
                      value={valeData.description}
                      onChange={(e) => setValeData({ ...valeData, description: e.target.value })}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-primary placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Origem do Dinheiro</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setValeData({ ...valeData, source: 'caixa', paymentMethod: 'dinheiro' })}
                        disabled={!isOpenCash}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          valeData.source === 'caixa'
                            ? 'border-amber-600 bg-amber-50/50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-500'
                        } ${!isOpenCash ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className="text-xs font-black block">Retirar do Caixa</span>
                        <span className="text-[8px] text-slate-400 mt-1 block">Gaveta hoje</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setValeData({ ...valeData, source: 'financeiro', paymentMethod: 'pix' })}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          valeData.source === 'financeiro'
                            ? 'border-amber-600 bg-amber-50/50 text-amber-800'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        <span className="text-xs font-black block">Geral Financeiro</span>
                        <span className="text-[8px] text-slate-400 mt-1 block">Bancos gerais</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 pt-4 bg-slate-50 border-t border-slate-100 flex gap-4 w-full">
                <button 
                  onClick={() => setIsValeModalOpen(false)}
                  className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-3xl font-black text-sm hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleRegisterValeFromDetail}
                  className="flex-1 py-4 bg-primary text-white rounded-3xl font-black text-sm shadow-lg shadow-primary/20 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  Confirmar e Lançar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Breakdown Modal as requested by user in uploaded screenshot */}
      <AnimatePresence>
        {showReceiptModal && (
          <div id="modal-receipt-breakdown" className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowReceiptModal(false)} 
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-md" 
            />
            
            {/* Modal Body simulating iOS screen */}
            <motion.div 
              initial={{ opacity: 0, y: 30, scale: 0.95 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: 30, scale: 0.95 }} 
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="relative w-full max-w-[420px] bg-[#f8f9fa] rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200/50 flex flex-col h-[90vh] max-h-[820px] text-left"
            >
              {/* Fake iPhone Notch Area / Status Bar space */}
              <div className="px-8 pt-6 pb-2 flex justify-between items-center text-[10px] font-black text-slate-400 select-none">
                <span>00:57</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-2.5 bg-slate-400 rounded-sm inline-block"></span>
                </div>
              </div>

              {/* iOS Style Custom Header */}
              <div className="px-6 py-3 flex items-center justify-between">
                <button 
                  onClick={() => setShowReceiptModal(false)}
                  className="w-11 h-11 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-850 hover:text-black hover:border-slate-300 transition-all active:scale-95 shadow-sm"
                >
                  <ArrowLeft size={18} className="text-slate-700" />
                </button>
                <h4 className="text-sm font-black text-slate-800 tracking-tight">Comissões: Não Pagas</h4>
                <button 
                  onClick={() => toast.info("Filtros avançados do demonstrativo.")}
                  className="w-11 h-11 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-700 hover:text-black transition-all active:scale-95 shadow-sm"
                >
                  <Filter size={16} />
                </button>
              </div>

              {/* Scrollable Card Container */}
              <div className="flex-1 overflow-y-auto px-6 py-4 no-scrollbar">
                
                {/* The "Bruto" Card */}
                <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm relative space-y-4">
                  {/* Card Header */}
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <span className="text-sm font-black text-slate-800">Bruto</span>
                    <button 
                      onClick={() => setShowReceiptModal(false)}
                      className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  {/* List Items of the Breakdown */}
                  <div className="space-y-4">
                    {/* Item 1: Serviços */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <Scissors size={15} className="text-slate-400" />
                        <span>Serviços</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.servicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 2: Produtos */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <Coffee size={15} className="text-slate-400" />
                        <span>Produtos</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.produtos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 3: Pacotes */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <Box size={15} className="text-slate-400" />
                        <span>Pacotes</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.pacotes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 4: Gorjetas */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <DollarSign size={15} className="text-slate-400" />
                        <span>Gorjetas</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.gorjetas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 5: Remunerações */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <DollarSign size={15} className="text-slate-400" />
                        <span>Remunerações</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.remuneracoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 6: Bonificações */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <DollarSign size={15} className="text-slate-400" />
                        <span>Bonificações</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.bonificacoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 7: Assinaturas */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <DollarSign size={15} className="text-slate-400" />
                        <span>Assinaturas</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.assinaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 8: Auxiliar */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-slate-500 font-bold">
                        <DollarSign size={15} className="text-slate-400" />
                        <span>Auxiliar</span>
                      </div>
                      <span className="font-extrabold text-slate-700">R$ {detailedBreakdown.auxiliar.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 9: Vales - RED */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-red-500/90 font-bold">
                        <DollarSign size={15} className="text-red-400" />
                        <span>Vales</span>
                      </div>
                      <span className="font-extrabold text-red-500">R$ {detailedBreakdown.vales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 10: Descontos - RED */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-red-500/90 font-bold">
                        <DollarSign size={15} className="text-red-400" />
                        <span>Descontos</span>
                      </div>
                      <span className="font-extrabold text-red-500">R$ {detailedBreakdown.descontos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 11: Deduções - RED */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-red-500/90 font-bold">
                        <DollarSign size={15} className="text-red-400" />
                        <span>Deduções</span>
                      </div>
                      <span className="font-extrabold text-red-500">R$ {detailedBreakdown.deducoes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Item 12: Comandas - RED */}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-3 text-red-500/90 font-bold text-red-500">
                        <FileText size={15} className="text-red-400" />
                        <span>Comandas</span>
                      </div>
                      <span className="font-extrabold text-red-500">R$ {detailedBreakdown.comandas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-slate-100 pt-3" />

                    {/* Total Row */}
                    <div className="flex justify-between items-center text-xs font-black">
                      <div className="flex items-center gap-3 text-slate-800">
                        <DollarSign size={16} className="text-slate-800" />
                        <span className="uppercase tracking-wider">TOTAL</span>
                      </div>
                      <span className="text-sm font-black text-slate-800">R$ {detailedBreakdown.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Professional Name Tag at bottom inside mockup */}
                <div className="mt-6 text-center">
                  <p className="text-xs font-black text-slate-600">{professionalName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Fechamento Consolidado no Período</p>
                </div>
              </div>

              {/* Share/Print Receipt helper */}
              <div className="p-6 bg-white border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => {
                    window.print();
                    setShowReceiptModal(false);
                  }}
                  className="flex-1 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Printer size={14} />
                  Imprimir Comprovante
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EXCLUSIVO PARA IMPRESSÃO DE PDF (Ficha de Produção Escrita / Recibo) */}
      <div className="hidden print:block w-full text-black p-8 font-sans bg-white leading-normal text-left">
        {/* Header - Barber Shop Logo/Name */}
        <div className="border-b-4 border-black pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight uppercase">BarberElite ©</h1>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">SISTEMA INTEGRADO DE AUTO-GESTÃO</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold uppercase">FICHA DE PRODUÇÃO ESCRITA</h2>
            <p className="text-xs font-bold text-slate-500">Emissão: {format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</p>
          </div>
        </div>

        {/* Informações Gerais */}
        <div className="grid grid-cols-2 gap-8 mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-200">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Profissional Beneficiário</p>
            <p className="text-lg font-black">{professionalName}</p>
            <p className="text-xs font-medium text-slate-500 mt-1">ID: {professionalId}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Período de Consolidação</p>
            <p className="text-base font-black">{format(parseISO(dateRange.start), 'dd/MM/yyyy')} a {format(parseISO(dateRange.end), 'dd/MM/yyyy')}</p>
            <p className="text-xs font-bold text-slate-500 mt-1">Status: Concluído / Pronto para repasse</p>
          </div>
        </div>

        {/* Seção 1: Histórico de Vendas/Serviços Produzidos */}
        <div className="mb-8">
          <h3 className="text-xs font-black uppercase tracking-widest border-b border-black pb-2 mb-4">1. Detalhamento de Serviços e Produtos Produzidos</h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 font-bold">
                <th className="py-2">Data</th>
                <th className="py-2">Comanda</th>
                <th className="py-2">Serviço/Produto</th>
                <th className="py-2">Cliente</th>
                <th className="py-2 text-right">Valor Venda</th>
                <th className="py-2 text-center">Comissão %</th>
                <th className="py-2 text-right">Valor Cota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {commissions.map((c, idx) => (
                <tr key={`print-comm-${idx}`} className="align-middle">
                  <td className="py-2.5">{format(parseISO(c.date), 'dd/MM/yyyy')}</td>
                  <td className="py-2.5 font-bold">#{c.comanda_number}</td>
                  <td className="py-2.5">{c.servico_name}</td>
                  <td className="py-2.5 text-slate-600 font-medium">{c.cliente_name || 'Consumidor'}</td>
                  <td className="py-2.5 text-right">R$ {c.base_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2.5 text-center">{c.commission_percentage}%</td>
                  <td className="py-2.5 text-right font-bold">R$ {c.commission_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Seção 2: Adiantamentos / Vales Retirados */}
        {advances.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-black uppercase tracking-widest border-b border-black pb-2 mb-4">2. Demonstrativo de Vales e Adiantamentos Deduzidos</h3>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 font-bold">
                  <th className="py-2">Data</th>
                  <th className="py-2">Descrição / Motivo do Vale</th>
                  <th className="py-2">Responsável Lançador</th>
                  <th className="py-2 text-right">Valor Deduzido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {advances.map((a, idx) => (
                  <tr key={`print-adv-${idx}`}>
                    <td className="py-2.5">{format(parseISO(a.date), 'dd/MM/yyyy')}</td>
                    <td className="py-2.5">{a.description}</td>
                    <td className="py-2.5 text-slate-600">{a.responsible_name || 'Admin'}</td>
                    <td className="py-2.5 text-right font-bold text-red-600">-R$ {a.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumo Consolidado Detalhado das Comissões */}
        <div className="mb-8 p-6 bg-slate-50 border border-slate-300 rounded-2xl page-break-inside-avoid">
          <h3 className="text-xs font-black uppercase tracking-wider mb-4 border-b border-slate-400 pb-2">Resumo Consolidado Detalhado</h3>
          <div className="grid grid-cols-2 gap-4 text-xs font-bold">
            <div>Comissões de Serviços:</div>
            <div className="text-right">R$ {periodCommissionsByCategory.servicos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div>Comissões de Vendas:</div>
            <div className="text-right">R$ {periodCommissionsByCategory.vendas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div>Comissões de Assinaturas:</div>
            <div className="text-right">R$ {periodCommissionsByCategory.assinaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div>Gorjetas Especiais:</div>
            <div className="text-right">R$ {periodCommissionsByCategory.gorjetas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div className="border-t border-slate-300 pt-2 font-black text-sm">TOTAL GANHOS NO PERÍODO:</div>
            <div className="border-t border-slate-300 pt-2 text-right font-black text-sm">R$ {totals.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Seção 3: Consolidado da Folha */}
        <div className="mb-12 page-break-inside-avoid">
          <h3 className="text-xs font-black uppercase tracking-widest border-b border-black pb-2 mb-4">3. Balanço Geral de Créditos e Débitos</h3>
          <div className="bg-slate-100 p-6 rounded-2xl grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Comissão Bruta Gerada (+)</span>
                <span className="font-bold">R$ {totals.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Vales Consolidados (-)</span>
                <span className="font-bold text-red-600">-R$ {totals.advances.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider">Repasses Prévios Efetuados (-)</span>
                <span className="font-bold text-red-600">-R$ {totals.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="border-l border-slate-300 pl-8 flex flex-col justify-center">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SALDO LÍQUIDO CONSOLIDADO</p>
              <p className="text-3xl font-black text-black mt-1">R$ {(totals.commission - totals.advances - totals.paid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        {/* Termo de Quitação e Assinaturas */}
        <div className="mt-16 pt-8 border-t border-slate-300 grid grid-cols-2 gap-12 page-break-inside-avoid text-xs">
          <div className="text-center">
            <div className="border-b border-black h-12 mb-2"></div>
            <p className="font-bold uppercase">{professionalName}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">Assinatura do Profissional / Recibo</p>
          </div>
          <div className="text-center">
            <div className="border-b border-black h-12 mb-2"></div>
            <p className="font-bold uppercase">{profile?.nome || 'Gestor'}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-1">Assinatura da Administração / Repasse</p>
          </div>
        </div>

        {/* Rodapé de autenticação */}
        <div className="mt-16 text-center text-[9px] text-slate-400 font-medium uppercase tracking-widest">
          Documento fiscal-financeiro interno gerado e garantido na nuvem de dados BarberElite.
        </div>
      </div>
    </>
  );
}

function SummaryCard({ title, value, icon, color, highlight, negative }: any) {
  const colors: any = {
    slate: 'bg-slate-50 text-slate-400 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-400 border-emerald-100',
    amber: 'bg-amber-50 text-amber-400 border-amber-100',
    blue: 'bg-blue-50 text-blue-400 border-blue-100',
    primary: highlight ? 'bg-primary text-white border-primary shadow-lg shadow-primary/10' : 'bg-slate-50 text-primary border-slate-100'
  };

  return (
    <div className={`p-6 rounded-3xl border shadow-sm ${colors[color] || colors.slate} transition-all hover:scale-[1.02]`}>
      <div className="flex items-center justify-between mb-4">
        <span className={`text-[10px] font-black uppercase tracking-widest ${highlight ? 'text-white/60' : 'text-slate-500'}`}>{title}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${highlight ? 'bg-white/10' : 'bg-white shadow-sm text-primary'}`}>
          {icon}
        </div>
      </div>
      <p className={`text-xl font-black ${highlight ? 'text-white' : (negative ? 'text-red-500' : 'text-primary')}`}>
        {negative && '-'}R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function SubTabButton({ isActive, onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
        isActive ? 'bg-white text-primary shadow-sm' : 'text-slate-400 hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PayrollRow({ label, value, isNegative }: any) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">{label}</span>
      <span className={`font-black ${isNegative ? 'text-red-500' : 'text-emerald-600'}`}>{isNegative ? '-' : '+'} R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
    </div>
  );
}

function PercentIcon({ size }: { size: number }) {
  return <div style={{ fontSize: size }} className="font-black">%</div>;
}
