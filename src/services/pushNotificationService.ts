import { getActiveTenantId } from './tenantService';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  try {
    const cleanStr = (base64String || '').trim().replace(/["'\s]/g, '');
    const padding = '='.repeat((4 - (cleanStr.length % 4)) % 4);
    const base64 = (cleanStr + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (err) {
    console.warn('Falha na conversão Base64:', err);
    return new Uint8Array(0);
  }
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
      const DEFAULT_VAPID_PUBLIC = 'BIO6H156g5q-5E-Vaa5ZdAvpK1Gob-Kfduw3Xcp02LHSePKMVQdoJ5ILjVbR52xvawdu2xDBsgh_bxekAFzz-E0';
      let vapidPublicKey = DEFAULT_VAPID_PUBLIC;

      try {
        const keyRes = await fetch('/api/notifications/vapid-public-key');
        if (keyRes.ok) {
          const keyData = await keyRes.json();
          if (keyData.publicKey) {
            vapidPublicKey = keyData.publicKey.trim();
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

      // Se já existe uma inscrição anterior, desinscrevemos primeiro para aplicar as novas chaves
      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch (unsubErr) {
          console.warn('Aviso ao desinscrever chave anterior:', unsubErr);
        }
      }

      // Tenta inscrever usando múltiplos formatos compatíveis com WebKit/Safari, Chrome e Firefox
      try {
        // Formato 1: Uint8Array padrão da especificação W3C
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey
        });
      } catch (subErr1: any) {
        console.warn('Tentativa com Uint8Array falhou, tentando buffer direto...', subErr1);
        try {
          // Formato 2: ArrayBuffer direto
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey.buffer as BufferSource
          });
        } catch (subErr2: any) {
          console.warn('Tentativa com .buffer falhou, tentando Base64URL string...', subErr2);
          try {
            // Formato 3: Base64URL string direta (suportada nativamente no WebKit recente)
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: vapidPublicKey as any
            });
          } catch (subErr3: any) {
            console.error('Falha em todos os formatos de applicationServerKey:', subErr3);
            throw new Error(subErr3?.message || 'Falha ao registrar assinatura push no navegador.');
          }
        }
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
        const text = await response.text();
        let errorMsg = 'Erro ao sincronizar inscrição no servidor.';
        try {
          const errObj = JSON.parse(text);
          if (errObj.error) errorMsg = errObj.error;
        } catch (_) {}
        throw new Error(errorMsg);
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
      // Notificação local de alta fidelidade para resposta imediata no dispositivo
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification('💈 Notificação Rull Ativa!', {
              body: 'Parabéns! O seu celular está configurado para receber lembretes e avisos em tempo real.',
              icon: '/icon-192.png',
              badge: '/badge-72.png',
              tag: 'test-push-notification',
              data: { url: '/' }
            });
          }
        } catch (localErr) {
          console.warn('Aviso ao exibir notificação local:', localErr);
        }
      }

      const response = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = { success: response.ok, message: 'Notificação enviada para a tela do seu celular!' };
      }

      if (!response.ok && !data.error) {
        data.error = text || 'Erro ao enviar notificação de teste.';
      }

      return data;
    } catch (err: any) {
      // Se a notificação local foi disparada ou se houve falha de rede
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
