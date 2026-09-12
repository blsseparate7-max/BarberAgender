import { DailyFlowItem } from '../../types';

export function extractFlowItemDate(item: any): string {
  if (item.data && typeof item.data === 'string' && item.data.includes('-')) {
    return item.data;
  }
  if (item.date && typeof item.date === 'string' && item.date.includes('-')) {
    return item.date;
  }
  
  if (item.createdAt) {
    try {
      if (typeof item.createdAt.toDate === 'function') {
        return item.createdAt.toDate().toISOString().split('T')[0];
      }
      if (item.createdAt.seconds) {
        return new Date(item.createdAt.seconds * 1000).toISOString().split('T')[0];
      }
      if (typeof item.createdAt === 'string' && item.createdAt.includes('-')) {
        return item.createdAt.split('T')[0];
      }
    } catch {
      // fallback
    }
  }

  if (item.created_at) {
    try {
      if (typeof item.created_at.toDate === 'function') {
        return item.created_at.toDate().toISOString().split('T')[0];
      }
      if (item.created_at.seconds) {
        return new Date(item.created_at.seconds * 1000).toISOString().split('T')[0];
      }
      if (typeof item.created_at === 'string' && item.created_at.includes('-')) {
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
