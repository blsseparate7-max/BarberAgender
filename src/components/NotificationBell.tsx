import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckSquare, Calendar, X, AlertTriangle, MessageSquare, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationService } from '../services/notificationService';
import { InAppNotification } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

/**
 * Função para tocar o som sintético (Web Audio API) agradável e cristalino
 */
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Primeiro tom (C5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.3);

    // Segundo tom (E5) após 0.08s
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.08); // E5
    gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(audioCtx.currentTime + 0.08);
    osc2.stop(audioCtx.currentTime + 0.4);

    // Terceiro tom (G5) após 0.16s
    const osc3 = audioCtx.createOscillator();
    const gain3 = audioCtx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.16); // G5
    gain3.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.16);
    gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc3.connect(gain3);
    gain3.connect(audioCtx.destination);
    osc3.start(audioCtx.currentTime + 0.16);
    osc3.stop(audioCtx.currentTime + 0.5);
  } catch (err) {
    console.error('Falha ao reproduzir áudio sintético:', err);
  }
}

export function NotificationBell() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  
  const mountTimeRef = useRef<Date>(new Date());
  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  const recipientId = profile?.tipo === 'admin' || profile?.tipo === 'gerente' 
    ? 'admin' 
    : (profile?.uid || '');

  // Escutar notificações do Firestore em tempo real
  useEffect(() => {
    if (!recipientId) return;

    const unsubscribe = notificationService.subscribeToNotifications(recipientId, (data) => {
      // Atualizar o estado das notificações
      setNotifications(data);

      // Tocar som e disparar toast apenas para notificações criadas APÓS a montagem da tela
      data.forEach(n => {
        const notifDate = n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt);
        const isAfterMount = notifDate.getTime() > mountTimeRef.current.getTime();
        
        if (isAfterMount && !n.read) {
          if (!notifiedIdsRef.current.has(n.id)) {
            notifiedIdsRef.current.add(n.id);
            
            // Tocar som de chime agradável
            playNotificationSound();
            
            // Disparar toast elegante com ação rápida de marcar como lido
            toast.info(n.title, {
              description: n.message,
              duration: 8000,
              action: {
                label: 'Lido',
                onClick: () => notificationService.markAsRead(n.id)
              }
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [recipientId]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await notificationService.markAsRead(id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!recipientId) return;
    try {
      await notificationService.markAllAsRead(recipientId);
      toast.success('Todas as notificações marcadas como lidas!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao marcar notificações.');
    }
  };

  // Ícones específicos baseados no tipo
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <Calendar size={15} className="text-emerald-600" />;
      case 'cancelled':
        return <AlertTriangle size={15} className="text-rose-500" />;
      case 'rescheduled':
        return <RefreshCw size={15} className="text-amber-500 animate-spin-slow" />;
      default:
        return <MessageSquare size={15} className="text-indigo-600" />;
    }
  };

  // Cor do fundo do ícone
  const getNotificationIconBg = (type: string) => {
    switch (type) {
      case 'created':
        return 'bg-emerald-50 border border-emerald-100';
      case 'cancelled':
        return 'bg-rose-50 border border-rose-100';
      case 'rescheduled':
        return 'bg-amber-50 border border-amber-100';
      default:
        return 'bg-indigo-50 border border-indigo-100';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button 
        id="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 text-slate-500 hover:text-primary transition-all relative bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-95"
        title="Notificações em Tempo Real"
      >
        <Bell size={20} className={unreadCount > 0 ? 'animate-bounce-slow text-indigo-600' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white rounded-full border border-white shadow-sm flex items-center justify-center text-[9px] font-black leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-3 w-80 sm:w-96 bg-white border border-slate-100 rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-indigo-600" />
                <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Notificações</span>
                {unreadCount > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} novas
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllAsRead}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline font-black uppercase tracking-wider flex items-center gap-1"
                >
                  <CheckSquare size={12} />
                  Ler tudo
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="px-6 py-12 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                    <Bell size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">Tudo limpo por aqui!</p>
                    <p className="text-[11px] text-slate-400 mt-1">Você receberá atualizações de agendamentos em tempo real.</p>
                  </div>
                </div>
              ) : (
                notifications.map((notif) => {
                  const notifDate = notif.createdAt instanceof Date ? notif.createdAt : new Date(notif.createdAt);
                  const formattedTime = isNaN(notifDate.getTime()) 
                    ? '' 
                    : notifDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = isNaN(notifDate.getTime()) 
                    ? '' 
                    : notifDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                  return (
                    <div 
                      key={notif.id} 
                      className={`p-4 flex gap-3.5 hover:bg-slate-50/70 transition-colors ${!notif.read ? 'bg-indigo-50/20' : ''}`}
                    >
                      {/* Ícone de Tipo */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${getNotificationIconBg(notif.type)}`}>
                        {getNotificationIcon(notif.type)}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={`text-xs leading-snug break-words ${!notif.read ? 'font-extrabold text-slate-900' : 'font-medium text-slate-600'}`}>
                            {notif.title}
                          </p>
                          <span className="text-[9px] text-slate-400 shrink-0 font-semibold whitespace-nowrap mt-0.5">
                            {formattedDate} - {formattedTime}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed break-words">
                          {notif.message}
                        </p>
                        
                        {/* Ação rápida */}
                        {!notif.read && (
                          <button
                            onClick={(e) => handleMarkAsRead(e, notif.id)}
                            className="mt-2.5 flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-600 font-extrabold transition-colors uppercase tracking-wider"
                          >
                            <Check size={11} strokeWidth={3} />
                            Marcar como Lida
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
