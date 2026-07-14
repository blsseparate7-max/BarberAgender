import React, { useState } from 'react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import { Scissors, Mail, Lock, Loader2, AlertCircle, Chrome, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface LoginPageProps {
  onRegisterClick: () => void;
  onForgotClick: () => void;
  onBackToLanding?: () => void;
}

export function LoginPage({ onRegisterClick, onForgotClick, onBackToLanding }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
        setError('E-mail ou senha incorretos. Por favor, verifique suas credenciais.');
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

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 relative z-10"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 mb-6">
            <Scissors className="text-zinc-950 w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Bem-vindo de volta</h1>
          <p className="text-zinc-400 text-sm">Acesse sua conta para gerenciar ou agendar serviços</p>
        </div>

        <form onSubmit={handleLogin} className="bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-3xl shadow-xl space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/40 p-4 rounded-xl flex items-start gap-3 text-red-500 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
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
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Senha</label>
              <button 
                type="button" 
                onClick={onForgotClick}
                className="text-xs text-emerald-500 hover:text-emerald-400 font-bold"
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
                placeholder="Sua senha"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || googleLoading}
            className="w-full bg-emerald-500 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : 'Acessar Conta'}
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-950 px-2 text-[10px] font-bold text-zinc-500">Ou continue com</span>
            </div>
          </div>

          <button 
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
            className="w-full bg-zinc-900 text-white py-3 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-800"
          >
            {googleLoading ? <Loader2 className="animate-spin" size={18} /> : (
              <>
                <Chrome size={18} className="text-emerald-500" />
                Entrar com Google
              </>
            )}
          </button>


          <div className="text-center pt-4 space-y-4">
            <p className="text-xs text-zinc-500">
              Não tem uma conta?{' '}
              <button 
                type="button"
                onClick={onRegisterClick}
                className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors"
              >
                Cadastre-se agora
              </button>
            </p>

            {onBackToLanding && (
              <button 
                type="button"
                onClick={onBackToLanding}
                className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto pt-2"
              >
                <ArrowLeft size={14} />
                Voltar para a Página Inicial
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
