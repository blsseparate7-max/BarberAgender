import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  User, 
  Bell, 
  Shield, 
  CreditCard, 
  HelpCircle, 
  ChevronRight, 
  LogOut,
  Building2,
  MapPin,
  Phone,
  Mail,
  Clock,
  Lock,
  Globe,
  Camera,
  Save,
  Loader2,
  CheckCircle2,
  Plus,
  X,
  Sliders,
  Database,
  Check,
  Eye,
  RefreshCw,
  Users,
  Search,
  Send,
  HelpCircle as QuestionIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { settingsService, BarbershopProfile } from '../services/settingsService';
import { userService } from '../services/userService';
import { toast } from 'sonner';

export function Configuracoes({ activeSubTab }: { activeSubTab?: string }) {
  const { profile, signOut } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');

  // New modules states
  const [notifWeb, setNotifWeb] = useState(true);
  const [notifWpp, setNotifWpp] = useState(true);
  const [notifMail, setNotifMail] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('elite');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMsg, setTicketMsg] = useState('');

  // Business / rules states
  const [pointsRate, setPointsRate] = useState('10');
  const [cashbackPct, setCashbackPct] = useState('5');
  const [delayLimit, setDelayLimit] = useState('15');
  const [autoQueue, setAutoQueue] = useState(true);

  // Opening hours states
  const [hours, setHours] = useState([
    { day: 'Segunda-feira', open: true, start: '08:00', end: '20:00' },
    { day: 'Terça-feira', open: true, start: '08:00', end: '20:00' },
    { day: 'Quarta-feira', open: true, start: '08:00', end: '20:00' },
    { day: 'Quinta-feira', open: true, start: '08:00', end: '20:00' },
    { day: 'Sexta-feira', open: true, start: '08:00', end: '22:00' },
    { day: 'Sábado', open: true, start: '08:00', end: '22:00' },
    { day: 'Domingo', open: false, start: '09:00', end: '14:00' },
  ]);

  // Security system users state
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState('');

  useEffect(() => {
    if (activeSubTab) {
      if (activeSubTab === 'configuracoes-parametros') setActiveSection('business');
      else if (activeSubTab === 'configuracoes-rodizio') setActiveSection('rules');
      else if (activeSubTab === 'configuracoes-funcionamento') setActiveSection('hours');
      else if (activeSubTab === 'configuracoes-permissoes') setActiveSection('security');
      else if (activeSubTab === 'admin-usuarios') setActiveSection('security');
    }
  }, [activeSubTab]);

  const [bbProfile, setBbProfile] = useState<BarbershopProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (activeSection === 'security') {
      fetchUsers();
    }
  }, [activeSection]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const barbers = await userService.getUsersByRole('barbeiro', false);
      const clients = await userService.getUsersByRole('cliente', false);
      const managers = await userService.getUsersByRole('gerente', false);
      const admins = await userService.getUsersByRole('admin', false);
      const merged = [...admins, ...managers, ...barbers, ...clients];
      const uniqueMap = new Map();
      merged.forEach(u => {
        if (u && u.uid) {
          uniqueMap.set(u.uid, u);
        }
      });
      setUsers(Array.from(uniqueMap.values()));
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleUserActive = async (uid: string, currentStatus: boolean) => {
    try {
      await userService.updateUserProfile(uid, { ativo: !currentStatus });
      toast.success("Status do usuário atualizado!");
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ativo: !currentStatus } : u));
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleChangeUserRole = async (uid: string, newRole: any) => {
    try {
      await userService.updateUserProfile(uid, { tipo: newRole });
      toast.success("Cargo de acesso atualizado com sucesso!");
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, tipo: newRole } : u));
    } catch (err) {
      toast.error("Erro ao atualizar cargo de acesso");
    }
  };

  const loadSettings = async () => {
    setLoadingProfile(true);
    try {
      const data = await settingsService.getProfile();
      if (data) {
        setBbProfile(data);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const { execute: handleSaveProfile, isLoading: isSavingProfile } = useAsyncAction(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      phone: formData.get('phone') as string,
      cnpj: formData.get('cnpj') as string,
      address: {
        street: formData.get('street') as string,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        zipCode: formData.get('zipCode') as string,
      }
    };

    try {
      await settingsService.updateProfile(data);
      setBbProfile(data as BarbershopProfile);
      toast.success("Perfil da unidade atualizado com sucesso!");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Erro ao salvar perfil.");
    }
  });

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Preferências de notificações aplicadas com sucesso!");
  };

  const handleSaveBusinessSettings = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Ajustes e parâmetros gerais de fidelidade aplicados!");
  };

  const handleSaveRules = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Regras estratégicas de rodízio atualizadas!");
  };

  const handleSaveHours = () => {
    toast.success("Grade horária de atendimento salva com sucesso!");
  };

  const handleSendTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMsg) {
      toast.error("Por favor, preencha o assunto e a mensagem do chamado.");
      return;
    }
    toast.success("Seu chamado técnico foi aberto! Nossa equipe responderá em até 2 horas.");
    setTicketSubject('');
    setTicketMsg('');
  };

  if (loadingProfile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="animate-spin text-accent" size={48} />
        <p className="text-muted animate-pulse font-medium tracking-widest uppercase text-xs">Carregando configurações...</p>
      </div>
    );
  }

  // Filter users lists based on search
  const filteredUsers = users.filter(u => {
    const nome = u.nome || u.name || '';
    const email = u.email || '';
    const phone = u.telefone || u.phone || '';
    return nome.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
           email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
           phone.includes(userSearchTerm);
  });

  return (
    <div className="space-y-10 pb-10">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-primary">Configurações</h1>
        <p className="text-muted text-sm font-medium mt-1">Gerencie sua conta, preferências e ajustes estratégicos do sistema.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-3">
          <ConfigSidebarItem 
            icon={<Building2 size={18} />} 
            label="Perfil da Barbearia" 
            active={activeSection === 'profile'} 
            onClick={() => setActiveSection('profile')}
          />
          <ConfigSidebarItem 
            icon={<Clock size={18} />} 
            label="Funcionamento" 
            active={activeSection === 'hours'} 
            onClick={() => setActiveSection('hours')}
          />
          <ConfigSidebarItem 
            icon={<Sliders size={18} />} 
            label="Regras de Rodízio" 
            active={activeSection === 'rules'} 
            onClick={() => setActiveSection('rules')}
          />
          <ConfigSidebarItem 
            icon={<Database size={18} />} 
            label="Fidelidade e Metas" 
            active={activeSection === 'business'} 
            onClick={() => setActiveSection('business')}
          />
          <ConfigSidebarItem 
            icon={<Bell size={18} />} 
            label="Notificações" 
            active={activeSection === 'notifications'} 
            onClick={() => setActiveSection('notifications')}
          />
          <ConfigSidebarItem 
            icon={<Shield size={18} />} 
            label="Usuários e Permissões" 
            active={activeSection === 'security'} 
            onClick={() => setActiveSection('security')}
          />
          <ConfigSidebarItem 
            icon={<CreditCard size={18} />} 
            label="Plano e Faturamento" 
            active={activeSection === 'billing'} 
            onClick={() => setActiveSection('billing')}
          />
          <ConfigSidebarItem 
            icon={<HelpCircle size={18} />} 
            label="Suporte e Ajuda" 
            active={activeSection === 'support'} 
            onClick={() => setActiveSection('support')}
          />
          
          <div className="pt-6 mt-6 border-t border-slate-100">
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-sm font-black text-red-500 hover:bg-red-50 transition-all active:scale-95 uppercase tracking-widest"
            >
              <LogOut size={18} />
              Sair do Sistema
            </button>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <motion.div 
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-200 rounded-[2.5rem] p-8 md:p-10 shadow-sm space-y-10"
          >
            {/* Perfil da Barbearia */}
            {activeSection === 'profile' && (
              <form onSubmit={handleSaveProfile}>
                <section className="space-y-8">
                  <div className="flex items-center gap-8">
                    <div className="relative group">
                      <div className="w-24 h-24 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 group-hover:border-accent group-hover:text-accent transition-all cursor-pointer shadow-inner">
                        <Camera size={32} />
                      </div>
                      <button type="button" className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg border-4 border-white active:scale-90 transition-transform">
                        <Plus size={18} />
                      </button>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-primary tracking-tight">Logo da Unidade</h3>
                      <p className="text-xs text-muted font-medium mt-1 max-w-xs leading-relaxed">Recomendamos uma imagem quadrada de pelo menos 512x512px.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nome da Barbearia</label>
                      <input 
                        name="name"
                        type="text" 
                        defaultValue={bbProfile?.name || "BarberElite Headquarters"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-mail de Contato</label>
                      <input 
                        name="email"
                        type="email" 
                        defaultValue={bbProfile?.email || "contato@barberelite.com"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Telefone</label>
                      <input 
                        name="phone"
                        type="text" 
                        defaultValue={bbProfile?.phone || "(11) 99999-8888"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">CNPJ (Opcional)</label>
                      <input 
                        name="cnpj"
                        type="text" 
                        defaultValue={bbProfile?.cnpj}
                        placeholder="00.000.000/0000-00" 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                  </div>
                </section>

                <section className="pt-10 border-t border-slate-100 space-y-8 mt-10">
                  <h3 className="text-xl font-black text-primary tracking-tight flex items-center gap-3">
                    <MapPin size={22} className="text-accent" />
                    Endereço Estratégico
                  </h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Logradouro</label>
                      <input 
                        name="street"
                        type="text" 
                        defaultValue={bbProfile?.address?.street || "Avenida Paulista, 1000"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Cidade</label>
                        <input 
                          name="city"
                          type="text" 
                          defaultValue={bbProfile?.address?.city || "São Paulo"} 
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Estado</label>
                        <input 
                          name="state"
                          type="text" 
                          defaultValue={bbProfile?.address?.state || "SP"} 
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">CEP</label>
                        <input 
                          name="zipCode"
                          type="text" 
                          defaultValue={bbProfile?.address?.zipCode || "01310-100"} 
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <div className="flex justify-end gap-4 pt-10">
                  <button type="button" onClick={loadSettings} className="px-8 py-4 rounded-2xl text-sm font-black text-muted hover:text-primary transition-all active:scale-95 uppercase tracking-widest">
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSavingProfile}
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center gap-3 active:scale-95 uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSavingProfile ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Salvar Alterações
                  </button>
                </div>
              </form>
            )}

            {/* Horário de Funcionamento */}
            {activeSection === 'hours' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Grade de Funcionamento</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Configure o expediente geral da barbearia para agendamentos online.</p>
                </div>
                
                <div className="space-y-4 border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                  {hours.map((h, i) => (
                    <div key={h.day} className="flex flex-col sm:flex-row sm:items-center justify-between p-6 bg-slate-50/50 border-b border-slate-100 last:border-0 gap-4">
                      <div className="flex items-center gap-4">
                        <input 
                          type="checkbox" 
                          checked={h.open} 
                          onChange={() => {
                            const updated = [...hours];
                            updated[i].open = !updated[i].open;
                            setHours(updated);
                          }}
                          className="w-5 h-5 rounded border-slate-300 text-accent focus:ring-accent"
                        />
                        <span className="font-bold text-sm text-primary w-28">{h.day}</span>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${h.open ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                          {h.open ? 'Expediente' : 'Fechada'}
                        </span>
                      </div>
                      
                      {h.open && (
                        <div className="flex items-center gap-3">
                          <input 
                            type="text" 
                            value={h.start} 
                            onChange={(e) => {
                              const updated = [...hours];
                              updated[i].start = e.target.value;
                              setHours(updated);
                            }}
                            className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-center w-20 focus:outline-none focus:border-accent"
                          />
                          <span className="text-slate-400 text-xs font-bold">até</span>
                          <input 
                            type="text" 
                            value={h.end} 
                            onChange={(e) => {
                              const updated = [...hours];
                              updated[i].end = e.target.value;
                              setHours(updated);
                            }}
                            className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-center w-20 focus:outline-none focus:border-accent"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-6">
                  <button 
                    onClick={handleSaveHours}
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3"
                  >
                    <Save size={18} />
                    Salvar Horários
                  </button>
                </div>
              </div>
            )}

            {/* Regras de Rodízio */}
            {activeSection === 'rules' && (
              <form onSubmit={handleSaveRules} className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Fila e Rodízio de Profissionais</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Defina diretrizes de distribuição automática para clientes avulsos e sem preferência.</p>
                </div>

                <div className="space-y-6">
                  <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-primary">Ativar Rodízio por Equidade</h4>
                      <p className="text-xs text-muted max-w-md mt-1 font-medium">Preenche o barbeiro que prestou menos serviços no dia para equilibrar lucros e comissões.</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setAutoQueue(!autoQueue)} 
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${autoQueue ? 'bg-accent' : 'bg-slate-200'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${autoQueue ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Tempo de Tolerância para Atrasos (minutos)</label>
                    <input 
                      type="number" 
                      value={delayLimit} 
                      onChange={(e) => setDelayLimit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <button 
                    type="submit"
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3"
                  >
                    <Save size={18} />
                    Aplicar Regras
                  </button>
                </div>
              </form>
            )}

            {/* Fidelidade e Metas (Business) */}
            {activeSection === 'business' && (
              <form onSubmit={handleSaveBusinessSettings} className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Parâmetros do Programa de Fidelidade</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Ajuste fatores automáticos de geração de pontos e cashback do sistema.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Pontos para cada R$ 1,00 gasto</label>
                    <input 
                      type="number" 
                      value={pointsRate} 
                      onChange={(e) => setPointsRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Porcentagem Clássica de Cashback (%)</label>
                    <input 
                      type="number" 
                      value={cashbackPct} 
                      onChange={(e) => setCashbackPct(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <button 
                    type="submit"
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3"
                  >
                    <Save size={18} />
                    Salvar Ajustes
                  </button>
                </div>
              </form>
            )}

            {/* Notificações */}
            {activeSection === 'notifications' && (
              <form onSubmit={handleSaveNotifications} className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Canais de Comunicação</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Controle quais notificações o BarberElite enviará automaticamente.</p>
                </div>

                <div className="space-y-6">
                  <NotificationToggle 
                    title="Alertas via WhatsApp" 
                    desc="Envio imediato de confirmação de agendamentos e cobranças fiadas aos clientes." 
                    checked={notifWpp} 
                    onChange={setNotifWpp} 
                  />
                  
                  <NotificationToggle 
                    title="Notificações Push no Navegador" 
                    desc="Sinalizar quando um novo horário for agendado ou uma comanda for quitada." 
                    checked={notifWeb} 
                    onChange={setNotifWeb} 
                  />

                  <NotificationToggle 
                    title="Newsletter & Relatórios Diários" 
                    desc="Receber resumos consolidados em português no e-mail cadastrado." 
                    checked={notifMail} 
                    onChange={setNotifMail} 
                  />
                </div>

                <div className="flex justify-end pt-6">
                  <button 
                    type="submit"
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3"
                  >
                    <Save size={18} />
                    Salvar Preferências
                  </button>
                </div>
              </form>
            )}

            {/* Segurança e Acesso / Usuários do Sistema */}
            {activeSection === 'security' && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-primary tracking-tight">Usuários do Sistema</h3>
                    <p className="text-xs text-muted font-semibold mt-1">Altere níveis de permissões, privilegios e controle de suspensão de contas.</p>
                  </div>
                  <button 
                    onClick={fetchUsers}
                    className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all active:scale-95"
                  >
                    <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
                    Atualizar Base
                  </button>
                </div>

                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Filtrar profissionais ou clientes pelo nome ou e-mail..." 
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                  />
                </div>

                {loadingUsers ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="animate-spin text-accent" size={32} />
                    <p className="text-[10px] text-muted font-black uppercase tracking-widest">Sincronizando banco de acessos...</p>
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100">
                            <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest">Nome / Cadastro</th>
                            <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest">Função / Cargo</th>
                            <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest">Status de Acesso</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {filteredUsers.map((u, index) => {
                            const userEmail = u.email || '—';
                            const userName = u.nome || u.name || 'Identificado';
                            const userRole = u.tipo || 'cliente';
                            const isActive = u.ativo !== false;

                            return (
                              <tr key={`config-user-${u.uid || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-primary/5 border border-primary/10 rounded-xl flex items-center justify-center font-bold text-xs text-primary uppercase shadow-sm">
                                      {userName.substring(0, 2)}
                                    </div>
                                    <div>
                                      <h5 className="font-bold text-xs text-primary">{userName}</h5>
                                      <p className="text-[10px] text-slate-400 font-semibold">{userEmail}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-5">
                                  <select 
                                    value={userRole}
                                    onChange={(e) => handleChangeUserRole(u.uid, e.target.value as any)}
                                    className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-primary focus:outline-none focus:border-accent cursor-pointer"
                                  >
                                    <option value="admin">Administrador</option>
                                    <option value="gerente">Gerente</option>
                                    <option value="barbeiro">Barbeiro</option>
                                    <option value="cliente">Cliente</option>
                                  </select>
                                </td>
                                <td className="p-5">
                                  <div className="flex items-center gap-4">
                                    <button 
                                      onClick={() => handleToggleUserActive(u.uid, isActive)}
                                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                    </button>
                                    <span className={`text-[9px] font-black uppercase tracking-wider ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                      {isActive ? 'Ativo' : 'Suspenso'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          
                          {filteredUsers.length === 0 && (
                            <tr>
                              <td colSpan={3} className="text-center py-12 text-slate-400 text-xs font-semibold">
                                Nenhum usuário coincide com a busca.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Plano e Faturamento */}
            {activeSection === 'billing' && (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-primary tracking-tight">Plano & Assinatura</h3>
                    <p className="text-xs text-muted font-semibold mt-1">Acompanhe seu ciclo de cobrança e faturamento BarberElite SaaS.</p>
                  </div>
                  <span className="bg-amber-500 text-white text-[10px] font-black tracking-widest uppercase px-4 py-2 rounded-2xl shadow-lg shadow-amber-500/20 animate-pulse">
                    Elite Premium
                  </span>
                </div>

                {/* Sub Card */}
                <div className="p-8 bg-gradient-to-r from-primary to-slate-800 rounded-[2rem] text-white space-y-6 shadow-xl shadow-primary/10">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Seu pacote atual</p>
                      <h4 className="text-3xl font-black mt-1">BarberElite SaaS Unlimited</h4>
                    </div>
                    <CreditCard size={32} className="text-accent" />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-white/10 text-xs">
                    <div>
                      <p className="font-semibold text-slate-400">Próxima Remessa</p>
                      <p className="font-extrabold text-base mt-1 text-white">20 de Junho, 2026</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-400">Investimento Mensal</p>
                      <p className="font-extrabold text-base mt-1 text-white">R$ 149,90</p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-400">Cartão Cadastrado</p>
                      <p className="font-extrabold text-base mt-1 text-white">Visa final 4812</p>
                    </div>
                  </div>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                  <PlanSelectorCard 
                    title="Bronze" 
                    price="R$ 49,90/mês" 
                    desc="Expedientes de até 3 profissionais" 
                    features={['Até 3 Barbeiros', 'Relatórios Básicos', 'Programa de Cashback']}
                    active={selectedPlan === 'bronze'}
                    onClick={() => setSelectedPlan('bronze')}
                  />
                  <PlanSelectorCard 
                    title="Silver" 
                    price="R$ 99,90/mês" 
                    desc="Expedientes de até 8 profissionais" 
                    features={['Até 8 Barbeiros', 'Relatórios Financeiros', 'WhatsApp API integrado']}
                    active={selectedPlan === 'silver'}
                    onClick={() => setSelectedPlan('silver')}
                  />
                  <PlanSelectorCard 
                    title="Elite" 
                    price="R$ 149,90/mês" 
                    desc="Tudo liberado para crescer sem travas" 
                    features={['Profissionais Ilimitados', 'IA de Insights Integrada', 'Backup Automático']}
                    active={selectedPlan === 'elite'}
                    onClick={() => setSelectedPlan('elite')}
                  />
                </div>
              </div>
            )}

            {/* Suporte e Ajuda */}
            {activeSection === 'support' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Central de Ajuda & Tickets</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Fale diretamente com nossa mesa técnica ou leia nossas resoluções rápidas.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* FAQs list */}
                  <div className="lg:col-span-6 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">Perguntas Frequentes</p>
                    <FaqItem q="Como cadastro novos profissionais?" r="Vá em Cadastros > Profissionais, clique em Adicionar e preencha o formulário." />
                    <FaqItem q="Como reabrir uma comanda fechada?" r="No painel Comandas > Histórico, selecione a comanda fechada e clique e reabrir." />
                    <FaqItem q="A taxa de comissão aceita percentuais personalizados por tipo de serviço?" r="Sim! No cadastro de cada serviço você pode associar taxas fixas ou customizadas." />
                  </div>

                  {/* Message form */}
                  <form onSubmit={handleSendTicket} className="lg:col-span-6 p-6 bg-slate-50/50 rounded-3xl border border-slate-100 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted flex items-center gap-2">
                      <Send size={12} className="text-accent" />
                      Falar com Suporte Online
                    </p>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Assunto do Chamado</label>
                      <input 
                        type="text" 
                        value={ticketSubject} 
                        onChange={(e) => setTicketSubject(e.target.value)}
                        placeholder="Ex: Dúvida fiscal ou instabilidade de conexões..." 
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-accent text-primary font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-wider text-slate-500">Sua Mensagem Detalhada</label>
                      <textarea 
                        rows={4}
                        value={ticketMsg} 
                        onChange={(e) => setTicketMsg(e.target.value)}
                        placeholder="Escreva aqui qual dificuldade você está enfrentando no momento..." 
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:border-accent text-primary font-bold resize-none"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-primary text-white py-3 rounded-xl font-bold text-xs hover:bg-slate-800 transition-all uppercase tracking-widest"
                    >
                      Entrar na Fila de Chamados
                    </button>
                  </form>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ConfigSidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-sm font-black transition-all group active:scale-[0.98] ${
        active 
          ? 'bg-primary text-white shadow-lg shadow-primary/10' 
          : 'text-muted hover:text-primary hover:bg-slate-50 border border-transparent hover:border-slate-100'
      }`}
    >
      <div className="flex items-center gap-4">
        <span className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-accent'} transition-colors`}>
          {icon}
        </span>
        <span className="uppercase tracking-widest text-[11px]">{label}</span>
      </div>
      <ChevronRight size={16} className={active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} />
    </button>
  );
}

function NotificationToggle({ title, desc, checked, onChange }: { title: string, desc: string, checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className="p-6 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-between gap-4">
      <div>
        <h4 className="text-sm font-bold text-primary">{title}</h4>
        <p className="text-xs text-muted max-w-md mt-1 font-medium">{desc}</p>
      </div>
      <button 
        type="button"
        onClick={() => onChange(!checked)} 
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-accent' : 'bg-slate-200'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function PlanSelectorCard({ title, price, desc, features, active, onClick }: { title: string, price: string, desc: string, features: string[], active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      className={`text-left p-6 rounded-[2rem] border transition-all flex flex-col justify-between h-full w-full active:scale-95 cursor-pointer hover:border-accent/40 ${active ? 'bg-white border-accent shadow-lg shadow-accent/5' : 'bg-slate-50/50 border-slate-100'}`}
    >
      <div>
        <div className="flex justify-between items-center w-full mb-3">
          <span className="text-xs font-black uppercase tracking-widest text-primary">{title}</span>
          {active && <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center"><Check size={12} strokeWidth={3} /></span>}
        </div>
        <h5 className="text-lg font-black text-primary">{price}</h5>
        <p className="text-[10px] text-muted font-bold mt-1 mb-4 leading-relaxed">{desc}</p>
        <div className="space-y-1">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function FaqItem({ q, r }: { q: string, r: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4 border border-slate-100/75 rounded-2xl bg-white shadow-sm">
      <button 
        type="button" 
        onClick={() => setOpen(!open)}
        className="w-full text-left font-bold text-xs text-primary flex items-center justify-between"
      >
        <span>{q}</span>
        <ChevronRight size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="text-[10px] text-zinc-500 mt-2 border-t border-slate-50 pt-2 font-medium leading-relaxed">{r}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
