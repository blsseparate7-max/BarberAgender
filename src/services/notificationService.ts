import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  serverTimestamp,
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { InAppNotification } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'notifications';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const notificationService = {
  /**
   * Cria uma notificação interna no Firestore
   */
  async createNotification(data: Omit<InAppNotification, 'id' | 'createdAt' | 'read'>) {
    const tenantId = data.tenantId || getActiveTenantId();
    const payload = {
      ...data,
      tenantId,
      read: false,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, COLLECTION), payload);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, COLLECTION);
    }
  },

  /**
   * Escuta as notificações de um usuário (ou 'admin') em tempo real
   */
  subscribeToNotifications(recipientId: string, callback: (notifications: InAppNotification[]) => void) {
    const tenantId = getActiveTenantId();
    const q = query(
      collection(db, COLLECTION),
      where('tenantId', '==', tenantId),
      where('recipientId', 'in', [recipientId, 'admin']),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          // Fallback if createdAt is serverTimestamp and not yet resolved
          createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt) : new Date()
        } as InAppNotification;
      });
      callback(notifications);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, COLLECTION);
    });
  },

  /**
   * Marca uma notificação específica como lida
   */
  async markAsRead(notificationId: string) {
    const docRef = doc(db, COLLECTION, notificationId);
    try {
      await updateDoc(docRef, {
        read: true,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${COLLECTION}/${notificationId}`);
    }
  },

  /**
   * Marca todas as notificações de um destinatário como lidas
   */
  async markAllAsRead(recipientId: string) {
    const tenantId = getActiveTenantId();
    const q = query(
      collection(db, COLLECTION),
      where('tenantId', '==', tenantId),
      where('recipientId', 'in', [recipientId, 'admin']),
      where('read', '==', false)
    );

    try {
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.docs.forEach((docSnap) => {
        batch.update(doc(db, COLLECTION, docSnap.id), {
          read: true,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION);
    }
  }
};
