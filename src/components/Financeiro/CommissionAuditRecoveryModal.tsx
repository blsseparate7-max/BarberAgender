import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ArrowRight, 
  Search, 
  Sliders, 
  ShieldCheck, 
  User, 
  Calendar, 
  DollarSign, 
  Scissors, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  HelpCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  writeBatch, 
  doc, 
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile, Comanda, Commission, ProfessionalAdvance } from '../../types';
import { toast } from 'sonner';

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
};

const normalizeToYYYYMMDD = (dateStr: string): string => {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.substring(0, 10);
  }
  // Format DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(trimmed)) {
    const parts = trimmed.split('/');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return trimmed.substring(0, 10);
};

interface CommissionAuditRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  onSuccess: () => void;
  startDate?: string;
  endDate?: string;
}

interface BarberAuditSummary {
  uid: string;
  name: string;
  commissionPercentage: number;
  // Current values in system
  currentProduction: number;
  currentCommission: number;
  currentAdvances: number;
  currentNet: number;
  // Recalculated values from items & descriptions
  recalculatedProduction: number;
  recalculatedCommission: number;
  recalculatedAdvances: number;
  recalculatedNet: number;
  // Item count
  itemsCount: number;
  advancesCount: number;
  // Details
  servicesList: Array<{
    id?: string;
    comandaNumber: string;
    date: string;
    clientName: string;
    description: string;
    value: number;
    commissionValue: number;
    originalBarber: string;
  }>;
  advancesList: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    currentAssignedName: string;
    detectedReason: string;
  }>;
}

interface OpenFlowComanda {
  id: string;
  number: string;
  clientName: string;
  barberName: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  hasPayments: boolean;
  status: string;
  dailyFlowId?: string;
  itemsCount: number;
}

export const CommissionAuditRecoveryModal: React.FC<CommissionAuditRecoveryModalProps> = ({
  isOpen,
  onClose,
  tenantId,
  onSuccess,
  startDate: propStartDate,
  endDate: propEndDate
}) => {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedBarber, setExpandedBarber] = useState<string | null>(null);
  const [showOpenComandas, setShowOpenComandas] = useState(false);
  
  // Audited Data (Raw State)
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [rawCommissions, setRawCommissions] = useState<Commission[]>([]);
  const [rawAdvances, setRawAdvances] = useState<ProfessionalAdvance[]>([]);
  const [rawValidComandas, setRawValidComandas] = useState<Comanda[]>([]);
  const [openFlowComandas, setOpenFlowComandas] = useState<OpenFlowComanda[]>([]);
  const [totalComandasAnalyzed, setTotalComandasAnalyzed] = useState(0);
  const [totalCommissionsAnalyzed, setTotalCommissionsAnalyzed] = useState(0);
  const [totalAdvancesAnalyzed, setTotalAdvancesAnalyzed] = useState(0);

  // Editable Vales State
  const [valesState, setValesState] = useState<Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    assignedBarberId: string;
    source: string;
    currentAssignedName: string;
    detectedReason: string;
  }>>([]);

  // Editable Services State
  const [servicesState, setServicesState] = useState<Array<{
    id: string;
    comandaId: string;
    itemIndex: number;
    comandaNumber: string;
    date: string;
    clientName: string;
    description: string;
    value: number;
    commissionValue: number;
    assignedBarberId: string;
    originalBarberName: string;
  }>>([]);

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Period: default to September 1 to 15
  const startDate = propStartDate || '2026-09-01';
  const endDate = propEndDate || '2026-09-15';

  useEffect(() => {
    if (isOpen) {
      runAudit();
    }
  }, [isOpen, tenantId]);

  const normalizeStr = (str: string = '') => {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  };

  // Helper para identificar barbeiro pelo nome/texto
  const detectBarberForText = (text: string, activeBarbers: UserProfile[]): UserProfile | null => {
    const norm = normalizeStr(text);
    if (!norm) return null;

    // Prioridade 1: Casamento específico para Luiz Miguel vs Luiz Henrique
    if (norm.includes('luiz miguel') || (norm.includes('miguel') && !norm.includes('henrique') && !norm.includes('rick'))) {
      const miguel = activeBarbers.find(b => {
        const bNorm = normalizeStr(b.nome);
        const bEmail = (b.email || '').toLowerCase();
        return bNorm.includes('miguel') || bEmail.includes('luizmiguel');
      });
      if (miguel) return miguel;
    }

    if (norm.includes('luiz henrique') || norm.includes('henrique') || norm.includes('rick')) {
      const henrique = activeBarbers.find(b => {
        const bNorm = normalizeStr(b.nome);
        const bEmail = (b.email || '').toLowerCase();
        return bNorm.includes('henrique') || bNorm.includes('rick') || bEmail.includes('rickbolado');
      });
      if (henrique) return henrique;
    }

    // Prioridade 2: Casamento por nome completo ou email
    for (const b of activeBarbers) {
      const bNorm = normalizeStr(b.nome);
      const bEmail = (b.email || '').toLowerCase().trim();
      if (bNorm && norm === bNorm) return b;
      if (bNorm && bNorm.length > 5 && norm.includes(bNorm)) return b;
      if (bEmail && norm.includes(bEmail)) return b;
    }

    // Prioridade 3: Primeiro nome único (exceto nomes comuns com múltiplos barbeiros como "luiz")
    for (const b of activeBarbers) {
      const bNorm = normalizeStr(b.nome);
      const bFirst = bNorm.split(' ')[0] || '';
      if (bFirst.length >= 4 && bFirst !== 'luiz' && norm.includes(bFirst)) return b;
    }
    return null;
  };

  const handleValeReassign = (valeId: string, newBarberId: string) => {
    setValesState(prev => prev.map(v => v.id === valeId ? { ...v, assignedBarberId: newBarberId } : v));
    toast.info("Vale transferido de profissional! Os saldos foram recalculados.");
  };

  const handleServiceCommissionChange = (serviceId: string, newValue: number) => {
    setServicesState(prev => prev.map(s => s.id === serviceId ? { ...s, commissionValue: isNaN(newValue) ? 0 : newValue } : s));
  };

  const handleServiceBarberChange = (serviceId: string, newBarberId: string) => {
    setServicesState(prev => prev.map(s => s.id === serviceId ? { ...s, assignedBarberId: newBarberId } : s));
    toast.info("Serviço transferido de profissional! Os saldos foram recalculados.");
  };

  // RECALCULO DINÂMICO DOS SALDOS VIA useMemo
  const auditSummaries = useMemo<BarberAuditSummary[]>(() => {
    if (barbers.length === 0) return [];

    const summariesMap: Record<string, BarberAuditSummary> = {};
    barbers.forEach(b => {
      const pct = b.percentual_comissao ?? (b as any).commission_percentage ?? 50;
      summariesMap[b.uid] = {
        uid: b.uid,
        name: b.nome || 'Barbeiro',
        commissionPercentage: pct,
        currentProduction: 0,
        currentCommission: 0,
        currentAdvances: 0,
        currentNet: 0,
        recalculatedProduction: 0,
        recalculatedCommission: 0,
        recalculatedAdvances: 0,
        recalculatedNet: 0,
        itemsCount: 0,
        advancesCount: 0,
        servicesList: [],
        advancesList: []
      };
    });

    // A. Mapear Valores Atuais no Firestore (com o bug)
    rawCommissions.forEach(comm => {
      const st = String(comm.status || '').toLowerCase();
      if (st === 'cancelado' || st === 'cancelada' || st === 'estornado' || st === 'estornada') return;
      const pId = comm.profissional_id || (comm as any).barbeiro_id;
      if (pId && summariesMap[pId]) {
        const base = Number(comm.base_value || (comm as any).amount || 0);
        const cVal = Number(comm.commission_value || 0);
        summariesMap[pId].currentProduction += base;
        summariesMap[pId].currentCommission += cVal;
      }
    });

    rawAdvances.forEach(adv => {
      if ((adv.status as string) === 'cancelado') return;
      const pId = adv.profissional_id || (adv as any).barber_id;
      if (pId && summariesMap[pId]) {
        summariesMap[pId].currentAdvances += Number(adv.amount || 0);
      }
    });

    // B. RECALCULAR PRODUÇÃO REAL E COMISSÕES BASEADOS NO SERVICES STATE (MANUALMENTE EDITÁVEL)
    servicesState.forEach(service => {
      const pId = service.assignedBarberId;
      if (pId && summariesMap[pId]) {
        summariesMap[pId].recalculatedProduction += service.value;
        summariesMap[pId].recalculatedCommission += service.commissionValue;
        summariesMap[pId].itemsCount += 1;
        summariesMap[pId].servicesList.push({
          id: service.id,
          comandaNumber: service.comandaNumber,
          date: service.date,
          clientName: service.clientName,
          description: service.description,
          value: service.value,
          commissionValue: service.commissionValue,
          originalBarber: service.originalBarberName
        });
      }
    });

    // C. Mapear Vales Reatribuídos do ValesState
    valesState.forEach(vale => {
      const pId = vale.assignedBarberId;
      if (pId && summariesMap[pId]) {
        summariesMap[pId].recalculatedAdvances += vale.amount;
        summariesMap[pId].advancesCount += 1;
        summariesMap[pId].advancesList.push({
          id: vale.id,
          date: vale.date,
          description: vale.description,
          amount: vale.amount,
          currentAssignedName: vale.currentAssignedName || 'Desconhecido',
          detectedReason: vale.detectedReason || 'Atribuição'
        });
      }
    });

    // D. Calcular saldos líquidos (permite saldos negativos de forma real e transparente)
    return Object.values(summariesMap).map(s => {
      s.currentNet = s.currentCommission - s.currentAdvances;
      s.recalculatedNet = s.recalculatedCommission - s.recalculatedAdvances;
      return s;
    });
  }, [barbers, rawCommissions, rawAdvances, servicesState, valesState]);

  const runAudit = async () => {
    setLoading(true);
    setAnalyzing(true);
    try {
      const activeTenant = tenantId || 'gbcortes7';
      const tenantConstraints = activeTenant === 'gbcortes7' 
        ? [where('tenantId', 'in', [activeTenant, ''])]
        : [where('tenantId', '==', activeTenant)];

      // 1. Carregar Barbeiros do Tenant
      const usersSnap = await getDocs(query(collection(db, 'usuarios'), ...tenantConstraints));
      const allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
      const activeBarbers = allUsers.filter(u => u.tipo === 'barbeiro' || u.tipo === 'admin' || (u as any).is_barber);
      setBarbers(activeBarbers);

      // 2. Carregar Comandas do período (01/09 a 16/09)
      const comandasSnap = await getDocs(query(collection(db, 'comandas'), ...tenantConstraints));
      const allComandasRaw = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comanda));
      
      const periodComandas = allComandasRaw.filter(c => {
        const rawDate = c.date || (c.closedAt ? new Date((c.closedAt as any).seconds * 1000).toISOString().split('T')[0] : '') || '';
        const d = normalizeToYYYYMMDD(rawDate);
        return d >= startDate && d <= endDate;
      });
      setTotalComandasAnalyzed(periodComandas.length);

      // Identificar comandas do fluxo que ficaram com status 'aberta' mas foram pagas/concluídas
      const identifiedOpenComandas: OpenFlowComanda[] = [];
      periodComandas.forEach(c => {
        const st = (c.status || '').toLowerCase();
        const payments = (c as any).payments || [];
        const hasPaymentRecorded = payments.length > 0;
        const paidAmount = Number(c.paidAmount || (c as any).valorPago || 0);
        const hasDailyFlow = Boolean((c as any).daily_flow_id || (c as any).dailyFlowId);

        if (st === 'aberta' && (hasPaymentRecorded || paidAmount > 0 || hasDailyFlow)) {
          identifiedOpenComandas.push({
            id: c.id,
            number: c.number || 'S/N',
            clientName: c.cliente_name || 'Consumidor',
            barberName: c.profissional_name || (c as any).barbeiro_nome || 'Não definido',
            date: normalizeToYYYYMMDD(c.date || ''),
            totalAmount: c.totalAmount || 0,
            paidAmount,
            hasPayments: hasPaymentRecorded,
            status: st,
            dailyFlowId: (c as any).daily_flow_id || (c as any).dailyFlowId,
            itemsCount: (c.items || []).length
          });
        }
      });
      setOpenFlowComandas(identifiedOpenComandas);

      // 3. Carregar Comissões registradas no Firestore do período (com filtro in-memory flexível)
      const commsSnap = await getDocs(collection(db, 'commissions'));
      const allCommissions = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Commission));
      const periodCommissions = allCommissions.filter(c => {
        const tId = c.tenantId || '';
        if (tId && tId !== activeTenant) return false;
        const d = normalizeToYYYYMMDD(c.date || '');
        return d >= startDate && d <= endDate;
      });
      setTotalCommissionsAnalyzed(periodCommissions.length);

      // 4. Carregar Vales / Adiantamentos no Firestore do período (com filtro flexível)
      const advSnap = await getDocs(collection(db, 'professional_advances'));
      const allAdvances = advSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfessionalAdvance));
      const periodAdvances = allAdvances.filter(a => {
        const tId = a.tenantId || '';
        if (tId && tId !== activeTenant) return false;
        const d = normalizeToYYYYMMDD(a.date || '');
        return d >= startDate && d <= endDate;
      });

      // 5. Carregar Sangrias do Caixa no período (para cruzar com vales digitados)
      const cashSnap = await getDocs(collection(db, 'cash_movements'));
      const allCashMovs = cashSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const periodCashVales = allCashMovs.filter(m => {
        const tId = m.tenantId || m.tenant_id || '';
        if (tId && tId !== activeTenant) return false;
        const d = normalizeToYYYYMMDD(m.date || '');
        if (d < startDate || d > endDate) return false;
        const cat = (m.category || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        const isVale = cat.includes('vale') || cat.includes('adiantamento') || desc.includes('vale') || desc.includes('adiantamento');
        const isRepasse = cat.includes('repasse') || desc.includes('repasse');
        return isVale && !isRepasse;
      });

      // 5b. Carregar Lançamentos do Financeiro (financial_transactions)
      const finSnap = await getDocs(collection(db, 'financial_transactions'));
      const allFinTxs = finSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const periodFinVales = allFinTxs.filter(t => {
        const tId = t.tenantId || t.tenant_id || '';
        if (tId && tId !== activeTenant) return false;
        const d = normalizeToYYYYMMDD(t.date || '');
        if (d < startDate || d > endDate) return false;
        const desc = (t.description || '').toLowerCase();
        const cat = (t.category || '').toLowerCase();
        const isRepasse = desc.includes('repasse') || desc.includes('payout') || desc.includes('pagamento de comiss');
        const isVale = (desc.includes('vale') || desc.includes('adiantamento') || cat.includes('vale') || cat.includes('adiantamento')) && !isRepasse;
        return isVale;
      });

      setTotalAdvancesAnalyzed(periodAdvances.length + periodCashVales.length + periodFinVales.length);

      // 6. MAPEAR PRODUÇÃO E COMISSÃO REAL POR ITEM DE COMANDA
      // Consideramos comandas fechadas + as comandas abertas que tinham pagamentos/fluxo
      const validComandas = periodComandas.filter(c => {
        const st = (c.status || '').toLowerCase();
        const isClosed = st === 'fechada' || st === 'paga' || st === 'concluido' || st === 'finalizada';
        const isOpenWithPay = st === 'aberta' && (Number(c.paidAmount || 0) > 0 || (c.payments && c.payments.length > 0));
        return isClosed || isOpenWithPay;
      });

      const extractedServicesList: Array<{
        id: string;
        comandaId: string;
        itemIndex: number;
        comandaNumber: string;
        date: string;
        clientName: string;
        description: string;
        value: number;
        commissionValue: number;
        assignedBarberId: string;
        originalBarberName: string;
      }> = [];

      validComandas.forEach(comanda => {
        const cDate = (comanda.date || '').substring(0, 10);
        const cNumber = comanda.number || 'S/N';
        const cClient = comanda.cliente_name || 'Cliente';
        const items = comanda.items || (comanda as any).services || [];

        items.forEach((item: any, itemIdx: number) => {
          let matchedBarber: UserProfile | null = null;
          const itemProId = item.profissional_id || item.barbeiro_id || comanda.profissional_id;
          const itemProName = item.profissional_name || item.barbeiro_nome || comanda.profissional_name || '';

          if (itemProId) {
            matchedBarber = activeBarbers.find(b => b.uid === itemProId) || null;
          }
          if (!matchedBarber && itemProName) {
            matchedBarber = detectBarberForText(itemProName, activeBarbers);
          }
          if (!matchedBarber && comanda.profissional_name) {
            matchedBarber = detectBarberForText(comanda.profissional_name, activeBarbers);
          }

          const isCortesia = item.isCortesia === true || item.isCortesia === 'true';
          const deductType = item.deductType || '';
          const generateCommission = item.generateCommission !== false && item.generateCommission !== 'false';

          let base_value = 0;
          if (isCortesia) {
            if (deductType === 'pacote' && item.packageUnitPrice !== undefined && item.packageUnitPrice !== null) {
              base_value = Number(item.packageUnitPrice);
            } else {
              base_value = 0;
            }
          } else {
            base_value = Number(item.totalPrice !== undefined && item.totalPrice !== null ? item.totalPrice : (item.price || item.unitPrice || 0));
          }

          let commVal = 0;
          if (!generateCommission || (isCortesia && deductType !== 'pacote' && item.generateCommission !== true)) {
            commVal = 0;
          } else {
            const itemCommValue = item.commission_value !== undefined ? item.commission_value : item.commissionValue;
            const itemCommPercentage = item.commission_percentage !== undefined ? item.commission_percentage : item.percentual;

            if (itemCommValue !== undefined && itemCommValue !== null && !isNaN(Number(itemCommValue))) {
              commVal = Number(itemCommValue);
            } else if (itemCommPercentage !== undefined && itemCommPercentage !== null && !isNaN(Number(itemCommPercentage))) {
              commVal = base_value * (Number(itemCommPercentage) / 100);
            } else {
              const isProduct = item.type === 'produto' || item.type === 'product' || (item.name || '').toLowerCase().includes('produto');
              const isSobrancelha = (item.name || '').toLowerCase().includes('sobrancelha');
              
              const bForPct = matchedBarber || activeBarbers[0];
              let commPct = 50;
              if (bForPct) {
                commPct = bForPct.percentual_comissao ?? (bForPct as any).commission_percentage ?? 50;
                if (isProduct) commPct = bForPct.percentual_produto || 30;
              }
              if (isSobrancelha) commPct = 25;

              commVal = (base_value * commPct) / 100;
            }
          }

          commVal = Number(Number(commVal).toFixed(2));

          const existingComm = periodCommissions.find(c => {
            return c.comanda_number === cNumber && normalizeStr(c.servico_name || '') === normalizeStr(item.name || 'Serviço');
          });

          const finalCommissionValue = existingComm && existingComm.commission_value !== undefined && existingComm.commission_value !== null
            ? Number(existingComm.commission_value)
            : commVal;

          const finalBarberId = existingComm && existingComm.profissional_id
            ? existingComm.profissional_id
            : (matchedBarber ? matchedBarber.uid : (itemProId || comanda.profissional_id || ''));

          extractedServicesList.push({
            id: `${comanda.id}-${itemIdx}`,
            comandaId: comanda.id,
            itemIndex: itemIdx,
            comandaNumber: cNumber,
            date: cDate,
            clientName: cClient,
            description: item.name || 'Serviço',
            value: base_value,
            commissionValue: finalCommissionValue,
            assignedBarberId: finalBarberId,
            originalBarberName: itemProName || comanda.profissional_name || 'Desconhecido'
          });
        });
      });

      setServicesState(extractedServicesList);

      // C. RECALCULAR VALES REAIS (PELA DESCRIÇÃO / SANGRIA)
      const allPotentialVales: Array<{ id: string; date: string; description: string; amount: number; currentAssignedId: string; currentAssignedName: string; source: string }> = [];

      periodAdvances.forEach(adv => {
        allPotentialVales.push({
          id: adv.id,
          date: (adv.date || '').substring(0, 10),
          description: adv.description || 'Adiantamento',
          amount: Number(adv.amount || 0),
          currentAssignedId: adv.profissional_id || '',
          currentAssignedName: adv.profissional_name || 'Desconhecido',
          source: 'professional_advances'
        });
      });

      // Adicionar sangrias do caixa que não estejam duplicadas
      periodCashVales.forEach(cm => {
        const isDup = allPotentialVales.some(v => Math.abs(v.amount - cm.amount) < 0.01 && v.date === cm.date);
        if (!isDup) {
          allPotentialVales.push({
            id: cm.id,
            date: (cm.date || '').substring(0, 10),
            description: cm.description || 'Sangria Vale',
            amount: Number(cm.amount || 0),
            currentAssignedId: cm.profissional_id || '',
            currentAssignedName: cm.profissional_name || 'Caixa',
            source: 'cash_movements'
          });
        }
      });

      // Adicionar transações financeiras que não estejam duplicadas
      periodFinVales.forEach(ft => {
        const ftDate = (ft.date || '').substring(0, 10);
        const ftAmount = Number(ft.amount || 0);
        const isDup = allPotentialVales.some(v => v.id === ft.id || (Math.abs(v.amount - ftAmount) < 0.01 && v.date === ftDate));
        if (!isDup) {
          allPotentialVales.push({
            id: ft.id,
            date: ftDate,
            description: ft.description || 'Vale Financeiro',
            amount: ftAmount,
            currentAssignedId: ft.profissional_id || ft.barber_id || '',
            currentAssignedName: ft.profissional_name || 'Profissional',
            source: 'financial_transactions'
          });
        }
      });

      const resolvedValesList = allPotentialVales.map(vale => {
        let targetBarber: UserProfile | null = detectBarberForText(vale.description, activeBarbers);
        let detectedReason = '';

        if (targetBarber) {
          detectedReason = `Detectado pelo texto: "${vale.description}"`;
        } else if (vale.currentAssignedId) {
          targetBarber = activeBarbers.find(b => b.uid === vale.currentAssignedId) || null;
          detectedReason = `Atribuído pelo ID original`;
        } else if (vale.currentAssignedName) {
          targetBarber = detectBarberForText(vale.currentAssignedName, activeBarbers);
          detectedReason = `Detectado pelo nome registrado: "${vale.currentAssignedName}"`;
        }

        return {
          id: vale.id,
          date: vale.date,
          description: vale.description,
          amount: vale.amount,
          assignedBarberId: targetBarber ? targetBarber.uid : '',
          source: vale.source,
          currentAssignedName: vale.currentAssignedName,
          detectedReason: detectedReason || 'Sem detecção automática (Ajuste abaixo)'
        };
      });

      setValesState(resolvedValesList);
      setRawCommissions(periodCommissions);
      setRawAdvances(periodAdvances);
      setRawValidComandas(validComandas);

    } catch (err) {
      console.error("Erro ao executar auditoria de comissões:", err);
      toast.error("Erro ao cruzar dados para auditoria.");
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const handleApplyFix = async () => {
    setApplying(true);
    try {
      const activeTenant = tenantId || 'gbcortes7';
      let batch = writeBatch(db);
      let opsCount = 0;

      const commitBatchIfNeeded = async () => {
        opsCount++;
        if (opsCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opsCount = 0;
        }
      };

      // 1. Fechar comandas abertas do fluxo que tinham pagamentos ou foram concluídas
      for (const openCmd of openFlowComandas) {
        const cmdRef = doc(db, 'comandas', openCmd.id);
        batch.update(cmdRef, {
          status: 'fechada',
          closedAt: serverTimestamp(),
          notes: `[Fechamento auditado do Fluxo 01-16/Setembro]`
        });
        await commitBatchIfNeeded();
      }

      // Preparar mapa para atualizar comandas em lote (suporta items e services de forma segura e síncrona)
      const comandasToUpdate: Record<string, { ref: any, items: any[] | null, services: any[] | null }> = {};

      // Pre-carregar todas as comissões registradas no Firestore do período de uma só vez para evitar queries em loops
      const commsSnap = await getDocs(query(
        collection(db, 'commissions'),
        where('tenantId', 'in', [activeTenant, ''])
      ));
      const commissionsDocs = commsSnap.docs.map(d => ({
        ref: d.ref,
        id: d.id,
        data: d.data() as Commission
      }));

      // 2. Corrigir comissões existentes e gerar faltantes conforme as edições do usuário no servicesState
      for (const srv of servicesState) {
        if (!srv.assignedBarberId) continue;
        const targetBarber = barbers.find(b => b.uid === srv.assignedBarberId);
        if (!targetBarber) continue;

        // Atualizar também o item de serviço correspondente na comanda em lote (suporta ambas as estruturas e todos os sinônimos)
        const targetComanda = rawValidComandas.find(c => c.id === srv.comandaId);
        if (targetComanda) {
          if (!comandasToUpdate[targetComanda.id]) {
            comandasToUpdate[targetComanda.id] = {
              ref: doc(db, 'comandas', targetComanda.id),
              items: targetComanda.items ? JSON.parse(JSON.stringify(targetComanda.items)) : null,
              services: (targetComanda as any).services ? JSON.parse(JSON.stringify((targetComanda as any).services)) : null
            };
          }
          
          const cUpdate = comandasToUpdate[targetComanda.id];
          const updateItemFields = (item: any) => {
            if (!item) return;
            item.profissional_id = targetBarber.uid;
            item.profissional_name = targetBarber.nome;
            item.barber_id = targetBarber.uid;
            item.barbeiro_id = targetBarber.uid;
            item.barber_name = targetBarber.nome;
            item.barbeiro_nome = targetBarber.nome;
            item.commission_value = srv.commissionValue;
            item.commissionValue = srv.commissionValue;
          };

          if (cUpdate.items && cUpdate.items[srv.itemIndex]) {
            updateItemFields(cUpdate.items[srv.itemIndex]);
          }
          if (cUpdate.services && cUpdate.services[srv.itemIndex]) {
            updateItemFields(cUpdate.services[srv.itemIndex]);
          }
        }

        // Procurar comissão existente na lista em memória usando critérios cruzados altamente seguros (id da comanda ou número)
        const matchDoc = commissionsDocs.find(c => {
          const isSameComanda = (c.data.comanda_id && c.data.comanda_id === srv.comandaId) || 
                                (c.data.comanda_number && c.data.comanda_number === srv.comandaNumber);
          return isSameComanda && normalizeStr(c.data.servico_name || '') === normalizeStr(srv.description || '');
        });

        if (matchDoc) {
          batch.update(matchDoc.ref, {
            profissional_id: targetBarber.uid,
            profissional_name: targetBarber.nome,
            barber_id: targetBarber.uid,
            barbeiro_id: targetBarber.uid,
            barber_name: targetBarber.nome,
            barbeiro_nome: targetBarber.nome,
            base_value: srv.value,
            commission_value: srv.commissionValue,
            status: 'pendente',
            updatedAt: serverTimestamp()
          });
          await commitBatchIfNeeded();
        } else {
          // Se não houver comissão gravada no banco para esse item, geramos uma de forma explícita (mesmo se for 0, garantindo o respeito absoluto ao valor editado)
          const newCommRef = doc(collection(db, 'commissions'));
          batch.set(newCommRef, {
            tenantId: activeTenant,
            comanda_id: srv.comandaId,
            comanda_number: srv.comandaNumber,
            profissional_id: targetBarber.uid,
            profissional_name: targetBarber.nome,
            barber_id: targetBarber.uid,
            barbeiro_id: targetBarber.uid,
            barber_name: targetBarber.nome,
            barbeiro_nome: targetBarber.nome,
            servico_name: srv.description,
            base_value: srv.value,
            commission_percentage: 50,
            commission_value: srv.commissionValue,
            status: 'pendente',
            commission_type: 'servico',
            date: srv.date,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          await commitBatchIfNeeded();
        }
      }

      // 2b. Gravar as comandas atualizadas no Firestore
      for (const [cId, updateInfo] of Object.entries(comandasToUpdate)) {
        const updateFields: any = { updatedAt: serverTimestamp() };
        if (updateInfo.items) {
          updateFields.items = updateInfo.items;
        }
        if (updateInfo.services) {
          updateFields.services = updateInfo.services;
        }
        batch.update(updateInfo.ref, updateFields);
        await commitBatchIfNeeded();
      }

      // 3. Corrigir Vales / Adiantamentos conforme a escolha manual final do usuário no valesState
      for (const vale of valesState) {
        if (!vale.assignedBarberId) continue;
        const targetBarber = barbers.find(b => b.uid === vale.assignedBarberId);
        if (!targetBarber) continue;

        if (vale.source === 'professional_advances') {
          try {
            const advRef = doc(db, 'professional_advances', vale.id);
            batch.update(advRef, {
              profissional_id: targetBarber.uid,
              profissional_name: targetBarber.nome,
              updatedAt: serverTimestamp()
            });
            await commitBatchIfNeeded();
          } catch (_) {}
        } else if (vale.source === 'cash_movements') {
          try {
            const cashRef = doc(db, 'cash_movements', vale.id);
            batch.update(cashRef, {
              profissional_id: targetBarber.uid,
              profissional_name: targetBarber.nome,
              updatedAt: serverTimestamp()
            });
            await commitBatchIfNeeded();
          } catch (_) {}
        } else if (vale.source === 'financial_transactions') {
          try {
            const finRef = doc(db, 'financial_transactions', vale.id);
            batch.update(finRef, {
              profissional_id: targetBarber.uid,
              profissional_name: targetBarber.nome,
              updatedAt: serverTimestamp()
            });
            await commitBatchIfNeeded();
          } catch (_) {}
        }
      }

      if (opsCount > 0) {
        await batch.commit();
      }

      toast.success("Reconciliação aplicada diretamente no banco com sucesso! Os valores de todos os profissionais foram atualizados.");
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Erro ao aplicar correções:", err);
      toast.error("Houve uma falha ao gravar as alterações.");
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-white">Auditoria & Recuperação Cirúrgica de Comissões</h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                  Período: 01/09 a 16/09
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Modo Simulação Ativo: Nenhum dado é alterado sem sua confirmação expressa.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* Quick Metrics of Audit */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Comandas no Período</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{totalComandasAnalyzed}</span>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5 block">01/09 até 16/09</span>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 shadow-xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Comandas Abertas do Fluxo</span>
              <span className="text-xl font-black text-amber-900 mt-1 block">{openFlowComandas.length}</span>
              <span className="text-[10px] font-bold text-amber-600 mt-0.5 block">Concluídas mas sem baixa</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Comissões Analisadas</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{totalCommissionsAnalyzed}</span>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5 block">Itens e serviços</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Vales & Sangrias</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">{totalAdvancesAnalyzed}</span>
              <span className="text-[10px] font-bold text-slate-400 mt-0.5 block">Identificados por texto</span>
            </div>
          </div>

          {/* Comandas Abertas do Fluxo Section */}
          {openFlowComandas.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <span className="text-xs font-black uppercase tracking-wider">
                    {openFlowComandas.length} Comandas Concluídas no Fluxo Permanecem como Abertas
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOpenComandas(!showOpenComandas)}
                  className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                >
                  {showOpenComandas ? 'Ocultar Detalhes' : 'Ver Comandas'}
                </button>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Essas comandas tiveram atendimento concluído ou pagamento recebido, mas o status continuou como "aberta". Por segurança, o sistema escondeu as comissões delas do razão. Na recuperação, todas serão baixadas e a produção voltará ao barbeiro.
              </p>
              {showOpenComandas && (
                <div className="max-h-48 overflow-y-auto space-y-1.5 pt-2 border-t border-amber-200">
                  {openFlowComandas.map(cmd => (
                    <div key={cmd.id} className="flex items-center justify-between p-2 rounded-xl bg-white/80 border border-amber-200/60 text-xs">
                      <span className="font-bold text-slate-800">Comanda #{cmd.number} - {cmd.clientName}</span>
                      <span className="text-slate-500">{cmd.date} | Barbeiro: <strong>{cmd.barberName}</strong></span>
                      <span className="font-black text-emerald-700">{formatCurrency(cmd.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Espelho de Comparação por Profissional</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Mostrando valores Atuais (com erro) vs Valores Reais Recalculados (01/09 a 16/09)</p>
              </div>
              <button
                type="button"
                onClick={runAudit}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
              >
                <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
                Recarregar Simulação
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center space-y-3">
                <RefreshCw size={28} className="animate-spin text-blue-600 mx-auto" />
                <p className="text-xs font-bold text-slate-600">Auditando comandas, itens de serviço e sangrias de caixa...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500">
                    <tr>
                      <th className="p-3.5">Profissional</th>
                      <th className="p-3.5">Produção Real (vs Atual)</th>
                      <th className="p-3.5">Comissão Real (vs Atual)</th>
                      <th className="p-3.5">Vales Reais (vs Atual)</th>
                      <th className="p-3.5">Líquido a Pagar Real</th>
                      <th className="p-3.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditSummaries.map(s => {
                      const isExpanded = expandedBarber === s.uid;
                      const hasProductionDiff = Math.abs(s.recalculatedProduction - s.currentProduction) > 0.01;
                      const hasCommissionDiff = Math.abs(s.recalculatedCommission - s.currentCommission) > 0.01;
                      const hasAdvancesDiff = Math.abs(s.recalculatedAdvances - s.currentAdvances) > 0.01;

                      return (
                        <React.Fragment key={s.uid}>
                          <tr className={`hover:bg-slate-50/80 transition-colors ${hasCommissionDiff ? 'bg-amber-50/20' : ''}`}>
                            <td className="p-3.5">
                              <div className="font-black text-slate-900 flex items-center gap-1.5">
                                <User size={13} className="text-slate-400" />
                                {s.name}
                              </div>
                              <span className="text-[10px] text-slate-400 font-bold">
                                {s.commissionPercentage}% comissão | {s.itemsCount} itens
                              </span>
                            </td>

                            <td className="p-3.5">
                              <span className="font-bold text-slate-900 block">{formatCurrency(s.recalculatedProduction)}</span>
                              {hasProductionDiff && (
                                <span className="text-[10px] text-red-600 font-bold block line-through">
                                  Atual: {formatCurrency(s.currentProduction)}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5">
                              <span className="font-black text-blue-600 block">{formatCurrency(s.recalculatedCommission)}</span>
                              {hasCommissionDiff && (
                                <span className="text-[10px] text-red-600 font-bold block line-through">
                                  Atual: {formatCurrency(s.currentCommission)}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5">
                              <span className="font-bold text-amber-700 block">{formatCurrency(s.recalculatedAdvances)}</span>
                              {hasAdvancesDiff && (
                                <span className="text-[10px] text-red-600 font-bold block line-through">
                                  Atual: {formatCurrency(s.currentAdvances)}
                                </span>
                              )}
                            </td>

                            <td className="p-3.5 font-black text-emerald-700 text-sm">
                              {formatCurrency(s.recalculatedNet)}
                            </td>

                            <td className="p-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => setExpandedBarber(isExpanded ? null : s.uid)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                              >
                                {isExpanded ? 'Recolher' : 'Ver Cortes/Vales'}
                              </button>
                            </td>
                          </tr>

                          {/* Accordion Detail */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="bg-slate-50 p-4 border-b border-slate-200">
                                <div className="space-y-4">
                                  {/* Services list */}
                                  <div>
                                    <h4 className="text-[11px] font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                                      <Scissors size={12} className="text-blue-500" />
                                      Cortes e Serviços de {s.name} ({s.servicesList.length} lançamentos)
                                    </h4>
                                    {s.servicesList.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">Nenhum serviço identificado no período.</p>
                                    ) : (
                                      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                                        {s.servicesList.map((srv, idx) => (
                                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs gap-3 shadow-xs">
                                            <div className="flex-1">
                                              <div className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                                                Comanda #{srv.comandaNumber} • {srv.clientName}
                                              </div>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 mt-1">
                                                <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                  {srv.description}
                                                </span>
                                                <span className="text-slate-400">Faturamento: {formatCurrency(srv.value)}</span>
                                                <span className="text-slate-400">• {srv.date}</span>
                                              </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3.5 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 justify-between sm:justify-end">
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-400 font-bold">Comissão:</span>
                                                <div className="flex items-center gap-1">
                                                  <span className="text-[10px] text-slate-400 font-bold">R$</span>
                                                  <input
                                                    type="number"
                                                    step="0.1"
                                                    value={srv.commissionValue}
                                                    onChange={(e) => handleServiceCommissionChange(srv.id || '', parseFloat(e.target.value))}
                                                    className="w-16 bg-slate-100 focus:bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-black text-blue-700 text-center focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                  />
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-400 font-bold">Profissional:</span>
                                                <select
                                                  value={s.uid}
                                                  onChange={(e) => handleServiceBarberChange(srv.id || '', e.target.value)}
                                                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1 px-2 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer transition-all"
                                                >
                                                  {barbers.map(b => (
                                                    <option key={b.uid} value={b.uid}>
                                                      {b.nome}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Advances list */}
                                  <div>
                                    <h4 className="text-[11px] font-black uppercase text-slate-700 mb-2 flex items-center gap-1.5">
                                      <DollarSign size={12} className="text-amber-500" />
                                      Vales e Sangrias Identificados para {s.name} ({s.advancesList.length} lançamentos)
                                    </h4>
                                    {s.advancesList.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic">Nenhum vale identificado no período.</p>
                                    ) : (
                                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                        {s.advancesList.map((adv, idx) => (
                                          <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white border border-slate-200 text-xs gap-3 shadow-xs">
                                            <div className="flex-1">
                                              <div className="font-black text-slate-800 text-sm flex items-center gap-1.5 mb-0.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                                                {adv.description}
                                              </div>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 mt-1">
                                                <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                                  Origem: {adv.currentAssignedName || 'Desconhecido'}
                                                </span>
                                                <span className="text-slate-400">{adv.detectedReason}</span>
                                                <span className="text-slate-400">• {adv.date}</span>
                                              </div>
                                            </div>
                                            
                                            <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                                              <span className="font-black text-amber-700 text-sm">{formatCurrency(adv.amount)}</span>
                                              
                                              <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] text-slate-400 font-bold">Responsável:</span>
                                                <select
                                                  value={s.uid}
                                                  onChange={(e) => handleValeReassign(adv.id, e.target.value)}
                                                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-1.5 px-3 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer transition-all"
                                                >
                                                  {barbers.map(b => (
                                                    <option key={b.uid} value={b.uid}>
                                                      {b.nome}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-white border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Ao confirmar, os registros de 01 a 16 de setembro serão atualizados no banco para refletir com exatidão a produção de cada cadeira.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Fechar Simulação
            </button>
            <button
              type="button"
              disabled={loading || applying}
              onClick={() => setShowConfirmModal(true)}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {applying ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Gravando Correções no Banco...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>Confirmar e Gravar Correções (01 a 16/09)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Safe Custom Confirmation Dialog (100% iFrame friendly) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full shadow-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mx-auto mb-4 animate-bounce">
              <AlertTriangle size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">Confirmação de Segurança</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Deseja realmente aplicar a reconciliação cirúrgica de 01 a 16 de setembro no banco de dados?
              As comandas abertas identificadas serão fechadas e os vales/comissões editados serão salvos de forma permanente para os profissionais corretos.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleApplyFix();
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition-colors cursor-pointer"
              >
                Confirmar e Gravar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
