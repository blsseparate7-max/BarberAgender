import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Wallet, 
  Receipt, 
  UserX, 
  TrendingUp, 
  TrendingDown, 
  UserCheck, 
  UserPlus, 
  Package, 
  AlertTriangle, 
  Crown, 
  RefreshCw, 
  ArrowRight, 
  Loader2,
  Sparkles,
  CalendarX,
  Building2,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { intelligenceService, InsightMetrics } from '../services/intelligenceService';

interface InsightsProps {
  setActiveTab?: (tab: string) => void;
}

type FilterCategory = 'todos' | 'urgentes' | 'financas' | 'clientes' | 'estoque_clube';

export function Insights({ setActiveTab }: InsightsProps) {
  const [metrics, setMetrics] = useState<InsightMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('todos');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await intelligenceService.getInsightMetrics();
      setMetrics(data);
    } catch (error) {
      console.error("Erro ao carregar métricas de insights:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (tab: string) => {
    if (setActiveTab) {
      setActiveTab(tab);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xl animate-bounce">
          <Sparkles size={32} />
        </div>
        <Loader2 className="animate-spin text-emerald-600 mt-2" size={32} />
        <p className="text-slate-500 animate-pulse font-bold tracking-wider text-xs uppercase">
          Analisando dados do sistema em tempo real...
        </p>
      </div>
    );
  }

  // Cards definitions
  const allCards = [
    // 1. Comandas Pendentes
    {
      id: 'comandas_pendentes',
      category: 'urgentes',
      title: 'Comandas Pendentes',
      description: 'Atendimentos iniciados aguardando fechamento no caixa.',
      count: metrics.comandasPendentesCount,
      countLabel: `${metrics.comandasPendentesCount} comandas abertas`,
      valueFormatted: `R$ ${metrics.comandasPendentesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Abertas no Caixa',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: <FileText size={22} className="text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-200',
      buttonText: 'Ir para Comandas Abertas',
      targetTab: 'comandas-abertas',
      urgent: metrics.comandasPendentesCount > 0
    },
    // 2. Clientes com Crédito
    {
      id: 'clientes_creditos',
      category: 'financas',
      title: 'Clientes com Créditos',
      description: 'Clientes com saldo antecipado positivo em conta.',
      count: metrics.clientesCreditosCount,
      countLabel: `${metrics.clientesCreditosCount} clientes com saldo`,
      valueFormatted: `R$ ${metrics.clientesCreditosTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Saldo Positivo',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: <Wallet size={22} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50 border-emerald-200',
      buttonText: 'Ver Clientes',
      targetTab: 'cadastros-clientes',
      urgent: false
    },
    // 3. Fiados Pendentes
    {
      id: 'clientes_debitos',
      category: 'urgentes',
      title: 'Fiados Pendentes',
      description: 'Valores em aberto na conta dos clientes (débitos pendentes).',
      count: metrics.clientesDebitosCount,
      countLabel: `${metrics.clientesDebitosCount} fiados pendentes`,
      valueFormatted: `R$ ${metrics.clientesDebitosTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Fiados Pendentes',
      badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
      icon: <Receipt size={22} className="text-rose-600" />,
      iconBg: 'bg-rose-50 border-rose-200',
      buttonText: 'Gerenciar Fiados',
      targetTab: 'financeiro-fiados',
      urgent: metrics.clientesDebitosCount > 0
    },
    // 4. Caixas Pendentes
    {
      id: 'caixas_pendentes',
      category: 'urgentes',
      title: 'Caixas Pendentes',
      description: 'Sessões de caixa que continuam abertas sem fechamento.',
      count: metrics.caixasPendentesCount,
      countLabel: `${metrics.caixasPendentesCount} caixa(s) aberto(s)`,
      valueFormatted: metrics.caixasPendentesCount > 0 ? 'Exige Fechamento' : 'Tudo em dia',
      badgeText: 'Sessões de Caixa',
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
      icon: <Building2 size={22} className="text-orange-600" />,
      iconBg: 'bg-orange-50 border-orange-200',
      buttonText: 'Ir para o Caixa',
      targetTab: 'financeiro-caixa',
      urgent: metrics.caixasPendentesCount > 0
    },
    // 5. Serviços sem Cadastro (Avulsos)
    {
      id: 'servicos_avulsos',
      category: 'clientes',
      title: 'Serviços sem Cadastro',
      description: 'Atendimentos finalizados como Cliente Avulso.',
      count: metrics.servicosSemCadastroCount,
      countLabel: `${metrics.servicosSemCadastroCount} serviços sem vinculo`,
      valueFormatted: 'Clientes Avulsos',
      badgeText: 'Falta Cadastrar',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      icon: <UserX size={22} className="text-purple-600" />,
      iconBg: 'bg-purple-50 border-purple-200',
      buttonText: 'Ver Histórico',
      targetTab: 'comandas-historico',
      urgent: false
    },
    // 6. Contas a Receber
    {
      id: 'contas_receber',
      category: 'financas',
      title: 'Contas a Receber',
      description: 'Receitas pendentes com previsão de entrada.',
      count: metrics.contasReceberCount,
      countLabel: `${metrics.contasReceberCount} lançamentos previstos`,
      valueFormatted: `R$ ${metrics.contasReceberTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Entradas Previstas',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
      icon: <TrendingUp size={22} className="text-teal-600" />,
      iconBg: 'bg-teal-50 border-teal-200',
      buttonText: 'Contas a Receber',
      targetTab: 'financeiro-contas-receber',
      urgent: false
    },
    // 7. Contas a Pagar
    {
      id: 'contas_pagar',
      category: 'financas',
      title: 'Contas a Pagar',
      description: 'Despesas e despesas operacionais pendentes.',
      count: metrics.contasPagarCount,
      countLabel: `${metrics.contasPagarCount} compromissos`,
      valueFormatted: `R$ ${metrics.contasPagarTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Saídas Previstas',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      icon: <TrendingDown size={22} className="text-indigo-600" />,
      iconBg: 'bg-indigo-50 border-indigo-200',
      buttonText: 'Contas a Pagar',
      targetTab: 'financeiro-contas-pagar',
      urgent: false
    },
    // 8. Clientes Inativos (+60 Dias)
    {
      id: 'clientes_inativos',
      category: 'clientes',
      title: 'Clientes Inativos (+60 Dias)',
      description: 'Clientes cadastrados sem realizar serviços há mais de 2 meses.',
      count: metrics.clientesInativos60DiasCount,
      countLabel: `${metrics.clientesInativos60DiasCount} clientes ausentes`,
      valueFormatted: 'Oportunidade de Retorno',
      badgeText: 'Sumidos há +60d',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: <CalendarX size={22} className="text-blue-600" />,
      iconBg: 'bg-blue-50 border-blue-200',
      buttonText: 'Recuperar Clientes',
      targetTab: 'cadastros-clientes',
      urgent: metrics.clientesInativos60DiasCount > 0
    },
    // 9. Usuários que Logaram (Ao menos 1x)
    {
      id: 'usuarios_logados',
      category: 'clientes',
      title: 'Usuários com Acesso Ativo',
      description: 'Contas que efetuaram login no app ou painel ao menos 1 vez.',
      count: metrics.usuariosConectadosCount,
      countLabel: `${metrics.usuariosConectadosCount} acessos confirmados`,
      valueFormatted: 'Contas Ativas',
      badgeText: 'Engajamento App',
      badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
      icon: <UserCheck size={22} className="text-sky-600" />,
      iconBg: 'bg-sky-50 border-sky-200',
      buttonText: 'Ver Usuários',
      targetTab: 'admin-usuarios',
      urgent: false
    },
    // 10. Novos Clientes (Últimos 30 Dias)
    {
      id: 'novos_clientes',
      category: 'clientes',
      title: 'Novos Clientes (30 Dias)',
      description: 'Clientes cadastrados na barbearia no último mês.',
      count: metrics.novosClientesCount,
      countLabel: `${metrics.novosClientesCount} novos cadastros`,
      valueFormatted: 'Crescimento Mensal',
      badgeText: 'Novos no Mês',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: <UserPlus size={22} className="text-emerald-600" />,
      iconBg: 'bg-emerald-50 border-emerald-200',
      buttonText: 'Ver Clientes',
      targetTab: 'cadastros-clientes',
      urgent: false
    },
    // 11. Produtos a Vencer em 30 Dias / Estoque
    {
      id: 'produtos_estoque',
      category: 'estoque_clube',
      title: 'Produtos Vencendo / Estoque Baixo',
      description: 'Itens com vencimento nos próximos 30 dias ou estoque crítico.',
      count: metrics.produtosVencerOuEstoqueCount,
      countLabel: `${metrics.produtosVencerOuEstoqueCount} produtos com atenção`,
      valueFormatted: metrics.produtosVencerOuEstoqueCount > 0 ? 'Atenção ao Lote' : 'Estoque Normal',
      badgeText: 'Vencimento & Estoque',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: <Package size={22} className="text-amber-600" />,
      iconBg: 'bg-amber-50 border-amber-200',
      buttonText: 'Ver Estoque',
      targetTab: 'cadastros-produtos',
      urgent: metrics.produtosVencerOuEstoqueCount > 0
    },
    // 12. Contas / Débitos Atrasados
    {
      id: 'contas_atrasadas',
      category: 'urgentes',
      title: 'Contas & Débitos Atrasados',
      description: 'Lançamentos e fiados com data de vencimento estourada.',
      count: metrics.contasAtrasadasCount,
      countLabel: `${metrics.contasAtrasadasCount} pendências atrasadas`,
      valueFormatted: `R$ ${metrics.contasAtrasadasTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      badgeText: 'Vencidos / Em Atraso',
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
      icon: <AlertTriangle size={22} className="text-red-600" />,
      iconBg: 'bg-red-50 border-red-200',
      buttonText: 'Resolver Atrasos',
      targetTab: 'financeiro-contas-pagar',
      urgent: metrics.contasAtrasadasCount > 0
    },
    // 13. Assinaturas a Vencer ou Vencidas
    {
      id: 'assinaturas_vencidas',
      category: 'estoque_clube',
      title: 'Assinaturas Vencidas ou a Vencer',
      description: 'Planos do Clube VIP que precisam de renovação ou cobrança.',
      count: metrics.assinaturasVencerOuVencidasCount,
      countLabel: `${metrics.assinaturasVencerOuVencidasCount} assinaturas em alerta`,
      valueFormatted: 'Renovação Clube',
      badgeText: 'Clube VIP',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
      icon: <Crown size={22} className="text-purple-600" />,
      iconBg: 'bg-purple-50 border-purple-200',
      buttonText: 'Gerenciar Assinantes',
      targetTab: 'cadastros-assinantes',
      urgent: metrics.assinaturasVencerOuVencidasCount > 0
    }
  ];

  const filteredCards = allCards.filter(card => {
    if (activeFilter === 'todos') return true;
    if (activeFilter === 'urgentes') return card.category === 'urgentes' || card.urgent;
    return card.category === activeFilter;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <Sparkles size={22} />
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Insights de Inteligência Operacional
            </h1>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm font-medium">
            Painel resumido dos dados mais importantes para girar a barbearia. Clique em qualquer card para agir.
          </p>
        </div>

        <button 
          onClick={loadData}
          className="self-start md:self-auto px-5 py-3 bg-slate-900 text-white rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all shadow-md flex items-center gap-2 active:scale-95 cursor-pointer shrink-0"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Resumo Executivo / Top Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50/50 border border-amber-200/80 rounded-3xl space-y-2">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[10px] font-black uppercase tracking-wider">Comandas Pendentes</span>
            <FileText size={18} />
          </div>
          <div className="text-2xl font-black text-amber-950">
            R$ {metrics.comandasPendentesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-amber-700 font-bold">
            {metrics.comandasPendentesCount} comandas abertas no caixa
          </p>
        </div>

        <div className="p-5 bg-gradient-to-br from-rose-50 to-red-50/50 border border-rose-200/80 rounded-3xl space-y-2">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[10px] font-black uppercase tracking-wider">Em Atraso (Pendências)</span>
            <AlertTriangle size={18} />
          </div>
          <div className="text-2xl font-black text-rose-950">
            R$ {metrics.contasAtrasadasTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-rose-700 font-bold">
            {metrics.contasAtrasadasCount} contas ou débitos vencidos
          </p>
        </div>

        <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200/80 rounded-3xl space-y-2">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] font-black uppercase tracking-wider">Total a Receber</span>
            <TrendingUp size={18} />
          </div>
          <div className="text-2xl font-black text-emerald-950">
            R$ {(metrics.contasReceberTotal + metrics.clientesDebitosTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-emerald-700 font-bold">
            Contas a receber + Fiados
          </p>
        </div>

        <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200/80 rounded-3xl space-y-2">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[10px] font-black uppercase tracking-wider">Clientes Ausentes (+60d)</span>
            <CalendarX size={18} />
          </div>
          <div className="text-2xl font-black text-blue-950">
            {metrics.clientesInativos60DiasCount} Clientes
          </div>
          <p className="text-[11px] text-blue-700 font-bold">
            Sem retorno há mais de 2 meses
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 shrink-0 flex items-center gap-1">
          <Filter size={14} /> Filtro:
        </span>
        <button
          onClick={() => setActiveFilter('todos')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
            activeFilter === 'todos'
              ? 'bg-slate-900 text-white shadow-md'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Todos ({allCards.length})
        </button>

        <button
          onClick={() => setActiveFilter('urgentes')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeFilter === 'urgentes'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
              : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
          }`}
        >
          <span>🔴 Ações Urgentes</span>
        </button>

        <button
          onClick={() => setActiveFilter('financas')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeFilter === 'financas'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
          }`}
        >
          <span>💰 Caixa & Finanças</span>
        </button>

        <button
          onClick={() => setActiveFilter('clientes')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeFilter === 'clientes'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
          }`}
        >
          <span>👥 Clientes & Relacionamento</span>
        </button>

        <button
          onClick={() => setActiveFilter('estoque_clube')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeFilter === 'estoque_clube'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
          }`}
        >
          <span>📦 Estoque & Clube VIP</span>
        </button>
      </div>

      {/* Grid of 13 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence mode="popLayout">
          {filteredCards.map((card, idx) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: idx * 0.03 }}
              className={`bg-white rounded-[2rem] p-6 border transition-all flex flex-col justify-between group hover:shadow-xl hover:-translate-y-1 ${
                card.urgent 
                  ? 'border-rose-200/90 shadow-md shadow-rose-500/5' 
                  : 'border-slate-200/80 shadow-sm'
              }`}
            >
              <div className="space-y-4">
                {/* Top Badge & Icon */}
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-2xl border ${card.iconBg} shrink-0`}>
                    {card.icon}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${card.badgeColor}`}>
                    {card.badgeText}
                  </span>
                </div>

                {/* Card Title & Description */}
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1">
                    {card.description}
                  </p>
                </div>

                {/* Values & Count */}
                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100/80 space-y-1">
                  <div className="text-xl font-black text-slate-900">
                    {card.valueFormatted}
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {card.countLabel}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => handleNavigate(card.targetTab)}
                className="mt-6 w-full py-3.5 px-4 bg-slate-900 text-white rounded-2xl font-bold text-xs hover:bg-slate-800 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 group/btn cursor-pointer"
              >
                <span>{card.buttonText}</span>
                <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
