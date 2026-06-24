import React, { useState, useEffect } from 'react';
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
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, serverTimestamp, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Comanda, ComandaItem, ComandaPayment, Service, Product, UserProfile, PaymentMethod, PaymentMethodConfig, ComandaLog } from '../../types';
import { comandaService } from '../../services/comandaService';
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
import { parseDate } from '../../lib/utils';
import { QuickClientSelector } from './QuickClientSelector';
import { QuickProfSelector } from './QuickProfSelector';

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
  
  const [showItemSelector, setShowItemSelector] = useState<'service' | 'product' | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenReasonType, setReopenReasonType] = useState<'erro_lancamento' | 'ajuste_pagamento' | 'cortesia' | 'outro'>('erro_lancamento');
  
  const [partialAmount, setPartialAmount] = useState<string>('');
  
  const [activeSubTab, setActiveSubTab] = useState<'itens' | 'logs'>('itens');
  
  const [confirmFiado, setConfirmFiado] = useState<{ amount: number; method: string; methodId: string } | null>(null);
  
  const [selectedClientProfile, setSelectedClientProfile] = useState<UserProfile | null>(null);
  const [clientLoyalty, setClientLoyalty] = useState<{ points: number; cashback: number } | null>(null);
  
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

  const [activeComandaId, setActiveComandaId] = useState<string | null>(comanda_id || null);
  const hasOpenedComanda = React.useRef(false);

  const [clientPackages, setClientPackages] = useState<any[]>([]);
  const [clientSubscriptions, setClientSubscriptions] = useState<any[]>([]);

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

      return () => {
        unsubPackages();
        unsubSubscriptions();
      };
    } else {
      setClientPackages([]);
      setClientSubscriptions([]);
    }
  }, [comanda?.cliente_id]);
  
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let unsubscribe: () => void;

    const idToListen = activeComandaId || comanda_id;

    if (idToListen) {
      unsubscribe = onSnapshot(doc(db, 'comandas', idToListen), (doc) => {
        if (doc.exists()) {
          const data = { id: doc.id, ...doc.data() } as Comanda;
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
    } else if (initialData && !comanda && !loading && !hasOpenedComanda.current) {
      handleOpenComanda();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [comanda_id, activeComandaId, initialData?.cliente_id, initialData?.profissional_id, initialData?.agendamento_id]);

  useEffect(() => {
    if (comanda?.cliente_id) {
      const client = clients.find(c => c.uid === comanda.cliente_id);
      setSelectedClientProfile(client || null);
      
      // Load loyalty points
      loyaltyService.getClientPoints(comanda.cliente_id).then(loyalty => {
        setClientLoyalty({ points: loyalty.points, cashback: loyalty.cashback });
      });
    } else {
      setSelectedClientProfile(null);
      setClientLoyalty(null);
    }
  }, [comanda?.cliente_id, clients]);

  const loadData = async () => {
    try {
      const [s, p, b, c, pm] = await Promise.all([
        serviceService.getServices(),
        inventoryService.getProducts(),
        userService.getAllBarbers(),
        userService.getAllClients(),
        paymentMethodService.getPaymentMethods()
      ]);
      setServices(s);
      setProducts(p);
      setBarbers(b);
      setClients(c);
      setPaymentMethods(pm.filter(m => m.status === 'active'));
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
    const cliente_id = formData.cliente_id || initialData?.cliente_id;
    const profissional_id = formData.profissional_id || initialData?.profissional_id;

    if (!cliente_id || !profissional_id || !user) {
      return; // Wait for selection and auth if not provided
    }

    if (hasOpenedComanda.current) return;
    hasOpenedComanda.current = true;

    setLoading(true);
    try {
      const client = clients.find(c => c.uid === cliente_id);
      const barber = barbers.find(b => b.uid === profissional_id);

      const newComanda = await comandaService.openComanda({
        ...formData,
        cliente_id,
        profissional_id,
        cliente_name: client?.nome || initialData?.cliente_name || '',
        profissional_name: barber?.nome || initialData?.profissional_name || '',
        origin: initialData?.origin || 'balcao',
        agendamento_id: initialData?.agendamento_id,
        status: initialData?.agendamento_id ? 'aguardando_pagamento' : 'aberta',
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

      setComanda(newComanda);
      setActiveComandaId(newComanda.id);
    } catch (error) {
      console.error("Erro ao abrir comanda:", error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = async (item: Service | Product, type: 'servico' | 'product', isCortesia: boolean = false) => {
    if (!comanda || !user || loading) return;

    if (type === 'product' && (item as Product).currentStock <= 0) {
      toast.error("Produto sem estoque disponível ou insuficiente.");
      return;
    }

    // Duplication protection: check if item is already being added
    setLoading(true);
    try {
      const unitPrice = type === 'servico' ? (item as Service).price : (item as Product).salePrice;
      const totalPrice = isCortesia ? 0 : unitPrice;

      const newItem: ComandaItem = {
        id: `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: type === 'servico' ? 'servico' : 'produto',
        referencia_id: item.id,
        name: item.name,
        quantity: 1,
        unitPrice,
        totalPrice,
        profissional_id: comanda.profissional_id,
        profissional_name: comanda.profissional_name,
        isCortesia,
        generateCommission: type === 'servico' && !isCortesia
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
            profissional_id: comanda.profissional_id,
            profissional_name: comanda.profissional_name,
            servico_id: item.id,
            servico_name: item.name,
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
      const updatedItems = comanda.items.filter(i => i.id !== itemId);
      await comandaService.updateComandaItems(
        comanda.id, 
        updatedItems, 
        comanda.discount, 
        comanda.tip, 
        user.uid, 
        profile?.nome || user.email || 'Usuário'
      );
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
            generateCommission: i.type === 'servico' && !isCortesia
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

  const toggleItemDeduction = async (itemId: string, type: 'pacote' | 'assinatura' | 'none') => {
    if (!comanda || !user || loading) return;
    
    setLoading(true);
    try {
      const updatedItems = comanda.items.map(i => {
        if (i.id === itemId) {
          if (type === 'pacote') {
            const hasPkg = clientPackages.find(
              p => p.remainingCuts > 0 && (p.serviceId === i.referencia_id || p.packageName.toLowerCase().includes(i.name.toLowerCase()))
            );
            return {
              ...i,
              deductType: 'pacote' as const,
              packageSaleId: hasPkg?.id || '',
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
              generateCommission: true
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

  const handleAddPayment = async (method: PaymentMethod, amount: number, metodo_pagamento_id?: string) => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      const currentCash = await cashService.getCurrentCash();
      
      if (['fiado', 'resgate'].indexOf(method) === -1 && !currentCash) {
        toast.error("O caixa precisa estar aberto para receber pagamentos.");
        return;
      }

      if (method === 'resgate') {
        if (!clientLoyalty || clientLoyalty.cashback < amount) {
          toast.error("Saldo de cashback insuficiente.");
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

      await comandaService.addPayment(
        comanda.id, 
        {
          method,
          metodo_pagamento_id,
          amount,
          date: new Date().toISOString().split('T')[0]
        },
        user.uid,
        profile?.nome || user.email || 'Usuário'
      );

      setShowPaymentModal(false);
      setPartialAmount('');
      toast.success("Pagamento registrado com sucesso.");
    } catch (error) {
      console.error("Erro ao processar pagamento:", error);
      toast.error("Erro ao processar pagamento: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleCloseComanda = async () => {
    if (!comanda || !user || loading) return;
    setLoading(true);
    try {
      // 1. Process package/subscription deductions before closing
      for (const item of comanda.items) {
        if (item.deductType === 'pacote' && item.packageSaleId) {
          const pkgRef = doc(db, 'pacotes_vendas', item.packageSaleId);
          const pkgSnap = await getDoc(pkgRef);
          if (pkgSnap.exists()) {
            const pkgData = pkgSnap.data();
            const currentUsages = pkgData.usages || [];
            const newIndex = currentUsages.length + 1;
            const newUsage = {
              usedAt: new Date().toISOString(),
              notes: `Consumo automático na Comanda #${comanda.number}`,
              index: newIndex,
              comanda_id: comanda.id
            };
            await updateDoc(pkgRef, {
              remainingCuts: Math.max(0, (pkgData.remainingCuts || 0) - 1),
              usages: [...currentUsages, newUsage]
            });
            console.log(`Deducted 1 cut from Package Sale ID ${item.packageSaleId}`);
          }
        } else if (item.deductType === 'assinatura' && item.subscriptionId) {
          const isCut = item.name.toLowerCase().includes('corte') || item.name.toLowerCase().includes('cabelo') || item.name.toLowerCase().includes('hair');
          const typeLabel: 'haircut' | 'beard' = isCut ? 'haircut' : 'beard';
          
          await subscriptionService.registerUsage(item.subscriptionId, typeLabel, comanda.agendamento_id);
          console.log(`Registered subscription usage on ID ${item.subscriptionId} for ${typeLabel}`);
        }
      }

      // 2. Actually close the comanda
      await comandaService.closeComanda(comanda.id, user.uid, profile?.nome || user.email || 'Usuário', 'fechada');
      toast.success("Comanda fechada com sucesso!");
      setConfirmClose(false);
      onSave();
    } catch (error) {
      console.error("Erro ao fechar comanda com deduções:", error);
      toast.error("Erro ao fechar comanda: " + (error instanceof Error ? error.message : String(error)));
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-surface border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50">
            <h2 className="text-xl font-bold text-primary">Abrir Nova Comanda</h2>
            <button onClick={onClose} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100">
              <X size={20} />
            </button>
          </div>

          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted uppercase tracking-wider ml-1">Cliente</label>
              <select 
                value={formData.cliente_id}
                onChange={(e) => setFormData({...formData, cliente_id: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none font-medium"
              >
                <option value="">Selecione um cliente</option>
                {clients.map((c, index) => (
                  <option key={c.uid || `client-${index}`} value={c.uid}>{c.nome}</option>
                ))}
              </select>
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
                  <option key={b.uid || `barber-${index}`} value={b.uid}>{b.nome}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={handleOpenComanda}
              disabled={loading}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-2 mt-4 active:scale-95"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Receipt size={20} />}
              <span>Abrir Comanda Agora</span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading || !comanda) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-white font-bold text-sm animate-pulse">Carregando comanda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface border border-border w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary shadow-sm border border-primary/5">
              <Receipt size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-primary">Comanda #{comanda.number}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
                  comanda.status === 'aberta' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                  comanda.status === 'fechada' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                  comanda.status === 'cancelada' ? 'bg-red-50 text-red-600 border-red-100' :
                  'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                  {comanda.status.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-muted font-bold uppercase tracking-widest">Iniciada em {format(parseDate(comanda.createdAt), 'HH:mm')}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={() => setIsPDVMode(!isPDVMode)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 border ${
                isPDVMode 
                  ? 'bg-accent text-white border-accent' 
                  : 'bg-white text-primary border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Zap size={16} fill={isPDVMode ? 'currentColor' : 'none'} />
              <span>{isPDVMode ? 'Modo Normal' : 'Modo PDV'}</span>
            </button>
            <div className="w-px h-8 bg-slate-200 mx-1" />
            <button 
              onClick={onClose} 
              className="p-3 text-muted hover:text-primary hover:bg-slate-100 transition-colors bg-white rounded-xl border border-slate-100 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Fechar"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-10 custom-scrollbar">
          {/* Left Side: Items and Info */}
          <div className={`lg:col-span-2 space-y-10 ${isPDVMode ? 'animate-in slide-in-from-left duration-500' : ''}`}>
            {!isPDVMode && (
              <div className="flex border-b border-slate-100 gap-6">
                <button 
                  onClick={() => setActiveSubTab('itens')}
                  className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all ${
                    activeSubTab === 'itens' ? 'text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  Itens e Atendimento
                  {activeSubTab === 'itens' && <motion.div layoutId="modalTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
                </button>
                <button 
                  onClick={() => setActiveSubTab('logs')}
                  className={`pb-4 text-xs font-black uppercase tracking-widest relative transition-all flex items-center gap-2 ${
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
              <div className="space-y-10 animate-in fade-in duration-300">
                {/* Client & Barber Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="relative">
                    <div 
                      onClick={() => !loading && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && setShowQuickClient(!showQuickClient)}
                      className={`bg-slate-50 border p-5 rounded-2xl flex justify-between items-center shadow-sm transition-all ${
                        ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? 'cursor-pointer hover:border-accent/40' : 'cursor-default'
                      } ${showQuickClient ? 'border-accent ring-2 ring-accent/5' : 'border-slate-100'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-accent border border-slate-100 shadow-sm group-hover:scale-110 transition-transform">
                          <User size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Cliente</p>
                            {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && <ArrowRightLeft size={8} className="text-slate-300" />}
                          </div>
                          <p className="text-primary font-bold">{comanda.cliente_name || 'Cliente Avulso'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted uppercase tracking-widest font-bold mb-0.5">Saldo</p>
                        <p className={`text-xs font-bold ${
                          (clients.find(c => c.uid === comanda.cliente_id)?.balance || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          R$ {(clients.find(c => c.uid === comanda.cliente_id)?.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                      className={`bg-slate-50 border p-5 rounded-2xl flex items-center justify-between shadow-sm transition-all ${
                        ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? 'cursor-pointer hover:border-accent/40' : 'cursor-default'
                      } ${showQuickProf ? 'border-accent ring-2 ring-accent/5' : 'border-slate-100'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-500 border border-slate-100 shadow-sm group-hover:scale-110 transition-transform">
                          <Scissors size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] text-muted uppercase tracking-widest font-bold">Profissional</p>
                            {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && <ArrowRightLeft size={8} className="text-slate-300" />}
                          </div>
                          <p className="text-primary font-bold">{comanda.profissional_name}</p>
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

                {isPDVMode && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-in slide-in-from-top duration-500">
                    <button 
                      onClick={() => setShowItemSelector('service')}
                      className="p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex flex-col items-center gap-3 hover:bg-emerald-100 hover:border-emerald-200 transition-all text-emerald-700 shadow-sm group active:scale-95"
                    >
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Zap size={24} fill="currentColor" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">+ Serviço</span>
                    </button>
                    <button 
                      onClick={() => setShowItemSelector('product')}
                      className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex flex-col items-center gap-3 hover:bg-blue-100 hover:border-blue-200 transition-all text-blue-700 shadow-sm group active:scale-95"
                    >
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <ShoppingBag size={24} fill="currentColor" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">+ Produto</span>
                    </button>
                    <button 
                       onClick={() => updateFinancials({ discount: (comanda.discount || 0) + 5 })}
                      className="p-6 bg-rose-50 border border-rose-100 rounded-3xl flex flex-col items-center gap-3 hover:bg-rose-100 hover:border-rose-200 transition-all text-rose-700 shadow-sm group active:scale-95"
                    >
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                        <Trash2 size={24} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Desconto</span>
                    </button>
                    <button 
                      onClick={() => setShowPaymentModal(true)}
                      className="p-6 bg-primary text-white rounded-3xl flex flex-col items-center gap-3 hover:bg-slate-800 transition-all shadow-lg shadow-primary/20 group active:scale-95"
                    >
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <DollarSign size={24} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Pagar</span>
                    </button>
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                      <ShoppingBag size={20} className="text-accent" />
                      Itens da Comanda
                    </h3>
                    {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowItemSelector('service')}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-primary rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                        >
                          <Plus size={14} />
                          <span>Serviço</span>
                        </button>
                        <button 
                          onClick={() => setShowItemSelector('product')}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-primary rounded-xl text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                        >
                          <Plus size={14} />
                          <span>Produto</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {comanda.cliente_id && (clientPackages.some(p => p.remainingCuts > 0) || clientSubscriptions.some(s => s.status === 'active')) && (
                    <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50/50 border border-emerald-100 rounded-3xl space-y-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center border border-emerald-200/50">
                            <Sparkles size={16} fill="currentColor" className="animate-pulse" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-emerald-900 uppercase tracking-widest">Planos e Pacotes Ativos</h4>
                            <p className="text-[10px] text-emerald-750 font-bold">Identificamos haver saldo/benefícios ativos para {comanda.cliente_name}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {clientPackages.filter(p => p.remainingCuts > 0).map((pkg) => (
                          <div key={pkg.id} className="p-3 bg-white/80 rounded-2xl border border-emerald-100/50 flex items-center justify-between shadow-sm">
                            <div>
                              <p className="text-[10px] font-black text-emerald-950 uppercase tracking-wide truncate max-w-[200px]">{pkg.packageName}</p>
                              <p className="text-[11px] text-emerald-700 font-bold">{pkg.remainingCuts} de {pkg.totalCuts} cortes restantes</p>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-100/70 text-emerald-800 px-2.5 py-1 rounded-xl border border-emerald-100">Pacote</span>
                          </div>
                        ))}
                        
                        {clientSubscriptions.filter(s => s.status === 'active').map((sub) => (
                          <div key={sub.id} className="p-3 bg-white/80 rounded-2xl border border-emerald-100/50 flex items-center justify-between shadow-sm border-s-4 border-s-indigo-400">
                            <div>
                              <p className="text-[10px] font-black text-indigo-950 uppercase tracking-wide truncate max-w-[200px]">{sub.planName}</p>
                              <p className="text-[11px] text-indigo-700 font-bold">
                                Usado: {sub.haircutsUsed} cortes / {sub.beardsUsed} barbas
                              </p>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest bg-indigo-100/70 text-indigo-800 px-2.5 py-1 rounded-xl border border-indigo-100">Clube</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/50">
                          <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Item</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Qtd</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider">Valor Unit.</th>
                          <th className="px-6 py-4 text-[10px] font-bold text-muted uppercase tracking-wider text-right">Total</th>
                          <th className="px-6 py-4 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {comanda.items.map((item, index) => {
                          const isService = item.type === 'servico';
                          const hasPkg = clientPackages.find(
                            p => p.remainingCuts > 0 && (p.serviceId === item.referencia_id || p.packageName.toLowerCase().includes(item.name.toLowerCase()))
                          );
                          const activeSub = clientSubscriptions.find(s => s.status === 'active');
                          const isCut = item.name.toLowerCase().includes('corte') || item.name.toLowerCase().includes('cabelo') || item.name.toLowerCase().includes('hair');
                          const isBeard = item.name.toLowerCase().includes('barba') || item.name.toLowerCase().includes('beard');
                          const hasSub = activeSub && (
                            (isCut && activeSub.haircutsUsed < (activeSub.haircutsPerMonth || 999)) ||
                            (isBeard && activeSub.beardsUsed < (activeSub.beardsPerMonth || 999))
                          );

                          return (
                            <tr key={`${item.id || 'item'}-${index}`} className="hover:bg-slate-50/50 transition-colors group">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-4">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-sm ${
                                    item.type === 'servico' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                                  }`}>
                                    {item.type === 'servico' ? <Scissors size={16} /> : <Package size={16} />}
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
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                          <Sparkles size={10} fill="currentColor" />
                                          CLUBE
                                        </span>
                                      )}
                                    </div>

                                    {/* Action buttons to toggle deduction */}
                                    {isService && (hasPkg || hasSub) && ['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={() => toggleItemDeduction(item.id, 'none')}
                                          className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                            !item.deductType 
                                              ? 'bg-slate-800 text-white border-slate-800 shadow-sm' 
                                              : 'bg-white text-slate-400 border-slate-150 hover:text-slate-600 hover:border-slate-300'
                                          }`}
                                        >
                                          Pagar R$
                                        </button>
                                        
                                        {hasPkg && (
                                          <button
                                            type="button"
                                            onClick={() => toggleItemDeduction(item.id, 'pacote')}
                                            className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1 ${
                                              item.deductType === 'pacote'
                                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                                : 'bg-amber-50 text-amber-600 border-amber-100/50 hover:bg-amber-100'
                                            }`}
                                          >
                                            <Award size={10} fill="currentColor" />
                                            <span>Usar Pacote ({hasPkg.remainingCuts} rest.)</span>
                                          </button>
                                        )}

                                        {hasSub && (
                                          <button
                                            type="button"
                                            onClick={() => toggleItemDeduction(item.id, 'assinatura')}
                                            className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1 ${
                                              item.deductType === 'assinatura'
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                                : 'bg-indigo-50 text-indigo-600 border-indigo-100/50 hover:bg-indigo-150'
                                            }`}
                                          >
                                            <Sparkles size={10} fill="currentColor" />
                                            <span>Clube</span>
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
                                  <span>R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                )}
                              </td>
                              <td className="px-6 py-5 text-sm font-bold text-primary text-right">R$ {item.totalPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-6 py-5 text-right">
                                {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 && (
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => toggleCortesia(item.id)}
                                      title={item.isCortesia ? "Remover Cortesia" : "Marcar como Cortesia"}
                                      className={`p-2 rounded-lg transition-all ${
                                        item.isCortesia ? 'text-emerald-600 bg-emerald-50' : 'text-slate-300 hover:text-emerald-500 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <CheckCircle2 size={16} />
                                    </button>
                                    <button 
                                      onClick={() => removeItem(item.id)}
                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {comanda.items.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-6 py-16 text-center">
                              <div className="flex flex-col items-center gap-2">
                                <Receipt className="text-slate-200" size={40} />
                                <p className="text-muted text-sm font-medium">Nenhum item adicionado ainda.</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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
                        <div key={p.id || `pay-${index}`} className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-center justify-between shadow-sm group hover:bg-emerald-100/50 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                              <CreditCard size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-emerald-900 uppercase tracking-tight">{p.method}</p>
                              <p className="text-[10px] text-emerald-600/70 font-bold">{format(new Date(p.date), 'dd/MM/yyyy')}</p>
                            </div>
                          </div>
                          <p className="text-emerald-600 font-black text-lg">R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                    <div key={index} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3">
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
                        <div key={index} className="bg-orange-50/30 border border-orange-100/30 rounded-2xl p-5 space-y-3">
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
          <div className="space-y-8">
            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8 space-y-8 shadow-sm">
              <h3 className="text-lg font-bold text-primary">Resumo do Checkout</h3>
              
              <div className="space-y-4">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-muted">Subtotal Serviços</span>
                  <span className="text-primary">R$ {comanda.subtotalServices.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-muted">Subtotal Produtos</span>
                  <span className="text-primary">R$ {comanda.subtotalProducts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Gorjeta</label>
                    <div className="relative">
                      <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-500" size={12} />
                      <input 
                        type="number"
                        value={comanda.tip || ''}
                        disabled={['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) !== -1 || loading}
                        onChange={(e) => updateFinancials({ tip: Number(e.target.value) })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs text-emerald-600 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/50 transition-all disabled:opacity-50"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Desconto</label>
                    <div className="relative">
                      <Trash2 className="absolute left-2.5 top-1/2 -translate-y-1/2 text-red-500" size={12} />
                      <input 
                        type="number"
                        value={comanda.discount || ''}
                        disabled={['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) !== -1 || loading}
                        onChange={(e) => updateFinancials({ discount: Number(e.target.value) })}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-7 pr-3 text-xs text-red-600 font-bold focus:outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500/50 transition-all disabled:opacity-50"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-primary font-bold">Total Geral</span>
                    <span className="text-3xl font-black text-primary tracking-tighter">R$ {comanda.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>

                  {selectedClientProfile && (
                    <div className="p-4 bg-slate-100 rounded-2xl flex items-center justify-between border border-slate-200">
                      <div>
                        <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-none mb-1">Saldo do Cliente</p>
                        <p className={`text-sm font-black ${selectedClientProfile.balance < 0 ? 'text-red-600' : selectedClientProfile.balance > 0 ? 'text-emerald-600' : 'text-slate-600'}`}>
                          {selectedClientProfile.balance < 0 ? 'DÉBITO' : selectedClientProfile.balance > 0 ? 'CRÉDITO' : 'SEM PENDÊNCIA'}
                        </p>
                      </div>
                      <span className={`text-lg font-black ${selectedClientProfile.balance < 0 ? 'text-red-700' : selectedClientProfile.balance > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                        R$ {Math.abs(selectedClientProfile.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-200">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted uppercase tracking-widest">Total Pago</span>
                  <span className="text-emerald-600">R$ {comanda.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-muted uppercase tracking-widest">Pendente</span>
                  <span className="text-amber-600">R$ {comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                {comanda.pendingAmount > 0 && (
                  <div className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 mt-1 ${
                    comanda.cliente_id === 'avulso'
                      ? 'bg-red-50 border-red-100 text-red-700'
                      : 'bg-amber-50 border-amber-200 text-amber-700'
                  }`}>
                    <AlertCircle className="shrink-0" size={14} />
                    <span>
                      {comanda.cliente_id === 'avulso'
                        ? 'Vincule um cliente cadastrado para permitir fiado'
                        : `O valor restante (R$ ${comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) será lançado como FIADO`}
                    </span>
                  </div>
                )}
              </div>

              {['fechada', 'cancelada', 'nao_paga'].indexOf(comanda.status) === -1 ? (
                <div className="space-y-4 pt-4">
                  <button 
                    onClick={() => setShowPaymentModal(true)}
                    disabled={loading || comanda.pendingAmount <= 0}
                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-primary/10 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    <DollarSign size={20} />
                    <span>Registrar Pagamento</span>
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setConfirmClose(true)}
                      disabled={loading}
                      className="py-3 bg-white border border-slate-200 text-primary rounded-xl font-bold text-xs hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                      <span>Finalizar Conta</span>
                    </button>
                    <button 
                      onClick={() => setConfirmCancel(true)}
                      disabled={loading}
                      className="py-3 bg-white border border-slate-200 text-red-500 rounded-xl font-bold text-xs hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                      <span>Cancelar</span>
                    </button>
                  </div>

                  <button 
                    onClick={onClose}
                    className="w-full py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    <EyeOff size={16} className="text-slate-500" />
                    <span>Ocultar Comanda (Salvar e Sair)</span>
                  </button>
                </div>
              ) : (
                (isAdmin || isGerente) && (
                  <div className="pt-4">
                    <button 
                      onClick={() => setShowReopenModal(true)}
                      disabled={loading}
                      className="w-full py-4 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/10 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCcw size={20} />}
                      <span>Reabrir Comanda</span>
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Observações Internas</label>
              <textarea 
                value={formData.observations}
                onChange={(e) => setFormData({...formData, observations: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all text-primary outline-none min-h-[120px] resize-none shadow-inner"
                placeholder="Notas estratégicas sobre este atendimento..."
              />
            </div>

            {/* Reopen History */}
            {comanda.reopenHistory && comanda.reopenHistory.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <History className="text-orange-500" size={16} />
                  <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest">Histórico de Reabertura</h3>
                </div>
                <div className="space-y-3">
                  {comanda.reopenHistory.map((log, index) => (
                    <div key={`reopen-log-${index}-${log.date}`} className="bg-orange-50/50 border border-orange-100/50 rounded-2xl p-4 space-y-2 relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User size={10} className="text-orange-400" />
                          <span className="text-[10px] font-bold text-primary">{log.userName}</span>
                        </div>
                        <span className="text-[9px] text-muted font-medium">{new Date(log.date).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-[11px] text-orange-800 font-medium leading-relaxed italic border-l-2 border-orange-200 pl-3">
                        {log.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Item Selector Modal */}
      <AnimatePresence>
        {showItemSelector && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface border border-border w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border ${
                    showItemSelector === 'service' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'
                  }`}>
                    {showItemSelector === 'service' ? <Scissors size={20} /> : <Package size={20} />}
                  </div>
                  <h3 className="text-xl font-bold text-primary">
                    {showItemSelector === 'service' ? 'Adicionar Serviço' : 'Adicionar Produto'}
                  </h3>
                </div>
                <button onClick={() => setShowItemSelector(null)} className="p-2 text-muted hover:text-primary transition-colors bg-white rounded-lg border border-slate-100 shadow-sm">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3 custom-scrollbar">
                {showItemSelector === 'service' ? (
                  services.map((s, index) => (
                    <div 
                      key={`${s.id || 'service'}-${index}`}
                      onClick={() => addItem(s, 'servico')}
                      className="w-full p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-accent/30 hover:bg-slate-50/50 transition-all group shadow-sm cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent transition-colors border border-slate-100">
                          <Scissors size={18} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-primary group-hover:text-accent transition-colors">{s.name}</p>
                          <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{s.duration} min</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            addItem(s, 'servico', true);
                          }}
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                        >
                          CORTESIA
                        </button>
                        <p className="font-black text-primary min-w-[90px] text-right">R$ {s.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  products.map((p, index) => (
                    <div 
                      key={`${p.id || 'product'}-${index}`}
                      onClick={() => addItem(p, 'product')}
                      className="w-full p-5 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-accent/30 hover:bg-slate-50/50 transition-all group shadow-sm cursor-pointer"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-accent transition-colors border border-slate-100">
                          <Package size={18} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-primary group-hover:text-accent transition-colors">{p.name}</p>
                          <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Estoque: {p.currentStock}</p>
                        </div>
                      </div>
                      <p className="font-black text-primary">R$ {p.salePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface border border-border w-full max-w-xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                    <DollarSign size={20} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-primary">Registrar Pagamento</h3>
                    <p className="text-[10px] text-muted font-bold uppercase tracking-widest">Selecione a forma de recebimento</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPaymentModal(false)} 
                  className="p-3 text-muted hover:text-primary hover:bg-slate-100 transition-colors bg-white rounded-xl border border-slate-100 shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="Fechar"
                >
                  <X size={22} />
                </button>
              </div>
              
              <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl text-center relative overflow-hidden shadow-sm">
                  <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/20" />
                  <p className="text-[10px] text-emerald-600 uppercase tracking-widest font-black mb-1">Valor Pendente</p>
                  <p className="text-5xl font-black text-emerald-700 tracking-tighter">R$ {comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">Valor a Pagar Agora</label>
                  <div className="relative">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input 
                      type="number"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder={comanda.pendingAmount.toString()}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-5 pl-12 pr-24 text-2xl text-primary font-black focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500/50 transition-all shadow-inner"
                    />
                    <button 
                      onClick={() => setPartialAmount(comanda.pendingAmount.toString())}
                      className="absolute right-4 top-1/2 -translate-y-1/2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm active:scale-95"
                    >
                      TOTAL
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {clientLoyalty && clientLoyalty.cashback > 0 && (
                    <button
                      onClick={() => {
                        const amount = Math.min(Number(partialAmount) || comanda.pendingAmount, clientLoyalty.cashback);
                        handleAddPayment('resgate', amount);
                      }}
                      disabled={loading || comanda.pendingAmount <= 0}
                      className="col-span-2 p-6 bg-amber-50 border-2 border-amber-200 rounded-3xl flex items-center justify-between hover:bg-amber-100 transition-all shadow-sm active:scale-95 group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-amber-600 shadow-sm border border-amber-100 group-hover:scale-110 transition-transform">
                          <Zap size={24} fill="currentColor" />
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 leading-none mb-1">Usar Cashback</p>
                          <p className="text-sm font-bold text-amber-900">Você tem R$ {clientLoyalty.cashback.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} disponíveis</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-amber-600 text-white px-3 py-1.5 rounded-xl shadow-sm group-hover:bg-amber-700 transition-colors">Resgatar Agora</span>
                        <ChevronRight size={16} className="text-amber-400" />
                      </div>
                    </button>
                  )}
                  {paymentMethods.map((method, index) => {
                    const amount = partialAmount ? Number(partialAmount) : comanda.pendingAmount;
                    const isFiado = method.type === 'fiado' || method.goesToClientAccount;
                    
                    return (
                      <button
                        key={method.id || `pm-${index}`}
                        disabled={amount <= 0 || (amount < comanda.pendingAmount && !method.allowsPartial)}
                        onClick={() => {
                          if (amount <= 0) return;
                          if (isFiado) {
                            setConfirmFiado({ amount, method: method.type, methodId: method.id });
                            return;
                          }
                          handleAddPayment(method.type, amount, method.id);
                          setPartialAmount('');
                        }}
                        className={`flex flex-col items-center justify-center gap-4 p-6 border-2 rounded-2xl transition-all group relative overflow-hidden ${
                          amount <= 0 || (amount < comanda.pendingAmount && !method.allowsPartial)
                            ? 'bg-slate-50 border-slate-100 opacity-40 cursor-not-allowed'
                            : isFiado 
                              ? 'bg-white border-slate-100 hover:border-amber-500/50 hover:bg-amber-50 shadow-sm'
                              : 'bg-white border-slate-100 hover:border-emerald-500/50 hover:bg-emerald-50 shadow-sm'
                        }`}
                      >
                        <div className={`p-4 rounded-2xl transition-all group-hover:scale-110 ${
                          isFiado ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          {method.type === 'pix' ? <Smartphone size={24} /> : 
                           method.type === 'dinheiro' ? <DollarSign size={24} /> : 
                           method.type === 'fiado' ? <AlertCircle size={24} /> : 
                           method.type === 'assinatura' ? <Wallet size={24} /> : <CreditCard size={24} />}
                        </div>
                        <div className="text-center">
                          <span className="text-sm font-bold text-primary block">{method.name}</span>
                          <div className="flex flex-col items-center gap-1 mt-1.5">
                            {method.feePercentage > 0 && (
                              <span className="text-[9px] text-muted font-bold uppercase tracking-widest">Taxa: {method.feePercentage}%</span>
                            )}
                            {method.entersCashImmediately || method.type === 'dinheiro' || method.type === 'pix' ? (
                              <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wider">Disponível Hoje</span>
                            ) : method.goesToReceivables || method.type === 'credito' || method.type === 'debito' ? (
                              <span className="text-[8px] bg-blue-50 text-blue-600 border border-blue-100 font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wider">D+{method.settlementDays || 1} amanhã/futuro</span>
                            ) : method.type === 'fiado' || method.goesToClientAccount ? (
                              <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-100 font-bold uppercase px-1.5 py-0.5 rounded-md tracking-wider">Conta Fiado</span>
                            ) : null}
                          </div>
                        </div>
                        {!method.allowsPartial && amount < comanda.pendingAmount && (
                          <div className="absolute inset-0 bg-white/90 flex items-center justify-center rounded-2xl">
                            <span className="text-[9px] font-black text-red-600 uppercase tracking-widest text-center px-4 leading-tight">Apenas Pagamento Total</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {paymentMethods.length === 0 && (
                  <div className="text-center py-16 bg-slate-50 border border-dashed border-slate-200 rounded-3xl">
                    <AlertCircle className="mx-auto text-slate-300 mb-3" size={40} />
                    <p className="text-muted text-sm font-medium italic">Nenhum método de pagamento ativo.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reopen Modal */}
        <AnimatePresence>
          {showReopenModal && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[32px] w-full max-w-lg overflow-hidden shadow-2xl"
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
                      ].map(type => (
                        <button
                          key={type.id}
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
          comanda.pendingAmount > 0
            ? `Atenção: Há um saldo pendente de R$ ${comanda.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Ao finalizar, este valor será lançado automaticamente como FIADO na conta do cliente ${comanda.cliente_name}. O profissional receberá a comissão integral e a barbearia receberá posteriormente.`
            : "Deseja finalizar esta comanda manualmente? Isso a marcará como concluída no sistema financeiro."
        }
        confirmLabel="Finalizar"
      />

      <ConfirmationModal
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={handleCancelComanda}
        title="Cancelar Comanda"
        description="Deseja cancelar esta comanda? Esta ação não pode ser desfeita."
        variant="danger"
        confirmLabel="Cancelar"
      />

      <ConfirmationModal
        isOpen={!!confirmFiado}
        onClose={() => setConfirmFiado(null)}
        onConfirm={() => {
          if (confirmFiado) {
            handleAddPayment(confirmFiado.method as any, confirmFiado.amount, confirmFiado.methodId);
            setPartialAmount('');
          }
        }}
        title="Confirmar Fiado"
        description={`Deseja lançar R$ ${confirmFiado?.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} como FIADO na conta do cliente?`}
        confirmLabel="Confirmar"
      />
    </div>
  );
}
