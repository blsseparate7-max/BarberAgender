import React, { useState, useEffect } from 'react';
import { 
  LogOut, 
  Calendar, 
  History, 
  User, 
  Award, 
  Scissors, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  Sparkles, 
  Check, 
  Plus, 
  Phone, 
  MapPin, 
  AlertCircle,
  CalendarClock,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { userService } from '../services/userService';
import { appointmentService } from '../services/appointmentService';
import { serviceService } from '../services/serviceService';
import { loyaltyService } from '../services/loyaltyService';
import { subscriptionService } from '../services/subscriptionService';
import { getActiveTenantId, tenantService, TenantProfile } from '../services/tenantService';
import { UserProfile, Appointment, Service, LoyaltyPoints, Subscription } from '../types';
import { format, parse, addMinutes, isAfter, isBefore, isEqual } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

// Haversine formula to compute straight-line distance in km between two coordinate points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper to resolve coordinates deterministically for each tenant
function getTenantCoords(tenant: TenantProfile): { lat: number; lng: number } {
  const city = (tenant.address?.city || '').toLowerCase().trim();
  const id = tenant.id.toLowerCase();
  
  // Use length/character-based offsets to simulate real, distinct physical locations
  const offsetLat = (id.charCodeAt(0) % 10) * 0.005 - 0.025;
  const offsetLng = (id.charCodeAt(id.length - 1) % 10) * 0.005 - 0.025;

  if (city.includes('paulista') || city.includes('são paulo') || city.includes('sp')) {
    return { lat: -23.55052 + offsetLat, lng: -46.633308 + offsetLng };
  } else if (city.includes('rio') || city.includes('rj')) {
    return { lat: -22.906847 + offsetLat, lng: -43.172896 + offsetLng };
  } else if (city.includes('belo') || city.includes('bh') || city.includes('minas')) {
    return { lat: -19.9167 + offsetLat, lng: -43.9345 + offsetLng };
  } else {
    // Default fallback (São Paulo base)
    return { lat: -23.5616 + offsetLat, lng: -46.656 + offsetLng };
  }
}

interface PortalClienteProps {
  profile: UserProfile;
}

export function PortalCliente({ profile }: PortalClienteProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'home' | 'schedule' | 'history' | 'fidelidade' | 'pacotes' | 'assinaturas' | 'perfil'>('home');
  
  // Data State
  const [allTenants, setAllTenants] = useState<TenantProfile[]>([]);
  const [loyaltyConfig, setLoyaltyConfig] = useState<any>(null);
  const [availablePackages, setAvailablePackages] = useState<any[]>([]);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  
  // Barber/Tenant Browser States
  const [searchTenantTerm, setSearchTenantTerm] = useState('');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('all');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Proximity & Geolocation helpers
  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não é suportada pelo seu navegador.");
      return;
    }
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLoadingLocation(false);
        toast.success("Localização capturada! Barbearias ordenadas por proximidade.");
      },
      (error) => {
        console.error("Error getting location:", error);
        setLoadingLocation(false);
        // Fallback for demo or if rejected: set realistic center in SP
        setUserCoords({ lat: -23.55052, lng: -46.633308 });
        toast.info("Acesso à localização negado. Usando centro de São Paulo como referência.");
      }
    );
  };
  
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyPoints | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Profile Edit States
  const [editNome, setEditNome] = useState(profile.nome || '');
  const [editTelefone, setEditTelefone] = useState(profile.telefone || profile.phone || '');
  const [editObservacoes, setEditObservacoes] = useState(profile.observacoes || profile.observations || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Sync profile edits
  useEffect(() => {
    if (profile) {
      setEditNome(profile.nome || '');
      setEditTelefone(profile.telefone || profile.phone || '');
      setEditObservacoes(profile.observacoes || profile.observations || '');
    }
  }, [profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNome.trim()) {
      toast.error('O nome não pode estar vazio.');
      return;
    }
    setIsSavingProfile(true);
    try {
      await userService.updateUserProfile(profile.uid, {
        nome: editNome.trim(),
        telefone: editTelefone.trim(),
        phone: editTelefone.trim(),
        observacoes: editObservacoes.trim(),
        observations: editObservacoes.trim(),
      });
      toast.success('Perfil atualizado com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao atualizar perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Scheduling State
  const [selectedBarber, setSelectedBarber] = useState<UserProfile | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    loadData();

    // Sincronização em tempo real entre os painéis (Dono, Barbeiro e Cliente)
    const unsubscribe = appointmentService.subscribeToAppointments(
      { cliente_id: profile.uid },
      (updatedApps) => {
        setAppointments(updatedApps);
      }
    );

    return () => unsubscribe();
  }, [profile.uid]);

  // Load available time slots when scheduling inputs change
  useEffect(() => {
    if (selectedBarber && selectedService && selectedDate) {
      loadSlots();
    } else {
      setAvailableSlots([]);
    }
  }, [selectedBarber, selectedService, selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const activeTenantId = getActiveTenantId();
      
      // Load tenant info (defensive)
      try {
        const tenantSnap = await getDoc(doc(db, 'tenants', activeTenantId));
        if (tenantSnap.exists()) {
          setTenantInfo(tenantSnap.data());
        } else {
          const fallbackTenant = await tenantService.getOrCreateTenant(activeTenantId);
          setTenantInfo(fallbackTenant);
        }
      } catch (err) {
        console.warn("Could not load tenant info:", err);
      }

      // Load all tenants for selector (defensive + deduplicate by ID & name)
      try {
        const tenantsList = await tenantService.listTenants();
        if (tenantsList.length === 0 || !tenantsList.some(t => t.id.toLowerCase() === activeTenantId.toLowerCase())) {
          const activeTenantSnap = await tenantService.getOrCreateTenant(activeTenantId);
          if (activeTenantSnap) {
            tenantsList.unshift(activeTenantSnap);
          }
        }
        
        const uniqueTenants: TenantProfile[] = [];
        const seenIds = new Set<string>();
        const seenNames = new Set<string>();
        for (const t of tenantsList) {
          const lowerId = t.id.toLowerCase();
          const lowerName = (t.name || '').trim().toLowerCase();
          if (!seenIds.has(lowerId) && !seenNames.has(lowerName)) {
            seenIds.add(lowerId);
            if (lowerName) seenNames.add(lowerName);
            uniqueTenants.push(t);
          }
        }
        setAllTenants(uniqueTenants);
      } catch (err) {
        console.warn("Could not load tenants list:", err);
      }

      // Load loyalty config
      try {
        const config = await loyaltyService.getConfig();
        setLoyaltyConfig(config);
      } catch (err) {
        console.warn("Could not load loyalty config:", err);
      }

      // Load available packages configurations
      try {
        const qPackages = query(collection(db, 'pacotes_config'), where('tenantId', '==', activeTenantId));
        const configSnap = await getDocs(qPackages);
        const availableConfigs = configSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(p => p.active !== false && p.showInPortal !== false);
        setAvailablePackages(availableConfigs.sort((a: any, b: any) => (a.cutsCount || 0) - (b.cutsCount || 0)));
      } catch (err) {
        console.warn("Could not load packages config:", err);
      }

      // Load available plans configurations
      try {
        const plansList = await subscriptionService.getPlans();
        setAvailablePlans(plansList.filter(p => p.status !== 'inactive' && p.showInPortal !== false));
      } catch (err) {
        console.warn("Could not load subscription plans list:", err);
      }

      // Load active barbers
      try {
        const activeBarbers = await userService.getAllBarbers(true);
        setBarbers(activeBarbers.filter(b => b.showInPortal !== false));
      } catch (err) {
        console.warn("Could not load barbers list:", err);
      }

      // Load active services
      try {
        const activeServices = await serviceService.getServices(true);
        setServices(activeServices.filter(s => s.active !== false && s.showInPortal !== false));
      } catch (err) {
        console.warn("Could not load services list:", err);
      }

      // Load client's appointments
      try {
        const clientApps = await appointmentService.getAppointments({ cliente_id: profile.uid });
        setAppointments(clientApps);
      } catch (err) {
        console.warn("Could not load client appointments list:", err);
      }

      // Load loyalty points & cashback
      try {
        const loyaltyPoints = await loyaltyService.getClientPoints(profile.uid);
        setLoyalty(loyaltyPoints);
      } catch (err) {
        console.warn("Could not load client loyalty points:", err);
      }

      // Load subscriptions
      try {
        const clientSubs = await subscriptionService.getSubscriptions(profile.uid);
        setSubscriptions(clientSubs.filter(s => s.status === 'active'));
      } catch (err) {
        console.warn("Could not load client subscriptions list:", err);
      }

      // Load package sales
      try {
        const pkgQuery = query(collection(db, 'pacotes_vendas'), where('clientId', '==', profile.uid));
        const pkgSnap = await getDocs(pkgQuery);
        const clientPkgs = pkgSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPackages(clientPkgs);
      } catch (err) {
        console.warn("Could not load client packages sales:", err);
      }

    } catch (err) {
      console.error("General error loading Portal Cliente data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTenant = async (newTenantId: string) => {
    localStorage.setItem('barberelite_tenant_id', newTenantId);
    
    // Reset selected booking options to prevent mismatch
    setSelectedBarber(null);
    setSelectedService(null);
    setSelectedTime(null);
    
    // Update user's tenantId in Firestore so they are registered in this unit
    try {
      await userService.updateUserProfile(profile.uid, {
        tenantId: newTenantId,
        ativo: true
      });
    } catch (err) {
      console.error("Error updating user tenant association:", err);
    }
    
    const selectedName = allTenants.find(t => t.id.toLowerCase() === newTenantId.toLowerCase())?.name || newTenantId;
    toast.success(`Unidade alterada para: ${selectedName}`);
    
    // Reload data for the new unit
    await loadData();
  };

  const loadSlots = async () => {
    if (!selectedBarber || !selectedService) return;
    setLoadingSlots(true);
    try {
      const slots = await appointmentService.getAvailableSlots(
        selectedBarber.uid,
        selectedDate,
        selectedService.duracao_minutos || selectedService.duration || 30
      );
      setAvailableSlots(slots);
      setSelectedTime(null);
    } catch (err) {
      console.error("Error fetching available slots:", err);
      toast.error("Erro ao carregar horários disponíveis.");
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success("Até logo! Esperamos você de volta em breve.");
    } catch (err) {
      toast.error("Erro ao fazer logout.");
    }
  };

  const handleCreateAppointment = async () => {
    if (!selectedBarber || !selectedService || !selectedTime) {
      toast.error("Por favor, preencha todos os dados.");
      return;
    }

    setIsSubmitting(true);
    try {
      const duration = selectedService.duracao_minutos || selectedService.duration || 30;
      const startParsed = parse(selectedTime, 'HH:mm', new Date());
      const endParsed = addMinutes(startParsed, duration);
      const endTimeStr = format(endParsed, 'HH:mm');

      const newApp = {
        cliente_id: profile.uid,
        cliente_name: profile.nome,
        cliente_telefone: profile.telefone || profile.phone || '',
        profissional_id: selectedBarber.uid,
        profissional_name: selectedBarber.nome,
        servico_id: selectedService.id,
        servico_name: selectedService.nome || selectedService.name || '',
        date: selectedDate,
        startTime: selectedTime,
        endTime: endTimeStr,
        duration: duration,
        price: selectedService.preco || selectedService.price || 0,
        status: 'agendado' as const,
        origin: 'cliente' as const,
        notes: 'Agendado via Portal do Cliente'
      };

      await appointmentService.createAppointment(newApp);
      
      toast.success("Agendamento realizado com sucesso!");
      
      // Reset Scheduling Form
      setSelectedBarber(null);
      setSelectedService(null);
      setSelectedTime(null);
      
      // Reload Data and Go to Home
      await loadData();
      setActiveTab('home');
    } catch (err: any) {
      console.error("Error scheduling appointment:", err);
      toast.error(err.message || "Erro ao agendar horário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelAppointment = async (appId: string) => {
    if (!window.confirm("Deseja realmente cancelar este agendamento?")) return;
    
    try {
      await appointmentService.cancelAppointment(appId);
      toast.success("Agendamento cancelado com sucesso.");
      await loadData();
    } catch (err) {
      console.error("Error canceling appointment:", err);
      toast.error("Erro ao cancelar o agendamento.");
    }
  };

  // Filter future active appointments
  const futureAppointments = appointments.filter(app => {
    if (app.status === 'cancelado' || app.status === 'faltou') return false;
    // Keep today's and future ones
    const today = format(new Date(), 'yyyy-MM-dd');
    return app.date >= today;
  }).sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  // Previous appointments
  const pastAppointments = appointments.filter(app => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return app.date < today || app.status === 'concluído' || app.status === 'cancelado' || app.status === 'faltou';
  }).sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full"
          />
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">
            Sincronizando Portal...
          </p>
        </div>
      </div>
    );
  }

  // Generate date options (next 14 working days)
  const dateOptions: { dateStr: string; dayLabel: string; monthLabel: string }[] = [];
  let tempDate = new Date();
  for (let i = 0; i < 14; i++) {
    const formatted = format(tempDate, 'yyyy-MM-dd');
    const dayName = format(tempDate, 'EEE', { locale: ptBR }).replace('.', '');
    const dayNum = format(tempDate, 'dd');
    const monthName = format(tempDate, 'MMM', { locale: ptBR }).replace('.', '');
    
    dateOptions.push({
      dateStr: formatted,
      dayLabel: `${dayName}, ${dayNum}`,
      monthLabel: monthName
    });
    tempDate.setDate(tempDate.getDate() + 1);
  }

  const filteredTenants = allTenants.map(t => {
    if (userCoords) {
      const tc = getTenantCoords(t);
      const dist = calculateDistance(userCoords.lat, userCoords.lng, tc.lat, tc.lng);
      return { ...t, distance: dist };
    }
    return { ...t, distance: undefined };
  }).filter(t => {
    const term = searchTenantTerm.toLowerCase();
    const matchesSearch = t.name.toLowerCase().includes(term) || 
      t.id.toLowerCase().includes(term) ||
      (t.address?.street || '').toLowerCase().includes(term) ||
      (t.address?.city || '').toLowerCase().includes(term);
    
    if (selectedCityFilter !== 'all') {
      return matchesSearch && t.address?.city === selectedCityFilter;
    }
    return matchesSearch;
  });

  // Sort by distance ascending (nearest first) if userCoords is active
  if (userCoords) {
    filteredTenants.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-24 md:pb-6">
      {/* Header Panel */}
      <header className="bg-slate-900 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
              {profile.nome.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest">Seja bem-vindo!</p>
              <h2 className="text-base font-black tracking-tight">{profile.nome}</h2>
              <div className="mt-1 flex items-center gap-1.5">
                <MapPin size={11} className="text-amber-500 flex-shrink-0" />
                <select
                  value={tenantInfo?.id || getActiveTenantId()}
                  onChange={async (e) => {
                    await handleSelectTenant(e.target.value);
                  }}
                  className="bg-slate-800 text-white text-[11px] font-bold border border-slate-700/60 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer max-w-[180px] sm:max-w-[240px] truncate"
                >
                  {allTenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id} className="bg-slate-900 text-white text-[11px]">
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="p-3 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-2xl border border-white/5 hover:border-rose-500/20 transition-all flex items-center gap-1.5 text-xs font-bold"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 md:py-8 space-y-6">
        
        {/* Dynamic Content Views */}
        <AnimatePresence mode="wait">
          
          {/* TAB: HOME */}
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* Quick Loyalty Card & Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Loyalty Balance Card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-[32px] border border-slate-800 text-white relative overflow-hidden flex flex-col justify-between min-h-[160px] shadow-xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="text-amber-400" size={20} />
                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Cashback Acumulado</span>
                    </div>
                    {loyalty?.isVip && (
                      <span className="bg-amber-500/20 text-amber-300 text-[9px] font-black uppercase px-2.5 py-1 rounded-full border border-amber-500/30">
                        Cliente VIP
                      </span>
                    )}
                  </div>
                  
                  <div className="my-3">
                    <span className="text-4xl font-black text-amber-400">
                      R$ {loyalty?.cashback?.toFixed(2) || '0,00'}
                    </span>
                    <p className="text-[10px] text-slate-400 font-bold mt-1">
                      Pontos Acumulados: <span className="text-white">{loyalty?.points || 0} pts</span>
                    </p>
                  </div>

                  <div className="text-[9px] text-slate-400 font-semibold border-t border-slate-800 pt-2.5 flex items-center justify-between">
                    <span>Use como desconto no próximo corte</span>
                    <button 
                      onClick={() => setActiveTab('fidelidade')}
                      className="text-amber-400 font-extrabold flex items-center gap-0.5 hover:underline"
                    >
                      Ver Extrato <ChevronRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Next Appointment Card */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[160px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-500">
                      <CalendarClock size={20} className="text-indigo-500" />
                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Próximo Agendamento</span>
                    </div>
                  </div>

                  {futureAppointments.length > 0 ? (
                    <div className="my-3 flex items-start gap-3.5">
                      <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 flex flex-col items-center">
                        <span className="text-[9px] font-black uppercase">
                          {format(parse(futureAppointments[0].date, 'yyyy-MM-dd', new Date()), 'MMM', { locale: ptBR })}
                        </span>
                        <span className="text-xl font-black">
                          {format(parse(futureAppointments[0].date, 'yyyy-MM-dd', new Date()), 'dd')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-800 truncate">{futureAppointments[0].servico_name}</h4>
                        <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Profissional: {futureAppointments[0].profissional_name}</p>
                        <p className="text-xs font-bold text-indigo-600 mt-1 flex items-center gap-1">
                          <Clock size={12} />
                          {futureAppointments[0].startTime} ({futureAppointments[0].endTime})
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="my-4 text-center">
                      <p className="text-xs text-slate-400 font-semibold">Nenhum horário marcado atualmente.</p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-2.5 flex items-center justify-between gap-2">
                    {futureAppointments.length > 0 ? (
                      <>
                        <button 
                          onClick={() => handleCancelAppointment(futureAppointments[0].id)}
                          className="text-[10px] text-rose-500 font-black hover:underline uppercase tracking-wider"
                        >
                          Cancelar Horário
                        </button>
                        <a 
                          href={`https://wa.me/${tenantInfo?.phone || ''}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-indigo-600 font-black hover:underline uppercase tracking-wider flex items-center gap-1"
                        >
                          Falar no WhatsApp
                        </a>
                      </>
                    ) : (
                      <button 
                        onClick={() => setActiveTab('schedule')}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl py-2 text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                      >
                        <Plus size={12} /> Marcar meu primeiro horário
                      </button>
                    )}
                  </div>
                </div>

              </div>

              {/* Barbearias Browser Widget */}
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <MapPin className="text-indigo-500 animate-bounce" size={18} />
                      Navegador de Barbearias
                    </h3>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      Digite o nome ou cidade para encontrar a barbearia ideal para você.
                    </p>
                  </div>
                  
                  <span className="self-start sm:self-center px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-full">
                    {allTenants.length} {allTenants.length === 1 ? 'Unidade' : 'Unidades'}
                  </span>
                </div>

                {/* Search Bar & City Selector */}
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Pesquisar barbearia por nome, rua ou cidade..."
                      value={searchTenantTerm}
                      onChange={(e) => setSearchTenantTerm(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl px-4 py-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleRequestLocation}
                      disabled={loadingLocation}
                      className="px-3.5 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 border border-indigo-200/40 disabled:opacity-50"
                    >
                      {loadingLocation ? (
                        <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <MapPin size={12} className="text-indigo-600 animate-pulse" />
                      )}
                      {userCoords ? "Recalcular Distância" : "Mais Próximas"}
                    </button>

                    {/* City filter chips */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full scrollbar-none">
                      <button
                        type="button"
                        onClick={() => setSelectedCityFilter('all')}
                        className={`px-3.5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                          selectedCityFilter === 'all'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/40'
                        }`}
                      >
                        Todas
                      </button>
                      {Array.from(new Set(allTenants.map(t => t.address?.city).filter(Boolean))).map(city => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => setSelectedCityFilter(city || 'all')}
                          className={`px-3.5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                            selectedCityFilter === city
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/40'
                          }`}
                        >
                          {city}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Results list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[320px] overflow-y-auto pr-1">
                  {filteredTenants.length > 0 ? (
                    filteredTenants.map((item) => {
                      const isActive = (tenantInfo?.id || getActiveTenantId()).toLowerCase() === item.id.toLowerCase();
                      return (
                        <div
                          key={item.id}
                          onClick={async () => {
                            if (isActive) return;
                            await handleSelectTenant(item.id);
                          }}
                          className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 hover:shadow-md ${
                            isActive
                              ? 'bg-indigo-50/65 border-indigo-200 shadow-sm'
                              : 'bg-slate-50/50 hover:bg-white border-slate-100'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                {item.name}
                                {isActive && (
                                  <span className="bg-indigo-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Ativa
                                  </span>
                                )}
                              </h4>
                              {item.distance !== undefined && (
                                <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded-full border border-emerald-100/60 flex items-center gap-1 whitespace-nowrap">
                                  <MapPin size={9} /> {item.distance.toFixed(1)} km
                                </span>
                              )}
                            </div>
                            {item.address && (
                              <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                <MapPin size={11} className="text-slate-400" />
                                {item.address.street}, {item.address.city} - {item.address.state}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-100/50 pt-2.5">
                            <span className="text-[10px] text-slate-400 font-bold">
                              ID: {item.id}
                            </span>
                            <button
                              type="button"
                              disabled={isActive}
                              className={`text-[9px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all ${
                                isActive
                                  ? 'text-indigo-600 bg-indigo-100/60 font-extrabold cursor-default'
                                  : 'text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm'
                              }`}
                            >
                              {isActive ? 'Selecionada' : 'Escolher Barbearia'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-2 py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs text-slate-400 font-semibold">Nenhuma barbearia encontrada com esses filtros.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Subscriptions / Packages Widgets */}
              {(subscriptions.length > 0 || packages.length > 0) && (
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck className="text-emerald-500 animate-pulse" size={16} />
                    Meus Planos e Combos Ativos
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Active Subscriptions */}
                    {subscriptions.map(sub => (
                      <div key={sub.id} className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-emerald-800">{sub.planName}</p>
                          <p className="text-[10px] text-emerald-600/80 font-bold mt-1">Cortes: {sub.haircutsUsed} usados / Barbas: {sub.beardsUsed} usadas</p>
                          <p className="text-[9px] text-slate-400 mt-1 font-semibold">Válido até: {format(parse(sub.endDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}</p>
                        </div>
                        <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">Assinante</span>
                      </div>
                    ))}

                    {/* Active Packages */}
                    {packages.map(pkg => (
                      <div key={pkg.id} className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl flex justify-between items-center">
                        <div>
                          <p className="text-xs font-black text-amber-800">{pkg.packageName || 'Combo de Serviços'}</p>
                          <p className="text-[10px] text-amber-600/80 font-bold mt-1">
                            Cortes Restantes: <span className="font-extrabold text-amber-800">{pkg.remainingCuts} de {pkg.totalCuts}</span>
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1 font-semibold">Valor Pago: R$ {pkg.pricePaid?.toFixed(2)}</p>
                        </div>
                        <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">Pacote</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Booking Shortcut Board */}
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 p-6 rounded-[32px] text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="absolute top-0 right-0 w-44 h-44 bg-white/10 rounded-full blur-xl pointer-events-none" />
                <div className="space-y-1.5 text-center md:text-left">
                  <h3 className="text-base font-black tracking-tight flex items-center gap-2 justify-center md:justify-start">
                    <Sparkles size={18} className="text-amber-400 animate-spin-slow" />
                    Agende em Segundos!
                  </h3>
                  <p className="text-xs text-white/80 font-semibold max-w-md">
                    Escolha seu barbeiro de preferência, selecione o serviço e garanta o seu horário na agenda sem complicação.
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('schedule')}
                  className="bg-white text-indigo-700 hover:bg-slate-50 transition-all font-black text-xs px-6 py-4 rounded-2xl flex items-center gap-1.5 shadow-md flex-shrink-0"
                >
                  <Scissors size={14} />
                  Agendar Agora
                </button>
              </div>

              {/* Next Scheduled Slots List */}
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Próximos agendamentos</h3>
                
                {futureAppointments.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {futureAppointments.map(app => (
                      <div key={app.id} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3.5">
                          <div className="bg-slate-100 p-2.5 rounded-xl text-slate-700 flex flex-col items-center min-w-[50px]">
                            <span className="text-[9px] font-black uppercase text-slate-500">
                              {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'MMM', { locale: ptBR }).replace('.', '')}
                            </span>
                            <span className="text-base font-black text-slate-800">
                              {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'dd')}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800">{app.servico_name}</h4>
                            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Com {app.profissional_name}</p>
                            <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full mt-1.5 inline-block">
                              {app.startTime} ({app.endTime})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCancelAppointment(app.id)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                            title="Cancelar Agendamento"
                          >
                            <AlertCircle size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-semibold">Você ainda não possui nenhum agendamento pendente.</p>
                  </div>
                )}
              </div>

            </motion.div>
          )}

          {/* TAB: SCHEDULE (REAL TIME SCHEDULER) */}
          {activeTab === 'schedule' && (
            <motion.div 
              key="schedule"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-8"
            >
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                  <Scissors className="text-amber-500" size={20} />
                  Marcar Novo Horário
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Preencha o formulário interativo abaixo para sincronizar seu horário na agenda de forma instantânea.
                </p>
              </div>

              {/* Step 1: Select Professional */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                  1. Escolha o Profissional
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {barbers.map(b => (
                    <button
                      key={b.uid}
                      type="button"
                      onClick={() => setSelectedBarber(b)}
                      className={`p-4 rounded-2xl border transition-all text-center flex flex-col items-center gap-2.5 relative group ${
                        selectedBarber?.uid === b.uid 
                          ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                          : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                      }`}
                    >
                      {selectedBarber?.uid === b.uid && (
                        <div className="absolute top-2.5 right-2.5 bg-indigo-600 text-white p-0.5 rounded-full">
                          <Check size={10} />
                        </div>
                      )}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-sm transition-all ${
                        selectedBarber?.uid === b.uid ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {b.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 w-full">
                        <p className="text-xs font-black text-slate-800 truncate">{b.nome}</p>
                        <p className="text-[9px] text-slate-400 font-bold truncate mt-0.5">{b.especialidade || 'Barbeiro'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Select Service */}
              {selectedBarber && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="space-y-4 border-t border-slate-100 pt-6"
                >
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                    2. Escolha o Serviço
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {services.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedService(s)}
                        className={`p-4 rounded-2xl border transition-all text-left flex justify-between items-center gap-3 relative group ${
                          selectedService?.id === s.id 
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' 
                            : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200'
                        }`}
                      >
                        {selectedService?.id === s.id && (
                          <div className="absolute top-2.5 right-2.5 bg-indigo-600 text-white p-0.5 rounded-full">
                            <Check size={10} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-black text-slate-800 truncate">{s.nome || s.name}</h4>
                          <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{s.descricao || 'Serviço tradicional'}</p>
                          <div className="flex items-center gap-2 mt-2 font-bold text-[10px]">
                            <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              R$ {(s.preco || s.price || 0).toFixed(2)}
                            </span>
                            <span className="text-slate-500 flex items-center gap-0.5">
                              <Clock size={10} /> {s.duracao_minutos || s.duration || 30} min
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Step 3: Select Date & Time */}
              {selectedBarber && selectedService && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="space-y-6 border-t border-slate-100 pt-6"
                >
                  {/* Date Selector */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                      3. Selecione a Data
                    </label>
                    <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none custom-scrollbar-thin">
                      {dateOptions.map(opt => (
                        <button
                          key={opt.dateStr}
                          type="button"
                          onClick={() => setSelectedDate(opt.dateStr)}
                          className={`p-3 rounded-2xl border transition-all flex flex-col items-center min-w-[75px] flex-shrink-0 ${
                            selectedDate === opt.dateStr 
                              ? 'border-indigo-600 bg-indigo-600 text-white shadow-md' 
                              : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 text-slate-700'
                          }`}
                        >
                          <span className={`text-[9px] font-black uppercase ${selectedDate === opt.dateStr ? 'text-indigo-200' : 'text-slate-400'}`}>
                            {opt.monthLabel}
                          </span>
                          <span className="text-sm font-black mt-0.5">
                            {opt.dayLabel.split(', ')[1]}
                          </span>
                          <span className={`text-[8px] font-bold uppercase mt-1 ${selectedDate === opt.dateStr ? 'text-indigo-200' : 'text-slate-500'}`}>
                            {opt.dayLabel.split(', ')[0]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Slots Selector */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      4. Horários Disponíveis para {format(parse(selectedDate, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: ptBR })}
                      {loadingSlots && <Clock className="animate-spin text-slate-400" size={12} />}
                    </label>

                    {loadingSlots ? (
                      <div className="h-12 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase animate-pulse">Carregando horários...</span>
                      </div>
                    ) : availableSlots.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {availableSlots.map(time => (
                          <button
                            key={time}
                            type="button"
                            onClick={() => setSelectedTime(time)}
                            className={`py-2 px-1.5 rounded-xl border text-center text-xs font-black transition-all ${
                              selectedTime === time 
                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' 
                                : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 text-slate-700 font-bold'
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center bg-rose-50/50 border border-dashed border-rose-100 rounded-2xl">
                        <p className="text-xs text-rose-600 font-semibold">Não há horários disponíveis para este profissional na data selecionada.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Order Summary & Submit button */}
              {selectedBarber && selectedService && selectedTime && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="bg-slate-900 text-white p-6 rounded-[28px] space-y-4 shadow-xl border border-slate-800"
                >
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <CheckCircle size={14} /> Resumo da Reserva
                  </h4>

                  <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-300">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Serviço</p>
                      <p className="text-white mt-1">{selectedService.nome || selectedService.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Barbeiro</p>
                      <p className="text-white mt-1">{selectedBarber.nome}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Data e Hora</p>
                      <p className="text-white mt-1">
                        {format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')} às {selectedTime}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Valor Estimado</p>
                      <p className="text-amber-400 font-black text-sm mt-0.5">R$ {(selectedService.preco || selectedService.price || 0).toFixed(2)}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleCreateAppointment}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-4 rounded-2xl transition-all shadow-lg shadow-amber-500/10 uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Clock className="animate-spin" size={14} />
                        Confirmando Horário...
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        Confirmar Agendamento Instantâneo
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* TAB: HISTORY */}
          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6"
            >
              <div>
                <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                  <History className="text-amber-500" size={20} />
                  Meu Histórico de Agendamentos
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Visualize a sua linha do tempo completa de atendimentos e cortes já realizados.
                </p>
              </div>

              {pastAppointments.length > 0 ? (
                <div className="space-y-4">
                  {pastAppointments.map(app => (
                    <div 
                      key={app.id} 
                      className="p-4 rounded-2xl border border-slate-100 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="bg-slate-200/50 p-2.5 rounded-xl text-slate-700 flex flex-col items-center min-w-[50px] font-black">
                          <span className="text-[8px] uppercase text-slate-500">
                            {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'MMM', { locale: ptBR }).replace('.', '')}
                          </span>
                          <span className="text-sm">
                            {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'dd')}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-800">{app.servico_name}</h4>
                          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Profissional: {app.profissional_name}</p>
                          <div className="flex items-center gap-2 mt-1.5 text-[9px] font-bold">
                            <span className="text-slate-500 flex items-center gap-0.5 bg-slate-200/50 px-1.5 py-0.5 rounded">
                              <Clock size={9} /> {app.startTime}
                            </span>
                            <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              R$ {(app.price || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="self-end sm:self-center">
                        <span className={`text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full ${
                          app.status === 'concluído' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : app.status === 'cancelado' 
                            ? 'bg-rose-100 text-rose-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {app.status === 'concluído' ? 'Concluído' : app.status === 'cancelado' ? 'Cancelado' : app.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                  <p className="text-xs text-slate-400 font-semibold">Sua lista de histórico está limpa atualmente.</p>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB: FIDELIDADE */}
          {activeTab === 'fidelidade' && (
            <motion.div 
              key="fidelidade"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* Rules and Explanation card */}
              <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
                    <Award size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-slate-800">Programa de Cashback & Fidelidade</h3>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">Veja como funciona e acompanhe seus pontos de retorno.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-600">
                  {/* How to accumulate points (Only if points are enabled) */}
                  {((loyaltyConfig?.pointsPerReal || 0) > 0 || (loyaltyConfig?.pointsPerAppointment || 0) > 0) ? (
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-1 border border-indigo-100/30">
                      <p className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">Como Acumular Pontos</p>
                      <p className="text-slate-800 font-semibold leading-relaxed">
                        {(loyaltyConfig?.pointsPerReal || 0) > 0 && `Cada R$ 1,00 gasto gera ${loyaltyConfig.pointsPerReal} ${loyaltyConfig.pointsPerReal === 1 ? 'ponto' : 'pontos'}. `}
                        {(loyaltyConfig?.pointsPerAppointment || 0) > 0 && `Cada atendimento concluído gera +${loyaltyConfig.pointsPerAppointment} pontos bônus.`}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-1 opacity-70">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Programa de Pontos</p>
                      <p className="text-slate-400 font-semibold">Esta unidade não utiliza acúmulo de pontos tradicionais no momento.</p>
                    </div>
                  )}

                  {/* Cashback Percentage (Only if enabled) */}
                  {(loyaltyConfig?.cashbackPercentage || 0) > 0 ? (
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-1 border border-amber-100/30">
                      <p className="text-[10px] text-amber-600 font-black uppercase tracking-wider">Seu Retorno (Cashback)</p>
                      <p className="text-slate-800 font-semibold leading-relaxed">
                        Você recebe {loyaltyConfig.cashbackPercentage}% de cashback direto sobre o valor pago de cada atendimento realizado nesta unidade.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-4 rounded-2xl space-y-1 opacity-70">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Cashback (%)</p>
                      <p className="text-slate-400 font-semibold">Esta unidade não oferece cashback percentual ativo no momento.</p>
                    </div>
                  )}

                  {/* How to redeem/use */}
                  <div className="bg-slate-50 p-4 rounded-2xl space-y-1 border border-emerald-100/30">
                    <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider">Como Utilizar o Retorno</p>
                    <p className="text-slate-800 font-semibold leading-relaxed">
                      {(loyaltyConfig?.minRedemptionPoints || 0) > 0 ? `Necessário acumular no mínimo ${loyaltyConfig.minRedemptionPoints} pontos para liberar resgates. ` : ''}
                      Basta avisar ao seu profissional na hora do pagamento para descontar diretamente o saldo acumulado!
                    </p>
                  </div>
                </div>
              </div>

              {/* History list of Loyalty Points */}
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Extrato de Pontos</h3>
                
                <div className="bg-slate-50/50 rounded-2xl p-4 text-center border border-slate-100">
                  <p className="text-xs font-black text-slate-700">Seu Saldo Consolidado</p>
                  <div className="mt-2 flex justify-center items-center gap-6">
                    <div>
                      <p className="text-2xl font-black text-amber-500">R$ {loyalty?.cashback?.toFixed(2) || '0,00'}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Cashback</p>
                    </div>
                    <div className="w-px h-8 bg-slate-200" />
                    <div>
                      <p className="text-2xl font-black text-indigo-600">{loyalty?.points || 0}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Pontos Totais</p>
                    </div>
                  </div>
                </div>
              </div>

            </motion.div>
          )}

          {/* TAB: PACOTES */}
          {activeTab === 'pacotes' && (
            <motion.div 
              key="pacotes"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* Active client packages */}
              <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                    <Briefcase className="text-indigo-500" size={20} />
                    Meus Pacotes de Serviços
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Veja os pacotes de serviços que você já comprou e quantos cortes ou barbas ainda possui disponíveis.
                  </p>
                </div>

                {packages.filter(p => (p.remainingCuts || 0) > 0).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {packages.filter(p => (p.remainingCuts || 0) > 0).map(pkg => {
                      const total = pkg.totalCuts || 5;
                      const remaining = pkg.remainingCuts || 0;
                      const percentage = (remaining / total) * 100;
                      return (
                        <div key={pkg.id} className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/20 border border-indigo-100/80 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm">
                          <div>
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="text-sm font-black text-indigo-950 truncate">{pkg.packageName || 'Combo de Serviços'}</h4>
                              <span className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Ativo</span>
                            </div>
                            
                            <p className="text-[10px] text-indigo-600 font-bold mt-1">Adquirido em: {pkg.soldAt ? format(parse(pkg.soldAt.substring(0, 10), 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : 'Recentemente'}</p>
                            
                            {/* Cuts counter and bar */}
                            <div className="mt-4 space-y-1.5">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                <span>Cortes Disponíveis</span>
                                <span className="font-extrabold text-indigo-700">{remaining} de {total}</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-200/50 mt-4 flex items-center justify-between text-[10px] font-black text-indigo-800 uppercase tracking-wider">
                            <span>Valor Pago: R$ {pkg.pricePaid?.toFixed(2)}</span>
                            <button 
                              onClick={() => setActiveTab('schedule')}
                              className="hover:underline flex items-center gap-0.5"
                            >
                              Agendar Uso <ChevronRight size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 px-4 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-4">
                    <p className="text-xs text-slate-400 font-semibold">Você não possui nenhum pacote ou combo de serviços ativo nesta unidade.</p>
                    <button 
                      onClick={() => {
                        const elem = document.getElementById('discover-packages');
                        elem?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      Conhecer Pacotes de Serviços
                    </button>
                  </div>
                )}
              </div>

              {/* Discover/Explore packages */}
              <div id="discover-packages" className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                    <Sparkles className="text-amber-500" size={20} />
                    Garante Mais Economia com Nossos Pacotes!
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Adquira pacotes antecipados de serviços e ganhe super descontos. Perfeito para garantir a frequência com economia real.
                  </p>
                </div>

                {availablePackages.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {availablePackages.map(pkg => {
                      const discount = pkg.originalPrice - pkg.promotionalPrice;
                      const pricePerCut = pkg.promotionalPrice / pkg.cutsCount;
                      const cleanPhone = tenantInfo?.phone ? tenantInfo.phone.replace(/\D/g, '') : '';
                      const waText = encodeURIComponent(`Olá! Sou o cliente ${profile.nome} e gostaria de adquirir o pacote "${pkg.name}" (${pkg.cutsCount} cortes por R$ ${pkg.promotionalPrice.toFixed(2)}) na Barbearia!`);
                      const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                      return (
                        <div key={pkg.id} className="border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-200 p-6 rounded-2xl flex flex-col justify-between transition-all group">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="text-sm font-black text-slate-800 group-hover:text-indigo-950 transition-colors">{pkg.name}</h4>
                              {discount > 0 && (
                                <span className="bg-amber-100 text-amber-800 text-[8px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Economize R$ {discount.toFixed(0)}
                                </span>
                              )}
                            </div>

                            <p className="text-[10px] text-slate-500 font-bold mt-1">Inclui: {pkg.cutsCount} Cortes de Cabelo Premium</p>
                            
                            <div className="mt-4 flex items-baseline gap-1.5">
                              <span className="text-2xl font-black text-indigo-600">R$ {pkg.promotionalPrice.toFixed(2)}</span>
                              {pkg.originalPrice > pkg.promotionalPrice && (
                                <span className="text-xs font-semibold text-slate-400 line-through">R$ {pkg.originalPrice.toFixed(2)}</span>
                              )}
                            </div>

                            <p className="text-[10px] text-emerald-600 font-extrabold mt-1">
                              Apenas R$ {pricePerCut.toFixed(2)} por corte!
                            </p>
                          </div>

                          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[9px] text-slate-400 font-semibold">
                              {pkg.expiresDays > 0 ? `Validade: ${pkg.expiresDays} dias` : 'Sem data de validade'}
                            </span>
                            <a 
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shadow-sm active:scale-95"
                            >
                              <Phone size={10} /> Garantir Pacote
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-semibold">Não há pacotes cadastrados nesta barbearia no momento.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB: ASSINATURAS */}
          {activeTab === 'assinaturas' && (
            <motion.div 
              key="assinaturas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              {/* Active client subscriptions */}
              <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                    <ShieldCheck className="text-emerald-500" size={20} />
                    Minha Assinatura Ativa
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Acompanhe o status e a utilização dos serviços inclusos no seu plano de assinatura mensal.
                  </p>
                </div>

                {subscriptions.filter(s => s.status === 'active').length > 0 ? (
                  <div className="space-y-4">
                    {subscriptions.filter(s => s.status === 'active').map(sub => (
                      <div key={sub.id} className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/20 border border-emerald-100/80 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/50 pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-black text-emerald-950">{sub.planName}</h4>
                              <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Assinante Premium</span>
                            </div>
                            <p className="text-[10px] text-slate-500 font-bold mt-1">Início: {sub.startDate ? format(parse(sub.startDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''} • Próxima Renovação: {sub.endDate ? format(parse(sub.endDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''}</p>
                          </div>
                          <span className="text-emerald-700 font-black text-sm self-start sm:self-center bg-emerald-100/60 px-3 py-1.5 rounded-xl border border-emerald-200/50">Plano Ativo</span>
                        </div>

                        {/* Consumption counters */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                          <div className="p-4 bg-white border border-slate-100 rounded-xl space-y-1">
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Cortes Utilizados no Mês</p>
                            <p className="text-lg font-black text-slate-800">{sub.haircutsUsed} Utilizados</p>
                            <p className="text-[10px] text-emerald-600 font-semibold">Aproveite sua assinatura à vontade!</p>
                          </div>
                          <div className="p-4 bg-white border border-slate-100 rounded-xl space-y-1">
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">Barbas Utilizadas no Mês</p>
                            <p className="text-lg font-black text-slate-800">{sub.beardsUsed} Utilizadas</p>
                            <p className="text-[10px] text-emerald-600 font-semibold">Deixe a sua barba sempre alinhada!</p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                          <span>Renovação Automática: {sub.autoRenew ? 'Ativada' : 'Desativada'}</span>
                          <button 
                            onClick={() => setActiveTab('schedule')}
                            className="hover:underline flex items-center gap-0.5"
                          >
                            Agendar Atendimento <ChevronRight size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 px-4 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-4">
                    <p className="text-xs text-slate-400 font-semibold">Você ainda não é um membro do nosso clube de assinatura.</p>
                    <button 
                      onClick={() => {
                        const elem = document.getElementById('discover-subscriptions');
                        elem?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      Conhecer Clubes de Assinatura
                    </button>
                  </div>
                )}
              </div>

              {/* Discover/Explore plans */}
              <div id="discover-subscriptions" className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2 text-slate-800">
                    <Star className="text-amber-500" size={20} />
                    Faça Parte do Nosso Clube de Assinatura!
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Visitas recorrentes inclusas em uma mensalidade fixa para você ficar sempre no estilo, sem preocupações com pagamentos individuais.
                  </p>
                </div>

                {availablePlans.filter(p => p.status === 'active' || p.status === undefined).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {availablePlans.filter(p => p.status === 'active' || p.status === undefined).map(plan => {
                      const cleanPhone = tenantInfo?.phone ? tenantInfo.phone.replace(/\D/g, '') : '';
                      const waText = encodeURIComponent(`Olá! Sou o cliente ${profile.nome} e tenho muito interesse em fazer parte do Clube de Assinatura assinando o plano "${plan.name}" (R$ ${plan.price.toFixed(2)}/mês) na Barbearia!`);
                      const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                      return (
                        <div key={plan.id} className="border border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-emerald-200 p-6 rounded-2xl flex flex-col justify-between transition-all group relative overflow-hidden">
                          <div>
                            <h4 className="text-base font-black text-slate-800 group-hover:text-emerald-950 transition-colors">{plan.name}</h4>
                            <p className="text-xs text-slate-500 font-semibold mt-1">{plan.description || 'Plano de assinatura completo'}</p>
                            
                            <div className="mt-4">
                              <span className="text-3xl font-black text-emerald-600">R$ {plan.price.toFixed(2)}</span>
                              <span className="text-xs font-bold text-slate-400"> / mês</span>
                            </div>

                            {/* Plan Benefits */}
                            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider">O que está incluso:</p>
                              
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                <Check size={14} className="text-emerald-500 flex-shrink-0" />
                                <span>{plan.haircutsPerMonth > 99 ? 'Cortes de Cabelo Ilimitados' : `${plan.haircutsPerMonth} Cortes de Cabelo / mês`}</span>
                              </div>

                              <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                <Check size={14} className="text-emerald-500 flex-shrink-0" />
                                <span>{plan.beardsPerMonth > 99 ? 'Serviços de Barba Ilimitados' : `${plan.beardsPerMonth} Serviços de Barba / mês`}</span>
                              </div>

                              {plan.extraBenefits && plan.extraBenefits.map((benefit: string, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                  <Check size={14} className="text-emerald-500 flex-shrink-0" />
                                  <span>{benefit}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-6 pt-4 border-t border-slate-100">
                            <a 
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                            >
                              <Phone size={12} /> Assinar Plano de Clube
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-semibold">Não há planos de assinatura cadastrados nesta barbearia no momento.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB: PERFIL */}
          {activeTab === 'perfil' && (
            <motion.div 
              key="perfil"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
                  <div className="w-20 h-20 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-2xl text-indigo-650 shadow-inner">
                    {profile.nome.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-center sm:text-left space-y-1">
                    <span className="px-3 py-1 bg-indigo-50 text-[10px] font-black uppercase tracking-wider text-indigo-600 rounded-full border border-indigo-100">
                      Cliente Registrado
                    </span>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight mt-1">{profile.nome}</h3>
                    <p className="text-xs font-semibold text-slate-450">{profile.email}</p>
                  </div>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Nome Completo</label>
                      <input 
                        required
                        type="text" 
                        value={editNome}
                        onChange={e => setEditNome(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                        placeholder="Seu nome"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">E-mail (Inalterável)</label>
                      <input 
                        disabled
                        type="email" 
                        value={profile.email}
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold text-slate-450 outline-none transition opacity-70 cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Telefone WhatsApp</label>
                      <input 
                        type="tel" 
                        value={editTelefone}
                        onChange={e => setEditTelefone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                        placeholder="(11) 99999-9999"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">Minhas Preferências / Observações</label>
                      <textarea 
                        value={editObservacoes}
                        onChange={e => setEditObservacoes(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition resize-none"
                        placeholder="Ex: Prefiro máquina 2 nas laterais e tesoura em cima..."
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button
                      type="submit"
                      disabled={isSavingProfile}
                      className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50"
                    >
                      {isSavingProfile ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

      </main>

      {/* Bottom Bar Navigation for mobile-first feels */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200/80 px-2 py-2.5 flex items-center justify-around z-40 md:sticky md:bottom-auto md:top-4 md:bg-white md:border-none md:shadow-md md:rounded-[24px] md:max-w-xl md:mx-auto md:mt-4 shadow-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'home' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Calendar size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Início</span>
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'schedule' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Scissors size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Reservar</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'history' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <History size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Histórico</span>
        </button>

        <button
          onClick={() => setActiveTab('fidelidade')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'fidelidade' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Award size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Fidelidade</span>
        </button>

        <button
          onClick={() => setActiveTab('pacotes')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'pacotes' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Briefcase size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Pacotes</span>
        </button>

        <button
          onClick={() => setActiveTab('assinaturas')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'assinaturas' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Sparkles size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Assinar</span>
        </button>

        <button
          onClick={() => setActiveTab('perfil')}
          className={`flex flex-col items-center gap-1 transition-all flex-shrink-0 min-w-[54px] ${
            activeTab === 'perfil' ? 'text-indigo-600 scale-105 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User size={18} />
          <span className="text-[8px] font-black uppercase tracking-wider">Perfil</span>
        </button>
      </nav>
    </div>
  );
}
