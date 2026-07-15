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
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { LoyaltyConfig, LoyaltyPoints, LoyaltyHistory } from '../types';
import { format } from 'date-fns';
import { getActiveTenantId } from './tenantService';

const CONFIG_COLLECTION = 'loyalty_config';
const POINTS_COLLECTION = 'loyalty_points';
const HISTORY_COLLECTION = 'loyalty_history';

export const loyaltyService = {
  async getConfig() {
    const q = query(collection(db, CONFIG_COLLECTION), where('tenantId', '==', getActiveTenantId()), limit(1));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      // Create default config if not exists
      const defaultConfig = {
        tenantId: getActiveTenantId(),
        pointsPerReal: 1,
        pointsPerAppointment: 10,
        cashbackPercentage: 5,
        minRedemptionPoints: 100,
        vipThreshold: 1000,
        updatedAt: new Date()
      };
      try {
        const docRef = doc(collection(db, CONFIG_COLLECTION));
        await setDoc(docRef, { ...defaultConfig, updatedAt: serverTimestamp() });
        return { id: docRef.id, ...defaultConfig } as unknown as LoyaltyConfig;
      } catch (err) {
        console.warn("Could not persist default loyalty config (permission restricted):", err);
        return { id: 'temp-loyalty-config', ...defaultConfig } as unknown as LoyaltyConfig;
      }
    }
    const docData = querySnapshot.docs[0];
    return { id: docData.id, ...docData.data() } as LoyaltyConfig;
  },

  async updateConfig(id: string, data: Partial<LoyaltyConfig>) {
    const docRef = doc(db, CONFIG_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp()
    });
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
    return await runTransaction(db, async (transaction) => {
      const docId = `${activeTenantId}_${cliente_id}`;
      const pointsRef = doc(db, POINTS_COLLECTION, docId);
      const pointsSnap = await transaction.get(pointsRef);
      
      let currentPoints = 0;
      let currentCashback = 0;
      
      if (pointsSnap.exists()) {
        const data = pointsSnap.data() as LoyaltyPoints;
        currentPoints = data.points;
        currentCashback = data.cashback;
      }

      const pointsToAdd = (value * config.pointsPerReal) + (source === 'appointment' ? config.pointsPerAppointment : 0);
      const cashbackToAdd = (value * config.cashbackPercentage) / 100;

      const newPoints = currentPoints + pointsToAdd;
      const newCashback = currentCashback + cashbackToAdd;
      const isVip = newPoints >= config.vipThreshold;

      transaction.set(pointsRef, {
        cliente_id,
        tenantId: activeTenantId,
        points: newPoints,
        cashback: newCashback,
        isVip,
        updatedAt: serverTimestamp()
      });

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
      const pointsSnap = await transaction.get(pointsRef);
      
      if (!pointsSnap.exists()) throw new Error("Cliente não possui pontos");
      const data = pointsSnap.data() as LoyaltyPoints;

      if (data.points < points) throw new Error("Pontos insuficientes");
      if (data.cashback < cashback) throw new Error("Cashback insuficiente");

      transaction.update(pointsRef, {
        points: increment(-points),
        cashback: increment(-cashback),
        updatedAt: serverTimestamp()
      });

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
  }
};
