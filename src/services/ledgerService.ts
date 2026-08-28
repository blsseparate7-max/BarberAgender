import { useMemo } from 'react';
import { Commission, ProfessionalAdvance, UserProfile } from '../types';

export interface ProfessionalLedger {
  uid: string;
  nome: string;
  email?: string;
  telefone?: string;
  avatar?: string;
  percentualComissao: number;
  metaMensal: number;
  
  // Métricas do Mês Atual (para exibição em tempo real nos cards)
  totalAtendimentosMes: number;
  faturamentoBrutoMes: number;
  comissaoGeradaMes: number;
  comissaoRepassadaMes: number;

  // Métricas Globais Pendentes (Saldo Real a Pagar)
  comissaoPendenteBruta: number;
  valesPendentes: number;
  saldoPendenteLiquido: number;
}

/**
 * Motor de Cálculo Unificado de Comissões e Vales
 * Garante fidelidade matemática 100% entre a aba de Barbeiros, Comissões e Financeiro.
 */
export function calculateProfessionalLedger(
  barber: UserProfile,
  allCommissions: any[],
  allAdvances: any[],
  currentMonthStr?: string
): ProfessionalLedger {
  const targetMonth = currentMonthStr || new Date().toISOString().substring(0, 7); // "YYYY-MM"
  const barberUid = barber.uid;
  const barberName = (barber.nome || '').toLowerCase().trim();

  // 1. Filtrar todas as comissões do profissional (com tolerância para campos legados)
  const proCommissionsAll = allCommissions.filter(c => 
    c.profissional_id === barberUid || 
    c.barbeiro_id === barberUid ||
    (barberName && (c.profissional_name || '').toLowerCase().trim() === barberName)
  );

  // 2. Comissões do mês corrente
  const proCommissionsMonth = proCommissionsAll.filter(c => 
    c.date && c.date.startsWith(targetMonth)
  );

  const totalAtendimentosMes = proCommissionsMonth.length;
  
  const faturamentoBrutoMes = proCommissionsMonth
    .filter(c => c.commission_type !== 'assinatura' && c.commission_type !== 'bonus')
    .reduce((acc, c) => acc + (c.base_value || c.amount || 0), 0);

  const comissaoGeradaMes = proCommissionsMonth
    .reduce((acc, c) => acc + (c.commission_value || 0), 0);

  const comissaoRepassadaMes = proCommissionsMonth
    .filter(c => c.status === 'pago')
    .reduce((acc, c) => acc + (c.commission_value || 0), 0);

  // 3. Comissões Pendentes (todas as pendentes no histórico, sem truncar mês)
  const comissaoPendenteBruta = proCommissionsAll
    .filter(c => c.status === 'pendente' || !c.status)
    .reduce((acc, c) => acc + (c.commission_value || 0), 0);

  // 4. Vales e Adiantamentos Pendentes
  const proAdvancesAll = allAdvances.filter(a => 
    a.profissional_id === barberUid || 
    a.barber_id === barberUid ||
    (barberName && (a.profissional_name || '').toLowerCase().trim() === barberName)
  );

  const valesPendentes = proAdvancesAll
    .filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'))
    .reduce((acc, a) => acc + (a.amount || 0), 0);

  // 5. Saldo Líquido Real Devedor
  const saldoPendenteLiquido = Math.max(0, comissaoPendenteBruta - valesPendentes);

  return {
    uid: barberUid,
    nome: barber.nome || 'Profissional',
    email: barber.email,
    telefone: barber.telefone || barber.phone,
    avatar: barber.avatar,
    percentualComissao: barber.percentual_comissao ?? barber.commission_percentage ?? 50,
    metaMensal: barber.meta_mensal ?? barber.monthly_goal ?? 0,
    totalAtendimentosMes,
    faturamentoBrutoMes,
    comissaoGeradaMes,
    comissaoRepassadaMes,
    comissaoPendenteBruta,
    valesPendentes,
    saldoPendenteLiquido
  };
}
