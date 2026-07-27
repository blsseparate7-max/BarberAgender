import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

export interface SaaSChargeRequest {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerCpfCnpj?: string;
  planId: string;
  planName: string;
  amount: number;
  billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO';
  cycle?: 'MONTHLY' | 'YEARLY';
}

export interface SaaSChargeResponse {
  success: boolean;
  chargeId: string;
  paymentUrl?: string;
  pixCopiaECola?: string;
  pixQrCodeUrl?: string;
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE';
  gatewayUsed: 'asaas' | 'mercadopago' | 'pix_direct' | 'simulated';
  message?: string;
}

export const saasGatewayService = {
  /**
   * Generates a payment charge for a tenant to subscribe/renew BarberElite SaaS
   */
  async createSaaSCharge(payload: SaaSChargeRequest): Promise<SaaSChargeResponse> {
    try {
      const response = await fetch('/api/saas/payment/create-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao comunicar com o servidor de pagamento');
      }

      const data: SaaSChargeResponse = await response.json();
      return data;
    } catch (error: any) {
      console.error("Error creating SaaS charge:", error);
      throw error;
    }
  },

  /**
   * Confirms payment and activates/extends tenant SaaS plan in Firestore
   */
  async confirmSaaSPlanPayment(tenantId: string, planName: string, price: number, monthsCount: number = 1): Promise<void> {
    const tenantRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantRef);

    if (!tenantSnap.exists()) {
      throw new Error(`Barbearia / Tenant "${tenantId}" não encontrada.`);
    }

    const currentData = tenantSnap.data();
    
    // Calculate new expiration date (add X months from today or current expiration)
    let baseDate = new Date();
    if (currentData.planExpiresAt) {
      const existingExp = new Date(currentData.planExpiresAt);
      if (existingExp > baseDate) {
        baseDate = existingExp;
      }
    }

    const newExpDate = new Date(baseDate);
    newExpDate.setMonth(newExpDate.getMonth() + monthsCount);
    const newExpString = newExpDate.toISOString().split('T')[0];

    await updateDoc(tenantRef, {
      plan: planName,
      planPrice: price,
      planStatus: 'active',
      isActive: true,
      planExpiresAt: newExpString,
      updatedAt: new Date().toISOString()
    });

    // Record transaction in global saas_payments collection
    await addDoc(collection(db, 'saas_payments'), {
      tenantId,
      tenantName: currentData.name || tenantId,
      planName,
      amount: price,
      paymentMethod: 'PIX / Gateway',
      status: 'pago',
      paidAt: new Date().toISOString(),
      newExpirationDate: newExpString,
      createdAt: serverTimestamp()
    });
  }
};
