
import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, Scissors, Loader2, AlertCircle, Check, Receipt, Award, Sparkles, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Appointment, Service, UserProfile, AppointmentStatus } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { serviceService } from '../../services/serviceService';
import { userService } from '../../services/userService';
import { format, addMinutes, parse } from 'date-fns';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  appointment?: Appointment | null;
  currentUser: UserProfile;
  initialTime?: string;
  initialProfissionalId?: string;
  onOpenComanda?: (appointment: Appointment) => void;
}

export function AppointmentModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  appointment, 
  currentUser,
  initialTime,
  initialProfissionalId,
  onOpenComanda
}: AppointmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    cliente_id: '',
    cliente_name: '',
    profissional_id: '',
    profissional_name: '',
    servico_id: '',
    servico_name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '',
    notes: '',
    status: 'agendado' as AppointmentStatus,
    origin: 'agenda' as 'agenda' | 'encaixe' | 'recorrente'
  });

  const [clientPackages, setClientPackages] = useState<any[]>([]);
  const [clientSubscriptions, setClientSubscriptions] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && formData.cliente_id) {
      const qPackages = query(collection(db, 'pacotes_vendas'), where('clientId', '==', formData.cliente_id));
      const qSubscriptions = query(collection(db, 'subscriptions'), where('cliente_id', '==', formData.cliente_id));
      
      const unsubPackages = onSnapshot(qPackages, (snap) => {
        setClientPackages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubSubscriptions = onSnapshot(qSubscriptions, (snap) => {
        setClientSubscriptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      
      return () => {
        unsubPackages();
        unsubSubscriptions();
      };
    } else {
      setClientPackages([]);
      setClientSubscriptions([]);
    }
  }, [isOpen, formData.cliente_id]);

  useEffect(() => {
    if (isOpen) {
      loadInitialData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (appointment) {
      setFormData({
        cliente_id: appointment.cliente_id,
        cliente_name: appointment.cliente_name,
        profissional_id: appointment.profissional_id,
        profissional_name: appointment.profissional_name,
        servico_id: appointment.servico_id,
        servico_name: appointment.servico_name,
        date: appointment.date,
        startTime: appointment.startTime,
        notes: appointment.notes || '',
        status: appointment.status,
        origin: appointment.origin || 'agenda'
      });
    } else {
      const barber = barbers.find(b => b.uid === initialProfissionalId);
      setFormData({
        cliente_id: currentUser.tipo === 'cliente' ? currentUser.uid : '',
        cliente_name: currentUser.tipo === 'cliente' ? currentUser.nome : '',
        profissional_id: initialProfissionalId || (currentUser.tipo === 'barbeiro' ? currentUser.uid : ''),
        profissional_name: barber?.nome || (currentUser.tipo === 'barbeiro' ? currentUser.nome : ''),
        servico_id: '',
        servico_name: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: initialTime || '',
        notes: '',
        status: 'agendado',
        origin: initialTime && initialProfissionalId ? 'encaixe' : 'agenda'
      });
    }
  }, [appointment, currentUser, initialTime, initialProfissionalId, barbers]);

  useEffect(() => {
    if (formData.profissional_id && formData.date && formData.servico_id) {
      loadAvailableSlots();
    }
  }, [formData.profissional_id, formData.date, formData.servico_id]);

  const loadInitialData = async () => {
    setInitialLoading(true);
    try {
      const [servicesData, barbersData] = await Promise.all([
        serviceService.getServices(),
        userService.getAllBarbers()
      ]);
      setServices(servicesData);
      setBarbers(barbersData);

      if (currentUser.tipo === 'admin' || currentUser.tipo === 'gerente') {
        const clientsData = await userService.getAllClients();
        setClients(clientsData);
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar dados iniciais.');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadAvailableSlots = async () => {
    const service = services.find(s => s.id === formData.servico_id);
    if (!service) return;

    try {
      const slots = await appointmentService.getAvailableSlots(formData.profissional_id, formData.date, service.duration);
      setAvailableSlots(slots);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const service = services.find(s => s.id === formData.servico_id);
      const barber = barbers.find(b => b.uid === formData.profissional_id);
      const client = currentUser.tipo === 'cliente' ? currentUser : clients.find(c => c.uid === formData.cliente_id);

      if (!service || !barber || !client) {
        throw new Error('Por favor, selecione todos os campos obrigatórios.');
      }

      const start = parse(formData.startTime, 'HH:mm', new Date());
      const endTime = format(addMinutes(start, service.duration), 'HH:mm');

      const appointmentData = {
        cliente_id: client.uid,
        cliente_name: client.nome,
        profissional_id: barber.uid,
        profissional_name: barber.nome,
        servico_id: service.id,
        servico_name: service.name,
        date: formData.date,
        startTime: formData.startTime,
        endTime,
        duration: service.duration,
        price: service.price,
        status: formData.status,
        origin: formData.origin,
        notes: formData.notes
      };

      if (appointment) {
        await appointmentService.updateAppointment(appointment.id, appointmentData);
      } else {
        await appointmentService.createAppointment(appointmentData);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao salvar agendamento.');
    } finally {
      setLoading(false);
    }
  };

  // Reset professional if selected service can't be performed by them
  useEffect(() => {
    if (formData.servico_id) {
      const selectedService = services.find(s => s.id === formData.servico_id);
      if (selectedService && selectedService.barbeiros_ids && selectedService.barbeiros_ids.length > 0) {
        if (formData.profissional_id && !selectedService.barbeiros_ids.includes(formData.profissional_id)) {
          setFormData(prev => ({ ...prev, profissional_id: '', profissional_name: '' }));
        }
      }
    }
  }, [formData.servico_id, services]);

  if (!isOpen) return null;

  const selectedService = services.find(s => s.id === formData.servico_id);
  const eligibleBarbers = barbers.filter(b => {
    // Only active barbers
    if (b.ativo === false) return false;
    
    // If a service is selected and has a list of allowed professional IDs, check if this barber is in the list
    if (selectedService) {
      if (selectedService.barbeiros_ids && selectedService.barbeiros_ids.length > 0) {
        return selectedService.barbeiros_ids.includes(b.uid);
      }
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border border-slate-200 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col text-primary"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-primary">{appointment ? 'Editar Agendamento' : 'Novo Agendamento'}</h2>
            <p className="text-xs text-muted">Preencha os dados para reservar o horário</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-muted hover:text-primary border border-slate-100 bg-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {error && (
            <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center gap-3 text-red-600 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            {/* Seleção de Cliente (Admin/Gerente) */}
            {(currentUser.tipo === 'admin' || currentUser.tipo === 'gerente') && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Cliente</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                  <select 
                    required
                    value={formData.cliente_id}
                    onChange={(e) => setFormData({...formData, cliente_id: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium appearance-none"
                  >
                    <option value="" className="text-muted">Selecione o cliente</option>
                    {clients.map(c => <option key={c.uid} value={c.uid} className="text-primary font-medium">{c.nome}</option>)}
                  </select>
                </div>
              </div>
            )}

            {/* Seleção de Profissional */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Profissional</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <select 
                  required
                  disabled={currentUser.tipo === 'barbeiro'}
                  value={formData.profissional_id}
                  onChange={(e) => setFormData({...formData, profissional_id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium appearance-none disabled:opacity-50"
                >
                  <option value="" className="text-muted">Selecione o profissional</option>
                  {eligibleBarbers.map(b => <option key={b.uid} value={b.uid} className="text-primary font-medium">{b.nome}</option>)}
                </select>
              </div>
            </div>

            {/* Seleção de Serviço */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Serviço</label>
              <div className="relative">
                <Scissors className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <select 
                  required
                  value={formData.servico_id}
                  onChange={(e) => setFormData({...formData, servico_id: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium appearance-none"
                >
                  <option value="" className="text-muted">Selecione o serviço</option>
                  {services.map(s => <option key={s.id} value={s.id} className="text-primary font-medium">{s.name} ({s.duration} min - R$ {s.price})</option>)}
                </select>
              </div>
            </div>

            {/* Seleção de Data */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Data</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={18} />
                <input 
                  type="date" 
                  required
                  min={format(new Date(), 'yyyy-MM-dd')}
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium"
                />
              </div>
            </div>

            {/* Benefícios Globais do Cliente */}
            {formData.cliente_id && (clientPackages.some(p => p.remainingCuts > 0) || clientSubscriptions.some(s => s.status === 'active')) && (
              <div className="col-span-full flex flex-wrap gap-2 pt-2 animate-in fade-in duration-300">
                {clientPackages.some(p => p.remainingCuts > 0) && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-xl border border-amber-100 shadow-sm">
                    <Award size={12} className="text-amber-500" />
                    <span>Possui Pacote Ativo</span>
                  </span>
                )}
                {clientSubscriptions.some(s => s.status === 'active') && (
                  <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-xl border border-indigo-100 shadow-sm">
                    <Sparkles size={12} className="text-indigo-500" />
                    <span>Assinante do Clube</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Service benefit details */}
          {formData.servico_id && (() => {
            const selectedService = services.find(s => s.id === formData.servico_id);
            const isHaircut = selectedService?.name?.toLowerCase().includes('corte') || 
                              selectedService?.name?.toLowerCase().includes('cabelo') || 
                              selectedService?.name?.toLowerCase().includes('hair');
            const isBeard = selectedService?.name?.toLowerCase().includes('barba') || 
                            selectedService?.name?.toLowerCase().includes('beard');

            const matchingPackage = clientPackages.find(
              p => p.remainingCuts > 0 && (p.serviceId === formData.servico_id || p.packageName.toLowerCase().includes(selectedService?.name?.toLowerCase() || ''))
            );

            const activeSub = clientSubscriptions.find(s => s.status === 'active');
            const subHasRemainingCuts = activeSub && isHaircut && (activeSub.haircutsUsed < (activeSub.haircutsPerMonth || 999));
            const subHasRemainingBeards = activeSub && isBeard && (activeSub.beardsUsed < (activeSub.beardsPerMonth || 999));

            if (matchingPackage || subHasRemainingCuts || subHasRemainingBeards) {
              return (
                <div className="p-4 bg-emerald-50 border border-emerald-100/50 rounded-2xl flex items-start gap-3 text-emerald-800 animate-in slide-in-from-top-4 duration-300">
                  <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs space-y-1">
                    <p className="font-black uppercase tracking-widest text-emerald-900">Benefício Disponível para este Atendimento!</p>
                    {matchingPackage && (
                      <p className="font-semibold text-emerald-700">O cliente possui o pacote <strong className="font-extrabold">"{matchingPackage.packageName}"</strong> com <strong className="font-black">{matchingPackage.remainingCuts} cortes</strong> em haver. Este atendimento poderá ser descontado diretamente do pacote na comanda.</p>
                    )}
                    {(subHasRemainingCuts || subHasRemainingBeards) && (
                      <p className="font-semibold text-emerald-700">O cliente é assinante ativo do plano <strong className="font-extrabold">"{activeSub?.planName}"</strong>. Este serviço ({isHaircut ? 'Corte' : 'Barba'}) poderá ser consumido da assinatura.</p>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Seleção de Horário */}
          <div className="space-y-3 text-left">
            <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Horários Disponíveis</label>
            {!formData.profissional_id || !formData.servico_id ? (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-muted text-xs font-medium">
                Selecione um profissional e um serviço para ver os horários
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center text-muted text-xs font-medium">
                Nenhum horário disponível para esta data
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setFormData({...formData, startTime: slot})}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      formData.startTime === slot 
                        ? 'bg-accent border-accent text-white shadow-md shadow-accent/10' 
                        : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2 text-left">
            <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Observações</label>
            <textarea 
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="Alguma observação especial?"
              rows={3}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none resize-none"
            />
          </div>

          {appointment && (
            <div className="space-y-2 text-left">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Status</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'agendado', label: 'Agendado' },
                  { id: 'confirmado', label: 'Confirmado' },
                  { id: 'em_atendimento', label: 'Em Atendimento' },
                  { id: 'concluído', label: 'Concluído' },
                  { id: 'cancelado', label: 'Cancelado' },
                  { id: 'faltou', label: 'Faltou' },
                  { id: 'bloqueado', label: 'Bloqueado' }
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (s.id === 'concluído' && onOpenComanda && appointment) {
                        onOpenComanda(appointment);
                        onClose();
                      } else {
                        setFormData({...formData, status: s.id as AppointmentStatus});
                      }
                    }}
                    className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      formData.status === s.id 
                        ? 'bg-primary border-primary text-white shadow-md shadow-primary/10' 
                        : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 flex flex-col gap-4">
            {appointment && (
              <div className="flex flex-col gap-2">
                {(appointment.status === 'agendado' || appointment.status === 'confirmado') && (
                  <button 
                    type="button"
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await appointmentService.startService(appointment.id);
                        onSuccess();
                        onClose();
                      } catch (err: any) {
                        setError(err.message);
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/10 active:scale-95 border-0"
                  >
                    <Clock size={20} />
                    <span>INICIAR ATENDIMENTO</span>
                  </button>
                )}

                {(appointment.status === 'em_atendimento' || appointment.status === 'confirmado') && onOpenComanda && (
                  <button 
                    type="button"
                    onClick={() => {
                      onOpenComanda(appointment);
                      onClose();
                    }}
                    className="w-full bg-accent text-white py-4 rounded-2xl font-black text-sm hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-accent/10 active:scale-95 border-0"
                  >
                    <Receipt size={20} />
                    <span>FINALIZAR E ABRIR COMANDA</span>
                  </button>
                )}
              </div>
            )}
            
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-xl font-bold text-sm transition-all"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={loading || !formData.startTime}
                className="flex-[2] bg-emerald-500 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-0"
              >
                {loading ? <Loader2 className="animate-spin" size={18} /> : (
                  <>
                    <Check size={18} />
                    {appointment ? 'Salvar Alterações' : 'Confirmar Agendamento'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
