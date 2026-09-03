
import React, { useState, useEffect } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { Scissors, Mail, Loader2, AlertCircle, ArrowLeft, CheckCircle2, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface ForgotPasswordPageProps {
  onLoginClick: () => void;
}

export function ForgotPasswordPage({ onLoginClick }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Carregar e gerenciar cooldown de anti-spam
  useEffect(() => {
    const lastSent = localStorage.getItem('last_password_reset_sent');
    if (lastSent) {
      const elapsed = Math.floor((Date.now() - parseInt(lastSent, 10)) / 1000);
      const remaining = 60 - elapsed;
      if (remaining > 0) {
        setCooldownSeconds(remaining);
      }
    }
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) {
      setError(`Aguarde ${cooldownSeconds} segundos antes de solicitar um novo link de redefinição.`);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Informe um e-mail válido.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      localStorage.setItem('last_password_reset_sent', Date.now().toString());
      setCooldownSeconds(60);
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/too-many-requests') {
        setError('Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de tentar novamente.');
        setCooldownSeconds(120);
      } else if (err.code === 'auth/user-not-found') {
        // Mensagem genérica para não permitir enumeração de e-mails
        setSuccess(true);
      } else {
        setError('Não foi possível enviar o link no momento. Verifique o e-mail ou tente novamente mais tarde.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 mb-6">
            <Scissors className="text-zinc-950 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Recuperar senha</h1>
          <p className="text-zinc-400">Enviaremos um link para você redefinir sua senha</p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-xl space-y-6">
          {success ? (
            <div className="text-center space-y-6 py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/10 rounded-full text-emerald-500 mb-2">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">E-mail enviado!</h3>
                <p className="text-zinc-400 text-sm">Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.</p>
              </div>
              <button 
                onClick={onLoginClick}
                className="w-full bg-emerald-500 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10"
              >
                Voltar para o Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-red-500 text-sm">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">E-mail cadastrado</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading || cooldownSeconds > 0}
                className="w-full bg-emerald-500 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : cooldownSeconds > 0 ? (
                  <>
                    <Clock size={18} />
                    Aguarde {cooldownSeconds}s para reenviar
                  </>
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </button>

              <div className="text-center pt-4">
                <button 
                  type="button"
                  onClick={onLoginClick}
                  className="text-sm text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
                >
                  <ArrowLeft size={16} />
                  Voltar para o login
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
