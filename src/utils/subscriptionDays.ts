export const ALL_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

export interface DayOfWeekOption {
  day: number; // 0 = Domingo, 1 = Segunda ... 6 = Sábado
  label: string;
  shortLabel: string;
}

export const DAYS_OF_WEEK_OPTIONS: DayOfWeekOption[] = [
  { day: 1, label: 'Segunda-feira', shortLabel: 'Seg' },
  { day: 2, label: 'Terça-feira', shortLabel: 'Ter' },
  { day: 3, label: 'Quarta-feira', shortLabel: 'Qua' },
  { day: 4, label: 'Quinta-feira', shortLabel: 'Qui' },
  { day: 5, label: 'Sexta-feira', shortLabel: 'Sex' },
  { day: 6, label: 'Sábado', shortLabel: 'Sáb' },
  { day: 0, label: 'Domingo', shortLabel: 'Dom' },
];

export const DAY_NAMES: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
};

export const DAY_SHORT_NAMES: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

/**
 * Formats a list of day numbers into a human-readable Brazilian Portuguese string.
 * e.g. [1, 2, 3, 4] -> "Segunda a Quinta"
 *      [1, 2, 3, 4, 5] -> "Segunda a Sexta"
 *      [0, 1, 2, 3, 4, 5, 6] -> "Todos os dias (Seg a Dom)"
 */
export function formatAllowedDays(allowedDays?: number[], customNote?: string): string {
  if (customNote && customNote.trim()) {
    return customNote.trim();
  }

  if (!allowedDays || allowedDays.length === 0 || allowedDays.length === 7) {
    return 'Todos os dias';
  }

  const sorted = [...allowedDays].sort((a, b) => a - b);
  const jsonStr = JSON.stringify(sorted);

  // Common patterns
  if (jsonStr === JSON.stringify([1, 2, 3, 4])) {
    return 'Segunda a Quinta';
  }
  if (jsonStr === JSON.stringify([1, 2, 3, 4, 5])) {
    return 'Segunda a Sexta';
  }
  if (jsonStr === JSON.stringify([1, 2, 3])) {
    return 'Segunda a Quarta';
  }
  if (jsonStr === JSON.stringify([0, 5, 6]) || jsonStr === JSON.stringify([5, 6, 0].sort((a, b) => a - b))) {
    return 'Sex, Sáb e Domingo';
  }
  if (jsonStr === JSON.stringify([0, 6])) {
    return 'Fim de Semana (Sáb e Dom)';
  }

  // Display ordered by week starting on Monday
  const orderedWeek = [1, 2, 3, 4, 5, 6, 0];
  const presentDays = orderedWeek.filter(d => allowedDays.includes(d));
  return presentDays.map(d => DAY_SHORT_NAMES[d]).join(', ');
}

/**
 * Checks if a specific date is allowed by the plan's day restriction.
 */
export function isDateAllowedForPlan(allowedDays?: number[], date?: string | Date): boolean {
  if (!allowedDays || allowedDays.length === 0 || allowedDays.length === 7) {
    return true;
  }

  if (!date) return true;

  let dayOfWeek: number;
  if (typeof date === 'string') {
    // Handle 'YYYY-MM-DD' safely with midday time to prevent UTC date shift
    const d = new Date(date + 'T12:00:00');
    dayOfWeek = d.getDay();
  } else {
    dayOfWeek = date.getDay();
  }

  return allowedDays.includes(dayOfWeek);
}

/**
 * Gets the Portuguese day name of a date string or Date object.
 */
export function getDayNameOfDate(date: string | Date): string {
  let dayOfWeek: number;
  if (typeof date === 'string') {
    const d = new Date(date + 'T12:00:00');
    dayOfWeek = d.getDay();
  } else {
    dayOfWeek = date.getDay();
  }
  return DAY_NAMES[dayOfWeek] || '';
}

/**
 * Checks if a specific appointment date falls within the subscription's active cycle (startDate to endDate).
 * Prevents scheduling beyond the 30-day paid cycle (e.g. attempting to book after renewal due date).
 */
export function isDateWithinSubscriptionCycle(
  subscription?: { startDate?: string; endDate?: string; lastRenewalDate?: string } | null,
  targetDate?: string | Date | null
): { isWithinCycle: boolean; reason?: 'before_start' | 'after_end'; startDateStr?: string; endDateStr?: string } {
  if (!subscription || !targetDate) {
    return { isWithinCycle: true };
  }

  // Format target date as YYYY-MM-DD
  let targetDateStr: string;
  if (typeof targetDate === 'string') {
    targetDateStr = targetDate.slice(0, 10);
  } else {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    targetDateStr = `${year}-${month}-${day}`;
  }

  const startStr = (subscription.startDate || subscription.lastRenewalDate || '').slice(0, 10);
  const endStr = (subscription.endDate || '').slice(0, 10);

  // If subscription has a defined start date and target is strictly before it
  if (startStr && targetDateStr < startStr) {
    return {
      isWithinCycle: false,
      reason: 'before_start',
      startDateStr: startStr,
      endDateStr: endStr
    };
  }

  // If subscription has a defined end date (e.g. current 30-day cycle end) and target is strictly after it
  if (endStr && targetDateStr > endStr) {
    return {
      isWithinCycle: false,
      reason: 'after_end',
      startDateStr: startStr,
      endDateStr: endStr
    };
  }

  return {
    isWithinCycle: true,
    startDateStr: startStr,
    endDateStr: endStr
  };
}
