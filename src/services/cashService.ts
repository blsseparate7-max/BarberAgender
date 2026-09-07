
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit,
  onSnapshot,
  runTransaction,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { DailyCash, CashMovement, TransactionType, PaymentMethod } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION_CASH = 'cash_sessions';
const COLLECTION_MOVEMENTS = 'cash_movements';

export const cashService = {
  async getCurrentCash() {
    const q = query(
      collection(db, COLLECTION_CASH), 
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['open', 'reopened'])
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const docs = querySnapshot.docs.map(doc => {
      const d = doc.data() as any;
      return { id: doc.id, ...d };
    });
    docs.sort((a, b) => {
      const valA = a.openedAt?.seconds || 0;
      const valB = b.openedAt?.seconds || 0;
      return valB - valA;
    });
    const data = docs[0];
    return { 
      id: data.id, 
      ...data,
      openedByName: data.aberto_por_name || data.openedByName,
      closedByName: data.fechado_por_name || data.closedByName,
      openingBalance: data.opening_balance ?? data.openingBalance ?? 0,
      total_income: data.total_income ?? data.totalIncome ?? 0,
      totalIncome: data.total_income ?? data.totalIncome ?? 0,
      total_expense: data.total_expense ?? data.totalExpense ?? 0,
      totalExpense: data.total_expense ?? data.totalExpense ?? 0,
      total_sangria: data.total_sangria ?? data.totalSangria ?? 0,
      totalSangria: data.total_sangria ?? data.totalSangria ?? 0,
      total_reforco: data.total_reforco ?? data.totalReforco ?? 0,
      totalReforco: data.total_reforco ?? data.totalReforco ?? 0,
      total_receivables: data.total_receivables ?? data.totalReceivables ?? 0,
      totalReceivables: data.total_receivables ?? data.totalReceivables ?? 0,
      expected_balance: data.expected_balance ?? data.expectedBalance ?? 0,
      expectedBalance: data.expected_balance ?? data.expectedBalance ?? 0,
      actual_balance: data.actual_balance ?? data.actualBalance ?? 0,
      actualBalance: data.actual_balance ?? data.actualBalance ?? 0,
      closing_balance: data.closing_balance ?? data.closingBalance ?? 0,
      closingBalance: data.closing_balance ?? data.closingBalance ?? 0
    } as DailyCash;
  },

  subscribeToCurrentCash(callback: (cash: DailyCash | null) => void) {
    const q = query(
      collection(db, COLLECTION_CASH), 
      where('tenantId', '==', getActiveTenantId()),
      where('status', 'in', ['open', 'reopened'])
    );
    
    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        const docs = snapshot.docs.map(doc => {
          const d = doc.data() as any;
          return { id: doc.id, ...d };
        });
        docs.sort((a, b) => {
          const valA = a.openedAt?.seconds || 0;
          const valB = b.openedAt?.seconds || 0;
          return valB - valA;
        });
        const data = docs[0];
        callback({ 
          id: data.id, 
          ...data,
          openedByName: data.aberto_por_name || data.openedByName,
          closedByName: data.fechado_por_name || data.closedByName,
          openingBalance: data.opening_balance ?? data.openingBalance ?? 0,
          total_income: data.total_income ?? data.totalIncome ?? 0,
          totalIncome: data.total_income ?? data.totalIncome ?? 0,
          total_expense: data.total_expense ?? data.totalExpense ?? 0,
          totalExpense: data.total_expense ?? data.totalExpense ?? 0,
          total_sangria: data.total_sangria ?? data.totalSangria ?? 0,
          totalSangria: data.total_sangria ?? data.totalSangria ?? 0,
          total_reforco: data.total_reforco ?? data.totalReforco ?? 0,
          totalReforco: data.total_reforco ?? data.totalReforco ?? 0,
          total_receivables: data.total_receivables ?? data.totalReceivables ?? 0,
          totalReceivables: data.total_receivables ?? data.totalReceivables ?? 0,
          expected_balance: data.expected_balance ?? data.expectedBalance ?? 0,
          expectedBalance: data.expected_balance ?? data.expectedBalance ?? 0,
          actual_balance: data.actual_balance ?? data.actualBalance ?? 0,
          actualBalance: data.actual_balance ?? data.actualBalance ?? 0,
          closing_balance: data.closing_balance ?? data.closingBalance ?? 0,
          closingBalance: data.closing_balance ?? data.closingBalance ?? 0
        } as DailyCash);
      }
    });
  },

  async openCash(data: { opening_balance: number, userId: string, userName: string }) {
    // Verificar se já existe um caixa aberto
    const openCash = await this.getCurrentCash();
    if (openCash) {
      throw new Error("Já existe um caixa aberto. Feche o atual antes de abrir um novo.");
    }

    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(collection(db, COLLECTION_CASH));
    
    const newCash: DailyCash = {
      id: docRef.id,
      tenantId: getActiveTenantId(),
      date: today,
      opening_balance: data.opening_balance,
      total_income: 0,
      total_expense: 0,
      total_sangria: 0,
      total_reforco: 0,
      total_receivables: 0,
      expected_balance: data.opening_balance,
      status: 'open',
      aberto_por_id: data.userId,
      aberto_por_name: data.userName,
      openedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, newCash);
    return newCash;
  },

  async addMovement(data: Omit<CashMovement, 'id' | 'createdAt'>) {
    const movementRef = doc(collection(db, COLLECTION_MOVEMENTS));
    const cashRef = doc(db, COLLECTION_CASH, data.caixa_id);

    const newMovement: CashMovement = {
      ...data,
      tenantId: getActiveTenantId(),
      id: movementRef.id,
      createdAt: serverTimestamp()
    };

    await runTransaction(db, async (transaction) => {
      const cashSnap = await transaction.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Caixa não encontrado.");
      const cashData = cashSnap.data() as DailyCash;
      
      if (cashData.status !== 'open' && cashData.status !== 'reopened') {
        throw new Error("Operação negada: O caixa está fechado.");
      }

      transaction.set(movementRef, newMovement);

      const updates: any = {
        updatedAt: serverTimestamp()
      };

      if (data.is_receivable) {
        updates.total_receivables = increment(data.amount);
        updates.totalReceivables = increment(data.amount);
      } else {
        switch (data.type) {
          case 'income':
            updates.total_income = increment(data.amount);
            updates.totalIncome = increment(data.amount);
            updates.expected_balance = increment(data.amount);
            updates.expectedBalance = increment(data.amount);
            break;
          case 'expense':
            updates.total_expense = increment(data.amount);
            updates.totalExpense = increment(data.amount);
            updates.expected_balance = increment(-data.amount);
            updates.expectedBalance = increment(-data.amount);
            break;
          case 'sangria':
            updates.total_sangria = increment(data.amount);
            updates.totalSangria = increment(data.amount);
            updates.expected_balance = increment(-data.amount);
            updates.expectedBalance = increment(-data.amount);
            break;
          case 'reforco':
            updates.total_reforco = increment(data.amount);
            updates.totalReforco = increment(data.amount);
            updates.expected_balance = increment(data.amount);
            updates.expectedBalance = increment(data.amount);
            break;
        }
      }

      transaction.update(cashRef, updates);
    });

    return newMovement;
  },

  async closeCash(id: string, data: { actual_balance: number, userId: string, userName: string, observations?: string }) {
    const cashRef = doc(db, COLLECTION_CASH, id);
    const cashSnap = await getDoc(cashRef);
    if (!cashSnap.exists()) throw new Error("Caixa não encontrado");
    
    const cash = cashSnap.data() as DailyCash;
    const difference = data.actual_balance - cash.expected_balance;

    await updateDoc(cashRef, {
      status: 'closed',
      actual_balance: data.actual_balance,
      closing_balance: data.actual_balance,
      difference,
      fechado_por_id: data.userId,
      fechado_por_name: data.userName,
      closedAt: serverTimestamp(),
      observations: data.observations || '',
      updatedAt: serverTimestamp()
    });
  },

  async getMovementsByCashId(caixa_id: string) {
    const q = query(
      collection(db, COLLECTION_MOVEMENTS),
      where('caixa_id', '==', caixa_id)
    );
    const querySnapshot = await getDocs(q);
    const movements = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        responsavel_name: data.usuario_name || data.responsavel_name
      } as unknown as CashMovement;
    });

    return movements.sort((a, b) => {
      const valA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0) || 0;
      const valB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0) || 0;
      return valA - valB;
    });
  },

  subscribeToMovementsByCashId(caixa_id: string, callback: (movements: CashMovement[]) => void) {
    const q = query(
      collection(db, COLLECTION_MOVEMENTS),
      where('caixa_id', '==', caixa_id)
    );
    
    return onSnapshot(q, (snapshot) => {
      const movements = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          responsavel_name: data.usuario_name || data.responsavel_name
        } as unknown as CashMovement;
      });

      movements.sort((a, b) => {
        const valA = a.createdAt?.seconds || (a.createdAt instanceof Date ? a.createdAt.getTime() : 0) || 0;
        const valB = b.createdAt?.seconds || (b.createdAt instanceof Date ? b.createdAt.getTime() : 0) || 0;
        return valA - valB;
      });

      callback(movements);
    });
  },

  async getCashHistory(startDate: string, endDate: string) {
    const q = query(
      collection(db, COLLECTION_CASH),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );
    const querySnapshot = await getDocs(q);
    const activeTenantId = getActiveTenantId();
    const history = querySnapshot.docs
      .filter(doc => (doc.data() as any).tenantId === activeTenantId)
      .map(doc => {
        const data = doc.data() as any;
        return { 
          id: doc.id, 
          ...data,
          openedByName: data.aberto_por_name || data.openedByName,
        closedByName: data.fechado_por_name || data.closedByName,
        openingBalance: data.opening_balance ?? data.openingBalance ?? 0,
        total_income: data.total_income ?? data.totalIncome ?? 0,
        totalIncome: data.total_income ?? data.totalIncome ?? 0,
        total_expense: data.total_expense ?? data.totalExpense ?? 0,
        totalExpense: data.total_expense ?? data.totalExpense ?? 0,
        total_sangria: data.total_sangria ?? data.totalSangria ?? 0,
        totalSangria: data.total_sangria ?? data.totalSangria ?? 0,
        total_reforco: data.total_reforco ?? data.totalReforco ?? 0,
        totalReforco: data.total_reforco ?? data.totalReforco ?? 0,
        total_receivables: data.total_receivables ?? data.totalReceivables ?? 0,
        totalReceivables: data.total_receivables ?? data.totalReceivables ?? 0,
        expected_balance: data.expected_balance ?? data.expectedBalance ?? 0,
        expectedBalance: data.expected_balance ?? data.expectedBalance ?? 0,
        actual_balance: data.actual_balance ?? data.actualBalance ?? 0,
        actualBalance: data.actual_balance ?? data.actualBalance ?? 0,
        closing_balance: data.closing_balance ?? data.closingBalance ?? 0,
        closingBalance: data.closing_balance ?? data.closingBalance ?? 0
      } as DailyCash;
    });

    return history.sort((a, b) => {
      const aDate = a.date || '';
      const bDate = b.date || '';
      if (aDate !== bDate) {
        return bDate.localeCompare(aDate);
      }
      const aTime = a.openedAt?.seconds || 0;
      const bTime = b.openedAt?.seconds || 0;
      return bTime - aTime;
    });
  },

  async reopenCash(id: string, data: { userId: string, userName: string, reason: string }) {
    const cashRef = doc(db, COLLECTION_CASH, id);
    await updateDoc(cashRef, {
      status: 'reopened',
      reopened_at: serverTimestamp(),
      reopened_por_id: data.userId,
      reopened_por_name: data.userName,
      reopening_reason: data.reason,
      updatedAt: serverTimestamp()
    });
  },

  async getCashByDate(date: string) {
    const q = query(
      collection(db, COLLECTION_CASH),
      where('tenantId', '==', getActiveTenantId()),
      where('date', '==', date)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const docs = querySnapshot.docs.map(doc => {
      const data = doc.data() as any;
      return { 
        id: doc.id, 
        ...data,
        openedByName: data.aberto_por_name || data.openedByName,
        closedByName: data.fechado_por_name || data.closedByName,
        openingBalance: data.opening_balance ?? data.openingBalance ?? 0,
        total_income: data.total_income ?? data.totalIncome ?? 0,
        totalIncome: data.total_income ?? data.totalIncome ?? 0,
        total_expense: data.total_expense ?? data.totalExpense ?? 0,
        totalExpense: data.total_expense ?? data.totalExpense ?? 0,
        total_sangria: data.total_sangria ?? data.totalSangria ?? 0,
        totalSangria: data.total_sangria ?? data.totalSangria ?? 0,
        total_reforco: data.total_reforco ?? data.totalReforco ?? 0,
        totalReforco: data.total_reforco ?? data.totalReforco ?? 0,
        total_receivables: data.total_receivables ?? data.totalReceivables ?? 0,
        totalReceivables: data.total_receivables ?? data.totalReceivables ?? 0,
        expected_balance: data.expected_balance ?? data.expectedBalance ?? 0,
        expectedBalance: data.expected_balance ?? data.expectedBalance ?? 0,
        actual_balance: data.actual_balance ?? data.actualBalance ?? 0,
        actualBalance: data.actual_balance ?? data.actualBalance ?? 0,
        closing_balance: data.closing_balance ?? data.closingBalance ?? 0,
        closingBalance: data.closing_balance ?? data.closingBalance ?? 0
      } as DailyCash;
    });

    docs.sort((a, b) => {
      const valA = (a as any).openedAt?.seconds || 0;
      const valB = (b as any).openedAt?.seconds || 0;
      return valB - valA;
    });
    return docs[0];
  },

  async removeMovement(id: string) {
    const movementRef = doc(db, COLLECTION_MOVEMENTS, id);
    await runTransaction(db, async (transaction) => {
      const moveSnap = await transaction.get(movementRef);
      if (!moveSnap.exists()) return;
      const movement = moveSnap.data() as CashMovement;
      const cashRef = doc(db, COLLECTION_CASH, movement.caixa_id);
      const cashSnap = await transaction.get(cashRef);

      if (cashSnap.exists()) {
        const cashData = cashSnap.data() as DailyCash;
        if (cashData.status !== 'open' && cashData.status !== 'reopened') {
          throw new Error("Operação negada: O caixa relacionado a este movimento está fechado.");
        }

        const updates: any = { updatedAt: serverTimestamp() };
        if (movement.is_receivable) {
          updates.total_receivables = increment(-movement.amount);
          updates.totalReceivables = increment(-movement.amount);
        } else {
          switch (movement.type) {
            case 'income':
              updates.total_income = increment(-movement.amount);
              updates.totalIncome = increment(-movement.amount);
              updates.expected_balance = increment(-movement.amount);
              updates.expectedBalance = increment(-movement.amount);
              break;
            case 'expense':
              updates.total_expense = increment(-movement.amount);
              updates.totalExpense = increment(-movement.amount);
              updates.expected_balance = increment(movement.amount);
              updates.expectedBalance = increment(movement.amount);
              break;
            case 'sangria':
              updates.total_sangria = increment(-movement.amount);
              updates.totalSangria = increment(-movement.amount);
              updates.expected_balance = increment(movement.amount);
              updates.expectedBalance = increment(movement.amount);
              break;
            case 'reforco':
              updates.total_reforco = increment(-movement.amount);
              updates.totalReforco = increment(-movement.amount);
              updates.expected_balance = increment(-movement.amount);
              updates.expectedBalance = increment(-movement.amount);
              break;
          }
        }
        transaction.update(cashRef, updates);
      }

      transaction.delete(movementRef);
    });

    // Cleanup linked advance and transactions if exists
    try {
      const qAdv = query(
        collection(db, 'professional_advances'),
        where('movement_id', '==', id)
      );
      const snapAdv = await getDocs(qAdv);
      for (const d of snapAdv.docs) {
        await deleteDoc(d.ref);
      }
    } catch (e) {
      console.warn("Aviso ao remover avanço vinculado ao movimento:", e);
    }
  },

  async updateMovement(id: string, updated: Partial<CashMovement>, oldAmount?: number) {
    const movementRef = doc(db, COLLECTION_MOVEMENTS, id);
    await runTransaction(db, async (transaction) => {
      const moveSnap = await transaction.get(movementRef);
      if (!moveSnap.exists()) return;
      const movement = moveSnap.data() as CashMovement;
      const cashRef = doc(db, COLLECTION_CASH, movement.caixa_id);
      const cashSnap = await transaction.get(cashRef);

      if (cashSnap.exists()) {
        const cashData = cashSnap.data() as DailyCash;
        if (cashData.status !== 'open' && cashData.status !== 'reopened') {
          throw new Error("Operação negada: O caixa relacionado a este movimento está fechado.");
        }

        const previousAmount = oldAmount !== undefined ? oldAmount : movement.amount;
        if (updated.amount !== undefined && updated.amount !== previousAmount) {
          const diff = updated.amount - previousAmount;
          const updates: any = { updatedAt: serverTimestamp() };
          if (movement.is_receivable) {
            updates.total_receivables = increment(diff);
            updates.totalReceivables = increment(diff);
          } else {
            switch (movement.type) {
              case 'income':
                updates.total_income = increment(diff);
                updates.totalIncome = increment(diff);
                updates.expected_balance = increment(diff);
                updates.expectedBalance = increment(diff);
                break;
              case 'expense':
                updates.total_expense = increment(diff);
                updates.totalExpense = increment(diff);
                updates.expected_balance = increment(-diff);
                updates.expectedBalance = increment(-diff);
                break;
            }
          }
          transaction.update(cashRef, updates);
        }
      }

      transaction.update(movementRef, {
        ...updated,
        updatedAt: serverTimestamp()
      });
    });
  }
};
