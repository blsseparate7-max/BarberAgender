import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  User, 
  Bell, 
  Shield, 
  ShieldCheck,
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
  EyeOff,
  KeyRound,
  RefreshCw,
  Users,
  Search,
  Send,
  Trash2,
  Sparkles,
  Percent,
  Upload,
  Crop,
  Copy,
  ExternalLink,
  Calendar,
  Share2,
  MessageCircle,
  HelpCircle as QuestionIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { ImageCropModal } from '../components/ImageCropModal';
import { SaaSPaymentModal } from '../components/SaaSPaymentModal';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { settingsService, BarbershopProfile } from '../services/settingsService';
import { userService } from '../services/userService';
import { resetService } from '../services/resetService';
import { loyaltyService } from '../services/loyaltyService';
import { saasGatewayService, SaaSChargeResponse } from '../services/saasGatewayService';
import { tenantService, SaaSPlan } from '../services/tenantService';
import { permissionService, TenantPermissions, FunctionPermissions } from '../services/permissionService';
import { toast } from 'sonner';

export function Configuracoes({ activeSubTab }: { activeSubTab?: string }) {
  const { profile, signOut } = useAuth();
  const { tenant, updateTenantProfile } = useTenant();
  const [activeSection, setActiveSection] = useState(activeSubTab === 'configuracoes-perfil' ? 'user-profile' : 'profile');
  const [accentColor, setAccentColor] = useState(tenant?.accentColor || '#6366F1');
  const [logoUrl, setLogoUrl] = useState(tenant?.logoUrl || '');
  const [coverImage, setCoverImage] = useState(tenant?.coverImage || '');

  // Modal e Upload de Fotos (Logo e Capa/Fachada) JPEG
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const [cropTarget, setCropTarget] = useState<'logo' | 'cover'>('logo');
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação estrita para JPEG
    const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
    if (!isJpeg) {
      toast.error('Formato não suportado. Por favor, selecione apenas arquivos de imagem no formato JPEG/JPG.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setTempImageSrc(event.target.result as string);
        setCropTarget('logo');
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCoverFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
    if (!isJpeg) {
      toast.error('Formato não suportado. Por favor, selecione apenas arquivos de imagem no formato JPEG/JPG.');
      if (coverFileInputRef.current) coverFileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setTempImageSrc(event.target.result as string);
        setCropTarget('cover');
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    if (coverFileInputRef.current) coverFileInputRef.current.value = '';
  };

  const handleOpenCropExisting = () => {
    if (logoUrl) {
      setTempImageSrc(logoUrl);
      setCropTarget('logo');
      setIsCropModalOpen(true);
    }
  };

  const handleOpenCoverCropExisting = () => {
    if (coverImage) {
      setTempImageSrc(coverImage);
      setCropTarget('cover');
      setIsCropModalOpen(true);
    }
  };

  // Controlled address states
  const [street, setStreet] = useState(tenant?.address?.street || '');
  const [city, setCity] = useState(tenant?.address?.city || '');
  const [state, setState] = useState(tenant?.address?.state || '');
  const [zipCode, setZipCode] = useState(tenant?.address?.zipCode || '');

  // Agenda slot configurations
  const [slotInterval, setSlotInterval] = useState<number>(tenant?.slot_interval || 15);
  const [slotStrategy, setSlotStrategy] = useState<'fixed' | 'dynamic'>(tenant?.slot_calculation_strategy || 'fixed');

  // Personal profile states
  const [userProfileName, setUserProfileName] = useState(profile?.nome || '');
  const [userProfilePhone, setUserProfilePhone] = useState(profile?.telefone || profile?.phone || '');
  const [isSavingUserProfile, setIsSavingUserProfile] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  useEffect(() => {
    if (profile) {
      setUserProfileName(profile.nome || '');
      setUserProfilePhone(profile.telefone || profile.phone || '');
    }
  }, [profile]);

  useEffect(() => {
    if (tenant) {
      setAccentColor(tenant.accentColor || '#6366F1');
      setLogoUrl(tenant.logoUrl || '');
      setStreet(tenant.address?.street || '');
      setCity(tenant.address?.city || '');
      setState(tenant.address?.state || '');
      setZipCode(tenant.address?.zipCode || '');
      setSlotInterval(tenant.slot_interval || 15);
      setSlotStrategy(tenant.slot_calculation_strategy || 'fixed');

      const tPlan = (tenant as any).plan || tenant.planName || tenant.planId;
      if (tPlan) {
        setSelectedPlan(tenant.planId || tPlan.toLowerCase());
      }

      if (tenant.openingHours && tenant.openingHours.length > 0) {
        setHours(tenant.openingHours);
      }
    }
  }, [tenant]);

  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const dbPlans = await tenantService.listPlans();
        // Filtrar apenas planos ativos
        setPlans(dbPlans.filter(p => p.active !== false));
      } catch (err) {
        console.error('Erro ao buscar planos SaaS do admin:', err);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  // New modules states
  const [notifWeb, setNotifWeb] = useState(true);
  const [notifWpp, setNotifWpp] = useState(true);
  const [notifMail, setNotifMail] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('elite');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMsg, setTicketMsg] = useState('');

  // SaaS Payment Modal States
  const [showSaaSPaymentModal, setShowSaaSPaymentModal] = useState(false);
  const [saasChargeData, setSaasChargeData] = useState<SaaSChargeResponse | null>(null);
  const [generatingSaaSCharge, setGeneratingSaaSCharge] = useState(false);
  const [confirmingSaaSPayment, setConfirmingSaaSPayment] = useState(false);
  const [selectedPlanName, setSelectedPlanName] = useState('Elite');
  const [selectedPlanPrice, setSelectedPlanPrice] = useState(149.90);

  const handleGenerateSaaSCharge = (planName: string, price: number) => {
    // Check if tenant plan is active and not yet due for renewal
    const expirationDateStr = tenant?.planExpiresAt || tenant?.planValidUntil;
    if (tenant?.planStatus === 'active' && expirationDateStr) {
      const expDate = new Date(expirationDateStr + 'T23:59:59');
      const today = new Date();
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        const formattedExp = expirationDateStr.split('-').reverse().join('/');
        toast.info(
          `Sua assinatura Rull está ativa até ${formattedExp} (${diffDays} dia${diffDays > 1 ? 's' : ''} restante${diffDays > 1 ? 's' : ''}). A renovação estará disponível no dia do vencimento!`,
          { duration: 5000 }
        );
        return;
      }
    }

    setSelectedPlanName(planName);
    setSelectedPlanPrice(price);
    setShowSaaSPaymentModal(true);
  };

  const handleConfirmSaaSPayment = async () => {
    try {
      setConfirmingSaaSPayment(true);
      await saasGatewayService.confirmSaaSPlanPayment(
        tenant?.id || 'barbearia',
        selectedPlanName,
        selectedPlanPrice,
        1
      );
      toast.success(`Plano ${selectedPlanName} ativado com sucesso para sua barbearia!`);
      setShowSaaSPaymentModal(false);
      if (updateTenantProfile) {
        await updateTenantProfile({ plan: selectedPlanName, planStatus: 'active' });
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao confirmar renovação do plano.');
    } finally {
      setConfirmingSaaSPayment(false);
    }
  };

  // Business / rules states
  const [loyaltyConfigId, setLoyaltyConfigId] = useState<string>('');
  const [loyaltyMode, setLoyaltyMode] = useState<'saldo' | 'pontos'>('saldo');
  const [minRedemptionValue, setMinRedemptionValue] = useState('10');
  const [cashbackEnabled, setCashbackEnabled] = useState(false);
  const [cashbackType, setCashbackType] = useState<'percentual' | 'fixo'>('percentual');
  const [cashbackFixedValue, setCashbackFixedValue] = useState('5');
  const [pointsRate, setPointsRate] = useState('1');
  const [cashbackPct, setCashbackPct] = useState('5');
  const [minRedemptionPoints, setMinRedemptionPoints] = useState('100');
  const [vipThreshold, setVipThreshold] = useState('1000');
  const [pointsAppointment, setPointsAppointment] = useState('10');
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

  // Permissions state
  const [securitySubTab, setSecuritySubTab] = useState<'members' | 'permissions'>('members');
  const [tenantPermissions, setTenantPermissions] = useState<TenantPermissions | null>(null);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const fetchPermissions = async () => {
    setLoadingPermissions(true);
    try {
      const perms = await permissionService.getPermissions();
      setTenantPermissions(perms);
    } catch (err) {
      console.error("Erro ao carregar permissões:", err);
      toast.error("Erro ao carregar permissões por cargo.");
    } finally {
      setLoadingPermissions(false);
    }
  };

  const handleTogglePermission = (role: 'gerente' | 'barbeiro', key: keyof FunctionPermissions) => {
    if (!tenantPermissions) return;
    setTenantPermissions(prev => {
      if (!prev) return null;
      return {
        ...prev,
        [role]: {
          ...prev[role],
          [key]: !prev[role][key]
        }
      };
    });
  };

  const handleSavePermissions = async () => {
    if (!tenantPermissions) return;
    setSavingPermissions(true);
    try {
      await permissionService.savePermissions({
        tenantId: tenantPermissions.tenantId,
        gerente: tenantPermissions.gerente,
        barbeiro: tenantPermissions.barbeiro
      });
      toast.success("Permissões de cargos salvas com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar permissões:", err);
      toast.error("Erro ao salvar configurações de permissões.");
    } finally {
      setSavingPermissions(false);
    }
  };

  useEffect(() => {
    if (activeSubTab) {
      if (activeSubTab === 'configuracoes-parametros') setActiveSection('business');
      else if (activeSubTab === 'configuracoes-rodizio') setActiveSection('rules');
      else if (activeSubTab === 'configuracoes-funcionamento') setActiveSection('hours');
      else if (activeSubTab === 'configuracoes-permissoes') setActiveSection('security');
      else if (activeSubTab === 'admin-usuarios') setActiveSection('security');
      else if (activeSubTab === 'configuracoes-perfil') setActiveSection('user-profile');
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
      fetchPermissions();
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
    if (uid === profile?.uid && currentStatus === true) {
      toast.error("Por segurança, você não pode desativar seu próprio acesso.");
      return;
    }
    const currentAdmins = users.filter(u => u.tipo === 'admin' && u.ativo !== false);
    const targetUser = users.find(u => u.uid === uid);
    if (targetUser?.tipo === 'admin' && currentStatus === true && currentAdmins.length <= 1) {
      toast.error("Operação bloqueada: Não é possível desativar o único Administrador ativo do sistema.");
      return;
    }
    try {
      await userService.updateUserProfile(uid, { ativo: !currentStatus });
      toast.success("Status do usuário atualizado!");
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ativo: !currentStatus } : u));
    } catch (err) {
      toast.error("Erro ao atualizar status");
    }
  };

  const handleChangeUserRole = async (uid: string, newRole: any) => {
    if (uid === profile?.uid) {
      toast.error("Por segurança, você não pode alterar o cargo do seu próprio usuário enquanto está conectado.");
      return;
    }
    const currentAdmins = users.filter(u => u.tipo === 'admin' && u.ativo !== false);
    const targetUser = users.find(u => u.uid === uid);
    if (targetUser?.tipo === 'admin' && newRole !== 'admin' && currentAdmins.length <= 1) {
      toast.error("Operação bloqueada: A barbearia precisa ter pelo menos 1 Administrador ativo.");
      return;
    }
    try {
      await userService.updateUserProfile(uid, { tipo: newRole });
      toast.success("Cargo de acesso atualizado com sucesso!");
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, tipo: newRole } : u));
    } catch (err) {
      toast.error("Erro ao atualizar cargo de acesso");
    }
  };

  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;
    if (!userProfileName.trim()) {
      toast.error("Por favor, preencha o seu nome.");
      return;
    }
    setIsSavingUserProfile(true);
    try {
      await userService.updateUserProfile(profile.uid, {
        nome: userProfileName,
        telefone: userProfilePhone,
        phone: userProfilePhone
      });
      toast.success("Seu perfil pessoal foi atualizado com sucesso!");
    } catch (error) {
      console.error("Error saving user profile:", error);
      toast.error("Erro ao salvar dados do perfil.");
    } finally {
      setIsSavingUserProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('A confirmação da nova senha não confere com a nova senha.');
      return;
    }
    if (!currentPassword) {
      toast.error('Por favor, informe sua senha atual para autorizar a alteração.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      toast.error('Usuário não autenticado no Firebase Auth.');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Reautenticação do usuário para segurança
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Atualização da senha no Firebase Auth
      await updatePassword(currentUser, newPassword);

      toast.success('Sua senha foi alterada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('A senha atual informada está incorreta.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('A nova senha é muito fraca. Escolha uma senha mais forte (mínimo 6 caracteres).');
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Por segurança, faça login novamente no sistema e tente alterar sua senha.');
      } else {
        toast.error(error.message || 'Erro ao alterar senha. Verifique os dados e tente novamente.');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    const userEmail = auth.currentUser?.email || profile?.email;
    if (!userEmail) {
      toast.error('E-mail do usuário não localizado.');
      return;
    }

    setIsSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(auth, userEmail);
      toast.success(`E-mail de redefinição de senha enviado para ${userEmail}. Verifique sua caixa de entrada!`);
    } catch (error: any) {
      console.error('Erro ao enviar e-mail de redefinição:', error);
      toast.error('Não foi possível enviar o e-mail de redefinição. Tente novamente.');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const loadSettings = async () => {
    setLoadingProfile(true);
    try {
      if (tenant) {
        setAccentColor(tenant.accentColor || '#6366F1');
        setLogoUrl(tenant.logoUrl || '');
        setCoverImage(tenant.coverImage || '');
      }
      try {
        const config = await loyaltyService.getConfig();
        if (config) {
          setLoyaltyConfigId(config.id);
          setLoyaltyMode(config.loyaltyMode || 'saldo');
          setMinRedemptionValue(String(config.minRedemptionValue ?? 10));
          setCashbackEnabled(config.cashbackEnabled ?? false);
          setCashbackType(config.cashbackType || 'percentual');
          setCashbackFixedValue(String(config.cashbackFixedValue ?? 5));
          setPointsRate(String(config.pointsPerReal ?? 1));
          setCashbackPct(String(config.cashbackPercentage ?? 5));
          setMinRedemptionPoints(String(config.minRedemptionPoints ?? 100));
          setVipThreshold(String(config.vipThreshold ?? 1000));
          setPointsAppointment(String(config.pointsPerAppointment ?? 10));
        }
      } catch (err) {
        console.warn("Could not load loyalty config:", err);
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
      accentColor,
      logoUrl,
      instagram: formData.get('instagram') as string,
      facebook: formData.get('facebook') as string,
      whatsapp: formData.get('whatsapp') as string,
      aboutText: formData.get('aboutText') as string,
      coverImage,
      address: {
        street: formData.get('street') as string,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        zipCode: formData.get('zipCode') as string,
      }
    };

    try {
      await updateTenantProfile(data);
    } catch (error) {
      console.error("Error saving profile:", error);
    }
  });

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Preferências de notificações aplicadas com sucesso!");
  };

  const handleSaveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (loyaltyConfigId) {
        await loyaltyService.updateConfig(loyaltyConfigId, {
          loyaltyMode,
          minRedemptionValue: Number(minRedemptionValue) || 0,
          cashbackEnabled,
          cashbackType,
          cashbackFixedValue: Number(cashbackFixedValue) || 0,
          pointsPerReal: Number(pointsRate) || 0,
          pointsPerAppointment: Number(pointsAppointment) || 0,
          cashbackPercentage: Number(cashbackPct) || 0,
          minRedemptionPoints: Number(minRedemptionPoints) || 0,
          vipThreshold: Number(vipThreshold) || 0,
        });
        toast.success("Configurações do Programa de Fidelidade salvas com sucesso!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar configurações de fidelidade.");
    }
  };

  const [isSavingAgendaSlots, setIsSavingAgendaSlots] = useState(false);

  const handleSaveAgendaSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAgendaSlots(true);
    try {
      await updateTenantProfile({
        slot_interval: Number(slotInterval),
        slot_calculation_strategy: slotStrategy,
      });
      toast.success("Configuração de visualização da agenda salva com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar configuração da agenda.");
    } finally {
      setIsSavingAgendaSlots(false);
    }
  };

  const handleSaveRules = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Regras estratégicas de rodízio atualizadas!");
  };

  const handleSaveHours = async () => {
    try {
      await updateTenantProfile({
        openingHours: hours
      });
      toast.success("Grade horária de atendimento salva com sucesso!");
    } catch (err: any) {
      console.error("Erro ao salvar horários:", err);
      toast.error("Erro ao salvar horário de funcionamento.");
    }
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

  // Filter users lists based on search (excluding clients, managed in Clientes tab)
  const filteredUsers = users.filter(u => {
    const role = u.tipo || 'cliente';
    if (role === 'cliente') return false;

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
            icon={<User size={18} />} 
            label="Meu Perfil" 
            active={activeSection === 'user-profile'} 
            onClick={() => setActiveSection('user-profile')}
          />
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
            label="Customizar Agenda" 
            active={activeSection === 'agenda_slots'} 
            onClick={() => setActiveSection('agenda_slots')}
          />
          <ConfigSidebarItem 
            icon={<Sliders size={18} />} 
            label="Regras de Rodízio" 
            active={activeSection === 'rules'} 
            onClick={() => setActiveSection('rules')}
          />
          <ConfigSidebarItem 
            icon={<Database size={18} />} 
            label="Fidelidade" 
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
            {/* Meu Perfil Pessoal */}
            {activeSection === 'user-profile' && (
              <form onSubmit={handleSaveUserProfile} className="space-y-8">
                <section className="space-y-8">
                  <div className="flex flex-col sm:flex-row items-center gap-8 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="w-20 h-20 bg-primary rounded-[2rem] flex items-center justify-center font-black text-white text-3xl shadow-xl shadow-primary/20 shrink-0">
                      {profile?.nome?.charAt(0) || 'U'}
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-primary tracking-tight">Seu Perfil de Acesso</h3>
                      <p className="text-xs text-muted font-bold uppercase tracking-wider bg-slate-200/50 px-2.5 py-1 rounded-lg inline-block">{profile?.tipo || 'Usuário'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Seu Nome Completo</label>
                      <input 
                        type="text" 
                        value={userProfileName}
                        onChange={(e) => setUserProfileName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                      <input 
                        type="text" 
                        value={userProfilePhone}
                        onChange={(e) => setUserProfilePhone(e.target.value)}
                        placeholder="(11) 99999-9999"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-mail de Login</label>
                      <input 
                        type="email" 
                        value={profile?.email || ''} 
                        disabled
                        className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold text-slate-500 cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Status da Conta</label>
                      <div className="w-full bg-slate-100 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold text-emerald-600 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Conta Ativa e Sincronizada
                      </div>
                    </div>
                  </div>

                  {/* If client/fidelidade details exist */}
                  {(profile?.saldo_atual !== undefined || (profile as any)?.pontos !== undefined) && (
                    <div className="p-6 bg-amber-50/50 rounded-3xl border border-amber-100/60 grid grid-cols-2 gap-6 mt-6">
                      {profile?.saldo_atual !== undefined && (
                        <div>
                          <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest">Saldo de Cashback / Crédito</p>
                          <p className="text-xl font-black text-amber-700 mt-1">R$ {profile.saldo_atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {(profile as any)?.pontos !== undefined && (
                        <div>
                          <p className="text-[9px] font-black text-amber-800 uppercase tracking-widest">Seus Pontos de Fidelidade</p>
                          <p className="text-xl font-black text-amber-700 mt-1">{(profile as any).pontos} pts</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Links de Agendamento Online da Barbearia */}
                  {(() => {
                    const tenantSlug = tenant?.id || profile?.tenantId || 'gbcortes7';
                    const bookingUrl = `${window.location.origin}/?tenant=${tenantSlug}&agendar=true`;
                    const registerUrl = `${window.location.origin}/register?tenant=${tenantSlug}`;
                    const whatsappMessage = encodeURIComponent(
                      `Olá! Agende seu horário na ${tenant?.name || 'nossa barbearia'} de forma rápida e prática acessando o link:\n${bookingUrl}`
                    );

                    return (
                      <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-950 to-primary text-white rounded-3xl border border-slate-800 shadow-xl space-y-5 mt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/30 shrink-0">
                              <Calendar size={20} />
                            </div>
                            <div>
                              <h4 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                                🔗 Link de Agendamento Online para Clientes
                              </h4>
                              <p className="text-xs text-slate-400 font-medium">
                                Compartilhe este link com seus clientes para que eles agendem horários diretamente.
                              </p>
                            </div>
                          </div>
                          <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0 self-start sm:self-auto">
                            🟢 Ativo para Agendamentos
                          </span>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                              <span>Link Direto da Agenda (Agendamento Rápido)</span>
                            </label>
                            <div className="flex flex-col sm:flex-row items-stretch gap-2">
                              <input 
                                type="text" 
                                readOnly 
                                value={bookingUrl}
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl py-3 px-4 text-xs font-mono font-bold text-amber-400 select-all shadow-inner focus:outline-none"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(bookingUrl);
                                    toast.success('Link de agendamento copiado com sucesso!');
                                  }}
                                  className="flex-1 sm:flex-none px-4 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-amber-500/20"
                                >
                                  <Copy size={15} />
                                  <span>Copiar</span>
                                </button>
                                <a
                                  href={`https://wa.me/?text=${whatsappMessage}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-600/20"
                                  title="Enviar pelo WhatsApp"
                                >
                                  <MessageCircle size={15} />
                                  <span className="hidden sm:inline">WhatsApp</span>
                                </a>
                                <a
                                  href={bookingUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl flex items-center justify-center transition active:scale-95"
                                  title="Abrir e testar agendamento"
                                >
                                  <ExternalLink size={15} />
                                </a>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              Link de Cadastro e Fidelidade do Cliente
                            </label>
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                readOnly 
                                value={registerUrl}
                                className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl py-2.5 px-4 text-xs font-mono text-slate-300 select-all shadow-inner focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(registerUrl);
                                  toast.success('Link de cadastro copiado!');
                                }}
                                className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-2xl flex items-center gap-1.5 transition active:scale-95"
                              >
                                <Copy size={14} />
                                <span>Copiar</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Seção de Segurança e Alteração de Senha */}
                  <div className="p-6 md:p-8 bg-slate-50 border border-slate-200/80 rounded-3xl space-y-6 mt-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 bg-primary text-amber-400 rounded-2xl flex items-center justify-center shadow-md shadow-primary/10 shrink-0">
                          <KeyRound size={22} />
                        </div>
                        <div>
                          <h4 className="text-base font-black text-primary tracking-tight flex items-center gap-2">
                            Segurança e Alteração de Senha
                          </h4>
                          <p className="text-xs text-muted font-medium">
                            Altere a senha de acesso da sua conta com reautenticação segura.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSendResetEmail}
                        disabled={isSendingResetEmail}
                        className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-2xl text-xs font-bold shadow-sm flex items-center gap-2 transition active:scale-95 shrink-0 self-start sm:self-auto disabled:opacity-50"
                      >
                        {isSendingResetEmail ? <Loader2 className="animate-spin" size={14} /> : <Mail size={14} className="text-amber-500" />}
                        <span>Enviar Link por E-mail</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Senha Atual</label>
                        <div className="relative">
                          <input 
                            type={showCurrentPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pr-12 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nova Senha (min. 6 carac.)</label>
                        <div className="relative">
                          <input 
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pr-12 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Confirmar Nova Senha</label>
                        <div className="relative">
                          <input 
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pr-12 pl-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleChangePassword}
                        disabled={isChangingPassword || !currentPassword || !newPassword}
                        className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-2xl flex items-center gap-2 transition active:scale-95 shadow-md shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isChangingPassword ? <Loader2 className="animate-spin" size={16} /> : <Lock size={16} />}
                        <span>Atualizar Minha Senha</span>
                      </button>
                    </div>
                  </div>
                </section>

                <div className="flex justify-end gap-4 pt-10 border-t border-slate-100">
                  <button 
                    type="submit" 
                    disabled={isSavingUserProfile}
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center gap-3 active:scale-95 uppercase tracking-widest disabled:opacity-50"
                  >
                    {isSavingUserProfile ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Salvar Perfil Pessoal
                  </button>
                </div>
              </form>
            )}

            {/* Perfil da Barbearia */}
            {activeSection === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-8">
                <section className="space-y-8">
                  <div className="flex flex-col md:flex-row items-center gap-8 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                    <div className="relative group shrink-0">
                      <div className="w-28 h-28 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden shadow-sm relative">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-slate-400">
                            <Camera size={28} />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem Logo</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3 flex-1 w-full text-center md:text-left">
                      <div>
                        <h3 className="text-xl font-black text-primary tracking-tight">Logo da Unidade (Foto JPEG)</h3>
                        <p className="text-xs text-muted font-medium mt-1 max-w-lg leading-relaxed">
                          Selecione a foto da logo de sua barbearia no formato <strong>JPEG (.jpg)</strong>. O sistema permite recortar, girar e redimensionar no tamanho essencial (300x300px), exibindo-a instantaneamente no topo do menu lateral e na landing page.
                        </p>
                      </div>

                      <input 
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/jpg,.jpg,.jpeg"
                        onChange={handleLogoFileSelect}
                        className="hidden"
                      />

                      <div className="flex flex-wrap items-center gap-3 pt-1 justify-center md:justify-start">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-5 py-2.5 bg-primary hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md shadow-primary/10 flex items-center gap-2 transition active:scale-95"
                        >
                          <Upload size={16} className="text-amber-400" />
                          {logoUrl ? 'Trocar Foto JPEG' : 'Enviar Foto JPEG'}
                        </button>

                        {logoUrl && (
                          <>
                            <button
                              type="button"
                              onClick={handleOpenCropExisting}
                              className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-2xl text-xs font-bold shadow-sm flex items-center gap-2 transition active:scale-95"
                            >
                              <Crop size={16} className="text-amber-500" />
                              Ajustar/Recortar Foto
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setLogoUrl('');
                                toast.info('Foto da logo removida.');
                              }}
                              className="px-3.5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                            >
                              <Trash2 size={15} />
                              Remover
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Brand Color Customizer (The coolest SaaS feature) */}
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                    <div>
                      <h4 className="text-sm font-bold text-primary">Paleta de Cores & Destaque Visual</h4>
                      <p className="text-xs text-muted mt-1">Selecione a cor de identidade de sua barbearia. Todo o sistema se adaptará instantaneamente a este tom!</p>
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
                      {[
                        { name: 'Indigo', value: '#6366F1' },
                        { name: 'Ouro', value: '#D4AF37' },
                        { name: 'Esmeralda', value: '#10B981' },
                        { name: 'Azul Safira', value: '#3B82F6' },
                        { name: 'Cereja', value: '#EF4444' },
                        { name: 'Carbono', value: '#1E293B' },
                        { name: 'Bronze', value: '#B45309' },
                        { name: 'Púrpura', value: '#8B5CF6' },
                        { name: 'Laranja', value: '#F97316' },
                        { name: 'Rosa Coral', value: '#F43F5E' },
                      ].map((preset) => {
                        const isSelected = accentColor.toUpperCase() === preset.value.toUpperCase();
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => setAccentColor(preset.value)}
                            title={preset.name}
                            style={{ backgroundColor: preset.value }}
                            className="w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-all hover:scale-110 relative"
                          >
                            {isSelected && (
                              <Check size={14} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-muted uppercase tracking-wider">Código Hexadecimal Personalizado</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="w-10 h-10 border-0 rounded-xl cursor-pointer shadow-sm bg-transparent"
                          />
                          <input 
                            type="text" 
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono font-bold w-24 uppercase focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex-1 rounded-2xl bg-white border border-slate-100 p-4 flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full animate-ping" style={{ backgroundColor: accentColor }}></div>
                        <span className="text-xs font-semibold text-primary">Demonstração ao Vivo do seu Visual Premium!</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Nome da Barbearia</label>
                      <input 
                        name="name"
                        type="text" 
                        defaultValue={tenant?.name || "BarberElite Headquarters"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">E-mail de Contato</label>
                      <input 
                        name="email"
                        type="email" 
                        defaultValue={tenant?.email || "contato@barberelite.com"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Telefone</label>
                      <input 
                        name="phone"
                        type="text" 
                        defaultValue={tenant?.phone || "(11) 99999-8888"} 
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1 flex items-center gap-1.5">
                        <Lock size={12} className="text-amber-500" /> Documento Oficial (CPF / CNPJ)
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={tenant?.cnpjCpf || tenant?.asaas?.cpfCnpj || (tenant as any)?.cnpj || 'Não cadastrado'} 
                          disabled
                          readOnly
                          className="w-full bg-slate-100 border border-slate-200/80 rounded-2xl py-4 px-5 pr-10 text-sm font-black text-slate-600 cursor-not-allowed select-none shadow-inner"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-500 bg-amber-50 p-1.5 rounded-lg border border-amber-200/60">
                          <Lock size={14} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card de Proteção de Integridade da Conta Digital Asaas */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white p-6 rounded-3xl border border-slate-800 shadow-lg space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center border border-indigo-500/30 shrink-0">
                          <ShieldCheck size={20} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black tracking-tight text-white flex items-center gap-2">
                            Conta Digital Asaas & Titularidade
                          </h4>
                          <p className="text-[11px] text-slate-400 font-medium">
                            Integração bancária nativa para recebimento de mensalidades e assinaturas
                          </p>
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                        tenant?.asaas?.subaccountId 
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                      }`}>
                        {tenant?.asaas?.subaccountId ? '🟢 Conta Digital Ativa' : '🟡 Vinculado ao Master'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                      <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-1">
                        <span className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-widest block">ID da Subconta Asaas</span>
                        <span className="text-white font-black">{tenant?.asaas?.subaccountId || 'Pendente de homologação'}</span>
                      </div>
                      <div className="p-3.5 bg-slate-900/80 rounded-2xl border border-slate-800 space-y-1">
                        <span className="text-[9px] font-sans font-black text-slate-400 uppercase tracking-widest block">Status do Cadastro Banco</span>
                        <span className="text-emerald-400 font-black uppercase">{tenant?.asaas?.accountStatus || 'APROVADO E ATIVO'}</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-900/40 border border-amber-500/20 rounded-2xl flex items-start gap-3">
                      <Lock size={16} className="text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-sans text-slate-300 font-medium leading-relaxed">
                        <strong className="text-white">🔒 Proteção de Segurança Financeira:</strong> Os dados da subconta e o documento de titularidade (CPF/CNPJ) são <strong>protegidos contra edições locais</strong> para evitar desconciliação bancária, desativação de chaves de API ou desvios de recebíveis. Alterações cadastrais só podem ser realizadas através da Central Master SaaS.
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-8 mt-8 space-y-6">
                    <div>
                      <h4 className="text-sm font-bold text-primary">Apresentação & Portfólio (Landing Page do Cliente)</h4>
                      <p className="text-xs text-muted mt-1">Insira informações adicionais para criar uma mini landing page personalizada onde os clientes conhecem sua barbearia antes de agendar.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Sobre a Barbearia (Breve Descrição)</label>
                        <textarea 
                          name="aboutText"
                          defaultValue={tenant?.aboutText || ""}
                          placeholder="Ex: Fundada em 2018, nossa barbearia combina o estilo clássico com as técnicas mais modernas..."
                          rows={3}
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner resize-none"
                        />
                      </div>

                      <div className="space-y-3 md:col-span-2 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <div className="flex flex-col md:flex-row items-center gap-6">
                          <div className="relative group shrink-0">
                            <div className="w-48 h-28 bg-white rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden shadow-sm relative">
                              {coverImage ? (
                                <img src={coverImage} alt="Capa da Fachada" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                  <Camera size={24} />
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sem Capa</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-3 flex-1 w-full text-center md:text-left">
                            <div>
                              <h4 className="text-base font-black text-primary tracking-tight">Foto da Capa / Fachada (Portfólio)</h4>
                              <p className="text-xs text-muted font-medium mt-1 leading-relaxed">
                                Selecione uma foto da fachada ou ambiente da sua barbearia no formato <strong>JPEG (.jpg)</strong>. Você poderá recortar e ajustar no formato banner/fachada (1200x600px), exibindo-a com elegância no topo do Portal do Cliente.
                              </p>
                            </div>

                            <input 
                              type="file"
                              ref={coverFileInputRef}
                              accept="image/jpeg,image/jpg,.jpg,.jpeg"
                              onChange={handleCoverFileSelect}
                              className="hidden"
                            />

                            <div className="flex flex-wrap items-center gap-3 pt-1 justify-center md:justify-start">
                              <button
                                type="button"
                                onClick={() => coverFileInputRef.current?.click()}
                                className="px-5 py-2.5 bg-primary hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-md shadow-primary/10 flex items-center gap-2 transition active:scale-95"
                              >
                                <Upload size={16} className="text-amber-400" />
                                {coverImage ? 'Trocar Foto da Capa' : 'Enviar Foto da Capa (JPEG)'}
                              </button>

                              {coverImage && (
                                <>
                                  <button
                                    type="button"
                                    onClick={handleOpenCoverCropExisting}
                                    className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-2xl text-xs font-bold shadow-sm flex items-center gap-2 transition active:scale-95"
                                  >
                                    <Crop size={16} className="text-amber-500" />
                                    Ajustar/Recortar Capa
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCoverImage('');
                                      toast.success('Foto da capa/fachada removida.');
                                    }}
                                    className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl text-xs font-bold transition active:scale-95"
                                  >
                                    Remover Capa
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">WhatsApp para Atendimento (Ex: 11999998888)</label>
                        <input 
                          name="whatsapp"
                          type="text"
                          defaultValue={tenant?.whatsapp || ""}
                          placeholder="Somente números com DDD"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Link do Instagram (Completo)</label>
                        <input 
                          name="instagram"
                          type="text"
                          defaultValue={tenant?.instagram || ""}
                          placeholder="https://instagram.com/seu_perfil"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Link do Facebook (Completo)</label>
                        <input 
                          name="facebook"
                          type="text"
                          defaultValue={tenant?.facebook || ""}
                          placeholder="https://facebook.com/sua_pagina"
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
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
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Cidade</label>
                        <input 
                          name="city"
                          type="text" 
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Estado</label>
                        <input 
                          name="state"
                          type="text" 
                          value={state}
                          onChange={(e) => setState(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">CEP</label>
                        <input 
                          name="zipCode"
                          type="text" 
                          value={zipCode}
                          onChange={(e) => setZipCode(e.target.value)}
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

            {/* Customizar Agenda (Geração de Horários Livres) */}
            {activeSection === 'agenda_slots' && (
              <form onSubmit={handleSaveAgendaSlots} className="space-y-8 animate-fadeIn">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Customização da Agenda</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Configure o intervalo entre as vagas e a estratégia de cálculo dos horários livres exibidos aos clientes.</p>
                </div>

                <div className="space-y-6">
                  {/* Estratégia de Cálculo */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Estratégia de Exibição dos Horários Livres</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setSlotStrategy('fixed')}
                        className={`p-6 rounded-3xl border-2 text-left transition-all flex flex-col justify-between gap-3 ${
                          slotStrategy === 'fixed'
                            ? 'bg-indigo-50/40 border-indigo-500 shadow-sm ring-4 ring-indigo-500/10'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">🗓️</span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            slotStrategy === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {slotStrategy === 'fixed' ? 'Ativo' : 'Selecionar'}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-800">Grade de Horários Fixa</h4>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                            Exibe horários livres de forma padronizada em intervalos fixos (ex: a cada 15, 30 ou 60 minutos), 
                            independentemente da duração do serviço.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSlotStrategy('dynamic')}
                        className={`p-6 rounded-3xl border-2 text-left transition-all flex flex-col justify-between gap-3 ${
                          slotStrategy === 'dynamic'
                            ? 'bg-indigo-50/40 border-indigo-500 shadow-sm ring-4 ring-indigo-500/10'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">⚡</span>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                            slotStrategy === 'dynamic' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {slotStrategy === 'dynamic' ? 'Ativo' : 'Selecionar'}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-slate-800">Grade Dinâmica por Serviço</h4>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                            Calcula os horários livres sequencialmente a partir do tempo de duração do serviço escolhido. 
                            Minimiza lacunas na agenda e maximiza a produtividade do profissional.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Intervalo de Tempo (Apenas se estratégia for fixed) */}
                  {slotStrategy === 'fixed' && (
                    <div className="space-y-3 p-6 bg-slate-50 border border-slate-150 rounded-3xl animate-fadeIn">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Tamanho do Intervalo (Intervalo das Vagas)</label>
                      <select
                        value={slotInterval}
                        onChange={(e) => setSlotInterval(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-xs cursor-pointer"
                      >
                        <option value={10}>Cada 10 minutos (Altíssima densidade)</option>
                        <option value={15}>Cada 15 minutos (Padrão de mercado)</option>
                        <option value={20}>Cada 20 minutos</option>
                        <option value={30}>Cada 30 minutos (Recomendado para serviços rápidos)</option>
                        <option value={40}>Cada 40 minutos</option>
                        <option value={45}>Cada 45 minutos</option>
                        <option value={60}>Cada 60 minutos / 1 hora (Ideal para cortes complexos ou barba e cabelo)</option>
                      </select>
                      <p className="text-[10px] text-muted ml-1 leading-relaxed font-semibold">
                        Define os incrementos de tempo exibidos. Ex: Com intervalo de 30 minutos, o cliente poderá escolher 09:00, 09:30, 10:00, etc.
                      </p>
                    </div>
                  )}

                  {slotStrategy === 'dynamic' && (
                    <div className="p-6 bg-indigo-50/50 border border-indigo-100 rounded-3xl animate-fadeIn text-xs text-indigo-900 leading-relaxed space-y-2">
                      <p className="font-black uppercase tracking-wider text-[10px] text-indigo-850">ℹ️ Como funciona a grade dinâmica?</p>
                      <p className="font-semibold text-indigo-700/90">
                        O sistema calculará as opções de horários livres considerando que um novo agendamento pode começar exatamente 
                        após o término de outro agendamento, ou a cada intervalo mínimo padrão de 15 minutos, adaptando-se em tempo real 
                        à duração do serviço solicitado.
                      </p>
                      <p className="font-bold text-indigo-800">
                        Isso impede atrasos, ajusta a duração baseando-se no tempo de cada profissional para o serviço, e evita "buracos" ineficientes na agenda.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-6 border-t border-slate-100">
                  <button 
                    type="submit"
                    disabled={isSavingAgendaSlots}
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3 disabled:opacity-50"
                  >
                    {isSavingAgendaSlots ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Salvar Configurações da Agenda
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
                    <div key={h.day} className="flex flex-col p-6 bg-slate-50/50 border-b border-slate-100 last:border-0 gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                            !h.open 
                              ? 'bg-red-50 text-red-600 border-red-100' 
                              : (h as any).isWalkInOnly 
                                ? 'bg-amber-50 text-amber-600 border-amber-100' 
                                : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          }`}>
                            {!h.open ? 'Fechada' : (h as any).isWalkInOnly ? 'Ordem de Chegada' : 'Agendamento'}
                          </span>
                        </div>
                        
                        {h.open && (
                          <div className="flex flex-wrap items-center gap-4">
                            {/* Seletor de Tipo */}
                            <div className="flex items-center gap-2 bg-white border border-slate-100 p-1 rounded-xl">
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...hours];
                                  (updated[i] as any).isWalkInOnly = false;
                                  setHours(updated);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                  !(h as any).isWalkInOnly 
                                    ? 'bg-primary text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-primary'
                                }`}
                              >
                                Agendamento
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...hours];
                                  (updated[i] as any).isWalkInOnly = true;
                                  setHours(updated);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                  (h as any).isWalkInOnly 
                                    ? 'bg-amber-500 text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-amber-500'
                                }`}
                              >
                                Fila / Ordem
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
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
                          </div>
                        )}
                      </div>

                      {h.open && (h as any).isWalkInOnly && (
                        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                          <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider block">Mensagem informativa para o cliente</label>
                          <input 
                            type="text"
                            placeholder="Ex: Hoje atendemos apenas por ordem de chegada. Venha nos visitar!"
                            value={(h as any).walkInMessage || ''}
                            onChange={(e) => {
                              const updated = [...hours];
                              (updated[i] as any).walkInMessage = e.target.value;
                              setHours(updated);
                            }}
                            className="w-full bg-white border border-amber-150 rounded-xl py-2.5 px-4 text-xs font-bold text-primary placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
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

            {/* Fidelidade (Business) */}
            {activeSection === 'business' && (
              <form onSubmit={handleSaveBusinessSettings} className="space-y-8">
                <div>
                  <h3 className="text-xl font-black text-primary tracking-tight">Programa de Fidelidade</h3>
                  <p className="text-xs text-muted font-semibold mt-1">Configure as regras de pontuação ou cashback (saldo em R$) que serão refletidas diretamente no Portal do Cliente.</p>
                </div>

                <div className="bg-slate-50/80 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-primary">Ativar Programa de Fidelidade</h4>
                      <p className="text-xs text-muted">Quando ativado, os clientes acumulam benefícios e visualizam a aba de fidelidade no portal.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={cashbackEnabled} 
                        onChange={(e) => setCashbackEnabled(e.target.checked)}
                        className="sr-only peer" 
                      />
                      <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                </div>

                {cashbackEnabled && (
                  <div className="space-y-6 animate-fadeIn">
                    {/* Modo do Programa: Saldo vs Pontos */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Critério do Programa de Fidelidade</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                          type="button"
                          onClick={() => setLoyaltyMode('saldo')}
                          className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-3 ${
                            loyaltyMode === 'saldo'
                              ? 'bg-amber-50/50 border-amber-500 shadow-sm ring-2 ring-amber-500/20'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-2xl">💰</span>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                              loyaltyMode === 'saldo' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {loyaltyMode === 'saldo' ? 'Modo Ativo' : 'Selecionar'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-800">Por Saldo (Cashback em R$)</h4>
                            <p className="text-xs text-muted mt-1 leading-relaxed">
                              O cliente recebe dinheiro de volta a cada atendimento para abater em futuros pagamentos de comandas.
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLoyaltyMode('pontos')}
                          className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-3 ${
                            loyaltyMode === 'pontos'
                              ? 'bg-indigo-50/50 border-indigo-600 shadow-sm ring-2 ring-indigo-600/20'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-2xl">🏅</span>
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                              loyaltyMode === 'pontos' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {loyaltyMode === 'pontos' ? 'Modo Ativo' : 'Selecionar'}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-800">Por Pontuação (Clube de Pontos)</h4>
                            <p className="text-xs text-muted mt-1 leading-relaxed">
                              O cliente acumula pontos por valor gasto ou por visita para trocar por recompensas exclusivas.
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* CONFIGURAÇÃO SE FOR MODO SALDO */}
                    {loyaltyMode === 'saldo' && (
                      <div className="space-y-6 p-6 bg-amber-50/30 rounded-3xl border border-amber-200/60">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Tipo de Cálculo do Saldo</label>
                          <select
                            value={cashbackType}
                            onChange={(e) => setCashbackType(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-primary shadow-xs"
                          >
                            <option value="percentual">Percentual sobre o valor pago pelo serviço (%)</option>
                            <option value="fixo">Valor Fixo em Reais (R$) por atendimento</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {cashbackType === 'percentual' ? (
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Porcentagem de Retorno (%)</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  step="0.5"
                                  min="0"
                                  max="100"
                                  value={cashbackPct} 
                                  onChange={(e) => setCashbackPct(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-primary shadow-xs"
                                  placeholder="Ex: 5"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">%</span>
                              </div>
                              <p className="text-[11px] text-muted ml-1">Ex: Em um corte de R$ 60,00 com 5%, o cliente acumula R$ 3,00.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Valor Fixo por Atendimento (R$)</label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">R$</span>
                                <input 
                                  type="number" 
                                  step="0.50"
                                  min="0"
                                  value={cashbackFixedValue} 
                                  onChange={(e) => setCashbackFixedValue(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-primary shadow-xs"
                                  placeholder="Ex: 5.00"
                                />
                              </div>
                              <p className="text-[11px] text-muted ml-1">Valor creditado a cada comanda finalizada.</p>
                            </div>
                          )}

                          {/* Valor Mínimo para Resgate */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">
                              Valor Mínimo para Resgate (R$) <span className="text-amber-600 font-bold">*</span>
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold text-sm">R$</span>
                              <input 
                                type="number" 
                                step="1"
                                min="0"
                                value={minRedemptionValue} 
                                onChange={(e) => setMinRedemptionValue(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all text-primary shadow-xs"
                                placeholder="Ex: 10.00"
                              />
                            </div>
                            <p className="text-[11px] text-muted ml-1">
                              O cliente só poderá usar o saldo para abater pagamentos quando atingir no mínimo esse valor.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CONFIGURAÇÃO SE FOR MODO PONTOS */}
                    {loyaltyMode === 'pontos' && (
                      <div className="space-y-6 p-6 bg-indigo-50/30 rounded-3xl border border-indigo-200/60">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Pontos para cada R$ 1,00 gasto</label>
                            <input 
                              type="number" 
                              step="1"
                              min="0"
                              value={pointsRate} 
                              onChange={(e) => setPointsRate(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-primary shadow-xs"
                              placeholder="Ex: 1"
                            />
                            <p className="text-[11px] text-muted ml-1">Ex: 1 ponto por cada R$ 1,00 gasto pelo cliente.</p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">Pontos bônus por Atendimento</label>
                            <input 
                              type="number" 
                              step="1"
                              min="0"
                              value={pointsAppointment} 
                              onChange={(e) => setPointsAppointment(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-primary shadow-xs"
                              placeholder="Ex: 10"
                            />
                            <p className="text-[11px] text-muted ml-1">Pontuação extra concedida por visita.</p>
                          </div>

                          {/* Pontos Mínimos para Resgate */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-muted uppercase tracking-widest ml-1">
                              Pontuação Mínima para Resgate (Pontos) <span className="text-indigo-600 font-bold">*</span>
                            </label>
                            <input 
                              type="number" 
                              step="10"
                              min="0"
                              value={minRedemptionPoints} 
                              onChange={(e) => setMinRedemptionPoints(e.target.value)}
                              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-primary shadow-xs"
                              placeholder="Ex: 100"
                            />
                            <p className="text-[11px] text-muted ml-1">
                              Quantidade de pontos necessária para liberar o resgate de benefícios no portal.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end pt-6">
                  <button 
                    type="submit"
                    className="bg-primary text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-3"
                  >
                    <Save size={18} />
                    Salvar Regras de Fidelidade
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
            {activeSection === 'security' && (() => {
              const PERMISSION_METADATA = [
                {
                  key: 'reopen_comanda' as keyof FunctionPermissions,
                  title: 'Reabrir Comandas Finalizadas',
                  description: 'Permite reabrir comandas fechadas para ajuste de serviços, produtos ou pagamentos.',
                  icon: <RefreshCw size={16} className="text-amber-500" />
                },
                {
                  key: 'apply_discount' as keyof FunctionPermissions,
                  title: 'Aplicar Descontos em Vendas',
                  description: 'Permite conceder descontos em serviços ou produtos durante o fechamento de comandas.',
                  icon: <Percent size={16} className="text-emerald-500" />
                },
                {
                  key: 'add_cortesia' as keyof FunctionPermissions,
                  title: 'Lançar Serviços como Cortesia',
                  description: 'Permite zerar o valor de itens, registrando-os como cortesia (100% de desconto).',
                  icon: <Sparkles size={16} className="text-purple-500" />
                },
                {
                  key: 'edit_price' as keyof FunctionPermissions,
                  title: 'Alterar Preço Unitário de Itens',
                  description: 'Permite editar manualmente o preço de serviços ou produtos diretamente na comanda.',
                  icon: <Sliders size={16} className="text-indigo-500" />
                },
                {
                  key: 'reset_payments' as keyof FunctionPermissions,
                  title: 'Zerar Lançamentos de Pagamento',
                  description: 'Permite remover pagamentos parciais já inseridos em comandas ainda não finalizadas.',
                  icon: <Trash2 size={16} className="text-rose-500" />
                },
                {
                  key: 'sell_subscription' as keyof FunctionPermissions,
                  title: 'Vender Assinaturas & Clubes',
                  description: 'Permite cadastrar e vender planos recorrentes de clubes de benefícios para os clientes.',
                  icon: <CreditCard size={16} className="text-blue-500" />
                },
                {
                  key: 'delete_subscription' as keyof FunctionPermissions,
                  title: 'Cancelar Assinaturas de Clientes',
                  description: 'Permite revogar benefícios, suspender ou excluir assinaturas ativas de clientes.',
                  icon: <X size={16} className="text-rose-600" />
                },
                {
                  key: 'view_financial' as keyof FunctionPermissions,
                  title: 'Visualizar Painel e Relatórios Financeiros',
                  description: 'Permite acessar gráficos, faturamento bruto, DRE e relatórios de fechamento contábil.',
                  icon: <Settings size={16} className="text-slate-500" />
                },
                {
                  key: 'manage_cash' as keyof FunctionPermissions,
                  title: 'Controle e Movimentação de Caixa Diário',
                  description: 'Permite abrir, fechar, reabrir caixas diários e realizar lançamentos de sangrias ou suprimentos.',
                  icon: <Database size={16} className="text-sky-500" />
                },
                {
                  key: 'edit_clients' as keyof FunctionPermissions,
                  title: 'Cadastrar e Editar Clientes',
                  description: 'Permite cadastrar novos clientes, gerenciar saldos de fiado e visualizar históricos.',
                  icon: <Users size={16} className="text-teal-500" />
                }
              ];

              return (
                <div className="space-y-8">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                    <div>
                      <h3 className="text-xl font-black text-primary tracking-tight">Usuários e Permissões</h3>
                      <p className="text-xs text-muted font-semibold mt-1">Gerencie a equipe de colaboradores e controle rigidamente os privilégios operacionais por cargo.</p>
                    </div>
                  </div>

                  {/* Sub-tab Switcher */}
                  <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-fit" id="security-subtabs-switcher">
                    <button 
                      type="button"
                      id="security-subtab-members-btn"
                      onClick={() => setSecuritySubTab('members')}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black transition-all ${
                        securitySubTab === 'members' 
                          ? 'bg-white text-primary shadow-sm' 
                          : 'text-muted hover:text-primary'
                      }`}
                    >
                      <Users size={14} />
                      <span>Membros Ativos</span>
                    </button>
                    <button 
                      type="button"
                      id="security-subtab-permissions-btn"
                      onClick={() => setSecuritySubTab('permissions')}
                      className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black transition-all ${
                        securitySubTab === 'permissions' 
                          ? 'bg-white text-primary shadow-sm' 
                          : 'text-muted hover:text-primary'
                      }`}
                    >
                      <Lock size={14} />
                      <span>Controle por Cargo (Gerente / Barbeiro)</span>
                    </button>
                  </div>

                  {/* SUB-TAB 1: MEMBERS */}
                  {securitySubTab === 'members' && (
                    <div className="space-y-6" id="security-members-tab-content">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="relative flex-1">
                          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text" 
                            placeholder="Filtrar profissionais ou clientes pelo nome ou e-mail..." 
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary shadow-inner"
                          />
                        </div>
                        <button 
                          type="button"
                          onClick={fetchUsers}
                          className="flex items-center justify-center gap-2 px-5 py-4 border border-slate-200 text-slate-600 rounded-2xl text-xs font-bold hover:bg-slate-50 transition-all active:scale-95"
                        >
                          <RefreshCw size={14} className={loadingUsers ? 'animate-spin' : ''} />
                          <span>Atualizar Lista</span>
                        </button>
                      </div>

                      {loadingUsers ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <Loader2 className="animate-spin text-accent" size={32} />
                          <p className="text-[10px] text-muted font-black uppercase tracking-widest">Sincronizando banco de acessos...</p>
                        </div>
                      ) : (
                        <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white">
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
                                  const isSelf = u.uid === profile?.uid || (profile?.email && u.email && u.email.toLowerCase() === profile.email.toLowerCase());

                                  return (
                                    <tr key={`config-user-${u.uid || index}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-5">
                                        <div className="flex items-center gap-3">
                                          <div className="w-9 h-9 bg-primary/5 border border-primary/10 rounded-xl flex items-center justify-center font-bold text-xs text-primary uppercase shadow-sm">
                                            {userName.substring(0, 2)}
                                          </div>
                                          <div>
                                            <div className="flex items-center gap-1.5">
                                              <h5 className="font-bold text-xs text-primary">{userName}</h5>
                                              {isSelf && (
                                                <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                  Sua Conta
                                                </span>
                                              )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 font-semibold">{userEmail}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="p-5">
                                        {isSelf ? (
                                          <span className="bg-purple-100 text-purple-800 text-xs font-extrabold px-3 py-1.5 rounded-xl inline-flex items-center gap-1 border border-purple-200">
                                            🔒 Administrador (Protegido)
                                          </span>
                                        ) : (
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
                                        )}
                                      </td>
                                      <td className="p-5">
                                        <div className="flex items-center gap-4">
                                          <button 
                                            type="button"
                                            disabled={isSelf}
                                            onClick={() => handleToggleUserActive(u.uid, isActive)}
                                            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isSelf ? 'opacity-50 cursor-not-allowed bg-emerald-500' : 'cursor-pointer'} ${isActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
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

                  {/* SUB-TAB 2: PERMISSIONS */}
                  {securitySubTab === 'permissions' && (
                    <div className="space-y-6" id="security-permissions-tab-content">
                      {loadingPermissions ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                          <Loader2 className="animate-spin text-accent" size={32} />
                          <p className="text-[10px] text-muted font-black uppercase tracking-widest">Carregando matriz de permissões...</p>
                        </div>
                      ) : !tenantPermissions ? (
                        <div className="text-center py-12 text-slate-400 text-xs font-semibold bg-slate-50 rounded-2xl border border-slate-100 p-6">
                          Não foi possível carregar a matriz de permissões do estabelecimento.
                          <button 
                            type="button"
                            onClick={fetchPermissions} 
                            className="block mx-auto mt-4 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl active:scale-95 transition"
                          >
                            Tentar Novamente
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Info Banner */}
                          <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-2">
                            <h4 className="text-xs font-black text-primary uppercase tracking-wider">Configuração de Alçada Operacional</h4>
                            <p className="text-[11px] text-muted leading-relaxed">
                              Configure exatamente o que cada cargo pode ou não fazer nas telas de comandas, finanças, caixas e clientes. Usuários com cargo <strong>Administrador</strong> sempre têm alçada irrestrita e não são afetados pelas limitações abaixo.
                            </p>
                          </div>

                          {/* Permissions Matrix Table */}
                          <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm bg-white">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50/75 border-b border-slate-100">
                                    <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest">Ação / Funcionalidade</th>
                                    <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest text-center w-36">Cargo: Gerente</th>
                                    <th className="p-5 text-[10px] font-black text-muted uppercase tracking-widest text-center w-36">Cargo: Barbeiro</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {PERMISSION_METADATA.map((perm) => {
                                    const isGerenteActive = tenantPermissions.gerente?.[perm.key] ?? false;
                                    const isBarbeiroActive = tenantPermissions.barbeiro?.[perm.key] ?? false;

                                    return (
                                      <tr key={`perm-row-${perm.key}`} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-5">
                                          <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-xl bg-slate-100/70 text-slate-500 mt-0.5">
                                              {perm.icon}
                                            </div>
                                            <div>
                                              <h5 className="font-bold text-xs text-primary">{perm.title}</h5>
                                              <p className="text-[10px] text-muted font-medium leading-relaxed mt-0.5">{perm.description}</p>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="p-5 text-center">
                                          <div className="flex items-center justify-center">
                                            <button
                                              type="button"
                                              onClick={() => handleTogglePermission('gerente', perm.key)}
                                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isGerenteActive ? 'bg-primary' : 'bg-slate-200'}`}
                                            >
                                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isGerenteActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="p-5 text-center">
                                          <div className="flex items-center justify-center">
                                            <button
                                              type="button"
                                              onClick={() => handleTogglePermission('barbeiro', perm.key)}
                                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${isBarbeiroActive ? 'bg-primary' : 'bg-slate-200'}`}
                                            >
                                              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${isBarbeiroActive ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Save Panel Button */}
                          <div className="flex justify-end pt-4">
                            <button
                              type="button"
                              onClick={handleSavePermissions}
                              disabled={savingPermissions}
                              className="bg-primary text-white px-8 py-3.5 rounded-2xl font-black text-xs hover:bg-slate-800 transition-all shadow-lg active:scale-95 uppercase tracking-widest flex items-center gap-2.5 disabled:opacity-50"
                            >
                              {savingPermissions ? (
                                <>
                                  <Loader2 className="animate-spin" size={16} />
                                  <span>Salvando Matriz...</span>
                                </>
                              ) : (
                                <>
                                  <Save size={16} />
                                  <span>Salvar Matriz de Permissões</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Plano e Faturamento */}
            {activeSection === 'billing' && (() => {
              const currentPlanName = tenant?.plan || tenant?.planName || 'Elite Premium';
              const currentPlanStatus = tenant?.planStatus || 'active';
              
              const activePlanObj = plans.find(p => 
                p.name.toLowerCase() === currentPlanName.toLowerCase() || 
                p.id === tenant?.planId
              );

              // 1. Utilidade do plano
              const utilidade = activePlanObj 
                ? `Suporta até ${activePlanObj.maxBarbers} profissionais ativos na plataforma simultaneamente. Recursos incluídos: ${activePlanObj.features.join(', ')}.`
                : tenant?.maxProfessionals 
                  ? `Suporta até ${tenant.maxProfessionals} profissionais ativos simultaneamente com recursos do painel BarberElite.`
                  : "Acesso total aos recursos de agendamentos, comissões, relatórios e controle de comandas sem restrições.";

              // 2. Ciclo de ativação
              const statusLabelMap: Record<string, string> = {
                trial: 'Período de Testes (Trial)',
                active: 'Assinatura Ativa',
                suspended: 'Assinatura Suspensa',
                canceled: 'Assinatura Cancelada',
                pending: 'Aguardando Pagamento'
              };
              const statusLabel = statusLabelMap[currentPlanStatus] || 'Ativa';

              // 3. Data de início
              let dataInicio = 'Não informado';
              if (tenant?.trialStartDate) {
                try {
                  dataInicio = new Date(tenant.trialStartDate).toLocaleDateString('pt-BR');
                } catch (e) {
                  console.error(e);
                }
              } else if (tenant?.createdAt) {
                try {
                  const dateVal = tenant.createdAt;
                  if (dateVal.seconds) {
                    dataInicio = new Date(dateVal.seconds * 1000).toLocaleDateString('pt-BR');
                  } else {
                    dataInicio = new Date(dateVal).toLocaleDateString('pt-BR');
                  }
                } catch (e) {
                  console.error(e);
                }
              }

              // 4. Vencimento
              let dataVencimento = '';
              if (tenant?.planExpiresAt) {
                try {
                  dataVencimento = new Date(tenant.planExpiresAt).toLocaleDateString('pt-BR');
                } catch (e) {
                  dataVencimento = tenant.planExpiresAt;
                }
              } else if (tenant?.trialEndDate) {
                try {
                  dataVencimento = new Date(tenant.trialEndDate).toLocaleDateString('pt-BR');
                } catch (e) {
                  dataVencimento = tenant.trialEndDate;
                }
              } else {
                dataVencimento = `Todo dia ${tenant?.dueDateDay || 10} de cada mês`;
              }

              return (
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-primary tracking-tight">Plano & Assinatura</h3>
                      <p className="text-xs text-muted font-semibold mt-1">Acompanhe seu ciclo de cobrança e faturamento BarberElite SaaS.</p>
                    </div>
                    <span className="bg-amber-500 text-white text-[10px] font-black tracking-widest uppercase px-4 py-2 rounded-2xl shadow-lg shadow-amber-500/20 animate-pulse">
                      {currentPlanName}
                    </span>
                  </div>

                  {/* Sub Card */}
                  <div className="p-8 bg-gradient-to-r from-primary to-slate-800 rounded-[2rem] text-white space-y-6 shadow-xl shadow-primary/10">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Seu pacote atual</p>
                        <h4 className="text-3xl font-black mt-1">BarberElite {currentPlanName}</h4>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full backdrop-blur-sm">
                            Ciclo de Ativação: {statusLabel}
                          </span>
                        </div>
                      </div>
                      <CreditCard size={32} className="text-amber-400" />
                    </div>

                    <div className="border-t border-white/10 pt-4 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Utilidade & Recursos do Plano</p>
                      <p className="text-xs text-slate-200 font-medium leading-relaxed">{utilidade}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 border-t border-white/10 text-xs">
                      <div>
                        <p className="font-semibold text-slate-400">Início da Ativação</p>
                        <p className="font-extrabold text-base mt-1 text-white">{dataInicio}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-400">Tipo de Ciclo</p>
                        <p className="font-extrabold text-base mt-1 text-white uppercase">{currentPlanStatus === 'trial' ? 'Grátis (Trial)' : 'Mensal'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-400">Data de Vencimento</p>
                        <p className="font-extrabold text-base mt-1 text-white">{dataVencimento}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-400">Investimento Mensal</p>
                        <p className="font-extrabold text-base mt-1 text-amber-300">
                          R$ {(tenant?.monthlyFeeOverride || activePlanObj?.priceMonthly || (currentPlanName.toLowerCase() === 'bronze' ? 49.90 : currentPlanName.toLowerCase() === 'silver' ? 99.90 : 149.90)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Plans Title */}
                  <div className="pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted">Planos Oficiais no Admin SaaS</p>
                    <p className="text-xs text-slate-500 font-semibold mt-1">Veja abaixo os planos cadastrados e escolha um para assinar ou alterar sua assinatura:</p>
                  </div>

                  {/* Plan cards */}
                  {loadingPlans ? (
                    <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-slate-50 rounded-3xl">
                      <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                      <p className="text-xs font-bold text-slate-400">Carregando planos do SaaS...</p>
                    </div>
                  ) : plans.length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 p-8 rounded-[2rem] text-center">
                      <p className="text-sm font-bold text-slate-500">Nenhum plano cadastrado no Admin SaaS.</p>
                      <p className="text-xs text-slate-400 mt-1 font-semibold">Fale com o administrador para configurar planos na plataforma.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {plans.map((p, idx) => (
                          <PlanSelectorCard 
                            key={`${p.id || p.name}-${idx}`}
                            title={p.name} 
                            price={`R$ ${p.priceMonthly.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`} 
                            desc={`Até ${p.maxBarbers} profissionais ativos`} 
                            features={p.features || []}
                            active={selectedPlan === p.id || selectedPlan === p.name.toLowerCase()}
                            onClick={() => {
                              setSelectedPlan(p.id);
                              setSelectedPlanName(p.name);
                              setSelectedPlanPrice(p.priceMonthly);
                            }}
                          />
                        ))}
                      </div>

                      {/* Action Button to trigger the checkout modal */}
                      {selectedPlan && (
                        <div className="flex justify-end pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              const selectedPlanObj = plans.find(p => p.id === selectedPlan || p.name.toLowerCase() === selectedPlan);
                              if (selectedPlanObj) {
                                handleGenerateSaaSCharge(selectedPlanObj.name, selectedPlanObj.priceMonthly);
                              } else {
                                // Fallback
                                const planMap: Record<string, {name: string, price: number}> = {
                                  bronze: { name: 'Bronze', price: 49.90 },
                                  silver: { name: 'Silver', price: 99.90 },
                                  elite: { name: 'Elite', price: 149.90 }
                                };
                                const fallback = planMap[selectedPlan];
                                if (fallback) {
                                  handleGenerateSaaSCharge(fallback.name, fallback.price);
                                }
                              }
                            }}
                            className="px-6 py-3 bg-primary hover:bg-slate-800 text-white rounded-2xl text-xs font-black shadow-lg shadow-primary/10 flex items-center gap-2 transition active:scale-95"
                          >
                            <CreditCard size={16} className="text-amber-400" />
                            Contratar / Atualizar Plano Selecionado
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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

                    <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-3xl mt-6 space-y-3">
                      <p className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                        <Sparkles size={16} className="text-indigo-600" />
                        Precisa de Ajuda para Começar?
                      </p>
                      <p className="text-[11px] text-indigo-700/80 leading-relaxed font-semibold">
                        Você pode rever o tutorial interativo de boas-vindas do sistema para aprender sobre as principais telas, abas e tarefas recomendadas.
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          const loadingToastId = toast.loading("Reiniciando tutorial de boas-vindas...");
                          try {
                            const { auth } = await import('../firebase');
                            const { userService } = await import('../services/userService');
                            const currentUser = auth.currentUser;
                            if (currentUser) {
                              await userService.updateUserProfile(currentUser.uid, {
                                onboardingCompleted: false
                              });
                              toast.dismiss(loadingToastId);
                              toast.success("Tutorial ativado! Atualizando a página...");
                              setTimeout(() => {
                                window.location.reload();
                              }, 1500);
                            } else {
                              toast.dismiss(loadingToastId);
                              toast.error("Usuário não autenticado.");
                            }
                          } catch (err: any) {
                            toast.dismiss(loadingToastId);
                            toast.error(`Erro: ${err.message || err}`);
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition-all shadow-sm"
                      >
                        Refazer Tour de Boas-vindas
                      </button>
                    </div>
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

      <ImageCropModal
        isOpen={isCropModalOpen}
        imageSrc={tempImageSrc}
        onClose={() => setIsCropModalOpen(false)}
        aspectRatio={cropTarget === 'cover' ? 'banner' : 'square'}
        title={cropTarget === 'cover' ? 'Ajustar Foto da Fachada / Capa' : 'Ajustar Logo da Barbearia'}
        onCropComplete={(croppedDataUrl) => {
          if (cropTarget === 'cover') {
            setCoverImage(croppedDataUrl);
            toast.success('Foto da capa/fachada processada e recortada em formato JPEG!');
          } else {
            setLogoUrl(croppedDataUrl);
            toast.success('Foto da logo processada e recortada em formato JPEG otimizado!');
          }
        }}
        outputSize={300}
      />

      <SaaSPaymentModal
        isOpen={showSaaSPaymentModal}
        onClose={() => setShowSaaSPaymentModal(false)}
        tenantId={tenant?.id || 'barbearia'}
        defaultTenantName={tenant?.name || 'Barbearia'}
        defaultOwnerEmail={profile?.email || tenant?.ownerEmail || ''}
        defaultOwnerCpfCnpj={tenant?.cnpjCpf || (tenant as any)?.cnpj || ''}
        planName={selectedPlanName}
        price={selectedPlanPrice}
        onSuccessConfirm={handleConfirmSaaSPayment}
      />
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

function PlanSelectorCard({ title, price, desc, features, active, onClick }: { title: string, price: string, desc: string, features: string[], active: boolean, onClick: () => void, key?: React.Key }) {
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
          {features.map((f, idx) => (
            <div key={`${f}-${idx}`} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500">
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
