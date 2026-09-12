import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  DollarSign, 
  User, 
  Scissors, 
  Package, 
  CreditCard, 
  Wallet,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Receipt,
  Smartphone,
  Loader2,
  ShoppingBag,
  RefreshCcw,
  History,
  LayoutGrid,
  Zap,
  ArrowRightLeft,
  ArrowRight,
  Search,
  Check,
  EyeOff,
  Sparkles,
  Award,
  BellRing,
  Tag,
  CalendarX,
  Handshake,
  Gift,
  Crown,
  FileText,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, serverTimestamp, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, increment, addDoc, deleteField } from 'firebase/firestore';
import { db } from '../../firebase';
import { Comanda, ComandaItem, ComandaPayment, Service, Product, UserProfile, PaymentMethod, PaymentMethodConfig, ComandaLog, ClientDebt, SubscriptionPlan, SubscriptionDiscount, LoyaltyConfig } from '../../types';
import { getActiveTenantId } from '../../services/tenantService';
import { comandaService } from '../../services/comandaService';
import { debtService } from '../../services/debtService';
import { marketingService } from '../../services/marketingService';
import { subscriptionService } from '../../services/subscriptionService';
import { appointmentService } from '../../services/appointmentService';
import { serviceService } from '../../services/serviceService';
import { inventoryService } from '../../services/inventoryService';
import { userService } from '../../services/userService';
import { cashService } from '../../services/cashService';
import { paymentMethodService } from '../../services/paymentMethodService';
import { loyaltyService } from '../../services/loyaltyService';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import { format, parse, addMinutes } from 'date-fns';
import { ConfirmationModal } from '../ConfirmationModal';
import { InputModal } from '../InputModal';
import { parseDate, formatErrorMessage } from '../../lib/utils';
import { QuickClientSelector } from './QuickClientSelector';
import { QuickProfSelector } from './QuickProfSelector';
import { ClientSelectCombobox } from '../Common/ClientSelectCombobox';

interface ComandaModalProps {
  comanda_id?: string;
  initialData?: Partial<Comanda>;
  onClose: () => void;
  onSave: () => void;
}

export function ComandaModal({ comanda_id, initialData, onClose, onSave }: ComandaModalProps) {
  const { user, profile, isAdmin, isGerente } = useAuth();
  const [loading, setLoading] = useState(false);
  const [comanda, setComanda] = useState<Comanda | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  
  const [showItemSelector, setShowItemSelector] = useState<'service' | 'product' | 'pacote' | null>(null);
  const [selectedBarberForService, setSelectedBarberForService] = useState<string>('');
  
  // Financial Modals (Tip, Discount, Voucher, Coupon)
  const [financialModal, setFinancialModal] = useState<'tip' | 'discount' | 'voucher' | 'coupon' | null>(null);
  const [tempTipValue, setTempTipValue] = useState<string>('');
  const [tempDiscountValue, setTempDiscountValue] = useState<string>('');
  const [packageConfigs, setPackageConfigs] = useState<any[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>('todas');

  // Extract distinct service categories for organized selection
  const serviceCategories = React.useMemo(() => {
    const cats = new Set<string>();
    services.forEach(s => {
      const cat = ((s as any).categoria || (s as any).category || '').trim();
      if (cat) cats.add(cat);
    });
    return Array.from(cats).sort();
  }, [services]);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDeleteAppointment, setConfirmDeleteAppointment] = useState(false);
  const [confirmAusente, setConfirmAusente] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenReasonType, setReopenReasonType] = useState<'erro_lancamento' | 'ajuste_pagamento' | 'cortesia' | 'outro'>('erro_lancamento');
  
  const [activeSubTab, setActiveSubTab] = useState<'itens' | 'logs'>('itens');
  
  const [confirmFiado, setConfirmFiado] = useState<{ amount: number; method: string; methodId: string } | null>(null);
  const [confirmExcessPayment, setConfirmExcessPayment] = useState<{
    method: PaymentMethod;
    amount: number;
    metodo_pagamento_id?: string;
    excess: number;
    pendingDebts: number;
  } | null>(null);
  
  const [selectedClientProfile, setSelectedClientProfile] = useState<UserProfile | null>(null);
  const [clientLoyalty, setClientLoyalty] = useState<{ points: number; cashback: number } | null>(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig | null>(null);
  
  const [isPDVMode, setIsPDVMode] = useState(false);
  const [showQuickClient, setShowQuickClient] = useState(false);
  const [showQuickProf, setShowQuickProf] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: initialData?.cliente_id || '',
    cliente_name: initialData?.cliente_name || '',
    profissional_id: initialData?.profissional_id || '',
    profissional_name: initialData?.profissional_name || '',
    observations: initialData?.observations || '',
  });

  // States for active client debts
  const [clientDebts, setClientDebts] = useState<ClientDebt[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(false);
  const [isPayingDebt, setIsPayingDebt] = useState(false);
  const [payingDebtAmount, setPayingDebtAmount] = useState('');
  const [payingDebtMethod, setPayingDebtMethod] = useState('');
  const [selectedDebtToPay, setSelectedDebtToPay] = useState<ClientDebt | null>(null);

  // States for finalizing comanda with remaining balance (fiado / permuta / cortesia / desconto)
  const [showFiadoConfirmationModal, setShowFiadoConfirmationModal] = useState(false);
  const [showObservationsModal, setShowObservationsModal] = useState(false);
  const [fiadoDueDate, setFiadoDueDate] = useState('');
  const [scheduleFiadoReminder, setScheduleFiadoReminder] = useState(true);
  const [closureChoice, setClosureChoice] = useState<'fiado' | 'permuta' | 'cortesia' | 'desconto' | 'clube' | 'total_pago'>('total_pago');
  const [closureNote, setClosureNote] = useState('');

  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string>('');
  const [paymentInputAmount, setPaymentInputAmount] = useState<string>('');
  const [entersCashChoice, setEntersCashChoice] = useState<boolean>(true);
  const [excessMode, setExcessMode] = useState<'abater_fiado' | 'credito_haver' | 'troco'>('abater_fiado');

  // Auto pre-load pending amount into payment input whenever comanda is loaded or pending amount changes
  useEffect(() => {
    if (comanda && comanda.pendingAmount > 0) {
      setPaymentInputAmount(comanda.pendingAmount.toFixed(2));
    }
  }, [comanda?.id, comanda?.pendingAmount]);

  // Pre-select default payment method (Pix, Dinheiro, or first available active method) if none selected
  useEffect(() => {
    if (paymentMethods.length > 0 && !selectedPaymentMethodId) {
      const defaultMethod = 
        paymentMethods.find(m => m.type === 'pix' && !m.goesToClientAccount) ||
        paymentMethods.find(m => m.type === 'dinheiro' && !m.goesToClientAccount) ||
        paymentMethods.find(m => m.type !== 'fiado' && !m.goesToClientAccount) ||
        paymentMethods[0];
      if (defaultMethod) {
        setSelectedPaymentMethodId(defaultMethod.id);
      }
    }
  }, [paymentMethods, selectedPaymentMethodId]);

  // Estado para 2ª forma de pagamento (botão +)
  const [showSecondPayment, setShowSecondPayment] = useState<boolean>(false);
  const [secondPaymentMethodId, setSecondPaymentMethodId] = useState<string>('');
  const [secondPaymentInputAmount, setSecondPaymentInputAmount] = useState<string>('');

  const [amountToPay, setAmountToPay] = useState<string>('');
  const [customTipValue, setCustomTipValue] = useState<string>('');
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);

  // States for coupon
  const [couponInput, setCouponInput] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState<{ id: string; code: string; discount: number; expiresAt: string; active?: boolean }[]>([]);

  // States for loyalty voucher token redemption
  const [voucherTokenInput, setVoucherTokenInput] = useState('');
  const [isValidatingVoucher, setIsValidatingVoucher] = useState(false);

  const handleApplyLoyaltyVoucher = async () => {
    if (!comanda) return;
    const token = voucherTokenInput.trim().toUpperCase();
    if (!token) {
      toast.error("Informe o código/token do voucher de resgate.");
      return;
    }

    setIsValidatingVoucher(true);
    try {
      const voucher = await loyaltyService.getVoucherByToken(token);
      if (!voucher) {
        toast.error("Voucher/Token não encontrado ou inválido.");
        return;
      }

      if (voucher.status !== 'disponivel') {
        toast.error(`Este voucher já foi ${voucher.status === 'utilizado' ? 'utilizado' : 'cancelado'}.`);
        return;
      }

      // Check if item exists in comanda
      const matchingItem = comanda.items.find(item => 
        (voucher.item_id && item.id === voucher.item_id) || 
        item.name?.toLowerCase().trim() === voucher.item_name?.toLowerCase().trim()
      );

      if (!matchingItem) {
        toast.error(`O item "${voucher.item_name}" precisa estar lançado na comanda para ser resgatado com o voucher.`);
        return;
      }

      // Calculate item price to discount
      const itemDiscount = matchingItem.price || 0;
      
      // Mark voucher as used in comanda
      await loyaltyService.useVoucherInComanda(
        voucher.id, 
        comanda.id, 
        comanda.comanda_number || comanda.id
      );

      // Add the discount to comanda
      const currentDiscount = comanda.discount || 0;
      await updateFinancials({ discount: currentDiscount + itemDiscount });

      toast.success(`Voucher de fidelidade aplicado com sucesso! "${voucher.item_name}" com 100% de desconto (R$ ${itemDiscount.toFixed(2)}).`);
      setVoucherTokenInput('');
    } catch (err: any) {
      console.error("Erro ao aplicar voucher:", err);
      toast.error(err.message || "Erro ao aplicar voucher de fidelidade.");
    } finally {
      setIsValidatingVoucher(false);
    }
  };

  useEffect(() => {
    const tenantId = getActiveTenantId();
    if (!tenantId) return;
    const qCoupons = query(collection(db, 'cupons_desconto'), where('tenantId', '==', tenantId));
    getDocs(qCoupons).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const today = new Date().toISOString().split('T')[0];
      const valid = list.filter(c => c.active !== false && (!c.expiresAt || c.expiresAt >= today));
      setAvailableCoupons(valid);
    }).catch(err => console.error("Error fetching coupons:", err));
  }, [comanda?.id]);

  const applyCouponDiscount = async (coupon: { code: string; discount: number }) => {
    if (!comanda) return;
    const subtotal = (comanda.subtotalServices || 0) + (comanda.subtotalProducts || 0);
    if (subtotal <= 0) {
      toast.error("A comanda não possui valor para aplicar o cupom.");
      return;
    }
    const discountVal = Math.round(((subtotal * coupon.discount) / 100) * 100) / 100;
    await updateFinancials({ discount: discountVal });
    toast.success(`Cupom ${coupon.code} (${coupon.discount}% OFF) aplicado! Desconto de R$ ${discountVal.toFixed(2)}.`);
    setCouponInput('');
  };

  const handleApplyCoupon = async (codeToApply?: string) => {
    const targetCode = (codeToApply || couponInput).trim().toUpperCase();
    if (!targetCode) {
      toast.error("Informe o código do cupom.");
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    let coupon = availableCoupons.find(c => c.code?.toUpperCase() === targetCode);

    if (!coupon) {
      try {
        const q = query(collection(db, 'cupons_desconto'), where('tenantId', '==', getActiveTenantId()), where('code', '==', targetCode));
        const snap = await getDocs(q);
        if (snap.empty) {
          toast.error("Cupom inválido ou não encontrado.");
          return;
        }
        const cData = snap.docs[0].data() as any;
        if (cData.active === false || (cData.expiresAt && cData.expiresAt < today)) {
          toast.error("Este cupom está expirado ou inativo.");
          return;
        }
        coupon = { id: snap.docs[0].id, code: cData.code, discount: cData.discount, expiresAt: cData.expiresAt, active: cData.active };
      } catch (e) {
        toast.error("Erro ao validar cupom.");
        return;
      }
    }

    if (coupon.active === false || (coupon.expiresAt && coupon.expiresAt < today)) {
      toast.error("Este cupom está expirado ou inativo.");
      return;
    }

    applyCouponDiscount(coupon);
  };

  useEffect(() => {
    if (comanda) {
      setAmountToPay(comanda.pendingAmount.toFixed(2));
    }
  }, [comanda?.pendingAmount]);

  const handleResetPayments = async () => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      const financialSnap = await getDocs(query(collection(db, 'financial_transactions'), where('comanda_id', '==', comanda.id)));
      const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('referencia_id', '==', comanda.id)));
      const clientDebtsSnap = await getDocs(query(collection(db, 'client_debts'), where('comanda_id', '==', comanda.id)));

      const batch = writeBatch(db);
      
      financialSnap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      cashMovementsSnap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      clientDebtsSnap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      const cashQuery = query(collection(db, 'cash_sessions'), where('status', 'in', ['open', 'reopened']));
      const cashDocs = await getDocs(cashQuery);
      if (!cashDocs.empty) {
        const cashDoc = cashDocs.docs[0];
        let totalCashSub = 0;
        let totalReceivablesSub = 0;
        
        comanda.payments.forEach(p => {
          const methodConfig = paymentMethods.find(m => m.id === p.metodo_pagamento_id || m.type === p.method);
          if (methodConfig) {
            const feeAmount = (p.amount * methodConfig.feePercentage) / 100;
            const netAmount = p.amount - feeAmount;
            if (methodConfig.goesToReceivables) {
              totalReceivablesSub += netAmount;
            } else {
              totalCashSub += p.amount;
            }
          }
        });

        if (totalCashSub > 0 || totalReceivablesSub > 0) {
          batch.update(cashDoc.ref, {
            total_income: increment(-totalCashSub),
            totalIncome: increment(-totalCashSub),
            expected_balance: increment(-totalCashSub),
            expectedBalance: increment(-totalCashSub),
            total_receivables: increment(-totalReceivablesSub),
            totalReceivables: increment(-totalReceivablesSub),
            updatedAt: serverTimestamp()
          });
        }
      }

      if (comanda.cliente_id && comanda.cliente_id !== 'avulso') {
        const clientRef = doc(db, 'usuarios', comanda.cliente_id);
        const totalPaidToSub = comanda.payments.reduce((acc, p) => acc + p.amount, 0);
        batch.update(clientRef, {
          total_pago: increment(-totalPaidToSub),
          totalPaid: increment(-totalPaidToSub),
          saldo_atual: increment(-totalPaidToSub),
          balance: increment(-totalPaidToSub),
          updatedAt: serverTimestamp()
        });
      }

      const newLog = {
        userId: user.uid,
        userName: profile?.nome || user.email || 'Usuário',
        date: new Date().toISOString(),
        action: 'Pagamentos resetados',
        details: 'Todos os pagamentos parciais foram removidos e estornados do caixa.'
      };

      batch.update(doc(db, 'comandas', comanda.id), {
        payments: [],
        paidAmount: 0,
        pendingAmount: comanda.totalAmount,
        status: 'aberta',
        logs: [...(comanda.logs || []), newLog],
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      toast.success("Todos os pagamentos foram estornados e o saldo restaurado!");
    } catch (err) {
      console.error("Erro ao estornar pagamentos:", err);
      toast.error("Erro ao estornar pagamentos: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const loadClientDebts = async (clientId: string) => {
    if (!clientId || clientId === 'avulso') {
      setClientDebts([]);
      return;
    }
    setLoadingDebts(true);
    try {
      const debts = await debtService.getClientDebts(clientId);
      const pending = debts.filter(d => d.status !== 'pago');
      setClientDebts(pending);
    } catch (err) {
      console.error("Error loading client debts:", err);
    } finally {
      setLoadingDebts(false);
    }
  };

  const [activeComandaId, setActiveComandaId] = useState<string | null>(comanda_id || null);
  const hasOpenedComanda = React.useRef(false);

  const [clientPackages, setClientPackages] = useState<any[]>([]);
  const [clientSubscriptions, setClientSubscriptions] = useState<any[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    if (comanda?.cliente_id) {
      const qPackages = query(collection(db, 'pacotes_vendas'), where('clientId', '==', comanda.cliente_id));
      const qSubscriptions = query(collection(db, 'subscriptions'), where('cliente_id', '==', comanda.cliente_id));

      const unsubPackages = onSnapshot(qPackages, (snap) => {
        setClientPackages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      const unsubSubscriptions = onSnapshot(qSubscriptions, (snap) => {
        setClientSubscriptions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });

      getDocs(query(collection(db, 'subscription_plans'), where('tenantId', '==', getActiveTenantId())))
        .then(snap => {
          setSubscriptionPlans(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SubscriptionPlan)));
        })
        .catch(err => console.error("Erro ao carregar planos de assinatura no ComandaModal:", err));

      return () => {
        unsubPackages();
        unsubSubscriptions();
      };
    } else {
      setClientPackages([]);
      setClientSubscriptions([]);
    }
  }, [comanda?.cliente_id]);

  // Auto-apply active subscription to services in open comanda if eligible
  useEffect(() => {
    if (comanda && comanda.status === 'aberta' && clientSubscriptions && clientSubscriptions.length > 0 && user) {
      const activeSub = clientSubscriptions.find(s => s.status === 'active');
      if (activeSub) {
        let hasChanges = false;
        const updatedItems = comanda.items.map(item => {
          if ((item.type === 'servico' || item.type === 'assinatura') && !item.deductType) {
            // Check eligibility
            let isEligible = false;
            if (activeSub.services && activeSub.services.length > 0) {
              const planService = activeSub.services.find((ps: any) => ps.serviceId === item.referencia_id);
              if (planService) {
                if (planService.isUnlimited) isEligible = true;
                else {
                  const currentUsed = (activeSub.serviceUsages && activeSub.serviceUsages[item.referencia_id]) || 0;
                  isEligible = currentUsed < planService.limit;
                }
              }
            } else {
              // Legacy fallback
              const isCut = item.name.toLowerCase().includes('corte') || item.name.toLowerCase().includes('cabelo') || item.name.toLowerCase().includes('hair');
              const isBeard = item.name.toLowerCase().includes('barba') || item.name.toLowerCase().includes('beard');
              if (isCut) isEligible = activeSub.haircutsUsed < (activeSub.haircutsPerMonth || 999);
              if (isBeard) isEligible = activeSub.beardsUsed < (activeSub.beardsPerMonth || 999);
            }

            if (isEligible) {
              hasChanges = true;
              return {
                ...item,
                deductType: 'assinatura' as const,
                packageSaleId: '',
                subscriptionId: activeSub.id,
                isCortesia: true,
                totalPrice: 0,
                generateCommission: false
              };
            }
          }
          return item;
        });

        if (hasChanges) {
          comandaService.updateComandaItems(
            comanda.id,
            updatedItems,
            comanda.discount,
            comanda.tip,
            user.uid,
            profile?.nome || user.email || 'Usuário'
          ).catch(err => console.error("Error auto-applying subscription to comanda:", err));
        }
      }
    }
  }, [clientSubscriptions, comanda?.id, comanda?.status, user]);

  // Virtual packages purchased in the active comanda but not finalized/saved to DB yet
  const virtualPackages = React.useMemo(() => {
    if (!comanda?.items || !comanda?.cliente_id) return [];
    return comanda.items
      .filter(item => item.type === 'pacote')
      .map(item => ({
        id: item.id, // Use comanda item's ID as the virtual package ID
        clientId: comanda.cliente_id,
        clientName: comanda.cliente_name,
        packageId: item.referencia_id,
        packageName: item.name.replace('Venda Pacote: ', ''),
        totalCuts: item.metadata?.cutsCount || 1,
        remainingCuts: item.metadata?.cutsCount || 1,
        pricePaid: item.totalPrice,
        pricePerService: item.metadata?.pricePerService !== undefined ? item.metadata?.pricePerService : null,
        noExpiration: item.metadata?.noExpiration || false,
        expiresDays: item.metadata?.expiresDays || 0,
        serviceId: item.metadata?.serviceId || '',
        serviceName: item.metadata?.serviceName || '',
        isVirtual: true
      }));
  }, [comanda?.items, comanda?.cliente_id, comanda?.cliente_name]);

  // Combined packages list (saved packages from DB + virtual packages being purchased right now)
  const allAvailablePackages = React.useMemo(() => {
    const list = [...clientPackages];
    virtualPackages.forEach(vPkg => {
      if (!list.some(p => p.id === vPkg.id)) {
        list.push(vPkg);
      }
    });
    return list;
  }, [clientPackages, virtualPackages]);

  const autoAssociatedItemIdsRef = useRef<Set<string>>(new Set());

  // Clear auto-associated set when comanda ID changes
  useEffect(() => {
    autoAssociatedItemIdsRef.current.clear();
  }, [comanda?.id]);

  // Auto-associate active packages to comanda items
  useEffect(() => {
    if (
      comanda &&
      comanda.status !== 'fechada' &&
      comanda.status !== 'cancelada' &&
      comanda.status !== 'nao_paga' &&
      allAvailablePackages &&
      allAvailablePackages.length > 0 &&
      comanda.items &&
      comanda.items.length > 0 &&
      user
    ) {
      let changed = false;
      const updatedItems = comanda.items.map(item => {
        // If it's a service and hasn't been associated or paid yet
        if (item.type === 'servico' && !item.deductType && !autoAssociatedItemIdsRef.current.has(item.id)) {
          // Find if there is an active package for this service
          const itemLower = item.name.toLowerCase().trim();
          const hasPkg = allAvailablePackages.find(
            p => p.remainingCuts > 0 && (
              p.serviceId === item.referencia_id || 
              (p.serviceName && p.serviceName.toLowerCase().trim() === itemLower) ||
              p.packageName.toLowerCase().includes(itemLower) ||
              (p.packageName.toLowerCase().includes('corte') && (itemLower.includes('corte') || itemLower.includes('cabelo'))) ||
              (p.packageName.toLowerCase().includes('barba') && itemLower.includes('barba')) ||
              (p.packageName.toLowerCase().includes('navalhado') && itemLower.includes('navalhado'))
            )
          );
          if (hasPkg) {
            const pPrice = hasPkg.pricePerService !== undefined && hasPkg.pricePerService !== null 
              ? hasPkg.pricePerService 
              : (hasPkg.pricePaid / hasPkg.totalCuts);
            
            changed = true;
            autoAssociatedItemIdsRef.current.add(item.id);
            return {
              ...item,
              deductType: 'pacote' as const,
              packageSaleId: hasPkg.id,
              packageUnitPrice: pPrice,
              subscriptionId: '',
              isCortesia: true,
              totalPrice: 0,
              generateCommission: true
            };
          }
        }
        return item;
      });

      if (changed) {
        comandaService.updateComandaItems(
          comanda.id,
          updatedItems,
          comanda.discount,
          comanda.tip,
          user.uid,
          profile?.nome || user.email || 'Usuário'
        ).then(() => {
          toast.success("Pacote de créditos ativo detectado e associado automaticamente!");
        }).catch(err => {
          console.error("Erro ao auto-associar pacote:", err);
        });
      }
    }
  }, [comanda?.id, comanda?.items, allAvailablePackages, user]);
  
  useEffect(() => {
    loadData();
    const unsubscribeBarbers = userService.subscribeToAllBarbers(true, (data) => {
      setBarbers(data);
    });
    const unsubscribeClients = userService.subscribeToAllClients(true, (data) => {
      setClients(data);
    });

    const tenantId = getActiveTenantId();
    const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
    const unsubscribeProducts = onSnapshot(qProducts, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setProducts(data);
    });

    const qServices = query(collection(db, 'services'), where('tenantId', '==', tenantId), where('active', '==', true));
    const unsubscribeServices = onSnapshot(qServices, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      data.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      setServices(data);
    });

    const qPackages = query(collection(db, 'pacotes_config'), where('tenantId', '==', tenantId));
    const unsubscribePackages = onSnapshot(qPackages, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPackageConfigs(data.filter((p: any) => p.active !== false));
    });

    return () => {
      unsubscribeBarbers();
      unsubscribeClients();
      unsubscribeProducts();
      unsubscribeServices();
      unsubscribePackages();
    };
  }, []);

  const handleOpenItemSelector = (type: 'service' | 'product' | 'pacote') => {
    loadData();
    setItemSearchQuery('');
    setSelectedBarberForService(comanda?.profissional_id || '');
    setShowItemSelector(type);
  };

  useEffect(() => {
    let unsubscribe: () => void;

    const idToListen = activeComandaId || comanda_id;

    if (idToListen) {
      unsubscribe = onSnapshot(doc(db, 'comandas', idToListen), async (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() } as Comanda;

          if (initialData) {
            const normInitClient = (initialData.cliente_name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const normComClient = (data.cliente_name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const isMismatched = normInitClient && normComClient && normInitClient !== normComClient && normInitClient !== 'consumidor final' && normComClient !== 'consumidor final';
            
            if (data.status === 'fechada' || isMismatched) {
              console.warn(`ComandaModal: comanda ${idToListen} is closed/mismatched (${data.cliente_name}), generating fresh comanda for ${initialData.cliente_name}`);
              if (initialData.agendamento_id) {
                try {
                  await updateDoc(doc(db, 'appointments', initialData.agendamento_id), {
                    comanda_id: deleteField(),
                    comanda_number: deleteField()
                  });
                } catch (_) {}
              }
              setActiveComandaId(null);
              setComanda(null);
              if (!hasOpenedComanda.current && user) {
                handleOpenComanda();
              }
              return;
            }
          }

          setComanda(data);
          setFormData({
            cliente_id: data.cliente_id,
            cliente_name: data.cliente_name,
            profissional_id: data.profissional_id,
            profissional_name: data.profissional_name,
            observations: data.observations || '',
          });
        }
      });
    } else if (initialData && !comanda && !loading && !hasOpenedComanda.current && user) {
      handleOpenComanda();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [comanda_id, activeComandaId, initialData?.cliente_id, initialData?.cliente_name, initialData?.profissional_id, initialData?.agendamento_id, user]);

  useEffect(() => {
    loyaltyService.getConfig().then(cfg => {
      setLoyaltyConfig(cfg);
    }).catch(err => console.error("Error fetching loyalty config:", err));
  }, []);

  useEffect(() => {
    if (comanda?.cliente_id) {
      const client = clients.find(c => c.uid === comanda.cliente_id);
      setSelectedClientProfile(client || null);
      
      // Load loyalty points
      loyaltyService.getClientPoints(comanda.cliente_id).then(loyalty => {
        setClientLoyalty({ points: loyalty.points, cashback: loyalty.cashback });
      });

      // Load client debts
      loadClientDebts(comanda.cliente_id);
    } else {
      setSelectedClientProfile(null);
      setClientLoyalty(null);
      setClientDebts([]);
    }
  }, [comanda?.cliente_id, clients]);

  const loadData = async () => {
    try {
      const [s, p, pm] = await Promise.all([
        serviceService.getServices(),
        inventoryService.getProducts(),
        paymentMethodService.getPaymentMethods()
      ]);
      setServices(s);
      setProducts(p);
      // Filter out 'assinatura' so it is not selectable as a payment method at checkout
      setPaymentMethods(pm.filter(m => m.status === 'active' && m.type !== 'assinatura'));
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  };

  const loadComanda = async () => {
    if (!comanda_id) return;
    setLoading(true);
    try {
      const data = await comandaService.getComandaById(comanda_id);
      setComanda(data);
      if (data) {
        setFormData({
          cliente_id: data.cliente_id,
          cliente_name: data.cliente_name,
          profissional_id: data.profissional_id,
          profissional_name: data.profissional_name,
          observations: data.observations || '',
        });
      }
    } catch (error) {
      console.error("Erro ao carregar comanda:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenComanda = async () => {
    const effectiveClienteId = formData.cliente_id || initialData?.cliente_id || 'avulso';
    const effectiveClienteName = formData.cliente_name || initialData?.cliente_name || (effectiveClienteId === 'avulso' ? 'Consumidor Final' : '');
    const effectiveProfissionalId = formData.profissional_id || initialData?.profissional_id || '';

    if (!user) {
      return; // Wait for auth if not provided
    }

    if (!effectiveClienteId && !effectiveClienteName) {
      return;
    }

    if (hasOpenedComanda.current) return;
    hasOpenedComanda.current = true;

    setLoading(true);
    try {
      const client = clients.find(c => c.uid === effectiveClienteId);
      const barber = barbers.find(b => b.uid === effectiveProfissionalId);

      const newComanda = await comandaService.openComanda({
        ...formData,
        cliente_id: effectiveClienteId,
        profissional_id: effectiveProfissionalId,
        cliente_name: client?.nome || initialData?.cliente_name || formData.cliente_name || 'Consumidor Final',
        profissional_name: barber?.nome || initialData?.profissional_name || formData.profissional_name || 'Sem Profissional',
        origin: initialData?.origin || 'balcao',
        agendamento_id: initialData?.agendamento_id || (initialData as any)?.agendamentoId || (initialData as any)?.appointment_id || (initialData as any)?.appointmentId || '',
        daily_flow_id: (initialData as any)?.daily_flow_id || (initialData as any)?.dailyFlowId || '',
        status: 'aberta',
        items: initialData?.items || [],
        aberto_por_id: user.uid,
        aberto_por_name: profile?.nome || user.email || 'Usuário'
      }, user.uid, profile?.nome || user.email || 'Usuário');
      
      // Se a comanda foi aberta a partir de um agendamento original, atualiza o agendamento com o ID/número da comanda
      if (initialData?.agendamento_id) {
        try {
          await updateDoc(doc(db, 'appointments', initialData.agendamento_id), {
            comanda_id: newComanda.id,
            comanda_number: newComanda.number
          });
        } catch (linkErr) {
          console.error("Erro ao sincronizar comanda com o agendamento de origem:", linkErr);
        }
      }

      // Se a comanda foi aberta a partir do fluxo de operações do dia
      if ((initialData as any)?.daily_flow_id) {
        try {
          await updateDoc(doc(db, 'daily_flow', (initialData as any).daily_flow_id), {
            comanda_id: newComanda.id,
            comanda_number: newComanda.number
          });
        } catch (linkErr) {
          console.error("Erro ao sincronizar comanda com o fluxo de atendimento:", linkErr);
        }
      }

      setComanda(newComanda);
      setActiveComandaId(newComanda.id);
    } catch (error) {
      console.error("Erro ao abrir comanda:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSubscriptionDiscount = (item: Service | Product, itemType: 'servico' | 'product'): number => {
    const activeSub = clientSubscriptions.find(s => s.status === 'active');
    if (!activeSub) return 0;

    let discounts: SubscriptionDiscount[] = activeSub.discounts || [];
    if ((!discounts || discounts.length === 0) && subscriptionPlans.length > 0) {
      const plan = subscriptionPlans.find(p => p.id === activeSub.plano_id);
      if (plan && plan.discounts) {
        discounts = plan.discounts;
      }
    }

    if (!discounts || discounts.length === 0) return 0;

    // Match order:
    // 1. Exact match (specific service or specific product)
    // 2. Generic match (all_services or all_products)
    
    // Exact match search
    const exactPrefix = itemType === 'servico' ? `servico_${item.id}` : `product_${item.id}`;
    const exactDiscount = discounts.find(d => d.itemId === exactPrefix || d.itemId === item.id);
    if (exactDiscount) {
      return exactDiscount.percentage;
    }

    // Generic match search
    const genericType = itemType === 'servico' ? 'all_services' : 'all_products';
    const genericDiscount = discounts.find(d => d.itemId === genericType || d.itemType === genericType);
    if (genericDiscount) {
      return genericDiscount.percentage;
    }

    return 0;
  };

  const addItem = async (item: Service | Product, type: 'servico' | 'product', isCortesia: boolean = false) => {
    if (!comanda || !user || loading) return;

    if (type === 'product' && (item as Product).currentStock <= 0) {
      toast.warning("Atenção: Produto com estoque zerado ou negativo adicionado à comanda.");
    }

    // Duplication protection: check if item is already being added
    setLoading(true);
    try {
      const originalPrice = type === 'servico' ? (item as Service).preco ?? (item as Service).price ?? 0 : (item as Product).salePrice ?? (item as any).preco ?? 0;
      const subDiscount = getSubscriptionDiscount(item, type);
      const unitPrice = subDiscount > 0 ? originalPrice * (1 - subDiscount / 100) : originalPrice;

      let deductTypeVal: 'assinatura' | 'pacote' | undefined = undefined;
      let subscriptionIdVal: string | undefined = undefined;
      let packageSaleIdVal: string | undefined = undefined;
      let packageUnitPriceVal: number | undefined = undefined;
      let isCortesiaVal = isCortesia;
      let totalPriceVal = isCortesia ? 0 : unitPrice;
      let generateCommVal = (type === 'servico' || type === 'product');

      const activeSub = clientSubscriptions?.find(s => s.status === 'active');
      if (type === 'servico' && activeSub && !isCortesia) {
        let isEligible = false;
        if (activeSub.services && activeSub.services.length > 0) {
          const planService = activeSub.services.find((ps: any) => ps.serviceId === item.id);
          if (planService) {
            if (planService.isUnlimited) isEligible = true;
            else {
              const currentUsed = (activeSub.serviceUsages && activeSub.serviceUsages[item.id]) || 0;
              isEligible = currentUsed < planService.limit;
            }
          }
        } else {
          const itemDisplayName = (item as Service).nome || item.name || '';
          const isCut = itemDisplayName.toLowerCase().includes('corte') || itemDisplayName.toLowerCase().includes('cabelo') || itemDisplayName.toLowerCase().includes('hair');
          const isBeard = itemDisplayName.toLowerCase().includes('barba') || itemDisplayName.toLowerCase().includes('beard');
          if (isCut) isEligible = (activeSub.haircutsUsed ?? 0) < (activeSub.haircutsPerMonth || 999);
          else if (isBeard) isEligible = (activeSub.beardsUsed ?? 0) < (activeSub.beardsPerMonth || 999);
          else isEligible = true;
        }

        if (isEligible) {
          deductTypeVal = 'assinatura';
          subscriptionIdVal = activeSub.id;
          isCortesiaVal = true;
          totalPriceVal = 0;
          generateCommVal = false;
          toast.info(`Serviço coberto e zerado pelo Clube de Assinatura!`);
        }
      }

      // Check for active package if not covered by subscription
      if (type === 'servico' && !deductTypeVal && !isCortesia && allAvailablePackages && allAvailablePackages.length > 0) {
        const itemDisplayName = (item as Service).nome || item.name || '';
        const matchingPackage = allAvailablePackages.find(
          p => p.remainingCuts > 0 && (
            p.serviceId === item.id || 
            (p.serviceName && p.serviceName.toLowerCase().trim() === itemDisplayName.toLowerCase().trim()) ||
            p.packageName.toLowerCase().includes(itemDisplayName.toLowerCase()) ||
            (p.packageName.toLowerCase().includes('corte') && (itemDisplayName.toLowerCase().includes('corte') || itemDisplayName.toLowerCase().includes('cabelo'))) ||
            (p.packageName.toLowerCase().includes('barba') && itemDisplayName.toLowerCase().includes('barba')) ||
            (p.packageName.toLowerCase().includes('navalhado') && itemDisplayName.toLowerCase().includes('navalhado'))
          )
        );

        if (matchingPackage) {
          const pPrice = matchingPackage.pricePerService !== undefined && matchingPackage.pricePerService !== null 
            ? matchingPackage.pricePerService 
            : (matchingPackage.totalCuts > 0 ? matchingPackage.pricePaid / matchingPackage.totalCuts : unitPrice);

          deductTypeVal = 'pacote';
          packageSaleIdVal = matchingPackage.id;
          packageUnitPriceVal = pPrice;
          isCortesiaVal = true;
          totalPriceVal = 0;
          generateCommVal = true;
          toast.success(`Serviço coberto pelo pacote "${matchingPackage.packageName}" (R$ ${pPrice.toFixed(2)} por sessão para comissão)!`);
        }
      }

      if (subDiscount > 0 && !isCortesiaVal && !deductTypeVal) {
        const itemDisplayName = (item as Service).nome || item.name || '';
        toast.info(`Desconto de ${subDiscount}% de assinante aplicado ao item: ${itemDisplayName}!`);
      }

      const targetBarberId = (type === 'servico' && selectedBarberForService) ? selectedBarberForService : comanda.profissional_id;
      const targetBarber = barbers.find(b => b.uid === targetBarberId || b.id === targetBarberId);
      const targetBarberName = targetBarber 
        ? (targetBarber.nome || targetBarber.displayName || targetBarber.name || 'Barbeiro') 
        : comanda.profissional_name;

      const newItem: ComandaItem = {
        id: `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: type === 'servico' ? 'servico' : 'produto',
        referencia_id: item.id,
        name: (item as Service).nome || item.name || '',
        quantity: 1,
        unitPrice,
        totalPrice: totalPriceVal,
        profissional_id: targetBarberId,
        profissional_name: targetBarberName,
        isCortesia: isCortesiaVal,
        deductType: deductTypeVal,
        subscriptionId: subscriptionIdVal,
        packageSaleId: packageSaleIdVal,
        packageUnitPrice: packageUnitPriceVal,
        generateCommission: generateCommVal
      };

      const updatedItems = [...(comanda.items || []), newItem];
      await comandaService.updateComandaItems(
        comanda.id, 
        updatedItems, 
        comanda.discount, 
        comanda.tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );

      // Se for um serviço, cria um agendamento tipo "encaixe" para ocupar a agenda e não deixar livre
      if (type === 'servico') {
        try {
          const serviceDur = (item as Service).duracao_minutos || (item as Service).duration || 30;
          let dateStr = format(new Date(), 'yyyy-MM-dd');
          let startTimeStr = format(new Date(), 'HH:mm');
          let parentStatus = 'confirmado';

          if (comanda.agendamento_id) {
            const parentAppSnap = await getDoc(doc(db, 'appointments', comanda.agendamento_id));
            if (parentAppSnap.exists()) {
              const pData = parentAppSnap.data();
              if (pData.date) dateStr = pData.date;
              if (pData.endTime) startTimeStr = pData.endTime;
              if (pData.status) parentStatus = pData.status;
            }
          } else {
            // Se for comanda avulsa (sem agendamento de origem) mas já estiver aberta ou em atendimento,
            // define o encaixe como 'em_atendimento' para que fique da mesma cor amarela/laranja.
            if (comanda.status === 'aberta' || comanda.status === 'aguardando_pagamento') {
              parentStatus = 'em_atendimento';
            }
          }

          // Busca todos os agendamentos já agendados para este cliente no mesmo dia para encadear os horários sequencialmente
          if (comanda.cliente_id) {
            try {
              const apptsQuery = query(
                collection(db, 'appointments'),
                where('cliente_id', '==', comanda.cliente_id),
                where('date', '==', dateStr)
              );
              const apptsSnap = await getDocs(apptsQuery);
              let latestEndTime = startTimeStr;
              apptsSnap.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.endTime && data.endTime > latestEndTime && data.status !== 'cancelado') {
                  latestEndTime = data.endTime;
                }
              });
              startTimeStr = latestEndTime;
            } catch (queryErr) {
              console.error("Erro ao buscar agendamentos existentes para encadeamento:", queryErr);
            }
          }

          const momentStart = parse(startTimeStr, 'HH:mm', new Date());
          const momentEnd = addMinutes(momentStart, serviceDur);
          const endTimeStr = format(momentEnd, 'HH:mm');

          await appointmentService.createAppointment({
            cliente_id: comanda.cliente_id || '',
            cliente_name: comanda.cliente_name || 'Cliente Avulso',
            profissional_id: targetBarberId,
            profissional_name: targetBarberName,
            servico_id: item.id,
            servico_name: (item as Service).nome || item.name || 'Serviço',
            date: dateStr,
            startTime: startTimeStr,
            endTime: endTimeStr,
            duration: serviceDur,
            price: isCortesia ? 0 : unitPrice,
            status: parentStatus as any,
            origin: 'encaixe',
            comanda_id: comanda.id,
            comanda_number: comanda.number,
            notes: `Encaixe automático via comanda #${comanda.number}`
          });
          toast.success("Horário de encaixe gerado sequencialmente e coligado à comanda.");
        } catch (apptErr) {
          console.error("Erro ao gerar encaixe automático na agenda:", apptErr);
          toast.error("Serviço adicionado, mas não foi possível reservar o horário de encaixe.");
        }
      }
      
      setShowItemSelector(null);
      toast.success(`${type === 'servico' ? 'Serviço' : 'Produto'} adicionado.`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao adicionar item.");
    } finally {
      setLoading(false);
    }
  };

  const addPackageItem = async (pkg: any) => {
    if (!comanda || !user || loading) return;

    setLoading(true);
    try {
      const price = pkg.promotionalPrice !== undefined && pkg.promotionalPrice !== null ? pkg.promotionalPrice : (pkg.originalPrice || 0);
      const newItem: ComandaItem = {
        id: `package-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        type: 'pacote' as const,
        referencia_id: pkg.id,
        name: `Venda Pacote: ${pkg.name}`,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
        profissional_id: comanda.profissional_id,
        profissional_name: comanda.profissional_name,
        isCortesia: false,
        generateCommission: false,
        metadata: {
          cutsCount: pkg.cutsCount || 1,
          pricePerService: pkg.pricePerService !== undefined ? pkg.pricePerService : null,
          noExpiration: pkg.noExpiration || false,
          expiresDays: pkg.expiresDays || 0,
          serviceId: pkg.serviceId || '',
          serviceName: pkg.serviceName || ''
        }
      };

      const updatedItems = [...(comanda.items || []), newItem];
      await comandaService.updateComandaItems(
        comanda.id,
        updatedItems,
        comanda.discount,
        comanda.tip,
        user.uid,
        profile?.nome || user.email || 'Usuário'
      );
      setShowItemSelector(null);
      toast.success(`Pacote "${pkg.name}" adicionado à comanda.`);
    } catch (err) {
      console.error("Erro ao adicionar pacote à comanda:", err);
      toast.error("Erro ao adicionar pacote à comanda.");
    } finally {
      setLoading(false);
    }
  };

  const updateFinancials = async (updates: { tip?: number, discount?: number }) => {
    if (!comanda || !user || loading) return;
    
    setLoading(true);
    try {
      const tip = updates.tip !== undefined ? updates.tip : comanda.tip;
      const discount = updates.discount !== undefined ? updates.discount : comanda.discount;
      
      await comandaService.updateComandaItems(
        comanda.id, 
        comanda.items, 
        discount, 
        tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar financeiro.");
    } finally {
      setLoading(false);
    }
  };

  const removeItem = async (itemId: string) => {
    if (!comanda || !user || loading) return;
    
    setLoading(true);
    try {
      const itemToRemove = comanda.items.find(i => i.id === itemId);
      const updatedItems = comanda.items.filter(i => i.id !== itemId);

      if (updatedItems.length === 0) {
        // If no items remain, delete the comanda completely and delete all of its linked appointments
        const batch = writeBatch(db);
        batch.delete(doc(db, 'comandas', comanda.id));

        const allApptsQuery = query(
          collection(db, 'appointments'),
          where('comanda_id', '==', comanda.id)
        );
        const allApptsSnap = await getDocs(allApptsQuery);
        allApptsSnap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
        toast.success("Comanda vazia e seus horários foram removidos.");
        onClose();
        return;
      }

      await comandaService.updateComandaItems(
        comanda.id, 
        updatedItems, 
        comanda.discount, 
        comanda.tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );

      // If a service item was removed, delete its linked appointment from the database
      if (itemToRemove && itemToRemove.type === 'servico') {
        try {
          const apptsQuery = query(
            collection(db, 'appointments'),
            where('comanda_id', '==', comanda.id),
            where('servico_id', '==', itemId)
          );
          const apptsSnap = await getDocs(apptsQuery);
          const batch = writeBatch(db);
          let deletedAppCount = 0;
          apptsSnap.forEach((docSnap) => {
            batch.delete(docSnap.ref);
            deletedAppCount++;
          });
          if (deletedAppCount > 0) {
            await batch.commit();
            console.log(`Deleted ${deletedAppCount} linked appointments on service removal.`);
          }
        } catch (appDelErr) {
          console.error("Error deleting linked appointment on service removal:", appDelErr);
        }
      }

      toast.success("Item removido.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover item.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCortesia = async (itemId: string) => {
    if (!comanda || !user || loading) return;

    setLoading(true);
    try {
      const updatedItems = comanda.items.map(i => {
        if (i.id === itemId) {
          const isCortesia = !i.isCortesia;
          return {
            ...i,
            isCortesia,
            totalPrice: isCortesia ? 0 : i.unitPrice * i.quantity,
            generateCommission: (i.type === 'servico' || i.type === 'produto' || i.type === 'product')
          };
        }
        return i;
      });

      await comandaService.updateComandaItems(
        comanda.id, 
        updatedItems, 
        comanda.discount, 
        comanda.tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );
      toast.success("Cortesia atualizada.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar cortesia.");
    } finally {
      setLoading(false);
    }
  };

  const updateItemPrice = async (itemId: string, newPrice: number) => {
    if (!comanda || !user || loading) return;
    if (newPrice < 0 || isNaN(newPrice)) {
      toast.error("Valor inválido.");
      return;
    }

    setLoading(true);
    try {
      const updatedItems = comanda.items.map(i => {
        if (i.id === itemId) {
          return {
            ...i,
            unitPrice: newPrice,
            totalPrice: i.isCortesia ? 0 : newPrice * i.quantity
          };
        }
        return i;
      });

      await comandaService.updateComandaItems(
        comanda.id, 
        updatedItems, 
        comanda.discount, 
        comanda.tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );
      toast.success("Valor do item atualizado.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar valor do item.");
    } finally {
      setLoading(false);
    }
  };

  const toggleItemDeduction = async (itemId: string, type: 'pacote' | 'assinatura' | 'none', specificPackageSaleId?: string) => {
    if (!comanda || !user || loading) return;
    
    setLoading(true);
    try {
      const updatedItems = comanda.items.map(i => {
        if (i.id === itemId) {
          if (type === 'pacote') {
            const hasPkg = specificPackageSaleId 
              ? allAvailablePackages.find(p => p.id === specificPackageSaleId)
              : allAvailablePackages.find(
                  p => p.remainingCuts > 0 && (p.serviceId === i.referencia_id || p.packageName.toLowerCase().includes(i.name.toLowerCase()))
                );
            const pPrice = hasPkg 
              ? (hasPkg.pricePerService !== undefined && hasPkg.pricePerService !== null 
                  ? hasPkg.pricePerService 
                  : (hasPkg.pricePaid / hasPkg.totalCuts)) 
              : 0;
            return {
              ...i,
              deductType: 'pacote' as const,
              packageSaleId: hasPkg?.id || '',
              packageUnitPrice: pPrice,
              subscriptionId: '',
              isCortesia: true,
              totalPrice: 0,
              generateCommission: true
            };
          } else if (type === 'assinatura') {
            const activeSub = clientSubscriptions.find(s => s.status === 'active');
            return {
              ...i,
              deductType: 'assinatura' as const,
              packageSaleId: '',
              subscriptionId: activeSub?.id || '',
              isCortesia: true,
              totalPrice: 0,
              generateCommission: false
            };
          } else {
            return {
              ...i,
              deductType: undefined,
              packageSaleId: undefined,
              subscriptionId: undefined,
              isCortesia: false,
              totalPrice: i.unitPrice * i.quantity,
              generateCommission: true
            };
          }
        }
        return i;
      });

      await comandaService.updateComandaItems(
        comanda.id,
        updatedItems,
        comanda.discount,
        comanda.tip,
        user.uid,
        profile?.nome || user.email || 'Usuário'
      );
      toast.success("Forma de consumo do item atualizada.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao atualizar forma de consumo.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPayment = async (
    method: PaymentMethod,
    amount: number,
    metodo_pagamento_id?: string,
    options?: {
      entersCash?: boolean;
      excessMode?: 'abater_fiado' | 'credito_haver' | 'troco';
      bypassLoadingCheck?: boolean;
    }
  ) => {
    if (!comanda || !user || (loading && !options?.bypassLoadingCheck)) return;
    setLoading(true);
    try {
      const currentCash = await cashService.getCurrentCash();
      const entersCash = options?.entersCash !== false;
      
      if (['fiado', 'resgate'].indexOf(method) === -1 && !currentCash && entersCash) {
        toast.error("O caixa precisa estar aberto para receber pagamentos.");
        return;
      }

      if (method === 'resgate') {
        const minVal = loyaltyConfig?.minRedemptionValue || 0;
        if (!clientLoyalty || clientLoyalty.cashback < amount) {
          toast.error("Saldo de cashback insuficiente.");
          return;
        }
        if (minVal > 0 && clientLoyalty.cashback < minVal) {
          toast.error(`O valor mínimo para resgate de saldo é de R$ ${minVal.toFixed(2)}. Saldo atual: R$ ${clientLoyalty.cashback.toFixed(2)}`);
          return;
        }
        
        await loyaltyService.redeemPoints(
          comanda.cliente_id, 
          0, // only cashback for now
          amount, 
          `Resgate de cashback na Comanda #${comanda.number}`
        );
        
        // Refresh loyalty state
        const updatedLoyalty = await loyaltyService.getClientPoints(comanda.cliente_id);
        setClientLoyalty({ points: updatedLoyalty.points, cashback: updatedLoyalty.cashback });
      }

      // Check if user is overpaying comanda
      const totalPendingComanda = comanda.pendingAmount || 0;
      const totalPendingDebts = clientDebts.reduce((sum, d) => sum + (d.remainingAmount || 0), 0);

      if (amount > totalPendingComanda && comanda.cliente_id && comanda.cliente_id !== 'avulso' && !options?.excessMode) {
        setConfirmExcessPayment({
          method,
          amount,
          metodo_pagamento_id,
          excess: amount - totalPendingComanda,
          pendingDebts: totalPendingDebts
        });
        setLoading(false);
        return;
      }
      
      let comandaPaymentAmount = amount;
      let debtPaymentAmount = 0;
      let creditHaverAmount = 0;

      if (amount > totalPendingComanda && comanda.cliente_id && comanda.cliente_id !== 'avulso') {
        comandaPaymentAmount = totalPendingComanda;
        const excess = amount - totalPendingComanda;

        if (options?.excessMode === 'credito_haver') {
          creditHaverAmount = excess;
        } else if (options?.excessMode === 'troco') {
          toast.info(`Troco a devolver ao cliente: R$ ${excess.toFixed(2)}`);
        } else if (options?.excessMode === 'abater_fiado') {
          debtPaymentAmount = Math.min(excess, totalPendingDebts);
          if (excess > totalPendingDebts) {
            creditHaverAmount = excess - totalPendingDebts;
          }
        }
      }

      // 1. Pay comanda portion if > 0
      if (comandaPaymentAmount > 0) {
        await comandaService.addPayment(
          comanda.id, 
          {
            method,
            metodo_pagamento_id,
            amount: comandaPaymentAmount,
            date: new Date().toISOString().split('T')[0]
          },
          user.uid,
          profile?.nome || user.email || 'Usuário',
          { addToCashSession: entersCash }
        );
      }

      // 2. Abate excess from pending client debts sequentially
      if (debtPaymentAmount > 0) {
        let remainingExcess = debtPaymentAmount;
        const sortedDebts = [...clientDebts].sort((a, b) => new Date(a.date || a.createdAt?.seconds * 1000 || 0).getTime() - new Date(b.date || b.createdAt?.seconds * 1000 || 0).getTime());
        
        for (const debt of sortedDebts) {
          if (remainingExcess <= 0) break;
          const payForThisDebt = Math.min(debt.remainingAmount, remainingExcess);
          if (payForThisDebt > 0) {
            await comandaService.payDebt(
              debt.id,
              payForThisDebt,
              method,
              metodo_pagamento_id || '',
              user.uid,
              profile?.nome || user.email || 'Usuário'
            );
            remainingExcess -= payForThisDebt;
          }
        }

        toast.success(`Pagamento registrado! R$ ${comandaPaymentAmount.toFixed(2)} aplicados na comanda e R$ ${debtPaymentAmount.toFixed(2)} abatidos do fiado do cliente.`);
        await loadClientDebts(comanda.cliente_id);
      }

      // 3. Credit remaining excess as "Crédito em Haver"
      if (creditHaverAmount > 0 && comanda.cliente_id && comanda.cliente_id !== 'avulso') {
        const clientProf = await userService.getUserProfile(comanda.cliente_id);
        if (clientProf) {
          const currentBal = clientProf.saldo_atual ?? clientProf.balance ?? 0;
          const newBal = currentBal + creditHaverAmount;
          await userService.updateUserProfile(comanda.cliente_id, {
            saldo_atual: newBal,
            balance: newBal
          });
          toast.success(`R$ ${creditHaverAmount.toFixed(2)} adicionados como Crédito em Haver na conta do cliente!`);
        }
      }

      if (debtPaymentAmount === 0 && creditHaverAmount === 0) {
        toast.success("Pagamento registrado com sucesso.");
      }

      setPaymentInputAmount('');
    } catch (error) {
      console.error("Erro ao processar pagamento:", error);
      toast.error("Erro ao processar pagamento: " + formatErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const processPackageAndSubscriptionDeductions = async (com: Comanda) => {
    for (const item of com.items) {
      if (item.deductType === 'pacote' && item.packageSaleId) {
        const isVirtual = com.items.find(i => i.id === item.packageSaleId && i.type === 'pacote');
        if (!isVirtual) {
          try {
            const pkgRef = doc(db, 'pacotes_vendas', item.packageSaleId);
            const pkgSnap = await getDoc(pkgRef);
            if (pkgSnap.exists()) {
              const pkgData = pkgSnap.data();
              const currentUsages = pkgData.usages || [];
              const newIndex = currentUsages.length + 1;
              const newUsage = {
                usedAt: new Date().toISOString(),
                notes: `Consumo automático na Comanda #${com.number}`,
                index: newIndex,
                comanda_id: com.id
              };
              await updateDoc(pkgRef, {
                remainingCuts: Math.max(0, (pkgData.remainingCuts || 0) - 1),
                usages: [...currentUsages, newUsage]
              });
            }
          } catch (e) {
            console.error("Erro ao deduzir pacote:", e);
          }
        }
      } else if (item.deductType === 'assinatura' && item.subscriptionId) {
        try {
          const isCut = item.name.toLowerCase().includes('corte') || item.name.toLowerCase().includes('cabelo') || item.name.toLowerCase().includes('hair');
          const typeLabel: 'haircut' | 'beard' = isCut ? 'haircut' : 'beard';
          
          await subscriptionService.registerUsage(
            item.subscriptionId, 
            typeLabel, 
            com.agendamento_id,
            item.profissional_id || com.profissional_id || null,
            item.profissional_name || com.profissional_name || null,
            item.unitPrice || item.totalPrice || 0,
            item.referencia_id || item.id,
            item.name
          );
        } catch (e) {
          console.error("Erro ao deduzir assinatura:", e);
        }
      } else if (item.type === 'pacote') {
        try {
          const deductedServicesInComanda = com.items.filter(i => i.deductType === 'pacote' && i.packageSaleId === item.id);
          const cutsUsedCount = deductedServicesInComanda.length;
          
          const totalCuts = item.metadata?.cutsCount || 1;
          const remainingCuts = Math.max(0, totalCuts - cutsUsedCount);
          
          const initialUsages = deductedServicesInComanda.map((ds, idx) => ({
            usedAt: new Date().toISOString(),
            notes: `Consumo automático na venda do Pacote (Comanda #${com.number})`,
            index: idx + 1,
            comanda_id: com.id
          }));

          await addDoc(collection(db, 'pacotes_vendas'), {
            tenantId: com.tenantId || getActiveTenantId(),
            clientId: com.cliente_id,
            clientName: com.cliente_name,
            packageId: item.referencia_id,
            packageName: item.name.replace('Venda Pacote: ', ''),
            totalCuts,
            remainingCuts,
            pricePaid: item.totalPrice,
            pricePerService: item.metadata?.pricePerService !== undefined ? item.metadata?.pricePerService : null,
            noExpiration: item.metadata?.noExpiration || false,
            expiresDays: item.metadata?.expiresDays || 0,
            soldAt: new Date().toISOString(),
            usages: initialUsages,
            serviceId: item.metadata?.serviceId || '',
            serviceName: item.metadata?.serviceName || ''
          });
        } catch (e) {
          console.error("Erro ao registrar venda de pacote:", e);
        }
      }
    }
  };

  const handleCloseComandaWithChoice = async (
    typeOverride?: 'fiado' | 'permuta' | 'cortesia' | 'desconto' | 'clube' | 'total_pago',
    noteOverride?: string
  ) => {
    if (!comanda || !user || loading) return;
    const finalType = typeOverride || (comanda.pendingAmount <= 0 ? 'total_pago' : (closureChoice || 'fiado'));
    const finalNote = noteOverride !== undefined ? noteOverride : closureNote;

    if (finalType === 'fiado' && comanda.pendingAmount > 0) {
      if (!comanda.cliente_id || comanda.cliente_id === 'avulso') {
        toast.error("Para lançar o saldo restante como Fiado, selecione um cliente cadastrado.");
        return;
      }
    }

    setLoading(true);
    try {
      await processPackageAndSubscriptionDeductions(comanda);

      // 2. Actually close the comanda
      await comandaService.closeComanda(
        comanda.id, 
        user.uid, 
        profile?.nome || user.email || 'Usuário', 
        'fechada', 
        finalType === 'fiado' ? fiadoDueDate : undefined,
        {
          closureType: finalType,
          note: finalNote
        }
      );

      // 3. Schedule automated billing reminder if requested
      if (finalType === 'fiado' && scheduleFiadoReminder && fiadoDueDate) {
        const clientObj = clients.find(c => c.uid === comanda.cliente_id);
        const phone = clientObj?.telefone || clientObj?.phone || '';
        
        await marketingService.sendSimulatedMessage({
          cliente_id: comanda.cliente_id,
          cliente_name: comanda.cliente_name,
          clientPhone: phone,
          message: `Olá, ${comanda.cliente_name}! Passando para lembrar que o pagamento do seu saldo devedor de R$ ${(comanda.pendingAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} referente à comanda #${comanda.number} está agendado para o dia ${format(new Date(fiadoDueDate + 'T12:00:00'), 'dd/MM/yyyy')}. Qualquer dúvida, estamos à disposição!`,
          campanha_id: '',
          automacao_id: 'cobranca_fiado'
        });
      }

      toast.success(
        finalType === 'fiado' 
          ? "Comanda fechada com saldo restante em Fiado!" 
          : finalType === 'permuta' 
          ? "Comanda encerrada via Permuta Comercial!" 
          : finalType === 'cortesia' 
          ? "Comanda encerrada como Cortesia!" 
          : "Comanda finalizada com sucesso!"
      );
      setShowFiadoConfirmationModal(false);
      setConfirmClose(false);
      onSave();
    } catch (error) {
      console.error("Erro ao fechar comanda:", error);
      toast.error("Erro ao fechar comanda: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickPayAndClose = async () => {
    if (!comanda || !user || loading) return;

    // 1. Se saldo pendente já é zero ou menor, finaliza direto como total_pago
    if (comanda.pendingAmount <= 0) {
      await handleCloseComandaWithChoice('total_pago');
      return;
    }

    // 2. Se estiver com divisão em 2 formas de pagamento
    if (showSecondPayment) {
      const methodObj1 = paymentMethods.find(m => m.id === selectedPaymentMethodId);
      const amount1 = Number(paymentInputAmount) || 0;
      const methodObj2 = paymentMethods.find(m => m.id === secondPaymentMethodId);
      const amount2 = Number(secondPaymentInputAmount) || 0;

      if (!methodObj1 || amount1 <= 0) {
        toast.error("Selecione a 1ª forma de pagamento e informe o valor!");
        return;
      }
      if (!methodObj2 || amount2 <= 0) {
        toast.error("Selecione a 2ª forma de pagamento e informe o valor!");
        return;
      }

      setLoading(true);
      try {
        await processPackageAndSubscriptionDeductions(comanda);

        // Lança a 1ª forma
        await handleAddPayment(methodObj1.type as any, amount1, methodObj1.id, {
          entersCash: entersCashChoice,
          excessMode: 'troco',
          bypassLoadingCheck: true
        });

        // Lança a 2ª forma
        await handleAddPayment(methodObj2.type as any, amount2, methodObj2.id, {
          entersCash: entersCashChoice,
          excessMode,
          bypassLoadingCheck: true
        });

        // Se quitou o saldo restante, finaliza
        if ((amount1 + amount2) >= comanda.pendingAmount) {
          setShowSecondPayment(false);
          setPaymentInputAmount('');
          toast.success("Comanda finalizada com sucesso nas 2 formas de pagamento!");
          onSave();
        } else {
          toast.success("Pagamentos registrados com sucesso!");
        }
      } catch (err: any) {
        console.error("Erro ao registrar 2 formas:", err);
        toast.error("Erro ao registrar pagamentos: " + formatErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Apenas 1 forma de pagamento ou Fiado direto por zerar o valor
    const isZeroPayment = paymentInputAmount !== '' && !isNaN(Number(paymentInputAmount)) && Number(paymentInputAmount) === 0;
    const methodObj = paymentMethods.find(m => m.id === selectedPaymentMethodId);

    // Se o usuário zerou o valor OU selecionou a forma Fiado OU nenhuma forma foi informada
    if (isZeroPayment || !methodObj || methodObj.type === 'fiado' || methodObj.goesToClientAccount) {
      if (!comanda.cliente_id || comanda.cliente_id === 'avulso') {
        toast.error("Para lançar o saldo restante como Fiado na conta, selecione um cliente cadastrado acima.");
        return;
      }
      const nextMonth = new Date();
      nextMonth.setDate(nextMonth.getDate() + 30);
      setFiadoDueDate(nextMonth.toISOString().split('T')[0]);
      setClosureChoice('fiado');
      setClosureNote('');
      setShowFiadoConfirmationModal(true);
      return;
    }

    const amount = Number(paymentInputAmount) > 0 ? Number(paymentInputAmount) : comanda.pendingAmount;

    setLoading(true);
    try {
      await processPackageAndSubscriptionDeductions(comanda);

      await handleAddPayment(methodObj.type as any, amount, methodObj.id, {
        entersCash: entersCashChoice,
        excessMode,
        bypassLoadingCheck: true
      });

      if (amount >= comanda.pendingAmount) {
        toast.success(`🎉 Comanda finalizada com sucesso no ${methodObj.name}!`);
        setPaymentInputAmount('');
        onSave();
      } else {
        toast.success(`Pagamento parcial de R$ ${amount.toFixed(2)} no ${methodObj.name} registrado!`);
      }
    } catch (err: any) {
      console.error("Erro ao processar pagamento rápido:", err);
      toast.error("Erro ao processar pagamento: " + formatErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseComanda = () => handleCloseComandaWithChoice('total_pago');
  const handleCloseComandaWithFiado = () => handleCloseComandaWithChoice();

  const handleConfirmPayDebt = async () => {
    if (!comanda?.cliente_id || !user) return;
    const amt = parseFloat(payingDebtAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Por favor, insira um valor válido.");
      return;
    }

    let debtToPay = selectedDebtToPay;
    if (!debtToPay) {
      const sortedPending = [...clientDebts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      if (sortedPending.length === 0) {
        toast.error("Nenhuma dívida pendente encontrada.");
        return;
      }
      debtToPay = sortedPending[0];
    }

    if (amt > debtToPay.remainingAmount) {
      toast.error(`O valor inserido (R$ ${amt}) é maior que o saldo desta dívida (R$ ${debtToPay.remainingAmount}).`);
      return;
    }

    setLoading(true);
    try {
      const method = paymentMethods.find(m => m.id === payingDebtMethod);
      if (!method) throw new Error("Método de pagamento inválido.");

      await comandaService.payDebt(
        debtToPay.id,
        amt,
        method.type as any,
        method.id,
        user.uid,
        profile?.nome || user.email || 'Usuário'
      );

      toast.success("Pagamento de fiado registrado com sucesso!");
      setIsPayingDebt(false);
      setSelectedDebtToPay(null);
      setPayingDebtAmount('');
      
      // Reload active client debts and refresh the global clients list (caixa sincronizado)
      await loadClientDebts(comanda.cliente_id);
      const updatedClients = await userService.getAllClients();
      setClients(updatedClients);
    } catch (err: any) {
      console.error("Error paying debt:", err);
      toast.error(err.message || "Erro ao registrar pagamento.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelComanda = async () => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      await comandaService.closeComanda(comanda.id, user.uid, profile?.nome || user.email || 'Usuário', 'cancelada');
      toast.success("Comanda cancelada com sucesso.");
      setConfirmCancel(false);
      onSave();
    } catch (error) {
      console.error("Erro ao cancelar comanda:", error);
      toast.error("Erro ao cancelar comanda: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppointmentFromAgenda = async () => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      // 1. Delete linked appointments directly to free up the grid slot
      await comandaService.deleteLinkedAppointments(comanda.id, comanda.agendamento_id);
      
      // 2. Also close the comanda as cancelada
      await comandaService.closeComanda(comanda.id, user.uid, profile?.nome || user.email || 'Usuário', 'cancelada');
      
      toast.success("Agendamento excluído da agenda e horário liberado com sucesso!");
      setConfirmDeleteAppointment(false);
      setConfirmCancel(false);
      onSave();
    } catch (error) {
      console.error("Erro ao excluir agendamento da agenda:", error);
      toast.error("Erro ao excluir agendamento: " + formatErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleAusenteComanda = async () => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      await comandaService.closeComanda(comanda.id, user.uid, profile?.nome || user.email || 'Usuário', 'ausente');
      toast.success("Cliente marcado como ausente e comanda cancelada.");
      setConfirmAusente(false);
      onSave();
    } catch (error) {
      console.error("Erro ao registrar ausência:", error);
      toast.error("Erro ao registrar ausência: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickClientSelect = async (client: { id: string, name: string }) => {
    if (!comanda || loading) return;
    setLoading(true);
    try {
      await comandaService.updateComandaClient(comanda.id, client, user?.uid || '', profile?.nome || user?.email || 'Sistema');
      setShowQuickClient(false);
      toast.success("Cliente atualizado.");
    } catch (error) {
      toast.error("Erro ao atualizar cliente.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickProfSelect = async (barber: { id: string, name: string }) => {
    if (!comanda || loading) return;
    setLoading(true);
    try {
      await comandaService.updateComandaBarber(comanda.id, barber, user?.uid || '', profile?.nome || user?.email || 'Sistema');
      setShowQuickProf(false);
      toast.success("Profissional atualizado e comissões recalculadas.");
    } catch (error) {
      toast.error("Erro ao atualizar profissional.");
    } finally {
      setLoading(false);
    }
  };

  const handleItemBarberChange = async (itemId: string, newProfId: string) => {
    if (!comanda || loading) return;
    const targetBarber = barbers.find(b => b.uid === newProfId || b.id === newProfId);
    const newProfName = targetBarber?.nome || targetBarber?.displayName || targetBarber?.name || 'Profissional';
    
    const updatedItems = comanda.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          profissional_id: newProfId,
          profissional_name: newProfName
        };
      }
      return item;
    });

    // Atualização otimista imediata para resposta instantânea
    setComanda(prev => prev ? ({ ...prev, items: updatedItems }) : null);

    setLoading(true);
    try {
      await comandaService.updateComandaItems(
        comanda.id,
        updatedItems,
        comanda.discount || 0,
        comanda.tip || 0,
        user?.uid || '',
        profile?.nome || user?.email || 'Sistema'
      );

      // Sincronizar com o agendamento vinculado caso exista
      if (comanda.agendamento_id) {
        try {
          await updateDoc(doc(db, 'appointments', comanda.agendamento_id), {
            profissional_id: newProfId,
            profissional_name: newProfName,
            barbeiro_id: newProfId,
            barbeiro_name: newProfName,
            updatedAt: serverTimestamp()
          });
        } catch (appErr) {
          console.warn("Não foi possível sincronizar o agendamento:", appErr);
        }
      }

      toast.success(`Profissional do serviço alterado para ${newProfName}`);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao alterar profissional do item.");
    } finally {
      setLoading(false);
    }
  };

  const handleReopenComanda = async () => {
    if (!comanda || !reopenReason || loading) return;
    
    setLoading(true);
    try {
      const reasonPrefix = {
        erro_lancamento: 'ERRO DE LANÇAMENTO',
        ajuste_pagamento: 'AJUSTE DE PAGAMENTO',
        cortesia: 'CORTESIA',
        outro: 'OUTRO'
      }[reopenReasonType];

      const reasonText = `${reasonPrefix}: ${reopenReason}`;
      
      await comandaService.reopenComanda(
        comanda.id, 
        reasonText, 
        user?.uid || '', 
        profile?.nome || user?.email || 'Sistema'
      );
      
      setShowReopenModal(false);
      setReopenReason('');
      onSave();
      toast.success("Comanda reaberta com sucesso!");
    } catch (error: any) {
      console.error("Erro ao reabrir comanda:", error);
      toast.error(error.message || "Erro ao reabrir comanda.");
    } finally {
      setLoading(false);
    }
  };

  if (!comanda && !comanda_id) {
    return (
      <div 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
      >
        <motion.div 
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden my-auto"
        >
          <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xl font-bold text-primary">Abrir Nova Comanda</h2>
            <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100">
              <X size={20} />
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Cliente</label>
                <span className="text-[10px] text-slate-400 font-medium">5 primeiros exibidos • Busque para filtrar</span>
              </div>
              <ClientSelectCombobox
                clients={clients}
                selectedClientId={formData.cliente_id}
                onSelectClient={(cid, _cname, clientObj) => {
                  if (clientObj) {
                    setClients(prev => {
                      const id = clientObj.uid || (clientObj as any).id;
                      if (id && !prev.some(c => (c.uid || (c as any).id) === id)) {
                        return [clientObj, ...prev];
                      }
                      return prev;
                    });
                  }
                  setFormData(prev => ({ ...prev, cliente_id: cid }));
                }}
                placeholder="Selecione ou busque um cliente..."
                allowAvulso={true}
                avulsoLabel="👤 Cliente Avulso (Sem Cadastro)"
                avulsoValue="avulso"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Profissional</label>
              <select 
                value={formData.profissional_id}
                onChange={(e) => setFormData({...formData, profissional_id: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium"
              >
                <option value="">Selecione um profissional</option>
                {barbers.map((b, index) => (
                  <option key={`barber-opt-${b.uid || index}-${index}`} value={b.uid}>{b.nome}</option>
                ))}
              </select>
            </div>

            <div className="pt-2 space-y-3">
              <button 
                onClick={handleOpenComanda}
                disabled={loading}
                className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-2 active:scale-95"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Receipt size={20} />}
                <span>Abrir Comanda Agora</span>
              </button>

              <button 
                type="button"
                disabled={loading || !formData.profissional_id}
                onClick={async () => {
                  if (!formData.profissional_id) {
                    toast.error("Por favor, selecione o profissional primeiro.");
                    return;
                  }
                  // Temporarily update state
                  const updatedFormData = {
                    ...formData,
                    cliente_id: 'avulso',
                    cliente_name: 'Cliente Avulso'
                  };
                  setFormData(updatedFormData);
                  
                  // Wait state to apply and open
                  setLoading(true);
                  try {
                    const prof = barbers.find(b => b.uid === formData.profissional_id);
                    const newCom = await comandaService.openComanda({
                      cliente_id: 'avulso',
                      cliente_name: 'Cliente Avulso',
                      profissional_id: formData.profissional_id,
                      profissional_name: prof?.nome || 'Profissional',
                      observations: formData.observations || '',
                      origin: 'balcao',
                      status: 'aberta',
                      items: []
                    }, user?.uid || '', profile?.nome || user?.email || 'Sistema');
                    
                    setComanda(newCom);
                    setActiveComandaId(newCom.id);
                    toast.success("Comanda de Cliente Avulso aberta!");
                    onSave();
                  } catch (err: any) {
                    toast.error("Erro ao abrir comanda: " + err.message);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <Zap size={14} className="text-amber-500" />
                <span>Atendimento Rápido Sem Cadastro</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading || !comanda) {
    return (
      <div 
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
      >
        <div className="flex flex-col items-center gap-4 my-auto">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-white font-bold text-sm animate-pulse">Carregando comanda...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <motion.div 
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border w-full max-w-6xl max-h-[94vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Header Compacto */}
        <div className="py-3 px-5 sm:px-6 border-b border-border flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-xs border border-primary/5">
              <Receipt size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-primary leading-none">Comanda #{comanda.number}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                  comanda.status === 'aberta' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  comanda.status === 'fechada' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  comanda.status === 'cancelada' ? 'bg-red-50 text-red-700 border-red-200' :
                  'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {comanda.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-[10px] text-muted font-bold uppercase tracking-wider mt-0.5">
                Iniciada em {format(parseDate(comanda.createdAt), 'HH:mm')} • {comanda.items.length} {comanda.items.length === 1 ? 'item' : 'itens'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsPDVMode(!isPDVMode)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs active:scale-95 border cursor-pointer ${
                isPDVMode 
                  ? 'bg-accent text-white border-accent' 
                  : 'bg-white text-primary border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Zap size={14} fill={isPDVMode ? 'currentColor' : 'none'} />
              <span>{isPDVMode ? 'Modo Normal' : 'Modo PDV'}</span>
            </button>
            <div className="w-px h-6 bg-slate-200 mx-0.5" />
            <button 
              onClick={onClose} 
              className="p-2 text-muted hover:text-primary hover:bg-slate-100 transition-colors bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-center cursor-pointer"
              title="Fechar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {comanda.status === 'fechada' ? (
            /* VISÃO DEDICADA DE COMANDA FECHADA - LIMPA, INTUITIVA E COM REABERTURA EM DESTAQUE */
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* Banner Superior de Sucesso com Botão de Reabrir em Destaque */}
              <div className="bg-emerald-600 text-white rounded-3xl p-6 shadow-xl shadow-emerald-600/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 border border-emerald-500">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white backdrop-blur-md shrink-0 shadow-inner">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-black text-xl tracking-tight text-white">Comanda #{comanda.number} Fechada</h3>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-white text-emerald-800 px-2.5 py-0.5 rounded-full shadow-xs">
                        Concluída & Paga
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100 font-medium mt-1">
                      Cliente: <strong className="text-white">{comanda.cliente_name}</strong>
                      {comanda.closedAt && (
                        <span className="ml-2 opacity-90">
                          • Finalizada em {format(parseDate(comanda.closedAt), 'dd/MM/yyyy HH:mm')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Botão Reabrir Comanda com Destaque Visual */}
                <button
                  type="button"
                  onClick={() => setShowReopenModal(true)}
                  disabled={loading}
                  className="w-full sm:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                  title="Reabrir comanda para ajustes ou correções"
                >
                  <RefreshCcw size={16} />
                  <span>Reabrir Comanda</span>
                </button>
              </div>

              {/* Grid de 2 Colunas: Itens à Esquerda, Resumo Financeiro à Direita */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Coluna Esquerda: Itens Realizados (Serviços e Produtos) */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                          <Scissors size={18} />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-800">Serviços e Produtos Realizados</h4>
                          <p className="text-[11px] text-slate-400 font-medium">{comanda.items.length} itens no atendimento</p>
                        </div>
                      </div>
                      <span className="text-xs font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-xl">
                        Total: R$ {(comanda.totalAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {comanda.items.map((item, idx) => {
                        const isService = item.type === 'servico' || item.type === 'assinatura';
                        return (
                          <div key={`closed-item-${idx}`} className="py-3.5 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                                isService ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                                {isService ? <Scissors size={16} /> : <Package size={16} />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-slate-800">{item.name}</span>
                                  {item.quantity > 1 && (
                                    <span className="text-xs font-bold text-slate-400">({item.quantity}x)</span>
                                  )}
                                  {item.isCortesia && (
                                    <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100">Cortesia</span>
                                  )}
                                  {item.deductType === 'pacote' && (
                                    <span className="text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100">Pacote</span>
                                  )}
                                  {item.deductType === 'assinatura' && (
                                    <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">Clube</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-1">
                                  <span>💈 Atendido por:</span>
                                  <strong className="text-slate-800">{item.profissional_name || comanda.profissional_name || 'Profissional'}</strong>
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-sm text-slate-800">
                                R$ {(item.totalPrice ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Observações da comanda se houver */}
                  {comanda.notes && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">Observações</span>
                      <p className="text-xs text-slate-700 font-medium">{comanda.notes}</p>
                    </div>
                  )}

                  {/* Histórico de Reabertura se houver */}
                  {comanda.reopenHistory && comanda.reopenHistory.length > 0 && (
                    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                        <History size={15} />
                        <span>Histórico de Reabertura</span>
                      </div>
                      {comanda.reopenHistory.map((rh, rhIdx) => (
                        <p key={`rh-${rhIdx}`} className="text-xs text-amber-900 leading-relaxed">
                          • {rh.userName} reabriu em {format(new Date(rh.date), 'dd/MM/yyyy HH:mm')}: <em>"{rh.reason}"</em>
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Coluna Direita: Resumo Financeiro e Pagamentos Efetuados */}
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5">
                    <h4 className="font-black text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-3">
                      Resumo Financeiro
                    </h4>

                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal Serviços</span>
                        <span className="font-bold text-slate-800">R$ {(comanda.subtotalServices ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {comanda.subtotalProducts > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal Produtos</span>
                          <span className="font-bold text-slate-800">R$ {(comanda.subtotalProducts ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {comanda.discount > 0 && (
                        <div className="flex justify-between text-rose-600">
                          <span>Desconto</span>
                          <span className="font-bold">- R$ {comanda.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      {comanda.tip > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Gorjeta</span>
                          <span className="font-bold">+ R$ {comanda.tip.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className="font-black text-sm text-slate-900 uppercase tracking-wider">Total Geral Pago</span>
                        <span className="font-black text-2xl text-emerald-600 tracking-tight">
                          R$ {(comanda.paidAmount || comanda.totalAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Formas de Pagamento Utilizadas */}
                    <div className="pt-4 border-t border-slate-100 space-y-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                        Formas de Pagamento Recebidas
                      </span>
                      <div className="space-y-2">
                        {comanda.payments && comanda.payments.length > 0 ? (
                          comanda.payments.map((pmt, pIdx) => (
                            <div key={`closed-pmt-${pIdx}`} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CreditCard size={15} className="text-emerald-600" />
                                <span className="text-xs font-bold text-slate-800 capitalize">
                                  {pmt.method === 'cartao' ? 'Cartão' : pmt.method}
                                </span>
                              </div>
                              <span className="text-xs font-black text-emerald-700">
                                R$ {(pmt.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold">
                            Totalmente Quitada
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botão Secundário de Reabrir no Rodapé */}
                    <div className="pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowReopenModal(true)}
                        disabled={loading}
                        className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95"
                      >
                        <RefreshCcw size={15} />
                        <span>Reabrir Comanda</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Side: Items and Info */}
          <div className={`lg:col-span-7 space-y-4 ${isPDVMode ? 'animate-in slide-in-from-left duration-500' : ''}`}>
            {!isPDVMode && (
              <div className="flex border-b border-slate-200/80 gap-6">
                <button 
                  onClick={() => setActiveSubTab('itens')}
                  className={`pb-2.5 text-xs font-black uppercase tracking-wider relative transition-all cursor-pointer ${
                    activeSubTab === 'itens' ? 'text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  Itens e Atendimento ({comanda.items.length})
                  {activeSubTab === 'itens' && <motion.div layoutId="modalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button 
                  onClick={() => setActiveSubTab('logs')}
                  className={`pb-2.5 text-xs font-black uppercase tracking-wider relative transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeSubTab === 'logs' ? 'text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  Auditoria e Logs
                  {activeSubTab === 'logs' && <motion.div layoutId="modalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                  {comanda.logs && comanda.logs.length > 0 && (
                    <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-black">
                      {comanda.logs.length}
                    </span>
                  )}
                </button>
              </div>
            )}

            {activeSubTab === 'itens' || isPDVMode ? (
              <div className="space-y-4 animate-in fade-in duration-300">
                {/* Client & Barber Info - Compact Card Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <div 
                      onClick={() => !loading && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && setShowQuickClient(!showQuickClient)}
                      className={`bg-slate-50 border p-3 rounded-2xl flex justify-between items-center shadow-2xs transition-all ${
                        ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? 'cursor-pointer hover:border-accent/40' : 'cursor-default'
                      } ${showQuickClient ? 'border-accent ring-2 ring-accent/5' : 'border-slate-200/80'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-accent border border-slate-200/60 shadow-2xs">
                          <User size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] text-muted uppercase tracking-wider font-bold">Cliente</p>
                            {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && <ArrowRightLeft size={8} className="text-slate-400" />}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-primary">{comanda.cliente_name || 'Cliente Avulso'}</p>
                            {comanda.cliente_id && comanda.cliente_id !== 'avulso' && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickClientSelect({ id: 'avulso', name: 'Cliente Avulso' });
                                }}
                                className="px-1.5 py-0.2 text-[8px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-all uppercase"
                                title="Desvincular cliente"
                              >
                                Desvincular
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-muted uppercase tracking-wider font-bold">Saldo</p>
                        <p className={`text-xs font-black ${
                          (clients.find(c => c.uid === comanda.cliente_id)?.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          R$ {((clients.find(c => c.uid === comanda.cliente_id)?.balance || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <AnimatePresence>
                      {showQuickClient && (
                        <QuickClientSelector 
                          currentClientId={comanda.cliente_id} 
                          onClose={() => setShowQuickClient(false)}
                          onSelect={handleQuickClientSelect} 
                        />
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="relative">
                    <div 
                      onClick={() => !loading && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && setShowQuickProf(!showQuickProf)}
                      className={`bg-slate-50 border p-3 rounded-2xl flex items-center justify-between shadow-2xs transition-all ${
                        ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? 'cursor-pointer hover:border-accent/40' : 'cursor-default'
                      } ${showQuickProf ? 'border-accent ring-2 ring-accent/5' : 'border-slate-200/80'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-blue-600 border border-slate-200/60 shadow-2xs">
                          <Scissors size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] text-muted uppercase tracking-wider font-bold">Profissional Padrão</p>
                            {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && <ArrowRightLeft size={8} className="text-slate-400" />}
                          </div>
                          <p className="text-xs font-bold text-primary">{comanda.profissional_name}</p>
                        </div>
                      </div>
                    </div>
                    <AnimatePresence>
                      {showQuickProf && (
                        <QuickProfSelector 
                          currentProfId={comanda.profissional_id} 
                          onClose={() => setShowQuickProf(false)}
                          onSelect={handleQuickProfSelect} 
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {comanda?.cliente_id && comanda?.cliente_id !== 'avulso' && (() => {
                  const clientObj = clients.find(c => c.uid === comanda.cliente_id);
                  const totalEmAberto = clientObj?.total_em_aberto || 0;
                  if (totalEmAberto <= 0) return null;
                  return (
                    <div id="alert-debtor" className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in duration-300">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle size={18} className="text-rose-600 shrink-0" />
                        <div>
                          <p className="text-xs font-black text-rose-900 leading-none">
                            Fiado Ativo: <span className="underline">R$ {(totalEmAberto ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </p>
                        </div>
                      </div>
                      <button 
                        id="btn-pay-fiado-trigger"
                        type="button"
                        onClick={() => {
                          setSelectedDebtToPay(null);
                          setPayingDebtAmount(totalEmAberto.toString());
                          setPayingDebtMethod(paymentMethods[0]?.id || 'dinheiro');
                          setIsPayingDebt(true);
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        Pagar Fiado
                      </button>
                    </div>
                  );
                })()}

                {/* Quick Add Buttons Bar */}
                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={() => handleOpenItemSelector('service')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Serviço</span>
                    </button>
                    <button 
                      onClick={() => handleOpenItemSelector('product')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Produto</span>
                    </button>
                    <button 
                      onClick={() => handleOpenItemSelector('pacote')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Pacote</span>
                    </button>
                    <button 
                      onClick={() => {
                        setTempDiscountValue(comanda.discount ? comanda.discount.toString() : '');
                        setFinancialModal('discount');
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all shadow-2xs active:scale-95 cursor-pointer"
                    >
                      <Tag size={14} />
                      <span>Desconto</span>
                    </button>
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                      <ShoppingBag size={20} className="text-accent" />
                      Itens da Comanda
                    </h3>
                    {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleOpenItemSelector('service')}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-primary rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Serviço</span>
                        </button>
                        <button 
                          onClick={() => handleOpenItemSelector('product')}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 text-primary rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Produto</span>
                        </button>
                        <button 
                          onClick={() => handleOpenItemSelector('pacote')}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} />
                          <span>Pacote</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {comanda.cliente_id && (allAvailablePackages.some(p => p.remainingCuts > 0) || clientSubscriptions.some(s => s.status === 'active')) && (
                    <div className="py-2 px-3 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs shadow-2xs">
                      <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                        <Sparkles size={14} className="text-emerald-600 shrink-0" />
                        <span className="font-bold text-emerald-900 text-[11px] whitespace-nowrap">Benefícios Ativos:</span>
                        {allAvailablePackages.filter(p => p.remainingCuts > 0).map((pkg, pIdx) => (
                          <span key={`avail-pkg-${pkg.id || pIdx}-${pIdx}`} className="bg-white border border-emerald-200 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap">
                            {pkg.packageName}: {pkg.remainingCuts} rest.
                          </span>
                        ))}
                        {clientSubscriptions.filter(s => s.status === 'active').map((sub, sIdx) => (
                          <span key={`active-sub-${sub.id || sIdx}-${sIdx}`} className="bg-white border border-indigo-200 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-lg whitespace-nowrap">
                            Clube {sub.planName}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
                        <tr>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-muted uppercase tracking-wider">Item</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-muted uppercase tracking-wider">Qtd</th>
                          <th className="px-3 py-2.5 text-[10px] font-bold text-muted uppercase tracking-wider">Valor Unit.</th>
                          <th className="px-4 py-2.5 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Total</th>
                          <th className="px-3 py-2.5 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {comanda.items.map((item, index) => {
                          const isService = item.type === 'servico' || item.type === 'assinatura';
                          const hasPkg = allAvailablePackages.find(
                            p => p.remainingCuts > 0 && (p.serviceId === item.referencia_id || p.packageName.toLowerCase().includes(item.name.toLowerCase()))
                          );
                          const activeSub = clientSubscriptions.find(s => s.status === 'active');
                          const hasSub = activeSub && (() => {
                            if (activeSub.services && activeSub.services.length > 0) {
                              const planService = activeSub.services.find((ps: any) => ps.serviceId === item.referencia_id);
                              if (planService) {
                                if (planService.isUnlimited) return true;
                                const currentUsed = (activeSub.serviceUsages && activeSub.serviceUsages[item.referencia_id]) || 0;
                                return currentUsed < planService.limit;
                              }
                              return false;
                            }
                            
                            // Legacy fallback (haircuts and beards)
                            const isCut = item.name.toLowerCase().includes('corte') || item.name.toLowerCase().includes('cabelo') || item.name.toLowerCase().includes('hair');
                            const isBeard = item.name.toLowerCase().includes('barba') || item.name.toLowerCase().includes('beard');
                            if (isCut) return activeSub.haircutsUsed < (activeSub.haircutsPerMonth || 999);
                            if (isBeard) return activeSub.beardsUsed < (activeSub.beardsPerMonth || 999);
                            return false;
                          })();

                          return (
                            <tr key={`${item.id || 'item'}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-4">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm ${
                                    isService ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                  }`}>
                                    {isService ? <Scissors size={16} /> : <Package size={16} />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-sm font-bold text-primary block">{item.name}</span>
                                      {item.isCortesia && !item.deductType && (
                                        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded">Cortesia</span>
                                      )}
                                      {item.deductType === 'pacote' && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                          <Award size={10} fill="currentColor" />
                                          PACOTE
                                        </span>
                                      )}
                                      {item.deductType === 'assinatura' && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/80 shadow-2xs">
                                          <Sparkles size={11} className="text-emerald-600 fill-emerald-600" />
                                          <span>Coberto por Assinatura (R$ 0,00)</span>
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                      <div className="inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200/90 rounded-xl px-2 py-0.5 md:py-1 md:px-2.5 transition-all shadow-2xs">
                                        <Scissors size={11} className="text-emerald-600 shrink-0" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider hidden sm:inline">Atendido por:</span>
                                        {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && barbers.length > 0 ? (
                                          <select
                                            value={item.profissional_id || comanda.profissional_id || ''}
                                            onChange={(e) => handleItemBarberChange(item.id, e.target.value)}
                                            disabled={loading}
                                            title="Alterar barbeiro deste serviço"
                                            className="bg-white border border-slate-300 text-slate-900 text-[10px] md:text-xs font-bold rounded-lg py-0.5 px-1.5 max-w-[110px] md:max-w-[165px] truncate focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all cursor-pointer font-sans shadow-2xs"
                                          >
                                            {barbers.map((b, idx) => (
                                              <option key={`barber-opt-${b.uid || b.id || idx}-${idx}`} value={b.uid || b.id}>
                                                💈 {b.nome || b.displayName || b.name}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-[10px] md:text-xs font-extrabold text-slate-800 truncate max-w-[100px] md:max-w-[150px]">
                                            💈 {item.profissional_name || comanda.profissional_name || 'Profissional'}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action buttons to toggle deduction */}
                                    {isService && (allAvailablePackages.some(p => p.remainingCuts > 0) || hasSub) && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => toggleItemDeduction(item.id, 'none')}
                                          title="Desvincular assinatura / cobrar valor avulso"
                                          className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                            !item.deductType 
                                              ? 'bg-slate-800 text-white border-slate-800 shadow-sm' 
                                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                                          }`}
                                        >
                                          {item.deductType === 'assinatura' ? '🔓 Desvincular (Cobrar Avulso)' : 'Pagar R$'}
                                        </button>
                                        
                                        {allAvailablePackages.filter(p => p.remainingCuts > 0).map((pkg, pkgIdx) => {
                                          const isSelectedPkg = item.deductType === 'pacote' && item.packageSaleId === pkg.id;
                                          const pPrice = pkg.pricePerService !== undefined && pkg.pricePerService !== null 
                                            ? pkg.pricePerService 
                                            : (pkg.pricePaid / pkg.totalCuts);
                                          return (
                                            <button
                                              key={`assoc-pkg-${pkg.id || pkgIdx}-${pkgIdx}`}
                                              type="button"
                                              onClick={() => {
                                                if (isSelectedPkg) {
                                                  toggleItemDeduction(item.id, 'none');
                                                } else {
                                                  toggleItemDeduction(item.id, 'pacote', pkg.id);
                                                }
                                              }}
                                              className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1 ${
                                                isSelectedPkg
                                                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                                  : 'bg-amber-50 text-amber-700 border-amber-100/50 hover:bg-amber-100'
                                              }`}
                                            >
                                              <Award size={10} fill="currentColor" />
                                              <span>Associar Pacote ({pkg.packageName}) - {pkg.remainingCuts} rest. (R$ {pPrice.toFixed(2)})</span>
                                            </button>
                                          );
                                        })}

                                        {hasSub && item.deductType !== 'assinatura' && (
                                          <button
                                            type="button"
                                            onClick={() => toggleItemDeduction(item.id, 'assinatura')}
                                            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                          >
                                            <Sparkles size={10} fill="currentColor" />
                                            <span>Vincular ao Clube (R$ 0)</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-5 text-sm text-muted font-medium">{item.quantity}</td>
                              <td className="px-6 py-5 text-sm text-muted font-medium">
                                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? (
                                  <div className="flex items-center gap-1 justify-start">
                                    <span className="text-xs text-slate-400 font-bold">R$</span>
                                    <input
                                      type="text"
                                      defaultValue={item.unitPrice}
                                      onBlur={(e) => {
                                        const normalized = e.target.value.replace(',', '.');
                                        const val = parseFloat(normalized);
                                        if (!isNaN(val) && val >= 0) {
                                          if (val !== item.unitPrice) {
                                            updateItemPrice(item.id, val);
                                          }
                                        } else {
                                          e.target.value = item.unitPrice.toString();
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const normalized = (e.target as HTMLInputElement).value.replace(',', '.');
                                          const val = parseFloat(normalized);
                                          if (!isNaN(val) && val >= 0) {
                                            if (val !== item.unitPrice) {
                                              updateItemPrice(item.id, val);
                                            }
                                          } else {
                                            (e.target as HTMLInputElement).value = item.unitPrice.toString();
                                          }
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      className="w-20 bg-slate-50 border border-slate-100 hover:border-slate-200 focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/5 rounded-lg py-1 px-2 text-xs font-black text-primary transition-all text-right outline-none"
                                    />
                                  </div>
                                ) : (
                                  <span>R$ {(item.unitPrice ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                )}
                              </td>
                              <td className="px-6 py-5 text-sm font-bold text-primary text-right">R$ {(item.totalPrice ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-right">
                                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button 
                                      type="button"
                                      onClick={() => toggleCortesia(item.id)}
                                      title={item.isCortesia ? "Remover Cortesia" : "Marcar como Cortesia (gera comissão normal para o barbeiro)"}
                                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs ${
                                        item.isCortesia 
                                          ? 'bg-emerald-600 text-white font-black ring-1 ring-emerald-500' 
                                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200'
                                      }`}
                                    >
                                      <Gift size={13} className={item.isCortesia ? 'fill-current' : ''} />
                                      <span>Cortesia</span>
                                    </button>
                                    <button 
                                      type="button"
                                      onClick={() => removeItem(item.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                                      title="Remover Item"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {comanda.items.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-12 text-center">
                              <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                                  <Receipt size={24} />
                                </div>
                                <div>
                                  <p className="text-slate-800 font-bold text-sm">Nenhum item lançado na comanda</p>
                                  <p className="text-muted text-xs mt-0.5">Adicione um serviço ou produto para compor o atendimento.</p>
                                </div>
                                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                                  <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenItemSelector('service')}
                                      className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-sm active:scale-95 cursor-pointer"
                                    >
                                      <Scissors size={14} />
                                      Adicionar Serviço
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenItemSelector('product')}
                                      className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95 cursor-pointer"
                                    >
                                      <Package size={14} />
                                      Adicionar Produto
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenItemSelector('pacote')}
                                      className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold hover:bg-purple-100 transition-all shadow-sm active:scale-95 cursor-pointer"
                                    >
                                      <Award size={14} />
                                      Adicionar Pacote
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>

                {/* Payments List */}
                {comanda.payments.length > 0 && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                      <CreditCard size={20} className="text-emerald-500" />
                      Pagamentos Registrados
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {comanda.payments.map((p, index) => (
                        <div key={`pay-registered-${p.id || index}-${index}`} className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center justify-between shadow-sm group hover:bg-emerald-100/50 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                              <CreditCard size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-emerald-900 uppercase tracking-tight">{p.method}</p>
                              <p className="text-[10px] text-emerald-600/70 font-bold">{format(new Date(p.date), 'dd/MM/yyyy')}</p>
                            </div>
                          </div>
                          <p className="text-emerald-600 font-black text-lg">R$ {(p.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8 animate-in slide-in-from-left duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-primary">Log de Atividades</h3>
                  <span className="text-[10px] text-muted font-bold uppercase tracking-widest">Rastreio completo das alterações</span>
                </div>

                <div className="space-y-4">
                  {comanda.logs?.slice().reverse().map((log, index) => (
                    <div key={`cmd-log-${log.date || index}-${index}`} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 border border-slate-200 shadow-inner">
                            <User size={14} />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-primary">{log.userName}</p>
                            <p className="text-[9px] text-muted font-medium">{format(new Date(log.date), 'dd/MM/yyyy HH:mm:ss')}</p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          log.action.includes('Reaberta') ? 'bg-orange-50 text-orange-600 border-orange-100' :
                          log.action.includes('Pagamento') ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                          log.action.includes('criada') ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          'bg-slate-50 text-slate-500 border-slate-200'
                        }`}>
                          {log.action}
                        </span>
                      </div>
                      {log.details && (
                        <p className="text-xs text-muted leading-relaxed pl-11">
                          {log.details}
                        </p>
                      )}
                    </div>
                  ))}

                  {(!comanda.logs || comanda.logs.length === 0) && (
                    <div className="text-center py-20 bg-slate-50/50 border border-dashed border-slate-200 rounded-[2rem]">
                      <History className="mx-auto text-slate-200 mb-4" size={40} />
                      <p className="text-muted text-sm font-medium">Nenhum log registrado para esta comanda.</p>
                    </div>
                  )}
                </div>

                {comanda.reopenHistory && comanda.reopenHistory.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest pl-1">Detalhes de Reabertura</h4>
                    <div className="space-y-3">
                      {comanda.reopenHistory.map((log, index) => (
                        <div key={`reopen-hist-${log.date || index}-${index}`} className="bg-orange-50/30 border border-orange-100/30 rounded-2xl p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-orange-900">{log.userName}</p>
                            <span className="text-[10px] text-orange-600/70 font-bold">{format(new Date(log.date), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                          <p className="text-xs text-orange-800/80 leading-relaxed italic">
                            "{log.reason}"
                          </p>
                          <div className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Status anterior: {log.previousStatus}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Side: Summary & Actions */}
          <div className="space-y-4 lg:col-span-5">
            <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-primary tracking-tight">Resumo do Checkout</h3>
                {comanda.status === 'aberta' && (
                  <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">Ajustável</span>
                )}
              </div>
              
              <div className="space-y-2.5 text-xs font-bold">
                <div className="flex justify-between uppercase tracking-wider">
                  <span className="text-muted">Serviços</span>
                  <span className="text-primary font-black">R$ {(comanda.subtotalServices ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between uppercase tracking-wider">
                  <span className="text-muted">Produtos</span>
                  <span className="text-primary font-black">R$ {(comanda.subtotalProducts ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                
                {/* Financial Adjustments (+ Action Buttons) */}
                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                    <p className="text-[9px] font-black text-muted uppercase tracking-wider">Ajustes & Extras</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTempTipValue(comanda.tip ? comanda.tip.toString() : '');
                          setFinancialModal('tip');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all flex items-center gap-1 cursor-pointer ${
                          comanda.tip ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Sparkles size={11} className={comanda.tip ? 'text-emerald-600' : 'text-amber-500'} />
                        <span>{comanda.tip ? `Gorjeta: R$ ${comanda.tip.toFixed(2)}` : '+ Gorjeta'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTempDiscountValue(comanda.discount ? comanda.discount.toString() : '');
                          setFinancialModal('discount');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all flex items-center gap-1 cursor-pointer ${
                          comanda.discount ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-2xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Tag size={11} className={comanda.discount ? 'text-rose-600' : 'text-red-500'} />
                        <span>{comanda.discount ? `Desconto: R$ ${comanda.discount.toFixed(2)}` : '+ Desconto'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setVoucherTokenInput('');
                          setFinancialModal('voucher');
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Award size={11} className="text-indigo-600" />
                        <span>+ Voucher</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCouponInput('');
                          setFinancialModal('coupon');
                        }}
                        className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-black transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Tag size={11} className="text-amber-600" />
                        <span>+ Cupom</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200/80 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-black text-xs uppercase tracking-wider">Total Geral</span>
                    <span className="text-2xl font-black text-primary tracking-tight">R$ {(comanda.totalAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {selectedClientProfile && (
                    <div className="p-2.5 bg-slate-100/90 rounded-xl flex items-center justify-between border border-slate-200/80">
                      <div>
                        <p className="text-[9px] text-muted font-bold uppercase tracking-wider leading-none mb-0.5">Saldo Cliente</p>
                        <p className={`text-xs font-black ${(selectedClientProfile.balance || 0) < 0 ? 'text-red-600' : (selectedClientProfile.balance || 0) > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {(selectedClientProfile.balance || 0) < 0 ? 'DÉBITO' : (selectedClientProfile.balance || 0) > 0 ? 'CRÉDITO' : 'SEM PENDÊNCIA'}
                        </p>
                      </div>
                      <span className={`text-sm font-black ${(selectedClientProfile.balance || 0) < 0 ? 'text-red-700' : (selectedClientProfile.balance || 0) > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                        R$ {Math.abs(selectedClientProfile.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  {clientDebts.length > 0 && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-amber-800 font-bold text-[11px]">
                        <AlertCircle size={13} />
                        <span>Contas pendentes anteriores</span>
                      </div>
                      <p className="text-amber-700 text-[11px] leading-tight">
                        Cliente tem R$ {clientDebts.reduce((acc, d) => acc + (d.amount || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em aberto.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payments and Split Registry */}
              <div className="pt-3 border-t border-slate-200/80 space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-muted">Total Pago</span>
                  <span className="text-emerald-600 font-extrabold">R$ {(comanda.paidAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-muted">Pendente</span>
                  <span className="text-amber-600 font-extrabold">R$ {(comanda.pendingAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                {comanda.payments.length > 0 && (
                  <div className="bg-slate-100 rounded-2xl p-4 space-y-2 border border-slate-200 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Pagamentos Lançados</p>
                      {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleResetPayments}
                          className="text-[9px] font-black text-red-600 hover:text-red-700 hover:underline uppercase tracking-wider flex items-center gap-1"
                        >
                          <RefreshCcw size={10} />
                          Zerar Lançamentos
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                      {comanda.payments.map((p, index) => (
                        <div key={`p-list-${index}`} className="flex justify-between items-center text-xs font-medium text-slate-700 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/50">
                          <span className="capitalize">{p.method === 'cartao' ? 'Cartão' : p.method}</span>
                          <span className="font-bold text-primary">R$ {(p.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Unified Payment & Checkout Card */}
              {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                <div className="pt-6 border-t border-slate-200 space-y-4">
                  {comanda.pendingAmount > 0 ? (
                    <>
                      {/* Resgate de Fidelidade / Cashback se disponível */}
                      {clientLoyalty && clientLoyalty.cashback > 0 && (
                        (() => {
                          const minVal = loyaltyConfig?.minRedemptionValue || 0;
                          const hasMin = minVal <= 0 || clientLoyalty.cashback >= minVal;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (!hasMin) {
                                  toast.error(`Mínimo para resgate: R$ ${minVal.toFixed(2)}. Saldo atual: R$ ${clientLoyalty.cashback.toFixed(2)}`);
                                  return;
                                }
                                const valToUse = Math.min(Number(paymentInputAmount) || comanda.pendingAmount, clientLoyalty.cashback);
                                handleAddPayment('resgate', valToUse);
                              }}
                              disabled={loading || comanda.pendingAmount <= 0}
                              className={`w-full p-4 border rounded-2xl flex items-center justify-between transition-all shadow-sm active:scale-95 text-left ${
                                hasMin 
                                  ? 'bg-amber-50 border-amber-200 hover:bg-amber-100/60' 
                                  : 'bg-slate-50 border-slate-200 opacity-75'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm border ${
                                  hasMin ? 'text-amber-600 border-amber-100' : 'text-slate-400 border-slate-200'
                                }`}>
                                  <Zap size={16} fill="currentColor" />
                                </div>
                                <div>
                                  <p className={`text-[9px] font-black uppercase tracking-widest leading-none mb-1 ${
                                    hasMin ? 'text-amber-700' : 'text-slate-500'
                                  }`}>
                                    Usar Saldo / Cashback
                                  </p>
                                  <p className={`text-xs font-bold ${hasMin ? 'text-amber-900' : 'text-slate-700'}`}>
                                    R$ {(clientLoyalty?.cashback ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} disponíveis
                                  </p>
                                  {!hasMin && (
                                    <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                                      Mínimo para resgate: R$ {minVal.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                                hasMin ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                              }`}>
                                {hasMin ? 'Resgatar' : `Mín. R$ ${minVal}`}
                              </span>
                            </button>
                          );
                        })()
                      )}

                      {/* Card Unificado de Pagamento */}
                      <div className="bg-slate-50/80 border border-slate-200/90 p-5 rounded-3xl space-y-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <CreditCard size={16} className="text-emerald-600" />
                            <span>Forma de Pagamento</span>
                          </span>

                          {/* Seletor de Modo: Único vs Dividir em 2 */}
                          <div className="inline-flex bg-slate-200/70 p-1 rounded-xl text-[11px] font-bold">
                            <button
                              type="button"
                              onClick={() => {
                                if (showSecondPayment) {
                                  setShowSecondPayment(false);
                                  setSecondPaymentMethodId('');
                                  setSecondPaymentInputAmount('');
                                  setPaymentInputAmount(comanda.pendingAmount.toFixed(2));
                                }
                              }}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                !showSecondPayment 
                                  ? 'bg-white text-slate-900 shadow-xs font-black' 
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ⚡ Pagamento Único
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!showSecondPayment) {
                                  setShowSecondPayment(true);
                                  const total = comanda.pendingAmount;
                                  const half = Math.round((total / 2) * 100) / 100;
                                  const rem = Math.round((total - half) * 100) / 100;
                                  setPaymentInputAmount(half.toFixed(2));
                                  setSecondPaymentInputAmount(rem.toFixed(2));
                                  const validMethods = paymentMethods.filter(m => m.type !== 'fiado' && !m.goesToClientAccount);
                                  if (!selectedPaymentMethodId && validMethods[0]) {
                                    setSelectedPaymentMethodId(validMethods[0].id);
                                  }
                                  if (validMethods.length > 1) {
                                    setSecondPaymentMethodId(validMethods[1].id);
                                  } else if (validMethods[0]) {
                                    setSecondPaymentMethodId(validMethods[0].id);
                                  }
                                }
                              }}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                showSecondPayment 
                                  ? 'bg-white text-emerald-700 shadow-xs font-black' 
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ✂️ Dividir em 2 Formas
                            </button>
                          </div>
                        </div>

                        {!showSecondPayment ? (
                          /* MODO PAGAMENTO ÚNICO */
                          <div className="space-y-4">
                            {/* Seletor Dropdown de Forma de Pagamento */}
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                Forma de Pagamento
                              </label>
                              <div className="relative">
                                <select
                                  id="single-payment-method-select"
                                  value={selectedPaymentMethodId || ''}
                                  onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 px-4 pr-10 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs cursor-pointer appearance-none"
                                >
                                  <option value="">Selecione uma forma de pagamento...</option>
                                  {paymentMethods
                                    .filter(m => m.type !== 'fiado' && !m.goesToClientAccount)
                                    .map((m, mIdx) => (
                                      <option key={`single-pay-opt-${m.id || mIdx}-${mIdx}`} value={m.id}>
                                        {m.type === 'pix' ? '📱 ' : m.type === 'dinheiro' ? '💵 ' : '💳 '} {m.name}
                                      </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-slate-500">
                                  <ChevronDown size={14} />
                                </div>
                              </div>
                            </div>

                            {/* Campo Único de Valor a Pagar */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                  Valor a Pagar (R$)
                                </label>
                                {comanda.pendingAmount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setPaymentInputAmount(comanda.pendingAmount.toFixed(2))}
                                    className="text-[10px] text-emerald-700 hover:text-emerald-800 font-bold underline cursor-pointer"
                                  >
                                    Restante Total (R$ {comanda.pendingAmount.toFixed(2)})
                                  </button>
                                )}
                              </div>
                              <div className="relative">
                                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={paymentInputAmount}
                                  onChange={(e) => setPaymentInputAmount(e.target.value)}
                                  placeholder={comanda.pendingAmount.toFixed(2)}
                                  className="w-full bg-white border border-slate-200 rounded-2xl py-3.5 pl-9 pr-3.5 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* MODO DIVIDIR EM 2 FORMAS */
                          <div className="bg-emerald-50/60 border border-emerald-200/90 p-4 rounded-2xl space-y-3.5 animate-fade-in">
                            <span className="text-xs font-black text-emerald-800 uppercase tracking-wider block">
                              Configurar as 2 Formas de Pagamento
                            </span>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {/* 1ª Forma */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">1ª Forma de Pagamento</label>
                                <select
                                  value={selectedPaymentMethodId}
                                  onChange={(e) => setSelectedPaymentMethodId(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs cursor-pointer"
                                >
                                  <option value="">Selecione a 1ª Forma</option>
                                  {paymentMethods.filter(m => m.type !== 'fiado' && !m.goesToClientAccount).map((m, idx) => (
                                    <option key={`m1_${m.id || idx}_${idx}`} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="relative">
                                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={paymentInputAmount}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setPaymentInputAmount(val);
                                      const num1 = Number(val) || 0;
                                      const rest = Math.max(0, Math.round((comanda.pendingAmount - num1) * 100) / 100);
                                      setSecondPaymentInputAmount(rest > 0 ? rest.toFixed(2) : '');
                                    }}
                                    placeholder="Valor 1"
                                    className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                                  />
                                </div>
                              </div>

                              {/* 2ª Forma */}
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">2ª Forma de Pagamento</label>
                                <select
                                  value={secondPaymentMethodId}
                                  onChange={(e) => setSecondPaymentMethodId(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs cursor-pointer"
                                >
                                  <option value="">Selecione a 2ª Forma</option>
                                  {paymentMethods.filter(m => m.type !== 'fiado' && !m.goesToClientAccount).map((m, idx) => (
                                    <option key={`m2_${m.id || idx}_${idx}`} value={m.id}>
                                      {m.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="relative">
                                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    value={secondPaymentInputAmount}
                                    onChange={(e) => setSecondPaymentInputAmount(e.target.value)}
                                    placeholder="Valor 2"
                                    className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-xs"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs font-bold pt-1 px-1">
                              <span className="text-slate-500 text-[11px]">Soma das 2 Formas:</span>
                              <span className={(Number(paymentInputAmount || 0) + Number(secondPaymentInputAmount || 0)) === comanda.pendingAmount ? 'text-emerald-700 font-black' : 'text-amber-600 font-black'}>
                                R$ {(Number(paymentInputAmount || 0) + Number(secondPaymentInputAmount || 0)).toFixed(2)} / R$ {comanda.pendingAmount.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Detecção de Excedente / Troco */}
                        {Number(paymentInputAmount) > comanda.pendingAmount && comanda.pendingAmount > 0 && (
                          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 animate-fade-in">
                            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                              <span className="flex items-center gap-1.5">
                                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                                <span>Valor pago maior que a Comanda. Excedente: <strong>R$ {(Number(paymentInputAmount) - comanda.pendingAmount).toFixed(2)}</strong></span>
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-amber-800 uppercase tracking-widest">O que fazer com os R$ {(Number(paymentInputAmount) - comanda.pendingAmount).toFixed(2)} excedentes?</label>
                              {(() => {
                                const totalPendingDebts = clientDebts.reduce((sum, d) => sum + (d.remainingAmount || 0), 0);
                                return (
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {totalPendingDebts > 0 && comanda.cliente_id && comanda.cliente_id !== 'avulso' && (
                                      <button
                                        type="button"
                                        onClick={() => setExcessMode('abater_fiado')}
                                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                                          excessMode === 'abater_fiado'
                                            ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                            : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/50'
                                        }`}
                                      >
                                        Abater do Fiado (Dívida: R$ {totalPendingDebts.toFixed(2)})
                                      </button>
                                    )}

                                    {comanda.cliente_id && comanda.cliente_id !== 'avulso' && (
                                      <button
                                        type="button"
                                        onClick={() => setExcessMode('credito_haver')}
                                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                                          excessMode === 'credito_haver'
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                                        }`}
                                      >
                                        Deixar Crédito em Haver
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => setExcessMode('troco')}
                                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                                        excessMode === 'troco'
                                          ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      Devolver Troco em Dinheiro
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        {/* Checkbox de entrada no Caixa do Dia */}
                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 select-none">
                            <input
                              type="checkbox"
                              checked={entersCashChoice}
                              onChange={(e) => setEntersCashChoice(e.target.checked)}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                            />
                            <span>Registrar entrada no Caixa do Dia?</span>
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl space-y-4 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-emerald-800 uppercase tracking-wider">Conta Paga!</p>
                          <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">Relatórios e dados sincronizados</p>
                        </div>
                      </div>

                      {/* Real-time Feedback Checklist */}
                      <div className="space-y-2 border-t border-emerald-100 pt-3 text-[10px] font-bold text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Comissão Profissional gerada</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Entrada lançada no Caixa de hoje</span>
                        </div>
                        {comanda.cliente_id !== 'avulso' && (
                          <div className="flex items-center gap-2">
                            <span className="text-emerald-500">✓</span>
                            <span>Fidelidade & Cashback creditados</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Controle de estoque deduzido</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-500">✓</span>
                          <span>Agendamento marcado como Concluído</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Main Actions Bar */}
              <div className="space-y-3 pt-6 border-t border-slate-200">
                {comanda.pendingAmount > 0 && (!comanda.cliente_id || comanda.cliente_id === 'avulso') && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5">
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Saldo pendente: R$ {comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">Para lançar o saldo restante como Fiado na conta do cliente, vincule um cliente cadastrado acima.</p>
                    </div>
                  </div>
                )}

                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? (
                  <>
                    <button 
                      id="btn-main-finalize-comanda"
                      onClick={handleQuickPayAndClose}
                      disabled={loading}
                      className={`w-full py-4 text-white rounded-2xl font-black text-sm sm:text-base shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all cursor-pointer ${
                        (() => {
                          const isZeroPayment = paymentInputAmount !== '' && !isNaN(Number(paymentInputAmount)) && Number(paymentInputAmount) === 0;
                          const mObj = paymentMethods.find(m => m.id === selectedPaymentMethodId);
                          const isFiado = isZeroPayment || mObj?.type === 'fiado' || mObj?.goesToClientAccount;

                          if (comanda.pendingAmount === 0) {
                            return 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20';
                          }
                          if (isFiado) {
                            return 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20';
                          }
                          return 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20';
                        })()
                      }`}
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                    <span>
                      {(() => {
                        if (comanda.pendingAmount === 0) {
                          return 'Finalizar Conta (Já Paga)';
                        }
                        const isZeroPayment = paymentInputAmount !== '' && !isNaN(Number(paymentInputAmount)) && Number(paymentInputAmount) === 0;
                        const mObj = paymentMethods.find(m => m.id === selectedPaymentMethodId);
                        
                        if (isZeroPayment || mObj?.type === 'fiado' || mObj?.goesToClientAccount) {
                          return `Lançar no FIADO (R$ ${comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) e Finalizar`;
                        }
                        if (showSecondPayment) {
                          return `Receber as 2 Formas (R$ ${comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) e Finalizar`;
                        }
                        if (!mObj) {
                          return 'Finalizar Conta';
                        }
                        const amt = Number(paymentInputAmount) > 0 ? Number(paymentInputAmount) : comanda.pendingAmount;
                        if (amt < comanda.pendingAmount) {
                          return `Lançar Pagamento Parcial (R$ ${amt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`;
                        }
                        return `Receber R$ ${amt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no ${mObj.name} e Finalizar`;
                      })()}
                    </span>
                  </button>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button 
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      disabled={loading}
                      className="py-2.5 bg-white border border-rose-100 text-rose-600 rounded-xl font-bold text-[10px] hover:bg-rose-50 transition-all flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Cancelar comanda e manter histórico cancelado"
                    >
                      {loading ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}
                      <span>Cancelar</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setConfirmDeleteAppointment(true)}
                      disabled={loading}
                      className="py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-[10px] hover:bg-red-50 hover:border-red-300 transition-all flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Excluir agendamento do banco e desocupar horário na agenda"
                    >
                      {loading ? <Loader2 className="animate-spin" size={14} /> : <CalendarX size={14} />}
                      <span>Excluir Agenda</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setConfirmAusente(true)}
                      disabled={loading}
                      className="py-2.5 bg-white border border-amber-100 text-amber-600 rounded-xl font-bold text-[10px] hover:bg-amber-50 transition-all flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                      title="Marcar cliente como faltou"
                    >
                      {loading ? <Loader2 className="animate-spin" size={14} /> : <AlertCircle size={14} />}
                      <span>Ausente</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowObservationsModal(true)}
                      className="py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-[10px] transition-all flex flex-col items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer relative"
                      title="Ver/Adicionar observações internas"
                    >
                      <FileText size={14} className="text-slate-500" />
                      <span>Observações</span>
                      {formData.observations?.trim() && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
                      )}
                    </button>
                  </div>
                </>
              ) : (
                (isAdmin || isGerente) && (
                  <div className="pt-2">
                    <button 
                      onClick={() => setShowReopenModal(true)}
                      disabled={loading}
                      className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/10 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCcw size={20} />}
                      <span>Reabrir Comanda</span>
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      )}
      </div>
    </motion.div>

      {/* Item Selector Modal */}
      <AnimatePresence>
        {showItemSelector && (
          <div 
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
            onClick={() => setShowItemSelector(null)}
          >
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface border border-border w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border ${
                    showItemSelector === 'service' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : showItemSelector === 'product' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100'
                  }`}>
                    {showItemSelector === 'service' ? <Scissors size={20} /> : showItemSelector === 'product' ? <Package size={20} /> : <Award size={20} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-primary">
                      {showItemSelector === 'service' ? 'Adicionar Serviço' : showItemSelector === 'product' ? 'Adicionar Produto' : 'Adicionar Pacote'}
                    </h3>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
                      {showItemSelector === 'service' ? `${services.length} serviços disponíveis` : showItemSelector === 'product' ? `${products.length} produtos disponíveis` : `${packageConfigs.length} modelos de pacote`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setShowItemSelector('service')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        showItemSelector === 'service' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Serviço
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowItemSelector('product')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        showItemSelector === 'product' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Produto
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowItemSelector('pacote')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        showItemSelector === 'pacote' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pacote
                    </button>
                  </div>
                  <button onClick={() => setShowItemSelector(null)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100 shadow-sm cursor-pointer">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Search Bar & Category Filter */}
              <div className="p-4 border-b border-border bg-slate-50/50 shrink-0 space-y-3">
                {/* Professional Selector for Multi-Professional Comandas */}
                {showItemSelector === 'service' && barbers.length > 0 && (
                  <div className="bg-emerald-50/80 border border-emerald-200/80 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                    <label className="text-xs font-black text-emerald-950 flex items-center gap-2">
                      <Scissors size={14} className="text-emerald-600" />
                      <span>Profissional para este serviço:</span>
                    </label>
                    <select
                      value={selectedBarberForService || comanda?.profissional_id || ''}
                      onChange={(e) => setSelectedBarberForService(e.target.value)}
                      className="bg-white border border-emerald-300 rounded-xl px-3 py-1.5 text-xs text-primary font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                    >
                      {barbers.map((b, idx) => (
                        <option key={`barber-srv-opt-${b.uid || b.id || idx}-${idx}`} value={b.uid || b.id}>
                          {(b.nome || b.displayName || b.name)} {(b.uid === comanda?.profissional_id || b.id === comanda?.profissional_id) ? '(Principal da Comanda)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="text"
                    value={itemSearchQuery}
                    onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder={showItemSelector === 'service' ? 'Buscar serviço por nome ou categoria...' : showItemSelector === 'product' ? 'Buscar produto por nome...' : 'Buscar pacote por nome ou serviço...'}
                    className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-primary font-medium focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary transition-all"
                  />
                  {itemSearchQuery && (
                    <button
                      onClick={() => setItemSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Category Chips for Services */}
                {showItemSelector === 'service' && serviceCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setSelectedServiceCategory('todas')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedServiceCategory === 'todas'
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      Todos ({services.length})
                    </button>
                    {serviceCategories.map(cat => {
                      const count = services.filter(s => ((s as any).categoria || (s as any).category || '').trim().toLowerCase() === cat.toLowerCase()).length;
                      return (
                        <button
                          key={`cat-pill-${cat}`}
                          type="button"
                          onClick={() => setSelectedServiceCategory(cat)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            selectedServiceCategory.toLowerCase() === cat.toLowerCase()
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {cat} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1">
                {showItemSelector === 'service' ? (
                  (() => {
                    const filtered = services.filter(s => {
                      if (selectedServiceCategory !== 'todas') {
                        const cat = ((s as any).categoria || (s as any).category || '').trim().toLowerCase();
                        if (cat !== selectedServiceCategory.toLowerCase()) return false;
                      }
                      if (!itemSearchQuery.trim()) return true;
                      const q = itemSearchQuery.toLowerCase().trim();
                      const name = ((s as any).nome || s.name || '').toLowerCase();
                      const cat = ((s as any).categoria || (s as any).category || '').toLowerCase();
                      return name.includes(q) || cat.includes(q);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-400 space-y-2">
                          <Scissors size={32} className="mx-auto text-slate-300" />
                          <p className="text-xs font-bold">Nenhum serviço encontrado</p>
                          <p className="text-[11px]">Verifique os filtros de busca ou selecione outra categoria.</p>
                        </div>
                      );
                    }

                    const renderServiceCard = (s: any, index: number) => {
                      const serviceName = s.nome || s.name || 'Serviço';
                      const serviceDuration = s.duracao_minutos || s.duration || 30;
                      const servicePrice = s.preco ?? s.price ?? 0;
                      const serviceCat = s.categoria || s.category;

                      return (
                        <div 
                          key={`${s.id || 'service'}-${index}`}
                          onClick={() => addItem(s, 'servico')}
                          className="w-full p-4 sm:p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-accent/30 hover:bg-slate-50/50 transition-all group shadow-sm cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent transition-colors border border-slate-100 shrink-0">
                              <Scissors size={18} />
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-primary group-hover:text-accent transition-colors text-sm">{serviceName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted font-bold uppercase tracking-widest">{serviceDuration} min</span>
                                {serviceCat && (
                                  <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md">
                                    {serviceCat}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                addItem(s, 'servico', true);
                              }}
                              className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                              title="Marcar como cortesia nesta comanda"
                            >
                              CORTESIA
                            </button>
                            <p className="font-black text-primary min-w-[80px] text-right text-sm">
                              R$ {servicePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      );
                    };

                    // Group by category when 'todas' is selected and no query is typed
                    if (selectedServiceCategory === 'todas' && !itemSearchQuery.trim()) {
                      const grouped: { [key: string]: typeof filtered } = {};
                      filtered.forEach(s => {
                        const cat = ((s as any).categoria || (s as any).category || 'Geral').trim() || 'Geral';
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(s);
                      });

                      return (
                        <div className="space-y-6">
                          {Object.entries(grouped).map(([catName, catItems]) => (
                            <div key={`group-sec-${catName}`} className="space-y-2">
                              <div className="flex items-center justify-between px-1 border-b border-slate-100 pb-1.5">
                                <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                  <span>📁</span> {catName}
                                </span>
                                <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                                  {catItems.length} {catItems.length === 1 ? 'serviço' : 'serviços'}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {catItems.map((s, index) => renderServiceCard(s, index))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }

                    return filtered.map((s, index) => renderServiceCard(s, index));
                  })()
                ) : showItemSelector === 'product' ? (
                  (() => {
                    const filtered = products.filter(p => {
                      if (!itemSearchQuery.trim()) return true;
                      const q = itemSearchQuery.toLowerCase().trim();
                      const name = ((p as any).name || (p as any).nome || '').toLowerCase();
                      return name.includes(q);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-400 space-y-2">
                          <Package size={32} className="mx-auto text-slate-300" />
                          <p className="text-xs font-bold">Nenhum produto encontrado</p>
                          <p className="text-[11px]">Verifique se há produtos cadastrados no estoque.</p>
                        </div>
                      );
                    }

                    return filtered.map((p, index) => {
                      const prodName = (p as any).name || (p as any).nome || 'Produto';
                      const prodStock = p.currentStock ?? (p as any).estoque ?? 0;
                      const prodPrice = p.salePrice ?? (p as any).preco ?? 0;

                      return (
                        <div 
                          key={`${p.id || 'product'}-${index}`}
                          onClick={() => addItem(p, 'product')}
                          className="w-full p-4 sm:p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-accent/30 hover:bg-slate-50/50 transition-all group shadow-sm cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent transition-colors border border-slate-100 shrink-0">
                              <Package size={18} />
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-primary group-hover:text-accent transition-colors text-sm">{prodName}</p>
                              <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">Estoque: {prodStock}</p>
                            </div>
                          </div>
                          <p className="font-black text-primary text-sm shrink-0">
                            R$ {prodPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      );
                    });
                  })()
                ) : (
                  (() => {
                    const filtered = packageConfigs.filter(p => {
                      if (!itemSearchQuery.trim()) return true;
                      const q = itemSearchQuery.toLowerCase().trim();
                      const name = (p.name || '').toLowerCase();
                      const sName = (p.serviceName || '').toLowerCase();
                      return name.includes(q) || sName.includes(q);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="py-12 text-center text-slate-400 space-y-2">
                          <Award size={32} className="mx-auto text-slate-300" />
                          <p className="text-xs font-bold">Nenhum pacote encontrado</p>
                          <p className="text-[11px]">Verifique se há pacotes ativos catalogados na aba de Pacotes.</p>
                        </div>
                      );
                    }

                    return filtered.map((pkg, index) => {
                      const price = pkg.promotionalPrice !== undefined && pkg.promotionalPrice !== null ? pkg.promotionalPrice : (pkg.originalPrice || 0);
                      return (
                        <div 
                          key={`modal-pkg-opt-${pkg.id || index}-${index}`}
                          onClick={() => addPackageItem(pkg)}
                          className="w-full p-4 sm:p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-purple-300 hover:bg-purple-50/30 transition-all group shadow-sm cursor-pointer"
                        >
                          <div className="flex items-center gap-3.5">
                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform border border-purple-100 shrink-0">
                              <Award size={18} />
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-primary group-hover:text-purple-700 transition-colors text-sm">{pkg.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-widest">{pkg.cutsCount} utilizações</span>
                                {pkg.serviceName && (
                                  <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 font-bold px-2 py-0.5 rounded-md">
                                    🛠️ {pkg.serviceName}
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-400 font-semibold">
                                  {pkg.noExpiration ? 'Sem expiração' : `${pkg.expiresDays} dias`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div>
                              {pkg.originalPrice > price && (
                                <p className="text-[9px] text-slate-400 line-through font-bold text-right">R$ {pkg.originalPrice.toFixed(2)}</p>
                              )}
                              <p className="font-black text-purple-700 text-sm text-right">
                                R$ {price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Reopen Modal */}
        <AnimatePresence>
          {showReopenModal && (
            <div 
              className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
              onClick={() => setShowReopenModal(false)}
            >
              <motion.div 
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl my-auto"
              >
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-orange-50/30">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                      <RefreshCcw size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-primary">Reabrir Comanda</h3>
                      <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-none mt-1">Esta ação reverterá todos os lançamentos financeiros</p>
                    </div>
                  </div>
                  <button onClick={() => setShowReopenModal(false)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100 shadow-sm">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-8 space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Motivo da Reabertura</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'erro_lancamento', label: 'Erro de Lançamento' },
                        { id: 'ajuste_pagamento', label: 'Ajuste de Pagamento' },
                        { id: 'cortesia', label: 'Cortesia' },
                        { id: 'outro', label: 'Outro' },
                      ].map((type, tIdx) => (
                        <button
                          key={`reopen-type-${type.id || tIdx}-${tIdx}`}
                          onClick={() => setReopenReasonType(type.id as any)}
                          className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border-2 ${
                            reopenReasonType === type.id 
                              ? 'bg-orange-50 border-orange-500 text-orange-700' 
                              : 'bg-white border-slate-100 text-muted hover:border-slate-200'
                          }`}
                        >
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Descrição do Motivo</label>
                    <textarea 
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all text-primary min-h-[120px] resize-none shadow-inner"
                      placeholder="Descreva detalhadamente o porquê desta reabertura..."
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setShowReopenModal(false)}
                      className="flex-1 py-4 bg-slate-100 text-primary rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleReopenComanda}
                      disabled={loading || !reopenReason}
                      className="flex-[2] py-4 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : (
                        <>
                          <RefreshCcw size={20} />
                          <span>Confirmar Reabertura</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={handleCloseComanda}
        title="Finalizar Comanda"
        description={
          (comanda.pendingAmount ?? 0) > 0
            ? `Atenção: Há um saldo pendente de R$ ${(comanda.pendingAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Ao finalizar, este valor será lançado automaticamente como FIADO na conta do cliente ${comanda.cliente_name}. O profissional receberá a comissão integral e a barbearia receberá posteriormente.`
            : "Deseja finalizar esta comanda manualmente? Isso a marcará como concluída no sistema financeiro."
        }
        confirmLabel="Finalizar"
      />

      <ConfirmationModal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancelComanda}
        title="Cancelar Comanda"
        description="Deseja cancelar esta comanda? Ela ficará registrada como cancelada e o agendamento associado será cancelado."
        variant="danger"
        confirmLabel="Cancelar Comanda"
      />

      <ConfirmationModal
        isOpen={confirmDeleteAppointment}
        onClose={() => setConfirmDeleteAppointment(false)}
        onConfirm={handleDeleteAppointmentFromAgenda}
        title="Excluir Agendamento da Agenda"
        description="Tem certeza que deseja excluir este agendamento da grade? O agendamento será removido completamente do banco de dados para despoluir a agenda e o horário voltará a ficar 100% livre para novos agendamentos."
        variant="danger"
        confirmLabel="Excluir da Agenda"
      />

      <ConfirmationModal
        isOpen={confirmAusente}
        onClose={() => setConfirmAusente(false)}
        onConfirm={handleAusenteComanda}
        title="Cliente Ausente"
        description="Deseja marcar este cliente como ausente (Faltou)? Isso irá cancelar a comanda e marcar o agendamento como 'Faltou'."
        variant="danger"
        confirmLabel="Confirmar"
      />

      <ConfirmationModal
        isOpen={!!confirmFiado}
        onClose={() => setConfirmFiado(null)}
        onConfirm={() => {
          if (confirmFiado) {
            handleAddPayment(confirmFiado.method as any, confirmFiado.amount, confirmFiado.methodId);
          }
        }}
        title="Confirmar Fiado"
        description={`Deseja lançar R$ ${(confirmFiado?.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} como FIADO na conta do cliente?`}
        confirmLabel="Confirmar"
      />

      <AnimatePresence>
        {confirmExcessPayment && (
          <div key="excess-payment-modal-overlay" className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <motion.div
              key="excess-payment-modal-content"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="flex items-center gap-3 text-amber-600 mb-4">
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                  <AlertCircle size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Pagamento com Excesso</h3>
                  <p className="text-xs text-slate-500 font-medium">O valor informado é maior que o saldo da comanda</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-5 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Valor da comanda:</span>
                  <span className="font-bold text-slate-800">R$ {(comanda.pendingAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor informado:</span>
                  <span className="font-bold text-slate-800">R$ {confirmExcessPayment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-emerald-600 pt-2 border-t border-slate-200/60 font-bold">
                  <span>Excesso:</span>
                  <span>R$ {confirmExcessPayment.excess.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {confirmExcessPayment.pendingDebts > 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
                  <p className="text-xs font-bold text-amber-900 mb-1">
                    Este cliente possui R$ {confirmExcessPayment.pendingDebts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em fiado pendente!
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Deseja usar o valor excedente (R$ {confirmExcessPayment.excess.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) para abater no fiado do cliente?
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600 mb-6">
                  O cliente não possui fiados pendentes. Como deseja registrar o excesso de R$ {confirmExcessPayment.excess.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {confirmExcessPayment.pendingDebts > 0 && (
                  <button
                    onClick={() => {
                      const data = confirmExcessPayment;
                      setConfirmExcessPayment(null);
                      handleAddPayment(data.method, data.amount, data.metodo_pagamento_id, { excessMode: 'abater_fiado' });
                    }}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-2xl text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <DollarSign size={18} />
                    Abater do Fiado (Recomendado)
                  </button>
                )}

                <button
                  onClick={() => {
                    const data = confirmExcessPayment;
                    setConfirmExcessPayment(null);
                    handleAddPayment(data.method, data.amount, data.metodo_pagamento_id, { excessMode: 'troco' });
                  }}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-sm transition-colors"
                >
                  Devolver Troco ao Cliente
                </button>

                <button
                  onClick={() => {
                    const data = confirmExcessPayment;
                    setConfirmExcessPayment(null);
                    handleAddPayment(data.method, data.amount, data.metodo_pagamento_id, { excessMode: 'credito_haver' });
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors"
                >
                  Lançar como Crédito em Haver
                </button>

                <button
                  onClick={() => setConfirmExcessPayment(null)}
                  className="w-full py-2 text-slate-400 hover:text-slate-600 font-medium text-xs text-center"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFiadoConfirmationModal && (
          <div 
            id="modal-fiado-confirm" 
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300"
            onClick={() => setShowFiadoConfirmationModal(false)}
          >
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col my-auto"
            >
              <div className="p-6 sm:p-8 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg bg-amber-600 shadow-amber-600/20 shrink-0">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      Saldo Devedor Identificado
                    </h3>
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-1">
                      Comanda #{comanda.number} {comanda.cliente_name ? `• ${comanda.cliente_name}` : ''}
                    </p>
                  </div>
                </div>
                <button 
                  id="close-fiado-modal-btn"
                  onClick={() => setShowFiadoConfirmationModal(false)} 
                  className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100 shadow-sm cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 sm:p-8 space-y-6">
                <div className="text-sm text-slate-600 leading-relaxed">
                  Identificamos que ficou um débito pendente de <strong className="text-amber-700 text-base font-black">R$ {(comanda.pendingAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> para o cliente <strong className="text-slate-900">{comanda.cliente_name || 'Não Identificado'}</strong>.
                </div>

                {(!comanda.cliente_id || comanda.cliente_id === 'avulso') ? (
                  <div className="p-4 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-900 text-xs flex items-start gap-2.5">
                    <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Cliente Avulso Detectado</p>
                      <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                        Não é possível lançar débito na conta de um "Cliente Avulso". Você pode clicar em <strong>"Não Lançar"</strong> para finalizar sem salvar a diferença, ou fechar este aviso para vincular um cliente cadastrado à comanda.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    <p className="text-xs font-bold text-slate-700">Deseja lançar este débito para o cliente acertar depois (Fiado)?</p>

                    <div className="space-y-2.5 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Data Prometida para Pagamento</label>
                        <input 
                          id="fiado-due-date-input"
                          type="date"
                          value={fiadoDueDate}
                          onChange={(e) => setFiadoDueDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 transition-all text-slate-800 font-bold shadow-sm"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/50">
                        <div className="flex items-center gap-2">
                          <BellRing size={16} className="text-slate-400 shrink-0" />
                          <div>
                            <h4 className="text-[11px] font-black text-slate-700 uppercase tracking-wider leading-none">Lembrete Automático</h4>
                            <p className="text-[9px] text-slate-500 font-medium">Notificar no WhatsApp no vencimento</p>
                          </div>
                        </div>
                        <button
                          id="toggle-fiado-reminder-btn"
                          type="button"
                          onClick={() => setScheduleFiadoReminder(!scheduleFiadoReminder)}
                          className={`w-10 h-6 rounded-full transition-colors relative focus:outline-none cursor-pointer shrink-0 ${
                            scheduleFiadoReminder ? 'bg-amber-600' : 'bg-slate-200'
                          }`}
                        >
                          <span 
                            className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full transition-transform shadow-sm ${
                              scheduleFiadoReminder ? 'translate-x-4' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                  <button 
                    id="back-to-payment-btn"
                    type="button"
                    onClick={() => setShowFiadoConfirmationModal(false)}
                    disabled={loading}
                    className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                  >
                    <span>Voltar para Receber</span>
                  </button>

                  <button 
                    id="confirm-cancel-fiado-btn"
                    type="button"
                    onClick={() => handleCloseComandaWithChoice('desconto', 'Diferença não cobrada (Desconto)')}
                    disabled={loading}
                    className="flex-1 py-3.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    title="Fecha a comanda aplicando desconto no saldo restante. NENHUM débito ou fiado será lançado para o cliente."
                  >
                    <span>Não Lançar Débito (Desconto)</span>
                  </button>

                  <button 
                    id="confirm-fiado-modal-btn"
                    type="button"
                    onClick={() => handleCloseComandaWithChoice('fiado')}
                    disabled={
                      loading || 
                      !comanda.cliente_id || 
                      comanda.cliente_id === 'avulso' || 
                      !fiadoDueDate
                    }
                    className="flex-1 py-3.5 px-4 text-white bg-amber-600 hover:bg-amber-700 shadow-lg shadow-amber-600/20 rounded-2xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Sim, Lançar Fiado</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPayingDebt && (
          <div 
            id="modal-pay-debt" 
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300"
            onClick={() => setIsPayingDebt(false)}
          >
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col my-auto"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-emerald-50/30">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
                    <DollarSign size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-emerald-900">Registrar Pagamento de Fiado</h3>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest leading-none mt-1">
                      Cliente: {comanda.cliente_name}
                    </p>
                  </div>
                </div>
                <button 
                  id="close-pay-debt-modal-btn"
                  onClick={() => setIsPayingDebt(false)} 
                  className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100 shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {/* Debts dropdown / picker if multiple */}
                {clientDebts.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Selecione o Débito</label>
                    <select
                      id="select-debt-item"
                      value={selectedDebtToPay?.id || ''}
                      onChange={(e) => {
                        const dbt = clientDebts.find(d => d.id === e.target.value);
                        setSelectedDebtToPay(dbt || null);
                        if (dbt) setPayingDebtAmount(dbt.remainingAmount.toString());
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-primary font-bold shadow-inner"
                    >
                      <option value="">-- Mais antigo primeiro (Automático) --</option>
                      {clientDebts.map((d, dIdx) => (
                        <option key={`debt-opt-${d.id || dIdx}-${dIdx}`} value={d.id}>
                          Comanda #{d.comanda_id?.slice(-4) || 's/n'} - R$ {(d.remainingAmount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({format(new Date(d.date + 'T12:00:00'), 'dd/MM/yyyy')})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Amount input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Valor do Pagamento</label>
                    <button 
                      type="button"
                      onClick={() => {
                        const total = selectedDebtToPay 
                          ? selectedDebtToPay.remainingAmount 
                          : clientDebts.reduce((acc, d) => acc + d.remainingAmount, 0);
                        setPayingDebtAmount(total.toString());
                      }}
                      className="text-[10px] font-bold text-emerald-600 hover:underline uppercase tracking-wider"
                    >
                      Quitar Total
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">R$</span>
                    <input 
                      id="pay-debt-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0,00"
                      value={payingDebtAmount}
                      onChange={(e) => setPayingDebtAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-12 pr-5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all text-primary font-bold shadow-inner"
                    />
                  </div>
                </div>

                {/* Payment method selection */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Forma de Pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map((method, mIdx) => (
                      <button
                        id={`pay-debt-method-${method.id}`}
                        key={`pay-debt-mth-${method.id || mIdx}-${mIdx}`}
                        type="button"
                        onClick={() => setPayingDebtMethod(method.id)}
                        className={`py-3 px-4 rounded-xl text-xs font-bold transition-all border-2 flex items-center justify-between ${
                          payingDebtMethod === method.id 
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700' 
                            : 'bg-white border-slate-100 text-muted hover:border-slate-200'
                        }`}
                      >
                        <span>{method.name}</span>
                        {payingDebtMethod === method.id && <CheckCircle2 size={14} className="text-emerald-600" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    id="cancel-pay-debt-modal"
                    onClick={() => {
                      setIsPayingDebt(false);
                      setSelectedDebtToPay(null);
                      setPayingDebtAmount('');
                    }}
                    className="flex-1 py-4 bg-slate-100 text-primary rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all active:scale-95"
                  >
                    Cancelar
                  </button>
                  <button 
                    id="confirm-pay-debt-modal"
                    onClick={handleConfirmPayDebt}
                    disabled={loading || !payingDebtAmount || parseFloat(payingDebtAmount) <= 0}
                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : (
                      <>
                        <DollarSign size={20} />
                        <span>Confirmar Pagamento</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Financial Adjustment Modals (Tip, Discount, Voucher, Coupon) */}
      <AnimatePresence>
        {financialModal && (
          <div 
            className="fixed inset-0 z-[100005] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
            onClick={() => setFinancialModal(null)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white border border-slate-200 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 space-y-5"
            >
              {financialModal === 'tip' && (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Gorjeta para o Profissional</h3>
                        <p className="text-xs text-muted font-medium">Insira o valor que deseja adicionar de caixinha</p>
                      </div>
                    </div>
                    <button onClick={() => setFinancialModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[0, 5, 10, 15, 20].map((tipVal) => (
                        <button
                          key={`modal-tip-${tipVal}`}
                          type="button"
                          onClick={() => setTempTipValue(tipVal.toString())}
                          className={`px-3.5 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                            parseFloat(tempTipValue) === tipVal
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {tipVal === 0 ? 'Sem Gorjeta' : `R$ ${tipVal},00`}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-slate-500">Valor Personalizado (R$)</label>
                      <input
                        type="number"
                        step="0.50"
                        value={tempTipValue}
                        onChange={(e) => setTempTipValue(e.target.value)}
                        placeholder="R$ 0,00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setFinancialModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(tempTipValue) || 0;
                        updateFinancials({ tip: val });
                        setFinancialModal(null);
                        toast.success(val > 0 ? `Gorjeta de R$ ${val.toFixed(2)} aplicada!` : 'Gorjeta removida.');
                      }}
                      className="flex-[2] py-3 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 shadow-sm cursor-pointer"
                    >
                      Confirmar Gorjeta
                    </button>
                  </div>
                </>
              )}

              {financialModal === 'discount' && (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                        <Tag size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Desconto Manual</h3>
                        <p className="text-xs text-muted font-medium">Informe o valor total de desconto em reais</p>
                      </div>
                    </div>
                    <button onClick={() => setFinancialModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500">Valor do Desconto (R$)</label>
                    <input
                      type="number"
                      step="0.50"
                      value={tempDiscountValue}
                      onChange={(e) => setTempDiscountValue(e.target.value)}
                      placeholder="R$ 0,00"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-rose-600 focus:bg-white focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setFinancialModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = parseFloat(tempDiscountValue) || 0;
                        updateFinancials({ discount: val });
                        setFinancialModal(null);
                        toast.success(val > 0 ? `Desconto de R$ ${val.toFixed(2)} aplicado!` : 'Desconto removido.');
                      }}
                      className="flex-[2] py-3 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 shadow-sm cursor-pointer"
                    >
                      Confirmar Desconto
                    </button>
                  </div>
                </>
              )}

              {financialModal === 'voucher' && (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                        <Award size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Voucher de Fidelidade</h3>
                        <p className="text-xs text-muted font-medium">Insira o código/token do voucher resgatado pelo cliente</p>
                      </div>
                    </div>
                    <button onClick={() => setFinancialModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-indigo-700">Token do Voucher</label>
                    <input
                      type="text"
                      value={voucherTokenInput}
                      onChange={(e) => setVoucherTokenInput(e.target.value.toUpperCase())}
                      placeholder="Ex: RESG-ABC123"
                      className="w-full bg-slate-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm font-mono font-bold uppercase text-indigo-950 focus:bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setFinancialModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!voucherTokenInput.trim() || isValidatingVoucher}
                      onClick={async () => {
                        await handleApplyLoyaltyVoucher();
                        setFinancialModal(null);
                      }}
                      className="flex-[2] py-3 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isValidatingVoucher ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                      <span>Validar e Aplicar</span>
                    </button>
                  </div>
                </>
              )}

              {financialModal === 'coupon' && (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                        <Tag size={20} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">Cupom de Desconto</h3>
                        <p className="text-xs text-muted font-medium">Digite ou selecione um cupom ativo</p>
                      </div>
                    </div>
                    <button onClick={() => setFinancialModal(null)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-amber-800">Código do Cupom</label>
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Ex: PROMO10"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase text-slate-900 focus:bg-white focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    {availableCoupons.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-slate-400">Cupons Disponíveis:</label>
                        <div className="flex flex-wrap gap-1.5">
                          {availableCoupons.map((c, cIdx) => (
                            <button
                              key={`cp-mod-${c.id || c.code || cIdx}-${cIdx}`}
                              type="button"
                              onClick={() => setCouponInput(c.code)}
                              className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-100 cursor-pointer"
                            >
                              {c.code} ({c.discount}%)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setFinancialModal(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!couponInput.trim()}
                      onClick={async () => {
                        await handleApplyCoupon();
                        setFinancialModal(null);
                      }}
                      className="flex-[2] py-3 bg-amber-500 text-white font-bold text-xs rounded-xl hover:bg-amber-600 shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      Aplicar Cupom
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Observações Internas & Histórico Modal */}
      <AnimatePresence>
        {showObservationsModal && (
          <div 
            className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto"
            onClick={() => setShowObservationsModal(false)}
          >
            <motion.div 
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface border border-border w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-border flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-primary">Observações da Comanda #{comanda.number}</h3>
                    <p className="text-[10px] text-muted uppercase font-bold tracking-wider">Anotações internas da equipe</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowObservationsModal(false)}
                  className="p-1.5 text-muted hover:text-primary hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted uppercase tracking-widest">Notas Internas</label>
                  <textarea 
                    value={formData.observations}
                    onChange={(e) => setFormData({...formData, observations: e.target.value})}
                    rows={4}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none resize-none shadow-inner"
                    placeholder="Escreva detalhes específicos, preferências do cliente ou notas operacionais..."
                  />
                </div>

                {comanda.reopenHistory && comanda.reopenHistory.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <History className="text-orange-500" size={14} />
                      <h4 className="text-[10px] font-black text-muted uppercase tracking-widest">Histórico de Reaberturas</h4>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {comanda.reopenHistory.map((log, index) => (
                        <div key={`modal-reopen-log-${index}-${log.date}`} className="bg-orange-50/60 border border-orange-100 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-slate-800">{log.userName}</span>
                            <span className="text-muted">{new Date(log.date).toLocaleString('pt-BR')}</span>
                          </div>
                          <p className="text-xs text-orange-950 font-medium italic border-l-2 border-orange-300 pl-2">
                            {log.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-border bg-slate-50/50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowObservationsModal(false)}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-xs"
                >
                  Concluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
