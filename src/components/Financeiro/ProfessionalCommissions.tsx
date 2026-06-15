
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
  Loader2
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

    const unsubCash = onSnapshot(collection(db, 'caixa_diario'), (snapshot) => {
      const openCash = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find((c: any) => c.status === 'open');
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
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Buscar profissional..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-100/80 border border-slate-200/50 rounded-xl px-4 py-2 shadow-sm text-xs font-semibold text-primary">
            <Calendar className="text-slate-500" size={14} />
            <span>Período: <strong className="font-extrabold">{format(new Date(dateRange.start + 'T00:00:00'), 'dd/MM/yyyy')}</strong> até <strong className="font-extrabold">{format(new Date(dateRange.end + 'T00:00:00'), 'dd/MM/yyyy')}</strong></span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-primary" size={40} />
          <p className="text-muted text-sm font-medium">Consolidando financeiros...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSummaries.map((pro, index) => (
            <motion.div 
              key={`pro-summ-${pro.id || pro.uid || index}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-500">
                    <Users size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-primary">{pro.nome}</h4>
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">Barbeiro</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedProId(pro.id)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <ChevronRight size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="space-y-4 mb-6">
                {/* Produção / Comissão */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Produção / Comissão</p>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-xs text-slate-500 font-semibold">Prod:</span>
                      <span className="font-extrabold text-sm text-primary">R$ {pro.production.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-slate-300 font-medium font-mono">/</span>
                      <span className="text-xs text-emerald-600 font-bold">Comissão:</span>
                      <span className="font-black text-sm text-emerald-700">R$ {pro.commissionGenerated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-xs">
                    %
                  </div>
                </div>

                {/* Vale / Saldo a Receber */}
                <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-100 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-amber-800/80 uppercase tracking-widest mb-1.5">Vale / Saldo a Receber</p>
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-xs text-amber-700 font-semibold">Vale:</span>
                      <span className="font-bold text-sm text-amber-800">R$ {pro.vales.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-amber-300 font-medium font-mono">/</span>
                      <span className="text-xs text-primary font-bold">Saldo:</span>
                      <span className={`font-black text-sm ${pro.balance > 0 ? 'text-primary' : 'text-slate-500'}`}>R$ {pro.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Wallet size={15} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setValePro(pro);
                    setIsValeModalOpen(true);
                  }}
                  className="py-2.5 bg-white border border-slate-200 text-amber-600 rounded-xl text-xs font-bold hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                >
                  <DollarSign size={14} />
                  Adiantar Vale
                </button>
                <button 
                  onClick={() => setSelectedProId(pro.id)}
                  className="py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowRight size={14} />
                  Ver Detalhes
                </button>
              </div>
            </motion.div>
          ))}

          {filteredSummaries.length === 0 && (
            <div className="col-span-full py-20 bg-slate-50/50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-4">
              <Users size={48} className="text-slate-200" />
              <p className="text-sm text-muted font-medium">Nenhum profissional encontrado no período.</p>
            </div>
          )}
        </div>
      )}

      {/* Vales Modal */}
      <AnimatePresence>
        {isValeModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsValeModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 pb-4 max-h-[80vh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-black text-primary">Lançar Vale (Adiantamento)</h3>
                  <button onClick={() => setIsValeModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all text-slate-400">
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>

                <div className="space-y-5">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center">
                      <Users size={24} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted">Beneficiário</p>
                      <p className="font-black text-primary">{valePro?.nome}</p>
                    </div>
                  </div>

                  {/* ORIGEM DO RECURSO (NEW FEATURE REQUESTED BY USER) */}
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Origem do Recurso</label>
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
                          <span className="text-xs font-black uppercase tracking-wider block">Caixa Diário</span>
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${isOpenCash ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                            {isOpenCash ? 'Aberto' : 'Fechado'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">Retira do caixa físico da recepção hoje e diminui o dinheiro da gaveta.</p>
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
                          <span className="text-xs font-black uppercase tracking-wider block">Geral / Banco</span>
                          <span className="text-[8px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold uppercase tracking-wide">
                            Contas Gerais
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">Sai das contas da empresa (ex: Pix/banco). Não mexe na gaveta de hoje.</p>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-primary ml-1">Valor do Vale</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="number"
                          placeholder="0,00"
                          value={valeData.amount}
                          onChange={(e) => setValeData({...valeData, amount: e.target.value})}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-black text-base text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-primary ml-1">Meio de Transação</label>
                      <select
                        value={valeData.paymentMethod}
                        onChange={(e) => setValeData({ ...valeData, paymentMethod: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all"
                      >
                        {valeData.source === 'caixa' ? (
                          <>
                            <option value="dinheiro">Dinheiro (Físico em Espécie)</option>
                            <option value="pix">Pix (Registrado no Caixa)</option>
                          </>
                        ) : (
                          <>
                            <option value="pix">Pix (Transferência Instantânea)</option>
                            <option value="transferencia">Transferência TED/DOC</option>
                            <option value="dinheiro">Dinheiro (Retirada Bancária)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-primary ml-1">Observação / Motivo</label>
                    <textarea 
                      placeholder="Ex: Adiantamento para despesas pessoais ou vale emergência"
                      value={valeData.description}
                      onChange={(e) => setValeData({...valeData, description: e.target.value})}
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all resize-none h-20"
                    />
                  </div>
                </div>
              </div>

              <div className="p-8 pt-4 flex gap-3 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => setIsValeModalOpen(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-100 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleRegisterVale}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  Confirmar e Registrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

