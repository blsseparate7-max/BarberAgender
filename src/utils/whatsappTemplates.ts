/**
 * WhatsApp Template Builder & Helpers for Appointment & Comanda Reminders
 */

export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE = 
  "Olá, {cliente}! Confirmando seu agendamento hoje às {horario} na {barbearia}.";

export interface WhatsAppVariableDoc {
  key: string;
  label: string;
  example: string;
  description: string;
}

export const WHATSAPP_VARIABLES: WhatsAppVariableDoc[] = [
  { key: '{cliente}', label: 'Nome do Cliente', example: 'Carlos Silva', description: 'Nome do cliente que fez o agendamento' },
  { key: '{horario}', label: 'Horário do Corte', example: '15:30', description: 'Hora agendada (ex: 14:00)' },
  { key: '{barbeiro}', label: 'Barbeiro / Profissional', example: 'Lucas', description: 'Nome do profissional responsável' },
  { key: '{servico}', label: 'Serviço', example: 'Cabelo + Barba', description: 'Nome do serviço agendado' },
  { key: '{barbearia}', label: 'Nome da Barbearia', example: 'Rull Barber', description: 'Nome da sua barbearia' },
  { key: '{data}', label: 'Data', example: '17/09/2026', description: 'Data do agendamento' },
];

export interface FormatReminderParams {
  template?: string;
  clientName?: string;
  time?: string;
  barberName?: string;
  serviceName?: string;
  barbershopName?: string;
  date?: string;
}

/**
 * Formats a reminder message replacing dynamic tags with real appointment data
 */
export function buildAppointmentReminderMessage({
  template,
  clientName,
  time,
  barberName,
  serviceName,
  barbershopName,
  date,
}: FormatReminderParams): string {
  const base = (template && template.trim().length > 0) 
    ? template 
    : DEFAULT_WHATSAPP_REMINDER_TEMPLATE;

  const safeClient = clientName && clientName.trim() ? clientName.trim() : 'amigo';
  const safeTime = time && time.trim() ? time.trim() : '';
  const safeBarber = barberName && barberName.trim() ? barberName.trim() : 'nosso barbeiro';
  const safeService = serviceName && serviceName.trim() ? serviceName.trim() : 'atendimento';
  const safeBarbershop = barbershopName && barbershopName.trim() ? barbershopName.trim() : 'nossa barbearia';
  const safeDate = date && date.trim() ? date.trim() : 'hoje';

  let result = base
    .replace(/\{cliente\}/gi, safeClient)
    .replace(/\{nome\}/gi, safeClient)
    .replace(/\{horario\}/gi, safeTime)
    .replace(/\{hora\}/gi, safeTime)
    .replace(/\{barbeiro\}/gi, safeBarber)
    .replace(/\{profissional\}/gi, safeBarber)
    .replace(/\{servico\}/gi, safeService)
    .replace(/\{serviço\}/gi, safeService)
    .replace(/\{barbearia\}/gi, safeBarbershop)
    .replace(/\{data\}/gi, safeDate);

  // Clean up excessive whitespace
  return result.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Generates the WhatsApp wa.me direct link
 */
export function getWhatsAppDirectUrl(phone: string | undefined | null, message: string): string {
  if (!phone) return '#';
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return '#';
  
  const fullPhone = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
}
