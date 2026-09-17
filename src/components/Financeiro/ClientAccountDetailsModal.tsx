import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc,
  setDoc,
  updateDoc,
  increment,
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../../firebase';
import { ClientDebt, DebtPayment, PaymentMethodConfig, DailyCash } from '../../types';
import { userService } from '../../services/userService';
import { debtService } from '../../services/debtService';
import { comandaService } from '../../services/comandaService';
import { cashService } from '../../services/cashService';
import { paymentMethodService } from '../../services/paymentMethodService';
import { getActiveTenantId } from '../../services/tenantService';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  User, 
  X, 
  DollarSign, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Loader2,
  Printer,
  Receipt,
  PlusCircle,
  ArrowDownRight,
  ArrowUpRight,
  Edit3,
  RotateCcw,
  FileText,
  AlertTriangle,
  MessageSquare,
  Calendar,
  SlidersHorizontal,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function ClientAccountDetailsModal({ 
  cliente_id, 
  onClose, 
  onPaymentSuccess,
  paymentMethods = []
}: { 
  cliente_id: string; 
  onClose: () => void; 
  onPaymentSuccess?: () => void;
  paymentMethods?: PaymentMethodConfig[];
}) {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const [currentCash, setCurrentCash] = useState<DailyCash | null>(null);
  const [client, setClient] = useState<any>(null);
  const [debts, setDebts] = useState<ClientDebt[]>([]);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteVal, setNewNoteVal] = useState('');
  const [newNoteType, setNewNoteType] = useState<'neutral' | 'credit' | 'debit'>('neutral');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = cashService.subscribeToCurrentCash((cash) => {
      setCurrentCash(cash);
    });
    return () => unsub();
  }, []);
  const [activeTab, setActiveTab] = useState<'debts' | 'payments' | 'notes'>('debts');
  const [isPaying, setIsPaying] = useState(false);
  const [isGlobalPaymentModalOpen, setIsGlobalPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedDebt, setSelectedDebt] = useState<ClientDebt | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [isClearingDebts, setIsClearingDebts] = useState(false);
  const [loadedMethods, setLoadedMethods] = useState<PaymentMethodConfig[]>(paymentMethods);
  const [showPrintStatement, setShowPrintStatement] = useState(false);
  const [showAddDebtForm, setShowAddDebtForm] = useState(false);
  const [newDebtAmount, setNewDebtAmount] = useState('');
  const [newDebtDesc, setNewDebtDesc] = useState('');
  const [newDebtDueDate, setNewDebtDueDate] = useState('');
  const [submittingNewDebt, setSubmittingNewDebt] = useState(false);
  
  const [editingDebt, setEditingDebt] = useState<ClientDebt | null>(null);
  const [editDebtAmount, setEditDebtAmount] = useState('');
  const [editDebtDesc, setEditDebtDesc] = useState('');
  const [submittingEditDebt, setSubmittingEditDebt] = useState(false);
  const [receiptPayment, setReceiptPayment] = useState<DebtPayment | null>(null);
  const [isRevertingPayment, setIsRevertingPayment] = useState(false);

  // Correction Modal State (Zero impact on daily cash)
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionType, setCorrectionType] = useState<'increase' | 'decrease'>('decrease');
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const handleApplyCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(correctionAmount);
    if (isNaN(val) || val <= 0) {
      toast.error('Informe um valor válido para a correção.');
      return;
    }
    if (!correctionReason.trim()) {
      toast.error('O motivo da correção é obrigatório.');
      return;
    }

    setSubmittingCorrection(true);
    try {
      const currentOpen = client?.total_em_aberto || 0;
      const currentBal = client?.saldo_atual ?? client?.balance ?? 0;
      const authorName = user?.displayName || 'Admin';
      const timestampStr = format(new Date(), 'dd/MM/yyyy HH:mm');

      if (correctionType === 'increase') {
        // Aumentar Fiado (Add debt record and increase total_em_aberto)
        const debtRef = collection(db, 'client_debts');
        const newDebtId = doc(debtRef).id;
        const noteText = `[CORREÇÃO / AJUSTE] +R$ ${val.toFixed(2)} - ${correctionReason.trim()} (por ${authorName})`;

        await setDoc(doc(db, 'client_debts', newDebtId), {
          id: newDebtId,
          cliente_id,
          cliente_name: client?.nome || 'Cliente',
          amount: val,
          remainingAmount: val,
          status: 'pendente',
          description: noteText,
          date: format(new Date(), 'yyyy-MM-dd'),
          tenantId: getActiveTenantId(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Add ledger note
        await addDoc(collection(db, 'client_ledger_notes'), {
          cliente_id,
          text: `[CORREÇÃO DE SALDO (+ R$ ${val.toFixed(2)})]: ${correctionReason.trim()}`,
          type: 'debit',
          value: val,
          createdAt: serverTimestamp(),
          authorName
        });

        const newBal = currentBal - val;
        await updateDoc(doc(db, 'usuarios', cliente_id), {
          total_em_aberto: currentOpen + val,
          balance: newBal,
          saldo_atual: newBal,
          updatedAt: serverTimestamp()
        });

        toast.success(`Correção realizada: R$ ${val.toFixed(2)} adicionados ao fiado do cliente (Sem impacto no Caixa).`);
      } else {
        // Diminuir Fiado / Abater sem caixa (Reduce outstanding debt FIFO)
        const activeDebts = debts.filter(d => !['pago', 'paga', 'quitado', 'cancelado'].includes(d.status) && (d.remainingAmount || 0) > 0.001);
        activeDebts.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return aTime - bTime;
        });

        let remainingToReduce = val;
        for (const debt of activeDebts) {
          if (remainingToReduce <= 0.001) break;
          const debtRem = debt.remainingAmount ?? debt.amount ?? 0;
          const reduceForThis = Math.min(debtRem, remainingToReduce);
          const newRem = debtRem - reduceForThis;

          await updateDoc(doc(db, 'client_debts', debt.id), {
            remainingAmount: newRem,
            status: newRem <= 0.001 ? 'pago' : 'parcial',
            description: `${debt.description || 'Fiado'} (Ajuste/Correção R$ ${reduceForThis.toFixed(2)}: ${correctionReason.trim()})`,
            updatedAt: serverTimestamp()
          });

          remainingToReduce -= reduceForThis;
        }

        // Add ledger note
        await addDoc(collection(db, 'client_ledger_notes'), {
          cliente_id,
          text: `[CORREÇÃO DE SALDO (- R$ ${val.toFixed(2)})]: ${correctionReason.trim()}`,
          type: 'credit',
          value: val,
          createdAt: serverTimestamp(),
          authorName
        });

        const newOpen = Math.max(0, currentOpen - val);
        const newBal = currentBal + val;
        await updateDoc(doc(db, 'usuarios', cliente_id), {
          total_em_aberto: newOpen,
          balance: newBal,
          saldo_atual: newBal,
          updatedAt: serverTimestamp()
        });

        toast.success(`Correção realizada: R$ ${val.toFixed(2)} abatidos do fiado sem movimentar caixa.`);
      }

      setIsCorrectionModalOpen(false);
      setCorrectionAmount('');
      setCorrectionReason('');
      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      console.error("Erro ao aplicar correção de saldo:", err);
      toast.error(err.message || 'Erro ao salvar correção.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const handleSendWhatsAppDebtReminder = (
    clientName: string,
    phone?: string,
    amount?: number,
    dueDate?: string,
    description?: string
  ) => {
    const valStr = (amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const shopName = tenant?.nome || tenant?.name || 'Barbearia';
    
    let msg = `Olá, ${clientName}! Tudo bem? 💈\n\n`;
    msg += `Passando para lembrar referente ao seu saldo pendente de *R$ ${valStr}* em *${shopName}*`;
    if (dueDate) {
      try {
        const formattedDate = format(new Date(dueDate + (dueDate.includes('T') ? '' : 'T12:00:00')), "dd/MM/yyyy");
        msg += ` (Vencimento: ${formattedDate})`;
      } catch {
        msg += ` (Vencimento: ${dueDate})`;
      }
    }
    msg += `.\n`;
    if (description) {
      msg += `\n*Detalhes:* ${description}\n`;
    }
    msg += `\nQualquer dúvida ou para solicitar a chave Pix para acerto, estamos à disposição! ✂️`;

    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
      window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard.writeText(msg);
      toast.success('Cliente sem telefone cadastrado. A mensagem de cobrança foi copiada para a área de transferência!');
    }
  };

  useEffect(() => {
    loadInfo();
  }, [cliente_id]);

  useEffect(() => {
    // If payment methods were not passed via props, load default active payment methods
    if (paymentMethods && paymentMethods.length > 0) {
      setLoadedMethods(paymentMethods);
    } else {
      paymentMethodService.getPaymentMethods()
        .then(methods => {
          if (methods && methods.length > 0) {
            setLoadedMethods(methods);
          }
        })
        .catch(err => console.error("Error loading payment methods:", err));
    }
  }, [paymentMethods]);

  useEffect(() => {
    // Realtime digital notes/ledger listener
    const q = query(
      collection(db, 'client_ledger_notes'),
      where('cliente_id', '==', cliente_id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotes(data);
    }, (error) => {
      console.error("Error fetching client ledger notes:", error);
    });
    return () => unsubscribe();
  }, [cliente_id]);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const [u, d, p] = await Promise.all([
        userService.getUserProfile(cliente_id),
        debtService.getClientDebts(cliente_id),
        debtService.getDebtPaymentsByClient(cliente_id)
      ]);
      setClient(u);
      setDebts(d);
      setPayments(p);
    } catch (error) {
      toast.error("Erro ao carregar dados do cliente");
    } finally {
      setLoading(false);
    }
  };

  const totalOutstanding = debts.reduce((acc, d) => !['pago', 'paga', 'quitado', 'cancelado'].includes(d.status) ? acc + (d.remainingAmount || 0) : acc, 0);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    try {
      const numVal = parseFloat(newNoteVal) || 0;
      await addDoc(collection(db, 'client_ledger_notes'), {
        cliente_id,
        text: newNoteText,
        type: newNoteType,
        value: numVal,
        createdAt: serverTimestamp(),
        authorName: user?.displayName || 'Admin'
      });

      if (numVal > 0) {
        if (newNoteType === 'debit') {
          const debtRef = collection(db, 'client_debts');
          const newDebtId = doc(debtRef).id;
          await setDoc(doc(db, 'client_debts', newDebtId), {
            id: newDebtId,
            cliente_id,
            cliente_name: client?.nome || 'Cliente',
            amount: numVal,
            remainingAmount: numVal,
            status: 'pendente',
            description: newNoteText.trim(),
            date: format(new Date(), 'yyyy-MM-dd'),
            tenantId: getActiveTenantId(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          const currentOpen = client?.total_em_aberto || 0;
          const currentBal = client?.saldo_atual ?? client?.balance ?? 0;
          const newBal = currentBal - numVal;
          await updateDoc(doc(db, 'usuarios', cliente_id), {
            total_em_aberto: currentOpen + numVal,
            balance: newBal,
            saldo_atual: newBal,
            updatedAt: serverTimestamp()
          });
        } else if (newNoteType === 'credit') {
          const currentBal = client?.saldo_atual ?? client?.balance ?? 0;
          const newBal = currentBal + numVal;
          await updateDoc(doc(db, 'usuarios', cliente_id), {
            balance: newBal,
            saldo_atual: newBal,
            updatedAt: serverTimestamp()
          });
        }
      }

      setNewNoteText('');
      setNewNoteVal('');
      setNewNoteType('neutral');
      toast.success("Anotação adicionada ao Caderno Digital!");
      loadInfo();
    } catch (error) {
      toast.error("Erro ao salvar anotação");
    }
  };

  const handleCreateNewDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newDebtAmount);
    if (!val || val <= 0) {
      toast.error("Informe um valor de fiado válido!");
      return;
    }
    if (!newDebtDesc.trim()) {
      toast.error("Informe a descrição do fiado!");
      return;
    }

    setSubmittingNewDebt(true);
    try {
      const debtRef = collection(db, 'client_debts');
      const newDebtId = doc(debtRef).id;
      await setDoc(doc(db, 'client_debts', newDebtId), {
        id: newDebtId,
        cliente_id,
        cliente_name: client?.nome || 'Cliente',
        amount: val,
        remainingAmount: val,
        status: 'pendente',
        description: newDebtDesc.trim(),
        date: format(new Date(), 'yyyy-MM-dd'),
        dueDate: newDebtDueDate || null,
        tenantId: getActiveTenantId(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const currentOpen = client?.total_em_aberto || 0;
      const currentBal = client?.saldo_atual ?? client?.balance ?? 0;
      const newBal = currentBal - val;
      await updateDoc(doc(db, 'usuarios', cliente_id), {
        total_em_aberto: currentOpen + val,
        balance: newBal,
        saldo_atual: newBal,
        updatedAt: serverTimestamp()
      });

      toast.success("Fiado registrado com sucesso!");
      setNewDebtAmount('');
      setNewDebtDesc('');
      setNewDebtDueDate('');
      setShowAddDebtForm(false);
      await loadInfo();
    } catch (err: any) {
      toast.error("Erro ao registrar fiado: " + (err.message || ''));
    } finally {
      setSubmittingNewDebt(false);
    }
  };

  const handlePayment = async () => {
    if (!paymentAmount || !selectedMethod) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Informe um valor de pagamento válido!");
      return;
    }
    
    setIsPaying(true);
    try {
      const method = loadedMethods.find(m => m.id === selectedMethod);
      if (!method) throw new Error("Método de pagamento inválido");

      const result = await debtService.settleClientDebtsGlobal({
        cliente_id,
        divida_id: selectedDebt ? selectedDebt.id : undefined,
        amount,
        paymentMethod: (method.tipo || method.type || 'dinheiro') as any,
        methodId: method.id,
        methodName: method.nome || method.name,
        userId: user?.uid || '',
        userName: user?.displayName || 'Sistema'
      });

      if (result.cashUpdated) {
        toast.success(`Recebimento de R$ ${amount.toFixed(2)} registrado e lançado no Caixa Diário!`);
      } else {
        toast.success(`Recebimento de R$ ${amount.toFixed(2)} registrado na conta do cliente! (Aviso: Caixa Diário fechado)`);
      }

      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
      setSelectedDebt(null);
      setIsGlobalPaymentModalOpen(false);
      setPaymentAmount('');
      setSelectedMethod('');
    } catch (error: any) {
      toast.error(error.message || "Erro ao registrar pagamento");
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancelSingleDebt = async (debt: ClientDebt) => {
    if (!window.confirm(`Deseja realmente cancelar/zerar o fiado de R$ ${debt.remainingAmount.toFixed(2)} do cliente ${client?.nome}?`)) {
      return;
    }
    setIsClearingDebts(true);
    try {
      await debtService.cancelDebt(debt.id, 'Ajuste / Perdão administrativo');
      toast.success("Fiado cancelado/zerado com sucesso!");
      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      toast.error("Erro ao cancelar fiado: " + (err.message || ''));
    } finally {
      setIsClearingDebts(false);
    }
  };

  const handleClearAllDebtsForClient = async () => {
    if (!window.confirm(`Atenção: Deseja zerar TODOS os fiados pendentes e limpar a conta de ${client?.nome}? O saldo ficará R$ 0,00.`)) {
      return;
    }
    setIsClearingDebts(true);
    try {
      await debtService.clearClientDebts(cliente_id, 'Ajuste e quitação administrativa');
      toast.success("Todos os fiados do cliente foram zerados e a conta foi limpa!");
      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      toast.error("Erro ao zerar fiados: " + (err.message || ''));
    } finally {
      setIsClearingDebts(false);
    }
  };

  const handleStartEditDebt = (debt: ClientDebt) => {
    setEditingDebt(debt);
    setEditDebtAmount(debt.amount.toString());
    setEditDebtDesc(debt.description || '');
  };

  const handleSaveEditDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebt) return;
    const newAmount = parseFloat(editDebtAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast.error("Informe um valor válido para o fiado.");
      return;
    }
    setSubmittingEditDebt(true);
    try {
      await debtService.updateDebt(editingDebt.id, newAmount, editDebtDesc);
      toast.success("Fiado atualizado com sucesso!");
      setEditingDebt(null);
      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      toast.error("Erro ao atualizar fiado: " + (err.message || ''));
    } finally {
      setSubmittingEditDebt(false);
    }
  };

  const handleRevertPayment = async (payment: DebtPayment) => {
    const reason = window.prompt(`Deseja realmente ESTORNAR o pagamento de R$ ${payment.amount.toFixed(2)} (${payment.paymentMethod})?\n\nInforme o motivo do estorno:`, 'Lançamento incorreto');
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("Você precisa informar o motivo para autorizar o estorno.");
      return;
    }

    setIsRevertingPayment(true);
    try {
      await debtService.revertPayment(payment.id, reason.trim(), user?.uid || '', user?.displayName || 'Sistema');
      toast.success("Pagamento estornado com sucesso! Dívida e caixa ajustados.");
      await loadInfo();
      if (onPaymentSuccess) onPaymentSuccess();
    } catch (err: any) {
      toast.error("Erro ao estornar pagamento: " + (err.message || ''));
    } finally {
      setIsRevertingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <div className="bg-white p-12 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-sm font-bold text-muted animate-pulse">Carregando conta do cliente...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent/10 text-accent rounded-2xl flex items-center justify-center shadow-sm border border-accent/20">
              <User size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-primary">{client?.nome}</h3>
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Conta Financeira do Cliente (Financeiro)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm cursor-pointer">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Saldo do Cliente</p>
              <p className={`text-xl font-black ${(client?.balance || 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                R$ {(client?.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-3xl space-y-1 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Em Aberto (Fiado)</p>
                <p className="text-xl font-black text-amber-700">
                  R$ {totalOutstanding.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
              {totalOutstanding > 0.001 && (
                <button
                  type="button"
                  onClick={() => handleSendWhatsAppDebtReminder(
                    client?.nome || 'Cliente',
                    client?.phone || client?.telefone,
                    totalOutstanding
                  )}
                  className="mt-2 text-[10px] font-extrabold text-emerald-700 bg-emerald-100/90 hover:bg-emerald-200 px-2.5 py-1 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer w-fit shadow-xs"
                  title="Enviar lembrete de cobrança via WhatsApp"
                >
                  <MessageSquare size={12} />
                  <span>Cobrar WhatsApp</span>
                </button>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Total Gasto</p>
              <p className="text-xl font-black text-primary">
                R$ {(client?.totalSpent || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-1 shadow-sm">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Total Pago</p>
              <p className="text-xl font-black text-primary">
                R$ {(client?.totalPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Modal Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-2">
              <div className="flex gap-6">
                <button 
                  onClick={() => setActiveTab('debts')}
                  className={`pb-2 text-xs font-black uppercase tracking-widest relative transition-all ${
                    activeTab === 'debts' ? 'text-primary' : 'text-muted'
                  }`}
                >
                  Comandas e Dívidas
                  {activeTab === 'debts' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button 
                  onClick={() => setActiveTab('payments')}
                  className={`pb-2 text-xs font-black uppercase tracking-widest relative transition-all ${
                    activeTab === 'payments' ? 'text-primary' : 'text-muted'
                  }`}
                >
                  Histórico de Pagamentos
                  {activeTab === 'payments' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button 
                  onClick={() => setActiveTab('notes')}
                  className={`pb-2 text-xs font-black uppercase tracking-widest relative transition-all ${
                    activeTab === 'notes' ? 'text-primary' : 'text-muted'
                  }`}
                >
                  Caderno de Anotações (Fluxo)
                  {activeTab === 'notes' && <motion.div layoutId="clientModalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {totalOutstanding > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDebt(null);
                      setPaymentAmount(totalOutstanding.toString());
                      setIsGlobalPaymentModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Receber valor total ou parcial abatendo das dívidas do cliente"
                  >
                    <DollarSign size={14} />
                    <span>Quitar / Receber Saldo</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowPrintStatement(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Imprimir / Baixar Extrato de Débitos e Pagamentos"
                >
                  <Printer size={14} />
                  <span>Imprimir Extrato</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(true)}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Ajustar ou corrigir o valor do fiado sem movimentar o caixa (anotação de correção)"
                >
                  <SlidersHorizontal size={14} />
                  <span>Corrigir Saldo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddDebtForm(!showAddDebtForm)}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <PlusCircle size={14} />
                  <span>Registrar Novo Fiado</span>
                </button>

                {totalOutstanding > 0 && (
                  <button
                    type="button"
                    disabled={isClearingDebts}
                    onClick={handleClearAllDebtsForClient}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Limpar todos os fiados pendentes e zerar o saldo do cliente"
                  >
                    <Trash2 size={14} />
                    <span>Zerar Fiados</span>
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'debts' && (
              <div className="space-y-4">
                <AnimatePresence>
                  {showAddDebtForm && (
                    <motion.form 
                      key="add-debt-form"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleCreateNewDebt}
                      className="bg-red-50/70 border border-red-200 p-5 rounded-2xl space-y-4 shadow-sm overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-red-800 tracking-wider flex items-center gap-2">
                          <PlusCircle size={16} />
                          Lançar Novo Fiado / Débito
                        </h4>
                        <button type="button" onClick={() => setShowAddDebtForm(false)} className="text-red-800 hover:text-black">
                          <X size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <label className="text-[10px] font-black text-red-800 block mb-1 uppercase tracking-wider">Descrição do Fiado</label>
                          <input 
                            type="text" 
                            required
                            value={newDebtDesc} 
                            onChange={(e) => setNewDebtDesc(e.target.value)}
                            className="w-full bg-white border border-red-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500" 
                            placeholder="Ex: Cerveja, Pomada, Corte Fiado..."
                            maxLength={50}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-red-800 block mb-1 uppercase tracking-wider">Valor (R$)</label>
                          <input 
                            type="number" 
                            step="0.01" 
                            required
                            value={newDebtAmount} 
                            onChange={(e) => setNewDebtAmount(e.target.value)}
                            className="w-full bg-white border border-red-200 rounded-xl py-2 px-3 text-sm text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500" 
                            placeholder="0,00"
                            min="0.01"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-red-800 block mb-1 uppercase tracking-wider">Vencimento (Opcional)</label>
                          <input 
                            type="date" 
                            value={newDebtDueDate} 
                            onChange={(e) => setNewDebtDueDate(e.target.value)}
                            className="w-full bg-white border border-red-200 rounded-xl py-2 px-3 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-red-500" 
                          />
                        </div>
                      </div>
                      <button 
                        type="submit" 
                        disabled={submittingNewDebt}
                        className="w-full py-2.5 bg-red-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md hover:bg-red-700 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {submittingNewDebt ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        <span>Confirmar Registro de Fiado</span>
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>

                <div className="grid grid-cols-1 gap-4">
                {debts.map((debt, index) => (
                  <div key={`client-debt-${debt.id || index}-${index}`} className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:shadow-md transition-all shadow-sm">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-widest ${
                          debt.status === 'pago' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}>
                          {debt.status === 'pago' ? 'Liquidado' : debt.status === 'parcial' ? 'Parcial' : 'Pendente'}
                        </span>
                        <span className="text-[10px] text-muted font-bold">{debt.date ? format(new Date(debt.date), "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Data N/D'}</span>
                        {debt.dueDate && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200">
                            <Calendar size={10} />
                            Venc: {format(new Date(debt.dueDate + (debt.dueDate.includes('T') ? '' : 'T12:00:00')), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-primary">Comanda #{debt.comanda_id?.substring(0, 8) || 'N/A'}</p>
                      <p className="text-xs text-muted">Original: R$ {debt.amount.toFixed(2)}</p>
                      {debt.description && <p className="text-[11px] text-slate-500 italic">{debt.description}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Saldo Devedor</p>
                        <p className={`text-lg font-black ${debt.status === 'pago' ? 'text-emerald-600' : 'text-red-600'}`}>
                          R$ {debt.remainingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      {debt.status !== 'pago' && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setSelectedDebt(debt);
                              setPaymentAmount(debt.remainingAmount.toString());
                            }}
                            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/10 active:scale-95 cursor-pointer flex items-center gap-1.5"
                          >
                            <DollarSign size={14} />
                            <span>Pagar</span>
                          </button>
                          <button
                            onClick={() => handleSendWhatsAppDebtReminder(
                              client?.nome || 'Cliente',
                              client?.phone || client?.telefone,
                              debt.remainingAmount,
                              debt.dueDate,
                              debt.description || `Comanda #${debt.comanda_id?.substring(0, 8) || ''}`
                            )}
                            className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl transition-all cursor-pointer"
                            title="Enviar lembrete deste fiado no WhatsApp"
                          >
                            <MessageSquare size={16} />
                          </button>
                          <button
                            onClick={() => handleStartEditDebt(debt)}
                            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer"
                            title="Editar valor / descrição deste fiado"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            disabled={isClearingDebts}
                            onClick={() => handleCancelSingleDebt(debt)}
                            className="p-2.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                            title="Cancelar/Zerar este fiado"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {debts.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-muted font-bold italic text-sm">
                    Nenhum fiado registrado para este cliente.
                  </div>
                )}
                </div>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="grid grid-cols-1 gap-4">
                {payments.map((payment, index) => (
                  <div key={`client-pay-${payment.id || index}-${index}`} className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                        payment.status === 'estornado' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {payment.status === 'estornado' ? <RotateCcw size={18} /> : <DollarSign size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-primary">Pagamento de Dívida</p>
                          {payment.status === 'estornado' && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              Estornado
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
                          {payment.paymentMethod} • {payment.date ? format(new Date(payment.date), "dd/MM/yyyy") : 'Data N/D'}
                        </p>
                        {payment.estornadoMotivo && (
                          <p className="text-[10px] text-red-500 italic">Motivo: {payment.estornadoMotivo}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <p className={`text-lg font-black ${payment.status === 'estornado' ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                        + R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setReceiptPayment(payment)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Imprimir Recibo de Pagamento"
                        >
                          <Printer size={13} />
                          <span>Recibo</span>
                        </button>

                        {payment.status !== 'estornado' && (
                          <button
                            type="button"
                            disabled={isRevertingPayment}
                            onClick={() => handleRevertPayment(payment)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                            title="Estornar este pagamento"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-muted font-bold italic text-sm">
                    Nenhum pagamento registrado ainda.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-6">
                <form onSubmit={handleAddNote} className="bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-4">
                  <h4 className="font-bold text-sm text-primary">Escrever nova nota ou ajuste de saldo:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input 
                      type="text"
                      placeholder="Descrição da anotação/evento..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      className="md:col-span-2 bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary font-bold"
                    />
                    <input 
                      type="number"
                      step="0.01"
                      placeholder="Valor opcional (R$)"
                      value={newNoteVal}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setNewNoteVal(e.target.value)}
                      className="bg-white border border-slate-200 rounded-xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent text-primary font-bold"
                    />
                  </div>
                  
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted font-bold uppercase tracking-widest mr-2">Tipo de Impacto:</span>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('neutral')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'neutral' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-muted'}`}
                      >
                        Anotação Simples
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('debit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'debit' ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-slate-200 text-red-500'}`}
                      >
                        Débito (Fiado Avulso)
                      </button>
                      <button 
                        type="button"
                        onClick={() => setNewNoteType('credit')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${newNoteType === 'credit' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-emerald-600'}`}
                      >
                        Crédito (Abono/Entrada)
                      </button>
                    </div>

                    <button 
                      type="submit"
                      className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={14} />
                      Salvar Nota
                    </button>
                  </div>
                </form>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {notes.map((n, index) => (
                    <div key={`ledger-note-${n.id || index}-${index}`} className="bg-white border border-slate-100 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:border-slate-200 transition-all">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800">{n.text}</p>
                        <p className="text-[10px] text-muted font-medium">
                          Por: {n.authorName} • {n.createdAt ? format(new Date(n.createdAt.seconds * 1000), 'dd/MM/yyyy HH:mm') : 'Agora'}
                        </p>
                      </div>
                      <div className="text-right">
                        {n.value > 0 && (
                          <span className={`text-sm font-black px-3 py-1 rounded-lg ${
                            n.type === 'credit' ? 'text-emerald-700 bg-emerald-50' : n.type === 'debit' ? 'text-red-700 bg-red-50' : 'text-slate-600 bg-slate-50'
                          }`}>
                            {n.type === 'credit' ? '+' : n.type === 'debit' ? '-' : ''} R$ {(n.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <div className="text-center py-12 text-muted italic text-xs font-bold bg-slate-50 border border-dashed border-slate-100 rounded-2xl">
                      Caderno de anotações vazio. Escreva sua primeira nota acima.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {(selectedDebt || isGlobalPaymentModalOpen) && (
            <div key="modal-pay-debt-overlay" className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                key="modal-pay-debt-content"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <DollarSign size={18} className="text-emerald-500" />
                      {selectedDebt ? 'Receber Dívida Específica' : 'Receber / Quitar Saldo Geral'}
                    </h4>
                    <p className="text-[10px] text-muted font-bold mt-0.5">
                      {selectedDebt ? `Comanda #${selectedDebt.comanda_id?.substring(0, 8) || 'N/A'}` : `Abater das pendências de ${client?.nome}`}
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedDebt(null);
                      setIsGlobalPaymentModalOpen(false);
                    }} 
                    className="text-muted hover:text-primary cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="p-8 space-y-6">
                  {/* Status do Caixa Diário */}
                  {currentCash ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                      <div className="text-xs">
                        <p className="font-bold text-emerald-800">Caixa Diário Aberto (#{currentCash.id.substring(0, 6)})</p>
                        <p className="text-[11px] text-emerald-600">Este recebimento será computado automaticamente no caixa de hoje.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs">
                        <p className="font-bold text-amber-800">Caixa Diário Fechado</p>
                        <p className="text-[11px] text-amber-700">O pagamento abaterá o débito do cliente. Para que conste no relatório de fechamento do dia, certifique-se de abrir o caixa na aba Caixa Diário.</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Valor do Pagamento</label>
                      <span className="text-[10px] font-bold text-slate-400">
                        {selectedDebt ? `Total desta dívida: R$ ${selectedDebt.remainingAmount.toFixed(2)}` : `Saldo total pendente: R$ ${totalOutstanding.toFixed(2)}`}
                      </span>
                    </div>
                    <input 
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-xl font-black focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Forma de Recebimento</label>
                    <div className="grid grid-cols-2 gap-2">
                      {loadedMethods.filter(m => !m.vai_para_conta_cliente && !m.goesToClientAccount).map((method, index) => (
                        <button
                          key={`pay-filter-${method.id || index}-${index}`}
                          type="button"
                          onClick={() => setSelectedMethod(method.id)}
                          className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border-2 cursor-pointer ${
                            selectedMethod === method.id 
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                              : 'bg-white border-slate-100 text-muted hover:border-slate-200'
                          }`}
                        >
                          {method.nome || method.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button 
                    onClick={handlePayment}
                    disabled={isPaying || !paymentAmount || !selectedMethod}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {isPaying ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                    <span>Confirmar Recebimento</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {showPrintStatement && (
            <div key="modal-print-statement-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                key="modal-print-statement-content"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                      <Printer size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-primary uppercase tracking-tight text-sm">Extrato Oficial do Cliente</h3>
                      <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{client?.nome}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Imprimir</span>
                    </button>
                    <button 
                      onClick={() => setShowPrintStatement(false)} 
                      className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-200 cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div id="printable-client-statement" className="flex-1 p-8 overflow-y-auto space-y-6 bg-white text-slate-900 font-sans text-xs">
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
                    <div>
                      <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">EXTRATO DO LIVRO CAIXA</h1>
                      <p className="text-xs font-bold text-slate-600 mt-1">Histórico Oficial de Débitos & Pagamentos</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">
                        Gerado em: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black uppercase tracking-wider text-slate-900">{client?.nome}</p>
                      <p className="text-xs font-semibold text-slate-600">{client?.telefone || client?.phone || 'Telefone não informado'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Débitos / Fiados</p>
                      <p className="text-base font-black text-red-600">
                        R$ {debts.reduce((acc, d) => acc + (d.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Pagamentos</p>
                      <p className="text-base font-black text-emerald-600">
                        R$ {payments.reduce((acc, p) => acc + (p.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Saldo Em Aberto</p>
                      <p className="text-base font-black text-amber-600">
                        R$ {totalOutstanding.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Lançamentos Detalhados</h3>
                    <table className="w-full text-left border-collapse border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-slate-200">
                          <th className="p-2.5 border-r border-slate-200">Data</th>
                          <th className="p-2.5 border-r border-slate-200">Tipo</th>
                          <th className="p-2.5 border-r border-slate-200">Descrição / Forma</th>
                          <th className="p-2.5 text-right border-r border-slate-200">Valor (R$)</th>
                          <th className="p-2.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-medium">
                        {[
                          ...debts.map(d => ({
                            id: d.id,
                            kind: 'debit' as const,
                            dateStr: d.date || (d.createdAt?.seconds ? format(new Date(d.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                            timestamp: d.createdAt?.seconds || 0,
                            desc: d.description || `Fiado / Dívida${d.comanda_id ? ` (Comanda #${d.comanda_id.slice(-4)})` : ''}`,
                            amount: d.amount,
                            status: d.status,
                            remaining: d.remainingAmount
                          })),
                          ...payments.map(p => ({
                            id: p.id,
                            kind: 'credit' as const,
                            dateStr: p.date || (p.createdAt?.seconds ? format(new Date(p.createdAt.seconds * 1000), 'yyyy-MM-dd') : ''),
                            timestamp: p.createdAt?.seconds || 0,
                            desc: `Pagamento - ${(p.paymentMethod || 'Dinheiro').toUpperCase()}`,
                            amount: p.amount,
                            status: 'pago',
                            remaining: 0
                          }))
                        ]
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((row, i) => (
                          <tr key={`print-row-${row.id || 'r'}-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="p-2.5 border-r border-slate-200 font-mono">
                              {row.dateStr ? format(new Date(row.dateStr), 'dd/MM/yyyy') : '-'}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 font-bold">
                              {row.kind === 'debit' ? (
                                <span className="text-red-600 uppercase">Débito</span>
                              ) : (
                                <span className="text-emerald-600 uppercase">Pagamento</span>
                              )}
                            </td>
                            <td className="p-2.5 border-r border-slate-200 font-semibold">{row.desc}</td>
                            <td className={`p-2.5 text-right border-r border-slate-200 font-mono font-bold ${row.kind === 'debit' ? 'text-red-600' : 'text-emerald-600'}`}>
                              {row.kind === 'debit' ? '-' : '+'} R$ {row.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5 text-center uppercase font-bold text-[10px]">
                              {row.kind === 'credit' ? (
                                <span className="text-emerald-700">Confirmado</span>
                              ) : row.remaining === 0 ? (
                                <span className="text-slate-500">Quitado</span>
                              ) : (
                                <span className="text-red-600">Pendente (R$ {row.remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-6 space-y-8 border-t border-slate-200">
                    <p className="text-[10px] text-slate-500 italic text-center">
                      Reconheço o saldo devedor e as movimentações acima descritas.
                    </p>
                    <div className="grid grid-cols-2 gap-8 pt-4">
                      <div className="text-center space-y-1">
                        <div className="border-b border-slate-900 w-full h-6"></div>
                        <p className="text-[10px] font-black uppercase text-slate-900">{client?.nome}</p>
                        <p className="text-[9px] text-slate-500">Assinatura do Cliente</p>
                      </div>
                      <div className="text-center space-y-1">
                        <div className="border-b border-slate-900 w-full h-6"></div>
                        <p className="text-[10px] font-black uppercase text-slate-900">Estabelecimento</p>
                        <p className="text-[9px] text-slate-500">Assinatura / Carimbo</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

          {editingDebt && (
            <div key="modal-edit-debt-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.form 
                key="modal-edit-debt-content"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onSubmit={handleSaveEditDebt}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-black text-primary uppercase text-sm flex items-center gap-2">
                    <Edit3 size={18} className="text-slate-700" />
                    Editar / Corrigir Fiado
                  </h4>
                  <button type="button" onClick={() => setEditingDebt(null)} className="text-muted hover:text-primary cursor-pointer">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Descrição do Fiado
                    </label>
                    <input 
                      type="text"
                      required
                      value={editDebtDesc}
                      onChange={(e) => setEditDebtDesc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted uppercase tracking-wider block mb-1">
                      Valor Total do Fiado (R$)
                    </label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={editDebtAmount}
                      onChange={(e) => setEditDebtAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-base font-black text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingDebt(null)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={submittingEditDebt}
                    className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingEditDebt ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    <span>Salvar Alteração</span>
                  </button>
                </div>
              </motion.form>
            </div>
          )}

          {receiptPayment && (
            <div key="modal-receipt-payment-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                key="modal-receipt-payment-content"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden p-6 space-y-6"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-black text-primary uppercase text-xs tracking-wider flex items-center gap-2">
                    <Receipt size={16} className="text-emerald-600" />
                    Comprovante de Pagamento
                  </h4>
                  <button type="button" onClick={() => setReceiptPayment(null)} className="text-muted hover:text-primary cursor-pointer">
                    <X size={18} />
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 font-mono text-xs text-slate-800">
                  <div className="text-center border-b border-dashed border-slate-300 pb-3 font-sans">
                    <p className="font-black text-sm uppercase tracking-tight text-slate-900">RECIBO DE QUITAÇÃO</p>
                    <p className="text-[10px] text-slate-500">{client?.nome}</p>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Valor Pago:</span>
                      <span className="font-bold text-emerald-600">R$ {receiptPayment.amount?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Forma:</span>
                      <span className="font-bold uppercase">{receiptPayment.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Data:</span>
                      <span>{receiptPayment.date ? format(new Date(receiptPayment.date), "dd/MM/yyyy") : 'N/D'}</span>
                    </div>
                    {receiptPayment.id && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-400">ID Transação:</span>
                        <span className="text-slate-400">{receiptPayment.id.substring(0, 8)}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-dashed border-slate-300 text-center text-[10px] text-slate-500 font-sans italic">
                    Pagamento registrado no sistema e sincronizado com o Livro Caixa.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    type="button" 
                    onClick={() => window.print()}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer size={16} />
                    <span>Imprimir Recibo</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setReceiptPayment(null)}
                    className="px-4 py-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {/* Modal de Correção / Ajuste Manual de Caderneta (Sem impacto no Caixa) */}
          {isCorrectionModalOpen && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full space-y-6 shadow-2xl border border-slate-100"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                      <SlidersHorizontal size={20} />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-primary">Corrigir Valor da Caderneta</h3>
                      <p className="text-xs text-muted font-medium">Ajuste direto do fiado sem movimentar o caixa diário</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setIsCorrectionModalOpen(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleApplyCorrection} className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Aviso sobre o Livro Caixa</p>
                      <p className="text-[11px] text-amber-800 leading-relaxed mt-0.5">
                        Este ajuste altera exclusivamente o saldo da caderneta do cliente. Não haverá lançamento de entrada ou saída no Caixa Diário.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Tipo de Correção</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCorrectionType('decrease')}
                        className={`py-3 px-4 rounded-2xl text-xs font-black border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          correctionType === 'decrease'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <ArrowDownRight size={16} />
                        <span>Diminuir / Abater Fiado</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCorrectionType('increase')}
                        className={`py-3 px-4 rounded-2xl text-xs font-black border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          correctionType === 'increase'
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <ArrowUpRight size={16} />
                        <span>Aumentar / Adicionar Fiado</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Valor do Ajuste (R$)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      required
                      placeholder="0,00"
                      value={correctionAmount}
                      onChange={(e) => setCorrectionAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-base font-black text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Motivo / Justificativa da Correção *</label>
                    <textarea 
                      rows={3}
                      required
                      placeholder="Ex: Correção de erro de digitação na comanda de ontem, abono autorizado pelo gerente, ajuste da caderneta antiga..."
                      value={correctionReason}
                      onChange={(e) => setCorrectionReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsCorrectionModalOpen(false)}
                      className="px-5 py-3 border border-slate-200 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submittingCorrection}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50"
                    >
                      {submittingCorrection ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      <span>Salvar Correção</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
