
import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle2, 
  Users, 
  Clock, 
  Scissors, 
  Coins, 
  Loader2,
  ChevronRight,
  ArrowRight,
  Target,
  BarChart3,
  Lightbulb
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { intelligenceService } from '../services/intelligenceService';
import { SystemInsight } from '../types';

export function Insights() {
  const [insights, setInsights] = useState<SystemInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await intelligenceService.getInsights();
      setInsights(data);
    } catch (error) {
      console.error("Erro ao carregar insights:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
        <p className="text-slate-500 animate-pulse font-medium tracking-widest uppercase text-xs">Analisando dados do sistema...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-800 mb-1">Inteligência de Negócio</h1>
        <p className="text-slate-500 text-sm">Insights estratégicos e automações baseadas em dados reais.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
              <Lightbulb className="text-amber-500" size={24} />
              Insights Recentes
            </h2>
            <button 
              onClick={loadData}
              className="text-xs font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
            >
              Atualizar Análise
            </button>
          </div>

          <div className="space-y-4">
            {insights.map(insight => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={24} />
            Resumo de Performance
          </h2>
          
          <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
            <PerformanceItem 
              label="Taxa de Retenção" 
              value="68%" 
              trend="up" 
              trendValue="+5%" 
              description="Clientes que voltaram nos últimos 30 dias."
            />
            <PerformanceItem 
              label="Ticket Médio" 
              value="R$ 85,00" 
              trend="down" 
              trendValue="-2%" 
              description="Valor médio gasto por atendimento."
            />
            <PerformanceItem 
              label="Ocupação da Agenda" 
              value="74%" 
              trend="up" 
              trendValue="+12%" 
              description="Média de horários preenchidos na semana."
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-3 text-emerald-700">
              <Target size={20} />
              <h3 className="font-black uppercase tracking-widest text-xs">Recomendação do Sistema</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              Sua agenda de <span className="text-slate-900 font-bold">Quinta-feira</span> tem muitos horários ociosos entre 14h e 16h. Que tal criar uma promoção relâmpago para este período?
            </p>
            <button className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm">
              Criar Campanha Agora
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InsightCardProps {
  key?: React.Key;
  insight: SystemInsight;
}

function InsightCard({ insight }: InsightCardProps) {
  const severityColors = {
    low: 'bg-blue-50 text-blue-700 border-blue-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200'
  };

  const icons = {
    inactive_client: <Users size={20} />,
    revenue_drop: <TrendingDown size={20} />,
    low_production: <Scissors size={20} />,
    idle_time: <Clock size={20} />,
    top_service: <TrendingUp size={20} />
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`p-6 bg-white border rounded-3xl flex items-start gap-6 group hover:shadow-md transition-all ${severityColors[insight.severity]}`}
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${severityColors[insight.severity]}`}>
        {icons[insight.type] || <Lightbulb size={20} />}
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-900 uppercase tracking-tight">{insight.title}</h3>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{format(parseISO(insight.date), 'dd/MM/yyyy')}</span>
        </div>
        <p className="text-slate-600 text-sm leading-relaxed">{insight.description}</p>
        <div className="pt-3 flex items-center gap-4">
          <button className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-1 hover:gap-2 transition-all">
            Ver Detalhes <ArrowRight size={12} />
          </button>
          <button className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors">
            Ignorar
          </button>
        </div>
      </div>
    </motion.div>
  );
}

interface PerformanceItemProps {
  label: string;
  value: string;
  trend: 'up' | 'down';
  trendValue: string;
  description: string;
}

function PerformanceItem({ label, value, trend, trendValue, description }: PerformanceItemProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        <div className={`flex items-center gap-1 text-[10px] font-black ${trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
          {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trendValue}
        </div>
      </div>
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-500 font-medium">{description}</p>
    </div>
  );
}
