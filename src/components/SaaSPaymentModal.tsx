import React, { useState, useEffect } from 'react';
import { 
  X, 
  CreditCard, 
  QrCode, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Loader2, 
  Sparkles, 
  Building, 
  Mail, 
  FileText,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { saasGatewayService, SaaSChargeResponse } from '../services/saasGatewayService';

interface SaaSPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId?: string;
  defaultTenantName?: string;
  defaultOwnerEmail?: string;
  defaultOwnerCpfCnpj?: string;
  planName: string;
  price: number;
  onSuccessConfirm?: () => Promise<void> | void;
  isAdminLinkGenerator?: boolean;
}

export function SaaSPaymentModal({
  isOpen,
  onClose,
  tenantId = 'barbearia',
  defaultTenantName = '',
  defaultOwnerEmail = '',
  defaultOwnerCpfCnpj = '',
  planName,
  price,
  onSuccessConfirm,
  isAdminLinkGenerator = false
}: SaaSPaymentModalProps) {
  const [tenantName, setTenantName] = useState(defaultTenantName);
  const [ownerEmail, setOwnerEmail] = useState(defaultOwnerEmail);
  const [ownerCpfCnpj, setOwnerCpfCnpj] = useState(defaultOwnerCpfCnpj);
  const [billingType, setBillingType] = useState<'PIX' | 'CREDIT_CARD'>('PIX');

  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [chargeData, setChargeData] = useState<SaaSChargeResponse | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTenantName(defaultTenantName || 'Barbearia');
      setOwnerEmail(defaultOwnerEmail || '');
      setOwnerCpfCnpj(defaultOwnerCpfCnpj || '');
      setChargeData(null);
      setCopiedPix(false);
      setCopiedLink(false);
    }
  }, [isOpen, defaultTenantName, defaultOwnerEmail, defaultOwnerCpfCnpj]);

  // Helper validation for CPF/CNPJ
  const isValidCPF = (cpf: string) => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;
    return true;
  };

  const isValidCNPJ = (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;
    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return false;
    return true;
  };

  const isValidCpfCnpj = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length === 11) return isValidCPF(clean);
    if (clean.length === 14) return isValidCNPJ(clean);
    return false;
  };

  // Helper mask for CPF/CNPJ formatting
  const handleCpfCnpjChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 11) {
      // Format as CPF: 000.000.000-00
      let formatted = digits;
      if (digits.length > 9) formatted = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      else if (digits.length > 6) formatted = digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      else if (digits.length > 3) formatted = digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      setOwnerCpfCnpj(formatted);
    } else {
      // Format as CNPJ: 00.000.000/0000-00
      let formatted = digits.slice(0, 14);
      if (digits.length > 12) formatted = formatted.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
      else if (digits.length > 8) formatted = formatted.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
      else if (digits.length > 5) formatted = formatted.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
      else if (digits.length > 2) formatted = formatted.replace(/(\d{2})(\d{1,3})/, '$1.$2');
      setOwnerCpfCnpj(formatted);
    }
  };

  const handleGenerateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCpfCnpj = ownerCpfCnpj.replace(/\D/g, '');
    
    if (!rawCpfCnpj || (rawCpfCnpj.length !== 11 && rawCpfCnpj.length !== 14)) {
      toast.error("Por favor, preencha um CPF (11 dígitos) ou CNPJ (14 dígitos) válido para o faturamento.");
      return;
    }

    if (!isValidCpfCnpj(rawCpfCnpj)) {
      toast.error("O CPF ou CNPJ informado é matematicamente inválido. Por favor, verifique os dígitos ou preencha um documento válido.");
      return;
    }

    try {
      setLoading(true);
      const res = await saasGatewayService.createSaaSCharge({
        tenantId,
        tenantName: tenantName || tenantId,
        ownerEmail: ownerEmail || `financeiro@${tenantId}.com`,
        ownerCpfCnpj: rawCpfCnpj,
        planId: planName.toLowerCase(),
        planName,
        amount: price,
        billingType
      });

      setChargeData(res);
      toast.success(
        billingType === 'PIX' 
          ? "Cobrança Pix gerada com sucesso!" 
          : "Link de checkout para Cartão de Crédito Recorrente gerado com sucesso!"
      );
    } catch (err: any) {
      console.error("Erro ao gerar cobrança:", err);
      toast.error(err.message || "Erro ao gerar cobrança via Asaas.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPix = () => {
    if (!chargeData?.pixCopiaECola) return;
    navigator.clipboard.writeText(chargeData.pixCopiaECola);
    setCopiedPix(true);
    toast.success("Código Pix Copia e Cola copiado para a área de transferência!");
    setTimeout(() => setCopiedPix(false), 3000);
  };

  const handleCopyPaymentLink = () => {
    const link = chargeData?.paymentUrl || chargeData?.pixCopiaECola || '';
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast.success("Link de cobrança copiado com sucesso!");
    setTimeout(() => setCopiedLink(false), 3000);
  };

  const handleConfirmPayment = async () => {
    try {
      setConfirming(true);
      if (onSuccessConfirm) {
        await onSuccessConfirm();
      } else {
        await saasGatewayService.confirmSaaSPlanPayment(tenantId, planName, price, 1);
        toast.success(`Plano ${planName} ativado com sucesso para ${tenantName}!`);
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao confirmar pagamento.");
    } finally {
      setConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden my-8 text-left"
        >
          {/* Top Header Decorative Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-primary to-slate-900 p-6 sm:p-8 text-white relative">
            <button
              onClick={onClose}
              type="button"
              className="absolute top-6 right-6 text-slate-400 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest mb-1">
              <Sparkles size={14} />
              <span>Assinatura BarberElite SaaS</span>
            </div>

            <h3 className="text-2xl font-black tracking-tight text-white">
              Plano {planName}
            </h3>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black text-white">
                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wider">/ mês</span>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 sm:p-8 space-y-6">
            {!chargeData ? (
              /* FORM STEP */
              <form onSubmit={handleGenerateCharge} className="space-y-4">
                <p className="text-xs font-bold text-slate-500 leading-relaxed">
                  Informe os dados do responsável ou da barbearia para emissão da cobrança e nota fiscal.
                </p>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Building size={12} className="text-primary" />
                      Nome da Barbearia / Razão Social
                    </label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="Ex: Barbearia Elite Central"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800 focus:bg-white focus:border-primary focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Mail size={12} className="text-primary" />
                      E-mail do Proprietário
                    </label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="Ex: proprietario@barbearia.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs font-bold text-slate-800 focus:bg-white focus:border-primary focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <FileText size={12} className="text-primary" />
                        CPF ou CNPJ (Obrigatório para Emissão Asaas)
                      </label>
                      <button 
                        type="button" 
                        onClick={() => handleCpfCnpjChange('11444777000161')} 
                        className="text-[10px] text-primary hover:underline font-extrabold"
                      >
                        Gerar CNPJ Teste
                      </button>
                    </div>
                    <input
                      type="text"
                      value={ownerCpfCnpj}
                      onChange={(e) => handleCpfCnpjChange(e.target.value)}
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      className={`w-full bg-slate-50 border rounded-2xl py-3 px-4 text-xs font-bold text-slate-800 focus:bg-white focus:outline-none transition-all ${
                        ownerCpfCnpj && !isValidCpfCnpj(ownerCpfCnpj.replace(/\D/g, '')) 
                          ? 'border-rose-300 focus:border-rose-500 bg-rose-50/20' 
                          : 'border-slate-200 focus:border-primary'
                      }`}
                      required
                    />
                    {ownerCpfCnpj && !isValidCpfCnpj(ownerCpfCnpj.replace(/\D/g, '')) ? (
                      <p className="text-[10px] text-rose-500 font-bold mt-0.5 flex items-center gap-1">
                        <AlertCircle size={10} />
                        CPF/CNPJ inválido. Clique em "Gerar CNPJ Teste" ou digite um documento válido.
                      </p>
                    ) : (
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        O CPF/CNPJ é exigido pelas regras bancárias do Asaas para geração de cobranças.
                      </p>
                    )}
                  </div>

                  {/* Payment Method Selector */}
                  <div className="pt-2 space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Forma de Pagamento
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setBillingType('PIX')}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all active:scale-95 ${
                          billingType === 'PIX'
                            ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 shadow-sm'
                            : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <QrCode size={20} className={billingType === 'PIX' ? 'text-emerald-600' : 'text-slate-400'} />
                          {billingType === 'PIX' && <Check size={16} className="text-emerald-600 font-bold" />}
                        </div>
                        <div className="mt-3">
                          <span className="text-xs font-black block">PIX Instantâneo</span>
                          <span className="text-[10px] font-semibold opacity-75">QR Code + Copia e Cola</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setBillingType('CREDIT_CARD')}
                        className={`p-4 rounded-2xl border text-left flex flex-col justify-between transition-all active:scale-95 ${
                          billingType === 'CREDIT_CARD'
                            ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950 shadow-sm'
                            : 'bg-slate-50/50 border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <CreditCard size={20} className={billingType === 'CREDIT_CARD' ? 'text-indigo-600' : 'text-slate-400'} />
                          {billingType === 'CREDIT_CARD' && <Check size={16} className="text-indigo-600 font-bold" />}
                        </div>
                        <div className="mt-3">
                          <span className="text-xs font-black block">Cartão Recorrente</span>
                          <span className="text-[10px] font-semibold opacity-75">Cobrança Mensal Automática</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 bg-primary hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/10 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-amber-400" />
                        <span>Gerando Fatura no Asaas...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} className="text-amber-400" />
                        <span>Continuar para Pagamento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* CHARGE RESULT STEP */
              <div className="space-y-6">
                {billingType === 'PIX' ? (
                  /* PIX RESULT */
                  <div className="space-y-5 text-center">
                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl inline-flex items-center gap-2 text-emerald-800 text-xs font-extrabold">
                      <QrCode size={16} className="text-emerald-600" />
                      <span>Fatura Pix Gerada com Sucesso</span>
                    </div>

                    {/* QR Code display */}
                    {chargeData.pixQrCodeUrl ? (
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="p-3 bg-white border-2 border-emerald-500 rounded-3xl shadow-lg inline-block">
                          <img
                            src={chargeData.pixQrCodeUrl}
                            alt="Pix QR Code"
                            className="w-48 h-48 object-contain rounded-xl"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">
                          Abra o app do seu banco e escaneie o código QR acima
                        </p>
                      </div>
                    ) : null}

                    {/* Copia e cola string */}
                    {chargeData.pixCopiaECola && (
                      <div className="space-y-2 text-left">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Pix Copia e Cola
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={chargeData.pixCopiaECola}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-[11px] font-mono text-slate-600 truncate focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleCopyPix}
                            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                          >
                            {copiedPix ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            <span>{copiedPix ? "Copiado!" : "Copiar"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* CREDIT CARD RECURRING RESULT */
                  <div className="space-y-5 text-center">
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-left space-y-2">
                      <div className="flex items-center gap-2 text-indigo-900 text-xs font-extrabold">
                        <CreditCard size={18} className="text-indigo-600" />
                        <span>Assinatura Recorrente no Cartão de Crédito</span>
                      </div>
                      <p className="text-[11px] text-indigo-800/80 font-semibold leading-relaxed">
                        Você será redirecionado para a página de checkout seguro do Asaas para preencher os dados do seu cartão. O valor de <strong>R$ {price.toFixed(2)}/mês</strong> será debitado automaticamente todo mês.
                      </p>
                    </div>

                    {chargeData.paymentUrl && (
                      <a
                        href={chargeData.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <ExternalLink size={16} />
                        <span>Pagar no Cartão de Crédito (Checkout Seguro Asaas)</span>
                      </a>
                    )}
                  </div>
                )}

                {/* Shared Action buttons */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <button
                    type="button"
                    onClick={handleConfirmPayment}
                    disabled={confirming}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {confirming ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Ativando Plano...</span>
                      </>
                    ) : (
                      <>
                        <Check size={16} />
                        <span>{isAdminLinkGenerator ? "Simular Confirmação de Pagamento" : "Já Concluí o Pagamento / Liberar Plano"}</span>
                      </>
                    )}
                  </button>

                  {(chargeData.paymentUrl || chargeData.pixCopiaECola) && (
                    <button
                      type="button"
                      onClick={handleCopyPaymentLink}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-2 transition-all"
                    >
                      {copiedLink ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{copiedLink ? "Link Copiado!" : "Copiar Link de Cobrança para Enviar"}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
