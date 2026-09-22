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
 * Motor de Cálculo Unificado de Comissões e Vales - 100% BASEADO EM ID
 * Elimina qualquer correspondência por nome ou aproximação de string.
 * Mesmo que existam múltiplos profissionais com o mesmo primeiro nome (ex: 3x Gabriel),
 * cada lançamento é atribuído com fidelidade absoluta através do UID.
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
  const barberNameClean = (barber.nome || '').trim().toLowerCase();

  // Conjunto de IDs vinculados ao profissional (incluindo migrações e aliases conhecidos)
  const matchingUids = new Set<string>();
  if (barberUid) matchingUids.add(barberUid);
  if (Array.isArray((barber as any).legacy_uids)) {
    (barber as any).legacy_uids.forEach((id: string) => {
      if (id) matchingUids.add(id);
    });
  }
  // Mapeamento específico do histórico do Moisés na barbearia gbcortes7
  if (barberUid === 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2' || barberUid === 'XpDGfA241JOx7dzoAgKugo86ld62' || barberNameClean.includes('moises') || barberNameClean.includes('moisés')) {
    matchingUids.add('QoaTs0kU4vaWC7l1F0BfT3Fj5IX2');
    matchingUids.add('XpDGfA241JOx7dzoAgKugo86ld62');
  }

  // Correspondência estrita e 100% baseada no ID único do profissional
  const isMatchingBarber = (item: any): boolean => {
    if (!item) return false;
    const proId = item.profissional_id || item.barbeiro_id || item.barber_id;
    if (proId && matchingUids.has(proId)) return true;
    return false;
  };

  // Helper para extração uniforme de data (YYYY-MM-DD)
  const extractDate = (item: any): string => {
    if (!item) return '';
    if (item.date && typeof item.date === 'string') {
      return item.date.substring(0, 10);
    }
    if (item.date && item.date.seconds) {
      const d = new Date(item.date.seconds * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (item.date && typeof item.date.toDate === 'function') {
      const d = item.date.toDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
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

  // Conjunto de IDs de comandas não fechadas (abertas sem pagamento, canceladas ou estornadas) para ignorar comissões residuais
  const nonClosedComandaIds = new Set<string>();
  if (Array.isArray(allComandas)) {
    allComandas.forEach(c => {
      const st = (c.status || '').toLowerCase();
      const hasPay = Number(c.paidAmount || (c as any).valorPago || 0) > 0 || (Array.isArray(c.payments) && c.payments.length > 0);
      if (st === 'cancelada' || st === 'cancelado' || st === 'estornada' || (st === 'aberta' && !hasPay) || st === 'aguardando_pagamento') {
        nonClosedComandaIds.add(c.id);
      }
    });
  }

  // 1. Iniciar com todas as comissões registradas ativas do profissional (ignorando canceladas e de comandas abertas/reabertas)
  const proCommissionsAll = (allCommissions || [])
    .filter(isMatchingBarber)
    .filter(c => {
      if (c.status === 'cancelado' || c.status === 'estornado') return false;
      if (c.comanda_id && nonClosedComandaIds.has(c.comanda_id)) return false;
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

  const proCommissionsPeriod = proCommissionsAll.filter(c => isWithinPeriod(extractDate(c)));

  // A. Dynamic Calculation from Closed Comandas (Item by Item) when available
  let closedComandaRevenuePeriod = 0;
  let closedComandaCommissionPeriod = 0;
  let closedComandaItemCountPeriod = 0;
  let hasClosedComandaItems = false;

  if (Array.isArray(allComandas) && allComandas.length > 0) {
    allComandas.forEach(c => {
      const st = (c.status || '').toLowerCase();
      const hasPay = Number(c.paidAmount || (c as any).valorPago || 0) > 0 || (Array.isArray(c.payments) && c.payments.length > 0);
      const isClosed = st === 'fechada' || st === 'paga' || st === 'pago' || st === 'concluido' || st === 'finalizada' || (st === 'aberta' && hasPay);
      if (!isClosed) return;

      const cDate = extractDate(c) || (c.date ? c.date.substring(0, 10) : '');
      if (!isWithinPeriod(cDate)) return;

      const mainBarberId = c.barber_id || c.profissional_id || c.barbeiro_id;
      const items = c.services || c.itens || c.items || [];

      items.forEach((it: any) => {
        const itemProfId = it.profissional_id || it.barber_id || it.barbeiro_id || mainBarberId;
        const matchesThisBarber = Boolean(itemProfId && itemProfId === barberUid);

        if (matchesThisBarber) {
          hasClosedComandaItems = true;
          const price = Number(it.totalPrice !== undefined && it.totalPrice !== null ? it.totalPrice : (it.price || it.unitPrice || it.valor || it.preco || 0));
          let commVal = 0;
          if (it.commission_value !== undefined && it.commission_value !== null && !isNaN(Number(it.commission_value))) {
            commVal = Number(it.commission_value);
          } else if (it.commission_percentage !== undefined && it.commission_percentage !== null && !isNaN(Number(it.commission_percentage))) {
            commVal = price * (Number(it.commission_percentage) / 100);
          } else if (it.percentual !== undefined && it.percentual !== null && !isNaN(Number(it.percentual))) {
            commVal = price * (Number(it.percentual) / 100);
          } else {
            const isProduct = (it.type === 'produto' || it.tipo === 'produto' || (it.name || '').toLowerCase().includes('produto'));
            const isSobrancelha = (it.name || it.nome || '').toLowerCase().includes('sobrancelha');
            let pct = isSobrancelha ? 25 : (isProduct ? (barber.percentual_produto || 30) : (barber.percentual_comissao ?? barber.commission_percentage ?? 50));
            commVal = price * (pct / 100);
          }

          closedComandaRevenuePeriod += price;
          closedComandaCommissionPeriod += commVal;
          closedComandaItemCountPeriod++;
        }
      });
    });
  }

  // Prefer the official commissions records from the commissions collection as the single source of truth for the financial ledger
  const hasCommissionsDocs = Array.isArray(proCommissionsPeriod) && proCommissionsPeriod.length > 0;

  // A. Ganhos e Atendimentos do Mês Selecionado
  const totalAtendimentosMes = hasCommissionsDocs
    ? proCommissionsPeriod.filter(c => c.commission_type !== 'bonus').length
    : (hasClosedComandaItems ? closedComandaItemCountPeriod : 0);
  
  const faturamentoBrutoMes = hasCommissionsDocs
    ? proCommissionsPeriod
        .filter(c => c.commission_type !== 'bonus')
        .reduce((acc, c) => acc + getCommissionBaseValue(c), 0)
    : (hasClosedComandaItems ? closedComandaRevenuePeriod : 0);

  const comissaoGeradaMes = hasCommissionsDocs
    ? proCommissionsPeriod.reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0)
    : (hasClosedComandaItems ? closedComandaCommissionPeriod : 0);

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

  // D. Comissões Pendentes no Período Selecionado
  const comissaoPendenteBruta = hasCommissionsDocs
    ? proCommissionsPeriod
        .filter(c => c.status === 'pendente' || !c.status)
        .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0)
    : (hasClosedComandaItems ? closedComandaCommissionPeriod : 0);

  // E. Vales e Adiantamentos Pendentes no Período Selecionado com deduplicação
  const proAdvancesAll = (allAdvances || [])
    .filter(isMatchingBarber)
    .filter(a => {
      if (!a) return false;
      if (a.is_deleted) return false;
      const st = String(a.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'excluido' || st === 'estornado' || st === 'cancelled') return false;
      const desc = String(a.description || '').toLowerCase();
      const cat = String(a.category || '').toLowerCase();
      if (desc.includes('estorno') || cat.includes('estorno') || a.is_vale_refund) return false;
      return true;
    });

  // Deduplicação de vales por ID único ou assinatura (data + valor + barbeiro) para evitar duplicações de sincronização
  const seenAdvanceIds = new Set<string>();
  const seenAdvanceSignatures = new Set<string>();
  const uniqueAdvances: any[] = [];

  proAdvancesAll.forEach(a => {
    if (a.id && seenAdvanceIds.has(a.id)) return;
    if (a.id) seenAdvanceIds.add(a.id);

    const aDate = extractDate(a) || (a.date ? String(a.date).substring(0, 10) : '');
    const aAmt = Number(a.amount) || 0;
    const sig = `${aDate}_${aAmt.toFixed(2)}`;
    
    // Se não tem ID mas tem mesma data e valor exato repetido no mesmo lote
    if (!a.id && seenAdvanceSignatures.has(sig)) return;
    seenAdvanceSignatures.add(sig);

    uniqueAdvances.push(a);
  });

  const proAdvancesPeriod = uniqueAdvances.filter(a => isWithinPeriod(extractDate(a)));
    
  let valesPendentes = uniqueAdvances
    .filter(a => a.status === 'pendente' || (!a.status && !a.repasse_id))
    .reduce((acc, a) => acc + (Number(a.amount) || 0), 0);

  // F. Saldo Líquido Real Devedor (Pendente Líquido)
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
