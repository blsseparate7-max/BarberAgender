import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Send, CheckCircle2, XCircle, HelpCircle, Smartphone, Key } from 'lucide-react';
import { pushNotificationService } from '../services/pushNotificationService';
import { toast } from 'sonner';

interface DiagnosticInfo {
  browserSupported: boolean;
  permission: NotificationPermission;
  swRegistered: boolean;
  swState: string;
  hasSubscription: boolean;
  subscriptionEndpoint?: string;
  serverVapidKeyLoaded: boolean;
  serverVapidKeyPreview?: string;
  serverStoredSubsCount?: number;
  isStandalonePWA: boolean;
  userAgent: string;
}

export const NotificationDiagnosticsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  tenantId?: string;
}> = ({ isOpen, onClose, userId, tenantId }) => {
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [info, setInfo] = useState<DiagnosticInfo | null>(null);

  const runCheck = async () => {
    setLoading(true);
    try {
      const isSupp = pushNotificationService.isPushSupported();
      const perm = pushNotificationService.getPermissionState();
      const isPWA = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

      let swReg: ServiceWorkerRegistration | null = null;
      let swState = 'Não registrado';
      let hasSub = false;
      let endpoint = '';

      if (isSupp && 'serviceWorker' in navigator) {
        swReg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (swReg) {
          swState = swReg.active ? 'Ativo (Active)' : swReg.installing ? 'Instalando' : 'Aguardando';
          const sub = await swReg.pushManager.getSubscription();
          if (sub) {
            hasSub = true;
            endpoint = sub.endpoint;
          }
        }
      }

      // Check Server VAPID Key and subs
      let serverVapidOk = false;
      let vapidPreview = '';
      try {
        const vRes = await fetch('/api/notifications/vapid-public-key');
        if (vRes.ok) {
          const vData = await vRes.json();
          if (vData.publicKey) {
            serverVapidOk = true;
            vapidPreview = vData.publicKey.slice(0, 10) + '...' + vData.publicKey.slice(-6);
          }
        }
      } catch (e) {
        console.warn(e);
      }

      setInfo({
        browserSupported: isSupp,
        permission: perm,
        swRegistered: !!swReg,
        swState,
        hasSubscription: hasSub,
        subscriptionEndpoint: endpoint,
        serverVapidKeyLoaded: serverVapidOk,
        serverVapidKeyPreview: vapidPreview,
        isStandalonePWA: isPWA,
        userAgent: navigator.userAgent
      });
    } catch (err: any) {
      toast.error('Erro ao verificar diagnóstico: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runCheck();
    }
  }, [isOpen]);

  const handleForceReSubscribe = async () => {
    setLoading(true);
    try {
      const res = await pushNotificationService.subscribeUser({
        userId: userId || 'test-user',
        userRole: 'admin',
        tenantId
      });

      if (res.success) {
        toast.success('Inscrição renovada com sucesso no servidor e no celular!');
        await runCheck();
      } else {
        toast.error(res.error || 'Falha ao renovar inscrição.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao registrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    setTestLoading(true);
    try {
      const res = await pushNotificationService.sendTestPush(userId, tenantId);
      if (res.success) {
        toast.success(res.message || 'Push disparado com sucesso!');
      } else {
        toast.error(res.error || 'Erro ao disparar teste push.');
      }
    } catch (e: any) {
      toast.error('Erro de conexão ao enviar teste.');
    } finally {
      setTestLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Smartphone size={20} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800">Diagnóstico de Notificações</h3>
              <p className="text-xs text-slate-400 font-medium">Verificação de conexão Web Push e Chaves</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg text-sm font-black"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
            <p className="text-xs font-bold">Verificando status do dispositivo...</p>
          </div>
        ) : info ? (
          <div className="space-y-4">
            {/* Cards de Status */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-2xl border bg-slate-50 flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Permissão do Celular</span>
                <span className="font-black flex items-center gap-1.5 capitalize">
                  {info.permission === 'granted' ? (
                    <><CheckCircle2 size={15} className="text-emerald-500" /> Autorizada</>
                  ) : info.permission === 'denied' ? (
                    <><XCircle size={15} className="text-rose-500" /> Bloqueada</>
                  ) : (
                    <><HelpCircle size={15} className="text-amber-500" /> Pendente</>
                  )}
                </span>
              </div>

              <div className="p-3 rounded-2xl border bg-slate-50 flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Modo PWA (Instalado)</span>
                <span className="font-black flex items-center gap-1.5">
                  {info.isStandalonePWA ? (
                    <><CheckCircle2 size={15} className="text-emerald-500" /> Tela Inicial (OK)</>
                  ) : (
                    <><HelpCircle size={15} className="text-amber-500" /> Aba do Navegador</>
                  )}
                </span>
              </div>

              <div className="p-3 rounded-2xl border bg-slate-50 flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Service Worker</span>
                <span className="font-black flex items-center gap-1.5">
                  {info.swRegistered ? (
                    <><CheckCircle2 size={15} className="text-emerald-500" /> {info.swState}</>
                  ) : (
                    <><XCircle size={15} className="text-rose-500" /> Ausente</>
                  )}
                </span>
              </div>

              <div className="p-3 rounded-2xl border bg-slate-50 flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Inscrição Push Ativa</span>
                <span className="font-black flex items-center gap-1.5">
                  {info.hasSubscription ? (
                    <><CheckCircle2 size={15} className="text-emerald-500" /> Inscrito no Google</>
                  ) : (
                    <><XCircle size={15} className="text-rose-500" /> Não Inscrito</>
                  )}
                </span>
              </div>
            </div>

            {/* Informações das Chaves VAPID */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-500 flex items-center gap-1">
                  <Key size={12} /> Chave Pública do Servidor:
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-700">
                  {info.serverVapidKeyPreview || 'Carregando...'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                As notificações são enviadas via Web Push padrão W3C (Google FCM / Apple APNs).
              </p>
            </div>

            {/* Ações de Recuperação */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleForceReSubscribe}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                <span>Reinscrever Este Aparelho Agora</span>
              </button>

              <button
                type="button"
                onClick={handleSendTest}
                disabled={testLoading || !info.hasSubscription}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Send size={15} className={testLoading ? 'animate-spin' : ''} />
                <span>Disparar Push de Teste Agora</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
