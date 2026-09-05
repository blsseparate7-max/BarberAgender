import { 
  collection, 
  query, 
  where, 
  getDocs, 
  setDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  increment,
  runTransaction,
  serverTimestamp,
  limit,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { LoyaltyConfig, LoyaltyPoints, LoyaltyHistory, LoyaltyVoucher, Service, Product } from '../types';
import { format } from 'date-fns';
import { getActiveTenantId } from './tenantService';

const CONFIG_COLLECTION = 'loyalty_config';
const POINTS_COLLECTION = 'loyalty_points';
const HISTORY_COLLECTION = 'loyalty_history';
const VOUCHERS_COLLECTION = 'loyalty_vouchers';

export const loyaltyService = {
  async getConfig() {
    const tenantId = getActiveTenantId() || 'gbcortes7';
    const docRef = doc(db, CONFIG_COLLECTION, tenantId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      // Fallback: check by query for legacy docs
      const q = query(collection(db, CONFIG_COLLECTION), where('tenantId', '==', tenantId), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const legacyDoc = querySnapshot.docs[0];
        return { id: legacyDoc.id, ...legacyDoc.data() } as LoyaltyConfig;
      }

      // Create default config if not exists
      const defaultConfig = {
        tenantId,
        loyaltyMode: 'saldo',
        minRedemptionValue: 10,
        cashbackEnabled: true,
        cashbackType: 'percentual',
        cashbackFixedValue: 5,
        pointsPerReal: 1,
        pointsPerAppointment: 10,
        cashbackPercentage: 5,
        minRedemptionPoints: 100,
        vipThreshold: 1000,
        updatedAt: new Date()
      };
      try {
        await setDoc(docRef, { ...defaultConfig, updatedAt: serverTimestamp() });
        return { id: tenantId, ...defaultConfig } as unknown as LoyaltyConfig;
      } catch (err) {
        console.warn("Could not persist default loyalty config:", err);
        return { id: tenantId, ...defaultConfig } as unknown as LoyaltyConfig;
      }
    }

    return { id: docSnap.id, ...docSnap.data() } as LoyaltyConfig;
  },

  async updateConfig(id: string, data: Partial<LoyaltyConfig>) {
    const tenantId = getActiveTenantId() || 'gbcortes7';
    const targetId = (id && id !== 'temp-loyalty-config') ? id : tenantId;
    const docRef = doc(db, CONFIG_COLLECTION, targetId);
    await setDoc(docRef, {
      tenantId,
      ...data,
      updatedAt: serverTimestamp()
    }, { merge: true });
  },

  async getClientPoints(cliente_id: string) {
    const docId = `${getActiveTenantId()}_${cliente_id}`;
    const docRef = doc(db, POINTS_COLLECTION, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as LoyaltyPoints;
    }
    // Return default if not exists
    return {
      cliente_id,
      tenantId: getActiveTenantId(),
      points: 0,
      cashback: 0,
      isVip: false,
      updatedAt: new Date()
    } as unknown as LoyaltyPoints;
  },

  async addPoints(cliente_id: string, amount: number, value: number, description: string, source: LoyaltyHistory['source']) {
    const config = await this.getConfig();
    const activeTenantId = getActiveTenantId();

    // Check if points for this description were already credited to prevent duplicate credit
    if (description && description.includes('Comanda')) {
      try {
        const historyCheckQuery = query(
          collection(db, HISTORY_COLLECTION),
          where('tenantId', '==', activeTenantId),
          where('cliente_id', '==', cliente_id),
          where('description', '==', description),
          limit(1)
        );
        const historyCheckSnap = await getDocs(historyCheckQuery);
        if (!historyCheckSnap.empty) {
          console.log(`[Loyalty] Points for "${description}" already credited to client ${cliente_id}. Skipping.`);
          return { points: 0, cashback: 0 };
        }
      } catch (checkErr) {
        console.warn("[Loyalty] Error checking existing history:", checkErr);
      }
    }

    return await runTransaction(db, async (transaction) => {
      const docId = `${activeTenantId}_${cliente_id}`;
      const pointsRef = doc(db, POINTS_COLLECTION, docId);
      const userRef = doc(db, 'usuarios', cliente_id);
      
      // Perform all reads first
      const pointsSnap = await transaction.get(pointsRef);
      const userSnap = await transaction.get(userRef);
      
      let currentPoints = 0;
      let currentCashback = 0;
      
      if (pointsSnap.exists()) {
        const data = pointsSnap.data() as LoyaltyPoints;
        currentPoints = data.points;
        currentCashback = data.cashback;
      }

      let pointsToAdd = 0;
      let cashbackToAdd = 0;
      const isEnabled = config.cashbackEnabled !== false;
      const mode = config.loyaltyMode || 'saldo';

      if (isEnabled) {
        if (mode === 'pontos') {
          // Calculation for Points mode
          const pointsPerReal = Number(config.pointsPerReal) || 1;
          const pointsPerApp = Number(config.pointsPerAppointment) || 0;
          pointsToAdd = Math.floor(value * pointsPerReal) + (source === 'appointment' ? pointsPerApp : 0);
          if (amount > 0 && pointsToAdd === 0) pointsToAdd = amount; // fallback if direct points passed
        } else {
          // Calculation for Saldo / Cashback mode
          if (config.cashbackType === 'fixo') {
            cashbackToAdd = Number(config.cashbackFixedValue) || 0;
          } else {
            const pct = Number(config.cashbackPercentage) > 0 ? Number(config.cashbackPercentage) : 5;
            cashbackToAdd = (value * pct) / 100;
          }
          // Also credit points per appointment if configured
          const pointsPerApp = Number(config.pointsPerAppointment) || 0;
          if (source === 'appointment' && pointsPerApp > 0) {
            pointsToAdd = pointsPerApp;
          } else if (amount > 0) {
            pointsToAdd = amount;
          }
        }
      }

      const newPoints = currentPoints + pointsToAdd;
      const newCashback = currentCashback + cashbackToAdd;
      const isVip = (config.vipThreshold && newPoints >= config.vipThreshold) || false;

      // Perform all writes after reads
      transaction.set(pointsRef, {
        cliente_id,
        tenantId: activeTenantId,
        points: newPoints,
        cashback: newCashback,
        isVip,
        updatedAt: serverTimestamp()
      });

      if (userSnap.exists()) {
        transaction.update(userRef, {
          pontos: newPoints,
          points: newPoints,
          cashback: newCashback,
          updatedAt: serverTimestamp()
        });
      }

      const historyRef = doc(collection(db, HISTORY_COLLECTION));
      transaction.set(historyRef, {
        cliente_id,
        tenantId: activeTenantId,
        type: 'earn',
        source,
        points: pointsToAdd,
        cashback: cashbackToAdd,
        description,
        date: format(new Date(), 'yyyy-MM-dd'),
        createdAt: serverTimestamp()
      });

      return { points: pointsToAdd, cashback: cashbackToAdd };
    });
  },

  async redeemPoints(cliente_id: string, points: number, cashback: number, description: string) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const docId = `${activeTenantId}_${cliente_id}`;
      const pointsRef = doc(db, POINTS_COLLECTION, docId);
      const userRef = doc(db, 'usuarios', cliente_id);
      
      // Perform all reads first
      const pointsSnap = await transaction.get(pointsRef);
      const userSnap = await transaction.get(userRef);
      
      if (!pointsSnap.exists()) throw new Error("Cliente não possui pontos");
      const data = pointsSnap.data() as LoyaltyPoints;

      if (data.points < points) throw new Error("Pontos insuficientes");
      if (data.cashback < cashback) throw new Error("Cashback insuficiente");

      const newPoints = Math.max(0, data.points - points);
      const newCashback = Math.max(0, data.cashback - cashback);

      // Perform all writes after reads
      transaction.update(pointsRef, {
        points: newPoints,
        cashback: newCashback,
        updatedAt: serverTimestamp()
      });

      if (userSnap.exists()) {
        transaction.update(userRef, {
          pontos: newPoints,
          points: newPoints,
          cashback: newCashback,
          updatedAt: serverTimestamp()
        });
      }

      const historyRef = doc(collection(db, HISTORY_COLLECTION));
      transaction.set(historyRef, {
        cliente_id,
        tenantId: activeTenantId,
        type: 'redeem',
        source: 'manual',
        points,
        cashback,
        description,
        date: format(new Date(), 'yyyy-MM-dd'),
        createdAt: serverTimestamp()
      });
    });
  },

  async getHistory(cliente_id?: string) {
    let q = query(collection(db, HISTORY_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (cliente_id) {
      q = query(q, where('cliente_id', '==', cliente_id));
    }
    const querySnapshot = await getDocs(q);
    const history = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoyaltyHistory));
    return history.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  // Generate voucher token (e.g. FID-A7K2)
  generateToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = 'FID-';
    for (let i = 0; i < 4; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  },

  // Redeem points for an item (Service or Product) and create a usable voucher token
  async redeemRewardToken(params: {
    cliente_id: string;
    cliente_name: string;
    item_type: 'servico' | 'produto';
    item_id: string;
    item_name: string;
    points_spent: number;
  }): Promise<LoyaltyVoucher> {
    const activeTenantId = getActiveTenantId();
    const token = this.generateToken();

    return await runTransaction(db, async (transaction) => {
      const docId = `${activeTenantId}_${params.cliente_id}`;
      const pointsRef = doc(db, POINTS_COLLECTION, docId);
      const userRef = doc(db, 'usuarios', params.cliente_id);

      // Perform all reads first
      const pointsSnap = await transaction.get(pointsRef);
      const userSnap = await transaction.get(userRef);
      
      if (!pointsSnap.exists()) {
        throw new Error("Cliente não possui pontos acumulados.");
      }
      const data = pointsSnap.data() as LoyaltyPoints;

      if ((data.points || 0) < params.points_spent) {
        throw new Error(`Pontos insuficientes. Você possui ${data.points || 0} pts e são necessários ${params.points_spent} pts.`);
      }

      const newPoints = Math.max(0, (data.points || 0) - params.points_spent);

      // Perform all writes after reads
      transaction.update(pointsRef, {
        points: newPoints,
        updatedAt: serverTimestamp()
      });

      if (userSnap.exists()) {
        transaction.update(userRef, {
          pontos: newPoints,
          points: newPoints,
          updatedAt: serverTimestamp()
        });
      }

      // Record in loyalty history
      const historyRef = doc(collection(db, HISTORY_COLLECTION));
      transaction.set(historyRef, {
        cliente_id: params.cliente_id,
        tenantId: activeTenantId,
        type: 'redeem',
        source: 'manual',
        points: params.points_spent,
        cashback: 0,
        description: `Resgate do item: ${params.item_name} (Token: ${token})`,
        date: format(new Date(), 'yyyy-MM-dd'),
        createdAt: serverTimestamp()
      });

      // Create Voucher
      const voucherRef = doc(collection(db, VOUCHERS_COLLECTION));
      const voucherData: LoyaltyVoucher = {
        id: voucherRef.id,
        token,
        tenantId: activeTenantId,
        cliente_id: params.cliente_id,
        cliente_name: params.cliente_name,
        item_type: params.item_type,
        item_id: params.item_id,
        item_name: params.item_name,
        points_spent: params.points_spent,
        status: 'disponivel',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      transaction.set(voucherRef, {
        ...voucherData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return voucherData;
    });
  },

  // Get all vouchers for a client
  async getClientVouchers(cliente_id: string, status?: 'disponivel' | 'utilizado' | 'cancelado'): Promise<LoyaltyVoucher[]> {
    let q = query(
      collection(db, VOUCHERS_COLLECTION),
      where('tenantId', '==', getActiveTenantId()),
      where('cliente_id', '==', cliente_id)
    );
    if (status) {
      q = query(q, where('status', '==', status));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyVoucher));
  },

  // Find a voucher by token
  async getVoucherByToken(token: string): Promise<LoyaltyVoucher | null> {
    const formattedToken = token.trim().toUpperCase();
    const q = query(
      collection(db, VOUCHERS_COLLECTION),
      where('tenantId', '==', getActiveTenantId()),
      where('token', '==', formattedToken),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() } as LoyaltyVoucher;
  },

  // Mark voucher as used in Comanda
  async useVoucherInComanda(voucherId: string, comanda_id: string, comanda_number: string): Promise<void> {
    const voucherRef = doc(db, VOUCHERS_COLLECTION, voucherId);
    await updateDoc(voucherRef, {
      status: 'utilizado',
      comanda_id,
      comanda_number,
      usedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  },

  // Get all vouchers in the tenant (for Admin view)
  async getAllVouchers(): Promise<LoyaltyVoucher[]> {
    const q = query(
      collection(db, VOUCHERS_COLLECTION),
      where('tenantId', '==', getActiveTenantId())
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as LoyaltyVoucher)).sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  },

  async manualAdjustPoints(cliente_id: string, action: 'add' | 'remove' | 'set', type: 'points' | 'cashback', value: number, description: string) {
    const activeTenantId = getActiveTenantId();
    return await runTransaction(db, async (transaction) => {
      const docId = `${activeTenantId}_${cliente_id}`;
      const pointsRef = doc(db, POINTS_COLLECTION, docId);
      const userRef = doc(db, 'usuarios', cliente_id);

      // Perform all reads first
      const pointsSnap = await transaction.get(pointsRef);
      const userSnap = await transaction.get(userRef);

      let currentPoints = 0;
      let currentCashback = 0;

      if (pointsSnap.exists()) {
        const data = pointsSnap.data() as LoyaltyPoints;
        currentPoints = data.points || 0;
        currentCashback = data.cashback || 0;
      }

      let newPoints = currentPoints;
      let newCashback = currentCashback;

      let changePoints = 0;
      let changeCashback = 0;

      if (type === 'points') {
        if (action === 'add') {
          newPoints = currentPoints + value;
          changePoints = value;
        } else if (action === 'remove') {
          newPoints = Math.max(0, currentPoints - value);
          changePoints = -value;
        } else {
          newPoints = Math.max(0, value);
          changePoints = newPoints - currentPoints;
        }
      } else {
        if (action === 'add') {
          newCashback = currentCashback + value;
          changeCashback = value;
        } else if (action === 'remove') {
          newCashback = Math.max(0, currentCashback - value);
          changeCashback = -value;
        } else {
          newCashback = Math.max(0, value);
          changeCashback = newCashback - currentCashback;
        }
      }

      // Perform all writes after reads
      transaction.set(pointsRef, {
        cliente_id,
        tenantId: activeTenantId,
        points: newPoints,
        cashback: newCashback,
        updatedAt: serverTimestamp()
      }, { merge: true });

      if (userSnap.exists()) {
        transaction.update(userRef, {
          pontos: newPoints,
          points: newPoints,
          cashback: newCashback,
          updatedAt: serverTimestamp()
        });
      }

      // Record adjustment in history
      const historyRef = doc(collection(db, HISTORY_COLLECTION));
      transaction.set(historyRef, {
        cliente_id,
        tenantId: activeTenantId,
        type: action === 'add' ? 'earn' : action === 'remove' ? 'redeem' : 'adjust',
        source: 'manual',
        points: changePoints,
        cashback: changeCashback,
        description: description || 'Ajuste manual administrativo',
        date: format(new Date(), 'yyyy-MM-dd'),
        createdAt: serverTimestamp()
      });

      return { points: newPoints, cashback: newCashback };
    });
  },

  async syncRetroactiveLoyalty(tenantId: string) {
    // 1. Force config to Pontos mode
    const configRef = doc(db, CONFIG_COLLECTION, tenantId);
    let configSnap = await getDoc(configRef);
    if (!configSnap.exists() || configSnap.data()?.loyaltyMode !== 'pontos') {
      await setDoc(configRef, {
        tenantId,
        loyaltyMode: 'pontos',
        pointsPerReal: 1,
        pointsPerAppointment: 10,
        cashbackEnabled: true,
        cashbackType: 'percentual',
        cashbackPercentage: 5,
        cashbackFixedValue: 5,
        minRedemptionValue: 10,
        minRedemptionPoints: 100,
        vipThreshold: 1000,
        updatedAt: serverTimestamp()
      }, { merge: true });
      configSnap = await getDoc(configRef);
    }

    const config = (configSnap.data() || {}) as LoyaltyConfig;
    const pointsPerReal = Number(config.pointsPerReal) || 1;
    const pointsPerApp = Number(config.pointsPerAppointment) || 10;

    // 2. Fetch all existing loyalty_history records for this tenant
    const historyQuery = query(
      collection(db, HISTORY_COLLECTION),
      where('tenantId', '==', tenantId),
      limit(1000)
    );
    const historySnap = await getDocs(historyQuery);
    
    // Distinguish manual/redemption entries from automatic comanda/tx entries
    const manualDocs: { cliente_id: string; points: number; cashback: number }[] = [];
    const autoDocIdsToDelete: string[] = [];

    for (const hDoc of historySnap.docs) {
      const d = hDoc.data();
      const type = String(d.type || '').toLowerCase();
      const desc = String(d.description || '').toLowerCase();

      const isManual = type === 'manual' || type === 'manual_add' || type === 'manual_deduct' || type === 'redemption' ||
                       desc.includes('resgate') || desc.includes('ajuste') || desc.includes('manual') || desc.includes('cupom');

      if (isManual) {
        manualDocs.push({
          cliente_id: d.cliente_id,
          points: Number(d.points) || 0,
          cashback: Number(d.cashback) || 0
        });
      } else {
        autoDocIdsToDelete.push(hDoc.id);
      }
    }

    // Delete all automatic history docs to start clean and prevent duplicates
    let batch = writeBatch(db);
    let opCount = 0;
    const commitBatchIfNeeded = async (force = false) => {
      if (opCount > 0 && (force || opCount >= 350)) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    };

    for (const docId of autoDocIdsToDelete) {
      batch.delete(doc(db, HISTORY_COLLECTION, docId));
      opCount++;
      await commitBatchIfNeeded();
    }
    await commitBatchIfNeeded(true);

    // 3. Fetch all closed comandas for this tenantId
    const comandasQuery = query(
      collection(db, 'comandas'),
      where('tenantId', '==', tenantId),
      limit(300)
    );
    const comandasSnap = await getDocs(comandasQuery);
    const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

    // Group points by client from clean unique comandas
    const clientPointsMap: Record<string, number> = {};
    const clientCashbackMap: Record<string, number> = {};

    // Initialize with manual balances
    for (const m of manualDocs) {
      if (!m.cliente_id) continue;
      clientPointsMap[m.cliente_id] = (clientPointsMap[m.cliente_id] || 0) + m.points;
      clientCashbackMap[m.cliente_id] = (clientCashbackMap[m.cliente_id] || 0) + m.cashback;
    }

    let createdAutoCount = 0;

    for (const comanda of comandas) {
      const clientId = comanda.cliente_id;
      if (!clientId || clientId === 'sem_cadastro' || clientId === 'avulso') continue;

      const payments = comanda.payments || [];
      let paidAmount = payments.reduce((acc: number, p: any) => {
        const method = String(p.method || '').toLowerCase();
        if (method === 'fiado' || method === 'resgate') return acc;
        return acc + (p.amount || 0);
      }, 0);

      if (paidAmount <= 0) {
        paidAmount = Number(comanda.totalAmount || comanda.valor_total || comanda.total) || 0;
      }

      if (paidAmount <= 0) continue;

      const pointsForComanda = Math.floor(paidAmount * pointsPerReal) + pointsPerApp;
      if (pointsForComanda <= 0) continue;

      let dateStr = comanda.date || comanda.data_fechamento || '';
      if (!dateStr && comanda.createdAt) {
        dateStr = (typeof comanda.createdAt === 'string') ? comanda.createdAt.slice(0, 10) : new Date(comanda.createdAt.seconds * 1000).toISOString().slice(0, 10);
      }
      if (!dateStr) dateStr = '2026-09-04';

      const desc = `Pontos Comanda #${comanda.number || comanda.id}`;

      // Create new clean history entry
      const hRef = doc(collection(db, HISTORY_COLLECTION));
      batch.set(hRef, {
        cliente_id: clientId,
        tenantId,
        type: 'earn',
        source: 'appointment',
        points: pointsForComanda,
        cashback: 0,
        description: desc,
        date: dateStr,
        createdAt: serverTimestamp()
      });
      opCount++;
      createdAutoCount++;
      await commitBatchIfNeeded();

      clientPointsMap[clientId] = (clientPointsMap[clientId] || 0) + pointsForComanda;
    }

    await commitBatchIfNeeded(true);

    // 4. Overwrite (SET) exact total balances in loyalty_points and usuarios
    for (const [clientId, totalPts] of Object.entries(clientPointsMap)) {
      const totalCb = clientCashbackMap[clientId] || 0;

      const pointsRef = doc(db, POINTS_COLLECTION, `${tenantId}_${clientId}`);
      batch.set(pointsRef, {
        cliente_id: clientId,
        tenantId,
        points: Math.max(0, totalPts),
        cashback: Math.max(0, totalCb),
        updatedAt: serverTimestamp()
      }, { merge: true });
      opCount++;

      const userRef = doc(db, 'usuarios', clientId);
      batch.set(userRef, {
        pontos: Math.max(0, totalPts),
        points: Math.max(0, totalPts),
        cashback: Math.max(0, totalCb),
        updatedAt: serverTimestamp()
      }, { merge: true });
      opCount++;

      await commitBatchIfNeeded();
    }

    await commitBatchIfNeeded(true);

    const totalPointsAwarded = Object.values(clientPointsMap).reduce((a, b) => a + Math.max(0, b), 0);

    return {
      countSynced: createdAutoCount,
      totalPointsAwarded,
      totalCashbackAwarded: 0
    };
  }
};
