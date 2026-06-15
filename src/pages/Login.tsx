
import React, { useState } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { Scissors, Mail, Lock, Loader2, AlertCircle, Chrome, Database } from 'lucide-react';
import { motion } from 'motion/react';
import { bootstrapService } from '../services/bootstrapService';
import { toast } from 'sonner';

interface LoginPageProps {
  onRegisterClick: () => void;
  onForgotClick: () => void;
}

export function LoginPage({ onRegisterClick, onForgotClick }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O login por e-mail ainda não foi habilitado no Console do Firebase.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Credenciais inválidas. Se você está tentando usar as contas de teste reais, certifique-se de ter clicado em "Configurar Contas Reais de Teste (Firebase)" abaixo.');
      } else {
        setError('Erro ao entrar: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao entrar com Google. Tente novamente.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSeed = async () => {
    setSeedLoading(true);
    try {
      const results = await bootstrapService.bootstrap();
      console.table(results);
      
      const errors = results.filter(r => r.status === 'error');
      if (errors.length > 0) {
        toast.error('Algumas contas não puderam ser criadas/validadas. Verifique o console.');
      } else {
        toast.success('Contas reais de teste prontas no Firebase!');
      }
    } catch (err: any) {
      toast.error('Erro ao configurar contas: ' + err.message);
    } finally {
      setSeedLoading(false);
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
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Bem-vindo de volta</h1>
          <p className="text-zinc-400">Acesse sua conta para gerenciar sua barbearia</p>
        </div>

        <form onSubmit={handleLogin} className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-xl space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-red-500 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider ml-1">E-mail</label>
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

          <div className="space-y-2">
            <div className="flex justify-between items-center ml-1">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Senha</label>
              <button 
                type="button"
                onClick={onForgotClick}
                className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || googleLoading}
            className="w-full bg-emerald-500 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Entrar no Sistema'}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-900 px-2 text-zinc-500">Ou continue com</span>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="w-full bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700"
          >
            {googleLoading ? <Loader2 className="animate-spin" size={18} /> : (
              <>
                <Chrome size={18} className="text-emerald-500" />
                Entrar com Google
              </>
            )}
          </button>

          <div className="text-center pt-4 space-y-6">
            <div className="space-y-3">
              <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Acesso Rápido (Contas de Teste)</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button 
                  type="button"
                  onClick={() => { setEmail('admin@admin.com'); setPassword('admin123'); }}
                  className="px-3 py-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
                >
                  Admin
                </button>
                <button 
                  type="button"
                  onClick={() => { setEmail('gerente@gerente.com'); setPassword('gerente'); }}
                  className="px-3 py-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
                >
                  Gerente
                </button>
                <button 
                  type="button"
                  onClick={() => { setEmail('cliente@cliente.com'); setPassword('cliente'); }}
                  className="px-3 py-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
                >
                  Cliente
                </button>
                <button 
                  type="button"
                  onClick={() => { setEmail('barbeiro@gmail.com'); setPassword('barbeiro'); }}
                  className="px-3 py-1.5 bg-zinc-800/50 border border-zinc-700 rounded-lg text-[10px] font-bold text-zinc-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
                >
                  Barbeiro
                </button>
              </div>
            </div>

            <p className="text-sm text-zinc-500">
              Não tem uma conta?{' '}
              <button 
                type="button"
                onClick={onRegisterClick}
                className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors"
              >
                Cadastre-se agora
              </button>
            </p>

            <button 
              type="button"
              onClick={handleSeed}
              disabled={seedLoading}
              className={`inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                error.includes('Configurar Contas Reais') 
                  ? 'text-emerald-500 scale-110 animate-pulse' 
                  : 'text-zinc-600 hover:text-emerald-500'
              }`}
            >
              {seedLoading ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
              Configurar Contas Reais de Teste (Firebase)
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
