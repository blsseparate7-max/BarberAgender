
import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Loader2, 
  Receipt, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MoreVertical,
  DollarSign,
  User,
  Scissors,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { comandaService } from '../services/comandaService';
import { Comanda, ComandaStatus } from '../types';
import { ComandaModal } from '../components/Comanda/ComandaModal';
import { useAuth } from '../contexts/AuthContext';

export function Comandas({ activeSubTab }: { activeSubTab?: string }) {
  const { profile, isBarbeiro } = useAuth();
  const [activeTab, setActiveTab] = useState<'abertas' | 'historico' | 'fiadas' | 'nova'>('abertas');
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ComandaStatus | 'all'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedComandaId, setSelectedComandaId] = useState<string | undefined>();

  useEffect(() => {
    if (activeSubTab) {
      let targetTab: typeof activeTab | null = null;
      if (activeSubTab === 'comandas-abertas') targetTab = 'abertas';
      else if (activeSubTab === 'comandas-historico') targetTab = 'historico';
      else if (activeSubTab === 'comandas-fiadas') targetTab = 'fiadas';
      
      if (targetTab) {
        setActiveTab(targetTab);
      } else if (activeSubTab === 'comandas-nova') {
        setSelectedComandaId(undefined);
        setIsModalOpen(true);
      } else if (activeSubTab === 'comandas-checkout') {
        setActiveTab('abertas');
        setSelectedComandaId(undefined);
        setIsModalOpen(true);
      }
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (activeTab === 'abertas') {
      setLoading(true);
      const unsubscribe = comandaService.subscribeToComandas(
        ['aberta', 'em_atendimento', 'aguardando_pagamento', 'parcialmente_paga'], 
        (data) => {
          setComandas(data);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    } else {
      loadComandas();
    }
  }, [activeTab, statusFilter]);

  const loadComandas = async () => {
    setLoading(true);
    try {
      let filter = statusFilter === 'all' ? undefined : statusFilter;
      const data = await comandaService.getComandas(filter);
      setComandas(data);
    } catch (error) {
      console.error("Erro ao carregar comandas:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentComandas = comandas.filter(c => {
    if (isBarbeiro && profile) {
      const isMyComanda = c.profissional_id === profile.uid || 
                          (c.profissional_name && profile.nome && c.profissional_name.toLowerCase().includes(profile.nome.toLowerCase())) ||
                          (c as any).items?.some((item: any) => item.profissional_id === profile.uid);
      if (!isMyComanda) return false;
    }

    const clienteName = c.cliente_name || '';
    const profName = c.profissional_name || '';
    const num = c.number || '';
    
    const matchesSearch = clienteName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         num.includes(searchTerm) ||
                         profName.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'abertas') {
      return ['aberta', 'em_atendimento', 'aguardando_pagamento', 'parcialmente_paga'].includes(c.status || '');
    }
    if (activeTab === 'historico') {
      const basicFilter = ['fechada', 'cancelada', 'nao_paga'].includes(c.status || '');
      if (!basicFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      return true;
    }
    if (activeTab === 'fiadas') {
      return c.status === 'nao_paga';
    }
    return true;
  });

  const getStatusColor = (status: ComandaStatus) => {
    switch (status) {
      case 'aberta': return 'text-indigo-600 bg-indigo-50 border-indigo-100';
      case 'em_atendimento': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'aguardando_pagamento': return 'text-purple-600 bg-purple-50 border-purple-100';
      case 'parcialmente_paga': return 'text-blue-600 bg-blue-50 border-blue-100';
      case 'nao_paga': return 'text-red-600 bg-red-50 border-red-100';
      case 'fechada': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'cancelada': return 'text-slate-400 bg-slate-50 border-slate-100';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-primary">Gestão de Comandas</h1>
          <p className="text-muted text-sm font-medium mt-1">Controle de atendimentos, fluxo de caixa e pós-venda.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setActiveTab('historico')}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 px-5 py-3 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            <History size={18} />
            <span className="hidden sm:inline">Histórico</span>
          </button>
          <button 
            onClick={() => {
              setSelectedComandaId(undefined);
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 active:scale-95"
          >
            <Plus size={18} />
            <span>Nova Comanda</span>
          </button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-100 overflow-x-auto custom-scrollbar gap-2">
        <button 
          onClick={() => setActiveTab('abertas')}
          className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap flex items-center gap-2.5 ${
            activeTab === 'abertas' ? 'text-accent' : 'text-muted hover:text-primary'
          }`}
        >
          <Clock size={16} />
          Comandas Abertas
          {activeTab === 'abertas' && <motion.div layoutId="activeTabCom" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('historico')}
          className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap flex items-center gap-2.5 ${
            activeTab === 'historico' ? 'text-accent' : 'text-muted hover:text-primary'
          }`}
        >
          <History size={16} />
          Histórico
          {activeTab === 'historico' && <motion.div layoutId="activeTabCom" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
        </button>
        {!isBarbeiro && (
          <button 
            onClick={() => setActiveTab('fiadas')}
            className={`px-6 py-4 text-sm font-bold transition-all relative whitespace-nowrap flex items-center gap-2.5 ${
              activeTab === 'fiadas' ? 'text-accent' : 'text-muted hover:text-primary'
            }`}
          >
            <AlertCircle size={16} />
            Não Pagas / Fiados
            {activeTab === 'fiadas' && <motion.div layoutId="activeTabCom" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por cliente ou número da comanda..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-[1.25rem] py-4 pl-12 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-accent/5 focus:border-accent transition-all text-primary shadow-sm"
          />
        </div>
        {activeTab === 'historico' && (
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 custom-scrollbar">
            {['all', 'fechada', 'cancelada', 'nao_paga'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status as any)}
                className={`px-5 py-3 rounded-2xl text-xs font-bold whitespace-nowrap transition-all border shadow-sm ${
                  statusFilter === status 
                  ? 'bg-primary border-primary text-white shadow-primary/10' 
                  : 'bg-white border-slate-200 text-muted hover:border-slate-300 hover:text-primary'
                }`}
              >
                {status === 'all' ? 'Todos os Status' : status.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 gap-6 bg-white border border-slate-100 rounded-[2.5rem] shadow-sm">
          <Loader2 className="animate-spin text-accent" size={48} />
          <p className="text-muted font-bold animate-pulse">Consultando base de dados...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {currentComandas.map((comanda) => (
            <motion.div 
              key={comanda.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -5 }}
              onClick={() => {
                setSelectedComandaId(comanda.id);
                setIsModalOpen(true);
              }}
              className="bg-white border border-slate-200 rounded-[2rem] p-8 hover:border-accent/30 transition-all group cursor-pointer relative overflow-hidden shadow-sm flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent group-hover:bg-accent/5 transition-colors">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">#{comanda.number}</h3>
                    <p className="text-[10px] text-muted uppercase tracking-wider font-bold">{comanda.origin}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(comanda.status)}`}>
                  {(comanda.status || 'aberta').replace('_', ' ')}
                </span>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center gap-3">
                  <User size={14} className="text-slate-300" />
                  <span className="text-sm text-primary font-semibold">{comanda.cliente_name || 'Consumidor'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Scissors size={14} className="text-slate-300" />
                  <span className="text-sm text-muted font-medium">{comanda.profissional_name || 'Profissional'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock size={14} className="text-slate-300" />
                  <span className="text-sm text-muted font-medium">
                    {comanda.createdAt?.seconds 
                      ? new Date(comanda.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Agora'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/50">
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider font-bold">Total</p>
                  <p className="text-lg font-bold text-primary">R$ {comanda.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted uppercase tracking-wider font-bold">Pendente</p>
                  <p className={`text-sm font-bold ${comanda.pendingAmount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    R$ {comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="absolute bottom-0 left-0 h-1 bg-accent transition-all duration-500" style={{ width: `${(comanda.paidAmount / comanda.totalAmount) * 100}%` }} />
            </motion.div>
          ))}

          {currentComandas.length === 0 && (
            <div className="col-span-full text-center py-32 bg-slate-50/50 border border-dashed border-slate-200 rounded-[2.5rem] flex flex-col items-center justify-center">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-slate-200 shadow-inner border border-slate-100 mb-6">
                <Receipt size={40} />
              </div>
              <p className="text-muted font-bold text-lg">Nenhuma comanda encontrada.</p>
              <p className="text-muted/60 text-sm mt-1 max-w-xs mx-auto">Tente ajustar seus filtros ou iniciar uma nova comanda manual.</p>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {isModalOpen && (
          <ComandaModal 
            comanda_id={selectedComandaId}
            onClose={() => setIsModalOpen(false)}
            onSave={() => {
              loadComandas();
              setIsModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
