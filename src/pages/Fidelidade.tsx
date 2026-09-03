
import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Coins, 
  History, 
  Settings, 
  Plus, 
  Minus, 
  ChevronRight, 
  Star, 
  TrendingUp, 
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Users,
  Gift,
  Zap,
  ShieldCheck,
  Search,
  Tag,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { loyaltyService } from '../services/loyaltyService';
import { userService } from '../services/userService';
import { LoyaltyConfig, LoyaltyPoints, LoyaltyHistory, UserProfile, LoyaltyVoucher } from '../types';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { toast } from 'sonner';

export function Fidelidade({ activeSubTab }: { activeSubTab?: string }) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [activeTab, setActiveTab] = useState<'meu_saldo' | 'clientes' | 'cupons' | 'configuracoes' | 'historico'>('meu_saldo');
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [clientPoints, setClientPoints] = useState<LoyaltyPoints | null>(null);
  const [history, setHistory] = useState<LoyaltyHistory[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [vouchers, setVouchers] = useState<LoyaltyVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [modalLoyaltyMode, setModalLoyaltyMode] = useState<'saldo' | 'pontos'>('saldo');
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<UserProfile | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleRetroactiveSync = async () => {
    setIsSyncing(true);
    try {
      const tenantId = profile?.tenantId || 'gbcortes7';
      const result = await loyaltyService.syncRetroactiveLoyalty(tenantId);
      toast.success(
        `Fidelidade Sincronizada! ${result.countSynced} comandas de setembro processadas com sucesso. Pontos: +${result.totalPointsAwarded} | Cashback: +R$ ${result.totalCashbackAwarded.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      );
      loadData();
    } catch (err: any) {
      console.error("Erro no sync retroativo:", err);
      toast.error(err.message || "Erro ao sincronizar pontos.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (activeSubTab) {
      if (activeSubTab === 'fidelidade-programa') {
        setActiveTab(profile?.tipo === 'cliente' ? 'meu_saldo' : 'clientes');
      } else if (activeSubTab === 'fidelidade-cashback') {
        setActiveTab(profile?.tipo === 'cliente' ? 'meu_saldo' : 'clientes');
        if (isAdmin || isGerente) {
          setShowConfigModal(true);
        }
      } else if (activeSubTab === 'fidelidade-vip') {
        setActiveTab('clientes');
      } else if (activeSubTab === 'fidelidade-campanhas') {
        setActiveTab('historico');
      }
    }
  }, [activeSubTab, profile?.tipo, isAdmin, isGerente]);

  useEffect(() => {
    if (profile?.tipo !== 'cliente' && activeTab === 'meu_saldo') {
      setActiveTab('clientes');
      return;
    }
    loadData();
  }, [profile?.uid, profile?.tipo, activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const c = await loyaltyService.getConfig();
      setConfig(c);

      if (profile?.tipo === 'cliente') {
        const [p, h, v] = await Promise.all([
          loyaltyService.getClientPoints(user!.uid),
          loyaltyService.getHistory(user!.uid),
          loyaltyService.getClientVouchers(user!.uid)
        ]);
        setClientPoints(p);
        setHistory(h);
        setVouchers(v);
      } else {
        if (activeTab === 'clientes') {
          const cls = await userService.getAllClients();
          setClients(cls);
        } else if (activeTab === 'cupons') {
          const v = await loyaltyService.getAllVouchers();
          setVouchers(v);
        } else if (activeTab === 'historico') {
          const h = await loyaltyService.getHistory();
          setHistory(h);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar fidelidade:", error);
    } finally {
      setLoading(false);
    }
  };

  const { execute: handleUpdateConfig, isLoading: isUpdatingConfig } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!config) return;
    const formData = new FormData(e.currentTarget);
    const mode = modalLoyaltyMode;
    const data = {
      loyaltyMode: mode,
      cashbackEnabled: formData.get('cashbackEnabled') === 'true',
      cashbackType: (formData.get('cashbackType') as any) || 'percentual',
      cashbackPercentage: Number(formData.get('cashbackPercentage')) || 0,
      cashbackFixedValue: Number(formData.get('cashbackFixedValue')) || 0,
      minRedemptionValue: Number(formData.get('minRedemptionValue')) || 0,
      pointsPerReal: Number(formData.get('pointsPerReal')) || 0,
      pointsPerAppointment: Number(formData.get('pointsPerAppointment')) || 0,
      minRedemptionPoints: Number(formData.get('minRedemptionPoints')) || 0,
    };

    try {
      await loyaltyService.updateConfig(config.id, data);
      setShowConfigModal(false);
      loadData();
    } catch (error) {
      console.error("Erro ao atualizar configurações:", error);
    }
  });

  const { execute: handleRedeem, isLoading: isRedeeming } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedClient) return;
    const formData = new FormData(e.currentTarget);
    const points = Number(formData.get('points'));
    const cashback = Number(formData.get('cashback'));
    const description = formData.get('description') as string;

    try {
      await loyaltyService.redeemPoints(selectedClient.uid, points, cashback, description);
      setShowRedeemModal(false);
      setSelectedClient(null);
      loadData();
    } catch (error: any) {
      console.error("Erro ao resgatar pontos:", error);
      throw error;
    }
  });  if (loading && !config) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Carregando fidelidade...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary mb-1">Programa de Fidelidade</h1>
          <p className="text-muted text-sm">Pontos, cashback e benefícios para clientes VIP.</p>
        </div>
        {(isAdmin || isGerente) && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleRetroactiveSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
              <span>{isSyncing ? "Sincronizando..." : "Sincronizar Retroativo (Setembro)"}</span>
            </button>
            <button 
              onClick={() => setShowConfigModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-border text-primary rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-95"
            >
              <Settings size={18} />
              <span>Configurar Regras</span>
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100/50 border border-border rounded-2xl w-fit overflow-x-auto max-w-full">
        {profile?.tipo === 'cliente' && (
          <TabButton active={activeTab === 'meu_saldo'} onClick={() => setActiveTab('meu_saldo')} label="Meu Saldo" icon={<Award size={16} />} />
        )}
        {(isAdmin || isGerente) && (
          <TabButton active={activeTab === 'clientes'} onClick={() => setActiveTab('clientes')} label="Clientes" icon={<Users size={16} />} />
        )}
        <TabButton active={activeTab === 'cupons'} onClick={() => setActiveTab('cupons')} label="Vouchers de Resgate" icon={<Tag size={16} />} />
        <TabButton active={activeTab === 'historico'} onClick={() => setActiveTab('historico')} label="Histórico" icon={<History size={16} />} />
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'meu_saldo' && clientPoints && (
          <motion.div 
            key="meu_saldo"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <div className="bg-surface border border-border rounded-2xl p-8 space-y-6 relative overflow-hidden group shadow-sm">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity text-accent">
                <Award size={120} />
              </div>
              <div className="w-14 h-14 bg-accent/5 border border-accent/10 rounded-2xl flex items-center justify-center text-accent">
                <Award size={28} />
              </div>
              <div>
                <p className="text-4xl font-bold text-primary">{clientPoints.points}</p>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Pontos Acumulados</p>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted font-medium">Faltam <span className="text-primary font-bold">{(config?.vipThreshold || 1000) - clientPoints.points}</span> pontos para o nível VIP.</p>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-8 space-y-6 relative overflow-hidden group shadow-sm">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity text-amber-500">
                <Coins size={120} />
              </div>
              <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-center text-amber-500">
                <Coins size={28} />
              </div>
              <div>
                <p className="text-4xl font-bold text-primary">R$ {clientPoints.cashback.toFixed(2)}</p>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Saldo de Cashback</p>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted font-medium">Use seu saldo para pagar serviços ou produtos.</p>
              </div>
            </div>

            <div className={`bg-surface border rounded-2xl p-8 space-y-6 relative overflow-hidden group shadow-sm ${clientPoints.isVip ? 'border-accent/30 bg-accent/5' : 'border-border'}`}>
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity text-emerald-500">
                <ShieldCheck size={120} />
              </div>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${clientPoints.isVip ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                <ShieldCheck size={28} />
              </div>
              <div>
                <p className="text-4xl font-bold text-primary">{clientPoints.isVip ? 'VIP' : 'Padrão'}</p>
                <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-1">Status da Conta</p>
              </div>
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted font-medium">{clientPoints.isVip ? 'Você tem benefícios exclusivos!' : 'Torne-se VIP para benefícios exclusivos.'}</p>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'clientes' && (
          <motion.div 
            key="clientes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {clients.map((client, index) => (
                <ClientLoyaltyCard 
                  key={`client-loyalty-${client.uid || index}-${index}`} 
                  client={client} 
                  config={config}
                  onRedeem={() => { setSelectedClient(client); setShowRedeemModal(true); }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'cupons' && (
          <motion.div 
            key="cupons"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-bold text-primary">Vouchers / Cupons de Resgate de Pontos</h3>
                  <p className="text-xs text-muted">Tokens gerados pelos clientes para trocar pontos por cortes ou produtos.</p>
                </div>
                <span className="text-xs font-bold text-muted bg-white px-2.5 py-1 rounded-lg border border-border">
                  {vouchers.length} {vouchers.length === 1 ? 'voucher' : 'vouchers'}
                </span>
              </div>

              {vouchers.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/30 border-b border-border">
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Token</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Cliente</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Item Resgatado</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-center">Pontos Gastos</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Status</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vouchers.map((v, index) => (
                      <tr key={`voucher-row-${v.id || index}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-xs text-indigo-600 tracking-wider">
                          {v.token}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-primary">{v.clientName}</p>
                          {v.clientPhone && <p className="text-[10px] text-muted">{v.clientPhone}</p>}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-semibold text-slate-800">{v.itemName}</span>
                          <span className="ml-2 text-[9px] font-bold text-muted uppercase tracking-widest px-1.5 py-0.5 bg-slate-100 rounded">
                            {v.itemType === 'service' ? 'Serviço' : 'Produto'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-black text-center text-indigo-600">
                          {v.pointsCost} pts
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-lg border ${
                            v.status === 'active' 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                              : v.status === 'used'
                              ? 'bg-slate-100 text-slate-500 border-slate-200'
                              : 'bg-red-50 text-red-600 border-red-100'
                          }`}>
                            {v.status === 'active' ? 'Disponível' : v.status === 'used' ? 'Utilizado na Comanda' : 'Expirado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-muted">
                          {v.createdAt ? v.createdAt.split('T')[0] : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-muted space-y-2">
                  <Tag className="mx-auto text-slate-300" size={32} />
                  <p className="text-xs font-bold">Nenhum voucher de resgate gerado ainda.</p>
                  <p className="text-[10px]">Quando os clientes resgatarem pontos no portal, os tokens aparecerão aqui.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'historico' && (
          <motion.div 
            key="historico"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm"
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-border">
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Data</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest">Descrição</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-right">Pontos</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-widest text-right">Cashback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((item, index) => (
                  <tr key={`fidel-hist-${item.id || index}-${index}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-xs text-muted font-bold">{format(parseISO(item.date), 'dd/MM/yyyy')}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-lg border ${
                        item.type === 'earn' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'
                      }`}>
                        {item.type === 'earn' ? 'Crédito' : 'Resgate'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600 font-medium">{item.description}</td>
                    <td className={`px-6 py-4 text-xs font-bold text-right ${item.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.type === 'earn' ? '+' : '-'}{item.points}
                    </td>
                    <td className={`px-6 py-4 text-xs font-bold text-right ${item.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.type === 'earn' ? '+' : '-'}R$ {item.cashback.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showConfigModal && config && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
            >
              <div className="p-6 md:p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-primary">Regras do Programa de Fidelidade</h2>
                  <p className="text-xs text-muted mt-0.5">Defina se a barbearia pontua por saldo em dinheiro ou por pontos.</p>
                </div>
                <button onClick={() => setShowConfigModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-muted transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleUpdateConfig} className="p-6 md:p-8 space-y-6 overflow-y-auto">
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                    <div>
                      <label className="text-sm font-bold text-primary block">Ativar Programa de Fidelidade</label>
                      <p className="text-xs text-muted">Quando ativo, o benefício é gerado automaticamente ao fechar comandas.</p>
                    </div>
                    <select 
                      name="cashbackEnabled" 
                      defaultValue={config.cashbackEnabled !== false ? 'true' : 'false'}
                      className="px-3 py-2 bg-white border border-border rounded-lg text-sm font-bold text-primary focus:outline-none"
                    >
                      <option value="true">Ativado</option>
                      <option value="false">Desativado</option>
                    </select>
                  </div>

                  {/* Mode Selector */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Critério de Recompensa</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setModalLoyaltyMode('saldo')}
                        className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between gap-2 ${
                          modalLoyaltyMode === 'saldo'
                            ? 'bg-amber-50/60 border-amber-500 ring-2 ring-amber-500/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xl">💰</span>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            modalLoyaltyMode === 'saldo' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {modalLoyaltyMode === 'saldo' ? 'Ativo' : 'Selecionar'}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Por Saldo (Cashback R$)</p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Dinheiro de volta para abater em contas futuras.</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalLoyaltyMode('pontos')}
                        className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col justify-between gap-2 ${
                          modalLoyaltyMode === 'pontos'
                            ? 'bg-indigo-50/60 border-indigo-600 ring-2 ring-indigo-600/20'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xl">🏅</span>
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            modalLoyaltyMode === 'pontos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {modalLoyaltyMode === 'pontos' ? 'Ativo' : 'Selecionar'}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Por Pontuação (Pontos)</p>
                          <p className="text-[10px] text-muted leading-tight mt-0.5">Pontos acumulados por R$ gasto ou visita.</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {modalLoyaltyMode === 'saldo' && (
                    <div className="space-y-4 p-5 bg-amber-50/40 rounded-2xl border border-amber-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Percentual de Retorno (%)</label>
                          <div className="relative">
                            <input 
                              name="cashbackPercentage" 
                              type="number" 
                              step="0.5"
                              min="0"
                              max="100"
                              defaultValue={config.cashbackPercentage ?? 5} 
                              required 
                              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-primary font-bold text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-amber-500/20" 
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted font-bold text-xs">%</span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Mínimo para Resgate (R$)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold text-xs">R$</span>
                            <input 
                              name="minRedemptionValue" 
                              type="number" 
                              step="1"
                              min="0"
                              defaultValue={config.minRedemptionValue ?? 10} 
                              required 
                              className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20" 
                            />
                          </div>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted">O cliente só pode resgatar o cashback quando atingir no mínimo o valor estipulado.</p>
                    </div>
                  )}

                  {modalLoyaltyMode === 'pontos' && (
                    <div className="space-y-4 p-5 bg-indigo-50/40 rounded-2xl border border-indigo-200/70">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Pontos por R$ 1,00 gasto</label>
                          <input 
                            name="pointsPerReal" 
                            type="number" 
                            step="1"
                            min="0"
                            defaultValue={config.pointsPerReal ?? 1} 
                            required 
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" 
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Pontos Mínimos p/ Resgate</label>
                          <input 
                            name="minRedemptionPoints" 
                            type="number" 
                            step="10"
                            min="0"
                            defaultValue={config.minRedemptionPoints ?? 100} 
                            required 
                            className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-primary font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" 
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted">Pontuação mínima necessária para solicitar resgates no portal.</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-4 pt-4 border-t border-border">
                  <button type="button" onClick={() => setShowConfigModal(false)} className="flex-1 py-3.5 border border-border text-muted rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" disabled={isUpdatingConfig} className="flex-1 py-3.5 bg-primary text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
                    {isUpdatingConfig ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Regras'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showRedeemModal && selectedClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-primary">Resgate de Pontos</h2>
                  <p className="text-muted text-[10px] font-bold uppercase tracking-widest mt-1">{selectedClient.nome}</p>
                </div>
                <button onClick={() => setShowRedeemModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-muted transition-colors">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleRedeem} className="p-8 space-y-6">
                {config?.loyaltyMode !== 'saldo' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Pontos a Resgatar</label>
                    <input name="points" type="number" defaultValue={0} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                )}
                {config?.loyaltyMode === 'saldo' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Cashback a Resgatar (R$)</label>
                    <input name="cashback" type="number" step="0.01" defaultValue={0} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Motivo / Descrição</label>
                  <input name="description" required placeholder="Ex: Pagamento de corte" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-primary focus:outline-none focus:border-accent/50 font-medium" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowRedeemModal(false)} className="flex-1 py-4 border border-border text-muted rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" disabled={isRedeeming} className="flex-1 py-4 bg-primary text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95">
                    {isRedeeming ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar Resgate'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: any) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
        active ? 'bg-white text-accent shadow-sm border border-border' : 'text-muted hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

interface ClientLoyaltyCardProps {
  key?: React.Key;
  client: UserProfile;
  config?: LoyaltyConfig | null;
  onRedeem: () => void;
}

function ClientLoyaltyCard({ client, config, onRedeem }: ClientLoyaltyCardProps) {
  const [points, setPoints] = useState<LoyaltyPoints | null>(null);

  useEffect(() => {
    loyaltyService.getClientPoints(client.uid).then(setPoints);
  }, [client]);

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-4 group hover:border-accent/30 transition-all shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold">
            {client.nome.charAt(0)}
          </div>
          <div>
            <h4 className="font-bold text-primary text-sm">{client.nome}</h4>
            {points?.isVip && (
              <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">VIP</span>
            )}
          </div>
        </div>
        <button onClick={onRedeem} className="p-2 text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
          <Gift size={18} />
        </button>
      </div>
      
      <div className="grid grid-cols-1 gap-2">
        {config?.loyaltyMode !== 'saldo' && (
          <div className="p-3 bg-slate-50/50 rounded-xl border border-border shadow-sm">
            <p className="text-lg font-bold text-primary">{points?.points || 0}</p>
            <p className="text-[8px] font-bold text-muted uppercase tracking-widest">Pontos</p>
          </div>
        )}
        {config?.loyaltyMode === 'saldo' && (
          <div className="p-3 bg-slate-50/50 rounded-xl border border-border shadow-sm">
            <p className="text-lg font-bold text-primary">R$ {points?.cashback.toFixed(2) || '0.00'}</p>
            <p className="text-[8px] font-bold text-muted uppercase tracking-widest">Cashback</p>
          </div>
        )}
      </div>
    </div>
  );
}
