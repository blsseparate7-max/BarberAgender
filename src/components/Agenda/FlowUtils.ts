import { DailyFlowItem } from '../../types';

export function formatDateToLocalYMD(d: Date): string {
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function extractFlowItemDate(item: any): string {
  if (item.data && typeof item.data === 'string' && item.data.includes('-')) {
    return item.data.split('T')[0];
  }
  if (item.date && typeof item.date === 'string' && item.date.includes('-')) {
    return item.date.split('T')[0];
  }
  
  if (item.createdAt) {
    try {
      if (typeof item.createdAt.toDate === 'function') {
        return formatDateToLocalYMD(item.createdAt.toDate());
      }
      if (item.createdAt.seconds) {
        return formatDateToLocalYMD(new Date(item.createdAt.seconds * 1000));
      }
      if (typeof item.createdAt === 'string' && item.createdAt.includes('-')) {
        const parsed = new Date(item.createdAt);
        if (!isNaN(parsed.getTime())) return formatDateToLocalYMD(parsed);
        return item.createdAt.split('T')[0];
      }
    } catch {
      // fallback
    }
  }

  if (item.created_at) {
    try {
      if (typeof item.created_at.toDate === 'function') {
        return formatDateToLocalYMD(item.created_at.toDate());
      }
      if (item.created_at.seconds) {
        return formatDateToLocalYMD(new Date(item.created_at.seconds * 1000));
      }
      if (typeof item.created_at === 'string' && item.created_at.includes('-')) {
        const parsed = new Date(item.created_at);
        if (!isNaN(parsed.getTime())) return formatDateToLocalYMD(parsed);
        return item.created_at.split('T')[0];
      }
    } catch {
      // fallback
    }
  }

  return '';
}

export function formatFlowDisplayDate(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr || 'Data Indefinida';
  const [y, m, d] = dateStr.split('-');
  const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
  return dateObj.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function extractComandaDate(comanda: any): string {
  if (comanda.date && typeof comanda.date === 'string' && comanda.date.includes('-')) {
    return comanda.date.split('T')[0];
  }
  if (comanda.data && typeof comanda.data === 'string' && comanda.data.includes('-')) {
    return comanda.data.split('T')[0];
  }
  if (comanda.createdAt) {
    try {
      if (typeof comanda.createdAt.toDate === 'function') {
        return formatDateToLocalYMD(comanda.createdAt.toDate());
      }
      if (comanda.createdAt.seconds) {
        return formatDateToLocalYMD(new Date(comanda.createdAt.seconds * 1000));
      }
      if (typeof comanda.createdAt === 'string' && comanda.createdAt.includes('-')) {
        const parsed = new Date(comanda.createdAt);
        if (!isNaN(parsed.getTime())) return formatDateToLocalYMD(parsed);
        return comanda.createdAt.split('T')[0];
      }
    } catch {
      // fallback
    }
  }
  if (comanda.openedAt) {
    try {
      if (typeof comanda.openedAt.toDate === 'function') {
        return formatDateToLocalYMD(comanda.openedAt.toDate());
      }
      if (comanda.openedAt.seconds) {
        return formatDateToLocalYMD(new Date(comanda.openedAt.seconds * 1000));
      }
      if (typeof comanda.openedAt === 'string' && comanda.openedAt.includes('-')) {
        const parsed = new Date(comanda.openedAt);
        if (!isNaN(parsed.getTime())) return formatDateToLocalYMD(parsed);
        return comanda.openedAt.split('T')[0];
      }
    } catch {
      // fallback
    }
  }
  return '';
}

export function isBarberMatch(
  barber: { uid?: string; id?: string; nome?: string; name?: string },
  targetId?: string,
  targetName?: string
): boolean {
  const bId = barber.uid || barber.id || '';
  const bName = (barber.nome || barber.name || '').trim().toLowerCase();

  if (targetId && bId && targetId === bId) {
    return true;
  }

  if (targetName && bName) {
    const tName = targetName.trim().toLowerCase();
    if (tName === bName) return true;
    if (bName.length > 2 && tName.includes(bName)) return true;
    if (tName.length > 2 && bName.includes(tName)) return true;
  }

  return false;
}
