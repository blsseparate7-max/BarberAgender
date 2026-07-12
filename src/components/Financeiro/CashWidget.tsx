import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Unlock, 
  Lock, 
  Loader2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ChevronRight, 
  X,
  CreditCard,
  History,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DailyCash, UserProfile, CashMovement } from '../../types';
import { cashService } from '../../services/cashService';
import { userService } from '../../services/userService';
import { commissionService } from '../../services/commissionService';
import { billService } from '../../services/billService';
import { financialService } from '../../services/financialService';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { parseDate } from '../../lib/utils';
import { toast } from 'sonner';

interface CashWidgetProps {
  onNavigate?: (tabId: string) => void;
}

export function CashWidget({ onNavigate }: CashWidgetProps = {}) {
  const { user, isAdmin, isGerente, profile } = useAuth();
  const [currentCash, setCurrentCash] = useState<DailyCash | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false); // Control visibility of the widget content starting hidden
  
  // Quick Open/Close Modal
  const [showModal, setShowModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [closingBalance, setClosingBalance] = useState<string>('');
  const [closingObservations, setClosingObservations] = useState<string>('');
  const [actionLoading, setActionLoading] = useState(false);

  // New features states: Withdrawals and Professional Vales
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawDescription, setWithdrawDescription] = useState<string>('');

  const [showValeModal, setShowValeModal] = useState(false);
  const [valeAmount, setValeAmount] = useState<string>('');
  const [valeDescription, setValeDescription] = useState<string>('');
  const [selectedBarberId, setSelectedBarberId] = useState<string>('');
  const [deductFromCash, setDeductFromCash] = useState<boolean>(true);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);

  const loadBarbers = async () => {
    try {
      const data = await userService.getAllBarbers();
      setBarbers(data);
    } catch (error) {
      console.error("Erro ao carregar profissionais:", error);
    }
  };

  const handleWithdrawal = async () => {
    if (!currentCash || !user) return;
    const val = parseFloat(withdrawAmount);
    if (isNaN(val) || val <= 0) {
      toast.error("Por favor, informe um valor de retirada válido.");
      return;
    }
    const available = currentCash.expected_balance ?? currentCash.expectedBalance ?? 0;
    if (val > available) {
      toast.error("Saldo insuficiente no caixa para realizar esta retirada!");
      return;
    }
    setActionLoading(true);
    try {
      await cashService.addMovement({
        caixa_id: currentCash.id,
        type: 'sangria',
        category: 'Sangria de Caixa',
        description: withdrawDescription || 'Retirada manual pelo widget de caixa',
        amount: val,
        paymentMethod: 'dinheiro',
        is_receivable: false,
        usuario_id: user.uid,
        usuario_name: profile?.nome || user.displayName || 'Sistema',
        date: new Date().toISOString().split('T')[0]
      });
      setWithdrawAmount('');
      setWithdrawDescription('');
      setShowWithdrawModal(false);
      toast.success("Retirada registrada no caixa!");
    } catch (err: any) {
      console.error("Erro ao registrar retirada:", err);
      toast.error(err?.message || "Erro ao registrar retirada.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVale = async () => {
    if (!currentCash || !user) return;
    if (!selectedBarberId) {
      toast.error("Selecione um profissional.");
      return;
    }
    const val = parseFloat(valeAmount);
    if (isNaN(val) || val <= 0) {
      toast.error("Por favor, informe um valor de vale válido.");
      return;
    }
    
    const available = currentCash.expected_balance ?? currentCash.expectedBalance ?? 0;
    if (deductFromCash && val > available) {
      toast.error("Saldo insuficiente no caixa para pagar este vale do caixa físico!");
      return;
    }

    const selectedBarber = barbers.find(b => b.uid === selectedBarberId);
    if (!selectedBarber) {
      toast.error("Profissional selecionado inválido.");
      return;
    }

    setActionLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // 1. Register Professional Advance (Vale)
      await commissionService.registerAdvance({
        profissional_id: selectedBarberId,
        profissional_name: selectedBarber.nome || 'Profissional',
        amount: val,
        date: todayStr,
        description: valeDescription || 'Vale antecipado',
        status: 'pendente',
        responsible_id: user.uid,
        responsible_name: profile?.nome || user.displayName || 'Sistema'
      });

      // 2. Register Financial Transaction (Always! Because it's an outgoing expense)
      const transactionId = await financialService.createTransaction({
        type: 'expense',
        category: 'Comissões',
        amount: val,
        net_amount: val,
        fee_amount: 0,
        paymentMethod: deductFromCash ? 'dinheiro' : 'pix',
        date: todayStr,
        settlement_date: todayStr,
        status: 'pago',
        is_settled: true,
        responsavel_id: user.uid,
        responsavel_name: profile?.nome || user.displayName || 'Sistema',
        description: `Vale p/ ${selectedBarber.nome || 'Profissional'} (${valeDescription || 'Adiantamento'})`
      });

      // 3. Register as a Paid Payable Bill to keep the financial ledger & bill reports 100% complete
      await billService.createPayable({
        description: `Vale: ${selectedBarber.nome || 'Profissional'} - ${valeDescription || 'Adiantamento'}`,
        category: 'Comissões',
        amount: val,
        dueDate: todayStr,
        supplier: selectedBarber.nome || 'Profissional',
        recurrence: 'none',
        status: 'paid',
        paidAt: new Date().toISOString() as any,
        paymentMethod: deductFromCash ? 'dinheiro' : 'pix',
        transactionId
      });

      // 4. Register Cash Movement if requested
      if (deductFromCash) {
        await cashService.addMovement({
          caixa_id: currentCash.id,
          type: 'expense',
          category: 'Adiantamento de Comissão',
          description: `Vale pago ao profissional ${selectedBarber.nome || 'Profissional'}: ${valeDescription || 'Adiantamento'}`,
          amount: val,
          paymentMethod: 'dinheiro',
          is_receivable: false,
          usuario_id: user.uid,
          usuario_name: profile?.nome || user.displayName || 'Sistema',
          date: todayStr
        });
      }

      setValeAmount('');
      setValeDescription('');
      setSelectedBarberId('');
      setShowValeModal(false);
      toast.success("Vale registrado com sucesso!");
    } catch (err: any) {
      console.error("Erro ao registrar vale:", err);
      toast.error(err?.message || "Erro ao registrar vale.");
    } finally {
      setActionLoading(false);
    }
  };

  useEffect(() => {
    // Subscribe to Cash Status
    const unsubscribe = cashService.subscribeToCurrentCash((cash) => {
      setCurrentCash(cash);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // When currentCash changes, subscribe to its movements
  useEffect(() => {
    if (!currentCash?.id) {
      setMovements([]);
      return;
    }

    const unsubscribeMovements = cashService.subscribeToMovementsByCashId(currentCash.id, (movs) => {
      // Sort movements descending by createdAt to show latest first
      const sortedMovs = [...movs].sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA; // Latest first
      });
      setMovements(sortedMovs);
    });

    return () => unsubscribeMovements();
  }, [currentCash?.id]);

  const handleOpenCash = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await cashService.openCash({
        opening_balance: parseFloat(openingBalance),
        userId: user.uid,
        userName: user.displayName || 'Sistema'
      });
      setShowModal(false);
      toast.success("Caixa aberto com sucesso!");
    } catch (error: any) {
      console.error("Erro ao abrir caixa:", error);
      toast.error(error?.message || "Erro ao abrir o caixa.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloseCash = async () => {
    if (!currentCash || !user) return;
    const finalBalance = parseFloat(closingBalance);
    if (isNaN(finalBalance)) {
      toast.error("Por favor, digite um valor numérico válido para o fechamento.");
      return;
    }
    setActionLoading(true);
    try {
      await cashService.closeCash(currentCash.id, {
        actual_balance: finalBalance,
        userId: user.uid,
        userName: user.displayName || 'Sistema',
        observations: closingObservations
      });
      setShowCloseModal(false);
      setClosingBalance('');
      setClosingObservations('');
      toast.success("Caixa fechado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao fechar caixa:", error);
      toast.error(error?.message || "Erro ao fechar o caixa.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAdmin && !isGerente) return null;

  // Calculate dynamic payment method breakdown for active income entries
  const methodBreakdown = movements.reduce((acc, mov) => {
    if (mov.type !== 'income') return acc;
    const methodStr = (mov.paymentMethod || 'Outros').toLowerCase();
    
    let label = 'Outros';
    if (methodStr === 'dinheiro' || methodStr === 'money' || methodStr === 'especie') label = 'Dinheiro';
    else if (methodStr === 'pix') label = 'Pix';
    else if (methodStr === 'credito' || methodStr === 'crédito') label = 'Cartão de Crédito';
    else if (methodStr === 'debito' || methodStr === 'débito') label = 'Cartão de Débito';
    else if (methodStr === 'fiado') label = 'Fiado';
    else label = mov.paymentMethod || 'Outros';

    acc[label] = (acc[label] || 0) + mov.amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="relative">
      {/* Toggle Button */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-primary text-white rounded-2xl shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
        >
          <Receipt size={24} />
          {currentCash && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-40 w-full max-w-[340px] bg-white border border-slate-200 rounded-[2rem] shadow-2xl shadow-primary/20 overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${currentCash ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                  {currentCash ? <Unlock size={16} /> : <Lock size={16} />}
                </div>
                <div>
                  <h3 className="text-xs font-black text-primary uppercase tracking-widest">Caixa do Dia</h3>
                  <p className="text-[10px] text-muted font-bold">{format(new Date(), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-muted hover:text-primary transition-colors hover:bg-white rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              {loading ? (
                <div className="py-10 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="animate-spin text-accent" size={24} />
                  <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Sincronizando...</p>
                </div>
              ) : currentCash ? (
                 <div className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <p className="text-[9px] font-black text-muted uppercase tracking-widest">Saldo Inicial</p>
                       <p className="text-sm font-black text-primary">R$ {(currentCash.opening_balance ?? currentCash.openingBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                     </div>
                     <div className="space-y-1 text-right">
                       <p className="text-[9px] font-black text-muted uppercase tracking-widest">Disponível em Caixa</p>
                       <p className="text-sm font-black text-emerald-600">R$ {(currentCash.expected_balance ?? currentCash.expectedBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                     </div>
                   </div>
 
                   <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 shadow-inner">
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-muted flex items-center gap-1.5">
                         <TrendingUp size={12} className="text-emerald-500" />
                         Entradas Imediatas (Dinheiro/Pix)
                       </span>
                       <span className="text-[11px] font-black text-emerald-600">+ R$ {(currentCash.total_income ?? currentCash.totalIncome ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-[10px] font-bold text-muted flex items-center gap-1.5">
                         <TrendingDown size={12} className="text-red-500" />
                         Saídas (Despesas/Sangrias)
                       </span>
                       <span className="text-[11px] font-black text-red-600">- R$ {((currentCash.total_expense ?? currentCash.totalExpense ?? 0) + (currentCash.total_sangria ?? currentCash.totalSangria ?? 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                     </div>
                     {true && (
                       <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                         <span className="text-[10px] font-bold text-muted flex items-center gap-1.5">
                           <CreditCard size={12} className="text-blue-500" />
                           A Receber amanhã (D+1+)
                         </span>
                         <span className="text-[11px] font-black text-blue-600">R$ {(currentCash.total_receivables ?? currentCash.totalReceivables ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {Object.keys(methodBreakdown).length > 0 && (
                        <div className="pt-2 border-t border-slate-200/40 space-y-1 mt-2">
                          <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-1 font-bold text-slate-400">Detalhamento por Meio</p>
                          {Object.entries(methodBreakdown).map(([method, val]) => (
                            <div key={method} className="flex justify-between items-center text-[10px] text-slate-600 font-semibold pl-1.5 border-l border-slate-300">
                              <span className="capitalize">{method}</span>
                              <span className="font-bold text-slate-800">R$ {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(val as number)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/*
                       </div>
                     )}
                   </div>

                    */}
                    </div>

                    {/* Ações Rápidas de Saída: Retirada e Vale */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
                      <button 
                        type="button"
                        onClick={() => setShowWithdrawModal(true)}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-red-500/10"
                      >
                        <TrendingDown size={14} className="shrink-0" />
                        Retirada (Sangria)
                      </button>
                      <button 
                        type="button"
                        onClick={() => {
                          loadBarbers();
                          setShowValeModal(true);
                        }}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-sm shadow-amber-500/10"
                      >
                        <Wallet size={14} className="shrink-0" />
                        Lançar Vale
                      </button>
                    </div>

                    {/* Live Extrato/Movimentações Section */}
                   <div className="space-y-3 pt-3 border-t border-slate-100">
                     <div className="flex items-center justify-between">
                       <span className="text-[10px] font-black text-muted uppercase tracking-widest flex items-center gap-1.5">
                         <History size={12} className="text-primary/60" />
                         Histórico de Movimentos
                       </span>
                       <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                         {movements.length} {movements.length === 1 ? 'item' : 'itens'}
                       </span>
                     </div>

                     {movements.length === 0 ? (
                       <div className="py-6 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                         <p className="text-[10px] text-muted font-bold">Nenhum movimento registrado hoje</p>
                       </div>
                     ) : (
                       <div className="max-h-[140px] overflow-y-auto pr-1 space-y-2 prose-xs scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                         {movements.map((m, idx) => {
                           let badgeColor = '';
                           let amountPrefix = '';
                           let typeLabel = '';

                           switch (m.type) {
                             case 'income':
                               badgeColor = m.is_receivable ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100';
                               amountPrefix = '+';
                               typeLabel = m.is_receivable ? 'A Receber' : 'Receita';
                               break;
                             case 'expense':
                               badgeColor = 'bg-rose-50 text-rose-600 border border-rose-100';
                               amountPrefix = '-';
                               typeLabel = 'Saída';
                               break;
                             case 'sangria':
                               badgeColor = 'bg-amber-50 text-amber-600 border border-amber-100';
                               amountPrefix = '-';
                               typeLabel = 'Sangria';
                               break;
                             case 'reforco':
                               badgeColor = 'bg-violet-50 text-violet-600 border border-violet-100';
                               amountPrefix = '+';
                               typeLabel = 'Reforço';
                               break;
                           }

                           const formattedTime = m.createdAt && m.createdAt.seconds
                             ? format(new Date(m.createdAt.seconds * 1000), 'HH:mm')
                             : '--:--';

                           return (
                             <div key={`widget-mov-${m.id || idx}-${idx}`} className="flex items-center justify-between p-2.5 bg-white border border-slate-100 hover:border-slate-200 rounded-xl shadow-sm transition-all">
                               <div className="flex items-center gap-2 min-w-0">
                                 <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ${badgeColor}`}>
                                   {typeLabel}
                                 </span>
                                 <div className="min-w-0">
                                   <p className="text-[10px] font-bold text-primary truncate leading-tight pr-1" title={m.description}>
                                     {m.description || m.category}
                                   </p>
                                   <p className="text-[8px] text-muted font-semibold mt-0.5">
                                     {formattedTime} • {m.usuario_name || 'Sistema'}
                                   </p>
                                 </div>
                               </div>
                               <span className={`text-[10px] font-black shrink-0 ${
                                 amountPrefix === '+' 
                                   ? (m.is_receivable ? 'text-blue-600' : 'text-emerald-600') 
                                   : 'text-rose-600'
                               }`}>
                                 {amountPrefix}R$ {m.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                               </span>
                             </div>
                           );
                         })}
                       </div>
                     )}
                   </div>

                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={() => onNavigate ? onNavigate('financeiro-caixa') : window.location.href = '#financeiro-caixa'}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-primary rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95"
                    >
                      Detalhes
                    </button>
                    <button 
                      onClick={() => {
                        const balance = currentCash.expected_balance ?? currentCash.expectedBalance ?? 0;
                        setClosingBalance(balance.toString());
                        setShowCloseModal(true);
                      }}
                      className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95"
                    >
                      Fechar Caixa
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-5">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto border border-slate-100 shadow-inner">
                    <History size={28} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-primary">Caixa Fechado</p>
                    <p className="text-[10px] text-muted font-medium mt-1">É necessário abrir o caixa para operar.</p>
                  </div>
                  <button 
                    onClick={() => setShowModal(true)}
                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
                  >
                    Abrir Caixa Corretamente
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Open Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 border border-emerald-200 shadow-sm">
                    <TrendingUp size={20} />
                  </div>
                  <h3 className="text-xl font-black text-primary">Abrir Caixa</h3>
                </div>
                <button onClick={() => setShowModal(false)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Saldo de Abertura (Em Dinheiro)</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-emerald-500 font-black">R$</span>
                    <input 
                      type="number"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-14 pr-6 text-2xl font-black text-primary focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all shadow-inner"
                      placeholder="0,00"
                    />
                  </div>
                  <p className="text-[10px] text-muted font-medium px-1 leading-relaxed">
                    <AlertCircle size={10} className="inline mr-1 text-amber-500" />
                    Informe o valor físico disponível na gaveta no início do dia.
                  </p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-5 border border-slate-200 rounded-[1.5rem] font-bold text-sm text-muted hover:bg-slate-50 transition-all"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleOpenCash}
                    disabled={actionLoading}
                    className="flex-[2] py-5 bg-emerald-500 text-white rounded-[1.5rem] font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={20} /> : 'Abrir Agora'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Close Modal */}
      <AnimatePresence>
        {showCloseModal && currentCash && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100/80 rounded-2xl flex items-center justify-center text-rose-600 border border-rose-200 shadow-sm">
                    <Lock size={20} />
                  </div>
                  <h3 className="text-xl font-black text-primary">Fechar Caixa</h3>
                </div>
                <button onClick={() => setShowCloseModal(false)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-1">
                  <div className="flex justify-between text-muted">
                    <span>Saldo de Abertura:</span>
                    <span className="font-bold text-slate-700">R$ {(currentCash.opening_balance ?? currentCash.openingBalance ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Total de Entradas:</span>
                    <span className="font-bold text-emerald-650">+R$ {(currentCash.total_income ?? currentCash.totalIncome ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Total de Saídas:</span>
                    <span className="font-bold text-rose-650">-R$ {((currentCash.total_expense ?? currentCash.totalExpense ?? 0) + (currentCash.total_sangria ?? currentCash.totalSangria ?? 0)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-primary font-black border-t border-slate-200/60 pt-2 mt-1">
                    <span>Saldo Esperado (Sistema):</span>
                    <span>R$ {(currentCash.expected_balance ?? currentCash.expectedBalance ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Saldo Real em Caixa (Gaveta)</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-primary font-black">R$</span>
                    <input 
                      type="number"
                      value={closingBalance}
                      onChange={(e) => setClosingBalance(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-14 pr-6 text-2xl font-black text-primary focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all shadow-inner"
                      placeholder="0,00"
                    />
                  </div>
                  
                  {/* Difference display */}
                  {closingBalance !== '' && !isNaN(parseFloat(closingBalance)) && (() => {
                    const expected = currentCash.expected_balance ?? currentCash.expectedBalance ?? 0;
                    const val = parseFloat(closingBalance) - expected;
                    if (Math.abs(val) < 0.01) {
                      return (
                        <p className="text-[10px] text-emerald-650 font-black px-1">
                          ✓ Tudo certo! Saldo bate perfeitamente com o sistema.
                        </p>
                      );
                    } else if (val < 0) {
                      return (
                        <p className="text-[10px] text-rose-655 font-black px-1">
                          ⚠ Diferença: Falta R$ {Math.abs(val).toFixed(2)} na gaveta!
                        </p>
                      );
                    } else {
                      return (
                        <p className="text-[10px] text-blue-650 font-black px-1">
                          ⚠ Diferença: Sobrando R$ {val.toFixed(2)} na gaveta!
                        </p>
                      );
                    }
                  })()}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Observações do Fechamento</label>
                  <textarea 
                    value={closingObservations}
                    onChange={(e) => setClosingObservations(e.target.value)}
                    placeholder="Alguma divergência ou anotação opcional..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all h-20 resize-none shadow-inner"
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    onClick={() => setShowCloseModal(false)}
                    className="flex-1 py-5 border border-slate-200 rounded-[1.5rem] font-bold text-sm text-muted hover:bg-slate-50 transition-all"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleCloseCash}
                    disabled={actionLoading}
                    className="flex-[2] py-5 bg-rose-500 text-white rounded-[1.5rem] font-bold text-sm hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={20} /> : 'Concluir Fechamento'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Withdrawal Modal */}
      <AnimatePresence>
        {showWithdrawModal && currentCash && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 w-full max-w-sm max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 border border-rose-200 shadow-sm">
                    <TrendingDown size={20} />
                  </div>
                  <h3 className="text-lg font-black text-primary">Retirada (Sangria)</h3>
                </div>
                <button 
                  onClick={() => setShowWithdrawModal(false)} 
                  className="p-2.5 text-muted hover:text-primary hover:bg-slate-100 transition-all bg-white rounded-xl border border-slate-100 shadow-sm min-w-[40px] min-h-[40px] flex items-center justify-center"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Valor da Retirada</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-rose-500 font-black">R$</span>
                    <input 
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-14 pr-6 text-2xl font-black text-primary focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 transition-all shadow-inner"
                      placeholder="0,00"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium px-1">
                    Saldo disponível em caixa: R$ {(currentCash.expected_balance ?? currentCash.expectedBalance ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Descrição / Motivo</label>
                  <input 
                    type="text"
                    value={withdrawDescription}
                    onChange={(e) => setWithdrawDescription(e.target.value)}
                    placeholder="Ex: Compra de café, suprimentos..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all shadow-inner"
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowWithdrawModal(false)}
                    className="flex-1 py-4 border border-slate-200 rounded-[1.25rem] font-bold text-xs uppercase tracking-widest text-muted hover:bg-slate-50 transition-all"
                  >
                    Voltar
                  </button>
                  <button 
                    type="button"
                    onClick={handleWithdrawal}
                    disabled={actionLoading}
                    className="flex-[2] py-4 bg-rose-500 text-white rounded-[1.25rem] font-bold text-xs uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Vale (Advance) Modal */}
      <AnimatePresence>
        {showValeModal && currentCash && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-slate-200 w-full max-w-sm max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 border border-amber-200 shadow-sm">
                    <Wallet size={20} />
                  </div>
                  <h3 className="text-lg font-black text-primary">Lançar Vale</h3>
                </div>
                <button 
                  onClick={() => setShowValeModal(false)} 
                  className="p-2.5 text-muted hover:text-primary hover:bg-slate-100 transition-all bg-white rounded-xl border border-slate-100 shadow-sm min-w-[40px] min-h-[40px] flex items-center justify-center"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Profissional</label>
                  <select
                    value={selectedBarberId}
                    onChange={(e) => setSelectedBarberId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-150 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all shadow-sm"
                  >
                    <option value="">Selecione um profissional...</option>
                    {barbers.map(b => (
                      <option key={b.uid} value={b.uid}>
                        {b.nome || b.displayName || 'Profissional'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Valor do Vale</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-amber-500 font-black">R$</span>
                    <input 
                      type="number"
                      value={valeAmount}
                      onChange={(e) => setValeAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-3xl py-6 pl-14 pr-6 text-2xl font-black text-primary focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all shadow-inner"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Descrição / Observação</label>
                  <input 
                    type="text"
                    value={valeDescription}
                    onChange={(e) => setValeDescription(e.target.value)}
                    placeholder="Ex: Adiantamento semanal..."
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary transition-all shadow-inner"
                  />
                </div>

                {/* Toggle to deduct from Cash Drawer */}
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200/60 select-none">
                  <input 
                    type="checkbox"
                    id="deductFromCashCheckbox"
                    checked={deductFromCash}
                    onChange={(e) => setDeductFromCash(e.target.checked)}
                    className="mt-1 h-4.5 w-4.5 text-primary focus:ring-primary rounded border-slate-300 accent-primary"
                  />
                  <label htmlFor="deductFromCashCheckbox" className="cursor-pointer">
                    <p className="text-xs font-black text-slate-800 leading-tight">Retirar do Caixa de Hoje (Gaveta)</p>
                    <p className="text-[10px] text-muted font-medium mt-1 leading-normal">
                      Ative se o dinheiro do vale estiver saindo fisicamente da gaveta do caixa de hoje. 
                      Se desativado (PIX, etc.), o vale será registrado na conta do barbeiro sem alterar o caixa diário.
                    </p>
                  </label>
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowValeModal(false)}
                    className="flex-1 py-4 border border-slate-200 rounded-[1.25rem] font-bold text-xs uppercase tracking-widest text-muted hover:bg-slate-50 transition-all"
                  >
                    Voltar
                  </button>
                  <button 
                    type="button"
                    onClick={handleVale}
                    disabled={actionLoading}
                    className="flex-[2] py-4 bg-amber-500 text-white rounded-[1.25rem] font-bold text-xs uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : 'Registrar Vale'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
