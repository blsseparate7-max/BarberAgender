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

  let joaoTimestamp = 0;
  const isLuizMiguel = barberName.includes('luiz miguel') || barberFirstName === 'luiz';
  if (isLuizMiguel) {
    if (Array.isArray(allComandas)) {
      allComandas.forEach(com => {
        if (isMatchingBarber(com) && ((com.cliente_name || '').toLowerCase().includes('joão') || (com.cliente_name || '').toLowerCase().includes('joao'))) {
          const t = com.createdAt?.seconds || com.closedAt?.seconds || 0;
          if (t > joaoTimestamp) joaoTimestamp = t;
        }
      });
    }
    if (joaoTimestamp === 0 && Array.isArray(allCommissions)) {
      allCommissions.forEach(comm => {
        if (isMatchingBarber(comm) && ((comm.cliente_name || '').toLowerCase().includes('joão') || (comm.cliente_name || '').toLowerCase().includes('joao'))) {
          const t = comm.createdAt?.seconds || 0;
          if (t > joaoTimestamp) joaoTimestamp = t;
        }
      });
    }
  }

  // 1. Iniciar com todas as comissões registradas ativas do profissional (ignorando canceladas)
  const proCommissionsAll = (allCommissions || [])
    .filter(isMatchingBarber)
    .filter(c => {
      if (c.status === 'cancelado' || c.status === 'estornado') return false;
      if (c.comanda_id && cancelledComandaIds.has(c.comanda_id)) return false;
      if (isLuizMiguel && joaoTimestamp > 0) {
        const cTime = c.createdAt?.seconds || 0;
        const clientName = (c.cliente_name || '').toLowerCase();
        if (cTime > joaoTimestamp && !clientName.includes('joão') && !clientName.includes('joao')) {
          return false;
        }
      }
      return true;
    })
    .map(c => ({ ...c }));

  // Rastrear comandas e agendamentos já computados para evitar duplicações
  const accountedComandaItems = new Set<string>();
  const accountedAppointments = new Set<string>();

  for (const c of proCommissionsAll) {
    if (c.comanda_id) {
      accountedComandaItems.add(`${c.comanda_id}_${(c.servico_name || '').toLowerCase().trim()}`);
      accountedComandaItems.add(`${c.comanda_id}`);
    }
    if (c.agendamento_id) {
      accountedAppointments.add(c.agendamento_id);
    }
  }

  // 1.1. Incorporar serviços de comandas concluídas/fechadas/fiado que possam não estar nas comissões
  if (Array.isArray(allComandas) && allComandas.length > 0) {
    for (const comanda of allComandas) {
      const isClosed = comanda.status === 'fechada' || 
                       comanda.status === 'concluída' || 
                       comanda.status === 'concluido' || 
                       comanda.status === 'nao_paga' || 
                       comanda.status === 'paga' || 
                       Boolean(comanda.closedAt);
      if (!isClosed) continue;

      if (isLuizMiguel && joaoTimestamp > 0) {
        const comTime = comanda.createdAt?.seconds || comanda.closedAt?.seconds || 0;
        const clientName = (comanda.cliente_name || '').toLowerCase();
        if (comTime > joaoTimestamp && !clientName.includes('joão') && !clientName.includes('joao')) {
          continue;
        }
      }

      // Validate payments: ignore comandas with 0 payments unless fiado (nao_paga)
      const payments = comanda.payments || [];
      const totalPaid = payments.reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
      const isFiado = comanda.status === 'nao_paga';
      const hasValidPayment = totalPaid > 0 || isFiado;
      if (!hasValidPayment) continue;

      const comDate = extractDate(comanda) || (currentMonthOrStartDate ? currentMonthOrStartDate.substring(0, 10) : '');

      if (Array.isArray(comanda.items)) {
        for (const item of comanda.items) {
          const itemProId = item.profissional_id || comanda.profissional_id;
          const itemProName = item.profissional_name || comanda.profissional_name;
          const itemMatches = isMatchingBarber({ profissional_id: itemProId, profissional_name: itemProName });
          if (!itemMatches) continue;

          const specificKey = `${comanda.id}_${(item.name || '').toLowerCase().trim()}`;
          const realItemValue = Number(item.totalPrice) || (Number(item.unitPrice) * (Number(item.quantity) || 1)) || Number(item.price) || 0;

          // Verificar se já existe comissão registrada para este item
          const existingComm = proCommissionsAll.find(c => 
            c.comanda_id === comanda.id && 
            ((c.servico_name || '').toLowerCase().trim() === (item.name || '').toLowerCase().trim() || c.servico_id === item.id || c.servico_id === item.referencia_id)
          );

          if (existingComm) {
            // Se a comissão já existe mas estava com base_value zerado ou ausente, reparar com o valor real do serviço
            if ((existingComm.base_value === undefined || existingComm.base_value === null || Number(existingComm.base_value) === 0) && realItemValue > 0) {
              existingComm.base_value = realItemValue;
            }
          } else if (!accountedComandaItems.has(specificKey) && realItemValue > 0) {
            // Serviço realizado sem comissão direta (ex: plano/assinatura, cortesia ou pendência de gravação)
            const isAssinatura = item.deductType === 'assinatura' || item.type === 'assinatura' || item.isCortesia;
            const commPct = isAssinatura ? 0 : (barber.percentual_comissao ?? barber.commission_percentage ?? 50);
            const commVal = isAssinatura ? 0 : (realItemValue * commPct) / 100;

            proCommissionsAll.push({
              id: `cmd-${comanda.id}-${item.id || item.name || Math.random()}`,
              comanda_id: comanda.id,
              servico_name: item.name || 'Serviço',
              date: comDate,
              base_value: realItemValue,
              commission_value: commVal,
              commission_percentage: commPct,
              commission_type: isAssinatura ? 'assinatura' : (item.type === 'produto' || item.type === 'product' ? 'produto' : 'servico'),
              status: 'pendente',
              profissional_id: barberUid,
              profissional_name: barber.nome
            });
            accountedComandaItems.add(specificKey);
          }
        }
      }
    }
  }

  // 1.2. Incorporar agendamentos concluídos sem comanda ou não rastreados
  if (Array.isArray(allAppointments) && allAppointments.length > 0) {
    for (const apt of allAppointments) {
      const isConcluded = apt.status === 'concluído' || apt.status === 'concluido' || apt.status === 'realizado';
      if (!isConcluded) continue;
      if (!isMatchingBarber(apt)) continue;
      if (apt.id && accountedAppointments.has(apt.id)) continue;
      if (apt.comanda_id && (accountedComandaItems.has(apt.comanda_id) || (allComandas && allComandas.some(c => c.id === apt.comanda_id)))) continue;

      const aptPrice = Number(apt.price) || Number(apt.valor) || 0;
      if (aptPrice > 0) {
        const aptDate = extractDate(apt) || (currentMonthOrStartDate ? currentMonthOrStartDate.substring(0, 10) : '');
        const commPct = barber.percentual_comissao ?? barber.commission_percentage ?? 50;
        proCommissionsAll.push({
          id: `apt-${apt.id}`,
          agendamento_id: apt.id,
          servico_name: apt.servico_name || 'Atendimento',
          date: aptDate,
          base_value: aptPrice,
          commission_value: (aptPrice * commPct) / 100,
          commission_percentage: commPct,
          commission_type: 'servico',
          status: 'pendente',
          profissional_id: barberUid,
          profissional_name: barber.nome
        });
        if (apt.id) accountedAppointments.add(apt.id);
      }
    }
  }

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

  const totalAtendimentosMes = proCommissionsPeriod.length;
  
  const faturamentoBrutoMes = proCommissionsPeriod
    .filter(c => c.commission_type !== 'bonus')
    .reduce((acc, c) => acc + getCommissionBaseValue(c), 0);

  const comissaoGeradaMes = proCommissionsPeriod
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  const comissaoRepassadaMes = proCommissionsPeriod
    .filter(c => c.status === 'pago')
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // 3. Totais Históricos Acumulados (Desde o Dia 1)
  const totalAtendimentosTotal = proCommissionsAll.length;

  const faturamentoBrutoTotal = proCommissionsAll
    .filter(c => c.commission_type !== 'bonus')
    .reduce((acc, c) => acc + getCommissionBaseValue(c), 0);

  const comissaoGeradaTotal = proCommissionsAll
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // 4. Comissões Pendentes (filtradas pelo período selecionado se fornecido)
  const comissaoPendenteBruta = proCommissionsPeriod
    .filter(c => c.status === 'pendente' || !c.status)
    .reduce((acc, c) => acc + (Number(c.commission_value) || 0), 0);

  // 5. Vales e Adiantamentos Pendentes (filtrados pelo período selecionado se fornecido)
  const proAdvancesAll = allAdvances.filter(isMatchingBarber);
  const proAdvancesPeriod = proAdvancesAll.filter(a => {
    const advDate = extractDate(a);
    return isWithinPeriod(advDate);
  });

  const valesPendentes = proAdvancesPeriod
    .filter(a => a.status === 'pendente' || (a.status !== 'pago' && a.status !== 'deduzido'))
    .reduce((acc, a) => acc + (Number(a.amount) || 0), 0);

  // 6. Saldo Líquido Real Devedor
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
    faturamentoBrutoTotal,
    comissaoGeradaTotal,
    totalAtendimentosTotal,
    comissaoPendenteBruta,
    valesPendentes,
    saldoPendenteLiquido
  };
}
