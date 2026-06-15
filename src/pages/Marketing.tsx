
import React, { useState, useEffect } from 'react';
import { 
  Megaphone, 
  Plus, 
  Users, 
  Clock, 
  MessageSquare, 
  Zap, 
  Target, 
  Calendar, 
  TrendingUp, 
  ChevronRight, 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  Mail,
  Smartphone,
  Send,
  History,
  Settings,
  UserX
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, parseISO } from 'date-fns';
import { parseDate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { marketingService } from '../services/marketingService';
import { userService } from '../services/userService';
import { toast } from 'sonner';
import { MarketingCampaign, MarketingAutomation, MarketingHistory, UserProfile } from '../types';

export function Marketing() {
  const { isAdmin, isGerente } = useAuth();
  const [activeTab, setActiveTab] = useState<'campanhas' | 'inativos' | 'automacoes' | 'historico'>('campanhas');
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [automations, setAutomations] = useState<MarketingAutomation[]>([]);
  const [inactiveClients, setInactiveClients] = useState<UserProfile[]>([]);
  const [history, setHistory] = useState<MarketingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'campanhas') {
        const data = await marketingService.getCampaigns();
        setCampaigns(data);
      } else if (activeTab === 'automacoes') {
        const data = await marketingService.getAutomations();
        setAutomations(data);
      } else if (activeTab === 'inativos') {
        const data = await marketingService.getInactiveClients(20); // 20 days threshold
        setInactiveClients(data);
      } else if (activeTab === 'historico') {
        const data = await marketingService.getMarketingHistory();
        setHistory(data);
      }
    } catch (error) {
      console.error("Erro ao carregar dados de marketing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const campaignData = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      targetAudience: formData.get('targetAudience') as any,
      status: 'active' as const,
      startDate: formData.get('startDate') as string,
      endDate: formData.get('endDate') as string,
    };

    try {
      await marketingService.createCampaign(campaignData);
      setShowCampaignModal(false);
      loadData();
      toast.success("Campanha criada com sucesso!");
    } catch (error) {
      toast.error("Erro ao criar campanha: " + error);
    }
  };

  const handleSendReminder = async (client: UserProfile) => {
    setSendingMessage(client.uid);
    try {
      await marketingService.sendSimulatedMessage({
        cliente_id: client.uid,
        cliente_name: client.nome,
        clientPhone: client.phone || 'Não informado',
        message: `Olá ${client.nome}! Sentimos sua falta na Barbearia. Que tal agendar um horário para renovar o visual?`
      });
      toast.success(`Lembrete enviado com sucesso para ${client.nome}!`);
      loadData();
    } catch (error) {
      toast.error("Erro ao enviar mensagem: " + error);
    } finally {
      setSendingMessage(null);
    }
  };

  const handleNotifyAll = async () => {
    if (inactiveClients.length === 0) return;
    
    setLoading(true);
    let successCount = 0;
    try {
      for (const client of inactiveClients) {
        try {
          await marketingService.sendSimulatedMessage({
            cliente_id: client.uid,
            cliente_name: client.nome,
            clientPhone: client.phone || 'Não informado',
            message: `Olá ${client.nome}! Sentimos sua falta na Barbearia. Que tal agendar um horário para renovar o visual?`
          });
          successCount++;
        } catch (e) {
          console.error(`Erro ao notificar ${client.nome}:`, e);
        }
      }
      toast.success(`${successCount} clientes notificados com sucesso!`);
      loadData();
    } catch (error) {
      toast.error("Erro ao processar notificações em massa.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && campaigns.length === 0 && automations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Preparando estratégias...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary mb-1">Marketing & Fidelização</h1>
          <p className="text-muted text-sm">Atraia, reative e mantenha seus clientes sempre por perto.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowCampaignModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 uppercase tracking-widest"
          >
            <Megaphone size={18} />
            Nova Campanha
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-50 border border-slate-100 rounded-2xl w-fit overflow-x-auto max-w-full shadow-sm">
        <TabButton active={activeTab === 'campanhas'} onClick={() => setActiveTab('campanhas')} label="Campanhas" icon={<Target size={16} />} />
        <TabButton active={activeTab === 'inativos'} onClick={() => setActiveTab('inativos')} label="Clientes Inativos" icon={<UserX size={16} />} />
        <TabButton active={activeTab === 'automacoes'} onClick={() => setActiveTab('automacoes')} label="Automações" icon={<Zap size={16} />} />
        <TabButton active={activeTab === 'historico'} onClick={() => setActiveTab('historico')} label="Histórico" icon={<History size={16} />} />
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'campanhas' && (
          <motion.div 
            key="campanhas"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {campaigns.length === 0 ? (
              <EmptyState icon={<Megaphone size={40} />} title="Nenhuma campanha ativa" description="Crie campanhas promocionais para atrair mais clientes." />
            ) : (
              campaigns.map((campaign, index) => (
                <CampaignCard key={`campaign-${campaign.id || index}-${index}`} campaign={campaign} />
              ))
            )}
          </motion.div>
        )}

        {activeTab === 'inativos' && (
          <motion.div 
            key="inativos"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-6 mb-6 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 border border-amber-100">
                  <Clock size={24} />
                </div>
                <div>
                  <h3 className="font-black text-primary uppercase tracking-tight">Clientes sem visita há +20 dias</h3>
                  <p className="text-muted text-[10px] font-black uppercase tracking-widest">Total identificado: {inactiveClients.length}</p>
                </div>
              </div>
              <button 
                onClick={handleNotifyAll}
                disabled={loading || inactiveClients.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={14} /> : 'Notificar Todos'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inactiveClients.map((client, index) => (
                <InactiveClientCard 
                  key={`inactive-cl-${client.uid || index}-${index}`} 
                  client={client} 
                  onSendReminder={() => handleSendReminder(client)}
                  isSending={sendingMessage === client.uid}
                />
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'automacoes' && (
          <motion.div 
            key="automacoes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <AutomationCard 
              title="Lembrete de Retorno" 
              description="Envia mensagem automática após 20 dias sem visita." 
              trigger="Inatividade"
              active={true}
            />
            <AutomationCard 
              title="Parabéns Aniversariante" 
              description="Envia cupom de desconto no dia do aniversário." 
              trigger="Data Especial"
              active={false}
            />
          </motion.div>
        )}

        {activeTab === 'historico' && (
          <motion.div 
            key="historico"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm"
          >
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Mensagem</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Data/Hora</th>
                  <th className="px-6 py-4 text-[10px] font-black text-muted uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr key={`marketing-hist-${item.id || index}-${index}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-black text-primary">{item.cliente_name}</p>
                      <p className="text-[10px] text-muted font-bold">{item.clientPhone}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 line-clamp-1 max-w-xs">{item.message}</p>
                    </td>
                    <td className="px-6 py-4 text-xs text-muted font-bold">
                      {item.sentAt ? format(parseDate(item.sentAt), 'dd/MM/yyyy HH:mm') : 'Agendado'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[9px] font-black uppercase tracking-widest rounded-lg">
                        {item.status}
                      </span>
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
        {showCampaignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface border border-border rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-border flex items-center justify-between bg-slate-50/50">
                <h2 className="text-2xl font-black text-primary tracking-tight">Nova Campanha</h2>
                <button onClick={() => setShowCampaignModal(false)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-xl border border-slate-100 shadow-sm">
                  <XCircle size={24} />
                </button>
              </div>
              <form onSubmit={handleCreateCampaign} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Título da Campanha</label>
                  <input name="title" required placeholder="Ex: Promoção de Verão" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-medium" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Público Alvo</label>
                  <select name="targetAudience" className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-medium cursor-pointer appearance-none">
                    <option value="all">Todos os Clientes</option>
                    <option value="inactive">Inativos (+30 dias)</option>
                    <option value="loyal">Fieis (+5 visitas/mês)</option>
                    <option value="new">Novos (Primeira visita)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Início</label>
                    <input name="startDate" type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-bold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Fim</label>
                    <input name="endDate" type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-bold" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Descrição / Mensagem</label>
                  <textarea name="description" rows={3} placeholder="Descreva os detalhes da campanha..." className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-medium resize-none" />
                </div>
                <div className="flex gap-4 pt-4">
                  <button type="button" onClick={() => setShowCampaignModal(false)} className="flex-1 py-4 border border-slate-200 text-muted rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95">Cancelar</button>
                  <button type="submit" className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95">Lançar Campanha</button>
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
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
        active 
          ? 'bg-white text-primary shadow-sm border border-slate-100' 
          : 'text-muted hover:text-primary'
      }`}
    >
      <span className={active ? 'text-accent' : ''}>{icon}</span>
      {label}
    </button>
  );
}

interface CampaignCardProps {
  key?: React.Key;
  campaign: MarketingCampaign;
}

function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-6 group hover:border-accent/30 transition-all shadow-sm overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="w-12 h-12 bg-accent/5 rounded-2xl flex items-center justify-center text-accent border border-accent/10 shadow-sm">
          <Megaphone size={24} />
        </div>
        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[9px] font-black uppercase tracking-widest rounded-lg">
          {campaign.status}
        </span>
      </div>
      <div>
        <h3 className="text-xl font-black text-primary mb-2 group-hover:text-accent transition-colors tracking-tight">{campaign.title}</h3>
        <p className="text-muted text-sm line-clamp-2 font-medium">{campaign.description}</p>
      </div>
      <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100">
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Impactados</p>
          <p className="text-lg font-black text-primary tracking-tight">{campaign.impactedCount}</p>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
          <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Público</p>
          <p className="text-xs font-black text-primary uppercase tracking-tight truncate">{campaign.targetAudience}</p>
        </div>
      </div>
    </div>
  );
}

interface InactiveClientCardProps {
  key?: React.Key;
  client: UserProfile;
  onSendReminder: () => void;
  isSending: boolean;
}

function InactiveClientCard({ client, onSendReminder, isSending }: InactiveClientCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 flex items-center justify-between group hover:border-amber-500/30 transition-all shadow-sm">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 font-black text-lg shadow-inner group-hover:bg-amber-50 group-hover:text-amber-600 transition-all">
          {client.nome.charAt(0)}
        </div>
        <div>
          <h4 className="font-black text-primary uppercase tracking-tight group-hover:text-amber-700 transition-colors">{client.nome}</h4>
          <p className="text-[10px] font-black text-muted uppercase tracking-widest mt-0.5">
            Última visita: {client.lastVisit ? format(parseISO(client.lastVisit), 'dd/MM/yyyy') : 'Nunca'}
          </p>
        </div>
      </div>
      <button 
        onClick={onSendReminder}
        disabled={isSending}
        className="p-3 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50 shadow-sm active:scale-95"
      >
        {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
      </button>
    </div>
  );
}

function AutomationCard({ title, description, trigger, active }: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 flex items-center justify-between group hover:border-accent/30 transition-all shadow-sm">
      <div className="flex items-center gap-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-sm transition-all ${
          active ? 'bg-accent/5 text-accent border-accent/10' : 'bg-slate-50 text-slate-300 border-slate-100'
        }`}>
          <Zap size={28} />
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-xl font-black text-primary tracking-tight">{title}</h3>
            <span className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg border ${
              active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-muted border-slate-200'
            }`}>
              {active ? 'Ativo' : 'Pausado'}
            </span>
          </div>
          <p className="text-muted text-sm font-medium">{description}</p>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 italic">Gatilho: {trigger}</p>
        </div>
      </div>
      <button 
        onClick={() => toast.info("Configurações de automação em breve.")}
        className="p-3 bg-slate-50 border border-slate-100 text-slate-300 hover:text-primary hover:bg-slate-100 rounded-2xl transition-all shadow-sm active:scale-95"
      >
        <Settings size={20} />
      </button>
    </div>
  );
}

function EmptyState({ icon, title, description }: any) {
  return (
    <div className="col-span-full py-20 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-[3rem] shadow-inner">
      <div className="w-20 h-20 bg-white border border-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6 text-slate-200 shadow-sm">
        {icon}
      </div>
      <h3 className="text-xl font-black text-primary mb-2 tracking-tight">{title}</h3>
      <p className="text-muted max-w-sm mx-auto text-sm font-medium">{description}</p>
    </div>
  );
}
