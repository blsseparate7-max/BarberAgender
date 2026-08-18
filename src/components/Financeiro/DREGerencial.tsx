import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  PieChart, 
  BarChart3, 
  Info, 
  CheckCircle2, 
  AlertTriangle,
  FileText,
  Zap,
  Store,
  Receipt,
  Building2,
  ShoppingBag,
  Coffee,
  Wrench,
  Megaphone,
  Users,
  CreditCard,
  Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid,
  Legend
} from 'recharts';
import { FinancialTransaction, Commission } from '../../types';

interface DREGerencialProps {
  transactions: FinancialTransaction[];
  commissions: Commission[];
  dateRange: { start: string; end: string };
}

export function DREGerencial({ transactions, commissions, dateRange }: DREGerencialProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({
    receitas: true,
    deducoes: false,
    custosDiretos: true,
    despesasOp: true,
    categoriasGastos: true,
  });
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<string | null>(null);

  const toggleRow = (row: string) => {
    setExpandedRows(prev => ({ ...prev, [row]: !prev[row] }));
  };

  // Compute DRE & Barbershop Operational Expense Breakdown
  const computeDRE = () => {
    let serviceRevenue = 0;
    let productRevenue = 0;
    let otherRevenue = 0;
    let feeDeductions = 0;

    let rentExpenses = 0;        // Aluguel / Ocupação
    let utilityExpenses = 0;     // Água, Luz, Internet, Telefone
    let supplierExpenses = 0;    // Fornecedores e Estoque
    let marketExpenses = 0;      // Mercado, Copa, Limpeza
    let marketingExpenses = 0;   // Marketing e Anúncios
    let payrollExpenses = 0;     // Pessoal, Pró-labore, Diaristas
    let maintenanceExpenses = 0; // Manutenção, Equipamentos
    let adminExpenses = 0;       // Sistemas, Tarifas, Impostos
    let otherExpenses = 0;

    const categoryMap: Record<string, { total: number; count: number; type: string }> = {};

    transactions.forEach(t => {
      const catRaw = (t.category || 'Geral').trim();
      const catLower = catRaw.toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const amount = t.amount || 0;

      if (t.type === 'income') {
        const fee = t.fee_amount || 0;
        feeDeductions += fee;

        if (t.service_amount !== undefined || t.product_amount !== undefined || t.package_amount !== undefined || t.subscription_amount !== undefined) {
          const sAmt = t.service_amount || 0;
          const pAmt = t.product_amount || 0;
          const otherAmt = (t.package_amount || 0) + (t.subscription_amount || 0);
          const sumParts = sAmt + pAmt + otherAmt;

          if (sumParts > 0) {
            const ratio = amount / sumParts;
            serviceRevenue += sAmt * ratio;
            productRevenue += pAmt * ratio;
            otherRevenue += otherAmt * ratio;
          } else {
            serviceRevenue += amount;
          }
        } else {
          // Legacy categorization fallback
          if (catLower.includes('assinat') || catLower.includes('plano') || catLower.includes('pacote') || desc.includes('assinat') || desc.includes('pacote')) {
            otherRevenue += amount;
          } else if (
            (catLower === 'produtos' || catLower === 'produto' || catLower.includes('estoque') || desc.includes('venda de produto') || desc.includes('venda produto')) &&
            !catLower.includes('serviço') && !catLower.includes('servico')
          ) {
            productRevenue += amount;
          } else if (catLower.includes('serviço') || catLower.includes('servico') || catLower.includes('atendimento') || t.agendamento_id || t.comanda_id) {
            serviceRevenue += amount;
          } else {
            otherRevenue += amount;
          }
        }
      } else if (t.type === 'expense' || t.type === 'sangria') {
        // Track category aggregate
        if (!categoryMap[catRaw]) {
          categoryMap[catRaw] = { total: 0, count: 0, type: t.type };
        }
        categoryMap[catRaw].total += amount;
        categoryMap[catRaw].count += 1;

        if (catLower.includes('aluguel') || catLower.includes('imóvel') || catLower.includes('condomínio') || desc.includes('aluguel')) {
          rentExpenses += amount;
        } else if (catLower.includes('água') || catLower.includes('agua') || catLower.includes('luz') || catLower.includes('energia') || catLower.includes('internet') || catLower.includes('telefone') || catLower.includes('gás') || desc.includes('luz') || desc.includes('agua')) {
          utilityExpenses += amount;
        } else if (catLower.includes('fornecedor') || catLower.includes('produto') || catLower.includes('estoque') || catLower.includes('mercadoria') || catLower.includes('insumo') || desc.includes('fornecedor') || desc.includes('estoque')) {
          supplierExpenses += amount;
        } else if (catLower.includes('mercado') || catLower.includes('supermercado') || catLower.includes('copa') || catLower.includes('café') || catLower.includes('limpeza') || catLower.includes('higiene') || desc.includes('mercado') || desc.includes('copa')) {
          marketExpenses += amount;
        } else if (catLower.includes('marketing') || catLower.includes('anúncio') || catLower.includes('anuncio') || catLower.includes('tráfego') || catLower.includes('trafego') || catLower.includes('propaganda')) {
          marketingExpenses += amount;
        } else if (catLower.includes('pessoal') || catLower.includes('pró-labore') || catLower.includes('pro-labore') || catLower.includes('salário') || catLower.includes('salario') || catLower.includes('diarista') || catLower.includes('colaborador') || desc.includes('salario') || desc.includes('diarista')) {
          payrollExpenses += amount;
        } else if (catLower.includes('manutenção') || catLower.includes('manutencao') || catLower.includes('reparo') || catLower.includes('reforma') || catLower.includes('equipamento')) {
          maintenanceExpenses += amount;
        } else if (catLower.includes('sistema') || catLower.includes('software') || catLower.includes('tarifa') || catLower.includes('taxa') || catLower.includes('imposto')) {
          adminExpenses += amount;
        } else {
          otherExpenses += amount;
        }
      }
    });

    // Professional Commissions
    let commissionsCost = commissions
      .filter(c => c.status === 'pendente' || c.status === 'pago')
      .reduce((acc, c) => acc + (c.commission_value || 0), 0);

    if (commissionsCost === 0) {
      transactions.forEach(t => {
        if (t.type === 'expense' || t.type === 'sangria') {
          const desc = (t.description || '').toLowerCase();
          const cat = (t.category || '').toLowerCase();
          if (desc.includes('comissão') || desc.includes('comis') || cat.includes('comissão') || cat.includes('repasse')) {
            commissionsCost += t.amount;
          }
        }
      });
    }

    const grossRevenue = serviceRevenue + productRevenue + otherRevenue;
    const netRevenue = grossRevenue - feeDeductions;
    const cogs = commissionsCost + supplierExpenses;
    const grossProfit = netRevenue - cogs;
    
    const operationalExpenses = rentExpenses + utilityExpenses + marketExpenses + marketingExpenses + payrollExpenses + maintenanceExpenses + adminExpenses + otherExpenses;
    const netIncome = grossProfit - operationalExpenses;

    const getPercent = (value: number) => {
      return grossRevenue > 0 ? (value / grossRevenue) * 100 : 0;
    };

    return {
      serviceRevenue,
      productRevenue,
      otherRevenue,
      grossRevenue,
      feeDeductions,
      netRevenue,
      commissionsCost,
      supplierExpenses,
      cogs,
      grossProfit,
      rentExpenses,
      utilityExpenses,
      marketExpenses,
      marketingExpenses,
      payrollExpenses,
      maintenanceExpenses,
      adminExpenses,
      otherExpenses,
      operationalExpenses,
      netIncome,
      categoryMap,
      getPercent
    };
  };

  const dre = computeDRE();

  // Category breakdown list sorted by total
  const sortedCategories = Object.entries(dre.categoryMap)
    .filter(([_, data]) => data.type === 'expense' || data.type === 'sangria')
    .sort((a, b) => b[1].total - a[1].total);

  // Chart data for operational expenses by category
  const expenseChartData = [
    { name: 'Aluguel / Ocupação', value: Math.round(dre.rentExpenses), color: '#3b82f6' },
    { name: 'Contas (Luz/Água/Net)', value: Math.round(dre.utilityExpenses), color: '#06b6d4' },
    { name: 'Fornecedores / Estoque', value: Math.round(dre.supplierExpenses), color: '#ef4444' },
    { name: 'Mercado / Copa / Limpeza', value: Math.round(dre.marketExpenses), color: '#10b981' },
    { name: 'Pessoal / Pró-Labore', value: Math.round(dre.payrollExpenses), color: '#8b5cf6' },
    { name: 'Marketing / Anúncios', value: Math.round(dre.marketingExpenses), color: '#f43f5e' },
    { name: 'Manutenção', value: Math.round(dre.maintenanceExpenses), color: '#f59e0b' },
    { name: 'Sistemas / Outros', value: Math.round(dre.adminExpenses + dre.otherExpenses), color: '#64748b' }
  ].filter(d => d.value > 0);

  const revenueChartData = [
    { name: 'Serviços', value: Math.round(dre.serviceRevenue), color: '#10b981' },
    { name: 'Produtos (Revenda)', value: Math.round(dre.productRevenue), color: '#3b82f6' },
    { name: 'Outras Receitas', value: Math.round(dre.otherRevenue), color: '#8b5cf6' },
  ].filter(d => d.value > 0);

  // Intelligence rules
  const getInsights = () => {
    const list = [];
    const profitMargin = dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0;
    const commissionRatio = dre.grossRevenue > 0 ? (dre.commissionsCost / dre.grossRevenue) * 100 : 0;
    const fixedCostRatio = dre.grossRevenue > 0 ? ((dre.rentExpenses + dre.utilityExpenses + dre.payrollExpenses) / dre.grossRevenue) * 100 : 0;

    if (dre.grossRevenue > 0) {
      if (profitMargin >= 25) {
        list.push({
          type: 'success',
          text: `Excelente margem operacional líquida (${profitMargin.toFixed(1)}%). Sua barbearia está gerando excelente caixa livre após cobrir todos os custos de manutenção e equipe.`
        });
      } else if (profitMargin >= 10) {
        list.push({
          type: 'info',
          text: `Margem líquida saudável (${profitMargin.toFixed(1)}%). Mantenha o controle rigoroso sobre os gastos de copa, mercado e contas de consumo.`
        });
      } else if (profitMargin >= 0) {
        list.push({
          type: 'warning',
          text: `Atenção à margem reduzida (${profitMargin.toFixed(1)}%). Os custos para manter a barbearia funcionando estão próximos ao faturamento.`
        });
      } else {
        list.push({
          type: 'danger',
          text: `Alerta Vermelho: Operação no vermelho neste período (Prejuízo de R$ ${Math.abs(dre.netIncome).toFixed(2)}). Avalie renegociar aluguel ou impulsionar vendas de produtos.`
        });
      }
    }

    if (fixedCostRatio > 40) {
      list.push({
        type: 'warning',
        text: `Custos fixos essenciais (Aluguel, Luz, Água, Folha) consomem ${fixedCostRatio.toFixed(1)}% da receita. Fique atento para garantir que o fluxo de clientes pague estas contas fixas.`
      });
    }

    if (dre.marketExpenses > (dre.grossRevenue * 0.05) && dre.grossRevenue > 0) {
      list.push({
        type: 'info',
        text: `Gastos com mercado, café e copa representam uma parcela relevante dos custos correntes. Vale conferir cotações de fornecedores de insumos.`
      });
    }

    if (dre.productRevenue === 0 && dre.grossRevenue > 0) {
      list.push({
        type: 'info',
        text: `Nenhuma venda de produtos (pomadas, óleos, homecare) registrada no período. A revenda de produtos é excelente para pagar contas de consumo sem esforço adicional.`
      });
    }

    return list;
  };

  const insights = getInsights();

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner explaining purpose */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-zinc-900 text-white rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="px-3 py-1 bg-accent/20 text-accent text-[10px] font-black uppercase tracking-widest rounded-full border border-accent/30">Resumo Financeiro & DRE</span>
              <span className="text-slate-400 text-xs font-semibold">| Manutenção, Custos & Resultado</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight">Painel de Gestão e Custos Operacionais</h2>
            <p className="text-slate-300 text-xs md:text-sm mt-2 max-w-2xl font-medium leading-relaxed">
              Análise completa dos gastos para manter a barbearia funcionando (aluguel, contas, fornecedores, mercado e copa) separada do repasse de serviços.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/10 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent">
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-black">Período Analisado</p>
              <p className="text-xs font-bold text-white mt-0.5">{dateRange.start} até {dateRange.end}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:border-slate-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Faturamento Bruto</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <TrendingUp size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800">R$ {dre.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-emerald-600 font-bold mt-2 flex items-center gap-1">
            <span>Serviços + Revenda + Outros</span>
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:border-slate-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Custos Manutenção & Fixos</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Store size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-blue-600">R$ {(dre.operationalExpenses + dre.utilityExpenses + dre.rentExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-500 font-bold mt-2">
            Aluguel, Luz, Água, Mercado & Copa
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:border-slate-200 transition-all">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Comissões & Estoque (CPV)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <ShoppingBag size={16} />
            </div>
          </div>
          <p className="text-2xl font-black text-amber-600">R$ {dre.cogs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[11px] text-slate-500 font-bold mt-2">
            {dre.getPercent(dre.cogs).toFixed(1)}% do faturamento bruto
          </p>
        </div>

        <div className={`rounded-3xl p-6 shadow-sm border ${dre.netIncome >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950' : 'bg-red-500/10 border-red-500/20 text-red-950'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">Resultado Líquido (Lucro)</span>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${dre.netIncome >= 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
              <DollarSign size={16} />
            </div>
          </div>
          <p className={`text-2xl font-black ${dre.netIncome >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            R$ {dre.netIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[11px] font-black mt-2">
            Margem: {(dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Detailed Expense Categories & Structured DRE */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Barbershop Maintenance & Operational Expense Breakdown Card */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                  <Receipt size={18} className="text-accent" />
                  Gastos para Manter a Barbearia Funcionando (Por Categoria)
                </h3>
                <p className="text-xs text-muted font-medium mt-1">
                  Despesas essenciais de aluguel, fornecedores, mercado, copa e contas correntes.
                </p>
              </div>
              <span className="text-[10px] uppercase font-black bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full">
                Total: R$ {(dre.operationalExpenses + dre.supplierExpenses).toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Aluguel e Ocupação</p>
                    <p className="text-[10px] text-muted font-bold">Imóvel e condomínio</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.rentExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.rentExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-600 flex items-center justify-center font-bold">
                    <Zap size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Água, Luz e Internet</p>
                    <p className="text-[10px] text-muted font-bold">Utilidades básicas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.utilityExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.utilityExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                    <Coffee size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Mercado, Copa & Limpeza</p>
                    <p className="text-[10px] text-muted font-bold">Café, bebidas e higiene</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.marketExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.marketExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Fornecedores & Estoque</p>
                    <p className="text-[10px] text-muted font-bold">Pomadas, lâminas e insumos</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.supplierExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.supplierExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Pessoal & Pró-Labore</p>
                    <p className="text-[10px] text-muted font-bold">Salários fixos e diaristas</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.payrollExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.payrollExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center font-bold">
                    <Megaphone size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Marketing & Anúncios</p>
                    <p className="text-[10px] text-muted font-bold">Tráfego pago e redes sociais</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.marketingExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.marketingExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Manutenção & Reparos</p>
                    <p className="text-[10px] text-muted font-bold">Cadeiras, ar-condicionado</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.maintenanceExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.maintenanceExpenses).toFixed(1)}%</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-800">Sistemas & Taxas</p>
                    <p className="text-[10px] text-muted font-bold">Softwares e tarifas bancárias</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-800">R$ {dre.adminExpenses.toFixed(2)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{dre.getPercent(dre.adminExpenses).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Structured DRE Table */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                  <FileText size={18} className="text-accent" />
                  Demonstração do Resultado do Exercício (DRE)
                </h3>
                <p className="text-xs text-muted font-medium mt-1">Visão completa consolidada de receitas, deduções, CPV, OPEX e Lucro Líquido.</p>
              </div>
            </div>

            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                    <th className="p-4 text-left">Estrutura de Contas</th>
                    <th className="p-4 text-right w-28">Valor (R$)</th>
                    <th className="p-4 text-right w-20">% Rec.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/60">
                  {/* Gross Revenue */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('receitas')}>
                      {expandedRows.receitas ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(+) RECEITA OPERACIONAL BRUTA</span>
                    </td>
                    <td className="p-4 text-right text-emerald-600">R$ {dre.grossRevenue.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">100.0%</td>
                  </tr>
                  
                  <AnimatePresence>
                    {expandedRows.receitas && (
                      <>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Serviços Prestados (Barba, Cabelo, etc.)</td>
                          <td className="p-3 text-right">R$ {dre.serviceRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.serviceRevenue).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Revenda de Produtos (Homecare, Pomadas)</td>
                          <td className="p-3 text-right">R$ {dre.productRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.productRevenue).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Outras Receitas Diversas</td>
                          <td className="p-3 text-right">R$ {dre.otherRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.otherRevenue).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Deductions */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('deducoes')}>
                      {expandedRows.deducoes ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) DEDUÇÕES DA RECEITA (Taxas Cartão/Pix)</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.feeDeductions.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.feeDeductions).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.deducoes && (
                      <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                        <td className="p-3 pl-8">Taxas de Operadoras e Gateway</td>
                        <td className="p-3 text-right">R$ {dre.feeDeductions.toFixed(2)}</td>
                        <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.feeDeductions).toFixed(1)}%</td>
                      </tr>
                    )}
                  </AnimatePresence>

                  {/* Net Revenue */}
                  <tr className="bg-slate-100/50 font-black text-slate-800">
                    <td className="p-4 pl-4">(=) RECEITA OPERACIONAL LÍQUIDA</td>
                    <td className="p-4 text-right text-emerald-700">R$ {dre.netRevenue.toFixed(2)}</td>
                    <td className="p-4 text-right">{dre.getPercent(dre.netRevenue).toFixed(1)}%</td>
                  </tr>

                  {/* COGS */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('custosDiretos')}>
                      {expandedRows.custosDiretos ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) CUSTOS DIRETOS (Comissões & Estoque)</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.cogs.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.cogs).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.custosDiretos && (
                      <>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Comissões de Profissionais Pagas/A Pagar</td>
                          <td className="p-3 text-right">R$ {dre.commissionsCost.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.commissionsCost).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Aquisição de Insumos/Estoque (Fornecedores)</td>
                          <td className="p-3 text-right">R$ {dre.supplierExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.supplierExpenses).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Gross Profit */}
                  <tr className="bg-slate-100/50 font-black text-slate-800">
                    <td className="p-4 pl-4">(=) MARGEM OPERACIONAL BRUTA</td>
                    <td className="p-4 text-right text-emerald-700">R$ {dre.grossProfit.toFixed(2)}</td>
                    <td className="p-4 text-right">{dre.getPercent(dre.grossProfit).toFixed(1)}%</td>
                  </tr>

                  {/* OPEX */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('despesasOp')}>
                      {expandedRows.despesasOp ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) DESPESAS OPERACIONAIS PARA MANTER A BARBEARIA</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.operationalExpenses.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.operationalExpenses).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.despesasOp && (
                      <>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Aluguel e Condomínio do Imóvel</td>
                          <td className="p-3 text-right">R$ {dre.rentExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.rentExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Água, Luz, Internet e Telefone</td>
                          <td className="p-3 text-right">R$ {dre.utilityExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.utilityExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Mercado, Copa, Café e Limpeza</td>
                          <td className="p-3 text-right">R$ {dre.marketExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.marketExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Salários Administrativos, Pró-Labore & Diaristas</td>
                          <td className="p-3 text-right">R$ {dre.payrollExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.payrollExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Marketing, Anúncios e Tráfego</td>
                          <td className="p-3 text-right">R$ {dre.marketingExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.marketingExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Manutenção e Reparos</td>
                          <td className="p-3 text-right">R$ {dre.maintenanceExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.maintenanceExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Sistemas, Softwares e Taxas Bancárias</td>
                          <td className="p-3 text-right">R$ {dre.adminExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.adminExpenses).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Net Income */}
                  <tr className={`font-black uppercase text-sm ${dre.netIncome >= 0 ? 'bg-emerald-500/10 text-emerald-950 border-t-2 border-emerald-500/20' : 'bg-red-500/10 text-red-950 border-t-2 border-red-500/20'}`}>
                    <td className="p-4 pl-4 flex items-center gap-1.5">
                      <span>(=) RESULTADO LÍQUIDO DO PERÍODO (LUCRO LIVRE)</span>
                    </td>
                    <td className={`p-4 text-right font-black ${dre.netIncome >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>R$ {dre.netIncome.toFixed(2)}</td>
                    <td className="p-4 text-right font-black">{(dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right 1 Col: Charts & Insights */}
        <div className="space-y-8">
          
          {/* Revenue Source Chart */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
            <h4 className="font-bold text-slate-800 text-sm mb-6 flex items-center gap-2">
              <PieChart size={16} className="text-accent" />
              Fontes de Faturamento
            </h4>
            
            {revenueChartData.length > 0 ? (
              <div className="h-44 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Tooltip 
                      formatter={(v: any) => [`R$ ${v.toLocaleString()}`, 'Valor']}
                      contentStyle={{ background: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff' }}
                    />
                    <Pie
                      data={revenueChartData}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {revenueChartData.map((entry, index) => (
                        <Cell key={`pie-cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-widest text-muted font-black">Bruto</span>
                  <span className="text-sm font-black text-slate-800">R$ {Math.round(dre.grossRevenue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted font-bold italic">Sem receitas no período.</div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-4">
              {revenueChartData.map((r, i) => (
                <div key={`rev-card-${i}`} className="bg-slate-50 border border-slate-100/50 p-3 rounded-xl text-center">
                  <span className="block text-[8px] uppercase font-black tracking-wider mb-0.5 truncate" style={{ color: r.color }}>{r.name}</span>
                  <span className="text-xs font-black text-slate-800">R$ {r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Expense Categories Distribution Chart */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
            <h4 className="font-bold text-slate-800 text-sm mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-secondary" />
              Distribuição de Gastos da Barbearia
            </h4>

            {expenseChartData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseChartData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} tickLine={false} />
                    <YAxis dataKey="name" type="category" style={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} width={100} tickLine={false} axisLine={false} />
                    <Tooltip 
                      formatter={(v: any) => [`R$ ${v.toLocaleString()}`, 'Gasto']}
                      contentStyle={{ background: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {expenseChartData.map((entry: any, index: number) => (
                        <Cell key={`bar-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted font-bold italic">Sem despesas registradas no período.</div>
            )}
          </div>

          {/* Business Intelligence & Recommendations */}
          <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-8 space-y-6">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              Diagnóstico Operacional & Dicas
            </h4>

            <div className="space-y-4">
              {insights.map((ins, index) => {
                let badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                if (ins.type === 'success') badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-100';
                if (ins.type === 'warning') badgeColor = 'bg-amber-50 text-amber-800 border-amber-100';
                if (ins.type === 'danger') badgeColor = 'bg-rose-50 text-rose-800 border-rose-100';

                return (
                  <div key={`insight-${index}`} className={`flex gap-3 p-4 rounded-2xl border text-xs leading-relaxed font-semibold ${badgeColor}`}>
                    {ins.type === 'danger' || ins.type === 'warning' ? (
                      <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                    ) : (
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                    )}
                    <p>{ins.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
