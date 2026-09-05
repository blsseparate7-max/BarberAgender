
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  Timestamp,
  getDoc,
  increment,
  runTransaction,
  writeBatch,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment, AppointmentStatus, UserProfile, PaymentMethod, ProfessionalSchedule, AgendaBlock, RecurringAppointment } from '../types';
import { addMinutes, format, parse, isBefore, isAfter, isEqual, getDay, addDays, startOfDay, endOfDay } from 'date-fns';
import { financialService } from './financialService';
import { commissionService } from './commissionService';
import { userService } from './userService';
import { professionalScheduleService } from './professionalScheduleService';
import { agendaBlockService } from './agendaBlockService';
import { cashService } from './cashService';
import { serviceService } from './serviceService';
import { getActiveTenantId, tenantService } from './tenantService';
import { comandaService } from './comandaService';
import { notificationService } from './notificationService';

const COLLECTION = 'appointments';
const RECURRING_COLLECTION = 'recurring_appointments';

function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedFields) as any;
  }
  const cleaned: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = removeUndefinedFields(value);
    }
  }
  return cleaned;
}

async function resolveProfessionalSchedule(profissional_id: string): Promise<any> {
  try {
    const barberProfile = await userService.getUserProfile(profissional_id);
    if (barberProfile && barberProfile.horario_de_trabalho && barberProfile.horario_de_trabalho.length > 0) {
      return {
        profissional_id,
        workingHours: barberProfile.horario_de_trabalho,
        exceptions: [],
        vacations: []
      };
    }
  } catch (err) {
    console.warn("Could not load user profile working hours:", err);
  }

  const schedule = await professionalScheduleService.getSchedule(profissional_id);
  if (schedule && schedule.workingHours && schedule.workingHours.length > 0) {
    return schedule;
  }

  return {
    profissional_id,
    workingHours: [
      { dayOfWeek: 1, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 2, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 3, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 4, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 5, isOpen: true, startTime: '09:00', endTime: '19:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 6, isOpen: true, startTime: '09:00', endTime: '17:00', lunchStart: '12:00', lunchEnd: '13:00' },
      { dayOfWeek: 0, isOpen: false, startTime: '09:00', endTime: '19:00' },
    ],
    exceptions: [],
    vacations: []
  };
}

export const appointmentService = {
  async createAppointment(data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) {
    const tenantId = (data as any).tenantId || getActiveTenantId();

    // 1. Validate Date Tampering (Prevent booking in past only for client portal booking)
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (data.origin === 'cliente' && data.date < todayStr) {
      throw new Error('Não é permitido realizar agendamentos para datas no passado.');
    }

    // 2. Check for availability (bypass for encaixes to allow squeeze-ins/overbooking)
    if (data.origin !== 'encaixe') {
      const result = await this.checkAvailability(data.profissional_id, data.date, data.startTime, data.endTime);
      if (!result.available) {
        throw new Error(result.reason || 'O profissional não está disponível neste horário.');
      }

      // Re-verify conflict right before write to minimize race condition window
      const hasConflict = await this.checkConflict(data.profissional_id, data.date, data.startTime, data.endTime);
      if (hasConflict) {
        throw new Error('Este horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.');
      }
    }

    const payload = removeUndefinedFields({
      ...data,
      tenantId,
      origin: data.origin || 'agenda',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 3. Add to Firestore
    const docRef = await addDoc(collection(db, COLLECTION), payload);
    const id = docRef.id;

    // Trigger In-App Notification
    try {
      const clientName = data.cliente_name || 'Cliente';
      const serviceName = data.servico_name || 'Serviço';
      const profName = data.profissional_name || 'Profissional';
      const message = `${clientName} agendou ${serviceName} com ${profName} no dia ${data.date} às ${data.startTime}.`;

      // 1. Notify Admin
      await notificationService.createNotification({
        tenantId,
        recipientId: 'admin',
        title: 'Novo Agendamento! 📅',
        message,
        type: 'created',
        metadata: {
          appointmentId: id,
          clientName,
          date: data.date,
          startTime: data.startTime,
          profissional_name: profName,
          servico_name: serviceName
        }
      });

      // 2. Notify Professional
      if (data.profissional_id && data.profissional_id !== 'admin') {
        await notificationService.createNotification({
          tenantId,
          recipientId: data.profissional_id,
          title: 'Novo Agendamento na sua Agenda! 📅',
          message,
          type: 'created',
          metadata: {
            appointmentId: id,
            clientName,
            date: data.date,
            startTime: data.startTime,
            profissional_name: profName,
            servico_name: serviceName
          }
        });
      }
    } catch (notifErr) {
      console.error('Falha ao enviar notificações de criação de agendamento:', notifErr);
    }

    return id;
  },

  async updateAppointment(id: string, data: Partial<Appointment>) {
    const docRef = doc(db, COLLECTION, id);
    const currentSnap = await getDoc(docRef);
    if (!currentSnap.exists()) throw new Error('Agendamento não encontrado.');
    const current = currentSnap.data() as Appointment;

    const isRescheduled = (data.date && data.date !== current.date) || 
                          (data.startTime && data.startTime !== current.startTime) || 
                          (data.profissional_id && data.profissional_id !== current.profissional_id);
    
    // If date or time changed, check for availability
    if (data.date || data.startTime || data.endTime || data.profissional_id) {
      const origin = data.origin || current.origin;
      if (origin !== 'encaixe') {
        const profissional_id = data.profissional_id || current.profissional_id;
        const date = data.date || current.date;
        const startTime = data.startTime || current.startTime;
        const endTime = data.endTime || current.endTime;

        const result = await this.checkAvailability(profissional_id, date, startTime, endTime, id);
        if (!result.available) {
          throw new Error(result.reason || 'Conflito de horário detectado ou profissional indisponível.');
        }
      }
    }

    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });

    if (isRescheduled) {
      try {
        const clientName = current.cliente_name || 'Cliente';
        const serviceName = current.servico_name || 'Serviço';
        const profName = data.profissional_name || current.profissional_name || 'Profissional';
        const tenantId = current.tenantId || getActiveTenantId();
        
        const oldDate = current.date;
        const oldTime = current.startTime;
        const newDate = data.date || current.date;
        const newTime = data.startTime || current.startTime;

        const message = `Agendamento de ${clientName} alterado de ${oldDate} às ${oldTime} para o dia ${newDate} às ${newTime} com ${profName}.`;

        // 1. Notify Admin
        await notificationService.createNotification({
          tenantId,
          recipientId: 'admin',
          title: 'Agendamento Reagendado! 🔄',
          message,
          type: 'rescheduled',
          metadata: {
            appointmentId: id,
            clientName,
            date: newDate,
            startTime: newTime,
            profissional_name: profName,
            servico_name: serviceName
          }
        });

        // 2. Notify Original Professional
        if (current.profissional_id && current.profissional_id !== 'admin') {
          await notificationService.createNotification({
            tenantId,
            recipientId: current.profissional_id,
            title: 'Seu horário foi alterado! 🔄',
            message,
            type: 'rescheduled',
            metadata: {
              appointmentId: id,
              clientName,
              date: newDate,
              startTime: newTime,
              profissional_name: profName,
              servico_name: serviceName
            }
          });
        }

        // 3. Notify New Professional (if changed and different)
        if (data.profissional_id && data.profissional_id !== current.profissional_id && data.profissional_id !== 'admin') {
          await notificationService.createNotification({
            tenantId,
            recipientId: data.profissional_id,
            title: 'Novo horário remanejado para você! 🔄',
            message,
            type: 'rescheduled',
            metadata: {
              appointmentId: id,
              clientName,
              date: newDate,
              startTime: newTime,
              profissional_name: profName,
              servico_name: serviceName
            }
          });
        }
      } catch (notifErr) {
        console.error('Falha ao enviar notificações de reagendamento:', notifErr);
      }
    }
  },

  async checkAvailability(profissional_id: string, date: string, startTime: string, endTime: string, excludeId?: string): Promise<{ available: boolean; reason?: string }> {
    // 1. Check Professional Schedule
    const schedule = await resolveProfessionalSchedule(profissional_id);
    if (!schedule) return { available: true }; // If no schedule, assume 24/7 (not ideal, but fallback)

    const dateObj = parse(date, 'yyyy-MM-dd', new Date());
    const dayOfWeek = getDay(dateObj);
    
    // Check exceptions
    const exception = schedule.exceptions.find(e => e.date === date);
    if (exception) {
      if (!exception.isOpen) {
        return { available: false, reason: 'O profissional não trabalha nesta data (exceção cadastrada).' };
      }
      if (exception.startTime && isBefore(parse(startTime, 'HH:mm', new Date()), parse(exception.startTime, 'HH:mm', new Date()))) {
        return { available: false, reason: `O horário selecionado está antes do início do expediente de exceção (${exception.startTime}).` };
      }
      if (exception.endTime && isAfter(parse(endTime, 'HH:mm', new Date()), parse(exception.endTime, 'HH:mm', new Date()))) {
        return { available: false, reason: `O horário selecionado ultrapassa o fim do expediente de exceção (${exception.endTime}).` };
      }
    } else {
      const workingDay = schedule.workingHours.find(wh => wh.dayOfWeek === dayOfWeek);
      if (!workingDay || !workingDay.isOpen) {
        return { available: false, reason: 'O profissional não trabalha neste dia da semana.' };
      }
      
      const start = parse(startTime, 'HH:mm', new Date());
      const end = parse(endTime, 'HH:mm', new Date());
      const workStart = parse(workingDay.startTime, 'HH:mm', new Date());
      const workEnd = parse(workingDay.endTime, 'HH:mm', new Date());

      if (isBefore(start, workStart)) {
        return { available: false, reason: `O horário está antes do início do expediente do profissional (${workingDay.startTime}).` };
      }
      if (isAfter(end, workEnd)) {
        return { available: false, reason: `O horário ultrapassa o fim do expediente do profissional (${workingDay.endTime}).` };
      }

      // Check lunch break
      if (workingDay.lunchStart && workingDay.lunchEnd) {
        const lunchStart = parse(workingDay.lunchStart, 'HH:mm', new Date());
        const lunchEnd = parse(workingDay.lunchEnd, 'HH:mm', new Date());
        // Overlap with lunch
        if (isBefore(start, lunchEnd) && isAfter(end, lunchStart)) {
          return { available: false, reason: `Conflito com o intervalo de almoço do profissional (${workingDay.lunchStart} - ${workingDay.lunchEnd}).` };
        }
      }
    }

    // Check vacations
    const isOnVacation = schedule.vacations.some(v => 
      (isAfter(dateObj, parse(v.startDate, 'yyyy-MM-dd', new Date())) || isEqual(dateObj, parse(v.startDate, 'yyyy-MM-dd', new Date()))) &&
      (isBefore(dateObj, parse(v.endDate, 'yyyy-MM-dd', new Date())) || isEqual(dateObj, parse(v.endDate, 'yyyy-MM-dd', new Date())))
    );
    if (isOnVacation) {
      return { available: false, reason: 'O profissional está de folga ou férias neste período.' };
    }

    // 2. Check Agenda Blocks
    const blocks = await agendaBlockService.getBlocks({ date, profissional_id });
    const blocked = blocks.find(block => {
      const blockStart = parse(block.startTime, 'HH:mm', new Date());
      const blockEnd = parse(block.endTime, 'HH:mm', new Date());
      const newStart = parse(startTime, 'HH:mm', new Date());
      const newEnd = parse(endTime, 'HH:mm', new Date());
      return isBefore(newStart, blockEnd) && isAfter(newEnd, blockStart);
    });
    if (blocked) {
      return { available: false, reason: `Horário bloqueado na agenda do profissional: ${blocked.reason || 'Bloqueio de Agenda'}.` };
    }

    // 3. Check for conflicts with other appointments
    const hasConflict = await this.checkConflict(profissional_id, date, startTime, endTime, excludeId);
    if (hasConflict) {
      return { available: false, reason: 'O profissional já possui outro compromisso ou agendamento neste horário.' };
    }

    return { available: true };
  },

  async checkConflict(profissional_id: string, date: string, startTime: string, endTime: string, excludeId?: string) {
    const q = query(
      collection(db, COLLECTION),
      where('tenantId', '==', getActiveTenantId())
    );

    const querySnapshot = await getDocs(q);
    const appointments = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(app => {
        if (app.id === excludeId) return false;
        if (app.profissional_id !== profissional_id) return false;
        if (app.date !== date) return false;
        const status = app.status || 'agendado';
        if (!['agendado', 'confirmado', 'em_atendimento', 'concluído'].includes(status)) return false;
        return true;
      });

    const newStart = parse(startTime, 'HH:mm', new Date());
    const newEnd = parse(endTime, 'HH:mm', new Date());

    return appointments.some(app => {
      const appStart = parse(app.startTime, 'HH:mm', new Date());
      const appEnd = parse(app.endTime, 'HH:mm', new Date());

      // Overlap logic: (StartA < EndB) and (EndA > StartB)
      return isBefore(newStart, appEnd) && isAfter(newEnd, appStart);
    });
  },

  async getAppointments(filters: { date?: string; startDate?: string; endDate?: string; profissional_id?: string; cliente_id?: string; status?: AppointmentStatus }) {
    const activeTenantId = getActiveTenantId();
    const q = query(collection(db, COLLECTION), where('tenantId', '==', activeTenantId));

    const querySnapshot = await getDocs(q);
    const rawAppointments = querySnapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) } as Appointment));
    
    const appointments = rawAppointments.filter(app => {
      if (app.tenantId && app.tenantId !== activeTenantId) return false;
      if (filters.date && app.date !== filters.date) return false;
      if (filters.startDate && app.date < filters.startDate) return false;
      if (filters.endDate && app.date > filters.endDate) return false;
      if (filters.profissional_id && app.profissional_id !== filters.profissional_id) return false;
      if (filters.cliente_id) {
        const appClientId = app.cliente_id || (app as any).client_id || (app as any).cliente_uid;
        if (appClientId !== filters.cliente_id) return false;
      }
      if (filters.status && app.status !== filters.status) return false;
      return true;
    });

    return appointments.sort((a, b) => {
      const dateCompare = (a.date || '').localeCompare(b.date || '');
      if (dateCompare !== 0) return dateCompare;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });
  },

  subscribeToAppointments(filters: { date?: string; startDate?: string; endDate?: string; profissional_id?: string; cliente_id?: string; status?: AppointmentStatus }, callback: (appointments: Appointment[]) => void) {
    const activeTenantId = getActiveTenantId();
    const q = query(collection(db, COLLECTION), where('tenantId', '==', activeTenantId));

    return onSnapshot(q, (snapshot) => {
      const rawAppointments = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...(docSnap.data() as any) } as Appointment));
      const activeTenantId = getActiveTenantId();
      
      const appointments = rawAppointments.filter(app => {
        if (app.tenantId && app.tenantId !== activeTenantId) return false;
        if (filters.cliente_id) {
          const appClientId = app.cliente_id || (app as any).client_id || (app as any).cliente_uid;
          if (appClientId !== filters.cliente_id) return false;
        }
        if (filters.profissional_id && app.profissional_id !== filters.profissional_id) return false;
        if (filters.date && app.date !== filters.date) return false;
        if (filters.startDate && app.date < filters.startDate) return false;
        if (filters.endDate && app.date > filters.endDate) return false;
        if (filters.status && app.status !== filters.status) return false;
        return true;
      });

      appointments.sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });

      callback(appointments);
    }, (error) => {
      console.error("Error in subscribeToAppointments:", error);
      callback([]);
    });
  },


  async startService(id: string) {
    await this.updateStatus(id, 'em_atendimento');
  },

  async finishService(id: string, paymentMethod: PaymentMethod = 'dinheiro') {
    await this.updateStatus(id, 'concluído', paymentMethod);
  },

  async cancelAppointment(id: string) {
    await this.updateStatus(id, 'cancelado');
  },

  async deleteAppointment(id: string) {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  },

  async updateStatus(id: string, status: AppointmentStatus, paymentMethod: PaymentMethod = 'dinheiro') {
    const docRef = doc(db, COLLECTION, id);
    const appSnap = await getDoc(docRef);
    
    if (!appSnap.exists()) throw new Error('Agendamento não encontrado.');
    const appointment = appSnap.data() as Appointment;

    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });

    // Trigger Notification for Cancellation
    if (status === 'cancelado') {
      try {
        const clientName = appointment.cliente_name || 'Cliente';
        const serviceName = appointment.servico_name || 'Serviço';
        const profName = appointment.profissional_name || 'Profissional';
        const message = `${clientName} cancelou o horário de ${serviceName} com ${profName} no dia ${appointment.date} às ${appointment.startTime}.`;
        const tenantId = appointment.tenantId || getActiveTenantId();

        // 1. Notify Admin
        await notificationService.createNotification({
          tenantId,
          recipientId: 'admin',
          title: 'Agendamento Cancelado! 🚨',
          message,
          type: 'cancelled',
          metadata: {
            appointmentId: id,
            clientName,
            date: appointment.date,
            startTime: appointment.startTime,
            profissional_name: profName,
            servico_name: serviceName
          }
        });

        // 2. Notify Professional
        if (appointment.profissional_id && appointment.profissional_id !== 'admin') {
          await notificationService.createNotification({
            tenantId,
            recipientId: appointment.profissional_id,
            title: 'Seu horário foi Cancelado! 🚨',
            message,
            type: 'cancelled',
            metadata: {
              appointmentId: id,
              clientName,
              date: appointment.date,
              startTime: appointment.startTime,
              profissional_name: profName,
              servico_name: serviceName
            }
          });
        }
      } catch (notifErr) {
        console.error('Falha ao enviar notificações de cancelamento:', notifErr);
      }
    }

    // Auto-cria ou sincroniza comanda ao iniciar atendimento
    if (status === 'em_atendimento') {
      try {
        const comQuery = query(
          collection(db, 'comandas'),
          where('agendamento_id', '==', id)
        );
        const comSnap = await getDocs(comQuery);
        
        if (comSnap.empty && !appointment.comanda_id) {
          const sServices = (appointment as any).selectedServices || [];
          const items = sServices.length > 0 
            ? sServices.map((s: any, idx: number) => ({
                id: `item-${appointment.id}-${idx}-${Date.now()}`,
                type: 'servico' as const,
                referencia_id: s.id || '',
                name: s.nome || s.name || '',
                quantity: 1,
                unitPrice: s.preco || s.price || 0,
                totalPrice: s.preco || s.price || 0,
                profissional_id: appointment.profissional_id,
                profissional_name: appointment.profissional_name,
                isCortesia: false,
                generateCommission: true
              }))
            : [{
                id: `item-${appointment.id}-${Date.now()}`,
                type: 'servico' as const,
                referencia_id: appointment.servico_id || '',
                name: appointment.servico_name || '',
                quantity: 1,
                unitPrice: appointment.price || 0,
                totalPrice: appointment.price || 0,
                profissional_id: appointment.profissional_id,
                profissional_name: appointment.profissional_name,
                isCortesia: false,
                generateCommission: true
              }];
          
          const newComanda = await comandaService.openComanda({
            cliente_id: appointment.cliente_id || 'avulso',
            cliente_name: appointment.cliente_name || 'Cliente Avulso',
            profissional_id: appointment.profissional_id,
            profissional_name: appointment.profissional_name,
            agendamento_id: appointment.id,
            status: 'em_atendimento',
            origin: 'agenda',
            items
          }, appointment.profissional_id, appointment.profissional_name);
          
          await updateDoc(docRef, {
            comanda_id: newComanda.id,
            comanda_number: newComanda.number,
            updatedAt: serverTimestamp()
          });
        } else if (!comSnap.empty && !appointment.comanda_id) {
          const existingComanda = comSnap.docs[0];
          await updateDoc(docRef, {
            comanda_id: existingComanda.id,
            comanda_number: existingComanda.data().number,
            updatedAt: serverTimestamp()
          });
          
          await updateDoc(existingComanda.ref, {
            status: 'em_atendimento',
            updatedAt: serverTimestamp()
          });
        }
      } catch (comErr) {
        console.error("Erro ao auto-criar/sincronizar comanda para início de atendimento:", comErr);
      }
    }

    // Cancela comanda vinculada se o agendamento for cancelado
    if (status === 'cancelado' && appointment.comanda_id) {
      try {
        const comRef = doc(db, 'comandas', appointment.comanda_id);
        const comSnap = await getDoc(comRef);
        if (comSnap.exists()) {
          const comData = comSnap.data();
          if (comData.status !== 'fechada' && comData.status !== 'cancelada') {
            await updateDoc(comRef, {
              status: 'cancelada',
              updatedAt: serverTimestamp()
            });
            await commissionService.cancelCommissionsByComanda(appointment.comanda_id);
          }
        }
      } catch (comErr) {
        console.error("Erro ao cancelar comanda vinculada no cancelamento do agendamento:", comErr);
      }
    }

    // Sincroniza outros agendamentos da mesma comanda se houver comanda_id
    if (appointment.comanda_id) {
      try {
        const linkedQuery = query(
          collection(db, COLLECTION),
          where('comanda_id', '==', appointment.comanda_id)
        );
        const linkedSnap = await getDocs(linkedQuery);
        if (!linkedSnap.empty) {
          const batch = writeBatch(db);
          linkedSnap.forEach((docSnap) => {
            if (docSnap.id !== id && docSnap.data().status !== status) {
              batch.update(docSnap.ref, {
                status,
                updatedAt: serverTimestamp()
              });
            }
          });
          await batch.commit();
        }
      } catch (linkSyncErr) {
        console.error("Erro ao sincronizar status entre agendamentos coligados à comanda:", linkSyncErr);
      }
    }

    // Se concluído, atualiza estatísticas do cliente e gera registro financeiro
    if (status === 'concluído') {
      // Se houver uma comanda vinculada, o faturamento, caixas e comissões 
      // serão processados exclusivamente pelo fluxo de fechamento/checkout da comanda.
      // Aqui apenas atualizamos o status da comanda para aguardando pagamento para sinalizar ao caixa.
      if (appointment.comanda_id) {
        try {
          const comRef = doc(db, 'comandas', appointment.comanda_id);
          const comSnap = await getDoc(comRef);
          if (comSnap.exists()) {
            const comData = comSnap.data();
            if (comData.status === 'aberta' || comData.status === 'em_atendimento') {
              await updateDoc(comRef, {
                status: 'aguardando_pagamento',
                updatedAt: serverTimestamp()
              });
            }
          }
        } catch (err) {
          console.error("Erro ao atualizar status da comanda vinculada para aguardando pagamento:", err);
        }
      } else {
        // Fluxo legado / direto (sem comandas): cria lançamentos diretamente para manter retrocompatibilidade
        // 1. Atualiza Cliente
        if (appointment.cliente_id) {
          const clientRef = doc(db, 'usuarios', appointment.cliente_id);
          const clientSnap = await getDoc(clientRef);
          
          if (clientSnap.exists()) {
            await updateDoc(clientRef, {
              totalSpent: increment(appointment.price),
              appointmentsCount: increment(1),
              lastServiceAt: serverTimestamp(),
              preferred_profissional_id: appointment.profissional_id,
              preferred_profissional_name: appointment.profissional_name,
              updatedAt: serverTimestamp()
            }).catch(err => console.error("Erro ao atualizar estatísticas do cliente:", err));
          }
        }

        // 2. Gera Lançamento Financeiro
        const pagamento_id = await financialService.createTransaction({
          type: 'income',
          category: 'Serviço',
          description: `Atendimento: ${appointment.servico_name} - ${appointment.cliente_name}`,
          amount: appointment.price,
          paymentMethod: paymentMethod,
          date: appointment.date,
          status: paymentMethod === 'fiado' ? 'pendente' : 'pago',
          agendamento_id: appointment.id,
          cliente_id: appointment.cliente_id,
          cliente_name: appointment.cliente_name,
          profissional_id: appointment.profissional_id,
          profissional_name: appointment.profissional_name,
          responsavel_id: appointment.profissional_id, 
          responsavel_name: appointment.profissional_name,
          net_amount: appointment.price,
          fee_amount: 0,
          settlement_date: appointment.date,
          is_settled: paymentMethod !== 'fiado'
        }).catch(err => {
          console.error("Erro ao gerar lançamento financeiro:", err);
          return null;
        });

        // 2.1. Registra no Caixa do Dia se houver caixa aberto
        try {
          const cashDoc = await cashService.getCurrentCash();
          if (cashDoc && paymentMethod !== 'fiado') {
            await cashService.addMovement({
              caixa_id: cashDoc.id,
              type: 'income',
              category: 'Venda',
              description: `Atendimento: ${appointment.servico_name} - ${appointment.cliente_name}`,
              amount: appointment.price,
              paymentMethod: paymentMethod,
              is_receivable: paymentMethod === 'credito' || paymentMethod === 'debito',
              settlement_date: appointment.date,
              referencia_id: appointment.id,
              usuario_id: appointment.profissional_id,
              usuario_name: appointment.profissional_name,
              date: appointment.date
            });
          }
        } catch (err) {
          console.error("Erro ao registrar movimento de caixa para agendamento concluído:", err);
        }

        // 3. Gera Comissão para o Barbeiro
        try {
          const barberProfile = await userService.getUserProfile(appointment.profissional_id);
          const defaultPercentage = barberProfile?.commission_percentage || 50; 

          // Fetch custom commission settings from the service
          const sDoc = appointment.servico_id ? await serviceService.getServiceById(appointment.servico_id) : null;
          const tipoComissao = sDoc?.tipo_comissao || 'padrao';
          const valorComissao = sDoc?.valor_comissao !== undefined ? sDoc?.valor_comissao : 0;

          let commission_percentage = defaultPercentage;
          let commission_value = 0;

          // Check if there's a specific professional-level override for this service
          const proOverride = sDoc?.comissoes_por_profissional?.[appointment.profissional_id];
          const effectiveRule = proOverride || { tipo: tipoComissao, valor: valorComissao };

          if (effectiveRule.tipo === 'percentual') {
            commission_percentage = effectiveRule.valor;
            commission_value = (appointment.price * commission_percentage) / 100;
          } else if (effectiveRule.tipo === 'fixo') {
            commission_percentage = 0;
            commission_value = effectiveRule.valor;
          } else {
            // 'padrao'
            commission_percentage = defaultPercentage;
            commission_value = (appointment.price * commission_percentage) / 100;
          }

          await commissionService.createCommission({
            profissional_id: appointment.profissional_id,
            profissional_name: appointment.profissional_name,
            agendamento_id: appointment.id,
            servico_name: appointment.servico_name,
            base_value: appointment.price,
            commission_percentage,
            commission_value,
            status: 'pendente',
            date: appointment.date
          });
        } catch (err) {
          console.error("Erro ao gerar comissão:", err);
        }
      }
    }
  },

  async getAvailableSlots(profissional_id: string, date: string, duration: number, servico_id?: string) {
    let finalDuration = duration;

    // 1. Resolve custom service duration for the professional
    if (servico_id && profissional_id) {
      try {
        const barberProfile = await userService.getUserProfile(profissional_id);
        if (barberProfile && barberProfile.servicos_duracoes && barberProfile.servicos_duracoes[servico_id]) {
          const overrideVal = barberProfile.servicos_duracoes[servico_id];
          if (overrideVal && overrideVal > 0) {
            finalDuration = overrideVal;
          }
        }
      } catch (err) {
        console.warn("Could not load custom service duration for barber:", err);
      }
    }

    let schedule = await resolveProfessionalSchedule(profissional_id);

    const dateObj = parse(date, 'yyyy-MM-dd', new Date());
    const dayOfWeek = getDay(dateObj);
    
    let startTime = '09:00';
    let endTime = '19:00';
    let lunchStart: string | undefined;
    let lunchEnd: string | undefined;
    let isOpen = false;

    const exception = schedule.exceptions.find(e => e.date === date);
    if (exception) {
      if (!exception.isOpen) return [];
      startTime = exception.startTime || startTime;
      endTime = exception.endTime || endTime;
      isOpen = true;
    } else {
      let workingDay = schedule.workingHours ? schedule.workingHours.find(wh => wh.dayOfWeek === dayOfWeek) : null;
      if (!workingDay) {
        // Fallback default open hours if this day was missing from the custom configuration
        workingDay = { 
          dayOfWeek, 
          isOpen: dayOfWeek !== 0, 
          startTime: '09:00', 
          endTime: dayOfWeek === 6 ? '17:00' : '19:00',
          lunchStart: '12:00', 
          lunchEnd: '13:00' 
        };
      }
      if (!workingDay.isOpen) return [];
      startTime = workingDay.startTime || '09:00';
      endTime = workingDay.endTime || '19:00';
      lunchStart = workingDay.lunchStart;
      lunchEnd = workingDay.lunchEnd;
      isOpen = true;
    }

    // Check vacations
    const isOnVacation = schedule.vacations.some(v => 
      (isAfter(dateObj, parse(v.startDate, 'yyyy-MM-dd', new Date())) || isEqual(dateObj, parse(v.startDate, 'yyyy-MM-dd', new Date()))) &&
      (isBefore(dateObj, parse(v.endDate, 'yyyy-MM-dd', new Date())) || isEqual(dateObj, parse(v.endDate, 'yyyy-MM-dd', new Date())))
    );
    if (isOnVacation) return [];

    // Fetch appointments and blocks
    const [appointments, blocks] = await Promise.all([
      this.getAppointments({ date, profissional_id }),
      agendaBlockService.getBlocks({ date, profissional_id })
    ]);

    // 2. Fetch tenant-wide slot configurations
    let interval = 15; // default
    let strategy = 'fixed';
    
    try {
      const activeTenantId = getActiveTenantId();
      if (activeTenantId) {
        const tenantData = await tenantService.getTenant(activeTenantId);
        if (tenantData) {
          if (tenantData.slot_interval) {
            interval = tenantData.slot_interval;
          }
          if (tenantData.slot_calculation_strategy) {
            strategy = tenantData.slot_calculation_strategy;
          }
        }
      }
    } catch (err) {
      console.warn("Could not fetch slot interval/strategy:", err);
    }

    // If strategy is dynamic, use service duration (minimum 15 mins) as the slot increment step
    if (strategy === 'dynamic') {
      interval = Math.max(15, finalDuration);
    }

    const slots: string[] = [];
    let current = parse(startTime, 'HH:mm', new Date());
    const end = parse(endTime, 'HH:mm', new Date());

    while (isBefore(current, end)) {
      const timeStr = format(current, 'HH:mm');
      const slotStart = parse(timeStr, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, finalDuration);
      
      if (isAfter(slotEnd, end)) break;

      // Check lunch
      let hasLunchConflict = false;
      if (lunchStart && lunchEnd) {
        const lStart = parse(lunchStart, 'HH:mm', new Date());
        const lEnd = parse(lunchEnd, 'HH:mm', new Date());
        if (isBefore(slotStart, lEnd) && isAfter(slotEnd, lStart)) hasLunchConflict = true;
      }

      if (!hasLunchConflict) {
        // Check appointments
        const hasAppConflict = appointments.some(app => {
          if (['cancelado', 'faltou'].includes(app.status)) return false;
          const appStart = parse(app.startTime, 'HH:mm', new Date());
          const appEnd = parse(app.endTime, 'HH:mm', new Date());
          return isBefore(slotStart, appEnd) && isAfter(slotEnd, appStart);
        });

        // Check blocks
        const hasBlockConflict = blocks.some(block => {
          const bStart = parse(block.startTime, 'HH:mm', new Date());
          const bEnd = parse(block.endTime, 'HH:mm', new Date());
          return isBefore(slotStart, bEnd) && isAfter(slotEnd, bStart);
        });

        if (!hasAppConflict && !hasBlockConflict) {
          slots.push(timeStr);
        }
      }

      current = addMinutes(current, interval);
    }

    return slots;
  },

  // Recurring Appointments
  async createRecurringAppointment(data: Omit<RecurringAppointment, 'id' | 'createdAt' | 'updatedAt'>) {
    const payload = removeUndefinedFields({
      ...data,
      tenantId: getActiveTenantId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const docRef = await addDoc(collection(db, RECURRING_COLLECTION), payload);
    // Trigger generation for this newly created recurrence immediately
    const fullRec: RecurringAppointment = {
      id: docRef.id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    } as any;
    await this.generateAppointmentsForRecurring(fullRec).catch(err => console.error("Error generating initial appointments:", err));
    return docRef.id;
  },

  async deleteRecurringAppointment(id: string, mode: 'future' | 'all' | 'deactivate' = 'future') {
    // Delete or update the recurring record itself
    if (mode === 'deactivate') {
      await updateDoc(doc(db, RECURRING_COLLECTION, id), {
        status: 'inactive',
        updatedAt: serverTimestamp()
      });
    } else {
      await deleteDoc(doc(db, RECURRING_COLLECTION, id));
    }
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const q = query(
      collection(db, COLLECTION),
      where('recurringAppointmentId', '==', id)
    );

    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(docSnap => {
      const appData = docSnap.data();
      if (appData.status === 'agendado') {
        if (mode === 'all' || appData.date >= todayStr) {
          batch.delete(docSnap.ref);
        }
      }
    });
    await batch.commit();
  },

  async getRecurringAppointments(profissional_id?: string) {
    let q = query(collection(db, RECURRING_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (profissional_id) {
      q = query(q, where('appointmentTemplate.profissional_id', '==', profissional_id));
    }
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringAppointment));
  },

  async generateAppointmentsForRecurring(recurring: RecurringAppointment) {
    const today = startOfDay(new Date());
    const startDateObj = parse(recurring.startDate, 'yyyy-MM-dd', new Date());
    const endDateObj = recurring.endDate ? parse(recurring.endDate, 'yyyy-MM-dd', new Date()) : null;

    // Expand window up to endDateObj or up to 180 days (6 months) from today
    const maxFutureWindow = addDays(today, 180);
    const endWindow = endDateObj && isBefore(endDateObj, maxFutureWindow) ? endDateObj : maxFutureWindow;

    const targetDates: string[] = [];

    let current = isBefore(startDateObj, today) ? today : startDateObj;
    while (isBefore(current, endWindow) || isEqual(current, endWindow)) {
      if (endDateObj && isAfter(current, endDateObj)) {
        break;
      }

      const dateStr = format(current, 'yyyy-MM-dd');
      if (recurring.excludedDates?.includes(dateStr)) {
        current = addDays(current, 1);
        continue;
      }

      const dayOfWeek = getDay(current); // 0 = Sunday, 6 = Saturday
      const dayOfMonth = current.getDate();

      if (recurring.pattern === 'weekly') {
        if (recurring.dayOfWeek === dayOfWeek) {
          targetDates.push(dateStr);
        }
      } else if (recurring.pattern === 'biweekly') {
        if (recurring.dayOfWeek === dayOfWeek) {
          const diffMs = current.getTime() - startDateObj.getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffWeeks = Math.floor(diffDays / 7);
          if (diffWeeks % 2 === 0) {
            targetDates.push(dateStr);
          }
        }
      } else if (recurring.pattern === 'monthly') {
        if (recurring.dayOfMonth === dayOfMonth) {
          targetDates.push(dateStr);
        }
      }

      current = addDays(current, 1);
    }

    // Fetch existing appointments for this recurring series once
    const qSeries = query(
      collection(db, COLLECTION),
      where('recurringAppointmentId', '==', recurring.id)
    );
    const seriesSnap = await getDocs(qSeries);
    const existingDates = new Set(seriesSnap.docs.map(doc => doc.data().date));

    // For each target date, check if appointment already exists or create it
    for (const date of targetDates) {
      if (!existingDates.has(date)) {
        const template = recurring.appointmentTemplate;
        
        // Check availability
        const avail = await this.checkAvailability(
          template.profissional_id,
          date,
          template.startTime,
          template.endTime
        );

        if (avail.available) {
          const payload = removeUndefinedFields({
            ...template,
            date,
            origin: 'recorrente',
            recurringAppointmentId: recurring.id,
            tenantId: getActiveTenantId(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await addDoc(collection(db, COLLECTION), payload);
        }
      }
    }
  },

  async checkRecurringSeriesConflicts(
    profissional_id: string,
    targetDates: string[],
    startTime: string,
    endTime: string
  ): Promise<{ date: string; reason: string }[]> {
    const conflicts: { date: string; reason: string }[] = [];
    for (const date of targetDates) {
      const res = await this.checkAvailability(profissional_id, date, startTime, endTime);
      if (!res.available) {
        conflicts.push({
          date,
          reason: res.reason || 'Horário já ocupado ou indisponível'
        });
      }
    }
    return conflicts;
  },

  async syncAllRecurringAppointments() {
    try {
      const recurringList = await this.getRecurringAppointments();
      for (const rec of recurringList) {
        await this.generateAppointmentsForRecurring(rec).catch(err => 
          console.error("Error generating for", rec.id, err)
        );
      }
    } catch (err) {
      console.error("Error syncing recurring appointments:", err);
    }
  }
};
