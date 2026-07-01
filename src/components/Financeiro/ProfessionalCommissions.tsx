
import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  TrendingUp, 
  Wallet, 
  ArrowRight,
  ChevronRight,
  Download,
  Plus,
  DollarSign,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  Percent,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { db } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { commissionService } from '../../services/commissionService';
import { cashService } from '../../services/cashService';
import { financialService } from '../../services/financialService';
import { useAuth } from '../../contexts/AuthContext';
import { ProfessionalCommissionsDetail } from './ProfessionalCommissionsDetail';
import { InputModal } from '../InputModal';

interface ProSummary {
  id: string;
  nome: string;
  production: number;
  commissionGenerated: number;
  vales: number;
  paid: number;
  balance: number;
}

export function ProfessionalCommissions({ 
  parentDateRange, 
  setParentDateRange 
}: { 
  parentDateRange?: { start: string; end: string }; 
  setParentDateRange?: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
}) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [barbers, setBarbers] = useState<any[]>([]);
  const [allCommissions, setAllCommissions] = useState<any[]>([]);
  const [allAdvances, setAllAdvances] = useState<any[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProId, setSelectedProId] = useState<string | null>(null);
  const [dateRange, setDateRangeState] = useState({
    start: parentDateRange?.start || format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: parentDateRange?.end || format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  const setDateRange = (newRange: any) => {
    let resolvedRange = typeof newRange === 'function' ? newRange(dateRange) : newRange;
    setDateRangeState(resolvedRange);
    if (setParentDateRange) {
      setParentDateRange(resolvedRange);
    }
  };

  useEffect(() => {
    if (parentDateRange) {
      setDateRangeState(parentDateRange);
    }
  }, [parentDateRange]);

  // Modal for Vales
  const [isValeModalOpen, setIsValeModalOpen] = useState(false);
  const [valePro, setValePro] = useState<ProSummary | null>(null);
  const [valeData, setValeData] = useState({ 
    amount: '', 
    description: '', 
    source: 'caixa' as 'caixa' | 'financeiro', 
    paymentMethod: 'dinheiro' as string 
  });
  const [isOpenCash, setIsOpenCash] = useState<any>(null);

  // Setup actual reactive listeners to stay in absolute sync with Comandas, Caixa, and launches
  useEffect(() => {
    setLoading(true);

    const barbersQuery = query(collection(db, 'usuarios'), where('tipo', '==', 'barbeiro'));
    const unsubBarbers = onSnapshot(barbersQuery, (snapshot) => {
      const bList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      setBarbers(bList);
    }, (error) => {
      console.error("Erro ao escutar barbeiros:", error);
    });

    const unsubComms = onSnapshot(collection(db, 'commissions'), (snapshot) => {
      const cList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllCommissions(cList);
    }, (error) => {
      console.error("Erro ao escutar comissões:", error);
    });

    const unsubAdvs = onSnapshot(collection(db, 'professional_advances'), (snapshot) => {
      const aList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllAdvances(aList);
    }, (error) => {
      console.error("Erro ao escutar vales:", error);
    });

    const unsubCash = onSnapshot(collection(db, 'cash_sessions'), (snapshot) => {
      const openCash = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find((c: any) => c.status === 'open' || c.status === 'reopened');
      setIsOpenCash(openCash || null);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar caixas:", error);
      setLoading(false);
    });

    return () => {
      unsubBarbers();
      unsubComms();
      unsubAdvs();
      unsubCash();
    };
  }, []);

  useEffect(() => {
    if (!isOpenCash) {
      setValeData(prev => ({ ...prev, source: 'financeiro', paymentMethod: 'pix' }));
    } else {
      setValeData(prev => ({ ...prev, source: 'caixa', paymentMethod: 'dinheiro' }));
    }
  }, [isOpenCash]);
  // Compute summaries onchanges completely in memory with zero async latency
  const summaries = React.useMemo(() => {
    return barbers.map(barber => {
      const proCommsAll = allCommissions.filter(c => c.profissional_id === barber.uid);
      const proAdvancesAll = allAdvances.filter(a => a.profissional_id === barber.uid);

      // Filter in period chosen by datepicker
      const proCommsPeriod = proCommsAll.filter(c => c.date >= dateRange.start && c.date <= dateRange.end);
      const proAdvancesPeriod = proAdvancesAll.filter(a => a.date >= dateRange.start && a.date <= dateRange.end);

      const production = proCommsPeriod.reduce((acc, c) => acc + (c.base_value || 0), 0);
      const commissionGenerated = proCommsPeriod.reduce((acc, c) => acc + (c.commission_value || 0), 0);
      const vales = proAdvancesPeriod.reduce((acc, a) => acc + (a.amount || 0), 0);

      // Sincronização matemática exata (all time pending commissions minus all open advances)
      const pendingCommsAll = proCommsAll.filter(c => c.status === 'pendente');
      const pendingAdvsAll = proAdvancesAll.filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'));

      const totalPendingComms = pendingCommsAll.reduce((acc, c) => acc + (c.commission_value || 0), 0);
      const totalPendingAdvs = pendingAdvsAll.reduce((acc, a) => acc + (a.amount || 0), 0);
      const balance = totalPendingComms - totalPendingAdvs;

      return {
        id: barber.uid,
        nome: barber.nome,
        production,
        commissionGenerated,
        vales,
        paid: 0,
        balance
      };
    });
  }, [barbers, allCommissions, allAdvances, dateRange.start, dateRange.end]);

  // Compute aggregated totals for the selected period across all professionals
  const aggregatedTotals = React.useMemo(() => {
    return summaries.reduce((acc, curr) => {
      acc.production += curr.production;
      acc.commissionGenerated += curr.commissionGenerated;
      acc.vales += curr.vales;
      acc.balance += curr.balance;
      return acc;
    }, { production: 0, commissionGenerated: 0, vales: 0, balance: 0 });
  }, [summaries]);

  const filteredSummaries = summaries.filter(s => 
    s.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRegisterVale = async () => {
    if (!valePro || !valeData.amount || !user) return;
    
    const amount = parseFloat(valeData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Valor inválido.");
      return;
    }

    try {
      const todayString = new Date().toISOString().split('T')[0];

      // 1. Create a reference for the advance in the specialized advances collection
      await commissionService.registerAdvance({
        profissional_id: valePro.id,
        profissional_name: valePro.nome,
        amount,
        description: valeData.description || 'Vale/Adiantamento',
        date: todayString,
        responsible_id: user.uid,
        responsible_name: profile?.nome || 'Admin'
      });

      // 2. Register flow based on source choice
      if (valeData.source === 'caixa') {
        const cash = await cashService.getCurrentCash();
        if (!cash) {
          toast.error("O caixa diário não está aberto! Selecione a opção 'Financeiro Geral'.");
          return;
        }

        await cashService.addMovement({
          caixa_id: cash.id,
          type: 'expense',
          category: 'Vale Profissional',
          description: `Vale - ${valePro.nome} (S/ ${valeData.description || 'Adi.'})`,
          amount,
          paymentMethod: valeData.paymentMethod as any,
          is_receivable: false,
          usuario_id: user.uid,
          usuario_name: profile?.nome || 'Admin',
          date: todayString
        });
      } else {
        // Source is General Finance, create a custom financial transaction
        await financialService.createTransaction({
          type: 'expense',
          category: 'Controle de Vales (Parceiros)',
          description: `Adiantamento Vale - ${valePro.nome} (S/ ${valeData.description || 'Adi.'})`,
          amount,
          net_amount: amount,
          fee_amount: 0,
          paymentMethod: valeData.paymentMethod as any,
          date: todayString,
          settlement_date: todayString,
          status: 'pago',
          is_settled: true,
          profissional_id: valePro.id,
          profissional_name: valePro.nome,
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

  // Helper to get initials for barber avatar
  const getInitials = (name: string) => {
    if (!name) return 'PR';
    const parts = name.split(' ');
    if (parts.length > 1) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  };

  if (selectedProId) {
    const pro = summaries.find(s => s.id === selectedProId);
    return (
      <ProfessionalCommissionsDetail 
        professionalId={selectedProId} 
        professionalName={pro?.nome || ''}
        dateRange={dateRange}
        onBack={() => {
          setSelectedProId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Search and Filters & Date Information */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-5 rounded-[2rem] border border-slate-200/80 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text"
            placeholder="Filtrar profissionais..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200/60 rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-slate-300 transition-all font-semibold text-primary placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/50 rounded-2xl px-5 py-3 shadow-sm text-xs font-semibold text-slate-600 w-full md:w-auto justify-center md:justify-start">
          <Calendar className="text-slate-500" size={15} />
          <span>Faturamento do período: <strong className="font-extrabold text-primary">{format(new Date(dateRange.start + 'T00:00:00'), 'dd/MM/yyyy')}</strong> até <strong className="font-extrabold text-primary">{format(new Date(dateRange.end + 'T00:00:00'), 'dd/MM/yyyy')}</strong></span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-primary" size={36} />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Consolidando comissões...</p>
        </div>
      ) : (
        <>
          {/* Bento-grid store summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produção Bruta (Total)</p>
                <h3 className="text-2xl font-black text-primary mt-2">
                  R$ {aggregatedTotals.production.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-4 pt-4 border-t border-slate-100 flex items-center gap-1">
                <TrendingUp size={12} className="text-slate-400" /> Total gerado em serviços e vendas
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Comissão Gerada</p>
                <h3 className="text-2xl font-black text-emerald-700 mt-2">
                  R$ {aggregatedTotals.commissionGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-[11px] text-emerald-600/80 font-semibold mt-4 pt-4 border-t border-slate-100 flex items-center gap-1">
                <Percent size={12} className="text-emerald-500" /> Parte devida aos profissionais
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group">
              <div>
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Vales Adiantados</p>
                <h3 className="text-2xl font-black text-amber-800 mt-2">
                  R$ {aggregatedTotals.vales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-[11px] text-amber-700/80 font-semibold mt-4 pt-4 border-t border-slate-100 flex items-center gap-1">
                <Wallet size={12} className="text-amber-600" /> Retirados no período escolhido
              </div>
            </div>

            <div className="bg-slate-950 text-white rounded-[2rem] p-6 shadow-md flex flex-col justify-between relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo Geral a Pagar</p>
                <h3 className="text-2xl font-black text-white mt-2">
                  R$ {aggregatedTotals.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </h3>
              </div>
              <div className="text-[11px] text-slate-300 font-semibold mt-4 pt-4 border-t border-white/10 flex items-center gap-1">
                <DollarSign size={12} className="text-emerald-400" /> Total acumulado pendente atual
              </div>
            </div>
          </div>

          {/* Clean Professional Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSummaries.map((pro, index) => {
              const hasBalance = pro.balance > 0;
              const hasVales = pro.vales > 0;

              return (
                <motion.div 
                  key={`pro-summ-${pro.id || pro.uid || index}-${index}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="bg-white border border-slate-200/80 rounded-[2rem] p-6 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all flex flex-col justify-between relative group"
                >
                  {/* Top section: Barber profile header */}
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 bg-slate-950 text-white rounded-2xl flex items-center justify-center font-black text-sm tracking-wider shadow-sm transition-transform group-hover:scale-105 duration-300">
                          {getInitials(pro.nome)}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-primary text-base leading-tight">{pro.nome}</h4>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Parceiro</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => setSelectedProId(pro.id)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-full transition-all"
                        title="Ver extrato completo"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    {/* Breakdown List */}
                    <div className="space-y-3 mb-6">
                      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Produção do Período</span>
                        <span className="text-sm font-bold text-slate-700">R$ {pro.production.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Comissão Gerada</span>
                        <span className="text-sm font-black text-emerald-600">R$ {pro.commissionGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>

                      <div className="flex justify-between items-center py-2.5 border-b border-slate-100">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vales Retirados</span>
                        <span className={`text-sm font-bold ${hasVales ? 'text-amber-700' : 'text-slate-400'}`}>
                          R$ {pro.vales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Net Balance Highlight & Actions */}
                  <div>
                    {/* Highlight Box for Balance */}
                    <div className={`p-4 rounded-2xl border mb-5 flex items-center justify-between ${
                      pro.balance > 0 
                        ? 'bg-emerald-50/50 border-emerald-100/60' 
                        : pro.balance < 0 
                          ? 'bg-rose-50/50 border-rose-100/60' 
                          : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Saldo Pendente Atual</p>
                        <p className={`text-base font-black mt-1 ${
                          pro.balance > 0 
                            ? 'text-emerald-700' 
                            : pro.balance < 0 
                              ? 'text-rose-700' 
                              : 'text-slate-500'
                        }`}>
                          R$ {pro.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        pro.balance > 0 
                          ? 'bg-emerald-100/60 text-emerald-700' 
                          : pro.balance < 0 
                            ? 'bg-rose-100/60 text-rose-700' 
                            : 'bg-slate-200/50 text-slate-500'
                      }`}>
                        {pro.balance > 0 ? <TrendingUp size={14} /> : <Wallet size={14} />}
                      </div>
                    </div>

                    {/* Compact, clean, professional actions */}
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => {
                          setValePro(pro);
                          setIsValeModalOpen(true);
                        }}
                        className="py-3 bg-slate-50 hover:bg-amber-50/60 text-amber-700 border border-slate-150 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <Wallet size={14} />
                        Lançar Vale
                      </button>
                      <button 
                        onClick={() => setSelectedProId(pro.id)}
                        className="py-3 bg-slate-950 text-white hover:bg-slate-800 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 active:scale-95 shadow-sm shadow-slate-950/10"
                      >
                        Extrato
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {filteredSummaries.length === 0 && (
              <div className="col-span-full py-24 bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200/60 flex flex-col items-center justify-center gap-4">
                <Users size={40} className="text-slate-300" />
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest text-center">Nenhum parceiro encontrado no período.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Vales Modal */}
      <AnimatePresence>
        {isValeModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-700 border border-amber-200/60 shadow-sm">
                    <Wallet size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary leading-tight">Lançar Vale</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Adiantamento de Comissão</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsValeModalOpen(false)} 
                  className="p-2.5 text-muted hover:text-primary hover:bg-slate-100 transition-all bg-white rounded-xl border border-slate-100 shadow-sm min-w-[40px] min-h-[40px] flex items-center justify-center"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Beneficiary */}
                <div className="flex items-center gap-3.5 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-10 h-10 bg-slate-950 text-white rounded-xl flex items-center justify-center font-black text-xs">
                    {valePro ? getInitials(valePro.nome) : 'PR'}
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Profissional Beneficiário</p>
                    <p className="font-extrabold text-primary text-sm mt-0.5">{valePro?.nome}</p>
                  </div>
                </div>

                {/* ORIGEM DO RECURSO */}
                <div className="space-y-2.5">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Origem do Recurso</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setValeData({ ...valeData, source: 'caixa', paymentMethod: 'dinheiro' })}
                      disabled={!isOpenCash}
                      className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                        valeData.source === 'caixa'
                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                      } ${!isOpenCash ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider block">Caixa Diário</span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${isOpenCash ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                          {isOpenCash ? 'Aberto' : 'Fechado'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 leading-tight">Retira do caixa físico de recepção hoje.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setValeData({ ...valeData, source: 'financeiro', paymentMethod: 'pix' })}
                      className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                        valeData.source === 'financeiro'
                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/10'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                      }`}
                    >
                      <div className="flex justify-between items-start w-full">
                        <span className="text-[10px] font-black uppercase tracking-wider block">Geral / Banco</span>
                        <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold uppercase tracking-wide">
                          Gerais
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 leading-tight">Sai das contas gerais por Pix/transferência.</p>
                    </button>
                  </div>
                </div>

                {/* Amount and Method */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Valor do Vale</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input 
                        type="number"
                        placeholder="0,00"
                        value={valeData.amount}
                        onChange={(e) => setValeData({...valeData, amount: e.target.value})}
                        className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl font-bold text-sm text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-slate-300 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Meio de Transação</label>
                    <select
                      value={valeData.paymentMethod}
                      onChange={(e) => setValeData({ ...valeData, paymentMethod: e.target.value })}
                      className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200/80 rounded-xl font-bold text-sm text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-slate-300 transition-all"
                    >
                      {valeData.source === 'caixa' ? (
                        <>
                          <option value="dinheiro">Dinheiro Físico</option>
                          <option value="pix">Pix (no Caixa)</option>
                        </>
                      ) : (
                        <>
                          <option value="pix">Pix (Transferência)</option>
                          <option value="transferencia">Transferência</option>
                          <option value="dinheiro">Dinheiro Geral</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Observação / Motivo</label>
                  <textarea 
                    placeholder="Ex: Adiantamento emergencial para despesas pessoais"
                    value={valeData.description}
                    onChange={(e) => setValeData({...valeData, description: e.target.value})}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-slate-300 transition-all resize-none h-20"
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3 shrink-0">
                <button 
                  onClick={() => setIsValeModalOpen(false)}
                  className="flex-1 py-3 bg-white border border-slate-250 text-slate-650 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleRegisterVale}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-md hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  Registrar Vale
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

