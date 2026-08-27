import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  Wallet, 
  Clock, 
  ArrowUpRight, 
  ArrowDownLeft, 
  TrendingUp, 
  RefreshCw, 
  Search, 
  Filter, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Calendar, 
  CreditCard, 
  QrCode, 
  FileText, 
  Info,
  DollarSign,
  RotateCcw,
  Eye,
  X,
  User,
  Mail,
  Phone,
  HelpCircle,
  AlertTriangle,
  Send,
  Building2,
  Lock,
  Download,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DigitalAccountSummary {
  balance: number;
  pendingBalance: number;
  totalReceived: number;
  accountStatus: string;
  environment: string;
  isConnected: boolean;
  lastSync?: string;
}

interface DigitalAccountTransaction {
  id: string;
  date: string;
  type: string;
  typeLabel: string;
  description: string;
  customerName?: string;
  value: number;
  netValue?: number;
  fee?: number;
  balance?: number;
  isIncome?: boolean;
  status?: string;
  billingType?: string;
  invoiceUrl?: string;
  paymentId?: string;
}

interface TransferItem {
  id: string;
  date: string;
  value: number;
  netValue: number;
  transferFee: number;
  status: string;
  type: string;
  pixAddressKey?: string;
  pixAddressKeyType?: string;
  bankAccount?: any;
  failReason?: string;
  transactionReceiptUrl?: string;
}

const COMMON_BANKS = [
  { code: '260', name: 'Nubank (Nu Pagamentos)' },
  { code: '341', name: 'Itaú Unibanco' },
  { code: '033', name: 'Santander Brasil' },
  { code: '237', name: 'Bradesco' },
  { code: '001', name: 'Banco do Brasil' },
  { code: '104', name: 'Caixa Econômica Federal' },
  { code: '077', name: 'Banco Inter' },
  { code: '336', name: 'Banco C6' },
  { code: '212', name: 'Banco Original' },
  { code: '290', name: 'PagBank (PagSeguro)' }
];

export function ContaDigitalAsaas({ tenantId }: { tenantId?: string }) {
  const [summary, setSummary] = useState<DigitalAccountSummary>({
    balance: 0,
    pendingBalance: 0,
    totalReceived: 0,
    accountStatus: 'ACTIVE',
    environment: 'sandbox',
    isConnected: true
  });
  const [transactions, setTransactions] = useState<DigitalAccountTransaction[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [activeSubSection, setActiveSubSection] = useState<'statement' | 'transfers' | 'payout_account'>('statement');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'refunded' | 'fee' | 'transfer'>('all');

  // Payout Account (Homologação de Conta de Saque - Mesma Titularidade)
  const [payoutAccount, setPayoutAccount] = useState<any | null>(null);
  const [officialCnpjCpf, setOfficialCnpjCpf] = useState<string>('');
  const [officialName, setOfficialName] = useState<string>('');
  const [loadingPayout, setLoadingPayout] = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);

  // Form Payout State
  const [payoutFormType, setPayoutFormType] = useState<'PIX' | 'TED'>('PIX');
  const [payoutFormPixType, setPayoutFormPixType] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'>('CPF');
  const [payoutFormPixKey, setPayoutFormPixKey] = useState('');
  const [payoutFormBankCode, setPayoutFormBankCode] = useState('260');
  const [payoutFormBankName, setPayoutFormBankName] = useState('Nubank (Nu Pagamentos)');
  const [payoutFormAgency, setPayoutFormAgency] = useState('');
  const [payoutFormAccount, setPayoutFormAccount] = useState('');
  const [payoutFormAccountDigit, setPayoutFormAccountDigit] = useState('0');
  const [payoutFormBankAccountType, setPayoutFormBankAccountType] = useState<'CONTA_CORRENTE' | 'CONTA_POUPANCA'>('CONTA_CORRENTE');
  const [payoutFormHolderName, setPayoutFormHolderName] = useState('');

  // Payment Details Modal
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any | null>(null);

  // Refund Modal
  const [refundTarget, setRefundTarget] = useState<DigitalAccountTransaction | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');
  const [refunding, setRefunding] = useState(false);
  const [confirmRiskChecked, setConfirmRiskChecked] = useState(false);

  // Transfer / Withdrawal Modal (Fase 3)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<'PIX' | 'TED'>('PIX');
  const [pixKeyType, setPixKeyType] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'>('CPF');
  const [pixKey, setPixKey] = useState('');
  const [transferValue, setTransferValue] = useState<string>('');
  const [transferDescription, setTransferDescription] = useState('Saque de Recebíveis');
  const [bankCode, setBankCode] = useState('260');
  const [ownerName, setOwnerName] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [agency, setAgency] = useState('');
  const [account, setAccount] = useState('');
  const [accountDigit, setAccountDigit] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'CONTA_CORRENTE' | 'CONTA_POUPANCA'>('CONTA_CORRENTE');
  const [adminPin, setAdminPin] = useState('');
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  const loadPayoutAccount = async () => {
    if (!tenantId) return;
    setLoadingPayout(true);
    try {
      const res = await fetch(`/api/saas/gateway/digital-account/payout-account?tenantId=${encodeURIComponent(tenantId)}`);
      if (res.ok) {
        const data = await res.json();
        setOfficialCnpjCpf(data.officialCnpjCpf || '');
        setOfficialName(data.officialName || data.tenantName || '');
        if (data.payoutAccount) {
          setPayoutAccount(data.payoutAccount);
          setPayoutFormType(data.payoutAccount.type || 'PIX');
          if (data.payoutAccount.pixKeyType) setPayoutFormPixType(data.payoutAccount.pixKeyType);
          if (data.payoutAccount.pixKey) setPayoutFormPixKey(data.payoutAccount.pixKey);
          if (data.payoutAccount.bankCode) setPayoutFormBankCode(data.payoutAccount.bankCode);
          if (data.payoutAccount.bankName) setPayoutFormBankName(data.payoutAccount.bankName);
          if (data.payoutAccount.agency) setPayoutFormAgency(data.payoutAccount.agency);
          if (data.payoutAccount.account) setPayoutFormAccount(data.payoutAccount.account);
          if (data.payoutAccount.accountDigit) setPayoutFormAccountDigit(data.payoutAccount.accountDigit);
          if (data.payoutAccount.bankAccountType) setPayoutFormBankAccountType(data.payoutAccount.bankAccountType);
          setPayoutFormHolderName(data.payoutAccount.holderName || data.officialName || '');
        } else {
          setPayoutFormHolderName(data.officialName || '');
          if (data.officialCnpjCpf) {
            const cleanDoc = data.officialCnpjCpf.replace(/\D/g, '');
            setPayoutFormPixType(cleanDoc.length > 11 ? 'CNPJ' : 'CPF');
            setPayoutFormPixKey(cleanDoc);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao consultar conta de saque:", err);
    } finally {
      setLoadingPayout(false);
    }
  };

  const handleSavePayoutAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) {
      toast.error("Barbearia (tenantId) não identificada.");
      return;
    }

    setSavingPayout(true);
    try {
      const payload: any = {
        tenantId,
        type: payoutFormType,
        holderName: payoutFormHolderName || officialName || 'Titular',
        holderDocument: officialCnpjCpf
      };

      if (payoutFormType === 'PIX') {
        payload.pixKeyType = payoutFormPixType;
        payload.pixKey = payoutFormPixKey;
      } else {
        const bankObj = COMMON_BANKS.find(b => b.code === payoutFormBankCode);
        payload.bankCode = payoutFormBankCode;
        payload.bankName = bankObj ? bankObj.name : payoutFormBankName;
        payload.agency = payoutFormAgency;
        payload.account = payoutFormAccount;
        payload.accountDigit = payoutFormAccountDigit || '0';
        payload.bankAccountType = payoutFormBankAccountType;
      }

      const res = await fetch(`/api/saas/gateway/digital-account/payout-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar conta de saque.");
        return;
      }

      toast.success("Conta bancária de saque cadastrada e homologada com sucesso!");
      setPayoutAccount(data.payoutAccount);
    } catch (err: any) {
      console.error("Erro ao salvar conta de saque:", err);
      toast.error(err.message || "Erro de comunicação ao salvar conta.");
    } finally {
      setSavingPayout(false);
    }
  };

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Fetch Summary
      const summaryRes = await fetch(`/api/saas/gateway/digital-account/summary?tenantId=${encodeURIComponent(tenantId || '')}`);
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      // 2. Fetch Statement
      const statementRes = await fetch(`/api/saas/gateway/digital-account/statement?tenantId=${encodeURIComponent(tenantId || '')}&limit=50`);
      if (statementRes.ok) {
        const statementData = await statementRes.json();
        setTransactions(statementData.transactions || []);
      }

      // 3. Fetch Transfers (Fase 3)
      const transfersRes = await fetch(`/api/saas/gateway/digital-account/transfers?tenantId=${encodeURIComponent(tenantId || '')}&limit=30`);
      if (transfersRes.ok) {
        const transfersData = await transfersRes.json();
        setTransfers(transfersData.transfers || []);
      }

      // 4. Fetch Payout Account
      await loadPayoutAccount();

      if (isManualRefresh) {
        toast.success("Dados e conta de saque sincronizados!");
      }
    } catch (err) {
      console.error("Erro ao carregar dados da conta digital:", err);
      toast.error("Não foi possível sincronizar com o Asaas.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleOpenTransferModal = () => {
    if (payoutAccount && payoutAccount.status === 'APPROVED') {
      setTransferType(payoutAccount.type || 'PIX');
      if (payoutAccount.type === 'PIX') {
        if (payoutAccount.pixKeyType) setPixKeyType(payoutAccount.pixKeyType);
        if (payoutAccount.pixKey) setPixKey(payoutAccount.pixKey);
      } else {
        if (payoutAccount.bankCode) setBankCode(payoutAccount.bankCode);
        if (payoutAccount.agency) setAgency(payoutAccount.agency);
        if (payoutAccount.account) setAccount(payoutAccount.account);
        if (payoutAccount.accountDigit) setAccountDigit(payoutAccount.accountDigit);
        if (payoutAccount.bankAccountType) setBankAccountType(payoutAccount.bankAccountType);
        if (payoutAccount.holderName) setOwnerName(payoutAccount.holderName);
        if (payoutAccount.holderDocument) setCpfCnpj(payoutAccount.holderDocument);
      }
    } else if (officialCnpjCpf) {
      const cleanDoc = officialCnpjCpf.replace(/\D/g, '');
      setPixKeyType(cleanDoc.length > 11 ? 'CNPJ' : 'CPF');
      setPixKey(cleanDoc);
      setCpfCnpj(cleanDoc);
    }
    setIsTransferModalOpen(true);
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Open Payment Details Modal
  const handleOpenDetails = async (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setLoadingDetails(true);
    setPaymentDetails(null);
    try {
      const res = await fetch(`/api/saas/gateway/digital-account/payment-details?paymentId=${encodeURIComponent(paymentId)}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentDetails(data);
      } else {
        const err = await res.json();
        toast.error(err.error || "Não foi possível carregar os detalhes.");
      }
    } catch (error) {
      console.error("Erro ao buscar detalhes:", error);
      toast.error("Erro de conexão ao consultar detalhes.");
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open Refund Modal
  const handleOpenRefund = (tx: DigitalAccountTransaction) => {
    setRefundTarget(tx);
    setRefundAmount(String(tx.value));
    setRefundReason('');
    setConfirmRiskChecked(false);
  };

  // Execute Refund
  const handleExecuteRefund = async () => {
    if (!refundTarget) return;

    const targetId = refundTarget.paymentId || refundTarget.id;
    const numericAmount = parseFloat(refundAmount.replace(',', '.'));

    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error("Informe um valor válido para estorno.");
      return;
    }

    if (numericAmount > refundTarget.value) {
      toast.error("O valor de estorno não pode ser maior que o valor da cobrança.");
      return;
    }

    if (!confirmRiskChecked) {
      toast.error("Por favor, marque a caixa confirmando a operação de estorno.");
      return;
    }

    setRefunding(true);
    try {
      const res = await fetch('/api/saas/gateway/digital-account/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: targetId,
          value: numericAmount,
          description: refundReason.trim() || 'Estorno solicitado via Conta Digital da Barbearia'
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Estorno realizado com sucesso no Asaas!");
        setRefundTarget(null);
        setSelectedPaymentId(null);
        await loadData();
      } else {
        toast.error(data.error || "Erro ao processar estorno no Asaas.");
      }
    } catch (err: any) {
      console.error("Erro ao realizar estorno:", err);
      toast.error("Erro de conexão ao solicitar estorno.");
    } finally {
      setRefunding(false);
    }
  };

  // Execute Transfer Request (Fase 3)
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericVal = parseFloat(transferValue.replace(',', '.'));
    if (isNaN(numericVal) || numericVal <= 0) {
      toast.error("Informe um valor de saque válido.");
      return;
    }

    if (numericVal < 5) {
      toast.error("O valor mínimo para transferência no Asaas é de R$ 5,00.");
      return;
    }

    if (numericVal > summary.balance) {
      toast.error(`Saldo insuficiente. Seu saldo disponível é de R$ ${summary.balance.toFixed(2)}.`);
      return;
    }

    // Sanitize and validate transfer inputs
    let cleanPixKey = pixKey.trim();
    let cleanCpfCnpj = cpfCnpj.replace(/\D/g, '');
    let cleanAgency = agency.replace(/\D/g, '');
    let cleanAccount = account.replace(/[^\d-]/g, '');
    let cleanAccountDigit = accountDigit.replace(/[^\w]/g, '') || '0';

    if (transferType === 'PIX') {
      if (!cleanPixKey) {
        toast.error("Informe a chave PIX de destino.");
        return;
      }

      if (pixKeyType === 'CPF') {
        cleanPixKey = cleanPixKey.replace(/\D/g, '');
        if (cleanPixKey.length !== 11) {
          toast.error("A chave PIX do tipo CPF deve conter 11 dígitos.");
          return;
        }
      } else if (pixKeyType === 'CNPJ') {
        cleanPixKey = cleanPixKey.replace(/\D/g, '');
        if (cleanPixKey.length !== 14) {
          toast.error("A chave PIX do tipo CNPJ deve conter 14 dígitos.");
          return;
        }
      } else if (pixKeyType === 'PHONE') {
        const phoneDigits = cleanPixKey.replace(/\D/g, '');
        if (phoneDigits.length < 10 || phoneDigits.length > 13) {
          toast.error("O telefone para PIX deve conter DDD + Número (ex: 11999999999).");
          return;
        }
        cleanPixKey = phoneDigits.startsWith('55') ? `+${phoneDigits}` : `+55${phoneDigits}`;
      } else if (pixKeyType === 'EMAIL') {
        cleanPixKey = cleanPixKey.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanPixKey)) {
          toast.error("Informe um e-mail válido para a chave PIX.");
          return;
        }
      }
    }

    if (transferType === 'TED') {
      if (!ownerName.trim() || !cleanCpfCnpj || !cleanAgency || !cleanAccount) {
        toast.error("Preencha todos os dados bancários obrigatórios.");
        return;
      }
      if (cleanCpfCnpj.length !== 11 && cleanCpfCnpj.length !== 14) {
        toast.error("O CPF deve ter 11 dígitos ou o CNPJ deve ter 14 dígitos.");
        return;
      }
    }

    setIsSubmittingTransfer(true);

    try {
      const payload: any = {
        value: numericVal,
        operationType: transferType,
        description: transferDescription || "Saque via Conta Digital",
        tenantId: tenantId || ''
      };

      if (transferType === 'PIX') {
        payload.pixAddressKey = cleanPixKey;
        payload.pixAddressKeyType = pixKeyType;
      } else {
        payload.bankAccount = {
          bankCode,
          ownerName: ownerName.trim(),
          cpfCnpj: cleanCpfCnpj,
          agency: cleanAgency,
          account: cleanAccount,
          accountDigit: cleanAccountDigit,
          bankAccountType
        };
      }

      const res = await fetch('/api/saas/gateway/digital-account/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        toast.success("Solicitação de transferência enviada ao Asaas com sucesso!");
        setIsTransferModalOpen(false);
        setTransferValue('');
        setPixKey('');
        setAdminPin('');
        setActiveSubSection('transfers');
        try {
          await loadData();
        } catch (loadErr) {
          console.warn("Aviso ao recarregar dados pós-transferência:", loadErr);
        }
      } else {
        const errorMsg = data.error || "Não foi possível processar a transferência no Asaas.";
        if (errorMsg.includes("pattern") || errorMsg.includes("The string did not match")) {
          toast.error("Formato inválido dos dados de transferência. Verifique a chave PIX ou conta bancária.");
        } else {
          toast.error(errorMsg);
        }
      }
    } catch (err: any) {
      console.error("Erro ao solicitar transferência:", err);
      const message = err?.message || '';
      if (message.includes("pattern") || message.includes("The string did not match")) {
        toast.error("Formato inválido de dados da transferência. Verifique a chave PIX ou os dados bancários.");
      } else {
        toast.error("Erro de comunicação com o servidor ao solicitar transferência.");
      }
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = 
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.customerName && t.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.id && t.id.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (typeFilter === 'income') {
      return (t.isIncome === true || t.type?.includes('RECEIVED') || t.type?.includes('CREDIT')) && !t.status?.includes('REFUND');
    }
    if (typeFilter === 'refunded') {
      return t.status === 'REFUNDED' || t.status === 'PARTIALLY_REFUNDED' || t.type?.includes('REFUND');
    }
    if (typeFilter === 'fee') {
      return t.type?.includes('FEE') || (t.fee && t.fee > 0 && !t.isIncome);
    }
    if (typeFilter === 'transfer') {
      return t.type?.includes('TRANSFER');
    }

    return true;
  });

  const formatTransferStatus = (status: string) => {
    switch (status) {
      case 'DONE':
        return { label: 'Concluído', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'PENDING':
      case 'BANK_PROCESSING':
      case 'IN_PROCESSING':
        return { label: 'Em Processamento', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'CANCELLED':
      case 'FAILED':
        return { label: 'Cancelado / Falha', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      default:
        return { label: status, color: 'bg-slate-100 text-slate-800 border-slate-200' };
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Info & Sync */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 shadow-2xs">
            <Landmark size={28} />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Conta Digital Asaas</h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                summary.environment === 'production' 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-amber-100 text-amber-800'
              }`}>
                <span className={`w-2 h-2 rounded-full ${summary.environment === 'production' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {summary.environment === 'production' ? 'Asaas Produção' : 'Asaas Sandbox'}
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Visão consolidada de saldos, extrato oficial, estornos e transferências/saques bancários.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Sincronizando...' : 'Atualizar'}</span>
          </button>

          <button
            onClick={() => setIsTransferModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Send size={16} />
            <span>Transferir / Sacar Saldo</span>
          </button>
        </div>
      </div>

      {/* Safety Notice (Fase 3) */}
      <div className="bg-gradient-to-r from-emerald-50/90 via-teal-50/70 to-sky-50/90 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 flex items-start sm:items-center justify-between gap-4 text-slate-700 shadow-2xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <ShieldCheck size={24} className="text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div className="text-xs sm:text-sm font-medium leading-relaxed">
            <strong className="font-bold text-emerald-950">Fase 3 — Sistema Financeiro Completo:</strong> Você pode transferir valores do seu saldo Asaas para qualquer chave PIX ou conta bancária via TED com validações de segurança e registro de comprovantes.
          </div>
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Card 1: Saldo Disponível */}
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 sm:p-7 text-white shadow-lg relative overflow-hidden flex flex-col justify-between min-h-[160px]">
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 text-white/10 pointer-events-none">
            <Wallet size={130} />
          </div>
          <div>
            <div className="flex items-center justify-between text-emerald-100 text-xs font-extrabold uppercase tracking-wider">
              <span>Saldo Disponível</span>
              <span className="p-1.5 bg-white/15 rounded-xl backdrop-blur-md">
                <CheckCircle2 size={16} />
              </span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 drop-shadow-sm">
              R$ {summary.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-emerald-100">
            <span>Liberado em conta para saque</span>
            <button 
              onClick={handleOpenTransferModal}
              className="font-bold text-emerald-900 bg-white hover:bg-emerald-50 px-3 py-1 rounded-xl transition-all cursor-pointer shadow-2xs"
            >
              Sacar Agora
            </button>
          </div>
        </div>

        {/* Card 2: Saldo a Liberar (Previsão) */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-extrabold uppercase tracking-wider">
              <span>Saldo a Liberar</span>
              <span className="p-1.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                <Clock size={16} />
              </span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-2">
              R$ {summary.pendingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Cobranças e cartões a compensar</span>
            <span className="font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-100">Previsão</span>
          </div>
        </div>

        {/* Card 3: Total Transacionado */}
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-7 shadow-xs flex flex-col justify-between min-h-[160px]">
          <div>
            <div className="flex items-center justify-between text-slate-400 text-xs font-extrabold uppercase tracking-wider">
              <span>Total Recebido no Gateway</span>
              <span className="p-1.5 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
                <TrendingUp size={16} />
              </span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mt-2">
              R$ {summary.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Volume acumulado via Asaas</span>
            <span className="font-bold text-sky-600 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-100">Liquidado</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs: Extrato vs Transferências Realizadas */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubSection('statement')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                activeSubSection === 'statement'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={16} />
              <span>Extrato & Cobranças</span>
            </button>
            <button
              onClick={() => setActiveSubSection('transfers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                activeSubSection === 'transfers'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Send size={16} />
              <span>Histórico de Saques ({transfers.length})</span>
            </button>
            <button
              onClick={() => setActiveSubSection('payout_account')}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                activeSubSection === 'payout_account'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ShieldCheck size={16} />
              <span>Conta de Saque (Homologação)</span>
              {payoutAccount?.status === 'APPROVED' ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              )}
            </button>
          </div>

          {activeSubSection === 'statement' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar cobrança ou cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-60 pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200/60 overflow-x-auto">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1 text-xs font-bold rounded-xl transition-all ${
                    typeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setTypeFilter('income')}
                  className={`px-3 py-1 text-xs font-bold rounded-xl transition-all ${
                    typeFilter === 'income' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Recebidas
                </button>
                <button
                  onClick={() => setTypeFilter('refunded')}
                  className={`px-3 py-1 text-xs font-bold rounded-xl transition-all ${
                    typeFilter === 'refunded' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Estornos
                </button>
                <button
                  onClick={() => setTypeFilter('fee')}
                  className={`px-3 py-1 text-xs font-bold rounded-xl transition-all ${
                    typeFilter === 'fee' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tarifas
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content 1: Extrato & Cobranças */}
        {activeSubSection === 'statement' && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw size={32} className="animate-spin text-emerald-600" />
                <p className="text-slate-500 font-bold text-sm">Consultando extrato oficial no Asaas...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <FileText size={24} />
                </div>
                <h4 className="text-base font-bold text-slate-800">Nenhuma movimentação encontrada</h4>
                <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
                  Assim que você receber pagamentos pelo Asaas, o extrato aparecerá consolidado aqui em tempo real.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Data</th>
                    <th className="py-3.5 px-4">Descrição / Pagador</th>
                    <th className="py-3.5 px-4">Status / Método</th>
                    <th className="py-3.5 px-4 text-right">Valor Bruto</th>
                    <th className="py-3.5 px-4 text-right">Tarifa</th>
                    <th className="py-3.5 px-4 text-right">Valor Líquido</th>
                    <th className="py-3.5 px-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx, idx) => {
                    const isIncome = tx.isIncome !== false;
                    const isRefunded = tx.status === 'REFUNDED' || tx.status === 'PARTIALLY_REFUNDED' || tx.type?.includes('REFUND');
                    const canRefund = (tx.status === 'RECEIVED' || tx.status === 'CONFIRMED' || tx.type === 'PAYMENT_RECEIVED') && !isRefunded;
                    const paymentTargetId = tx.paymentId || tx.id;

                    return (
                      <tr key={`asaas-tx-${tx.id || 'item'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-700 whitespace-nowrap">
                          {tx.date ? (
                            <>
                              <div>{tx.date.substring(0, 10)}</div>
                              {tx.date.length > 10 && (
                                <div className="text-[10px] text-slate-400 font-medium">
                                  {tx.date.substring(11, 16)}
                                </div>
                              )}
                            </>
                          ) : '-'}
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900 max-w-xs truncate">
                            {tx.description || 'Operação Asaas'}
                          </div>
                          {tx.customerName && (
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                              <User size={10} />
                              {tx.customerName}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap">
                          {isRefunded ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <RotateCcw size={11} />
                              Estornado
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                              isIncome 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {isIncome ? <ArrowDownLeft size={12} className="text-emerald-600" /> : <ArrowUpRight size={12} className="text-slate-500" />}
                              {tx.typeLabel || tx.type}
                            </span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-black text-slate-800 whitespace-nowrap">
                          R$ {tx.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-4 px-4 text-right font-medium text-slate-500 whitespace-nowrap">
                          {tx.fee && tx.fee > 0 ? (
                            <span className="text-rose-500 font-semibold">- R$ {tx.fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          ) : (
                            'R$ 0,00'
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-black whitespace-nowrap">
                          <span className={isRefunded ? 'text-rose-600 line-through' : (isIncome ? 'text-emerald-600' : 'text-slate-900')}>
                            {isIncome ? '+' : '-'} R$ {(tx.netValue || tx.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </td>

                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenDetails(paymentTargetId)}
                              title="Ver detalhes da cobrança"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                            >
                              <Eye size={14} />
                            </button>

                            {canRefund && (
                              <button
                                onClick={() => handleOpenRefund(tx)}
                                title="Solicitar Estorno no Asaas"
                                className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors cursor-pointer"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}

                            {tx.invoiceUrl && (
                              <a
                                href={tx.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir no Asaas"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 transition-colors cursor-pointer"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Content 2: Histórico de Saques / Transferências (Fase 3) */}
        {activeSubSection === 'transfers' && (
          <div className="overflow-x-auto">
            {transfers.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-8">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Send size={24} />
                </div>
                <h4 className="text-base font-bold text-slate-800">Nenhum saque ou transferência solicitada</h4>
                <p className="text-slate-500 text-xs mt-1 max-w-md mx-auto">
                  Quando você solicitar saques ou transferências via PIX ou TED, o registro completo e os comprovantes aparecerão listados aqui.
                </p>
                <button
                  onClick={() => setIsTransferModalOpen(true)}
                  className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2"
                >
                  <Send size={14} />
                  Solicitar Primeiro Saque
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3.5 px-4">Data da Solicitação</th>
                    <th className="py-3.5 px-4">Método / Destino</th>
                    <th className="py-3.5 px-4">Status no Asaas</th>
                    <th className="py-3.5 px-4 text-right">Valor Transferido</th>
                    <th className="py-3.5 px-4 text-right">Taxa de Saque</th>
                    <th className="py-3.5 px-4 text-right">Total Debitado</th>
                    <th className="py-3.5 px-4 text-center">Comprovante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((tf, idx) => {
                    const statusConfig = formatTransferStatus(tf.status);
                    return (
                      <tr key={`asaas-tf-${tf.id || 'transfer'}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-700 whitespace-nowrap">
                          <div>{tf.date ? tf.date.substring(0, 10) : '-'}</div>
                          {tf.date && tf.date.length > 10 && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              {tf.date.substring(11, 16)}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {tf.type === 'PIX' ? <QrCode size={14} className="text-emerald-600" /> : <Building2 size={14} className="text-sky-600" />}
                            {tf.type === 'PIX' ? 'PIX Instantâneo' : 'Transferência TED'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-xs">
                            {tf.pixAddressKey ? `Chave: ${tf.pixAddressKey}` : (tf.bankAccount ? `Banco ${tf.bankAccount.bank?.code || ''} Ag ${tf.bankAccount.agency || ''} Cc ${tf.bankAccount.account || ''}` : tf.id)}
                          </div>
                        </td>

                        <td className="py-4 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                          {tf.failReason && (
                            <div className="text-[10px] text-rose-600 mt-1 font-medium max-w-xs">
                              Motivo: {tf.failReason}
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                          R$ {tf.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-4 px-4 text-right font-medium text-slate-500 whitespace-nowrap">
                          {tf.transferFee && tf.transferFee > 0 ? (
                            `R$ ${tf.transferFee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-emerald-600 font-bold">Grátis</span>
                          )}
                        </td>

                        <td className="py-4 px-4 text-right font-black text-rose-600 whitespace-nowrap">
                          - R$ {(tf.value + (tf.transferFee || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          {tf.transactionReceiptUrl ? (
                            <a
                              href={tf.transactionReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-[11px] transition-colors cursor-pointer"
                            >
                              <Download size={12} />
                              Comprovante
                            </a>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Content 3: Homologação de Conta Bancária de Saque (Mesma Titularidade) */}
        {activeSubSection === 'payout_account' && (
          <div className="space-y-6">
            {/* Header / Security Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
              <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 text-white/5 pointer-events-none">
                <ShieldCheck size={180} />
              </div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[11px] font-extrabold uppercase tracking-wider">
                    <Lock size={12} className="text-blue-400" />
                    <span>Proteção Antifraude Ativa</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight">
                    Homologação de Conta para Saque (Mesma Titularidade)
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed">
                    Por regulamentação do Banco Central e diretrizes do Asaas, todos os saques de recebíveis da sua barbearia devem ser destinados a uma conta bancária ou chave PIX de <strong>mesma titularidade</strong> (mesmo CPF/CNPJ cadastrado no Portal SaaS: <span className="font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">{officialCnpjCpf || 'Não informado'}</span>).
                  </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 shrink-0 text-center min-w-[200px]">
                  <div className="text-[10px] text-blue-200 uppercase font-black tracking-wider">Status da Homologação</div>
                  <div className="mt-1 flex items-center justify-center gap-1.5">
                    {payoutAccount?.status === 'APPROVED' ? (
                      <>
                        <CheckCircle2 size={18} className="text-emerald-400" />
                        <span className="font-black text-emerald-300 text-sm">HOMOLOGADA</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={18} className="text-amber-400" />
                        <span className="font-black text-amber-300 text-sm">PENDENTE</span>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-300 mt-1">
                    {payoutAccount?.status === 'APPROVED' ? 'Conta pronta para recebimento de saques' : 'Configure os dados abaixo'}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Account Details & Status */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                      <Building2 size={20} />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 text-sm">Dados Oficiais da Barbearia</h4>
                      <p className="text-slate-500 text-xs">Proprietário / Titular do Contrato SaaS</p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2 text-xs">
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200/60">
                      <span className="text-slate-400 text-[10px] font-bold uppercase block">Razão Social / Nome</span>
                      <span className="font-black text-slate-900 text-sm mt-0.5 block">
                        {officialName || 'Barbearia'}
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200/60 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 text-[10px] font-bold uppercase block">CPF / CNPJ Imutável</span>
                        <span className="font-mono font-black text-slate-900 text-sm mt-0.5 block">
                          {officialCnpjCpf || 'Pendente no cadastro'}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-[10px] font-bold">
                        <Lock size={12} />
                        Titularidade Protegida
                      </span>
                    </div>
                  </div>

                  {/* Homologated Account Summary Card */}
                  {payoutAccount && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                        <span className="text-emerald-900 text-xs font-black flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-emerald-600" />
                          Conta de Saque Atual
                        </span>
                        <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg uppercase">
                          {payoutAccount.type}
                        </span>
                      </div>

                      {payoutAccount.type === 'PIX' ? (
                        <div className="space-y-1.5 text-xs text-emerald-950">
                          <div>
                            <span className="text-emerald-700 font-medium">Chave PIX ({payoutAccount.pixKeyType}):</span>{' '}
                            <strong className="font-mono">{payoutAccount.pixKey}</strong>
                          </div>
                          <div>
                            <span className="text-emerald-700 font-medium">Titular:</span>{' '}
                            <strong>{payoutAccount.holderName}</strong>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-xs text-emerald-950">
                          <div>
                            <span className="text-emerald-700 font-medium">Banco:</span>{' '}
                            <strong>{payoutAccount.bankName || payoutAccount.bankCode}</strong>
                          </div>
                          <div>
                            <span className="text-emerald-700 font-medium">Agência / Conta:</span>{' '}
                            <strong className="font-mono">Ag {payoutAccount.agency} | Cc {payoutAccount.account}-{payoutAccount.accountDigit}</strong>
                          </div>
                          <div>
                            <span className="text-emerald-700 font-medium">Titular:</span>{' '}
                            <strong>{payoutAccount.holderName}</strong> ({payoutAccount.holderDocument})
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Form to Edit / Homologate */}
              <div className="lg:col-span-7">
                <form onSubmit={handleSavePayoutAccount} className="bg-slate-50 border border-slate-200/80 rounded-3xl p-6 sm:p-7 space-y-5">
                  <div>
                    <h4 className="font-black text-slate-900 text-base">Cadastrar / Atualizar Conta de Saque</h4>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Selecione a forma de recebimento de preferências para os saques via Asaas.
                    </p>
                  </div>

                  {/* Type Selector (PIX vs TED) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">Modalidade de Recebimento</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPayoutFormType('PIX')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          payoutFormType === 'PIX'
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/20'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <QrCode size={22} className={payoutFormType === 'PIX' ? 'text-white' : 'text-emerald-600'} />
                          <div>
                            <div className="font-extrabold text-sm">Chave PIX</div>
                            <div className={`text-[11px] ${payoutFormType === 'PIX' ? 'text-emerald-100' : 'text-slate-500'}`}>Instantâneo (Recomendado)</div>
                          </div>
                        </div>
                        {payoutFormType === 'PIX' && <CheckCircle2 size={18} className="text-white shrink-0" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayoutFormType('TED')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                          payoutFormType === 'TED'
                            ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-600/20'
                            : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Landmark size={22} className={payoutFormType === 'TED' ? 'text-white' : 'text-blue-600'} />
                          <div>
                            <div className="font-extrabold text-sm">TED Bancária</div>
                            <div className={`text-[11px] ${payoutFormType === 'TED' ? 'text-blue-100' : 'text-slate-500'}`}>Até 1 dia útil</div>
                          </div>
                        </div>
                        {payoutFormType === 'TED' && <CheckCircle2 size={18} className="text-white shrink-0" />}
                      </button>
                    </div>
                  </div>

                  {/* PIX Form Fields */}
                  {payoutFormType === 'PIX' && (
                    <div className="space-y-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1.5 text-xs">Tipo de Chave PIX</label>
                        <select
                          value={payoutFormPixType}
                          onChange={(e) => {
                            const newType = e.target.value as any;
                            setPayoutFormPixType(newType);
                            if (newType === 'CPF' || newType === 'CNPJ') {
                              setPayoutFormPixKey(officialCnpjCpf ? officialCnpjCpf.replace(/\D/g, '') : '');
                            }
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="CPF">CPF (Mesmo do Cadastro)</option>
                          <option value="CNPJ">CNPJ (Mesmo do Cadastro)</option>
                          <option value="EMAIL">E-mail do Titular</option>
                          <option value="PHONE">Telefone Celular do Titular</option>
                          <option value="EVP">Chave Aleatória (EVP)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-800 mb-1.5 text-xs">Chave PIX de Destino</label>
                        <input
                          type="text"
                          placeholder={
                            payoutFormPixType === 'CPF' ? '000.000.000-00' :
                            payoutFormPixType === 'CNPJ' ? '00.000.000/0000-00' :
                            payoutFormPixType === 'EMAIL' ? 'seuemail@exemplo.com' :
                            payoutFormPixType === 'PHONE' ? '(11) 99999-9999' : 'Chave aleatória'
                          }
                          value={payoutFormPixKey}
                          onChange={(e) => setPayoutFormPixKey(e.target.value)}
                          readOnly={payoutFormPixType === 'CPF' || payoutFormPixType === 'CNPJ'}
                          required
                          className={`w-full px-3.5 py-2.5 border rounded-xl font-mono font-bold text-slate-900 text-xs ${
                            payoutFormPixType === 'CPF' || payoutFormPixType === 'CNPJ'
                              ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed'
                              : 'bg-slate-50 border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20'
                          }`}
                        />
                        {(payoutFormPixType === 'CPF' || payoutFormPixType === 'CNPJ') && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            🔒 Chave fixada com o CPF/CNPJ oficial do contrato para garantir a mesma titularidade.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TED Form Fields */}
                  {payoutFormType === 'TED' && (
                    <div className="space-y-4 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1.5 text-xs">Banco de Destino</label>
                        <select
                          value={payoutFormBankCode}
                          onChange={(e) => {
                            setPayoutFormBankCode(e.target.value);
                            const bObj = COMMON_BANKS.find(b => b.code === e.target.value);
                            if (bObj) setPayoutFormBankName(bObj.name);
                          }}
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {COMMON_BANKS.map((b, idx) => (
                            <option key={`payout-bank-${b.code}-${idx}`} value={b.code}>
                              {b.code} - {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">Agência (sem dígito)</label>
                          <input
                            type="text"
                            placeholder="0001"
                            value={payoutFormAgency}
                            onChange={(e) => setPayoutFormAgency(e.target.value)}
                            required
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">Conta e Dígito</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="123456"
                              value={payoutFormAccount}
                              onChange={(e) => setPayoutFormAccount(e.target.value)}
                              required
                              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="0"
                              value={payoutFormAccountDigit}
                              onChange={(e) => setPayoutFormAccountDigit(e.target.value)}
                              className="w-14 px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-center text-slate-900 text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">Tipo de Conta</label>
                          <select
                            value={payoutFormBankAccountType}
                            onChange={(e) => setPayoutFormBankAccountType(e.target.value as any)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs"
                          >
                            <option value="CONTA_CORRENTE">Conta Corrente</option>
                            <option value="CONTA_POUPANCA">Conta Poupança</option>
                          </select>
                        </div>
                        <div>
                          <label className="block font-bold text-slate-800 mb-1.5 text-xs">CPF/CNPJ do Titular (Fixo)</label>
                          <input
                            type="text"
                            value={officialCnpjCpf || ''}
                            readOnly
                            className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl font-mono font-bold text-slate-600 text-xs cursor-not-allowed"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Holder Name */}
                  <div>
                    <label className="block font-bold text-slate-800 mb-1.5 text-xs">Nome Completo do Titular da Conta</label>
                    <input
                      type="text"
                      placeholder="Nome completo ou Razão Social"
                      value={payoutFormHolderName}
                      onChange={(e) => setPayoutFormHolderName(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2 flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={savingPayout}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
                    >
                      <ShieldCheck size={16} className={savingPayout ? 'animate-spin' : 'text-emerald-400'} />
                      <span>{savingPayout ? 'Salavando e Homologando...' : 'Salvar e Homologar Conta de Saque'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: Solicitação de Transferência / Saque (Fase 3) */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-8"
            >
              <button
                onClick={() => setIsTransferModalOpen(false)}
                disabled={isSubmittingTransfer}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                  <Send size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Transferência / Saque Asaas</h3>
                  <p className="text-xs text-slate-500 font-medium">Envie saldo disponível para uma conta ou chave PIX</p>
                </div>
              </div>

              {/* Saldo Disponível Box */}
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">Saldo Disponível no Gateway</div>
                  <div className="text-xl font-black text-emerald-950">
                    R$ {summary.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferValue(summary.balance.toFixed(2))}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-2xs"
                >
                  Sacar Tudo
                </button>
              </div>

              <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
                {/* Method Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setTransferType('PIX')}
                    className={`py-2 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      transferType === 'PIX' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <QrCode size={15} className={transferType === 'PIX' ? 'text-emerald-600' : ''} />
                    <span>Chave PIX (Instantâneo)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferType('TED')}
                    className={`py-2 text-xs font-black rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      transferType === 'TED' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 size={15} className={transferType === 'TED' ? 'text-sky-600' : ''} />
                    <span>Conta Bancária (TED)</span>
                  </button>
                </div>

                {/* PIX Form */}
                {transferType === 'PIX' && (
                  <div className="space-y-3 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Tipo de Chave PIX</label>
                      <select
                        value={pixKeyType}
                        onChange={(e: any) => setPixKeyType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="CPF">CPF</option>
                        <option value="CNPJ">CNPJ</option>
                        <option value="EMAIL">E-mail</option>
                        <option value="PHONE">Telefone Celular</option>
                        <option value="EVP">Chave Aleatória (EVP)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Chave PIX de Destino</label>
                      <input
                        type="text"
                        placeholder={
                          pixKeyType === 'CPF' ? '000.000.000-00' :
                          pixKeyType === 'CNPJ' ? '00.000.000/0000-00' :
                          pixKeyType === 'EMAIL' ? 'seuemail@exemplo.com' :
                          pixKeyType === 'PHONE' ? '(11) 99999-9999' : 'Chave aleatória'
                        }
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {/* TED Form */}
                {transferType === 'TED' && (
                  <div className="space-y-3 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Banco de Destino</label>
                      <select
                        value={bankCode}
                        onChange={(e) => setBankCode(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        {COMMON_BANKS.map((b, idx) => (
                          <option key={`bank-select-${b.code}-${idx}`} value={b.code}>
                            {b.code} - {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Agência</label>
                        <input
                          type="text"
                          placeholder="0001"
                          value={agency}
                          onChange={(e) => setAgency(e.target.value)}
                          required
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Conta com Dígito</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            placeholder="123456"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            required
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="0"
                            value={accountDigit}
                            onChange={(e) => setAccountDigit(e.target.value)}
                            className="w-12 px-2 py-2 bg-white border border-slate-200 rounded-xl font-bold text-center text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Nome Completo do Titular</label>
                      <input
                        type="text"
                        placeholder="Nome do Titular da Conta"
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        required
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">CPF ou CNPJ do Titular</label>
                      <input
                        type="text"
                        placeholder="000.000.000-00"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(e.target.value)}
                        required
                        className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* Transfer Value */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Valor do Saque (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="5.00"
                    max={summary.balance}
                    placeholder="0,00"
                    value={transferValue}
                    onChange={(e) => setTransferValue(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {/* Quick amount chips */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Rápido:</span>
                    {[50, 100, 250, 500].map((val, idx) => (
                      <button
                        key={`quick-amount-${val}-${idx}`}
                        type="button"
                        onClick={() => setTransferValue(String(val))}
                        disabled={val > summary.balance}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-[10px] font-bold text-slate-700 cursor-pointer"
                      >
                        R$ {val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Descrição / Identificação</label>
                  <input
                    type="text"
                    value={transferDescription}
                    onChange={(e) => setTransferDescription(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                  />
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(false)}
                    disabled={isSubmittingTransfer}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingTransfer || summary.balance < 5}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
                  >
                    <Send size={14} className={isSubmittingTransfer ? 'animate-spin' : ''} />
                    <span>{isSubmittingTransfer ? 'Transferindo...' : 'Confirmar e Transferir'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Detalhes da Cobrança Asaas */}
      <AnimatePresence>
        {selectedPaymentId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setSelectedPaymentId(null)}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Detalhes da Cobrança</h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {selectedPaymentId}</p>
                </div>
              </div>

              {loadingDetails ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
                  <RefreshCw size={28} className="animate-spin text-emerald-600" />
                  <p className="text-slate-500 text-xs font-bold">Consultando dados no Asaas...</p>
                </div>
              ) : paymentDetails ? (
                <div className="space-y-5 text-xs">
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                    <span className="text-slate-500 font-medium">Status no Asaas</span>
                    <span className={`font-black px-2.5 py-1 rounded-xl uppercase tracking-wider text-[10px] ${
                      paymentDetails.payment?.status === 'RECEIVED' || paymentDetails.payment?.status === 'CONFIRMED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : (paymentDetails.payment?.status === 'REFUNDED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800')
                    }`}>
                      {paymentDetails.payment?.status || 'PENDENTE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Valor Bruto</div>
                      <div className="font-black text-slate-900 text-sm mt-0.5">
                        R$ {Number(paymentDetails.payment?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="text-slate-400 text-[10px] font-bold uppercase">Tarifa Asaas</div>
                      <div className="font-black text-rose-600 text-sm mt-0.5">
                        - R$ {(Number(paymentDetails.payment?.value || 0) - Number(paymentDetails.payment?.netValue || paymentDetails.payment?.value || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-emerald-950">
                      <div className="text-emerald-700 text-[10px] font-bold uppercase">Valor Líquido</div>
                      <div className="font-black text-emerald-700 text-sm mt-0.5">
                        R$ {Number(paymentDetails.payment?.netValue || paymentDetails.payment?.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {paymentDetails.customer && (
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-2">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                        <User size={14} className="text-emerald-600" />
                        Dados do Pagador
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                        <div><strong className="text-slate-800">Nome:</strong> {paymentDetails.customer.name || '-'}</div>
                        <div><strong className="text-slate-800">CPF/CNPJ:</strong> {paymentDetails.customer.cpfCnpj || '-'}</div>
                        <div><strong className="text-slate-800">Email:</strong> {paymentDetails.customer.email || '-'}</div>
                        <div><strong className="text-slate-800">Telefone:</strong> {paymentDetails.customer.phone || paymentDetails.customer.mobilePhone || '-'}</div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 text-slate-600 text-[11px]">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Forma de Pagamento</span>
                      <strong className="text-slate-900">{paymentDetails.payment?.billingType || '-'}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Data de Vencimento</span>
                      <strong className="text-slate-900">{paymentDetails.payment?.dueDate || '-'}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span>Data do Pagamento</span>
                      <strong className="text-slate-900">{paymentDetails.payment?.paymentDate || paymentDetails.payment?.clientPaymentDate || '-'}</strong>
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-3">
                    {paymentDetails.payment?.invoiceUrl && (
                      <a
                        href={paymentDetails.payment.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                      >
                        <ExternalLink size={14} />
                        Fatura no Asaas
                      </a>
                    )}

                    {(paymentDetails.payment?.status === 'RECEIVED' || paymentDetails.payment?.status === 'CONFIRMED') && (
                      <button
                        onClick={() => {
                          const p = paymentDetails.payment;
                          handleOpenRefund({
                            id: p.id,
                            paymentId: p.id,
                            date: p.paymentDate || p.dueDate || '',
                            type: 'PAYMENT_RECEIVED',
                            typeLabel: `Recebido via ${p.billingType}`,
                            description: p.description || 'Cobrança Asaas',
                            value: Number(p.value) || 0,
                            customerName: paymentDetails.customer?.name
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                      >
                        <RotateCcw size={14} />
                        Estornar Pagamento
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  Nenhum dado encontrado para esta cobrança.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Confirmação de Estorno Seguro */}
      <AnimatePresence>
        {refundTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl relative"
            >
              <button
                onClick={() => setRefundTarget(null)}
                disabled={refunding}
                className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center">
                  <RotateCcw size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Estornar Pagamento</h3>
                  <p className="text-xs text-slate-500 font-mono">ID: {refundTarget.paymentId || refundTarget.id}</p>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-amber-900">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Atenção:</strong> O valor será debitado do seu saldo do Asaas e devolvido ao pagador. Essa operação é <strong>irreversível</strong>.
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60 space-y-1">
                  <div className="text-slate-500">Cobrança: <strong className="text-slate-900">{refundTarget.description}</strong></div>
                  {refundTarget.customerName && (
                    <div className="text-slate-500">Cliente: <strong className="text-slate-900">{refundTarget.customerName}</strong></div>
                  )}
                  <div className="text-slate-500">Valor Original: <strong className="text-slate-900">R$ {refundTarget.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></div>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Valor do Estorno (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={refundTarget.value}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    disabled={refunding}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Motivo do Estorno (Opcional)</label>
                  <textarea
                    rows={2}
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Ex: Cancelamento de plano solicitado pelo cliente"
                    disabled={refunding}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmRiskChecked}
                    onChange={(e) => setConfirmRiskChecked(e.target.checked)}
                    disabled={refunding}
                    className="mt-0.5 rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span className="text-[11px] font-medium text-slate-700 leading-tight">
                    Estou ciente e autorizo o débito do estorno na Conta Digital do Asaas.
                  </span>
                </label>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setRefundTarget(null)}
                    disabled={refunding}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExecuteRefund}
                    disabled={refunding || !confirmRiskChecked}
                    className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer text-xs"
                  >
                    <RotateCcw size={14} className={refunding ? 'animate-spin' : ''} />
                    <span>{refunding ? 'Estornando...' : 'Confirmar Estorno'}</span>
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
