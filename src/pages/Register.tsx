import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getActiveTenantId } from '../services/tenantService';
import { Scissors, Mail, Lock, User, Loader2, AlertCircle, ArrowLeft, Chrome, Sparkles, Building2, Globe } from 'lucide-react';
import { motion } from 'motion/react';

interface RegisterPageProps {
  onLoginClick: () => void;
  initialRole?: 'cliente' | 'admin';
  onBackToLanding?: () => void;
}

export function RegisterPage({ onLoginClick, initialRole = 'cliente', onBackToLanding }: RegisterPageProps) {
  const [role, setRole] = useState<'cliente' | 'admin'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    setRole(initialRole);
  }, [initialRole]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('invite');
    if (ref) {
      setRefCode(ref);
    }
  }, []);

  const cleanSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9-]/g, '-') // replace non-alphanumeric with hyphen
      .replace(/-+/g, '-') // collapse consecutive hyphens
      .replace(/^-+|-+$/g, ''); // trim hyphens
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTenantSlug(cleanSlug(e.target.value));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (role === 'admin') {
      if (!tenantName.trim()) {
        setError('O nome da barbearia é obrigatório.');
        setLoading(false);
        return;
      }
      if (!tenantSlug.trim()) {
        setError('O link/identificador da barbearia é obrigatório.');
        setLoading(false);
        return;
      }
    }

    try {
      // 1. If register as admin, check if the tenant slug is already taken
      if (role === 'admin') {
        const tenantSnap = await getDoc(doc(db, 'tenants', tenantSlug));
        if (tenantSnap.exists()) {
          setError(`O identificador "${tenantSlug}" já está em uso por outra barbearia. Escolha outro.`);
          setLoading(false);
          return;
        }
      }

      // 2. Create the auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // 3. If admin, create tenant document
      const activeTenantId = role === 'admin' ? tenantSlug : getActiveTenantId();
      
      if (role === 'admin') {
        await setDoc(doc(db, 'tenants', tenantSlug), {
          id: tenantSlug,
          name: tenantName,
          accentColor: '#10B981', // Standard emerald for new tenant
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          phone: '',
          email: email,
          address: {
            street: '',
            city: '',
            state: '',
            zipCode: ''
          }
        });
        
        // Save tenant into localStorage to switch context
        localStorage.setItem('barberelite_tenant_id', tenantSlug);
      }

      // 4. Create user profile in Firestore
      await setDoc(doc(db, 'usuarios', user.uid), {
        uid: user.uid,
        email: user.email,
        nome: name,
        tipo: role, // 'admin' or 'cliente'
        ativo: true,
        tenantId: activeTenantId,
        indicadoPor: refCode || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O cadastro por e-mail ainda não foi habilitado no Console do Firebase.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else {
        setError('Erro ao criar conta. Tente novamente.');
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
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists
      const docRef = doc(db, 'usuarios', user.uid);
      const docSnap = await getDoc(docRef);
  
      if (!docSnap.exists()) {
        await setDoc(docRef, {
          uid: user.uid,
          email: user.email,
          nome: user.displayName || 'Usuário Google',
          tipo: 'cliente', // default google registration role is cliente
          ativo: true,
          tenantId: getActiveTenantId(),
          indicadoPor: refCode || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      console.error(err);
      setError('Erro ao entrar com Google. Tente novamente.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Background radial highlight */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6 relative z-10"
      >
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 mb-4">
            <Scissors className="text-zinc-950 w-7 h-7" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-1">
            {role === 'admin' ? 'Registre sua Barbearia' : 'Crie sua conta'}
          </h1>
          <p className="text-zinc-400 text-sm">
            {role === 'admin' ? 'Cadastre e gerencie sua barbearia com alta performance' : 'Junte-se a nós para agendar seus serviços em segundos'}
          </p>
        </div>

        {/* Custom Register Mode Switcher Tabs */}
        <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800" id="register-mode-tabs">
          <button
            type="button"
            onClick={() => setRole('cliente')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${role === 'cliente' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-white'}`}
          >
            Sou Cliente
          </button>
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${role === 'admin' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-white'}`}
          >
            Sou Barbearia/Dono
          </button>
        </div>

        <form onSubmit={handleRegister} className="bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-3xl shadow-xl space-y-5">
          {refCode && role === 'cliente' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 text-emerald-400 text-xs">
              <Sparkles className="shrink-0 text-emerald-400 mt-0.5 animate-pulse" size={16} />
              <div>
                <p className="font-bold uppercase tracking-wider">Indicação Ativa!</p>
                <p className="text-zinc-400 text-[10px] mt-0.5">Você receberá cashback e vantagens extras no seu primeiro agendamento!</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/40 p-4 rounded-xl flex items-start gap-3 text-red-500 text-xs">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* New Fields for Admin / Barbershop Registration */}
          {role === 'admin' && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Nome da Barbearia</label>
                <div className="relative">
                  <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    type="text" 
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Ex: Barbearia do João"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Link de Acesso Único</label>
                <div className="relative">
                  <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                  <input 
                    type="text" 
                    required
                    value={tenantSlug}
                    onChange={handleSlugChange}
                    placeholder="Ex: barbeariadojoao"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white font-mono"
                  />
                </div>
                {tenantSlug && (
                  <p className="text-[10px] text-zinc-500 ml-1">
                    Sua barbearia ficará disponível em: <span className="text-emerald-500">?tenant={tenantSlug}</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Seu Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="text" 
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || googleLoading}
            className="w-full bg-emerald-500 text-zinc-950 py-3 rounded-xl font-bold text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : (role === 'admin' ? 'Registrar Minha Barbearia' : 'Criar Minha Conta')}
          </button>

          {role === 'cliente' && (
            <>
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
            </>
          )}

          <div className="text-center pt-2 space-y-2">
            <button 
              type="button"
              onClick={onLoginClick}
              className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <ArrowLeft size={14} />
              Voltar para o login
            </button>

            {onBackToLanding && (
              <button 
                type="button"
                onClick={onBackToLanding}
                className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                Ir para a Página Inicial
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
