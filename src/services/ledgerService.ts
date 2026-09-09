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
  
  // Métricas do Período Filtrado / Mês Selecionado (para exibição em tempo real nos cards)
  totalAtendimentosMes: number;
  faturamentoBrutoMes: number;
  comissaoGeradaMes: number;
  comissaoRepassadaMes: number;

  // Métricas Acumuladas Desde o Início (Dia 1 / All-time)
  faturamentoBrutoTotal: number;
  comissaoGeradaTotal: number;
  totalAtendimentosTotal: number;

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
  currentMonthOrStartDate?: string,
  endDateStr?: string,
  allComandas?: any[],
  allAppointments?: any[]
): ProfessionalLedger {
  const barberUid = barber.uid;
  const barberName = (barber.nome || '').toLowerCase().trim();
  const barberFirstName = barberName.split(' ')[0] || '';
  const barberEmail = (barber.email || '').toLowerCase().trim();

  // Função robusta de correspondência do profissional (tolera UIDs antigos, barbeiro_id e variações de nome)
  const isMatchingBarber = (item: any) => {
    if (!item) return false;
    if (item.profissional_id === barberUid || item.barbeiro_id === barberUid) return true;

    const proName = (item.profissional_name || item.barbeiro_nome || '').toLowerCase().trim();
    if (proName && barberName) {
      if (proName === barberName) return true;
      if (barberFirstName === 'gabriel' && proName.startsWith('gabriel')) return true;
      if ((barberFirstName === 'mateus' || barberFirstName === 'matheus') && (proName.startsWith('mateus') || proName.startsWith('matheus'))) return true;
      if (barberName.startsWith('luiz miguel') && proName.startsWith('luiz miguel')) return true;
      if (barberName.startsWith('luiz henrique') && proName.startsWith('luiz henrique')) return true;
      if (barberFirstName === 'moises' && proName.startsWith('moises')) return true;
      if (barberFirstName === 'bryan' && proName.startsWith('bryan')) return true;
      if (barberName.length > 5 && proName.includes(barberName)) return true;
    }

    if (barberEmail && item.profissional_email && item.profissional_email.toLowerCase().trim() === barberEmail) {
      return true;
    }

    return false;
  };

  // Helper para extração uniforme de data (YYYY-MM-DD)
  const extractDate = (item: any): string => {
    if (!item) return '';
    if (item.date && typeof item.date === 'string') {
      return item.date.substring(0, 10);
    }
    // Prioriza data real registrada nos pagamentos da comanda
    if (Array.isArray(item.payments) && item.payments.length > 0 && item.payments[0]?.date) {
      return String(item.payments[0].date).substring(0, 10);
    }
    if (item.closedAt) {
      if (typeof item.closedAt === 'string') return item.closedAt.substring(0, 10);
      if (item.closedAt.seconds) {
        // Usa representação local para evitar salto de meia-noite em fusos como UTC-3 (Brasil)
        const d = new Date(item.closedAt.seconds * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    if (item.createdAt) {
      if (typeof item.createdAt === 'string') return item.createdAt.substring(0, 10);
      if (item.createdAt.seconds) {
        const d = new Date(item.createdAt.seconds * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
    return '';
  };

  // Conjunto de IDs de comandas canceladas/estornadas para ignorar comissões órfãs
  const cancelledComandaIds = new Set<string>();
  if (Array.isArray(allComandas)) {
    allComandas.forEach(c => {
      if (c.status === 'cancelada' || c.status === 'cancelado' || c.status === 'estornada') {
        cancelledComandaIds.add(c.id);
      }
    });
  }

  // 1. Iniciar com todas as comissões registradas ativas do profissional (ignorando canceladas)
  const proCommissionsAll = (allCommissions || [])
    .filter(isMatchingBarber)
    .filter(c => {
      if (c.status === 'cancelado' || c.status === 'estornado') return false;
      if (c.comanda_id && cancelledComandaIds.has(c.comanda_id)) return false;
      return true;
    })
    .map(c => ({ ...c }));

  // Helper para resolver o valor base faturado real do serviço
  const getCommissionBaseValue = (c: any) => {
    if (c.base_value !== undefined && c.base_value !== null && Number(c.base_value) > 0) {
      return Number(c.base_value);
    }
    if (c.amount !== undefined && c.amount !== null && Number(c.amount) > 0) {
      return Number(c.amount);
    }
    const commVal = Number(c.commission_value) || 0;
    const commPct = Number(c.commission_percentage) || 0;
    if (commPct > 0 && commVal > 0) {
      return (commVal * 100) / commPct;
    }
    return commVal;
  };

  // 2. Determinar intervalo de datas do período
  const isWithinPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = dateStr.substring(0, 10);
    if (currentMonthOrStartDate && endDateStr) {
      return d >= currentMonthOrStartDate && d <= endDateStr;
    }
    if (currentMonthOrStartDate) {
      if (currentMonthOrStartDate.length === 7) {
        return d.startsWith(currentMonthOrStartDate);
      }
      return d >= currentMonthOrStartDate;
    }
    const defaultMonth = new Date().toISOString().substring(0, 7);
    return d.startsWith(defaultMonth);
  };

  const proCommissionsPeriod = proCommissionsAll.filter(c => isWithinPeriod(c.date));

  // A. Ganhos e Atendimentos do Mês Selecionado
  const totalAtendimentosMes = proCommissionsPeriod.length;
  
  const faturamentoBrutoMes = proCommissionsPeriod
    .filter(c => c.commission_type !== 'bonus')
    .reduce((acc, c) => acc + getCommissionBaseValue(c), 0);

  const comissaoGeradaMes = proCommissionsPeriod
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // B. Repassado no Período
  const comissaoRepassadaMes = proCommissionsAll
    .filter(c => c.status === 'pago')
    .filter(c => {
      const pDate = extractDate(c) || c.date;
      return isWithinPeriod(pDate);
    })
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // C. Totais Históricos Acumulados (Desde o Dia 1)
  const totalAtendimentosTotal = proCommissionsAll.length;

  const faturamentoBrutoTotal = proCommissionsAll
    .filter(c => c.commission_type !== 'bonus')
    .reduce((acc, c) => acc + getCommissionBaseValue(c), 0);

  const comissaoGeradaTotal = proCommissionsAll
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // D. Comissões Pendentes (Dívida Acumulada Real - o que a barbearia deve ao barbeiro)
  // O saldo real a pagar ao barbeiro é contínuo e não é zerado ao mudar o filtro de mês
  const comissaoPendenteBruta = proCommissionsAll
    .filter(c => c.status === 'pendente' || !c.status)
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // E. Vales e Adiantamentos Pendentes (Acumulados até serem deduzidos ou pagos)
  const proAdvancesAll = (allAdvances || []).filter(isMatchingBarber);
  const valesPendentes = proAdvancesAll
    .filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'))
    .reduce((acc, a) => acc + (Number(a.amount) || 0), 0);

  // F. Saldo Líquido Real Devedor (Pendente Líquido)
  // Permite saldo negativo caso os vales superem a comissão pendente acumulada
  const saldoPendenteLiquido = comissaoPendenteBruta - valesPendentes;

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
    faturamentoBrutoTotal,
    comissaoGeradaTotal,
    totalAtendimentosTotal,
    comissaoPendenteBruta,
    valesPendentes,
    saldoPendenteLiquido
  };
}
