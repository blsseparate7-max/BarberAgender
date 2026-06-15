import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  CreditCard, 
  DollarSign, 
  Smartphone, 
  FileText, 
  Info, 
  AlertCircle,
  Clock,
  Percent,
  Wallet,
  CheckCircle2,
  Ban,
  MoreVertical,
  ChevronRight,
  ArrowRightLeft,
  Loader2
} from 'lucide-react';
import { paymentMethodService } from '../services/paymentMethodService';
import { PaymentMethodConfig, PaymentMethod } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { ConfirmationModal } from './ConfirmationModal';

export function PaymentMethodManager() {
  const [methods, setMethods] = useState<PaymentMethodConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<PaymentMethodConfig>>({
    name: '',
    type: 'pix',
    status: 'active',
    feePercentage: 0,
    settlementDays: 0,
    receivesImmediately: true,
    entersCashImmediately: true,
    goesToReceivables: false,
    goesToClientAccount: false,
    allowsPartial: true,
    allowsSplit: true,
    description: '',
    internalNotes: ''
  });

  useEffect(() => {
    loadMethods();
  }, []);

  const loadMethods = async () => {
    try {
      const data = await paymentMethodService.getPaymentMethods();
      setMethods(data);
    } catch (error) {
      console.error("Erro ao carregar métodos:", error);
    } finally {
      setLoading(false);
    }
  };

  const { execute: handleSubmit, isLoading: isSaving } = useAsyncAction(async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await paymentMethodService.updatePaymentMethod(editingId, formData);
      } else {
        await paymentMethodService.createPaymentMethod(formData as Omit<PaymentMethodConfig, 'id' | 'createdAt' | 'updatedAt'>);
      }
      resetForm();
      loadMethods();
    } catch (error) {
      console.error("Erro ao salvar método:", error);
    }
  });

  const resetForm = () => {
    setEditingId(null);
    setIsFormOpen(false);
    setFormData({
      name: '',
      type: 'pix',
      status: 'active',
      feePercentage: 0,
      settlementDays: 0,
      receivesImmediately: true,
      entersCashImmediately: true,
      goesToReceivables: false,
      goesToClientAccount: false,
      allowsPartial: true,
      allowsSplit: true,
      description: '',
      internalNotes: ''
    });
  };

  const handleEdit = (method: PaymentMethodConfig) => {
    setEditingId(method.id);
    setFormData(method);
    setIsFormOpen(true);
  };

  const { execute: handleDelete, isLoading: isDeleting } = useAsyncAction(async (id: string) => {
    try {
      await paymentMethodService.deletePaymentMethod(id);
      loadMethods();
    } catch (error) {
      console.error("Erro ao excluir método:", error);
    }
  });

  const { execute: toggleStatus, isLoading: isToggling } = useAsyncAction(async (method: PaymentMethodConfig) => {
    try {
      await paymentMethodService.updatePaymentMethod(method.id, {
        status: method.status === 'active' ? 'inactive' : 'active'
      });
      loadMethods();
    } catch (error) {
      console.error("Erro ao alterar status:", error);
    }
  });

  const getIcon = (type: PaymentMethod) => {
    switch (type) {
      case 'pix': return <Smartphone size={20} />;
      case 'dinheiro': return <DollarSign size={20} />;
      case 'credito':
      case 'debito': return <CreditCard size={20} />;
      case 'fiado': return <FileText size={20} />;
      case 'assinatura': return <Wallet size={20} />;
      default: return <CreditCard size={20} />;
    }
  };

  const getDestinationLabel = (method: PaymentMethodConfig) => {
    if (method.goesToClientAccount) return 'Conta do Cliente';
    if (method.goesToReceivables) return 'Recebíveis';
    if (method.entersCashImmediately) return 'Caixa Diário';
    return 'Outros';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={40} />
        <p className="text-muted font-medium animate-pulse">Carregando métodos de pagamento...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">Métodos de Pagamento</h1>
          <p className="text-muted text-sm">Configure as regras financeiras para cada forma de recebimento.</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="flex items-center justify-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-sm active:scale-95"
        >
          <Plus size={18} />
          <span>Novo Método</span>
        </button>
      </header>

      <div className="bg-surface border border-border rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Nome / Tipo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Prazo</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Taxa</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Destino Financeiro</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {methods.map((method, index) => (
                <tr key={`method-mgr-${method.id || index}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-accent border border-slate-100 group-hover:border-accent/30 transition-colors shadow-sm">
                        {getIcon(method.type)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-primary">{method.name}</p>
                        <p className="text-[10px] text-muted uppercase tracking-tighter font-bold">{method.type}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock size={14} className="text-slate-400" />
                      <span className="text-sm font-bold">D+{method.settlementDays}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Percent size={14} className="text-slate-400" />
                      <span className="text-sm font-bold">{method.feePercentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                      method.goesToClientAccount ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      method.goesToReceivables ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {getDestinationLabel(method)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleStatus(method)}
                      disabled={isToggling}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        method.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
                          : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                      }`}
                    >
                      {method.status === 'active' ? (
                        <>
                          <CheckCircle2 size={12} />
                          Ativo
                        </>
                      ) : (
                        <>
                          <Ban size={12} />
                          Inativo
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(method)}
                        className="p-2 text-slate-300 hover:text-primary hover:bg-slate-50 rounded-lg transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setConfirmDeleteId(method.id)}
                        disabled={isDeleting}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface border border-border w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent/5 border border-accent/10 rounded-xl flex items-center justify-center text-accent shadow-sm">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-primary">
                      {editingId ? 'Editar Método' : 'Novo Método de Pagamento'}
                    </h2>
                    <p className="text-xs text-muted font-medium">Configure as regras de recebimento e taxas.</p>
                  </div>
                </div>
                <button onClick={resetForm} className="p-2 text-muted hover:text-primary transition-colors">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-8 custom-scrollbar">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Nome do Método</label>
                    <input 
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none"
                      placeholder="Ex: Cartão de Crédito Visa"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Tipo de Pagamento</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value as PaymentMethod })}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none cursor-pointer"
                    >
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="debito">Débito</option>
                      <option value="credito">Crédito</option>
                      <option value="fiado">Fiado (Conta Cliente)</option>
                      <option value="assinatura">Assinatura</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Descrição (Opcional)</label>
                  <input 
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none"
                    placeholder="Ex: Recebimento via maquininha Stone"
                  />
                </div>

                {/* Financial Rules */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 space-y-6 shadow-sm">
                  <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                    <DollarSign size={16} className="text-emerald-600" />
                    Regras Financeiras
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Taxa Administrativa (%)</label>
                      <div className="relative">
                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="number"
                          step="0.01"
                          required
                          value={formData.feePercentage}
                          onChange={e => setFormData({ ...formData, feePercentage: parseFloat(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Prazo de Recebimento (Dias)</label>
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <select 
                          value={formData.settlementDays}
                          onChange={e => setFormData({ ...formData, settlementDays: parseInt(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none cursor-pointer"
                        >
                          <option value="0">D+0 (Na hora)</option>
                          <option value="1">D+1 (Próximo dia)</option>
                          <option value="2">D+2</option>
                          <option value="7">D+7 (Uma semana)</option>
                          <option value="14">D+14 (Duas semanas)</option>
                          <option value="30">D+30 (Um mês)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ToggleButton 
                      label="Recebe na hora?" 
                      checked={formData.receivesImmediately || false} 
                      onChange={v => setFormData({...formData, receivesImmediately: v})} 
                    />
                    <ToggleButton 
                      label="Entra no caixa na hora?" 
                      checked={formData.entersCashImmediately || false} 
                      onChange={v => setFormData({...formData, entersCashImmediately: v})} 
                    />
                    <ToggleButton 
                      label="Vai para Recebíveis?" 
                      checked={formData.goesToReceivables || false} 
                      onChange={v => setFormData({...formData, goesToReceivables: v})} 
                    />
                    <ToggleButton 
                      label="Vai para Conta do Cliente?" 
                      checked={formData.goesToClientAccount || false} 
                      onChange={v => setFormData({...formData, goesToClientAccount: v})} 
                    />
                    <ToggleButton 
                      label="Permite Pagamento Parcial?" 
                      checked={formData.allowsPartial || false} 
                      onChange={v => setFormData({...formData, allowsPartial: v})} 
                    />
                    <ToggleButton 
                      label="Permite Split (Dividido)?" 
                      checked={formData.allowsSplit || false} 
                      onChange={v => setFormData({...formData, allowsSplit: v})} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Observações Internas</label>
                  <textarea 
                    value={formData.internalNotes}
                    onChange={e => setFormData({ ...formData, internalNotes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary min-h-[80px] resize-none"
                    placeholder="Notas para uso interno da administração..."
                  />
                </div>

                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                  <label className="text-sm font-bold text-primary">Status do Método:</label>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, status: 'active'})}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${formData.status === 'active' ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-white text-muted border-slate-200'}`}
                    >
                      Ativo
                    </button>
                    <button 
                      type="button"
                      onClick={() => setFormData({...formData, status: 'inactive'})}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${formData.status === 'inactive' ? 'bg-red-500 text-white border-red-600' : 'bg-white text-muted border-slate-200'}`}
                    >
                      Inativo
                    </button>
                  </div>
                </div>

                <div className="pt-4 flex gap-3 sticky bottom-0 bg-surface py-4 border-t border-border">
                  <button 
                    type="button"
                    onClick={resetForm}
                    className="flex-1 py-3 border border-border rounded-xl font-bold text-sm text-muted hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-[2] py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : (editingId ? 'Salvar Alterações' : 'Cadastrar Método')}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmationModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Excluir Método"
        description="Deseja realmente excluir este método de pagamento? Esta ação removerá a opção de novos lançamentos com este método."
        variant="danger"
        confirmLabel="Excluir"
      />
    </div>
  );
}

function ToggleButton({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between p-3 rounded-xl border transition-all shadow-sm ${
        checked 
          ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
          : 'bg-white border-slate-200 text-slate-400'
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-tight">{label}</span>
      <div className={`w-8 h-4 rounded-full relative transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}>
        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </div>
    </button>
  );
}
