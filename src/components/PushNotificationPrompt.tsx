import React, { useState, useEffect } from 'react';
import { Bell, BellRing, CheckCircle, Smartphone, AlertCircle } from 'lucide-react';
import { pushNotificationService } from '../services/pushNotificationService';
import { toast } from 'sonner';

interface PushNotificationPromptProps {
  userId: string;
  userRole: 'barbeiro' | 'cliente' | 'admin' | 'gerente';
  tenantId?: string;
  variant?: 'banner' | 'card' | 'compact' | 'pill';
  onSubscribed?: () => void;
}

export const PushNotificationPrompt: React.FC<PushNotificationPromptProps> = ({
  userId,
  userRole,
  tenantId,
  variant = 'card',
  onSubscribed
}) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const isSupported = pushNotificationService.isPushSupported();
    setSupported(isSupported);
    if (isSupported) {
      setPermission(pushNotificationService.getPermissionState());
      // Register service worker in background
      pushNotificationService.registerServiceWorker();
    }
  }, []);

  const handleSubscribe = async () => {
    if (!userId) {
      toast.error('Você precisa estar logado para ativar as notificações.');
      return;
    }

    setLoading(true);
    try {
      const result = await pushNotificationService.subscribeUser({
        userId,
        userRole,
        tenantId
      });

      if (result.success) {
        setPermission('granted');
        toast.success(result.message || 'Notificações no celular ativadas com sucesso!');
        if (onSubscribed) onSubscribed();

        // Trigger an immediate test notification so they see it working
        await pushNotificationService.sendTestPush(userId, tenantId);
      } else {
        if (result.permission) setPermission(result.permission);
        toast.error(result.error || 'Não foi possível ativar as notificações.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao solicitar permissão de notificações.');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      let res = await pushNotificationService.sendTestPush(userId, tenantId);
      
      // Se não encontrou o dispositivo no servidor, renova a inscrição automaticamente
      if (!res.success && (res.error?.includes('Nenhum dispositivo') || res.error?.includes('404'))) {
        const subRes = await pushNotificationService.subscribeUser({
          userId: userId || 'user-' + Date.now(),
          userRole,
          tenantId
        });
        if (subRes.success) {
          res = await pushNotificationService.sendTestPush(userId, tenantId);
        }
      }

      if (res.success) {
        toast.success(res.message || 'Notificação enviada para a tela do seu celular!');
      } else {
        toast.error(res.error || 'Falha ao enviar notificação de teste.');
      }
    } catch (err: any) {
      toast.error('Erro ao disparar notificação.');
    } finally {
      setTesting(false);
    }
  };

  if (!supported) {
    return null; // Browser doesn't support Web Push (e.g. older browser)
  }

  // Compact / Pill Variant
  if (variant === 'pill' || variant === 'compact') {
    if (permission === 'granted') {
      return (
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1.5 rounded-full font-medium">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Push Ativo</span>
          <button
            onClick={handleTest}
            disabled={testing}
            className="ml-1 text-emerald-300 hover:text-white underline text-[11px] disabled:opacity-50"
            title="Enviar teste para o celular"
          >
            {testing ? 'Testando...' : 'Testar'}
          </button>
        </div>
      );
    }

    if (permission === 'denied') {
      return (
        <div className="inline-flex items-center gap-1.5 text-amber-400/80 text-xs px-2.5 py-1 bg-amber-500/10 rounded-full" title="Permissão bloqueada no navegador">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Notificações Bloqueadas</span>
        </div>
      );
    }

    return (
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
      >
        <BellRing className="w-3.5 h-3.5 animate-bounce" />
        <span>{loading ? 'Ativando...' : 'Ativar Push no Celular'}</span>
      </button>
    );
  }

  // Card Variant
  if (permission === 'granted') {
    return (
      <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-400">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
              Lembretes no Celular Ativados
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Ativo</span>
            </h4>
            <p className="text-xs text-stone-400 mt-0.5">
              {userRole === 'barbeiro' 
                ? 'Você receberá alertas na tela de bloqueio a cada novo agendamento e cancelamento.' 
                : 'Você receberá avisos e lembretes antes do horário do seu agendamento.'}
            </p>
          </div>
        </div>
        <button
          onClick={handleTest}
          disabled={testing}
          className="inline-flex items-center justify-center gap-2 text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span>{testing ? 'Enviando teste...' : 'Testar no Celular'}</span>
        </button>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-stone-300 space-y-1">
          <p className="font-semibold text-amber-300">Notificações Bloqueadas no Navegador</p>
          <p className="text-stone-400">
            Para receber lembretes na tela do celular, toque no ícone de ajustes/cadeado na barra de endereços do seu navegador e mude "Notificações" para "Permitir".
          </p>
        </div>
      </div>
    );
  }

  // Default: Not prompted yet
  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <BellRing className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-stone-100 flex items-center gap-2">
            Receber Notificações na Tela do Celular
          </h4>
          <p className="text-xs text-stone-400 mt-0.5">
            {userRole === 'barbeiro' 
              ? 'Receba avisos instantâneos com som e vibração a cada novo agendamento ou cancelamento de cliente.' 
              : 'Receba confirmações e lembretes automáticos na tela de bloqueio antes do seu horário de corte.'}
          </p>
        </div>
      </div>
      <button
        onClick={handleSubscribe}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs px-4 py-2.5 rounded-lg shadow-md transition-all hover:scale-105 active:scale-95 shrink-0 disabled:opacity-50"
      >
        <Smartphone className="w-4 h-4" />
        <span>{loading ? 'Ativando...' : 'Ativar Lembretes no Celular'}</span>
      </button>
    </div>
  );
};
