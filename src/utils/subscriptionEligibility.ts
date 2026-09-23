import { Subscription, SubscriptionPlan, SubscriptionPlanService } from '../types';
import { isDateAllowedForPlan, isDateWithinSubscriptionCycle, formatAllowedDays } from './subscriptionDays';

export interface ServiceEligibilityResult {
  isEligible: boolean;
  reason?: string;
  planName?: string;
  matchedPlanService?: SubscriptionPlanService;
  isUnlimited?: boolean;
  limit?: number;
  used?: number;
  isDayBlocked?: boolean;
  isCycleBlocked?: boolean;
  cycleEndDateStr?: string;
  allowedDaysText?: string;
}

export interface ServiceLike {
  id?: string;
  referencia_id?: string;
  name?: string;
  nome?: string;
  preco?: number;
  price?: number;
  type?: string;
}

/**
 * Normalizes string removing accents and standardizing whitespace
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Validates if a service is covered by a client's active subscription.
 * Strictly prevents unallowed services (e.g. beard on haircut-only plan, or combo "corte e barba" on cut-only plan).
 */
export function checkServiceSubscriptionEligibility(
  service: ServiceLike | null | undefined,
  subscription: (Partial<Subscription> & { id?: string; haircutsPerMonth?: number; beardsPerMonth?: number; customRestrictionNote?: string; allowedDaysOfWeek?: number[]; services?: SubscriptionPlanService[] }) | null | undefined,
  plan?: (Partial<SubscriptionPlan> & { id?: string; customRestrictionNote?: string; allowedDaysOfWeek?: number[]; services?: SubscriptionPlanService[] }) | null,
  targetDate?: string | Date | null
): ServiceEligibilityResult {
  if (!service || !subscription) {
    return { isEligible: false, reason: 'Assinatura ou serviço não fornecido' };
  }

  // Check subscription status
  if (subscription.status && subscription.status !== 'active') {
    return {
      isEligible: false,
      reason: subscription.status === 'past_due' || subscription.status === 'expired'
        ? 'Assinatura vencida'
        : 'Assinatura inativa ou aguardando pagamento'
    };
  }

  const planName = subscription.planName || plan?.name || 'Clube de Assinatura';
  const allowedDays = subscription.allowedDaysOfWeek || plan?.allowedDaysOfWeek;
  const restrictionNote = subscription.customRestrictionNote || plan?.customRestrictionNote;

  // Check 30-day Cycle Validity and Day of Week if targetDate is given
  if (targetDate) {
    const cycleCheck = isDateWithinSubscriptionCycle(subscription, targetDate);
    if (!cycleCheck.isWithinCycle) {
      return {
        isEligible: false,
        reason: 'Data fora da vigência da assinatura (Ciclo de 30 dias)',
        planName,
        isCycleBlocked: true,
        cycleEndDateStr: cycleCheck.endDateStr
      };
    }

    if (!isDateAllowedForPlan(allowedDays, targetDate)) {
      return {
        isEligible: false,
        reason: 'Dia da semana não permitido pelo plano',
        planName,
        isDayBlocked: true,
        allowedDaysText: formatAllowedDays(allowedDays, restrictionNote)
      };
    }
  }

  const serviceId = service.referencia_id || service.id || '';
  const rawServiceName = service.name || service.nome || '';
  const serviceNameNorm = normalizeText(rawServiceName);

  // 1. Strict Check via plan.services or subscription.services
  const planServices: SubscriptionPlanService[] = 
    (plan?.services && plan.services.length > 0) ? plan.services :
    (subscription.services && subscription.services.length > 0) ? subscription.services : [];

  if (planServices.length > 0) {
    // Look for exact ID match or normalized service name match
    const matchedService = planServices.find(ps => 
      (ps.serviceId && serviceId && ps.serviceId === serviceId) ||
      (ps.name && normalizeText(ps.name) === serviceNameNorm)
    );

    if (!matchedService) {
      return {
        isEligible: false,
        reason: `O serviço "${rawServiceName}" não faz parte do plano "${planName}"`,
        planName
      };
    }

    // Check usage limit for the specific service
    const isUnlimited = !!(matchedService.isUnlimited || matchedService.limit >= 99 || matchedService.limit === 0);
    const serviceUsages = subscription.serviceUsages || {};
    const used = (matchedService.serviceId && serviceUsages[matchedService.serviceId] !== undefined)
      ? serviceUsages[matchedService.serviceId]
      : (serviceId && serviceUsages[serviceId] !== undefined ? serviceUsages[serviceId] : 0);

    if (!isUnlimited && used >= matchedService.limit) {
      return {
        isEligible: false,
        reason: `Limite mensal de "${matchedService.name}" atingido (${used}/${matchedService.limit})`,
        planName,
        matchedPlanService: matchedService,
        limit: matchedService.limit,
        used,
        isUnlimited: false
      };
    }

    return {
      isEligible: true,
      planName,
      matchedPlanService: matchedService,
      isUnlimited,
      limit: matchedService.limit,
      used
    };
  }

  // 2. Legacy fallback if neither plan nor subscription has the explicit services[] list
  const isCut = serviceNameNorm.includes('corte') || 
                serviceNameNorm.includes('corta') || 
                serviceNameNorm.includes('cabelo') || 
                serviceNameNorm.includes('hair') || 
                serviceNameNorm.includes('pezinho') || 
                serviceNameNorm.includes('acabamento') ||
                serviceNameNorm.includes('degrade') ||
                serviceNameNorm.includes('social') ||
                serviceNameNorm.includes('navalhado') ||
                serviceNameNorm.includes('tesoura');

  const isBeard = serviceNameNorm.includes('barba') || 
                  serviceNameNorm.includes('beard') || 
                  serviceNameNorm.includes('barboterapia') || 
                  serviceNameNorm.includes('bigode') || 
                  serviceNameNorm.includes('cavanhaque');

  // If combo (e.g. "Corte e Barba", "Corta e Barba", "Cabelo + Barba", "Combo")
  if (isCut && isBeard) {
    const maxCuts = plan?.haircutsPerMonth ?? subscription.haircutsPerMonth ?? 0;
    const maxBeards = plan?.beardsPerMonth ?? subscription.beardsPerMonth ?? 0;

    // Both haircut and beard must be covered by the plan
    if (maxCuts <= 0 || maxBeards <= 0) {
      return {
        isEligible: false,
        reason: `O serviço combo "${rawServiceName}" requer cobertura de corte e barba no plano "${planName}"`,
        planName
      };
    }

    const cutsUsed = subscription.haircutsUsed || 0;
    const beardsUsed = subscription.beardsUsed || 0;
    const cutsUnlimited = maxCuts >= 99 || maxCuts === 0;
    const beardsUnlimited = maxBeards >= 99 || maxBeards === 0;

    if (!cutsUnlimited && cutsUsed >= maxCuts) {
      return {
        isEligible: false,
        reason: `Limite de cortes atingido para o serviço combo (${cutsUsed}/${maxCuts})`,
        planName
      };
    }
    if (!beardsUnlimited && beardsUsed >= maxBeards) {
      return {
        isEligible: false,
        reason: `Limite de barbas atingido para o serviço combo (${beardsUsed}/${maxBeards})`,
        planName
      };
    }

    return {
      isEligible: true,
      planName,
      isUnlimited: cutsUnlimited && beardsUnlimited
    };
  }

  // Sole haircut service
  if (isCut) {
    const maxCuts = plan?.haircutsPerMonth ?? subscription.haircutsPerMonth ?? 0;
    if (maxCuts <= 0) {
      return {
        isEligible: false,
        reason: `O plano "${planName}" não contempla serviços de corte`,
        planName
      };
    }

    const cutsUsed = subscription.haircutsUsed || 0;
    const isUnlimited = maxCuts >= 99 || maxCuts === 0;

    if (!isUnlimited && cutsUsed >= maxCuts) {
      return {
        isEligible: false,
        reason: `Limite de cortes atingido (${cutsUsed}/${maxCuts})`,
        planName,
        limit: maxCuts,
        used: cutsUsed,
        isUnlimited: false
      };
    }

    return {
      isEligible: true,
      planName,
      limit: maxCuts,
      used: cutsUsed,
      isUnlimited
    };
  }

  // Sole beard service
  if (isBeard) {
    const maxBeards = plan?.beardsPerMonth ?? subscription.beardsPerMonth ?? 0;
    if (maxBeards <= 0) {
      return {
        isEligible: false,
        reason: `O plano "${planName}" não contempla serviços de barba`,
        planName
      };
    }

    const beardsUsed = subscription.beardsUsed || 0;
    const isUnlimited = maxBeards >= 99 || maxBeards === 0;

    if (!isUnlimited && beardsUsed >= maxBeards) {
      return {
        isEligible: false,
        reason: `Limite de barbas atingido (${beardsUsed}/${maxBeards})`,
        planName,
        limit: maxBeards,
        used: beardsUsed,
        isUnlimited: false
      };
    }

    return {
      isEligible: true,
      planName,
      limit: maxBeards,
      used: beardsUsed,
      isUnlimited
    };
  }

  // Any other service not in plan
  return {
    isEligible: false,
    reason: `O serviço "${rawServiceName}" não faz parte do plano "${planName}"`,
    planName
  };
}
