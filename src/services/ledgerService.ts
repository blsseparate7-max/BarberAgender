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

// Explicit document ID mapping for misattributed professional_advances and financial_transactions items in Firestore
const ADVANCE_DOC_BARBER_MAP: Record<string, string> = {
  // Mateus Alexandre da Silva (UID: K2TXxyN75MZj4s6euPw2POZLNbt2)
  'FMJMseacBfqtMOB6zpsD': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'MdYuLV8u6beMIt0qpUyE': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'S0w7FHfDGNdG0BcA5woL': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'ZWtGrNdaeGZUXCnnLsUr': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'nfPj2ylUxGzacZMZLOLx': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'tnX3dsrbDWcSXIF5p0m6': 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  'qMHYpIZ7VvBmDE5DSqme': 'K2TXxyN75MZj4s6euPw2POZLNbt2',

  // Luiz Miguel Marciano dos Santos (UID: 317sdImqlYYfxbnsh3X6c34Cdm83)
  '1ZaSAGRZVKFEcVyVeFRq': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'KVPb42dMB6yinJsIvTLY': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'Sch2UMsTQg6G7G8ozvih': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'fpkK940QCA3XhISs2d27': '317sdImqlYYfxbnsh3X6c34Cdm83',
  '5kJJ9DK45uZZCiylsirc': '317sdImqlYYfxbnsh3X6c34Cdm83',
  '66o2s5t0Wm5qFTVVwRDh': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'BCK9m6ISwdckskDNz3Ff': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'TR3KzTmivvCyoQDthh8N': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'ghsM1ynLKB7Z6UlLi09M': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'gx99JwCRv8L3yMGYhVno': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'uTwD5hrNkRFEt5TTtuhU': '317sdImqlYYfxbnsh3X6c34Cdm83',
  'veniKZ0wv6nwLcKolDVM': '317sdImqlYYfxbnsh3X6c34Cdm83',

  // Luiz Henrique Francisco / Rick (UID: 3Xxfoflp1aW5gAutZ2MuDW0jjDF3)
  'Q7O0s1YKFqlim3XE7TnO': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'qb8kjGuS5KGdnwsZGfB6': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  '0euvLWgWTVqFJ3vc5sS1': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'Gc1zO9dgDSgyzCAlBxAN': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'JRFib6TR4Tvy0EHYs4nF': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'OCyiAYRMXrfoutZxD2pG': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'aFQTDMj06Q9Y8iGiMKcW': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'mclOjHZ31XdCXCS6qsnr': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'x99SeeHcUjsmkgwwBbUV': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'qcqXmSxz696uur2He8fP': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'aciD1nGVcmx8NUeK18M3': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  'sJTwq5d39BuyZRKGcA3Z': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  '4fDeBay9EYcqYfMT4KOf': '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',

  // Moisés Bueno (UID: QoaTs0kU4vaWC7l1F0BfT3Fj5IX2)
  'IdjfTIfWVzoEMZyGEFYK': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'Pj3l3KW3RLYUTRVSf3i8': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'j8jsjWegfKtiLjjg0GoQ': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'jazcu8i3sVDA99FbrtaP': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'ibzgXpwoXTgMjJBfp1uy': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'LE0x4KcjHzvlCK5q6Lp6': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'OhtjdOWrpOuOMfi3Iv7n': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'MlrpeeIPfjx248iNlwO5': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'nn8PR2vd5kUBNsvN3fmk': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'SrCChNgSchQecgRutyZZ': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
  'VzBWK8aiN5NBWtFzoTTs': 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2',
};

const normalizeName = (str: string) => {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

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
  const barberNameNorm = normalizeName(barber.nome || (barber as any).name || '');
  const barberFirstNameNorm = barberNameNorm.split(' ')[0] || '';
  const barberEmail = (barber.email || '').toLowerCase().trim();

  // Função robusta de correspondência do profissional (tolera UIDs antigos, barbeiro_id e variações de nome/acentuação)
  const isMatchingBarber = (item: any) => {
    if (!item) return false;

    // 1. Se o item possui um ID de profissional/barbeiro definido, ele é a verdade absoluta do Firestore!
    if (item.profissional_id || item.barbeiro_id) {
      const proId = item.profissional_id || item.barbeiro_id;
      return proId === barberUid;
    }

    // 2. Correspondência por nome do profissional (fallback caso não exista ID definido)
    const proNameNorm = normalizeName(item.profissional_name || item.barbeiro_nome || '');
    if (proNameNorm && barberNameNorm) {
      if (proNameNorm === barberNameNorm) return true;
      if (barberFirstNameNorm === 'gabriel' && proNameNorm.startsWith('gabriel')) return true;
      if ((barberFirstNameNorm === 'mateus' || barberFirstNameNorm === 'matheus') && (proNameNorm.startsWith('mateus') || proNameNorm.startsWith('matheus'))) return true;
      if (barberNameNorm.startsWith('luiz miguel') && proNameNorm.startsWith('luiz miguel')) return true;
      if (barberNameNorm.startsWith('luiz henrique') && proNameNorm.startsWith('luiz henrique')) return true;
      if (barberFirstNameNorm === 'moises' && proNameNorm.startsWith('moises')) return true;
      if (barberFirstNameNorm === 'bryan' && proNameNorm.startsWith('bryan')) return true;
      if (barberNameNorm.length > 5 && proNameNorm.includes(barberNameNorm)) return true;
    }

    if (barberEmail && item.profissional_email && item.profissional_email.toLowerCase().trim() === barberEmail) {
      return true;
    }

    // 3. Fallback adicional por descrição do vale/adiantamento (ex: "Vale p/ Luiz Miguel...", "Vale: Moises...")
    const descNorm = normalizeName(item.description || '');
    if (descNorm && barberNameNorm) {
      if (barberNameNorm.startsWith('luiz miguel') && (descNorm.includes('miguel') || descNorm.includes('luiz miguel'))) return true;
      if (barberNameNorm.startsWith('luiz henrique') && (descNorm.includes('luiz henrique') || descNorm.includes('henrique') || descNorm.includes('rick'))) return true;
      if (barberFirstNameNorm === 'mateus' && (descNorm.includes('mateus') || descNorm.includes('matheus'))) return true;
      if (barberFirstNameNorm === 'moises' && descNorm.includes('moises')) return true;
      if (barberFirstNameNorm === 'gabriel' && descNorm.includes('gabriel')) return true;
    }

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
      const mainBarberNameNorm = normalizeName(c.barber_name || c.profissional_name || c.barbeiro_nome || '');
      const items = c.services || c.itens || c.items || [];

      items.forEach((it: any) => {
        let itemProfId = it.profissional_id || it.barber_id || it.barbeiro_id || mainBarberId;
        let itemProfNameNorm = normalizeName(it.profissional_name || it.barber_name || it.barbeiro_nome || '') || mainBarberNameNorm;

        let matchesThisBarber = false;
        if (itemProfId && itemProfId === barberUid) {
          matchesThisBarber = true;
        } else if (itemProfNameNorm && barberNameNorm) {
          if (itemProfNameNorm === barberNameNorm) matchesThisBarber = true;
          else if (barberFirstNameNorm && itemProfNameNorm.includes(barberFirstNameNorm)) matchesThisBarber = true;
          else if (barberFirstNameNorm === 'moises' && itemProfNameNorm.includes('moises')) matchesThisBarber = true;
        } else if (!itemProfId && mainBarberId === barberUid) {
          matchesThisBarber = true;
        }

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

  // E. Vales e Adiantamentos Pendentes no Período Selecionado
  const proAdvancesPeriod = (allAdvances || [])
    .filter(isMatchingBarber)
    .filter(a => isWithinPeriod(extractDate(a)));
    
  let valesPendentes = proAdvancesPeriod
    .filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'))
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
