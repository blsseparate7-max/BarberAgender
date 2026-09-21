import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Trash2, 
  X, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  RefreshCw, 
  HelpCircle,
  DollarSign,
  Lock,
  Unlock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { commissionService } from '../../services/commissionService';
import { useAuth } from '../../contexts/AuthContext';

interface DeleteAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  advanceId: string | null;
  advanceFallback?: {
    description?: string;
    amount?: number;
    date?: string;
    profissional_name?: string;
    status?: string;
    caixa_id?: string;
  };
  onSuccess: () => void;
}

export function DeleteAdvanceModal({
  isOpen,
  onClose,
  advanceId,
  advanceFallback,
  onSuccess
}: DeleteAdvanceModalProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [selectedDestination, setSelectedDestination] = useState<'current_cash' | 'original_cash' | 'none'>('current_cash');

  useEffect(() => {
    if (isOpen && advanceId) {
      loadStatus();
    } else {
      setStatusInfo(null);
      setSelectedDestination('current_cash');
    }
  }, [isOpen, advanceId]);

  const loadStatus = async () => {
    if (!advanceId) return;
    setLoading(true);
    try {
      const info = await commissionService.checkAdvanceCashStatus(advanceId);
      setStatusInfo(info);
      if (info.isOriginalCashClosed) {
        if (info.hasOpenCashToday) {
          setSelectedDestination('current_cash');
        } else {
          setSelectedDestination('none');
        }
      }
    } catch (error) {
      console.error("Erro ao verificar status do caixa para o vale:", error);
      toast.error("Erro ao checar status do caixa.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !advanceId) return null;

  const currentAdv = statusInfo?.advance || advanceFallback || {};
  const amount = Number(currentAdv.amount || 0);
  const proName = currentAdv.profissional_name || 'Profissional';
  const desc = currentAdv.description || 'Vale / Adiantamento';
  const originalDate = statusInfo?.originalCashDate || currentAdv.date || '';
  const isOriginalCashClosed = statusInfo?.isOriginalCashClosed;
  const isAlreadyPaid = statusInfo?.isAlreadyPaid;
  const hasOpenCashToday = statusInfo?.hasOpenCashToday;

  const handleConfirm = async () => {
    if (!advanceId) return;
    setSubmitting(true);
    try {
      await commissionService.deleteAdvance(advanceId, {
        refundDestination: isOriginalCashClosed ? selectedDestination : undefined,
        authorId: user?.uid,
        authorName: profile?.nome || 'Admin',
        reason: 'Exclusão de vale via painel administrativo'
      });

      toast.success(
        isOriginalCashClosed && selectedDestination === 'current_cash'
          ? `Vale excluído! R$ ${amount.toFixed(2)} devolvido no caixa de hoje e comissão restaurada.`
          : isOriginalCashClosed && selectedDestination === 'original_cash'
          ? `Caixa de ${originalDate} reaberto e vale estornado com sucesso!`
          : `Vale excluído e comissão de R$ ${amount.toFixed(2)} restaurada!`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Erro ao excluir vale:", err);
      toast.error(err.message || "Erro ao excluir vale.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white border border-slate-200 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 shadow-2xs">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Excluir e Estornar Vale</h3>
              <p className="text-xs text-slate-400 font-semibold">Conciliação financeira e restauração de comissão</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-9 h-9 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-800 hover:bg-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-left flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin text-blue-600" />
              <p className="text-xs font-bold">Verificando integridade contábil do caixa...</p>
            </div>
          ) : isAlreadyPaid ? (
            <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-black text-sm">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <span>Vale Já Descontado em Repasse</span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed font-medium">
                Este adiantamento de <strong>R$ {amount.toFixed(2)}</strong> já foi quitado e descontado do profissional <strong>{proName}</strong> em um repasse anterior.
              </p>
              <p className="text-[11px] text-amber-700 font-semibold">
                Para cancelar este vale, vá até a aba de <strong>Repasses Realizados</strong> e estorne o pagamento de comissão que o utilizou.
              </p>
            </div>
          ) : (
            <>
              {/* Vale summary card */}
              <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Profissional & Vale</span>
                  <h4 className="text-sm font-black text-slate-900">{proName}</h4>
                  <p className="text-xs text-slate-500 font-medium truncate">{desc}</p>
                  {originalDate && (
                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                      Data de Lançamento: {format(new Date(originalDate + 'T00:00:00'), 'dd/MM/yyyy')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-500 block mb-0.5">Valor do Vale</span>
                  <span className="text-xl font-black font-mono text-rose-600">
                    - R$ {amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Status explanation */}
              {!isOriginalCashClosed ? (
                <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-black text-xs">
                    <Unlock size={16} className="text-emerald-600 shrink-0" />
                    <span>O Caixa da Data deste Vale está ABERTO</span>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                    Ao confirmar a exclusão:
                  </p>
                  <ul className="text-xs text-emerald-800 space-y-1.5 font-semibold list-disc list-inside pl-1">
                    <li>O valor de <strong>R$ {amount.toFixed(2)}</strong> retornará automaticamente para a gaveta do caixa.</li>
                    <li>A dedução será removida e a comissão líquida de <strong>{proName}</strong> aumentará em <strong>R$ {amount.toFixed(2)}</strong>.</li>
                    <li>A despesa vinculada será cancelada no Financeiro/DRE.</li>
                  </ul>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-amber-50/70 border border-amber-200 p-4 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 font-black text-xs">
                      <Lock size={16} className="text-amber-600 shrink-0" />
                      <span>Caixa Original Encerrado</span>
                    </div>
                    <p className="text-xs text-amber-900 leading-relaxed font-medium">
                      O vale original foi pago em um caixa que já foi <strong>fechado ({originalDate ? format(new Date(originalDate + 'T00:00:00'), 'dd/MM/yyyy') : 'anterior'})</strong>. 
                      Como deseja tratar o valor financeiro de <strong>R$ {amount.toFixed(2)}</strong>?
                    </p>
                  </div>

                  {/* Options */}
                  <div className="space-y-2.5">
                    {/* Option 1: Current Cash */}
                    <label
                      onClick={() => hasOpenCashToday && setSelectedDestination('current_cash')}
                      className={`block p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        selectedDestination === 'current_cash'
                          ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                          : hasOpenCashToday
                          ? 'border-slate-200 hover:border-slate-300 bg-white'
                          : 'border-slate-200 bg-slate-100 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="refundDestination"
                          value="current_cash"
                          checked={selectedDestination === 'current_cash'}
                          onChange={() => hasOpenCashToday && setSelectedDestination('current_cash')}
                          disabled={!hasOpenCashToday}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">
                              Devolver dinheiro no Caixa Aberto de Hoje
                            </span>
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-md">
                              Recomendado
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                            O profissional devolveu os R$ {amount.toFixed(2)} em espécie hoje. Entrará como estorno na gaveta do caixa de hoje, a comissão do profissional é restaurada e o histórico do dia fechado permanece intacto.
                          </p>
                          {!hasOpenCashToday && (
                            <p className="text-[11px] text-amber-700 font-bold mt-1.5 flex items-center gap-1">
                              <AlertTriangle size={12} /> Nenhum caixa diário aberto hoje. Abra o caixa de hoje para usar esta opção.
                            </p>
                          )}
                        </div>
                      </div>
                    </label>

                    {/* Option 2: Reopen Original Cash */}
                    <label
                      onClick={() => setSelectedDestination('original_cash')}
                      className={`block p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        selectedDestination === 'original_cash'
                          ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="refundDestination"
                          value="original_cash"
                          checked={selectedDestination === 'original_cash'}
                          onChange={() => setSelectedDestination('original_cash')}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-black text-slate-900">
                            Reabrir o Caixa de {originalDate ? format(new Date(originalDate + 'T00:00:00'), 'dd/MM/yyyy') : 'data original'}
                          </span>
                          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                            Use se o vale foi lançado por erro na data original. A sessão do caixa daquele dia será reaberta para recalcular a gaveta daquela data.
                          </p>
                        </div>
                      </div>
                    </label>

                    {/* Option 3: None */}
                    <label
                      onClick={() => setSelectedDestination('none')}
                      className={`block p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        selectedDestination === 'none'
                          ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="refundDestination"
                          value="none"
                          checked={selectedDestination === 'none'}
                          onChange={() => setSelectedDestination('none')}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <span className="text-xs font-black text-slate-900">
                            Apenas restaurar comissão (Sem mexer em dinheiro)
                          </span>
                          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">
                            Cancela o vale e devolve a comissão de {proName}, sem movimentar nenhuma gaveta física de dinheiro.
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          {!isAlreadyPaid && (
            <button
              type="button"
              disabled={loading || submitting}
              onClick={handleConfirm}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-sm flex items-center gap-2 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Estornando...</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>Confirmar e Estornar</span>
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
