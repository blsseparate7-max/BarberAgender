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
  Zap
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
  CartesianGrid 
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
  });

  const toggleRow = (row: string) => {
    setExpandedRows(prev => ({ ...prev, [row]: !prev[row] }));
  };

  // Compute DRE numbers
  const computeDRE = () => {
    let serviceRevenue = 0;
    let productRevenue = 0;
    let otherRevenue = 0;
    let feeDeductions = 0;

    let personalExpenses = 0;
    let adminExpenses = 0;
    let marketingExpenses = 0;
    let shopExpenses = 0;
    let inventoryExpenses = 0;
    let otherExpenses = 0;

    transactions.forEach(t => {
      if (t.type === 'income') {
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const amount = t.amount || 0;
        const fee = t.fee_amount || 0;
        
        feeDeductions += fee;

        if (cat.includes('serviço') || cat.includes('servico') || cat.includes('atendimento') || t.agendamento_id) {
          serviceRevenue += amount;
        } else if (cat.includes('produto') || cat.includes('estoque') || cat.includes('venda')) {
          productRevenue += amount;
        } else {
          otherRevenue += amount;
        }
      } else if (t.type === 'expense' || t.type === 'sangria') {
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const amount = t.amount || 0;

        if (
          cat.includes('pessoal') || 
          cat.includes('pró-labore') || 
          cat.includes('pro-labore') || 
          cat.includes('salário') || 
          cat.includes('salario') || 
          cat.includes('diarista') ||
          cat.includes('colaborador') ||
          desc.includes('diarista') ||
          desc.includes('salario') ||
          desc.includes('salário')
        ) {
          personalExpenses += amount;
        } else if (
          cat.includes('aluguel') || 
          cat.includes('água') || 
          cat.includes('agua') || 
          cat.includes('luz') || 
          cat.includes('energia') || 
          cat.includes('internet') || 
          cat.includes('sistema') || 
          cat.includes('telefone') || 
          cat.includes('administrativa') || 
          cat.includes('tarifa') ||
          desc.includes('aluguel') ||
          desc.includes('luz') ||
          desc.includes('água')
        ) {
          adminExpenses += amount;
        } else if (
          cat.includes('marketing') || 
          cat.includes('anúncio') || 
          cat.includes('anuncio') || 
          cat.includes('propaganda') || 
          cat.includes('tráfego') || 
          cat.includes('trafego')
        ) {
          marketingExpenses += amount;
        } else if (
          cat.includes('copa') || 
          cat.includes('limpeza') || 
          cat.includes('consumo') || 
          cat.includes('consumível') || 
          cat.includes('consumivel')
        ) {
          shopExpenses += amount;
        } else if (
          cat.includes('produto') || 
          cat.includes('estoque') || 
          cat.includes('compra de mercadoria') || 
          cat.includes('compra mercadoria') ||
          desc.includes('compras de estoque') ||
          desc.includes('repor estoque')
        ) {
          inventoryExpenses += amount;
        } else {
          otherExpenses += amount;
        }
      }
    });

    // Professional Commissions
    // We can count commissions generated for this period from state, OR fall back to payouts/expenses if state is empty
    let commissionsCost = commissions
      .filter(c => c.status === 'pendente' || c.status === 'pago')
      .reduce((acc, c) => acc + (c.commission_value || 0), 0);

    // Fallback if no commissions are loaded in props but we have commission payout transactions
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
    const cogs = commissionsCost + inventoryExpenses;
    const grossProfit = netRevenue - cogs;
    const operationalExpenses = personalExpenses + adminExpenses + marketingExpenses + shopExpenses + otherExpenses;
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
      inventoryExpenses,
      cogs,
      grossProfit,
      personalExpenses,
      adminExpenses,
      marketingExpenses,
      shopExpenses,
      otherExpenses,
      operationalExpenses,
      netIncome,
      getPercent
    };
  };

  const dre = computeDRE();

  // Prepare Chart Data
  const revenueChartData = [
    { name: 'Serviços', value: Math.round(dre.serviceRevenue), color: '#10b981' },
    { name: 'Produtos', value: Math.round(dre.productRevenue), color: '#3b82f6' },
    { name: 'Outras', value: Math.round(dre.otherRevenue), color: '#8b5cf6' },
  ].filter(d => d.value > 0);

  const costBreakdownData = [
    { name: 'Comissões', Valor: Math.round(dre.commissionsCost), color: '#f59e0b' },
    { name: 'Estoque/CPV', Valor: Math.round(dre.inventoryExpenses), color: '#ef4444' },
    { name: 'Pessoal/Salários', Valor: Math.round(dre.personalExpenses), color: '#a855f7' },
    { name: 'Administrativo', Valor: Math.round(dre.adminExpenses), color: '#64748b' },
    { name: 'Marketing/Anúncios', Valor: Math.round(dre.marketingExpenses), color: '#f43f5e' },
    { name: 'Sobra Líquida', Valor: dre.netIncome > 0 ? Math.round(dre.netIncome) : 0, color: '#10b981' }
  ].filter(d => d.Valor > 0);

  // Business intelligence insights rules
  const getInsights = () => {
    const list = [];
    const profitMargin = dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0;
    const commissionRatio = dre.grossRevenue > 0 ? (dre.commissionsCost / dre.grossRevenue) * 100 : 0;
    const adminRatio = dre.grossRevenue > 0 ? (dre.adminExpenses / dre.grossRevenue) * 100 : 0;

    // Margin rule
    if (dre.grossRevenue > 0) {
      if (profitMargin >= 25) {
        list.push({
          type: 'success',
          text: `Excelente rentabilidade líquida (${profitMargin.toFixed(1)}%). O negócio está altamente eficiente em converter faturamento bruto em caixa livre.`
        });
      } else if (profitMargin >= 10) {
        list.push({
          type: 'info',
          text: `Índice de lucro líquido dentro da média saudável (${profitMargin.toFixed(1)}%). Continue monitorando os custos para mantê-lo acima de 15%.`
        });
      } else if (profitMargin >= 0) {
        list.push({
          type: 'warning',
          text: `Rentabilidade operacional muito baixa (${profitMargin.toFixed(1)}%). Altas despesas gerais ou baixo preço médio podem estar canibalizando seu lucro.`
        });
      } else {
        list.push({
          type: 'danger',
          text: `Déficit operacional detectado! Suas despesas excederam as receitas em R$ ${Math.abs(dre.netIncome).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Urgente conter despesas de consumo e fixas.`
        });
      }
    }

    // Commission percentage rule
    if (commissionRatio >= 50) {
      list.push({
        type: 'danger',
        text: `As comissões de profissionais consomem ${commissionRatio.toFixed(1)}% do faturamento bruto. Margens acima de 50% dificultam a cobertura dos custos fixos.`
      });
    } else if (commissionRatio > 35) {
      list.push({
        type: 'info',
        text: `Custo de comissionamento está controlado em ${commissionRatio.toFixed(1)}%. Boa distribuição de valor profissional para o salão/clínica.`
      });
    }

    // Admin ratio rule
    if (adminRatio > 20) {
      list.push({
        type: 'warning',
        text: `Despesas fixas administrativas representam ${adminRatio.toFixed(1)}% da receita total. É recomendável renegociar contratos de aluguel ou otimizar contas de água, luz e internet.`
      });
    }

    if (dre.productRevenue === 0 && dre.grossRevenue > 0) {
      list.push({
        type: 'info',
        text: `Incentive a venda de produtos de revenda (homecare) no balcão. Eles carregam uma alta margem e podem cobrir as despesas de água/luz facilmente.`
      });
    }

    return list;
  };

  const insights = getInsights();

  return (
    <div className="space-y-8">
      {/* Overview stats header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-sm border border-slate-800">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Faturamento Bruto</p>
          <p className="text-2xl font-black mt-2">R$ {dre.grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-emerald-400 font-extrabold">
            <TrendingUp size={12} />
            <span>100% de entradas unificadas</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Custos Diretos (CPV)</p>
          <p className="text-2xl font-black text-rose-600 mt-2">R$ {dre.cogs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-muted font-bold mt-2">
            Equivale a <strong className="font-extrabold text-primary">{dre.getPercent(dre.cogs).toFixed(1)}%</strong> da receita
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Despesas Gerais (OPEX)</p>
          <p className="text-2xl font-black text-amber-600 mt-2">R$ {dre.operationalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-muted font-bold mt-2">
            Equivale a <strong className="font-extrabold text-primary">{dre.getPercent(dre.operationalExpenses).toFixed(1)}%</strong> da receita
          </p>
        </div>

        <div className={`rounded-3xl p-6 shadow-sm border ${dre.netIncome >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-950' : 'bg-red-500/10 border-red-500/20 text-red-950'}`}>
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-500">Resultado Líquido (EBITDA)</p>
          <p className={`text-2xl font-black mt-2 ${dre.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            R$ {dre.netIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-1 mt-2 text-[10px] font-black">
            <Zap size={12} className={dre.netIncome >= 0 ? 'text-emerald-500' : 'text-red-500'} />
            <span>Margem Líquida de {(dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Structured Statement column (2cols wide) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-[2rem] shadow-sm p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-lg text-primary flex items-center gap-2">
                  <FileText size={18} className="text-accent" />
                  DRE Gerencial Estruturada
                </h3>
                <p className="text-xs text-muted font-medium mt-0.5 mt-1">Demonstração de resultados conforme regime de competência operacional.</p>
              </div>
              <span className="text-[10px] uppercase font-black bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">Operacional</span>
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
                  {/* Gross Revenue section */}
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
                          <td className="p-3 pl-8">Receita de Serviços Prestados</td>
                          <td className="p-3 text-right">R$ {dre.serviceRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.serviceRevenue).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Receita de Consumo e Revenda (Produtos)</td>
                          <td className="p-3 text-right">R$ {dre.productRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.productRevenue).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Outras Receitas Operacionais</td>
                          <td className="p-3 text-right">R$ {dre.otherRevenue.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.otherRevenue).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Deductions section */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('deducoes')}>
                      {expandedRows.deducoes ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) DEDUÇÕES DA RECEITA</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.feeDeductions.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.feeDeductions).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.deducoes && (
                      <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                        <td className="p-3 pl-8">Taxas de Administradoras (Cartões/Pix)</td>
                        <td className="p-3 text-right">R$ {dre.feeDeductions.toFixed(2)}</td>
                        <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.feeDeductions).toFixed(1)}%</td>
                      </tr>
                    )}
                  </AnimatePresence>

                  {/* Net Revenue line */}
                  <tr className="bg-slate-100/50 font-black text-slate-800">
                    <td className="p-4 pl-4">(=) RECEITA OPERACIONAL LÍQUIDA</td>
                    <td className="p-4 text-right text-emerald-700">R$ {dre.netRevenue.toFixed(2)}</td>
                    <td className="p-4 text-right">{dre.getPercent(dre.netRevenue).toFixed(1)}%</td>
                  </tr>

                  {/* Costs line (COGS) */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('custosDiretos')}>
                      {expandedRows.custosDiretos ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) CUSTOS DE SERVIÇOS E PRODUTOS (CPV)</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.cogs.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.cogs).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.custosDiretos && (
                      <>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Comissões de Profissionais Pagas/A pagar</td>
                          <td className="p-3 text-right">R$ {dre.commissionsCost.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.commissionsCost).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Custo de Estoque Comprado (Insumos/Produtos)</td>
                          <td className="p-3 text-right">R$ {dre.inventoryExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.inventoryExpenses).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* Gross profit line */}
                  <tr className="bg-slate-100/50 font-black text-slate-800">
                    <td className="p-4 pl-4">(=) MARGEM OPERACIONAL BRUTA (LUCRO BRUTO)</td>
                    <td className="p-4 text-right text-emerald-700">R$ {dre.grossProfit.toFixed(2)}</td>
                    <td className="p-4 text-right">{dre.getPercent(dre.grossProfit).toFixed(1)}%</td>
                  </tr>

                  {/* Operating Expense block */}
                  <tr className="bg-slate-50/50 hover:bg-slate-50 transition-colors font-bold text-primary">
                    <td className="p-4 flex items-center gap-2 cursor-pointer" onClick={() => toggleRow('despesasOp')}>
                      {expandedRows.despesasOp ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span>(-) DESPESAS OPERACIONAIS FIXAS/OVERHEAD (OPEX)</span>
                    </td>
                    <td className="p-4 text-right text-rose-600">R$ {dre.operationalExpenses.toFixed(2)}</td>
                    <td className="p-4 text-right text-muted">{dre.getPercent(dre.operationalExpenses).toFixed(1)}%</td>
                  </tr>

                  <AnimatePresence>
                    {expandedRows.despesasOp && (
                      <>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Pessoal (Salários fixos, pró-labore, diaristas)</td>
                          <td className="p-3 text-right">R$ {dre.personalExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.personalExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Ocupação e Administrativo (Aluguel, luz, sistemas)</td>
                          <td className="p-3 text-right">R$ {dre.adminExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.adminExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Marketing, Anúncios e Promoções</td>
                          <td className="p-3 text-right">R$ {dre.marketingExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.marketingExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Copa, Conservação e Limpeza</td>
                          <td className="p-3 text-right">R$ {dre.shopExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.shopExpenses).toFixed(1)}%</td>
                        </tr>
                        <tr className="text-xs font-semibold text-slate-600 hover:bg-slate-50/30">
                          <td className="p-3 pl-8">Outras Despesas Operacionais Correntes</td>
                          <td className="p-3 text-right">R$ {dre.otherExpenses.toFixed(2)}</td>
                          <td className="p-3 text-right text-slate-400">{dre.getPercent(dre.otherExpenses).toFixed(1)}%</td>
                        </tr>
                      </>
                    )}
                  </AnimatePresence>

                  {/* EBITDA line */}
                  <tr className={`font-black uppercase text-sm ${dre.netIncome >= 0 ? 'bg-emerald-500/10 text-emerald-950 border-t-2 border-emerald-500/20' : 'bg-red-500/10 text-red-950 border-t-2 border-red-500/20'}`}>
                    <td className="p-4 pl-4 flex items-center gap-1.5">
                      <span>(=) RESULTADO OPERACIONAL LÍQUIDO do Período</span>
                    </td>
                    <td className={`p-4 text-right font-black ${dre.netIncome >= 0 ? 'text-emerald-600' : 'text-red-700'}`}>R$ {dre.netIncome.toFixed(2)}</td>
                    <td className="p-4 text-right font-black">{(dre.grossRevenue > 0 ? (dre.netIncome / dre.grossRevenue) * 100 : 0).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between text-[11px] text-muted font-bold pt-4 border-t border-slate-100">
            <span className="flex items-center gap-1"><Info size={12} /> DRE provida por regime de dedução dinâmica em tempo real.</span>
            <span>Período: {dateRange.start} a {dateRange.end}</span>
          </div>
        </div>

        {/* Right charts and list column (1col wide) */}
        <div className="space-y-8">
          {/* Revenue distribution and cost breakdown charts */}
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
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </RechartsPieChart>
                </ResponsiveContainer>
                
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] uppercase tracking-widest text-muted font-black">Total Receita</span>
                  <span className="text-sm font-black text-slate-800">R$ {Math.round(dre.grossRevenue)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted font-bold italic">Sem receitas no período.</div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-4">
              {revenueChartData.map((r, i) => (
                <div key={i} className="bg-slate-50 border border-slate-100/50 p-2.5 rounded-xl text-center">
                  <span className="block text-[8px] uppercase font-black text-slate-400 tracking-wider mb-0.5" style={{ color: r.color }}>{r.name}</span>
                  <span className="text-xs font-black text-slate-800">R$ {r.value}</span>
                  <span className="block text-[9px] font-black text-slate-400">({dre.getPercent(r.value).toFixed(0)}%)</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cost Allocation chart */}
          <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
            <h4 className="font-bold text-slate-800 text-sm mb-6 flex items-center gap-2">
              <BarChart3 size={16} className="text-secondary" />
              Alocação dos Recursos Financeiros
            </h4>

            {costBreakdownData.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costBreakdownData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" style={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} tickLine={false} />
                    <YAxis style={{ fontSize: 8, fontWeight: 700, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <Tooltip 
                      formatter={(v: any) => [`R$ ${v.toLocaleString()}`, 'Alocado']}
                      contentStyle={{ background: '#0F172A', borderRadius: '12px', border: 'none', color: '#fff' }}
                    />
                    <Bar dataKey="Valor" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {costBreakdownData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted font-bold italic">Sem movimentações para desenhar o gráfico.</div>
            )}
          </div>

          {/* Business Intelligence Insights Box */}
          <div className="bg-slate-50 border border-slate-100 rounded-[2rem] p-8 space-y-6">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              Diagnóstico e Inteligência
            </h4>

            <div className="space-y-4">
              {insights.map((ins, index) => {
                let badgeColor = 'bg-blue-100 text-blue-800 border-blue-200';
                if (ins.type === 'success') badgeColor = 'bg-emerald-50 text-emerald-800 border-emerald-100';
                if (ins.type === 'warning') badgeColor = 'bg-amber-50 text-amber-800 border-amber-100';
                if (ins.type === 'danger') badgeColor = 'bg-rose-50 text-rose-800 border-rose-100';

                return (
                  <div key={index} className={`flex gap-3 p-4 rounded-2xl border text-xs leading-relaxed font-semibold ${badgeColor}`}>
                    {ins.type === 'danger' || ins.type === 'warning' ? (
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                    )}
                    <p>{ins.text}</p>
                  </div>
                );
              })}
              {insights.length === 0 && (
                <div className="text-center py-4 text-xs font-bold text-muted italic">
                  Aguardando volume mínimo de dados financeiros para consolidação dos insights de performance.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
