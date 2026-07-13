
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
  onSnapshot
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
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'appointments';
const RECURRING_COLLECTION = 'recurring_appointments';

export const appointmentService = {
  async createAppointment(data: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) {
    // 1. Check for availability (bypass for encaixes to allow squeeze-ins/overbooking)
    if (data.origin !== 'encaixe') {
      const result = await this.checkAvailability(data.profissional_id, data.date, data.startTime, data.endTime);
      if (!result.available) {
        throw new Error(result.reason || 'O profissional não está disponível neste horário.');
      }
    }

    // 2. Add to Firestore
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      tenantId: (data as any).tenantId || getActiveTenantId(),
      origin: data.origin || 'agenda',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  },

  async updateAppointment(id: string, data: Partial<Appointment>) {
    const docRef = doc(db, COLLECTION, id);
    
    // If date or time changed, check for availability
    if (data.date || data.startTime || data.endTime || data.profissional_id) {
      const currentSnap = await getDoc(docRef);
      const current = currentSnap.data() as Appointment;
      
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
  },

  async checkAvailability(profissional_id: string, date: string, startTime: string, endTime: string, excludeId?: string): Promise<{ available: boolean; reason?: string }> {
    // 1. Check Professional Schedule
    const schedule = await professionalScheduleService.getSchedule(profissional_id);
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
      where('profissional_id', '==', profissional_id),
      where('date', '==', date),
      where('status', 'in', ['agendado', 'confirmado', 'em_atendimento', 'concluído'])
    );

    const querySnapshot = await getDocs(q);
    const appointments = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Appointment))
      .filter(app => app.id !== excludeId);

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
    let q = query(collection(db, COLLECTION));

    if (filters.date) {
      q = query(q, where('date', '==', filters.date), orderBy('startTime', 'asc'));
    } else if (filters.startDate && filters.endDate) {
      q = query(q, 
      where('date', '>=', filters.startDate), 
      where('date', '<=', filters.endDate),
      orderBy('date', 'asc'),
      orderBy('startTime', 'asc')
      );
    } else {
      q = query(q, orderBy('startTime', 'asc'));
    }

    if (filters.profissional_id) {
      q = query(q, where('profissional_id', '==', filters.profissional_id));
    }
    if (filters.cliente_id) {
      q = query(q, where('cliente_id', '==', filters.cliente_id));
    }
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
  },

  subscribeToAppointments(filters: { date?: string; startDate?: string; endDate?: string; profissional_id?: string; cliente_id?: string; status?: AppointmentStatus }, callback: (appointments: Appointment[]) => void) {
    let q = query(collection(db, COLLECTION));

    if (filters.date) {
      q = query(q, where('date', '==', filters.date), orderBy('startTime', 'asc'));
    } else if (filters.startDate && filters.endDate) {
      q = query(q, 
        where('date', '>=', filters.startDate), 
        where('date', '<=', filters.endDate),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc')
      );
    } else {
      q = query(q, orderBy('startTime', 'asc'));
    }

    if (filters.profissional_id) {
      q = query(q, where('profissional_id', '==', filters.profissional_id));
    }
    if (filters.cliente_id) {
      q = query(q, where('cliente_id', '==', filters.cliente_id));
    }
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }

    return onSnapshot(q, (snapshot) => {
      const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
      callback(appointments);
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

  async updateStatus(id: string, status: AppointmentStatus, paymentMethod: PaymentMethod = 'dinheiro') {
    const docRef = doc(db, COLLECTION, id);
    const appSnap = await getDoc(docRef);
    
    if (!appSnap.exists()) throw new Error('Agendamento não encontrado.');
    const appointment = appSnap.data() as Appointment;

    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });

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
            ativo: true,
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
  },

  async getAvailableSlots(profissional_id: string, date: string, duration: number) {
    const schedule = await professionalScheduleService.getSchedule(profissional_id);
    if (!schedule) return [];

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
      const workingDay = schedule.workingHours.find(wh => wh.dayOfWeek === dayOfWeek);
      if (!workingDay || !workingDay.isOpen) return [];
      startTime = workingDay.startTime;
      endTime = workingDay.endTime;
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

    const interval = 15;
    const slots: string[] = [];
    let current = parse(startTime, 'HH:mm', new Date());
    const end = parse(endTime, 'HH:mm', new Date());

    while (isBefore(current, end)) {
      const timeStr = format(current, 'HH:mm');
      const slotStart = parse(timeStr, 'HH:mm', new Date());
      const slotEnd = addMinutes(slotStart, duration);
      
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
    const docRef = await addDoc(collection(db, RECURRING_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async getRecurringAppointments(profissional_id?: string) {
    let q = query(collection(db, RECURRING_COLLECTION));
    if (profissional_id) {
      q = query(q, where('appointmentTemplate.profissional_id', '==', profissional_id));
    }
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecurringAppointment));
  }
};
