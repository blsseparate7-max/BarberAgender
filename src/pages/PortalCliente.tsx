import React, { useState, useEffect, useRef } from 'react';
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
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Star,
  Instagram,
  Facebook,
  X,
  Globe,
  UserX,
  Coins,
  TrendingUp,
  Zap,
  CreditCard,
  QrCode,
  RefreshCw,
  Copy,
  ExternalLink,
  Trash2,
  Receipt,
  FileText,
  Tag,
  Megaphone,
  ChevronDown,
  ShoppingBag,
  Menu,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, setDoc, serverTimestamp, getDoc, onSnapshot } from 'firebase/firestore';
import { userService } from '../services/userService';
import { appointmentService } from '../services/appointmentService';
import { serviceService } from '../services/serviceService';
import { loyaltyService } from '../services/loyaltyService';
import { subscriptionService } from '../services/subscriptionService';
import { inventoryService } from '../services/inventoryService';
import { getActiveTenantId, tenantService, TenantProfile } from '../services/tenantService';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, Appointment, Service, Product, LoyaltyPoints, LoyaltyHistory, Subscription, LoyaltyVoucher } from '../types';
import { format, parse, addMinutes, isAfter, isBefore, isEqual, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}
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
  profile?: UserProfile | null;
  onLoginClick?: () => void;
  onBackToLanding?: () => void;
}

export function PortalCliente({ profile, onLoginClick, onBackToLanding }: PortalClienteProps) {
  const { isSaaSAdminUser, setOverrideRole } = useAuth();
  // Navigation
  const [activeTab, setActiveTab] = useState<'home' | 'schedule' | 'history' | 'fidelidade' | 'pacotes' | 'assinaturas' | 'perfil'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') || params.get('tabId');
    if (tabParam && ['home', 'schedule', 'history', 'fidelidade', 'pacotes', 'assinaturas', 'perfil'].includes(tabParam)) {
      return tabParam as any;
    }
    return 'home';
  });
  
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
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

  // Guest-First Booking states (agendamento antes de cadastrar)
  const [guestMode, setGuestMode] = useState<'register' | 'login'>('register');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [guestCreatedAppointment, setGuestCreatedAppointment] = useState<any | null>(null);

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
  const [products, setProducts] = useState<Product[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyPoints | null>(null);
  const [loyaltyHistory, setLoyaltyHistory] = useState<LoyaltyHistory[]>([]);
  const [clientVouchers, setClientVouchers] = useState<LoyaltyVoucher[]>([]);
  const [selectedItemToRedeem, setSelectedItemToRedeem] = useState<{ id: string; name: string; type: 'service' | 'product'; points: number; price: number } | null>(null);
  const [isRedeemingVoucher, setIsRedeemingVoucher] = useState(false);
  const [generatedVoucher, setGeneratedVoucher] = useState<LoyaltyVoucher | null>(null);
  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Portfolio / Landing Page States
  const [selectedPortfolioTenant, setSelectedPortfolioTenant] = useState<any | null>(null);
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);

  // Profile Edit States
  const [editNome, setEditNome] = useState(profile?.nome || '');
  const [editTelefone, setEditTelefone] = useState(profile?.telefone || profile?.phone || '');
  const [editObservacoes, setEditObservacoes] = useState(profile?.observacoes || profile?.observations || '');
  const [editCpf, setEditCpf] = useState(profile?.cpf || (profile as any)?.cpfCnpj || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Reviews & Ratings States
  const [myReviews, setMyReviews] = useState<any[]>([]);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedAppForReview, setSelectedAppForReview] = useState<Appointment | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // 2-step cancel confirmation state
  const [confirmingCancelAppId, setConfirmingCancelAppId] = useState<string | null>(null);
  const cancelTimeoutRef = useRef<any>(null);

  // Subscription Card management states for Client
  const [clientCardModalSub, setClientCardModalSub] = useState<Subscription | null>(null);
  const [clientPixModalData, setClientPixModalData] = useState<any | null>(null);
  const [ccNumber, setCcNumber] = useState('');
  const [ccHolderName, setCcHolderName] = useState('');
  const [ccExpiryMonth, setCcExpiryMonth] = useState('');
  const [ccExpiryYear, setCcExpiryYear] = useState('');
  const [ccCcv, setCcCcv] = useState('');
  const [isUpdatingCard, setIsUpdatingCard] = useState(false);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [checkingStatusSubId, setCheckingStatusSubId] = useState<string | null>(null);
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<any | null>(null);
  const [checkoutCpfCnpj, setCheckoutCpfCnpj] = useState<string>('');
  const [checkoutEmail, setCheckoutEmail] = useState<string>('');
  const [isSubscribingPlan, setIsSubscribingPlan] = useState(false);

  useEffect(() => {
    if (selectedPlanForCheckout && profile) {
      const initialCpf = profile.cpf || (profile as any).cpfCnpj || editCpf || '';
      setCheckoutCpfCnpj(formatCpfCnpjMask(initialCpf));
      const initialEmail = profile.email || '';
      setCheckoutEmail(initialEmail.includes('manual_') || initialEmail.includes('placeholder') ? '' : initialEmail);
    }
  }, [selectedPlanForCheckout, profile]);
  const [clientCreatedChargeData, setClientCreatedChargeData] = useState<any | null>(null);
  const [showClientChargeModal, setShowClientChargeModal] = useState(false);
  const [subToCancel, setSubToCancel] = useState<any | null>(null);
  const [isCancelingSub, setIsCancelingSub] = useState(false);

  // Announcements & Client Comandas States
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [announcementModalData, setAnnouncementModalData] = useState<any | null>(null);
  const [clientComandas, setClientComandas] = useState<any[]>([]);
  const [selectedComandaForView, setSelectedComandaForView] = useState<any | null>(null);

  // Subscription Invoices & Renewal States
  const [subscriptionInvoices, setSubscriptionInvoices] = useState<any[]>([]);
  const [selectedInvoiceForView, setSelectedInvoiceForView] = useState<any | null>(null);
  const [renewalModalSub, setRenewalModalSub] = useState<Subscription | null>(null);
  const [isManualRenewing, setIsManualRenewing] = useState(false);

  const handleManualRenewSubscription = async (sub: Subscription) => {
    setIsManualRenewing(true);
    try {
      await subscriptionService.renewSubscription(sub.id);
      toast.success("Assinatura renovada com sucesso! Seu período foi estendido por mais 30 dias.");
      setRenewalModalSub(null);
      if (profile?.uid) {
        const updatedSubs = await subscriptionService.getSubscriptions(profile.uid);
        setSubscriptions(updatedSubs);
        
        // Refresh invoices
        const qInvoices = query(
          collection(db, 'financial_transactions'),
          where('cliente_id', '==', profile.uid),
          where('category', '==', 'Assinaturas')
        );
        const invSnap = await getDocs(qInvoices);
        const invList = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        invList.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        setSubscriptionInvoices(invList);
      }
    } catch (err: any) {
      console.error("Erro ao renovar assinatura manualmente:", err);
      toast.error(err.message || "Erro ao renovar assinatura.");
    } finally {
      setIsManualRenewing(false);
    }
  };

  const handleCancelSubscriptionByClient = async () => {
    if (!subToCancel) return;
    setIsCancelingSub(true);
    const cancelingId = subToCancel.id;
    try {
      // 1. Optimistically update local state so the pending alert and card vanish immediately
      setSubscriptions(prev => prev.filter(s => s.id !== cancelingId));
      
      // 2. Persist cancellation in database
      await subscriptionService.updateSubscriptionStatus(cancelingId, 'canceled');
      toast.success("Sua assinatura foi cancelada com sucesso.");
      setSubToCancel(null);
      
      // 3. Sync from backend to confirm database state
      if (profile?.uid) {
        const updated = await subscriptionService.getSubscriptions(profile.uid);
        setSubscriptions(updated);
      }
    } catch (err: any) {
      console.error("Erro ao cancelar assinatura:", err);
      toast.error("Erro ao cancelar assinatura.");
      // Rollback on error
      if (profile?.uid) {
        const updated = await subscriptionService.getSubscriptions(profile.uid);
        setSubscriptions(updated);
      }
    } finally {
      setIsCancelingSub(false);
    }
  };

  const handleRedeemRewardToken = async (item: { id: string; name: string; type: 'service' | 'product'; points: number; price: number }) => {
    if (!profile?.uid) return;
    if ((loyalty?.points || 0) < item.points) {
      toast.error(`Você precisa de ${item.points} pontos para resgatar este item. Seu saldo atual é de ${loyalty?.points || 0} pts.`);
      return;
    }

    setIsRedeemingVoucher(true);
    try {
      const voucher = await loyaltyService.redeemRewardToken({
        cliente_id: profile.uid,
        cliente_name: profile.nome || 'Cliente',
        item_type: item.type === 'service' ? 'servico' : 'produto',
        item_id: item.id,
        item_name: item.name,
        points_spent: item.points
      });

      setGeneratedVoucher(voucher);
      setSelectedItemToRedeem(null);
      toast.success(`Token de resgate gerado com sucesso: ${voucher.token}!`);

      // Refresh loyalty and vouchers
      const [updatedPoints, updatedHistory, updatedVouchers] = await Promise.all([
        loyaltyService.getClientPoints(profile.uid),
        loyaltyService.getHistory(profile.uid),
        loyaltyService.getClientVouchers(profile.uid)
      ]);
      setLoyalty(updatedPoints);
      setLoyaltyHistory(updatedHistory);
      setClientVouchers(updatedVouchers);
    } catch (error: any) {
      console.error("Erro ao resgatar item:", error);
      toast.error(error.message || "Erro ao resgatar recompensa.");
    } finally {
      setIsRedeemingVoucher(false);
    }
  };

  // Helper validation & formatting for CPF/CNPJ
  const isValidCPF = (cpf: string) => {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;
    return true;
  };

  const isValidCNPJ = (cnpj: string) => {
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
    let size = clean.length - 2;
    let numbers = clean.substring(0, size);
    const digits = clean.substring(size);
    let sum = 0;
    let pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(0))) return false;
    size = size + 1;
    numbers = clean.substring(0, size);
    sum = 0;
    pos = size - 7;
    for (let i = size; i >= 1; i--) {
      sum += parseInt(numbers.charAt(size - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (result !== parseInt(digits.charAt(1))) return false;
    return true;
  };

  const isValidCpfCnpj = (val: string) => {
    const clean = val.replace(/\D/g, '');
    if (clean.length === 11) return isValidCPF(clean);
    if (clean.length === 14) return isValidCNPJ(clean);
    return false;
  };

  const formatCpfCnpjMask = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 11) {
      if (digits.length > 9) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      if (digits.length > 6) return digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      if (digits.length > 3) return digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      return digits;
    } else {
      const formatted = digits.slice(0, 14);
      if (digits.length > 12) return formatted.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
      if (digits.length > 8) return formatted.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
      if (digits.length > 5) return formatted.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
      if (digits.length > 2) return formatted.replace(/(\d{2})(\d{1,3})/, '$1.$2');
      return formatted;
    }
  };

  const handleClientSubscribePlan = async (plan: any, billingType: 'PIX' | 'CREDIT_CARD') => {
    if (!profile) {
      toast.error("Você precisa estar logado para assinar.");
      return;
    }

    const cleanCpfCnpj = checkoutCpfCnpj.replace(/\D/g, '');
    if (!cleanCpfCnpj || cleanCpfCnpj.length !== 11) {
      toast.error("Por favor, informe um CPF válido (11 dígitos) para ativação da sua assinatura.");
      return;
    }

    if (!isValidCPF(cleanCpfCnpj)) {
      toast.error("O CPF informado é inválido. Por favor, verifique os números digitados.");
      return;
    }

    const cleanEmail = checkoutEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error("Por favor, informe um e-mail válido para ativação da sua assinatura.");
      return;
    }

    setIsSubscribingPlan(true);
    try {
      // Save CPF and Email to user profile in Firestore if present
      if (profile.uid) {
        try {
          await updateDoc(doc(db, 'usuarios', profile.uid), {
            cpf: cleanCpfCnpj,
            cpfCnpj: cleanCpfCnpj,
            email: cleanEmail,
            updatedAt: serverTimestamp()
          });
          profile.cpf = cleanCpfCnpj;
          (profile as any).cpfCnpj = cleanCpfCnpj;
          profile.email = cleanEmail;
          setEditCpf(formatCpfCnpjMask(cleanCpfCnpj));
        } catch (e) {
          console.warn("Aviso ao salvar CPF e Email no perfil do cliente:", e);
        }
      }

      const res = await subscriptionService.createAsaasSubscription({
        cliente_id: profile.uid,
        cliente_name: profile.nome || 'Cliente',
        plano_id: plan.id,
        ownerEmail: cleanEmail,
        ownerCpfCnpj: cleanCpfCnpj,
        billingType
      });

      toast.success(`Assinatura do plano ${plan.name} gerada com sucesso!`);
      setSelectedPlanForCheckout(null);

      if (res) {
        setClientCreatedChargeData({
          id: res.id,
          paymentUrl: res.paymentUrl,
          pixCopiaECola: res.pixCopiaECola,
          pixQrCodeUrl: res.pixQrCodeUrl,
          planName: plan.name,
          price: plan.price,
          clientName: profile.nome || 'Cliente',
          status: 'pending',
          billingType
        });
        setShowClientChargeModal(true);
      }

      const updatedSubs = await subscriptionService.getSubscriptions(profile.uid);
      setSubscriptions(updatedSubs);
    } catch (err: any) {
      console.error("Erro ao criar assinatura via Asaas:", err);
      toast.error(err.message || "Erro ao gerar cobrança de assinatura.");
    } finally {
      setIsSubscribingPlan(false);
    }
  };

  const handleCheckAsaasStatus = async (sub: Subscription) => {
    if (!sub.asaasInvoiceId && !sub.id) return;
    setCheckingStatusSubId(sub.id);
    try {
      const res = await subscriptionService.checkAsaasPaymentStatus(sub.asaasInvoiceId || sub.id);
      const isConfirmed = res.isPaid === true || ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'RECEIVED_IN_CASH_FEE'].includes(String(res.status || '').toUpperCase());
      if (isConfirmed) {
        toast.success("Pagamento confirmado e assinatura ativada com sucesso!");
        if (profile?.uid) {
          const clientSubs = await subscriptionService.getSubscriptions(profile.uid);
          setSubscriptions(clientSubs);
        }
      } else {
        toast.info(res.error || "O pagamento ainda consta como pendente no Asaas.");
      }
    } catch (err: any) {
      toast.error("Erro ao verificar status no Asaas.");
    } finally {
      setCheckingStatusSubId(null);
    }
  };

  const handleClientUpdateCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientCardModalSub) return;
    setIsUpdatingCard(true);
    try {
      const res = await subscriptionService.updateCreditCard(clientCardModalSub.id, {
        holderName: ccHolderName,
        number: ccNumber.replace(/\D/g, ''),
        expiryMonth: ccExpiryMonth,
        expiryYear: ccExpiryYear,
        ccv: ccCcv
      }, {
        name: clientCardModalSub.cliente_name,
        email: profile.email || 'cliente@rull.com',
        cpfCnpj: (profile as any).cpfCnpj || profile.cpf || ''
      });
      if (res.success) {
        toast.success("Cartão de crédito atualizado com sucesso!");
        setClientCardModalSub(null);
        setCcNumber(''); setCcHolderName(''); setCcExpiryMonth(''); setCcExpiryYear(''); setCcCcv('');
      } else {
        toast.error(res.error || "Erro ao atualizar cartão.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar cartão.");
    } finally {
      setIsUpdatingCard(false);
    }
  };

  const handleClientPayPix = async (sub: Subscription) => {
    setIsGeneratingPix(true);
    try {
      const res = await subscriptionService.generatePix(sub.id);
      if (res.success) {
        setClientPixModalData(res);
      } else {
        toast.error(res.error || "Erro ao gerar PIX.");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar PIX.");
    } finally {
      setIsGeneratingPix(false);
    }
  };

  // Sync profile edits
  useEffect(() => {
    if (profile) {
      setEditNome(profile.nome || '');
      setEditTelefone(profile.telefone || profile.phone || '');
      setEditObservacoes(profile.observacoes || profile.observations || '');
    }
  }, [profile]);

  // Subscribe to my reviews
  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, 'avaliacoes'),
      where('cliente_id', '==', profile.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setMyReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // Real-time subscription listener for instant Asaas updates
  useEffect(() => {
    if (!profile?.uid) return;
    const unsubscribe = subscriptionService.subscribeToSubscriptions(profile.uid, (subs) => {
      setSubscriptions(subs);
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  // Auto-poll subscription status while charge modal is open
  useEffect(() => {
    if (!showClientChargeModal || !clientCreatedChargeData?.id) return;
    const interval = setInterval(async () => {
      try {
        const res = await subscriptionService.checkAsaasPaymentStatus(clientCreatedChargeData.id);
        const isConfirmed = res.isPaid === true || ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'RECEIVED_IN_CASH_FEE'].includes(String(res.status || '').toUpperCase());
        if (isConfirmed) {
          toast.success("Pagamento confirmado e assinatura ativada com sucesso!");
          setShowClientChargeModal(false);
          setClientCreatedChargeData(null);
          if (profile?.uid) {
            const clientSubs = await subscriptionService.getSubscriptions(profile.uid);
            setSubscriptions(clientSubs);
          }
          clearInterval(interval);
        }
      } catch (err) {
        // silent catch during polling
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [showClientChargeModal, clientCreatedChargeData?.id, profile?.uid]);

  const [portfolioBarbers, setPortfolioBarbers] = useState<any[]>([]);
  const [loadingPortfolioBarbers, setLoadingPortfolioBarbers] = useState(false);

  useEffect(() => {
    if (!selectedPortfolioTenant) {
      setPortfolioBarbers([]);
      return;
    }
    const fetchBarbers = async () => {
      setLoadingPortfolioBarbers(true);
      try {
        const list = await userService.getAllBarbers(true, selectedPortfolioTenant.id);
        setPortfolioBarbers(list);
      } catch (err) {
        console.warn("Could not load portfolio barbers:", err);
      } finally {
        setLoadingPortfolioBarbers(false);
      }
    };
    fetchBarbers();
  }, [selectedPortfolioTenant]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      toast.error('Você precisa estar conectado para editar o perfil.');
      return;
    }
    if (!editNome.trim()) {
      toast.error('O nome não pode estar vazio.');
      return;
    }
    const cleanCpf = editCpf.replace(/\D/g, '');
    if (cleanCpf && cleanCpf.length > 0 && !isValidCpfCnpj(cleanCpf)) {
      toast.error('O CPF/CNPJ informado é inválido. Por favor verifique.');
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
        cpf: cleanCpf,
        cpfCnpj: cleanCpf,
      });
      profile.cpf = cleanCpf;
      (profile as any).cpfCnpj = cleanCpf;
      toast.success('Perfil atualizado com sucesso!');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao atualizar perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Scheduling State
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedBarber, setSelectedBarber] = useState<UserProfile | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedServices, setSelectedServices] = useState<Service[]>([]);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('Todos');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const getIsWalkInOnly = () => {
    if (!tenantInfo?.openingHours || !selectedDate) return { isWalkInOnly: false, message: '' };
    try {
      const dateObj = parse(selectedDate, 'yyyy-MM-dd', new Date());
      const dayOfWeek = getDay(dateObj);
      const DAYS_PT = [
        'Domingo',
        'Segunda-feira',
        'Terça-feira',
        'Quarta-feira',
        'Quinta-feira',
        'Sexta-feira',
        'Sábado'
      ];
      const dayNamePT = DAYS_PT[dayOfWeek];
      const dayConfig = tenantInfo.openingHours.find((h: any) => h.day === dayNamePT);
      if (dayConfig && dayConfig.open && dayConfig.isWalkInOnly) {
        return { 
          isWalkInOnly: true, 
          message: dayConfig.walkInMessage || `Hoje o atendimento é exclusivamente por ordem de chegada das ${dayConfig.start} às ${dayConfig.end}! Chegue cedo para garantir seu horário.` 
        };
      }
    } catch (err) {
      console.error(err);
    }
    return { isWalkInOnly: false, message: '' };
  };

  // Helper to check if a specific service is covered by the user's active subscription
  const getServiceSubscriptionStatus = (service: Service | null | undefined) => {
    if (!service || !profile) {
      return { isCovered: false, effectivePrice: service ? (service.preco || service.price || 0) : 0, planName: null };
    }

    const activeSub = subscriptions.find(s => s.status === 'active');
    if (!activeSub) {
      return { isCovered: false, effectivePrice: service.preco || service.price || 0, planName: null };
    }

    const plan = availablePlans.find(p => p.id === activeSub.plano_id);
    const serviceName = (service.nome || service.name || '').toLowerCase().trim();

    // 1. Specific services declared in plan.services (e.g. Acabamento, Barboterapia, etc.)
    if (plan?.services && plan.services.length > 0) {
      const planService = plan.services.find((ps: any) => 
        (ps.serviceId && ps.serviceId === service.id) ||
        (ps.name && ps.name.toLowerCase().trim() === serviceName)
      );

      if (planService) {
        const used = (activeSub.serviceUsages && (activeSub.serviceUsages[planService.serviceId] || activeSub.serviceUsages[service.id])) || 0;
        const isUnlimited = planService.isUnlimited || planService.limit >= 99 || planService.limit === 0;
        if (isUnlimited || used < planService.limit) {
          return { 
            isCovered: true, 
            effectivePrice: 0, 
            planName: activeSub.planName || plan.name, 
            limit: planService.limit, 
            used, 
            isUnlimited 
          };
        }
      }
    } else if (plan) {
      // 2. Legacy fallback for plans with haircutsPerMonth or beardsPerMonth
      const isCorte = serviceName.includes('corte') || serviceName.includes('cabelo') || serviceName.includes('acabamento') || serviceName.includes('pezinho') || serviceName.includes('hair');
      const isBarba = serviceName.includes('barba') || serviceName.includes('beard');

      if (isCorte && (plan.haircutsPerMonth > 0 || plan.haircutsPerMonth >= 99)) {
        const used = activeSub.haircutsUsed || 0;
        const isUnlimited = plan.haircutsPerMonth >= 99 || plan.haircutsPerMonth === 0;
        if (isUnlimited || used < plan.haircutsPerMonth) {
          return { 
            isCovered: true, 
            effectivePrice: 0, 
            planName: activeSub.planName || plan.name, 
            limit: plan.haircutsPerMonth, 
            used, 
            isUnlimited 
          };
        }
      }

      if (isBarba && (plan.beardsPerMonth > 0 || plan.beardsPerMonth >= 99)) {
        const used = activeSub.beardsUsed || 0;
        const isUnlimited = plan.beardsPerMonth >= 99 || plan.beardsPerMonth === 0;
        if (isUnlimited || used < plan.beardsPerMonth) {
          return { 
            isCovered: true, 
            effectivePrice: 0, 
            planName: activeSub.planName || plan.name, 
            limit: plan.beardsPerMonth, 
            used, 
            isUnlimited 
          };
        }
      }
    }

    return { isCovered: false, effectivePrice: service.preco || service.price || 0, planName: null };
  };

  const calculateEffectivePrice = (serviceList: Service[]) => {
    return serviceList.reduce((sum, s) => {
      const status = getServiceSubscriptionStatus(s);
      return sum + (status.isCovered ? 0 : (s.preco || s.price || 0));
    }, 0);
  };

  const handleToggleService = (s: Service) => {
    let updated: Service[] = [];
    if (selectedServices.some(item => item.id === s.id)) {
      updated = selectedServices.filter(item => item.id !== s.id);
    } else {
      updated = [...selectedServices, s];
    }
    setSelectedServices(updated);

    if (updated.length === 0) {
      setSelectedService(null);
    } else if (updated.length === 1) {
      setSelectedService(updated[0]);
    } else {
      const combined: Service = {
        id: 'combined_' + updated.map(x => x.id).join('_'),
        nome: updated.map(x => x.nome || x.name).join(' + '),
        name: updated.map(x => x.nome || x.name).join(' + '),
        preco: updated.reduce((sum, x) => sum + (x.preco || x.price || 0), 0),
        price: updated.reduce((sum, x) => sum + (x.preco || x.price || 0), 0),
        duracao_minutos: updated.reduce((sum, x) => sum + (x.duracao_minutos || x.duration || 30), 0),
        duration: updated.reduce((sum, x) => sum + (x.duracao_minutos || x.duration || 30), 0),
        categoria: 'Combo Personalizado',
        showInPortal: true,
        active: true,
        permite_cortesia: false
      };
      setSelectedService(combined);
    }
  };

  // Auto-heal/sync appointments with closed comandas
  const syncClientAppointmentsWithComandas = async (clientUid: string, apps: Appointment[]) => {
    if (!clientUid || !apps || apps.length === 0) return;

    try {
      const qComandas = query(
        collection(db, 'comandas'),
        where('cliente_id', '==', clientUid),
        where('status', '==', 'fechada')
      );
      const snap = await getDocs(qComandas);
      if (snap.empty) return;

      const closedComandas = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));

      const closedAppIds = new Set<string>();
      const closedComandaIds = new Set<string>();

      closedComandas.forEach(c => {
        closedComandaIds.add(c.id);
        const apptId = c.agendamento_id || c.agendamentoId || c.appointment_id || c.appointmentId;
        if (apptId) closedAppIds.add(apptId);
      });

      const pendingToClose = apps.filter(app => {
        if (app.status === 'concluído' || app.status === 'cancelado' || app.status === 'faltou') {
          return false;
        }
        if (closedAppIds.has(app.id)) return true;
        if (app.comanda_id && closedComandaIds.has(app.comanda_id)) return true;

        const matchByDetails = closedComandas.some(c => {
          const comandaDate = c.createdAt?.toDate ? format(c.createdAt.toDate(), 'yyyy-MM-dd') : c.date;
          return (
            (c.cliente_id === app.cliente_id) &&
            (c.profissional_id === app.profissional_id) &&
            (comandaDate === app.date || c.date === app.date)
          );
        });

        return matchByDetails;
      });

      if (pendingToClose.length > 0) {
        for (const app of pendingToClose) {
          try {
            await updateDoc(doc(db, 'appointments', app.id), {
              status: 'concluído',
              updatedAt: serverTimestamp()
            });
            setAppointments(prev => prev.map(a => a.id === app.id ? { ...a, status: 'concluído' } : a));
          } catch (e) {
            console.warn("Failed to auto-heal appointment status:", e);
          }
        }
      }
    } catch (err) {
      console.warn("Error auto-healing client appointments with closed comandas:", err);
    }
  };

  useEffect(() => {
    loadData();

    if (!profile?.uid) return;

    // Sincronização em tempo real entre os painéis (Dono, Barbeiro e Cliente)
    const unsubscribeAppointments = appointmentService.subscribeToAppointments(
      { cliente_id: profile.uid },
      (updatedApps) => {
        setAppointments(updatedApps);
        syncClientAppointmentsWithComandas(profile.uid, updatedApps);
      }
    );

    const unsubscribeSubscriptions = subscriptionService.subscribeToSubscriptions(
      profile.uid,
      (updatedSubs) => {
        setSubscriptions(updatedSubs);
      }
    );

    return () => {
      unsubscribeAppointments();
      unsubscribeSubscriptions();
    };
  }, [profile?.uid, profile?.tenantId]);

  // Load available time slots when scheduling inputs change
  useEffect(() => {
    if (selectedBarber && selectedService && selectedDate) {
      loadSlots();
    } else {
      setAvailableSlots([]);
    }
  }, [selectedBarber, selectedService, selectedDate]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      setBookingStep(1);
      setSelectedBarber(null);
      setSelectedService(null);
      setSelectedServices([]);
      setSelectedTime(null);
    }
  }, [activeTab]);

  // Fidelidade tab is available for client cashback view

  const loadData = async () => {
    setLoading(true);
    try {
      let activeTenantId = getActiveTenantId();
      
      // Se o cliente tem um tenantId no perfil e não há parâmetro explicitamente na URL,
      // prioriza o tenantId do perfil para carregar a unidade correta dele.
      const params = new URLSearchParams(window.location.search);
      const urlTenant = params.get('tenant') || params.get('tenantId');
      if (!urlTenant && profile?.tenantId && profile.tenantId !== activeTenantId) {
        activeTenantId = profile.tenantId;
        localStorage.setItem('barberelite_tenant_id', activeTenantId);
      }

      // Load real tenants from DB
      try {
        const tenantsList = await tenantService.listTenants();
        if (tenantsList.length > 0) {
          const matchingTenant = tenantsList.find(t => t.id.toLowerCase() === activeTenantId.toLowerCase());
          if (matchingTenant) {
            setTenantInfo(matchingTenant);
          } else {
            activeTenantId = tenantsList[0].id;
            localStorage.setItem('barberelite_tenant_id', activeTenantId);
            setTenantInfo(tenantsList[0]);
          }
          setAllTenants(tenantsList);
        } else {
          localStorage.removeItem('barberelite_tenant_id');
          setTenantInfo(null);
          setAllTenants([]);
        }
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
        const activeBarbers = await userService.getAllBarbers(true, activeTenantId);
        const filtered = activeBarbers.filter(b => b.showInPortal !== false);
        const list: UserProfile[] = [];
        
        // Virtual barber for automatic allocation
        const virtualBarber: UserProfile = {
          uid: 'any',
          email: 'any@profissional.com',
          nome: 'Qualquer Profissional',
          tipo: 'barbeiro',
          ativo: true,
          especialidade: 'Melhor horário disponível',
          saldo_atual: 0,
          total_gasto: 0,
          total_pago: 0,
          total_em_aberto: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (filtered.length > 0) {
          list.push(virtualBarber, ...filtered);
        } else {
          // If empty, supply a "Profissional da Casa" to prevent empty/blank UI
          list.push({
            ...virtualBarber,
            nome: 'Profissional da Casa',
            especialidade: 'Atendimento geral'
          });
        }
        setBarbers(list);
      } catch (err) {
        console.warn("Could not load barbers list:", err);
      }

      // Load active services
      try {
        const activeServices = await serviceService.getServices(true, undefined, activeTenantId);
        setServices(activeServices.filter(s => s.active !== false && s.showInPortal !== false));
      } catch (err) {
        console.warn("Could not load services list:", err);
      }

      // Load active products
      try {
        const allProducts = await inventoryService.getProducts();
        setProducts(allProducts.filter(p => p.status !== 'inactive' && p.showInPortal !== false));
      } catch (err) {
        console.warn("Could not load products list:", err);
      }

      // Load announcements/news & promotions
      try {
        const qNews = query(collection(db, 'announcements'));
        const snapNews = await getDocs(qNews);
        const newsList = snapNews.docs.map(d => ({ id: d.id, ...d.data() }));
        const filteredNews = newsList.filter((item: any) => !item.tenantId || item.tenantId.toLowerCase() === activeTenantId.toLowerCase());
        setAnnouncements(filteredNews);
      } catch (err) {
        console.warn("Could not load announcements:", err);
      }

      if (profile?.uid) {
        // Load client's appointments
        try {
          const clientApps = await appointmentService.getAppointments({ cliente_id: profile.uid });
          setAppointments(clientApps);
          syncClientAppointmentsWithComandas(profile.uid, clientApps);
        } catch (err) {
          console.warn("Could not load client appointments list:", err);
        }

        // Load loyalty points & cashback & vouchers
        try {
          const loyaltyPoints = await loyaltyService.getClientPoints(profile.uid);
          setLoyalty(loyaltyPoints);
          const history = await loyaltyService.getHistory(profile.uid);
          setLoyaltyHistory(history);
          const vouchers = await loyaltyService.getClientVouchers(profile.uid);
          setClientVouchers(vouchers);
        } catch (err) {
          console.warn("Could not load client loyalty points & history:", err);
        }

        // Calculate total spent in barbearia and load all client comandas
        try {
          const qComandas = query(
            collection(db, 'comandas'),
            where('cliente_id', '==', profile.uid)
          );
          const comSnap = await getDocs(qComandas);
          const allComs = comSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setClientComandas(allComs);

          let sum = 0;
          allComs.forEach((data: any) => {
            if (data.status === 'fechada') {
              sum += Number(data.paidAmount || data.totalAmount || 0);
            }
          });
          setTotalSpent(sum);
        } catch (err) {
          console.warn("Could not calculate total spent or load client comandas:", err);
          setTotalSpent(profile.total_pago || profile.total_gasto || 0);
        }

        // Load subscriptions
        try {
          const clientSubs = await subscriptionService.getSubscriptions(profile.uid);
          setSubscriptions(clientSubs);
        } catch (err) {
          console.warn("Could not load client subscriptions list:", err);
        }

        // Load subscription invoices / financial history
        try {
          const qInvoices = query(
            collection(db, 'financial_transactions'),
            where('cliente_id', '==', profile.uid),
            where('category', '==', 'Assinaturas')
          );
          const invSnap = await getDocs(qInvoices);
          const invList = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          invList.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
          setSubscriptionInvoices(invList);
        } catch (err) {
          console.warn("Could not load subscription financial history:", err);
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
      } else {
        setAppointments([]);
        setLoyalty(null);
        setLoyaltyHistory([]);
        setClientVouchers([]);
        setClientComandas([]);
        setSubscriptions([]);
        setSubscriptionInvoices([]);
        setPackages([]);
      }

    } catch (err) {
      console.error("General error loading Portal Cliente data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTenant = async (newTenantId: string, targetTab = 'home') => {
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
    
    // Gracefully reload with new query params
    const params = new URLSearchParams(window.location.search);
    params.set('tenant', newTenantId);
    params.set('tab', targetTab);
    window.location.search = params.toString();
  };

  const loadSlots = async () => {
    if (!selectedBarber || !selectedService) return;
    
    if (getIsWalkInOnly().isWalkInOnly) {
      setAvailableSlots([]);
      setSelectedTime(null);
      return;
    }

    setLoadingSlots(true);
    try {
      const duration = selectedService.duracao_minutos || selectedService.duration || 30;
      let slots: string[] = [];

      if (selectedBarber.uid === 'any') {
        const realBarbers = barbers.filter(b => b.uid !== 'any');
        if (realBarbers.length > 0) {
          const allSlotsPromises = realBarbers.map(b => 
            appointmentService.getAvailableSlots(b.uid, selectedDate, duration, selectedService.id)
          );
          const results = await Promise.all(allSlotsPromises);
          // Get the union of all available slots and sort them
          slots = Array.from(new Set(results.flat() as string[])).sort();
        }
      } else {
        slots = await appointmentService.getAvailableSlots(
          selectedBarber.uid,
          selectedDate,
          duration,
          selectedService.id
        );
      }

      // Filter out past hours if selected date is today (local time)
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (selectedDate === todayStr) {
        const currentTimeStr = format(new Date(), 'HH:mm');
        slots = slots.filter(time => time >= currentTimeStr);
      }

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
    if (profile?.bloqueadoParaAgendar) {
      toast.error("Seu cadastro está bloqueado para agendamentos pelo app. Fale com a gerência.");
      return;
    }

    if (!selectedBarber || !selectedService || !selectedTime) {
      toast.error("Por favor, preencha todos os dados da reserva.");
      return;
    }

    // Validações no fluxo Guest (sem login prévio)
    if (!profile) {
      if (guestMode === 'register') {
        if (!guestName.trim()) {
          toast.error("Por favor, informe seu nome completo.");
          return;
        }
        const cleanPhone = guestPhone.replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 10) {
          toast.error("Por favor, informe um WhatsApp válido com DDD.");
          return;
        }
        if (!guestEmail.trim() || !guestEmail.includes('@')) {
          toast.error("Por favor, informe um e-mail válido.");
          return;
        }
        if (!guestPassword || guestPassword.length < 6) {
          toast.error("Defina uma senha com no mínimo 6 dígitos para acompanhar seu horário.");
          return;
        }
      } else {
        if (!guestEmail.trim()) {
          toast.error("Por favor, informe seu e-mail de acesso.");
          return;
        }
        if (!guestPassword) {
          toast.error("Por favor, informe sua senha.");
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      let activeTenantId = (tenantInfo?.id || getActiveTenantId() || 'default').toLowerCase();
      let duration = selectedService.duracao_minutos || selectedService.duration || 30;
      let assignedBarberId = selectedBarber.uid;
      let assignedBarberName = selectedBarber.nome;

      if (selectedBarber.uid === 'any') {
        // Find the first barber that has this slot available
        const realBarbers = barbers.filter(b => b.uid !== 'any');
        let foundBarber = null;
        for (const b of realBarbers) {
          const slots = await appointmentService.getAvailableSlots(b.uid, selectedDate, duration, selectedService.id);
          if (slots.includes(selectedTime)) {
            foundBarber = b;
            break;
          }
        }

        if (foundBarber) {
          assignedBarberId = foundBarber.uid;
          assignedBarberName = foundBarber.nome;
        } else if (realBarbers.length > 0) {
          assignedBarberId = realBarbers[0].uid;
          assignedBarberName = realBarbers[0].nome;
        } else {
          assignedBarberId = 'casa';
          assignedBarberName = 'Profissional da Casa';
        }
      }

      // Check if selected or assigned professional has custom duration override for this service
      const chosenBarber = barbers.find(b => b.uid === assignedBarberId);
      if (chosenBarber && chosenBarber.servicos_duracoes && chosenBarber.servicos_duracoes[selectedService.id]) {
        const overrideVal = chosenBarber.servicos_duracoes[selectedService.id];
        if (overrideVal && overrideVal > 0) {
          duration = overrideVal;
        }
      }

      const startParsed = parse(selectedTime, 'HH:mm', new Date());
      const endParsed = addMinutes(startParsed, duration);
      const endTimeStr = format(endParsed, 'HH:mm');

      let clientId = profile?.uid;
      let clientName = profile?.nome || guestName.trim();
      let clientPhone = profile?.telefone || profile?.phone || guestPhone.trim();

      // Fluxo Guest: Criar conta ou realizar login transparente
      if (!profile) {
        if (guestMode === 'register') {
          const cleanPhone = guestPhone.replace(/\D/g, '');
          const resolvedEmail = guestEmail.trim() ? guestEmail.trim().toLowerCase() : `cli_${cleanPhone}_${activeTenantId}@barberelite.app`;

          let userCred;
          try {
            userCred = await createUserWithEmailAndPassword(auth, resolvedEmail, guestPassword);
          } catch (authErr: any) {
            if (authErr.code === 'auth/email-already-in-use') {
              try {
                userCred = await signInWithEmailAndPassword(auth, resolvedEmail, guestPassword);
              } catch (loginErr) {
                throw new Error("Este e-mail/telefone já está cadastrado. Alterne para a opção 'Já Tenho Conta' para entrar.");
              }
            } else if (authErr.code === 'auth/weak-password') {
              throw new Error("A senha deve ter pelo menos 6 caracteres.");
            } else {
              throw authErr;
            }
          }

          clientId = userCred.user.uid;

          // Criar/atualizar perfil do usuário no Firestore
          await setDoc(doc(db, 'usuarios', clientId), {
            uid: clientId,
            nome: guestName.trim(),
            email: resolvedEmail,
            telefone: guestPhone.trim(),
            phone: guestPhone.trim(),
            tipo: 'cliente',
            ativo: true,
            tenantId: activeTenantId,
            saldo_atual: 0,
            total_gasto: 0,
            total_pago: 0,
            total_em_aberto: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true });

        } else {
          // Já tem conta: login com e-mail e senha
          const userCred = await signInWithEmailAndPassword(auth, guestEmail.trim(), guestPassword);
          clientId = userCred.user.uid;

          const snap = await getDoc(doc(db, 'usuarios', clientId));
          if (snap.exists()) {
            const data = snap.data();
            clientName = data.nome || clientName;
            clientPhone = data.telefone || data.phone || clientPhone;
          }
        }
      }

      const effectivePrice = calculateEffectivePrice(selectedServices.length > 0 ? selectedServices : [selectedService]);
      const hasCoveredService = selectedServices.some(s => getServiceSubscriptionStatus(s).isCovered) || getServiceSubscriptionStatus(selectedService).isCovered;
      const activeSub = subscriptions.find(s => s.status === 'active');

      const newApp = {
        cliente_id: clientId!,
        cliente_name: clientName,
        cliente_telefone: clientPhone,
        profissional_id: assignedBarberId,
        profissional_name: assignedBarberName,
        servico_id: selectedService.id,
        servico_name: selectedService.nome || selectedService.name || '',
        date: selectedDate,
        startTime: selectedTime,
        endTime: endTimeStr,
        duration: duration,
        price: effectivePrice,
        isSubscriptionCovered: hasCoveredService,
        subscriptionPlanName: hasCoveredService ? (activeSub?.planName || 'Clube de Assinatura') : undefined,
        status: 'agendado' as const,
        origin: (profile ? 'cliente' : 'guest_first') as any,
        tenantId: activeTenantId,
        notes: hasCoveredService 
          ? (profile ? `Agendado via Portal do Cliente (Benefício do Clube: ${activeSub?.planName || 'Assinatura Ativa'} - Comanda Zerada)` : 'Agendado via Portal do Cliente') 
          : (profile ? 'Agendado via Portal do Cliente' : 'Agendamento Online Rápido (Guest-First Booking)'),
        selectedServices: (selectedServices.length > 0 ? selectedServices : [selectedService]).map(s => {
          const subStatus = getServiceSubscriptionStatus(s);
          return {
            id: s.id,
            nome: s.nome || s.name || '',
            preco: subStatus.isCovered ? 0 : (s.preco || s.price || 0),
            originalPrice: s.preco || s.price || 0,
            isSubscriptionCovered: subStatus.isCovered,
            duracao: s.duracao_minutos || s.duration || 30
          };
        })
      };

      const createdApp = await appointmentService.createAppointment(newApp);
      
      toast.success("Agendamento realizado com sucesso!");

      const confirmedData = {
        id: typeof createdApp === 'string' ? createdApp : (createdApp as any)?.id || '',
        serviceName: selectedService.nome || selectedService.name || 'Serviço',
        barberName: assignedBarberName,
        date: selectedDate,
        time: selectedTime,
        duration: duration,
        price: selectedService.preco || selectedService.price || 0,
        tenantName: tenantInfo?.name || 'Barbearia',
        tenantPhone: tenantInfo?.phone || tenantInfo?.whatsapp || '',
        clientName: clientName
      };

      setGuestCreatedAppointment(confirmedData);
      
      // Reset Scheduling Form
      setSelectedBarber(null);
      setSelectedService(null);
      setSelectedServices([]);
      setSelectedTime(null);
      setBookingStep(1);
      
      // Reload Data
      await loadData();
    } catch (err: any) {
      console.error("Error scheduling appointment:", err);
      toast.error(err.message || "Erro ao agendar horário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeCancelAppointment = async (appId: string) => {
    try {
      await appointmentService.cancelAppointment(appId);
      toast.success("Agendamento cancelado com sucesso.");
      await loadData();
    } catch (err) {
      console.error("Error canceling appointment:", err);
      toast.error("Erro ao cancelar o agendamento.");
    }
  };

  const handleCancelAppointment = (appId: string) => {
    if (confirmingCancelAppId === appId) {
      if (cancelTimeoutRef.current) {
        clearTimeout(cancelTimeoutRef.current);
      }
      setConfirmingCancelAppId(null);
      executeCancelAppointment(appId);
    } else {
      if (cancelTimeoutRef.current) {
        clearTimeout(cancelTimeoutRef.current);
      }
      setConfirmingCancelAppId(appId);
      cancelTimeoutRef.current = setTimeout(() => {
        setConfirmingCancelAppId(null);
      }, 4000); // 4 seconds to confirm
    }
  };

  const handleSubmitReview = async () => {
    if (!selectedAppForReview || !profile?.uid) return;
    setIsSubmittingReview(true);
    try {
      await addDoc(collection(db, 'avaliacoes'), {
        agendamento_id: selectedAppForReview.id,
        cliente_id: profile.uid,
        cliente_name: profile.nome || 'Cliente',
        profissional_id: selectedAppForReview.profissional_id,
        profissional_name: selectedAppForReview.profissional_name,
        rating: reviewRating,
        comentario: reviewComment,
        tenantId: selectedAppForReview.tenantId || getActiveTenantId(),
        createdAt: serverTimestamp()
      });
      toast.success("Avaliação enviada com sucesso! Muito obrigado pelo seu feedback.");
      setReviewModalOpen(false);
      setSelectedAppForReview(null);
      setReviewComment('');
      setReviewRating(5);
    } catch (err) {
      console.error("Error saving review:", err);
      toast.error("Erro ao enviar avaliação. Tente novamente.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Filter future active appointments
  const futureAppointments = appointments.filter(app => {
    if (app.status === 'cancelado' || app.status === 'faltou' || app.status === 'concluído') return false;
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

  // Generate date options (next 30 working days)
  const dateOptions: { dateStr: string; dayLabel: string; monthLabel: string }[] = [];
  let tempDate = new Date();
  for (let i = 0; i < 30; i++) {
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

  const getSlotsByPeriod = () => {
    const morning: string[] = [];
    const afternoon: string[] = [];
    const evening: string[] = [];

    availableSlots.forEach(slot => {
      const hour = parseInt(slot.split(':')[0], 10);
      if (hour < 12) {
        morning.push(slot);
      } else if (hour < 18) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    });

    return { morning, afternoon, evening };
  };

  // Unified Navigation Items
  const navItems = [
    { id: 'home', label: 'Início', icon: Calendar },
    { id: 'schedule', label: 'Reservar', icon: Scissors },
    ...(profile ? [
      { id: 'history', label: 'Histórico', icon: History },
      { id: 'fidelidade', label: 'Fidelidade', icon: Award },
      { id: 'pacotes', label: 'Pacotes', icon: Briefcase },
      { id: 'assinaturas', label: 'Assinaturas', icon: Sparkles },
      { id: 'perfil', label: 'Perfil', icon: User }
    ] : [])
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 overflow-hidden w-full">
      
      {/* 1. Desktop Left Sidebar */}
      <aside className={`hidden md:flex flex-col border-r border-slate-100 bg-white transition-all duration-300 relative shrink-0 z-30 ${
        sidebarExpanded ? 'w-64' : 'w-20'
      }`}>
        {/* Logo Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className={`flex items-center gap-3 overflow-hidden ${sidebarExpanded ? 'opacity-100' : 'opacity-0 md:w-0'}`}>
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/20">
              <Scissors size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 truncate">
              {tenantInfo?.name || 'Cliente'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors border border-slate-100 shadow-sm"
            title={sidebarExpanded ? "Recolher menu" : "Expandir menu"}
          >
            <ChevronDown size={14} className={`transform transition-transform ${sidebarExpanded ? 'rotate-90' : '-rotate-90'}`} />
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={`side-nav-${item.id}`}
                onClick={() => {
                  setActiveTab(item.id as any);
                }}
                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all font-bold text-[11px] uppercase tracking-wider ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10' 
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-850'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400'} />
                <span className={sidebarExpanded ? 'block' : 'hidden'}>{item.label}</span>
              </button>
            );
          })}
          
          {!profile && onLoginClick && sidebarExpanded && (
            <button
              type="button"
              onClick={onLoginClick}
              className="mt-4 w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest text-amber-600 bg-amber-50 hover:bg-amber-100"
            >
              <User size={16} className="text-amber-600" />
              <span>Já Tenho Conta</span>
            </button>
          )}
        </div>

        {/* Sidebar Profile Footer */}
        {profile && sidebarExpanded && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200">
              {(profile.nome || 'C').substring(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-800 truncate leading-none mb-1">{profile.nome}</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Cliente VIP</p>
            </div>
          </div>
        )}
      </aside>

      {/* 2. Mobile Sliding Drawer Sidebar */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950 z-50 md:hidden"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-100 shadow-2xl z-50 flex flex-col md:hidden"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow">
                    <Scissors size={18} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                    {tenantInfo?.name || 'Cliente'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Navigation Items */}
              <div className="flex-1 py-5 px-4 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={`mob-nav-${item.id}`}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all font-black text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-50 hover:text-slate-850"
                    >
                      <Icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                
                {!profile && onLoginClick && (
                  <button
                    type="button"
                    onClick={() => {
                      onLoginClick();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all font-black text-xs uppercase tracking-wider text-amber-600 bg-amber-50 hover:bg-amber-100"
                  >
                    <User size={18} className="text-amber-600" />
                    <span>Já Tenho Conta</span>
                  </button>
                )}
              </div>

              {/* Profile Footer */}
              {profile && (
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {(profile.nome || 'C').substring(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-800 truncate leading-none mb-1">{profile.nome}</p>
                    <p className="text-xs text-slate-400 font-semibold truncate">{profile.email}</p>
                  </div>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* 3. Main Content Pane Wrapper */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto w-full md:pb-6">
        
        {/* Sticky Mobile Header Bar */}
        <div className="md:hidden bg-slate-900 border-b border-slate-800 text-white px-5 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <span className="text-[10px] font-black tracking-widest uppercase text-amber-400">
              {tenantInfo?.name || 'Agendamento'}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-800 text-indigo-400 border border-slate-700/50 flex items-center justify-center font-bold text-xs">
            {profile ? (profile.nome || 'C').substring(0, 1).toUpperCase() : <Scissors size={14} />}
          </div>
        </div>

        {/* Superadmin Mode Banner */}
        {isSaaSAdminUser && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-black flex items-center justify-between shadow-md z-30">
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <span>Simulação de Perfil (Portal do Cliente)</span>
            </div>
            <button
              onClick={() => setOverrideRole(null)}
              className="bg-slate-950 hover:bg-slate-900 text-white px-3 py-1 rounded-lg text-[10px] uppercase font-extrabold tracking-wider transition-all"
            >
              🚀 Voltar ao Painel SaaS
            </button>
          </div>
        )}

      {/* Header Panel */}
      <header className="bg-slate-900 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
              {profile ? (profile.nome || 'Cliente').substring(0, 2).toUpperCase() : <Scissors size={22} />}
            </div>
            <div>
              <p className="text-[10px] text-amber-400 font-extrabold uppercase tracking-widest">
                {profile ? 'Seja bem-vindo!' : 'Agendamento Online 24h'}
              </p>
              <h2 className="text-base font-black tracking-tight">
                {profile?.nome || tenantInfo?.name || 'Barbearia'}
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                <MapPin size={11} className="text-amber-500 flex-shrink-0" />
                <span className="text-amber-100 bg-slate-800 text-[11px] font-black tracking-wide px-2.5 py-1 rounded-lg border border-slate-700/60 shadow-sm">
                  {tenantInfo?.name || 'Unidade Principal'}
                </span>
              </div>
            </div>
          </div>
          
          {profile ? (
            <button 
              onClick={handleLogout}
              className="p-3 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 rounded-2xl border border-white/5 hover:border-rose-500/20 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              {onLoginClick && (
                <button
                  type="button"
                  onClick={onLoginClick}
                  className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/10 flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <User size={14} />
                  <span>Já Tenho Conta</span>
                </button>
              )}
              {onBackToLanding && !getActiveTenantId() && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl border border-white/10 text-xs font-bold transition-all cursor-pointer"
                  title="Voltar à página inicial"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
            </div>
          )}
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
              {!profile ? (
                /* EXCLUSIVE TENANT SHOWCASE FOR GUESTS */
                <div className="space-y-8">
                  {/* Hero Cover Banner */}
                  <div className="relative rounded-[32px] overflow-hidden bg-slate-900 border border-slate-100 shadow-sm">
                    <div className="h-48 md:h-64 relative">
                      <img 
                        src={tenantInfo?.coverImage || "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80"} 
                        alt="Barbearia Cover" 
                        className="w-full h-full object-cover opacity-60"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                    </div>
                    
                    <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-white rounded-2xl p-1 shadow-md flex items-center justify-center overflow-hidden flex-shrink-0">
                          {tenantInfo?.logoUrl ? (
                            <img 
                              src={tenantInfo.logoUrl} 
                              alt="Barbearia Logo" 
                              className="w-full h-full object-cover rounded-xl"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white font-black text-2xl rounded-xl" style={{ backgroundColor: tenantInfo?.accentColor || '#6366F1' }}>
                              {tenantInfo?.name?.charAt(0).toUpperCase() || 'B'}
                            </div>
                          )}
                        </div>
                        <div className="text-white">
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">Barbearia Exclusiva</span>
                          <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-none mt-1">{tenantInfo?.name || 'GB Cortes'}</h1>
                          <p className="text-xs text-slate-300 font-semibold mt-1">
                            {tenantInfo?.address?.city || 'São Paulo'} - {tenantInfo?.address?.state || 'SP'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('schedule')}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-amber-500/20 uppercase tracking-wider flex items-center gap-2 active:scale-95 w-full md:w-auto justify-center"
                      >
                        <Scissors size={14} />
                        Agendar Horário
                      </button>
                    </div>
                  </div>

                  {/* About Section */}
                  <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Nossa História</h3>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed">
                      {tenantInfo?.aboutText || "Oferecemos uma experiência completa de cuidado e estilo, com cortes de cabelo modernos, alinhamento de barba, tratamentos capilares e um ambiente acolhedor com atendimento qualificado."}
                    </p>
                  </div>

                  {/* Services & Prices Showcase Grid */}
                  <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <Scissors className="text-amber-500" size={20} />
                        Serviços & Valores
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">Confira nossa tabela completa de serviços profissionais</p>
                    </div>

                    {services.length > 0 ? (
                      <div className="space-y-8">
                        {(Object.entries(
                          services.reduce((acc, service) => {
                            const cat = service.categoria || 'Geral';
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(service);
                            return acc;
                          }, {} as Record<string, Service[]>)
                        ) as [string, Service[]][]).map(([categoryName, catServices]) => (
                          <div key={`category-group-${categoryName}`} className="space-y-4">
                            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
                              <h4 className="text-xs font-black uppercase text-indigo-600 tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                {categoryName}
                              </h4>
                              <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500 font-bold">
                                {catServices.length} {catServices.length === 1 ? 'serviço' : 'serviços'}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {catServices.map((service, sIdx) => (
                                <div 
                                  key={`showcase-svc-${service.id || sIdx}`}
                                  className="p-4 bg-slate-50/50 hover:bg-slate-50 rounded-2xl border border-slate-100/80 hover:border-slate-200 transition-all flex flex-col justify-between gap-3 group"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <h4 className="text-xs font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{service.nome}</h4>
                                      <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2.5 py-1 rounded-lg whitespace-nowrap">
                                        R$ {Number(service.preco || 0).toFixed(2)}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                      {service.descricao || "Atendimento especializado realizado com produtos de alta qualidade."}
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold pt-1 border-t border-slate-100/50">
                                    <span className="flex items-center gap-1"><Clock size={11} /> {service.duracao_minutos || service.duration || 30} min</span>
                                    <button 
                                      onClick={() => {
                                        setSelectedService(service);
                                        setBookingStep(1); // Go choose professional
                                        setActiveTab('schedule');
                                      }}
                                      className="text-indigo-600 font-black uppercase hover:underline flex items-center gap-1 group-hover:text-indigo-700"
                                    >
                                      Agendar este <ChevronRight size={10} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">Nenhum serviço listado no momento.</p>
                    )}
                  </div>

                  {/* Our Professional Team */}
                  {barbers.filter(b => b.uid !== 'any').length > 0 && (
                    <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                      <div>
                        <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                          <User className="text-amber-500" size={20} />
                          Nossos Profissionais
                        </h3>
                        <p className="text-xs text-slate-500 font-semibold mt-0.5">Mestres das tesouras e navalhas prontos para te atender</p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {barbers.filter(b => b.uid !== 'any').map((barber, bIdx) => (
                          <div 
                            key={`showcase-barber-${barber.uid || bIdx}`}
                            className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center space-y-2"
                          >
                            <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center font-black text-indigo-600 text-sm">
                              {(barber.nome || 'Barbeiro').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs font-black text-slate-800 truncate">{barber.nome}</h4>
                              <p className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{barber.especialidade || 'Barbeiro especialista'}</p>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedBarber(barber);
                                setBookingStep(2); // Choose Service next
                                setActiveTab('schedule');
                              }}
                              className="text-[9px] font-black text-indigo-600 hover:text-indigo-700 uppercase bg-white px-2.5 py-1 rounded-lg border border-slate-200 tracking-wider shadow-xs hover:border-indigo-400 transition-all cursor-pointer"
                            >
                              Ver Agenda
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contact & Location card */}
                  <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                    <div>
                      <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <MapPin className="text-amber-500" size={20} />
                        Localização & Contato
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">Saiba onde estamos e tire suas dúvidas</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3 text-xs font-semibold text-slate-600 leading-relaxed">
                        <p className="flex items-start gap-2.5">
                          <MapPin size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                          <span>
                            <strong>Endereço:</strong><br />
                            {tenantInfo?.address?.street ? (
                              <>
                                {tenantInfo.address.street}, {tenantInfo.address.number || 'S/N'}<br />
                                {tenantInfo.address.neighborhood && <>{tenantInfo.address.neighborhood}<br /></>}
                                {tenantInfo.address.city} - {tenantInfo.address.state || 'SP'}
                              </>
                            ) : (
                              "Rua Principal da Barbearia, Centro"
                            )}
                          </span>
                        </p>
                        
                        {(tenantInfo?.phone || tenantInfo?.email) && (
                          <p className="flex items-start gap-2.5">
                            <Phone size={14} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                            <span>
                              <strong>Contato:</strong><br />
                              {tenantInfo.phone && <>Telefone: {tenantInfo.phone}<br /></>}
                              {tenantInfo.email && <>E-mail: {tenantInfo.email}</>}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2.5 justify-center font-bold">
                        {tenantInfo?.whatsapp && (
                          <a
                            href={`https://wa.me/${tenantInfo.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-emerald-600/10"
                          >
                            <Phone size={14} /> Falar no WhatsApp
                          </a>
                        )}
                        {tenantInfo?.instagram && (
                          <a
                            href={`https://instagram.com/${tenantInfo.instagram.replace('@', '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
                          >
                            <Instagram size={14} /> Siga-nos no Instagram
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* EXISTING LOGGED-IN CUSTOMER HOME STATE */
                <>
                  {/* Notícias & Promoções Banner Widget */}
                  {announcements.length > 0 && (
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Megaphone className="text-amber-500 animate-pulse" size={18} />
                          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">
                            Mural de Notícias & Promoções
                          </h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          {announcements.length} {announcements.length === 1 ? 'comunicado' : 'comunicados'}
                        </span>
                      </div>

                      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none">
                        {announcements.map((item, idx) => (
                          <div
                            key={`announcement-${item.id || idx}-${idx}`}
                            onClick={() => setAnnouncementModalData(item)}
                            className="min-w-[260px] max-w-[280px] bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 rounded-2xl border border-slate-700/60 shadow-sm flex flex-col justify-between cursor-pointer hover:border-amber-500/50 transition-all shrink-0 group"
                          >
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                  item.category === 'promocao' || item.category === 'Promoção'
                                    ? 'bg-amber-500 text-slate-950'
                                    : item.category === 'aviso' || item.category === 'Aviso'
                                    ? 'bg-rose-500 text-white'
                                    : 'bg-indigo-500 text-white'
                                }`}>
                                  {item.category || 'Novidade'}
                                </span>
                                {item.date && (
                                  <span className="text-[9px] text-slate-400 font-semibold">
                                    {item.date}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-black group-hover:text-amber-400 transition-colors line-clamp-1">
                                {item.title}
                              </h4>
                              <p className="text-[11px] text-slate-300 font-medium line-clamp-2 leading-relaxed">
                                {item.content}
                              </p>
                            </div>
                            <div className="mt-3 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[10px] text-amber-400 font-bold">
                              <span>Ler mais</span>
                              <ChevronRight size={12} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Smart Rebooking Card ("Cortei há X dias") */}
                  {(() => {
                    if (futureAppointments.length > 0) return null;
                    const lastCompletedApp = pastAppointments.find(a => a.status === 'concluído');
                    if (!lastCompletedApp) return null;

                    let daysSinceLastCut = 0;
                    try {
                      const lastDate = parse(lastCompletedApp.date, 'yyyy-MM-dd', new Date());
                      const today = new Date();
                      lastDate.setHours(0, 0, 0, 0);
                      today.setHours(0, 0, 0, 0);
                      daysSinceLastCut = Math.max(0, Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)));
                    } catch (e) {
                      return null;
                    }

                    const handleQuickRebook = () => {
                      const matchingBarber = barbers.find(b => b.uid === lastCompletedApp.profissional_id || b.nome === lastCompletedApp.profissional_name);
                      const matchingService = services.find(s => s.id === lastCompletedApp.servico_id || s.nome === lastCompletedApp.servico_name);

                      if (matchingBarber) setSelectedBarber(matchingBarber);
                      if (matchingService) setSelectedService(matchingService);

                      setActiveTab('schedule');
                      toast.success(`Barbeiro e serviço selecionados! Escolha a data para repetir seu agendamento.`);
                    };

                    return (
                      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 p-6 rounded-[32px] text-slate-950 shadow-md relative overflow-hidden space-y-3">
                        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-950 text-amber-400 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1">
                            <Scissors size={10} /> Frequência de Cortes
                          </span>
                        </div>
                        <div>
                          <h3 className="text-base font-black tracking-tight text-slate-950">
                            Faz {daysSinceLastCut} {daysSinceLastCut === 1 ? 'dia' : 'dias'} desde seu último atendimento!
                          </h3>
                          <p className="text-xs font-semibold text-slate-900/80 mt-1">
                            Você cortou em {format(parse(lastCompletedApp.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')} com <span className="font-bold text-slate-950">{lastCompletedApp.profissional_name}</span>. Que tal manter o visual alinhado?
                          </p>
                        </div>
                        <button
                          onClick={handleQuickRebook}
                          className="bg-slate-950 hover:bg-slate-900 text-amber-400 font-black text-xs px-5 py-3 rounded-2xl transition-all shadow-md flex items-center gap-2 uppercase tracking-wider active:scale-95"
                        >
                          <Scissors size={14} /> Reagendar {lastCompletedApp.servico_name} em 1 Clique
                        </button>
                      </div>
                    );
                  })()}

                  {/* Next Appointment Card */}
                  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]">
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
                            className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-all ${
                              confirmingCancelAppId === futureAppointments[0].id
                                ? 'bg-rose-600 text-white animate-pulse shadow-sm'
                                : 'text-rose-500 hover:bg-rose-50 hover:underline'
                            }`}
                          >
                            {confirmingCancelAppId === futureAppointments[0].id ? 'Confirmar Cancelamento?' : 'Cancelar Horário'}
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

                  {/* Subscriptions / Packages Widgets */}
                  {(() => {
                    const activeSubs = subscriptions.filter(s => s.status === 'active');
                    if (activeSubs.length === 0 && packages.length === 0) return null;

                    return (
                      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                          <ShieldCheck className="text-emerald-500 animate-pulse" size={16} />
                          Meus Planos e Combos Ativos
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {/* Active Subscriptions */}
                          {activeSubs.map((sub, sIdx) => (
                            <div key={`active-sub-${sub.id || sIdx}-${sIdx}`} className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex justify-between items-center">
                              <div>
                                <p className="text-xs font-black text-emerald-800">{sub.planName}</p>
                                <p className="text-[10px] text-emerald-600/80 font-bold mt-1">Cortes: {sub.haircutsUsed} usados / Barbas: {sub.beardsUsed} usadas</p>
                                <p className="text-[9px] text-slate-400 mt-1 font-semibold">Válido até: {sub.endDate ? format(parse(sub.endDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''}</p>
                              </div>
                              <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">Assinante</span>
                            </div>
                          ))}

                          {/* Active Packages */}
                          {packages.map((pkg, pIdx) => (
                            <div key={`active-pkg-${pkg.id || pIdx}-${pIdx}`} className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl flex justify-between items-center">
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
                    );
                  })()}

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
                        {futureAppointments.map((app, appIdx) => (
                          <div key={`next-app-${app.id || appIdx}-${appIdx}`} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
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
                                className={`transition-all rounded-xl ${
                                  confirmingCancelAppId === app.id
                                    ? 'bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider animate-pulse'
                                    : 'p-2 text-rose-500 hover:bg-rose-50'
                                }`}
                                title={confirmingCancelAppId === app.id ? "Confirmar Cancelamento?" : "Cancelar Agendamento"}
                              >
                                {confirmingCancelAppId === app.id ? (
                                  <span>Confirmar?</span>
                                ) : (
                                  <AlertCircle size={18} />
                                )}
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
                </>
              )}
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
              {subscriptions.filter(s => s.status !== 'canceled').length > 0 && !subscriptions.some(s => s.status === 'active') ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-6">
                  <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-center text-rose-500 shadow-inner animate-pulse">
                    <AlertCircle size={36} className="text-red-500" />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <h3 className="text-xl font-black text-rose-600 tracking-tight">Agendamento Bloqueado - Assinatura Vencida</h3>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed">
                      Sua assinatura do clube de benefícios está vencida ou suspensa. Por este motivo, o agendamento de novos atendimentos está bloqueado.
                    </p>
                    <p className="text-xs font-semibold text-rose-500 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
                      Acesse a aba de "Assinaturas" para conferir os detalhes e regularizar o seu plano.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('assinaturas')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/10 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Sparkles size={14} /> Ver Minha Assinatura
                  </button>
                </div>
              ) : profile?.bloqueadoParaAgendar ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-6">
                  <div className="w-20 h-20 bg-rose-50 border border-rose-100 rounded-3xl flex items-center justify-center text-rose-500 shadow-inner">
                    <UserX size={36} />
                  </div>
                  <div className="space-y-2 max-w-md">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Agendamento Suspenso</h3>
                    <p className="text-sm font-medium text-slate-500 leading-relaxed">
                      Seu cadastro está temporariamente bloqueado para realizar agendamentos automáticos pelo aplicativo.
                    </p>
                    <p className="text-xs font-semibold text-slate-400">
                      Por favor, entre em contato diretamente com a equipe da barbearia para obter mais informações ou regularizar seu acesso.
                    </p>
                  </div>
                  {(tenantInfo?.phone || tenantInfo?.whatsapp) && (
                    <a
                      href={`https://wa.me/${(tenantInfo.whatsapp || tenantInfo.phone || '').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/10 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Phone size={14} /> Falar com Atendente
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <h3 className="text-xl font-black tracking-tight flex items-center gap-2 text-slate-800">
                        <Scissors className="text-amber-500 animate-pulse" size={22} />
                        Reservar Horário
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        Sua reserva é confirmada instantaneamente na agenda do profissional.
                      </p>
                    </div>
                  </div>

                  {/* Interactive Stepper Header */}
                  <div className="w-full flex items-center justify-between bg-slate-50 border border-slate-100 p-3 sm:p-4 rounded-2xl">
                    {[
                      { step: 1, label: 'Profissional', icon: User },
                      { step: 2, label: 'Serviço', icon: Scissors },
                      { step: 3, label: 'Dia e Hora', icon: Clock },
                      { step: 4, label: 'Confirmação', icon: CheckCircle2 }
                    ].map((s, idx) => {
                      const isActive = bookingStep === s.step;
                      const isCompleted = bookingStep > s.step;
                      return (
                        <React.Fragment key={`step-head-${s.step}`}>
                          <button
                            type="button"
                            disabled={s.step > bookingStep && !((s.step === 2 && selectedBarber) || (s.step === 3 && selectedBarber && selectedService) || (s.step === 4 && selectedBarber && selectedService && selectedTime))}
                            onClick={() => setBookingStep(s.step as any)}
                            className={`flex items-center gap-2 transition-all duration-200 ${
                              isActive 
                                ? 'text-indigo-600 font-black scale-105' 
                                : isCompleted 
                                  ? 'text-emerald-600 font-bold hover:text-indigo-650' 
                                  : 'text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                              isActive 
                                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-650/20' 
                                : isCompleted 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-slate-100 text-slate-400'
                            }`}>
                              {isCompleted ? <Check size={12} className="stroke-[3]" /> : s.step}
                            </div>
                            <span className="hidden md:inline text-xs tracking-tight">{s.label}</span>
                          </button>
                          {idx < 3 && (
                            <div className={`flex-1 h-[2px] mx-1 hidden md:block ${bookingStep > s.step ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Back button for wizard steps */}
                  {bookingStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setBookingStep((prev) => (prev - 1) as any)}
                      className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-indigo-600 transition-colors uppercase tracking-wider border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 rounded-xl w-fit"
                    >
                      <ArrowLeft size={12} className="stroke-[3]" /> Voltar Passo
                    </button>
                  )}

                  {/* STEP 1: SELECT BARBER */}
                  {bookingStep === 1 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 animate-fadeIn"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                          Etapa 1. Com quem você deseja realizar o atendimento?
                        </label>
                        <p className="text-xs text-slate-500 font-medium">Selecione seu barbeiro preferido ou escolha a opção sem preferência.</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {barbers.map((b, bIdx) => {
                          const isSelected = selectedBarber?.uid === b.uid;
                          const isVirtual = b.uid === 'any';
                          return (
                            <button
                              key={`barber-item-${b.uid || bIdx}-${bIdx}`}
                              type="button"
                              onClick={() => {
                                setSelectedBarber(b);
                                setSelectedService(null);
                                setSelectedTime(null);
                                setBookingStep(2);
                              }}
                              className={`p-5 rounded-2xl border transition-all text-left flex items-center gap-4 relative group ${
                                isSelected 
                                  ? 'border-indigo-600 bg-indigo-50/30 shadow-md ring-2 ring-indigo-600/10' 
                                  : isVirtual
                                    ? 'border-amber-200 bg-gradient-to-br from-amber-50/30 to-amber-100/20 hover:from-amber-50/50 hover:to-amber-100/30 hover:border-amber-300'
                                    : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200 shadow-sm'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-3 right-3 bg-indigo-600 text-white p-0.5 rounded-full shadow">
                                  <Check size={10} />
                                </div>
                              )}
                              
                              {isVirtual && !isSelected && (
                                <div className="absolute top-3 right-3 text-amber-500 animate-pulse">
                                  <Sparkles size={14} className="fill-amber-400/20" />
                                </div>
                              )}

                              <div className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center font-black text-lg transition-all flex-shrink-0 border-2 ${
                                isSelected 
                                  ? 'border-indigo-600 bg-indigo-600 text-white' 
                                  : isVirtual 
                                    ? 'border-amber-200 bg-amber-100 text-amber-700' 
                                    : 'border-white bg-slate-200 text-slate-600 shadow'
                              }`}>
                                {isVirtual ? (
                                  <Sparkles size={24} className="fill-amber-400/20 text-amber-600" />
                                ) : b.fotoUrl || b.avatarUrl ? (
                                  <img 
                                    src={b.fotoUrl || b.avatarUrl} 
                                    alt={b.nome} 
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  (b.nome || 'B').substring(0, 2).toUpperCase()
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-slate-800 truncate flex items-center gap-1.5">
                                  {b.nome}
                                  {isVirtual && (
                                    <span className="bg-amber-100 text-amber-800 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                      Livre
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                                  {b.especialidade || 'Barbeiro especialista'}
                                </p>
                                <span className="text-[10px] text-indigo-600 font-extrabold hover:underline mt-2 inline-flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                                  Escolher <ChevronRight size={10} className="stroke-[3]" />
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 2: SELECT SERVICE */}
                  {bookingStep === 2 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4 animate-fadeIn"
                    >
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                          Etapa 2. Qual serviço você deseja realizar?
                        </label>
                        <p className="text-xs text-slate-500 font-medium">Você pode escolher um ou mais procedimentos para o mesmo agendamento. Você está agendando com <strong>{selectedBarber?.nome}</strong>.</p>
                      </div>

                      {services.length === 0 ? (
                        <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                          <p className="text-xs text-slate-400 font-semibold">Nenhum serviço disponível no portal no momento.</p>
                        </div>
                      ) : (
                        <div className="space-y-6 pt-2">
                          {/* Categorias - Abas Estilo Pills Horizontais */}
                          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
                            {['Todos', ...Array.from(new Set(services.map(s => s.categoria || 'Geral')))].map((cat) => {
                              const isSelected = activeCategoryTab === cat;
                              const count = cat === 'Todos' 
                                ? services.length 
                                : services.filter(s => (s.categoria || 'Geral') === cat).length;

                              return (
                                <button
                                  key={`cat-pill-${cat}`}
                                  type="button"
                                  onClick={() => setActiveCategoryTab(cat)}
                                  className={`px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border snap-start ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                      : 'bg-white text-slate-600 border-slate-100 hover:bg-slate-50'
                                  }`}
                                >
                                  {cat} ({count})
                                </button>
                              );
                            })}
                          </div>

                          {/* Lista de Serviços */}
                          <div className="space-y-8 pt-2">
                            {(() => {
                              const grouped: Record<string, typeof services> = {};
                              const sourceList = activeCategoryTab === 'Todos'
                                ? services
                                : services.filter(s => (s.categoria || 'Geral') === activeCategoryTab);

                              sourceList.forEach(s => {
                                const cat = s.categoria || 'Geral';
                                if (!grouped[cat]) grouped[cat] = [];
                                grouped[cat].push(s);
                              });

                              return Object.entries(grouped).map(([catName, sList]) => {
                                const isCabelo = catName.toLowerCase().includes('cabelo') || catName.toLowerCase().includes('corte');
                                const isBarba = catName.toLowerCase().includes('barba');
                                const isCombo = catName.toLowerCase().includes('combo');

                                return (
                                  <div key={`cat-section-${catName}`} className="space-y-4">
                                    {/* Premium Category Header */}
                                    <div className="border-l-4 border-indigo-600 pl-3.5 py-1 bg-gradient-to-r from-indigo-50/10 to-transparent">
                                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-2">
                                        {catName}
                                        <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold px-2 py-0.5 rounded-full">
                                          {sList.length} {sList.length === 1 ? 'opção' : 'opções'}
                                        </span>
                                      </h4>
                                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                        {isCabelo ? 'Estilos modernos, clássicos e acabamento personalizado de alta precisão.' :
                                         isBarba ? 'Tratamento com toalha quente, navalha e óleos hidratantes premium.' :
                                         isCombo ? 'Os melhores serviços combinados em experiências completas e vantajosas.' :
                                         'Procedimentos sob medida executados com produtos de alta performance.'}
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {sList.map((s, sIdx) => {
                                        const isSelected = selectedServices.some(item => item.id === s.id);
                                        const subStatus = getServiceSubscriptionStatus(s);
                                        const origPrice = s.preco || s.price || 0;

                                        return (
                                          <button
                                            key={`srv-item-${s.id || sIdx}-${sIdx}`}
                                            type="button"
                                            onClick={() => handleToggleService(s)}
                                            className={`p-4 rounded-2xl border transition-all text-left flex items-start gap-4 relative group ${
                                              isSelected 
                                                ? 'border-indigo-600 bg-indigo-50/30 shadow-md ring-2 ring-indigo-600/10' 
                                                : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-slate-200 shadow-sm'
                                            }`}
                                          >
                                            {isSelected && (
                                              <div className="absolute top-3 right-3 bg-indigo-600 text-white p-1 rounded-full shadow z-10 animate-scaleIn">
                                                <Check size={12} className="stroke-[3]" />
                                              </div>
                                            )}

                                            {/* Foto do Serviço */}
                                            <div className={`w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center transition-all shrink-0 border-2 bg-slate-100 text-slate-650 shadow-sm ${
                                              isSelected ? 'border-indigo-600 bg-white' : 'border-white bg-slate-50'
                                            }`}>
                                              {s.fotoUrl ? (
                                                <img 
                                                  src={s.fotoUrl} 
                                                  alt={s.nome || s.name} 
                                                  className="w-full h-full object-cover"
                                                  referrerPolicy="no-referrer"
                                                />
                                              ) : (
                                                <Scissors size={20} className="text-slate-400" />
                                              )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="px-2 py-0.5 bg-slate-150/50 text-[8px] font-black uppercase text-slate-500 rounded-md tracking-wider">
                                                  {s.categoria || 'Serviço'}
                                                </span>
                                                {subStatus.isCovered && (
                                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase rounded-md tracking-wider border border-emerald-200/80 flex items-center gap-1">
                                                    ✨ No Plano ({subStatus.planName || 'Assinatura'})
                                                  </span>
                                                )}
                                              </div>
                                              <h4 className="text-sm font-black text-slate-800 truncate mt-1">{s.nome || s.name}</h4>
                                              <p className="text-xs text-slate-500 font-semibold line-clamp-2 mt-1 leading-relaxed">
                                                {s.descricao || 'Atendimento com acabamento premium e toalha quente.'}
                                              </p>
                                              <div className="flex items-center gap-3 mt-3 font-bold text-[10px]">
                                                {subStatus.isCovered ? (
                                                  <div className="flex items-center gap-1.5">
                                                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-black text-xs">
                                                      R$ 0,00
                                                    </span>
                                                    {origPrice > 0 && (
                                                      <span className="text-slate-400 line-through text-[10px]">
                                                        R$ {origPrice.toFixed(2)}
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 font-extrabold text-xs">
                                                    R$ {origPrice.toFixed(2)}
                                                  </span>
                                                )}
                                                <span className="text-slate-500 flex items-center gap-1 bg-slate-150/40 px-2.5 py-1 rounded-md">
                                                  <Clock size={10} className="text-slate-400" /> {s.duracao_minutos || s.duration || 30} min
                                                </span>
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>

                          {/* Resumo do Carrinho & Botão Avançar */}
                          {selectedServices.length > 0 && (
                            <>
                              {/* Static Summary Container in flow */}
                              <motion.div 
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-4 space-y-3 shadow-sm mt-4"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-0.5">
                                    <h5 className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">Serviços Selecionados ({selectedServices.length})</h5>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {selectedServices.map(s => {
                                        const subSt = getServiceSubscriptionStatus(s);
                                        return (
                                          <span 
                                            key={`cart-badge-${s.id}`} 
                                            className="bg-white border border-indigo-100 text-slate-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm"
                                          >
                                            {s.nome || s.name}
                                            {subSt.isCovered && <span className="text-[8px] bg-emerald-50 text-emerald-700 font-black px-1 rounded">R$ 0,00</span>}
                                            <button 
                                              type="button" 
                                              onClick={() => handleToggleService(s)}
                                              className="text-red-500 hover:text-red-700 font-bold ml-0.5 cursor-pointer"
                                            >
                                              ✕
                                            </button>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 border-indigo-100/40">
                                    <div className="text-right">
                                      <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Preço Total</span>
                                      {(() => {
                                        const effectiveTotal = calculateEffectivePrice(selectedServices);
                                        const origTotal = selectedServices.reduce((sum, s) => sum + (s.preco || s.price || 0), 0);
                                        const isDiscounted = origTotal > effectiveTotal;

                                        return (
                                          <div className="flex items-baseline gap-1.5 justify-end">
                                            <span className="text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg inline-block mt-0.5 shadow-sm">
                                              R$ {effectiveTotal.toFixed(2)}
                                            </span>
                                            {isDiscounted && (
                                              <span className="text-[10px] text-slate-400 line-through">
                                                R$ {origTotal.toFixed(2)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                    <div className="text-right">
                                      <span className="text-[9px] font-black text-slate-400 block uppercase tracking-wider">Tempo Total</span>
                                      <span className="text-xs text-slate-700 font-extrabold flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-lg inline-block mt-0.5 shadow-sm">
                                        {selectedServices.reduce((sum, s) => sum + (s.duracao_minutos || s.duration || 30), 0)} min
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end pt-3 border-t border-indigo-100/40">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTime(null);
                                      setBookingStep(3);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                                  >
                                    Avançar para Data e Horário <ChevronRight size={14} className="stroke-[3]" />
                                  </button>
                                </div>
                              </motion.div>

                              {/* Floating Sticky Action Dock at bottom of viewport */}
                              <motion.div 
                                initial={{ opacity: 0, y: 40 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 40 }}
                                className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-50 pointer-events-auto"
                              >
                                <div className="bg-slate-950/95 backdrop-blur-md text-white p-3.5 sm:p-4 rounded-2xl shadow-2xl border border-slate-800 flex items-center justify-between gap-3 ring-1 ring-white/10">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 font-black text-sm shadow-inner">
                                      {selectedServices.length}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-white truncate block">
                                          {selectedServices.length === 1 
                                            ? (selectedServices[0].nome || selectedServices[0].name)
                                            : `${selectedServices.length} serviços selecionados`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 font-bold">
                                        {(() => {
                                          const effTotal = calculateEffectivePrice(selectedServices);
                                          const origTotal = selectedServices.reduce((sum, s) => sum + (s.preco || s.price || 0), 0);
                                          return (
                                            <>
                                              <span className="text-emerald-400 font-black text-xs">
                                                R$ {effTotal.toFixed(2)}
                                              </span>
                                              {origTotal > effTotal && (
                                                <span className="line-through text-slate-500 text-[10px]">
                                                  R$ {origTotal.toFixed(2)}
                                                </span>
                                              )}
                                            </>
                                          );
                                        })()}
                                        <span>•</span>
                                        <span>{selectedServices.reduce((sum, s) => sum + (s.duracao_minutos || s.duration || 30), 0)} min</span>
                                      </div>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedTime(null);
                                      setBookingStep(3);
                                    }}
                                    className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                                  >
                                    <span>Avançar</span>
                                    <ChevronRight size={14} className="stroke-[3]" />
                                  </button>
                                </div>
                              </motion.div>
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* STEP 3: SELECT DATE & TIME */}
                  {bookingStep === 3 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6 animate-fadeIn"
                    >
                      {/* Date Selector */}
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                            Etapa 3. Selecione o dia do atendimento
                          </label>
                          <p className="text-xs text-slate-500 font-medium">Você está agendando com <strong>{selectedBarber?.nome}</strong> para o serviço <strong>{selectedService?.nome}</strong>.</p>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none custom-scrollbar-thin">
                          {dateOptions.map((opt, dIdx) => {
                            const isSelected = selectedDate === opt.dateStr;
                            const [dayWeek, dayNum] = opt.dayLabel.split(', ');
                            return (
                              <button
                                key={`date-item-${opt.dateStr || dIdx}-${dIdx}`}
                                type="button"
                                onClick={() => {
                                  setSelectedDate(opt.dateStr);
                                  setSelectedTime(null);
                                }}
                                className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center min-w-[72px] flex-shrink-0 relative ${
                                  isSelected 
                                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-md shadow-indigo-600/20' 
                                    : 'border-slate-100 bg-slate-50/80 hover:bg-slate-100/80 text-slate-700 hover:border-slate-200'
                                }`}
                              >
                                {isSelected && (
                                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                                <span className={`text-[8px] font-black uppercase tracking-wider ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                  {opt.monthLabel}
                                </span>
                                <span className="text-base font-black tracking-tight mt-1">
                                  {dayNum}
                                </span>
                                <span className={`text-[8px] font-extrabold uppercase mt-1 tracking-widest ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                                  {dayWeek}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Time Slots Selector (Grouped) */}
                      <div className="space-y-3 border-t border-slate-100 pt-5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            Escolha um dos horários livres para {format(parse(selectedDate, 'yyyy-MM-dd', new Date()), "dd 'de' MMMM", { locale: ptBR })}
                            {loadingSlots && <Clock className="animate-spin text-indigo-500" size={12} />}
                          </label>
                        </div>

                        {getIsWalkInOnly().isWalkInOnly ? (
                          <div className="p-8 text-center bg-amber-500/10 border border-dashed border-amber-300 rounded-[2rem] space-y-3 animate-in fade-in duration-300">
                            <div className="w-12 h-12 bg-amber-500/20 text-amber-600 rounded-full flex items-center justify-center mx-auto text-xl animate-pulse">
                              🚶‍♂️
                            </div>
                            <h4 className="text-sm font-black text-slate-800 tracking-tight">Atendimento por Ordem de Chegada</h4>
                            <p className="text-xs text-slate-600 font-semibold max-w-sm mx-auto leading-relaxed">
                              {getIsWalkInOnly().message}
                            </p>
                            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Não é necessário agendamento prévio!</p>
                          </div>
                        ) : loadingSlots ? (
                          <div className="py-12 flex flex-col items-center justify-center gap-2">
                            <Clock className="animate-spin text-indigo-500" size={24} />
                            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest animate-pulse">Sincronizando Agenda do Profissional...</span>
                          </div>
                        ) : availableSlots.length > 0 ? (
                          <div className="space-y-4">
                            {/* Periods grouping */}
                            {(() => {
                              const { morning, afternoon, evening } = getSlotsByPeriod();
                              return (
                                <>
                                  {/* Morning Period */}
                                  {morning.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-black text-slate-400 flex items-center gap-1 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md w-fit">
                                        <span>🌅</span> Período da Manhã (até 12h)
                                      </p>
                                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                        {morning.map((time, tIdx) => (
                                          <button
                                            key={`morning-slot-${time}-${tIdx}`}
                                            type="button"
                                            onClick={() => {
                                              setSelectedTime(time);
                                              setBookingStep(4);
                                            }}
                                            className={`py-2.5 px-1.5 rounded-xl border text-center text-xs font-black transition-all ${
                                              selectedTime === time 
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600/10 font-black shadow-sm' 
                                                : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 text-slate-700 font-bold'
                                            }`}
                                          >
                                            {time}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Afternoon Period */}
                                  {afternoon.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                      <p className="text-[10px] font-black text-slate-400 flex items-center gap-1 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md w-fit">
                                        <span>☀️</span> Período da Tarde (12h às 18h)
                                      </p>
                                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                        {afternoon.map((time, tIdx) => (
                                          <button
                                            key={`afternoon-slot-${time}-${tIdx}`}
                                            type="button"
                                            onClick={() => {
                                              setSelectedTime(time);
                                              setBookingStep(4);
                                            }}
                                            className={`py-2.5 px-1.5 rounded-xl border text-center text-xs font-black transition-all ${
                                              selectedTime === time 
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600/10 font-black shadow-sm' 
                                                : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 text-slate-700 font-bold'
                                            }`}
                                          >
                                            {time}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Evening Period */}
                                  {evening.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                      <p className="text-[10px] font-black text-slate-400 flex items-center gap-1 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-md w-fit">
                                        <span>🌙</span> Período da Noite (após 18h)
                                      </p>
                                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                                        {evening.map((time, tIdx) => (
                                          <button
                                            key={`evening-slot-${time}-${tIdx}`}
                                            type="button"
                                            onClick={() => {
                                              setSelectedTime(time);
                                              setBookingStep(4);
                                            }}
                                            className={`py-2.5 px-1.5 rounded-xl border text-center text-xs font-black transition-all ${
                                              selectedTime === time 
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600/10 font-black shadow-sm' 
                                                : 'border-slate-100 bg-slate-50 hover:bg-slate-100 hover:border-slate-200 text-slate-700 font-bold'
                                            }`}
                                          >
                                            {time}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="p-8 text-center bg-amber-50/20 border border-dashed border-amber-200 rounded-3xl space-y-2">
                            <span className="text-xl">📅</span>
                            <p className="text-xs text-slate-600 font-bold">Sem disponibilidade encontrada para esta data.</p>
                            <p className="text-[10px] text-slate-400 font-medium">Tente alterar o profissional ou navegar pelos dias vizinhos no calendário acima.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* STEP 4: CONFIRMATION & RESUMO (Apple Wallet Ticket Style) */}
                  {bookingStep === 4 && selectedBarber && selectedService && selectedTime && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-900 text-white rounded-[2rem] shadow-xl border border-slate-800 overflow-hidden relative"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                      
                      {/* Ticket Header */}
                      <div className="p-6 border-b border-dashed border-slate-800 flex justify-between items-center">
                        <div className="space-y-1">
                          <span className="bg-amber-500/10 text-amber-400 text-[8px] font-black tracking-widest px-2.5 py-1 rounded-full uppercase">
                            Resumo da Reserva
                          </span>
                          <h4 className="text-sm font-black text-white tracking-tight pt-1">Confirmar Agendamento</h4>
                        </div>
                        <CheckCircle2 size={24} className="text-amber-500" />
                      </div>

                      {/* Ticket Content */}
                      <div className="p-6 grid grid-cols-2 gap-y-5 gap-x-4 text-xs font-semibold text-slate-300">
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Unidade</p>
                          <p className="text-white mt-1 font-black truncate">{tenantInfo?.name || 'Barbearia Unidade'}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Profissional</p>
                          <p className="text-white mt-1 font-black truncate">{selectedBarber.nome}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Serviço Selecionado</p>
                          <p className="text-white mt-1 font-black truncate">{selectedService.nome || selectedService.name}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Data e Horário</p>
                          <p className="text-white mt-1 font-black truncate">
                            {format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')} às {selectedTime}
                          </p>
                        </div>
                        <div className="col-span-2 border-t border-slate-850 pt-4 flex items-center justify-between">
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Valor do Atendimento</p>
                            {(() => {
                              const effPrice = calculateEffectivePrice(selectedServices.length > 0 ? selectedServices : [selectedService]);
                              const origPrice = selectedServices.length > 0 
                                ? selectedServices.reduce((sum, s) => sum + (s.preco || s.price || 0), 0)
                                : (selectedService.preco || selectedService.price || 0);
                              const activeSub = subscriptions.find(s => s.status === 'active');
                              const isCovered = (selectedServices.length > 0 ? selectedServices : [selectedService]).some(s => getServiceSubscriptionStatus(s).isCovered);

                              if (isCovered) {
                                return (
                                  <div className="mt-1 space-y-1">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-2xl font-black text-emerald-400">
                                        R$ {effPrice.toFixed(2)}
                                      </span>
                                      {origPrice > effPrice && (
                                        <span className="text-xs text-slate-500 line-through">
                                          R$ {origPrice.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                    <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">
                                      ✨ Assinante ({activeSub?.planName || 'Comanda Zerada'})
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <p className="text-2xl font-black text-amber-400 mt-1">
                                  R$ {effPrice.toFixed(2)}
                                </p>
                              );
                            })()}
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-black">Duração Estimada</p>
                            <p className="text-white mt-1 font-black">{selectedService.duracao_minutos || selectedService.duration || 30} minutos</p>
                          </div>
                        </div>
                      </div>

                      {/* Guest Identification Section when user is not logged in */}
                      {!profile && (
                        <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-wider text-amber-400">Identificação</span>
                              <h5 className="text-sm font-black text-white">Preencha seus dados para finalizar</h5>
                            </div>
                            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                              <button
                                type="button"
                                onClick={() => setGuestMode('register')}
                                className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${
                                  guestMode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Novo Cliente
                              </button>
                              <button
                                type="button"
                                onClick={() => setGuestMode('login')}
                                className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${
                                  guestMode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                                }`}
                              >
                                Já Tenho Conta
                              </button>
                            </div>
                          </div>

                          {guestMode === 'register' ? (
                            <div className="space-y-3">
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                  Seu Nome Completo *
                                </label>
                                <input
                                  type="text"
                                  placeholder="Ex: João da Silva"
                                  value={guestName}
                                  onChange={(e) => setGuestName(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                    WhatsApp (DDD + Número) *
                                  </label>
                                  <input
                                    type="tel"
                                    placeholder="(11) 99999-9999"
                                    value={guestPhone}
                                    onChange={(e) => setGuestPhone(formatPhone(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                    Crie uma Senha (mín. 6 dígitos) *
                                  </label>
                                  <input
                                    type="password"
                                    placeholder="••••••"
                                    value={guestPassword}
                                    onChange={(e) => setGuestPassword(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                  Seu E-mail * (Obrigatório)
                                </label>
                                <input
                                  type="email"
                                  placeholder="seuemail@exemplo.com"
                                  value={guestEmail}
                                  onChange={(e) => setGuestEmail(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                />
                              </div>

                              <p className="text-[10px] text-slate-400 font-medium leading-relaxed bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                                🔒 Seu cadastro será salvo automaticamente e seu horário ficará confirmado no sistema da barbearia.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                  E-mail de Acesso *
                                </label>
                                <input
                                  type="email"
                                  placeholder="seuemail@exemplo.com"
                                  value={guestEmail}
                                  onChange={(e) => setGuestEmail(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                  Sua Senha *
                                </label>
                                <input
                                  type="password"
                                  placeholder="••••••"
                                  value={guestPassword}
                                  onChange={(e) => setGuestPassword(e.target.value)}
                                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none transition-all"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="p-6 bg-slate-950/80 border-t border-slate-850">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleCreateAppointment}
                          className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-slate-950 font-black text-xs py-4 rounded-xl transition-all shadow-lg shadow-amber-500/10 uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <>
                              <Clock className="animate-spin text-slate-950" size={14} />
                              Processando Agendamento...
                            </>
                          ) : (
                            <>
                              <Check size={14} className="stroke-[3]" />
                              {profile ? 'Finalizar e Agendar Agora' : 'Confirmar Reserva e Agendar'}
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
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
                  Central de Agendamentos
                </h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  Gerencie seus próximos compromissos e veja todo o histórico de visitas e cortes anteriores.
                </p>
              </div>

              {/* Seção 1: Próximos Agendamentos */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Calendar size={13} className="text-indigo-500 animate-pulse" />
                  Próximos Agendamentos (Ativos)
                </h4>
                
                {futureAppointments.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-slate-50/30">
                    {futureAppointments.map((app, appIdx) => (
                      <div key={`fut-app-card-${app.id || appIdx}-${appIdx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3.5">
                          <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-700 flex flex-col items-center min-w-[50px] font-black border border-indigo-100/40">
                            <span className="text-[8px] uppercase text-indigo-500">
                              {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'MMM', { locale: ptBR }).replace('.', '')}
                            </span>
                            <span className="text-sm font-black">
                              {format(parse(app.date, 'yyyy-MM-dd', new Date()), 'dd')}
                            </span>
                          </div>
                          <div>
                            <h5 className="text-xs font-black text-slate-800">{app.servico_name}</h5>
                            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Profissional: {app.profissional_name}</p>
                            <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 bg-indigo-50/85 text-indigo-600 rounded-full mt-1.5 inline-block">
                              {app.startTime} ({app.endTime})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleCancelAppointment(app.id)}
                            className={`px-3.5 py-2 border rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 ${
                              confirmingCancelAppId === app.id
                                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 animate-pulse'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'
                            }`}
                          >
                            {confirmingCancelAppId === app.id ? (
                              <>
                                <Check size={12} />
                                <span>Confirmar?</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle size={12} />
                                <span>Cancelar Agendamento</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400 font-semibold">Você não tem nenhum agendamento pendente.</p>
                  </div>
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Seção 2: Histórico de Atendimentos */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-emerald-500" />
                  Histórico de Atendimentos (Anteriores)
                </h4>

                {pastAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {pastAppointments.map((app, appIdx) => (
                      <div 
                        key={`past-app-card-${app.id || appIdx}-${appIdx}`} 
                        className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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

                        <div className="self-end sm:self-center flex flex-col items-end gap-2">
                          <span className={`text-[9px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full ${
                            app.status === 'concluído' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : app.status === 'cancelado' 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {app.status === 'concluído' ? 'Concluído' : app.status === 'cancelado' ? 'Cancelado' : app.status}
                          </span>

                          {/* Comanda Button */}
                          {(() => {
                            const matchingComanda = clientComandas.find(c => 
                              c.agendamento_id === app.id || 
                              c.id === app.comanda_id ||
                              (c.date === app.date && c.profissional_id === app.profissional_id)
                            );
                            if (!matchingComanda) return null;
                            return (
                              <button
                                onClick={() => setSelectedComandaForView(matchingComanda)}
                                className="text-[10px] bg-slate-200/70 hover:bg-slate-200 text-slate-800 font-extrabold px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 active:scale-95"
                              >
                                <Receipt size={11} className="text-indigo-600" />
                                Ver Comanda (#{matchingComanda.number || matchingComanda.id.substring(0, 6)})
                              </button>
                            );
                          })()}

                          {app.status === 'concluído' && (() => {
                            const existingReview = myReviews.find(r => r.agendamento_id === app.id);
                            if (existingReview) {
                              return (
                                <div className="flex text-amber-500 gap-0.5 mt-1" title={existingReview.comentario}>
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star 
                                      key={i} 
                                      size={10} 
                                      fill={i < existingReview.rating ? 'currentColor' : 'none'} 
                                      className="text-amber-500" 
                                    />
                                  ))}
                                </div>
                              );
                            } else {
                              return (
                                <button
                                  onClick={() => {
                                    setSelectedAppForReview(app);
                                    setReviewRating(5);
                                    setReviewComment('');
                                    setReviewModalOpen(true);
                                  }}
                                  className="text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-black px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 shadow-sm active:scale-95 mt-1"
                                >
                                  <Star size={10} fill="currentColor" /> Avaliar Barbeiro
                                </button>
                              );
                            }
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center bg-slate-50/50 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-xs text-slate-400 font-semibold">Sua lista de histórico está limpa atualmente.</p>
                  </div>
                )}
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
                    {packages.filter(p => (p.remainingCuts || 0) > 0).map((pkg, pIdx) => {
                      const total = pkg.totalCuts || 5;
                      const remaining = pkg.remainingCuts || 0;
                      const percentage = (remaining / total) * 100;
                      return (
                        <div key={`pkg-rem-${pkg.id || pIdx}-${pIdx}`} className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/20 border border-indigo-100/80 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm">
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
                    {availablePackages.map((pkg, pIdx) => {
                      const discount = pkg.originalPrice - pkg.promotionalPrice;
                      const pricePerCut = pkg.promotionalPrice / pkg.cutsCount;
                      const cleanPhone = tenantInfo?.phone ? tenantInfo.phone.replace(/\D/g, '') : '';
                      const waText = encodeURIComponent(`Olá! Sou o cliente ${profile.nome} e gostaria de adquirir o pacote "${pkg.name}" (${pkg.cutsCount} cortes por R$ ${pkg.promotionalPrice.toFixed(2)}) na Barbearia!`);
                      const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                      return (
                        <div key={`pkg-avail-${pkg.id || pIdx}-${pIdx}`} className="border border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-200 p-6 rounded-2xl flex flex-col justify-between transition-all group">
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
              {(() => {
                const visibleSubscriptions = subscriptions.filter(s => s.status !== 'canceled');
                const pendingOrExpiredSubscriptions = visibleSubscriptions.filter(s => s.status !== 'active');

                return (
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

                    {/* Expired/Past Due subscriptions Alert (Excludes Canceled) */}
                    {pendingOrExpiredSubscriptions.length > 0 && (
                      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-rose-600 text-white p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-white flex-shrink-0">
                            <AlertCircle size={22} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black tracking-tight text-white">Assinatura Pendente de Renovação</h4>
                            <p className="text-xs text-amber-100 font-medium mt-0.5">
                              Sua assinatura do plano <span className="underline font-black text-white">{pendingOrExpiredSubscriptions[0]?.planName}</span> está inativa ou aguardando pagamento.
                            </p>
                            <p className="text-[10px] text-amber-200 font-bold mt-1">
                              ⚡ Clique abaixo para gerar a segunda via PIX ou renovar no cartão e reativar seus benefícios na hora!
                            </p>
                          </div>
                        </div>
                        {(() => {
                          const expiredSub = pendingOrExpiredSubscriptions[0];
                          if (!expiredSub) return null;
                          const expPlanObj = availablePlans.find(p => p.id === expiredSub.plano_id);
                          const expAllowed = expPlanObj?.allowedPaymentMethods || ['PIX', 'CREDIT_CARD'];
                          const expSupportsPix = expAllowed.includes('PIX');
                          const expSupportsCard = expAllowed.includes('CREDIT_CARD');

                          const handleQuickRenew = () => {
                            if (expSupportsCard && !expSupportsPix) {
                              setClientCardModalSub(expiredSub);
                            } else if (expSupportsPix && !expSupportsCard) {
                              handleClientPayPix(expiredSub);
                            } else {
                              setRenewalModalSub(expiredSub);
                            }
                          };

                          return (
                            <div className="flex items-center gap-2 flex-wrap self-start sm:self-center">
                              <button 
                                onClick={handleQuickRenew}
                                className="px-4 py-3 bg-slate-950 hover:bg-slate-900 text-amber-400 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer active:scale-95"
                              >
                                <RefreshCw size={14} className="animate-spin-slow" /> Renovar Agora
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {visibleSubscriptions.length > 0 ? (
                      <div className="space-y-4">
                        {visibleSubscriptions.map((sub, sIdx) => {
                          const isActive = sub.status === 'active';
                          const isPending = sub.status === 'pending';
                          const isOverdue = sub.status === 'overdue' || sub.status === 'expired' || sub.status === 'suspended';
                          const statusColor = isPending ? 'bg-amber-500 text-white' : (isActive ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white');
                          const statusLabel = isPending ? 'Aguardando Pagamento' : (isActive ? 'Plano Ativo' : 'Vencida / Em Atraso');

                          const planObj = availablePlans.find(p => p.id === sub.plano_id);
                          const maxCuts = planObj?.haircutsPerMonth ?? 999;
                          const maxBeards = planObj?.beardsPerMonth ?? 999;

                          const cutsUnlimited = maxCuts >= 99 || maxCuts === 0;
                          const beardsUnlimited = maxBeards >= 99 || maxBeards === 0;

                          const cutsPercent = cutsUnlimited ? 100 : Math.min(100, (sub.haircutsUsed / (maxCuts || 1)) * 100);
                          const beardsPercent = beardsUnlimited ? 100 : Math.min(100, (sub.beardsUsed / (maxBeards || 1)) * 100);

                          return (
                            <div key={`sub-card-${sub.id || sIdx}-${sIdx}`} className="bg-gradient-to-br from-slate-50 to-indigo-50/20 border border-slate-200 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm space-y-5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/50 pb-4">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-base font-black text-slate-900">{sub.planName}</h4>
                                    <span className="bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Clube de Assinatura</span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-bold mt-1">
                                    Vigência do Ciclo: {sub.startDate ? format(parse(sub.startDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''} até <span className="text-slate-800 font-black">{sub.endDate ? format(parse(sub.endDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                                    Método de Cobrança: <span className="text-slate-800 font-black">{sub.paymentMethod === 'pix' || sub.billingType === 'PIX' ? 'PIX Recorrente' : 'Cartão de Crédito Recorrente (Asaas)'}</span>
                                  </p>
                                </div>
                                <span className={`${statusColor} font-black text-xs px-3 py-1.5 rounded-xl shadow-sm self-start sm:self-center`}>{statusLabel}</span>
                              </div>

                              {/* Dynamic consumption progress meters */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {(() => {
                                  // 1. If the plan has specific services listed in planObj.services (e.g. Acabamento, Barba, etc.)
                                  if (planObj?.services && planObj.services.length > 0) {
                                    return planObj.services.map((srv: any, srvIdx: number) => {
                                      const isUnlimited = srv.isUnlimited || srv.limit >= 99 || srv.limit === 0;
                                      const used = (sub.serviceUsages && (sub.serviceUsages[srv.serviceId] || sub.serviceUsages[srv.name])) || 0;
                                      const total = isUnlimited ? 'Ilimitados' : srv.limit;
                                      const percent = isUnlimited ? 100 : Math.min(100, (used / (srv.limit || 1)) * 100);
                                      const remaining = isUnlimited ? null : Math.max(0, srv.limit - used);

                                      return (
                                        <div key={`sub-srv-${srv.serviceId || srvIdx}-${srvIdx}`} className="p-4 bg-white border border-slate-100 rounded-xl space-y-2 shadow-2xs">
                                          <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-slate-700 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                              <Scissors size={13} className="text-indigo-600" />
                                              {srv.name}
                                            </span>
                                            <span className="text-indigo-600 font-black">
                                              {used} / {total}
                                            </span>
                                          </div>
                                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${percent}%` }} />
                                          </div>
                                          <p className="text-[9px] text-slate-400 font-semibold">
                                            {isUnlimited 
                                              ? `Aproveite seu ${srv.name.toLowerCase()} ilimitado no ciclo.` 
                                              : `${remaining} ${srv.name.toLowerCase()} restantes até a renovação.`}
                                          </p>
                                        </div>
                                      );
                                    });
                                  }

                                  // 2. Legacy fallback: check if haircutsPerMonth or beardsPerMonth exist
                                  const items = [];
                                  const maxCuts = planObj?.haircutsPerMonth ?? 0;
                                  const maxBeards = planObj?.beardsPerMonth ?? 0;

                                  if (maxCuts > 0) {
                                    const cutsUnlimited = maxCuts >= 99;
                                    const cutsPercent = cutsUnlimited ? 100 : Math.min(100, (sub.haircutsUsed / (maxCuts || 1)) * 100);
                                    items.push(
                                      <div key="legacy-haircuts" className="p-4 bg-white border border-slate-100 rounded-xl space-y-2 shadow-2xs">
                                        <div className="flex justify-between items-center text-xs font-bold">
                                          <span className="text-slate-700 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                            <Scissors size={13} className="text-indigo-600" />
                                            Cortes de Cabelo
                                          </span>
                                          <span className="text-indigo-600 font-black">
                                            {sub.haircutsUsed} / {cutsUnlimited ? 'Ilimitados' : maxCuts}
                                          </span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                          <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${cutsPercent}%` }} />
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-semibold">
                                          {cutsUnlimited ? 'Aproveite seus cortes ilimitados no ciclo.' : `${Math.max(0, maxCuts - sub.haircutsUsed)} cortes restantes até a renovação.`}
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (maxBeards > 0) {
                                    const beardsUnlimited = maxBeards >= 99;
                                    const beardsPercent = beardsUnlimited ? 100 : Math.min(100, (sub.beardsUsed / (maxBeards || 1)) * 100);
                                    items.push(
                                      <div key="legacy-beards" className="p-4 bg-white border border-slate-100 rounded-xl space-y-2 shadow-2xs">
                                        <div className="flex justify-between items-center text-xs font-bold">
                                          <span className="text-slate-700 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                            <Zap size={13} className="text-amber-600" />
                                            Serviços de Barba
                                          </span>
                                          <span className="text-amber-600 font-black">
                                            {sub.beardsUsed} / {beardsUnlimited ? 'Ilimitadas' : maxBeards}
                                          </span>
                                        </div>
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                          <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${beardsPercent}%` }} />
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-semibold">
                                          {beardsUnlimited ? 'Aproveite suas barbas ilimitadas no ciclo.' : `${Math.max(0, maxBeards - sub.beardsUsed)} barbas restantes até a renovação.`}
                                        </p>
                                      </div>
                                    );
                                  }

                                  if (items.length === 0) {
                                    return (
                                      <div className="p-4 bg-white border border-slate-100 rounded-xl space-y-1 shadow-2xs col-span-full">
                                        <span className="text-slate-700 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                                          <ShieldCheck size={14} className="text-emerald-600" />
                                          Benefícios Ativos do Plano
                                        </span>
                                        <p className="text-xs text-slate-500 font-semibold">
                                          {planObj?.description || 'Plano de assinatura ativo com benefícios exclusivos liberados para agendamento.'}
                                        </p>
                                      </div>
                                    );
                                  }

                                  return items;
                                })()}
                              </div>

                              {/* Action Buttons */}
                              <div className="pt-3 border-t border-slate-200/50 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {(() => {
                                    const allowedPaymentMethods = planObj?.allowedPaymentMethods || ['PIX', 'CREDIT_CARD'];
                                    const supportsPix = allowedPaymentMethods.includes('PIX');
                                    const supportsCard = allowedPaymentMethods.includes('CREDIT_CARD');

                                    if (isActive) {
                                      return (
                                        <>
                                          {supportsCard && (
                                            <button
                                              type="button"
                                              onClick={() => setClientCardModalSub(sub)}
                                              className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <CreditCard size={13} />
                                              <span>Gerenciar Cartão de Crédito</span>
                                            </button>
                                          )}
                                        </>
                                      );
                                    }

                                    // If subscription is overdue, expired, pending, or suspended (NOT active)
                                    return (
                                      <>
                                        {supportsCard && (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => handleCheckAsaasStatus(sub)}
                                              disabled={checkingStatusSubId === sub.id}
                                              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                              {checkingStatusSubId === sub.id ? (
                                                <RefreshCw size={13} className="animate-spin" />
                                              ) : (
                                                <RefreshCw size={13} />
                                              )}
                                              <span>Tentar Cobrar Novamente</span>
                                            </button>

                                            <button
                                              type="button"
                                              onClick={() => setClientCardModalSub(sub)}
                                              className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                            >
                                              <CreditCard size={13} />
                                              <span>Atualizar Cartão & Cobrar</span>
                                            </button>
                                          </>
                                        )}

                                        {supportsPix && (
                                          <button
                                            type="button"
                                            onClick={() => handleClientPayPix(sub)}
                                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-sm flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <QrCode size={13} />
                                            <span>Pagar Segunda Via (PIX)</span>
                                          </button>
                                        )}

                                        {supportsPix && !supportsCard && (
                                          <button
                                            type="button"
                                            onClick={() => handleCheckAsaasStatus(sub)}
                                            disabled={checkingStatusSubId === sub.id}
                                            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                          >
                                            {checkingStatusSubId === sub.id ? (
                                              <RefreshCw size={13} className="animate-spin" />
                                            ) : (
                                              <CheckCircle size={13} className="text-emerald-600" />
                                            )}
                                            <span>Verificar Status</span>
                                          </button>
                                        )}
                                      </>
                                    );
                                  })()}

                                  {(() => {
                                    const canCancel = (sub as any).allowClientCancel !== false && (planObj?.allowClientCancel !== false);
                                    if (!canCancel) return null;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => setSubToCancel(sub)}
                                        className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <Trash2 size={13} />
                                        <span>Cancelar</span>
                                      </button>
                                    );
                                  })()}
                                </div>

                                <button 
                                  onClick={() => setActiveTab('schedule')}
                                  className="text-indigo-600 hover:underline flex items-center gap-0.5 text-[10px] font-black uppercase tracking-wider"
                                >
                                  Agendar Atendimento <ChevronRight size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
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
                );
              })()}

              {/* Histórico de Faturas & Recibos de Pagamento */}
              {subscriptionInvoices.length > 0 && (
                <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black tracking-tight flex items-center gap-2 text-slate-800">
                        <Receipt className="text-indigo-500" size={18} />
                        Histórico de Faturas & Recibos
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        Consulte as mensalidades quitadas e comprovantes do seu clube de assinatura.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                      {subscriptionInvoices.length} {subscriptionInvoices.length === 1 ? 'fatura' : 'faturas'}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                    {subscriptionInvoices.map((inv, invIdx) => (
                      <div key={`inv-item-${inv.id || invIdx}-${invIdx}`} className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                            <CheckCircle size={18} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-slate-800">
                              {inv.description || 'Pagamento de Assinatura'}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              Data: {inv.date ? format(parse(inv.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''} • Método: <span className="uppercase text-slate-600 font-bold">{inv.paymentMethod || 'PIX'}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className="text-sm font-black text-emerald-600">
                            R$ {(inv.amount || 0).toFixed(2)}
                          </span>
                          <button
                            onClick={() => setSelectedInvoiceForView(inv)}
                            className="text-[10px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <FileText size={12} />
                            Recibo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discover/Explore plans */}
              {!subscriptions.some(s => s.status === 'active') && (
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
                      {availablePlans.filter(p => p.status === 'active' || p.status === undefined).map((plan, planIdx) => {
                        const cleanPhone = tenantInfo?.phone ? tenantInfo.phone.replace(/\D/g, '') : '';
                        const waText = encodeURIComponent(`Olá! Sou o cliente ${profile.nome} e tenho muito interesse em fazer parte do Clube de Assinatura assinando o plano "${plan.name}" (R$ ${plan.price.toFixed(2)}/mês) na Barbearia!`);
                        const waUrl = `https://wa.me/${cleanPhone}?text=${waText}`;

                        return (
                          <div key={`plan-opt-${plan.id || planIdx}-${planIdx}`} className="border border-slate-100 bg-slate-50/30 hover:bg-slate-50 hover:border-emerald-200 p-6 rounded-2xl flex flex-col justify-between transition-all group relative overflow-hidden">
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

                            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedPlanForCheckout(plan)}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 cursor-pointer"
                              >
                                <CreditCard size={14} /> Assinar Online (Checkout)
                              </button>
                              <a 
                                href={waUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Falar via WhatsApp"
                                className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl transition-all flex items-center justify-center shadow-sm active:scale-95"
                              >
                                <Phone size={14} />
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
              )}
            </motion.div>
          )}

          {/* TAB: FIDELIDADE / CASHBACK */}
          {activeTab === 'fidelidade' && (
            <motion.div 
              key="fidelidade"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              className="space-y-6"
            >
              {(() => {
                const mode = loyaltyConfig?.loyaltyMode || 'saldo';
                const isEnabled = loyaltyConfig?.cashbackEnabled !== false;
                const minVal = loyaltyConfig?.minRedemptionValue || 0;
                const minPts = loyaltyConfig?.minRedemptionPoints || 0;
                const currentCashback = loyalty?.cashback || 0;
                const currentPoints = loyalty?.points || 0;

                return (
                  <>
                    {/* Header Banner */}
                    <div className={`rounded-[32px] p-6 md:p-8 text-white relative overflow-hidden shadow-xl border ${
                      mode === 'saldo'
                        ? 'bg-gradient-to-br from-amber-950 via-slate-900 to-amber-900 border-amber-800/40'
                        : 'bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 border-indigo-800/40'
                    }`}>
                      <div className="absolute top-0 right-0 p-6 opacity-10 text-white pointer-events-none">
                        {mode === 'saldo' ? <Coins size={160} /> : <Award size={160} />}
                      </div>

                      <div className="relative z-10 space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold border ${
                              mode === 'saldo'
                                ? 'bg-amber-400/20 border-amber-400/40 text-amber-400'
                                : 'bg-indigo-400/20 border-indigo-400/40 text-indigo-400'
                            }`}>
                              {mode === 'saldo' ? <Coins size={18} /> : <Award size={18} />}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                              mode === 'saldo' ? 'text-amber-300' : 'text-indigo-300'
                            }`}>
                              {mode === 'saldo' ? 'Programa de Saldo & Cashback' : 'Clube de Pontos & Fidelidade'}
                            </span>
                          </div>
                          {isEnabled ? (
                            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> 
                              {mode === 'saldo' 
                                ? (loyaltyConfig?.cashbackType === 'fixo' 
                                    ? `Ativo (R$ ${(loyaltyConfig?.cashbackFixedValue ?? 5).toFixed(2)} / visita)`
                                    : `Ativo (${loyaltyConfig?.cashbackPercentage ?? 5}% de volta)`)
                                : `Ativo (${loyaltyConfig?.pointsPerReal ?? 1} pt / R$ 1)`}
                            </span>
                          ) : (
                            <span className="px-3 py-1 bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-black uppercase tracking-widest rounded-full">
                              Programa Inativo
                            </span>
                          )}
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                          {/* SALDO MODE CARD */}
                          {mode === 'saldo' ? (
                            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300/80">
                                  Seu Saldo Disponível
                                </span>
                                <Coins size={18} className="text-amber-400" />
                              </div>
                              <p className="text-3xl font-black text-amber-300 tracking-tight">
                                R$ {currentCashback.toFixed(2)}
                              </p>
                              {minVal > 0 ? (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-300">
                                    <span>Meta para resgate: R$ {minVal.toFixed(2)}</span>
                                    <span className={currentCashback >= minVal ? 'text-emerald-400 font-black' : 'text-amber-300'}>
                                      {currentCashback >= minVal ? 'Liberado para uso!' : `Faltam R$ ${(minVal - currentCashback).toFixed(2)}`}
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all duration-500 ${currentCashback >= minVal ? 'bg-emerald-400' : 'bg-amber-400'}`}
                                      style={{ width: `${Math.min(100, (currentCashback / minVal) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[10px] font-semibold text-slate-300">
                                  Disponível para abater no pagamento do seu próximo atendimento
                                </p>
                              )}
                            </div>
                          ) : (
                            /* PONTOS MODE CARD */
                            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-200/80">
                                  Seus Pontos Acumulados
                                </span>
                                <Award size={18} className="text-indigo-300" />
                              </div>
                              <p className="text-3xl font-black text-indigo-200 tracking-tight">
                                {currentPoints} pts
                              </p>
                              {minPts > 0 ? (
                                <div className="space-y-1.5 pt-1">
                                  <div className="flex justify-between text-[9px] font-bold text-slate-300">
                                    <span>Mínimo para troca: {minPts} pts</span>
                                    <span className={currentPoints >= minPts ? 'text-emerald-400 font-black' : 'text-indigo-300'}>
                                      {currentPoints >= minPts ? 'Pronto para resgatar!' : `Faltam ${minPts - currentPoints} pts`}
                                    </span>
                                  </div>
                                  <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full transition-all duration-500 ${currentPoints >= minPts ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                                      style={{ width: `${Math.min(100, (currentPoints / minPts) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[10px] font-semibold text-slate-300">
                                  Acumule pontos em seus cortes e troque por vantagens exclusivas
                                </p>
                              )}
                            </div>
                          )}

                          {/* Total Spent Card */}
                          <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                                Total Gasto na Barbearia
                              </span>
                              <TrendingUp size={18} className="text-emerald-400" />
                            </div>
                            <p className="text-3xl font-black text-white tracking-tight">
                              R$ {totalSpent.toFixed(2)}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-300">
                              Histórico acumulado em atendimentos concluídos
                            </p>
                          </div>
                        </div>

                        {/* Rule explanation box */}
                        <div className="p-4 bg-black/20 border border-white/10 rounded-2xl flex items-start gap-3 text-xs font-semibold text-white/90">
                          <Zap size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-white">Como funciona nesta barbearia?</strong>
                            {mode === 'saldo' ? (
                              <p className="mt-0.5 text-slate-200">
                                {loyaltyConfig?.cashbackType === 'fixo' ? (
                                  <>Você recebe <span className="text-amber-300 font-bold">R$ {(loyaltyConfig?.cashbackFixedValue ?? 5).toFixed(2)} fixos</span> de volta a cada atendimento finalizado. </>
                                ) : (
                                  <>Você recebe <span className="text-amber-300 font-bold">{loyaltyConfig?.cashbackPercentage ?? 5}% de cashback</span> de volta sobre o total gasto em cada serviço. </>
                                )}
                                {minVal > 0 && (
                                  <>O resgate pode ser solicitado quando você atingir no mínimo <span className="text-amber-300 font-bold">R$ {minVal.toFixed(2)}</span> de saldo.</>
                                )}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-slate-200">
                                Você ganha <span className="text-indigo-300 font-bold">{loyaltyConfig?.pointsPerReal ?? 1} ponto(s)</span> para cada R$ 1,00 gasto
                                {(loyaltyConfig?.pointsPerAppointment || 0) > 0 && (
                                  <>, mais <span className="text-indigo-300 font-bold">+{loyaltyConfig.pointsPerAppointment} pontos bônus</span> por atendimento</>
                                )}.
                                {minPts > 0 && (
                                  <> A pontuação mínima para resgatar recompensas é de <span className="text-indigo-300 font-bold">{minPts} pontos</span>.</>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* REDEMPTION SECTION (ONLY WHEN MODE IS PONTOS AND PROGRAM IS ACTIVE) */}
                    {mode === 'pontos' && isEnabled && (
                      <div className="bg-white rounded-[32px] border border-slate-100 p-6 md:p-8 space-y-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                              <Award size={22} />
                            </div>
                            <div>
                              <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                                <span>Catálogo de Resgate por Pontos</span>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-full border border-indigo-100">
                                  {currentPoints} pts disponíveis
                                </span>
                              </h3>
                              <p className="text-xs text-slate-400 font-medium">
                                Escolha um serviço ou produto para trocar por pontos e gere seu cupom/token de gratuidade.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* List of Redeemable Services & Products */}
                        {(() => {
                          const redeemableServices = services
                            .filter(s => s.active !== false && (s.pontos_resgate || 0) > 0)
                            .map(s => ({
                              id: s.id,
                              name: s.nome || s.name,
                              type: 'service' as const,
                              points: s.pontos_resgate || 0,
                              price: s.preco ?? s.price ?? 0,
                              category: s.categoria || 'Serviço'
                            }));

                          const redeemableProducts = products
                            .filter(p => p.status !== 'inactive' && (p.pontos_resgate || 0) > 0)
                            .map(p => ({
                              id: p.id,
                              name: p.name,
                              type: 'product' as const,
                              points: p.pontos_resgate || 0,
                              price: p.salePrice ?? p.preco ?? 0,
                              category: p.categoryName || 'Produto'
                            }));

                          const allRedeemable = [...redeemableServices, ...redeemableProducts];

                          if (allRedeemable.length === 0) {
                            return (
                              <div className="py-8 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-2">
                                <Award className="mx-auto text-slate-300" size={32} />
                                <p className="text-xs text-slate-600 font-bold">Nenhum item configurado para resgate no momento.</p>
                                <p className="text-[10px] text-slate-400">A barbearia disponibilizará serviços e produtos para troca em breve.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {allRedeemable.map((item, itemIdx) => {
                                const canAfford = currentPoints >= item.points;
                                return (
                                  <div 
                                    key={`redeem-item-${item.type}-${item.id || itemIdx}-${itemIdx}`}
                                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                                      canAfford 
                                        ? 'bg-gradient-to-b from-white to-indigo-50/30 border-indigo-150 hover:shadow-md hover:border-indigo-300' 
                                        : 'bg-slate-50/50 border-slate-200/80 opacity-75'
                                    }`}
                                  >
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-wider rounded-md">
                                          {item.type === 'service' ? '💈 Serviço' : '🧴 Produto'}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400 line-through">
                                          R$ {item.price.toFixed(2)}
                                        </span>
                                      </div>
                                      <h4 className="text-sm font-black text-slate-800 leading-snug">{item.name}</h4>
                                      <div className="flex items-baseline gap-1">
                                        <span className="text-xl font-black text-indigo-600">{item.points}</span>
                                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">pontos</span>
                                      </div>
                                    </div>

                                    <div>
                                      {canAfford ? (
                                        <button
                                          type="button"
                                          onClick={() => handleRedeemRewardToken(item)}
                                          disabled={isRedeemingVoucher}
                                          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center justify-center gap-2"
                                        >
                                          <Sparkles size={14} />
                                          <span>Resgatar Cupom Grátis</span>
                                        </button>
                                      ) : (
                                        <div className="w-full py-2 px-3 bg-slate-100 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-wider text-center">
                                          Faltam {item.points - currentPoints} pts
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* ACTIVE VOUCHERS / TOKENS ISSUED TO THIS CLIENT */}
                        {clientVouchers.length > 0 && (
                          <div className="pt-4 border-t border-slate-100 space-y-3">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Tag size={14} className="text-indigo-600" />
                              <span>Seus Vouchers / Cupons Gerados ({clientVouchers.filter(v => v.status === 'disponivel').length} Ativos)</span>
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {clientVouchers.map((voucher, vIdx) => {
                                const isActive = voucher.status === 'disponivel';
                                return (
                                  <div 
                                    key={`voucher-${voucher.id || vIdx}-${vIdx}`}
                                    className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                                      isActive 
                                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950 shadow-sm' 
                                        : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60'
                                    }`}
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-md ${
                                          isActive ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
                                        }`}>
                                          {isActive ? 'Disponível' : voucher.status === 'utilizado' ? 'Utilizado' : 'Cancelado'}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-500">
                                          {voucher.item_type === 'servico' ? 'Serviço' : 'Produto'}
                                        </span>
                                      </div>
                                      <p className="text-xs font-black text-slate-900 leading-tight">{voucher.item_name}</p>
                                      <div className="flex items-center gap-2 pt-1">
                                        <span className="text-[11px] font-mono font-black tracking-widest bg-white/80 px-2 py-0.5 rounded border border-emerald-300 text-emerald-700">
                                          {voucher.token}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard.writeText(voucher.token);
                                            toast.success("Código copiado!");
                                          }}
                                          className="p-1 hover:bg-white rounded text-slate-500 hover:text-slate-800 transition"
                                          title="Copiar token"
                                        >
                                          <Copy size={12} />
                                        </button>
                                      </div>
                                    </div>

                                    <div className="text-right flex-shrink-0">
                                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Desconto</span>
                                      <span className="text-xs font-black text-emerald-600">100% OFF</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Statement / History Section */}
                    <div className="bg-white rounded-[32px] border border-slate-100 p-6 md:p-8 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <History size={18} className="text-indigo-600" />
                          <h3 className="text-sm font-black text-slate-800 tracking-tight">
                            {mode === 'saldo' ? 'Extrato de Saldo & Cashback' : 'Extrato de Pontuação'}
                          </h3>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {loyaltyHistory.length} {loyaltyHistory.length === 1 ? 'registro' : 'registros'}
                        </span>
                      </div>

                      {loyaltyHistory.length > 0 ? (
                        <div className="divide-y divide-slate-100">
                          {loyaltyHistory.map((item, idx) => (
                            <div key={`loyalty-${item.id || 'item'}-${idx}`} className="py-3.5 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                                  item.type === 'earn' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'
                                }`}>
                                  {item.type === 'earn' ? '+' : '-'}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{item.description}</p>
                                  <p className="text-[10px] font-medium text-slate-400">{item.date}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                {mode === 'saldo' ? (
                                  <>
                                    <p className={`text-xs font-black ${item.type === 'earn' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {item.type === 'earn' ? '+' : '-'}R$ {(item.cashback || 0).toFixed(2)}
                                    </p>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                      {item.type === 'earn' ? 'Saldo Creditado' : 'Resgatado'}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <p className={`text-xs font-black ${item.type === 'earn' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                      {item.type === 'earn' ? '+' : '-'}{item.points || 0} pts
                                    </p>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                      {item.type === 'earn' ? 'Pontos Ganhos' : 'Pontos Trocados'}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                          {mode === 'saldo' ? (
                            <Coins className="mx-auto text-slate-300" size={32} />
                          ) : (
                            <Award className="mx-auto text-slate-300" size={32} />
                          )}
                          <p className="text-xs text-slate-500 font-bold">
                            {mode === 'saldo' ? 'Nenhuma movimentação de saldo registrada ainda.' : 'Nenhuma movimentação de pontos registrada ainda.'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {mode === 'saldo'
                              ? 'Seu saldo acumulado aparecerá aqui ao concluir seus próximos atendimentos.'
                              : 'Seus pontos acumulados aparecerão aqui ao concluir seus próximos atendimentos.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
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
                    {(profile?.nome || 'Cliente').substring(0, 2).toUpperCase()}
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

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider ml-1">CPF (Pessoa Física)</label>
                      <input 
                        type="text" 
                        value={editCpf}
                        onChange={e => setEditCpf(formatCpfCnpjMask(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-indigo-50 focus:border-indigo-500 rounded-xl py-3 px-4 text-sm font-bold text-primary outline-none transition"
                        placeholder="000.000.000-00"
                      />
                      <p className="text-[10px] text-slate-400 font-medium ml-1">
                        Necessário para a emissão de comprovantes e recibos dos serviços.
                      </p>
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

      </div> {/* Fechamento do Main Content Pane Wrapper */}

      {/* PORTFOLIO / LANDING PAGE MODAL */}
      <AnimatePresence>
        {showPortfolioModal && selectedPortfolioTenant && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
            >
              {/* Header Image Cover */}
              <div className="relative h-56 md:h-64 bg-slate-900 flex-shrink-0">
                <img
                  src={selectedPortfolioTenant.coverImage || "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1000&q=80"}
                  alt="Fachada / Portfólio"
                  className="w-full h-full object-cover opacity-80"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                
                {/* Close Button */}
                <button
                  onClick={() => setShowPortfolioModal(false)}
                  className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 text-white rounded-full p-2.5 backdrop-blur-md transition-all active:scale-95 z-10"
                >
                  <X size={18} />
                </button>

                {/* Logo and Name Overlay */}
                <div className="absolute bottom-6 left-6 right-6 flex items-end gap-4">
                  <div className="w-16 h-16 bg-white rounded-2xl p-1 shadow-md flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {selectedPortfolioTenant.logoUrl ? (
                      <img
                        src={selectedPortfolioTenant.logoUrl}
                        alt="Logo"
                        className="w-full h-full object-cover rounded-xl"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-black text-xl rounded-xl" style={{ backgroundColor: selectedPortfolioTenant.accentColor || '#6366F1' }}>
                        {selectedPortfolioTenant.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 text-white pb-1">
                    <span className="text-[10px] uppercase font-black tracking-widest text-indigo-300">Portfólio & Apresentação</span>
                    <h3 className="text-xl md:text-2xl font-black truncate leading-none mt-1">{selectedPortfolioTenant.name}</h3>
                  </div>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 md:p-8 scrollbar-thin">
                {/* About Section */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Nossa História</h4>
                  <p className="text-sm font-medium text-slate-600 leading-relaxed">
                    {selectedPortfolioTenant.aboutText || "Sua barbearia preferida com atendimento de altíssima qualidade, ambiente climatizado, café fresco e os melhores profissionais da região prontos para transformar seu visual!"}
                  </p>
                </div>

                {/* Two Column details: Location and Hours */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Location Card */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <MapPin size={14} className="text-indigo-600" />
                      Onde nos Encontrar
                    </h4>
                    {selectedPortfolioTenant.address ? (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700 leading-relaxed">
                          {selectedPortfolioTenant.address.street}, {selectedPortfolioTenant.address.city} - {selectedPortfolioTenant.address.state}
                        </p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPortfolioTenant.name + " " + selectedPortfolioTenant.address.street + " " + selectedPortfolioTenant.address.city)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-black text-indigo-600 hover:underline uppercase tracking-wider"
                        >
                          <Globe size={11} /> Ver Rotas no Google Maps
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 font-semibold">Endereço não cadastrado.</p>
                    )}
                  </div>

                  {/* Hours Card */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Clock size={14} className="text-indigo-600" />
                      Horário de Funcionamento
                    </h4>
                    <div className="text-xs font-bold text-slate-700 space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Segunda a Sexta:</span>
                        <span>09:00 às 20:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Sábados:</span>
                        <span>09:00 às 18:00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Domingos:</span>
                        <span className="text-rose-500 font-extrabold uppercase text-[10px]">Fechado</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Nossa Equipe de Profissionais</h4>
                  {loadingPortfolioBarbers ? (
                    <div className="flex items-center gap-2 py-2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs font-semibold text-slate-400">Carregando especialistas...</span>
                    </div>
                  ) : portfolioBarbers.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {portfolioBarbers.map((barber: any, index: number) => (
                        <div key={`port-barber-${barber.uid || barber.id || index}-${index}`} className="flex items-center gap-2.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-black text-xs flex items-center justify-center overflow-hidden flex-shrink-0">
                            {barber.fotoUrl || barber.avatarUrl ? (
                              <img src={barber.fotoUrl || barber.avatarUrl} alt={barber.nome} className="w-full h-full object-cover" />
                            ) : (
                              barber.nome?.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <h5 className="text-[11px] font-black text-slate-700 truncate leading-none">{barber.nome}</h5>
                            <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold">Especialista</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 font-semibold">Nenhum profissional listado para esta unidade.</p>
                  )}
                </div>

                {/* Social and WhatsApp Links */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-5 flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    {selectedPortfolioTenant.whatsapp ? (
                      <a
                        href={`https://wa.me/${selectedPortfolioTenant.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-3 rounded-full transition-all active:scale-95 border border-emerald-100 flex items-center gap-2 text-xs font-black uppercase tracking-wider"
                      >
                        <Phone size={14} /> WhatsApp
                      </a>
                    ) : selectedPortfolioTenant.phone ? (
                      <a
                        href={`https://wa.me/${selectedPortfolioTenant.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-3 rounded-full transition-all active:scale-95 border border-emerald-100 flex items-center gap-2 text-xs font-black uppercase tracking-wider"
                      >
                        <Phone size={14} /> WhatsApp
                      </a>
                    ) : null}
                    {selectedPortfolioTenant.instagram && (
                      <a
                        href={selectedPortfolioTenant.instagram}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-3 rounded-full transition-all active:scale-95 border border-indigo-100"
                        title="Instagram"
                      >
                        <Instagram size={14} />
                      </a>
                    )}
                    {selectedPortfolioTenant.facebook && (
                      <a
                        href={selectedPortfolioTenant.facebook}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 p-3 rounded-full transition-all active:scale-95 border border-blue-100"
                        title="Facebook"
                      >
                        <Facebook size={14} />
                      </a>
                    )}
                  </div>

                  {/* Booking Trigger Button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPortfolioModal(false)}
                      className="px-5 py-3 text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-wider transition-all"
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const isCurrentActive = (tenantInfo?.id || getActiveTenantId()).toLowerCase() === selectedPortfolioTenant.id.toLowerCase();
                        if (!isCurrentActive) {
                          await handleSelectTenant(selectedPortfolioTenant.id, 'schedule');
                        } else {
                          setShowPortfolioModal(false);
                          setActiveTab('schedule');
                          toast.success(`Você está navegando na unidade ${selectedPortfolioTenant.name}. Faça seu agendamento!`);
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-indigo-600/10 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Calendar size={14} /> Agendar Agora
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* INTERACTIVE EVALUATION / REVIEW MODAL */}
        {reviewModalOpen && selectedAppForReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl p-6 md:p-8 space-y-6 relative border border-slate-100"
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setReviewModalOpen(false);
                  setSelectedAppForReview(null);
                }}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 transition-all active:scale-95"
              >
                <X size={16} />
              </button>

              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-amber-50 rounded-full border border-amber-150 flex items-center justify-center mx-auto text-amber-500">
                  <Star size={32} fill="currentColor" />
                </div>
                <h3 className="text-lg font-black tracking-tight text-slate-800">Avaliar Atendimento</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  Como foi o seu corte ou serviço com o profissional <span className="text-indigo-600 font-extrabold">{selectedAppForReview.profissional_name}</span>?
                </p>
              </div>

              {/* Interactive Star Picker */}
              <div className="flex justify-center gap-3 py-2">
                {[1, 2, 3, 4, 5].map((starValue) => (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => setReviewRating(starValue)}
                    className="transition-transform duration-100 active:scale-90 hover:scale-110"
                  >
                    <Star
                      size={36}
                      fill={starValue <= reviewRating ? 'currentColor' : 'none'}
                      className={starValue <= reviewRating ? 'text-amber-500' : 'text-slate-350'}
                    />
                  </button>
                ))}
              </div>

              {/* Text feedback comments */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Seu Comentário (Opcional)</label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Excelente atendimento, corte cirúrgico e café de primeira! Super recomendo..."
                  rows={4}
                  className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={() => {
                    setReviewModalOpen(false);
                    setSelectedAppForReview(null);
                  }}
                  className="flex-1 py-4 text-xs font-black text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-all bg-slate-100 rounded-2xl border border-slate-200/50 hover:bg-slate-200 active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReview}
                  onClick={handleSubmitReview}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/15 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {isSubmittingReview ? (
                    <>Enviando...</>
                  ) : (
                    <>Enviar Avaliação</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Update Credit Card Modal */}
      <AnimatePresence>
        {clientCardModalSub && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl p-6 md:p-8 space-y-6 relative border border-slate-100"
            >
              <button
                onClick={() => setClientCardModalSub(null)}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 transition-all active:scale-95 cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-indigo-50 rounded-full border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600">
                  <CreditCard size={32} />
                </div>
                <h3 className="text-lg font-black tracking-tight text-slate-800">Atualizar Cartão de Crédito</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  Insira os novos dados do seu cartão para cobrança recorrente automática mensal no Asaas.
                </p>
              </div>

              <form onSubmit={handleClientUpdateCardSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Número do Cartão</label>
                  <input
                    type="text"
                    required
                    placeholder="0000 0000 0000 0000"
                    value={ccNumber}
                    onChange={(e) => setCcNumber(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Nome no Cartão</label>
                  <input
                    type="text"
                    required
                    placeholder="NOME COMO NO CARTÃO"
                    value={ccHolderName}
                    onChange={(e) => setCcHolderName(e.target.value)}
                    className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all uppercase"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Mês (MM)</label>
                    <input
                      type="text"
                      required
                      placeholder="MM"
                      maxLength={2}
                      value={ccExpiryMonth}
                      onChange={(e) => setCcExpiryMonth(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Ano (AAAA)</label>
                    <input
                      type="text"
                      required
                      placeholder="AAAA"
                      maxLength={4}
                      value={ccExpiryYear}
                      onChange={(e) => setCcExpiryYear(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase text-slate-400 tracking-wider">CCV</label>
                    <input
                      type="password"
                      required
                      placeholder="123"
                      maxLength={4}
                      value={ccCcv}
                      onChange={(e) => setCcCcv(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-700 bg-slate-50 rounded-2xl p-4 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600 transition-all text-center"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setClientCardModalSub(null)}
                    className="flex-1 py-4 text-xs font-black text-slate-500 hover:text-slate-700 uppercase tracking-widest transition-all bg-slate-100 rounded-2xl border border-slate-200/50 hover:bg-slate-200 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingCard}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-600/15 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isUpdatingCard ? 'Salvando...' : 'Salvar Cartão'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View PIX Modal */}
      <AnimatePresence>
        {clientPixModalData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl p-6 md:p-8 space-y-6 relative border border-slate-100 text-center"
            >
              <button
                onClick={() => setClientPixModalData(null)}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 transition-all active:scale-95 cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <div className="w-16 h-16 bg-emerald-50 rounded-full border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
                  <QrCode size={32} />
                </div>
                <h3 className="text-lg font-black tracking-tight text-slate-800">Pagamento via PIX (Alternativo)</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  Utilize o QR Code abaixo ou o código Copia e Cola para regularizar sua assinatura ou pagamento em atraso.
                </p>
              </div>

              {clientPixModalData.pixQrCodeUrl && (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 inline-block mx-auto">
                  <img src={clientPixModalData.pixQrCodeUrl} alt="QR Code PIX" className="w-48 h-48 mx-auto rounded-xl object-contain" />
                </div>
              )}

              {clientPixModalData.pixCopiaECola && (
                <div className="space-y-2 text-left">
                  <label className="text-xs font-black uppercase text-slate-400 tracking-wider">PIX Copia e Cola</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={clientPixModalData.pixCopiaECola}
                      className="w-full text-[11px] font-mono text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200 truncate select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(clientPixModalData.pixCopiaECola);
                        toast.success("Código PIX copiado com sucesso!");
                      }}
                      className="px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shrink-0 transition cursor-pointer"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setClientPixModalData(null)}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest transition cursor-pointer"
              >
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Escolher Forma de Pagamento para Assinatura */}
      <AnimatePresence>
        {selectedPlanForCheckout && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col p-6 space-y-6 text-center relative"
            >
              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 transition-all active:scale-95 cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="space-y-2">
                <div className="w-16 h-16 bg-emerald-50 rounded-full border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600">
                  <Star size={32} />
                </div>
                <h3 className="text-lg font-black tracking-tight text-slate-800">Assinar {selectedPlanForCheckout.name}</h3>
                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto">
                  Escolha como deseja realizar o pagamento da sua assinatura mensal de <span className="font-black text-slate-800">R$ {selectedPlanForCheckout.price.toFixed(2)}</span>.
                </p>
              </div>

              {/* Solicitação elegante do CPF e E-mail caso ainda não estejam cadastrados ou validados */}
              {(!profile?.cpf || !isValidCPF(profile.cpf.replace(/\D/g, '')) || !profile?.email || !profile.email.includes('@') || profile.email.includes('manual_') || profile.email.includes('placeholder')) ? (
                <div className="space-y-2.5 text-left bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center gap-2 text-slate-800">
                    <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                    <span className="text-xs font-black tracking-tight">Identificação do Assinante</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Para ativar sua assinatura do Clube e gerar seus recibos bancários, informe seus dados:
                  </p>
                  
                  {(!profile?.cpf || !isValidCPF(profile.cpf.replace(/\D/g, ''))) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        CPF do Assinante
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="000.000.000-00"
                        value={checkoutCpfCnpj}
                        onChange={(e) => setCheckoutCpfCnpj(formatCpfCnpjMask(e.target.value))}
                        className="w-full text-xs font-bold text-slate-800 bg-white rounded-xl p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all font-mono"
                      />
                    </div>
                  )}

                  {(!profile?.email || !profile.email.includes('@') || profile.email.includes('manual_') || profile.email.includes('placeholder')) && (
                    <div className="space-y-1 mt-2">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        E-mail do Assinante
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="seu-email@exemplo.com"
                        value={checkoutEmail}
                        onChange={(e) => setCheckoutEmail(e.target.value)}
                        className="w-full text-xs font-bold text-slate-800 bg-white rounded-xl p-3 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 transition-all"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck size={18} className="text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-emerald-950">CPF Vinculado à Assinatura</p>
                        <p className="text-[10px] text-emerald-700 font-medium">{formatCpfCnpjMask(profile.cpf)}</p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        const newCpf = prompt("Informe seu CPF (11 dígitos):", profile.cpf || "");
                        if (newCpf) {
                          const clean = newCpf.replace(/\D/g, "");
                          if (isValidCPF(clean)) {
                            setCheckoutCpfCnpj(formatCpfCnpjMask(clean));
                            profile.cpf = clean;
                            toast.success("CPF atualizado!");
                          } else {
                            toast.error("CPF inválido. Verifique os dígitos.");
                          }
                        }
                      }}
                      className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                    >
                      Alterar
                    </button>
                  </div>
                  <div className="border-t border-emerald-100/50 my-1" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Mail size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold text-emerald-950">E-mail de Cobrança</p>
                        <p className="text-[10px] text-emerald-700 font-medium">{profile.email}</p>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        const newEmail = prompt("Informe seu e-mail:", profile.email || "");
                        if (newEmail && newEmail.includes('@')) {
                          setCheckoutEmail(newEmail);
                          profile.email = newEmail;
                          toast.success("E-mail atualizado!");
                        } else if (newEmail) {
                          toast.error("E-mail inválido.");
                        }
                      }}
                      className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                    >
                      Alterar
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                {(!selectedPlanForCheckout.allowedPaymentMethods || selectedPlanForCheckout.allowedPaymentMethods.includes('PIX')) && (
                  <button
                    type="button"
                    disabled={isSubscribingPlan}
                    onClick={() => handleClientSubscribePlan(selectedPlanForCheckout, 'PIX')}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <QrCode size={16} />
                    <span>{isSubscribingPlan ? 'Gerando...' : 'Pagar via PIX (Instantâneo)'}</span>
                  </button>
                )}

                {(!selectedPlanForCheckout.allowedPaymentMethods || selectedPlanForCheckout.allowedPaymentMethods.includes('CREDIT_CARD')) && (
                  <button
                    type="button"
                    disabled={isSubscribingPlan}
                    onClick={() => handleClientSubscribePlan(selectedPlanForCheckout, 'CREDIT_CARD')}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <CreditCard size={16} />
                    <span>{isSubscribingPlan ? 'Gerando...' : 'Cartão de Crédito Recorrente'}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedPlanForCheckout(null)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition cursor-pointer"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Confirmar Cancelamento pelo Cliente */}
      <AnimatePresence>
        {subToCancel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-6 text-center relative"
            >
              <button
                type="button"
                onClick={() => setSubToCancel(null)}
                className="absolute top-4 right-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full p-2 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>

              <div className="w-16 h-16 bg-rose-50 rounded-full border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
                <Trash2 size={32} />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black tracking-tight text-slate-800">Cancelar Assinatura</h3>
                <p className="text-xs text-slate-500 font-semibold">
                  Tem certeza que deseja cancelar a assinatura do plano <strong className="text-slate-800">{subToCancel.planName}</strong>?
                </p>
                <p className="text-[11px] text-amber-700 font-bold bg-amber-50 border border-amber-100 p-3 rounded-xl mt-2">
                  ⚠️ Ao cancelar, você perderá o acesso aos benefícios inclusos no clube de assinatura.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubToCancel(null)}
                  className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={isCancelingSub}
                  onClick={handleCancelSubscriptionByClient}
                  className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isCancelingSub ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Cobrança Asaas Gerada para Cliente */}
      <AnimatePresence>
        {showClientChargeModal && clientCreatedChargeData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-black">
                    <QrCode size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Checkout de Assinatura</h3>
                    <p className="text-xs font-bold text-slate-500">
                      {clientCreatedChargeData.planName} • R$ {(clientCreatedChargeData.price || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowClientChargeModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
                {clientCreatedChargeData.billingType === 'CREDIT_CARD' ? (
                  <div className="space-y-4 bg-blue-50/60 border border-blue-200/60 p-5 rounded-2xl text-center">
                    <div className="w-12 h-12 bg-blue-100 border border-blue-300 text-blue-700 rounded-full flex items-center justify-center mx-auto shadow-sm">
                      <CreditCard size={24} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Checkout de Cartão Asaas</p>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed">
                        Para concluir a assinatura recorrente com total segurança, acesse o link de checkout homologado abaixo.
                      </p>
                    </div>
                    {clientCreatedChargeData.paymentUrl && (
                      <div className="pt-2">
                        <a
                          href={clientCreatedChargeData.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <CreditCard size={14} />
                          <span>Abrir Checkout de Cartão Asaas</span>
                        </a>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {clientCreatedChargeData.pixQrCodeUrl ? (
                      <div className="text-center space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wide">Escaneie o QR Code Pix abaixo:</p>
                        <div className="p-3 bg-white rounded-2xl inline-block border shadow-sm">
                          <img 
                            src={clientCreatedChargeData.pixQrCodeUrl} 
                            alt="QR Code Pix" 
                            className="w-48 h-48 mx-auto object-contain rounded-xl"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <p className="text-xs text-slate-500 font-bold">Cobrança Pix gerada com sucesso.</p>
                      </div>
                    )}

                    {clientCreatedChargeData.pixCopiaECola && (
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">Pix Copia e Cola:</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={clientCreatedChargeData.pixCopiaECola}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-mono font-bold text-slate-700 truncate"
                          />
                          <button
                            onClick={() => {
                              if (clientCreatedChargeData.pixCopiaECola) {
                                navigator.clipboard.writeText(clientCreatedChargeData.pixCopiaECola);
                                toast.success("Código Pix copiado!");
                              }
                            }}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shrink-0 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                          >
                            <Copy size={14} />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {clientCreatedChargeData.paymentUrl && (
                      <div className="pt-2">
                        <a
                          href={clientCreatedChargeData.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <ExternalLink size={16} />
                          <span>Abrir Fatura Completa no Asaas</span>
                        </a>
                      </div>
                    )}
                  </>
                )}

                <div className="pt-4 border-t border-slate-100 flex justify-end items-center">
                  <button
                    type="button"
                    onClick={() => setShowClientChargeModal(false)}
                    className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Notícia / Comunicado Detalhado */}
      <AnimatePresence>
        {announcementModalData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                  announcementModalData.category === 'promocao' || announcementModalData.category === 'Promoção'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-indigo-100 text-indigo-800'
                }`}>
                  {announcementModalData.category || 'Comunicado'}
                </span>
                <button
                  onClick={() => setAnnouncementModalData(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <h3 className="text-base font-black text-slate-900">
                  {announcementModalData.title}
                </h3>
                {announcementModalData.date && (
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Publicado em: {announcementModalData.date}
                  </p>
                )}
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line border border-slate-100">
                {announcementModalData.content}
              </div>

              <button
                onClick={() => setAnnouncementModalData(null)}
                className="w-full bg-slate-900 text-white font-extrabold text-xs py-3 rounded-2xl transition-all hover:bg-slate-800 cursor-pointer"
              >
                Entendido
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Detalhes da Comanda do Cliente */}
      <AnimatePresence>
        {selectedComandaForView && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Receipt size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800">
                      Comanda #{selectedComandaForView.number || selectedComandaForView.id.substring(0, 6)}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Status: {selectedComandaForView.status === 'fechada' ? 'Pago & Fechado' : selectedComandaForView.status}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedComandaForView(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Professional & Client info */}
              <div className="bg-slate-50 p-3.5 rounded-2xl text-xs space-y-1 text-slate-600 font-medium border border-slate-100">
                <p><strong className="text-slate-800">Profissional:</strong> {selectedComandaForView.profissional_name}</p>
                <p><strong className="text-slate-800">Cliente:</strong> {selectedComandaForView.cliente_name}</p>
              </div>

              {/* Items List (Services & Products) */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Itens Consumidos</h4>
                {selectedComandaForView.items && selectedComandaForView.items.length > 0 ? (
                  <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
                    {selectedComandaForView.items.map((item: any, idx: number) => (
                      <div key={`comanda-item-${item.id || item.name || idx}-${idx}`} className="p-3 bg-white flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800">{item.name}</span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-semibold mt-0.5">
                            <span>Qtd: {item.quantity || 1}</span>
                            <span>R$ {(item.unitPrice || 0).toFixed(2)}</span>
                            {item.isCortesia && (
                              <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black px-1.5 py-0.2 rounded">
                                Cortesia
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-black text-slate-800">
                          R$ {(item.totalPrice || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Nenhum item listado.</p>
                )}
              </div>

              {/* Totals Breakdown */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2 text-xs font-bold">
                {selectedComandaForView.subtotalServices > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal Serviços</span>
                    <span>R$ {selectedComandaForView.subtotalServices.toFixed(2)}</span>
                  </div>
                )}
                {selectedComandaForView.subtotalProducts > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal Produtos</span>
                    <span>R$ {selectedComandaForView.subtotalProducts.toFixed(2)}</span>
                  </div>
                )}
                {selectedComandaForView.discount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Desconto</span>
                    <span>- R$ {selectedComandaForView.discount.toFixed(2)}</span>
                  </div>
                )}
                {selectedComandaForView.tip > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Gorjeta</span>
                    <span>+ R$ {selectedComandaForView.tip.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-black text-amber-400">
                  <span>Total Pago</span>
                  <span>R$ {(selectedComandaForView.totalAmount || selectedComandaForView.paidAmount || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Payments list */}
              {selectedComandaForView.payments && selectedComandaForView.payments.length > 0 && (
                <div className="space-y-1.5 text-xs">
                  <h4 className="font-black text-slate-700 uppercase tracking-wider text-[10px]">Forma de Pagamento</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedComandaForView.payments.map((p: any, i: number) => (
                      <span key={`comanda-pay-${p.method || p.methodName || i}-${i}`} className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200">
                        {p.methodName || p.method || 'Pagamento'}: R$ {(p.amount || 0).toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setSelectedComandaForView(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs py-3 rounded-2xl transition-all cursor-pointer"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Renovação Direta de Assinatura */}
      <AnimatePresence>
        {renewalModalSub && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-lg w-full rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 border border-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-800">Renovação de Assinatura</h3>
                    <p className="text-xs text-slate-500 font-semibold">{renewalModalSub.planName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setRenewalModalSub(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  Escolha como deseja efetuar o pagamento da mensalidade para manter seus benefícios ativos e liberar novos agendamentos:
                </p>

                {/* Renewal options */}
                <div className="space-y-3">
                  {(() => {
                    const rPlanObj = availablePlans.find(p => p.id === renewalModalSub.plano_id);
                    const rAllowed = rPlanObj?.allowedPaymentMethods || ['PIX', 'CREDIT_CARD'];
                    const rSupportsPix = rAllowed.includes('PIX');
                    const rSupportsCard = rAllowed.includes('CREDIT_CARD');

                    return (
                      <>
                        {/* Option 1: PIX */}
                        {rSupportsPix && (
                          <div className="p-4 bg-emerald-50/50 border border-emerald-200/80 rounded-2xl flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-emerald-600 text-white rounded-xl">
                                <QrCode size={18} />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-slate-800">Pagar via PIX Instantâneo</h4>
                                <p className="text-[10px] text-slate-500 font-semibold">Gera QR Code e código Copia e Cola imediato</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const sub = renewalModalSub;
                                setRenewalModalSub(null);
                                handleClientPayPix(sub);
                              }}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
                            >
                              Gerar PIX
                            </button>
                          </div>
                        )}

                        {/* Option 2: Credit Card */}
                        {rSupportsCard && (
                          <div className="p-4 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 bg-indigo-600 text-white rounded-xl">
                                <CreditCard size={18} />
                              </div>
                              <div>
                                <h4 className="text-xs font-black text-slate-800">Cartão de Crédito Recorrente</h4>
                                <p className="text-[10px] text-slate-500 font-semibold">Atualize os dados do cartão de crédito no Asaas</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const sub = renewalModalSub;
                                setRenewalModalSub(null);
                                setClientCardModalSub(sub);
                              }}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
                            >
                              Usar Cartão
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Option 3: Direct Manual Renewal */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-800 text-amber-400 rounded-xl">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800">Renovação Direta (+30 Dias)</h4>
                        <p className="text-[10px] text-slate-500 font-semibold">Caso já tenha pago na barbearia ou via PIX direto</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleManualRenewSubscription(renewalModalSub)}
                      disabled={isManualRenewing}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {isManualRenewing ? 'Renovando...' : 'Reativar Agora'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRenewalModalSub(null)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cancelamento de Assinatura pelo Cliente */}
      <AnimatePresence>
        {subToCancel && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-slate-100 relative overflow-hidden"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                  <AlertCircle size={24} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-800 tracking-tight">Cancelar Assinatura?</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Você tem certeza que deseja cancelar sua assinatura do plano <span className="font-bold text-slate-700">{subToCancel.planName}</span>?
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-rose-50/60 rounded-2xl border border-rose-100/80 text-xs text-rose-700 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  O que acontece ao cancelar:
                </p>
                <p className="text-[11px] text-rose-600/90 leading-tight">
                  A cobrança recorrente será interrompida e as pendências em aberto serão removidas da sua tela. Seus agendamentos futuros não serão mais cobertos pelos benefícios do clube.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSubToCancel(null)}
                  disabled={isCancelingSub}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Manter Assinatura
                </button>
                <button
                  type="button"
                  onClick={handleCancelSubscriptionByClient}
                  disabled={isCancelingSub}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isCancelingSub ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Cancelando...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Sim, Cancelar</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Comprovante/Recibo de Fatura */}
      <AnimatePresence>
        {selectedInvoiceForView && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-950 text-white max-w-sm w-full rounded-3xl p-6 shadow-2xl space-y-5 border border-slate-800 relative overflow-hidden"
            >
              {/* Receipt Header */}
              <div className="text-center space-y-2 border-b border-slate-800 pb-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center border border-emerald-500/30">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-200">Comprovante de Pagamento</h3>
                <p className="text-xs text-emerald-400 font-bold">Mensalidade Quitada com Sucesso</p>
              </div>

              {/* Receipt Content */}
              <div className="space-y-3 text-xs bg-slate-900/80 p-4 rounded-2xl border border-slate-800 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Descrição:</span>
                  <span className="text-white font-bold">{selectedInvoiceForView.description || 'Assinatura Mensal'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Data:</span>
                  <span className="text-white font-bold">
                    {selectedInvoiceForView.date ? format(parse(selectedInvoiceForView.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy') : ''}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Método:</span>
                  <span className="text-amber-400 font-bold uppercase">{selectedInvoiceForView.paymentMethod || 'PIX'}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cliente:</span>
                  <span className="text-white font-bold">{selectedInvoiceForView.cliente_name || profile.nome}</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-sans font-black text-emerald-400">
                  <span>Valor Pago:</span>
                  <span>R$ {(selectedInvoiceForView.amount || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-500 font-sans">
                {tenantInfo?.name || 'Barbearia'} • Clube de Assinatura
              </div>

              <button
                onClick={() => setSelectedInvoiceForView(null)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black text-xs py-3 rounded-2xl transition-all cursor-pointer"
              >
                Fechar Recibo
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação de Agendamento Guest */}
      <AnimatePresence>
        {guestCreatedAppointment && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 text-white max-w-md w-full rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 border border-slate-800 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                  <CheckCircle2 size={36} />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Reserva Garantida</span>
                  <h3 className="text-xl font-black text-white tracking-tight mt-0.5">Agendamento Confirmado!</h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Olá <strong className="text-white">{guestCreatedAppointment.clientName}</strong>, seu horário já está reservado na barbearia.
                  </p>
                </div>
              </div>

              {/* Ticket Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs font-semibold">
                <div className="flex justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400 font-bold">Unidade:</span>
                  <span className="text-white font-black">{guestCreatedAppointment.tenantName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400 font-bold">Serviço:</span>
                  <span className="text-white font-black">{guestCreatedAppointment.serviceName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400 font-bold">Profissional:</span>
                  <span className="text-white font-black">{guestCreatedAppointment.barberName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-2.5">
                  <span className="text-slate-400 font-bold">Data e Horário:</span>
                  <span className="text-amber-400 font-black">
                    {format(parse(guestCreatedAppointment.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')} às {guestCreatedAppointment.time}
                  </span>
                </div>
                <div className="flex justify-between pt-1 text-sm font-black">
                  <span className="text-slate-300 font-bold">Valor Total:</span>
                  <span className="text-emerald-400">R$ {Number(guestCreatedAppointment.price || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2.5">
                {guestCreatedAppointment.tenantPhone && (
                  <a
                    href={`https://wa.me/${guestCreatedAppointment.tenantPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Olá! Acabei de agendar um horário via portal de agendamento:\n\n` +
                      `👤 *Cliente:* ${guestCreatedAppointment.clientName}\n` +
                      `💈 *Serviço:* ${guestCreatedAppointment.serviceName}\n` +
                      `✂️ *Profissional:* ${guestCreatedAppointment.barberName}\n` +
                      `📅 *Data:* ${format(parse(guestCreatedAppointment.date, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}\n` +
                      `⏰ *Horário:* ${guestCreatedAppointment.time}\n` +
                      `💳 *Valor:* R$ ${Number(guestCreatedAppointment.price || 0).toFixed(2)}\n\n` +
                      `Confirma para mim, por favor? Obrigado!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Phone size={14} />
                    <span>Avisar Barbearia no WhatsApp</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setGuestCreatedAppointment(null);
                    // Reset form and go to home
                    setSelectedBarber(null);
                    setSelectedService(null);
                    setSelectedTime(null);
                    setBookingStep(1);
                    setActiveTab('home');
                  }}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <Sparkles size={14} />
                  <span>Acessar Meu Painel</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
