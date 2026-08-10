import { collection, addDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';

export interface AuditLog {
  id?: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: 'REOPEN_COMANDA' | 'EDIT_PAID_COMANDA' | 'HIGH_DISCOUNT' | 'DELETE_TRANSACTION' | 'MANUAL_CASH_ENTRY' | 'OVERRIDE_APPOINTMENT';
  details: string;
  metadata?: any;
  createdAt?: any;
}

export const auditService = {
  async logAction(data: {
    userId: string;
    userEmail: string;
    userName: string;
    action: AuditLog['action'];
    details: string;
    metadata?: any;
  }) {
    try {
      const tenantId = getActiveTenantId();
      await addDoc(collection(db, 'audit_logs'), {
        tenantId,
        userId: data.userId,
        userEmail: data.userEmail,
        userName: data.userName,
        action: data.action,
        details: data.details,
        metadata: data.metadata || {},
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('Erro ao registrar log de auditoria:', err);
    }
  },

  async getLogs(maxResults = 100): Promise<AuditLog[]> {
    try {
      const tenantId = getActiveTenantId();
      const q = query(
        collection(db, 'audit_logs'),
        where('tenantId', '==', tenantId),
        orderBy('createdAt', 'desc'),
        limit(maxResults)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));
    } catch (err) {
      console.error('Erro ao buscar logs de auditoria:', err);
      return [];
    }
  }
};
