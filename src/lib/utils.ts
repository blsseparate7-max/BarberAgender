import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseDate(date: any): Date {
  if (!date) return new Date();
  if (typeof date.toDate === 'function') return date.toDate();
  if (date instanceof Date) return date;
  const d = new Date(date);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function formatErrorMessage(err: any): string {
  if (!err) return '';
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Quota exceeded') || msg.includes('resource-exhausted') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'Limite diário do banco de dados atingido (Quota Exceeded)! O limite gratuito diário do Firebase (Spark Plan) será renovado automaticamente nas próximas horas. Para uso em produção ilimitado, migre seu projeto Firebase para o plano "Blaze" (Pay-as-you-go) no console do Firebase.';
  }
  return msg;
}

