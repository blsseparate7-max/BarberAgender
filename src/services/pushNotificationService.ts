import { getActiveTenantId } from './tenantService';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleanStr = (base64String || '').trim().replace(/["'\s]/g, '');
  const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4);
  const base64 = (cleanStr + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushSubscriptionResult {
  success: boolean;
  message?: string;
  error?: string;
  permission?: NotificationPermission;
}

export const pushNotificationService = {
  isPushSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  },

  getPermissionState(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  },

  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isPushSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      await navigator.serviceWorker.ready;
      return registration;
    } catch (err) {
      console.warn('Erro ao registrar Service Worker para Web Push:', err);
      return null;
    }
  },

  async subscribeUser(params: {
    userId: string;
    userRole: 'cliente' | 'barbeiro' | 'admin' | 'gerente';
    tenantId?: string;
  }): Promise<PushSubscriptionResult> {
    if (!this.isPushSupported()) {
      return {
        success: false,
        error: 'Notificações push não são suportadas neste navegador ou dispositivo.'
      };
    }

    try {
      // 1. Pedir permissão ao usuário
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          permission,
          error: permission === 'denied' 
            ? 'Permissão de notificação negada no navegador. Habilite nas configurações do seu celular.' 
            : 'Permissão de notificação não concedida.'
        };
      }

      // 2. Registrar/Obter Service Worker
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await this.registerServiceWorker();
      }
      if (!registration) {
        return {
          success: false,
          error: 'Falha ao inicializar o Service Worker do aplicativo.'
        };
      }

      // 3. Buscar Chave Pública VAPID do Servidor
      const DEFAULT_VAPID_PUBLIC = 'BKNMb68XxCcvFufw6531Ep9_M4hT4jUvu8fBkX4PLjVcDDWG03gHSd3RqrER6TKbVBBOc3VXsZgajTHwIyEctto';
      let vapidPublicKey = DEFAULT_VAPID_PUBLIC;

      try {
        const keyRes = await fetch('/api/notifications/vapid-public-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (keyData.publicKey) {
            vapidPublicKey = keyData.publicKey;
          }
        }
      } catch (keyErr) {
        console.warn('Usando chave VAPID pública padrão configurada:', keyErr);
      }

      if (!vapidPublicKey) {
        throw new Error('Chave VAPID pública vazia.');
      }

      // 4. Inscrever no PushManager
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription = await registration.pushManager.getSubscription();

      // Se já existe uma inscrição (mesmo que antiga), desinscrevemos primeiro para evitar conflito de chave VAPID anterior
      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch (unsubErr) {
          console.warn('Aviso ao desinscrever chave anterior:', unsubErr);
        }
      }

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      } catch (subErr: any) {
        console.warn('Tentativa com Uint8Array direto falhou, usando .buffer:', subErr);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey.buffer as BufferSource
        });
      }

      // 5. Enviar a inscrição para o Backend
      const tenantId = params.tenantId || getActiveTenantId() || '';
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: params.userId,
          userRole: params.userRole,
          tenantId,
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent
        })
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || 'Erro ao sincronizar inscrição no servidor.');
      }

      return {
        success: true,
        permission: 'granted',
        message: 'Notificações no celular ativadas com sucesso!'
      };
    } catch (err: any) {
      console.error('Erro ao subscrever para push:', err);
      return {
        success: false,
        error: err.message || 'Erro inesperado ao ativar notificações push.'
      };
    }
  },

  async sendTestPush(userId?: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await response.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao enviar teste.' };
    }
  },

  async sendAppointmentPush(params: {
    eventType: 'created' | 'rescheduled' | 'cancelled' | 'reminder';
    appointment: any;
    tenantId?: string;
  }): Promise<void> {
    try {
      const tenantId = params.tenantId || getActiveTenantId() || '';
      await fetch('/api/notifications/send-appointment-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          tenantId
        })
      });
    } catch (err) {
      console.warn('Erro ao disparar push de agendamento:', err);
    }
  }
};
