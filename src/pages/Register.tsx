import React, { useState, useEffect, useRef } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { getActiveTenantId } from '../services/tenantService';
import { userService } from '../services/userService';
import { 
  Scissors, Mail, Lock, User, Loader2, AlertCircle, ArrowLeft, Chrome, 
  Sparkles, Building2, Globe, Phone, MapPin, CheckCircle2, KeyRound, 
  Calendar, HeartHandshake, ShieldCheck, Eye, EyeOff, Cake, Tag
} from 'lucide-react';
import { motion } from 'motion/react';

interface RegisterPageProps {
  onLoginClick: () => void;
  initialRole?: 'cliente' | 'admin';
  onBackToLanding?: () => void;
}

const PREFERENCE_SUGGESTIONS = [
  "Degradê Navalhado",
  "Corte na Tesoura",
  "Barba Desenhada",
  "Corte Social",
  "Sobrancelha",
  "Atendimento Silencioso",
  "Café / Bebida"
];

export function RegisterPage({ onLoginClick, initialRole = 'cliente', onBackToLanding }: RegisterPageProps) {
  const [role, setRole] = useState<'cliente' | 'admin'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [preferences, setPreferences] = useState('');
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Barbershop Admin fields
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantCity, setTenantCity] = useState('');
  const [tenantState, setTenantState] = useState('');
  const [tenantStreet, setTenantStreet] = useState('');
  const [tenantZipCode, setTenantZipCode] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [refCode, setRefCode] = useState<string | null>(null);
  const [linkClientId, setLinkClientId] = useState<string | null>(null);
  const [linkingProfile, setLinkingProfile] = useState<any | null>(null);
  const [loadingLinkingProfile, setLoadingLinkingProfile] = useState(false);
  const [showResetPasswordBtn, setShowResetPasswordBtn] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref') || params.get('invite');
    if (ref) {
      setRefCode(ref);
    }

    const linkId = params.get('link_client_id') || params.get('link_id');
    if (linkId) {
      setLinkClientId(linkId);
      loadLinkingProfile(linkId);
    }
  }, []);

  const loadLinkingProfile = async (id: string) => {
    setLoadingLinkingProfile(true);
    try {
      const snap = await getDoc(doc(db, 'usuarios', id));
      if (snap.exists()) {
        const data = snap.data();
        setLinkingProfile(data);
        if (data.nome) setName(data.nome);
        if (data.telefone || data.phone) {
          setPhone(data.telefone || data.phone || '');
        }
        if (data.email && !data.email.includes('placeholder') && !data.email.includes('manual_') && !data.email.includes('sem_email') && !data.email.includes('sem-email')) {
          setEmail(data.email);
        }
        if (data.data_nascimento || data.birthDate || data.dataNascimento || data.aniversario) {
          setBirthDate(data.data_nascimento || data.birthDate || data.dataNascimento || data.aniversario || '');
        }
        if (data.preferencias || data.preferences) {
          setPreferences(data.preferencias || data.preferences || '');
        }
        if (data.cpf || data.cpfCnpj) {
          setCpf(data.cpf || data.cpfCnpj || '');
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar perfil para vinculação:", err);
    } finally {
      setLoadingLinkingProfile(false);
    }
  };

  // Check if this profile has already been activated and linked
  const isAlreadyLinked = Boolean(
    linkingProfile && (
      linkingProfile.isLinked === true ||
      linkingProfile.hasLogin === true ||
      (linkingProfile.email && !linkingProfile.email.includes('placeholder') && !linkingProfile.email.includes('manual_') && !linkingProfile.email.includes('sem_email') && !linkingProfile.email.includes('sem-email') && linkingProfile.isPreRegistered === false) ||
      linkingProfile.ativo === false ||
      (linkingProfile as any).mergedInto
    )
  );

  const handleResetPassword = async (targetEmail?: string) => {
    const emailToUse = (targetEmail || email || linkingProfile?.email || '').trim();
    if (!emailToUse || emailToUse.includes('placeholder') || emailToUse.includes('manual_')) {
      setError("Por favor, informe um e-mail válido para receber o link de redefinição.");
      return;
    }
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, emailToUse);
      setSuccessMessage(`Link de redefinição enviado com sucesso para ${emailToUse}! Verifique sua caixa de entrada e spam.`);
      setError('');
    } catch (err: any) {
      setError("Não foi possível enviar o e-mail de redefinição: " + (err.message || err.toString()));
    } finally {
      setSendingReset(false);
    }
  };

  const togglePreferenceTag = (tag: string) => {
    const current = preferences ? preferences.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (current.includes(tag)) {
      const updated = current.filter(t => t !== tag);
      setPreferences(updated.join(', '));
    } else {
      const updated = [...current, tag];
      setPreferences(updated.join(', '));
    }
  };

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

  const migrateClientProfile = async (userUid: string, userEmail: string, userDisplayName: string) => {
    const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } = await import('firebase/firestore');
    
    // Fetch manual client profile
    const oldDocRef = doc(db, 'usuarios', linkClientId || '');
    const oldSnap = await getDoc(oldDocRef);
    let oldData: any = {};
    if (oldSnap.exists()) {
      oldData = oldSnap.data();
    }

    const resolvedName = name || userDisplayName || oldData.nome || '';
    const resolvedEmail = userEmail || email || oldData.email || '';
    const activeTenantId = getActiveTenantId() || oldData.tenantId || null;

    // 1. Create/override the new profile under the Auth UID with full completed info
    await setDoc(doc(db, 'usuarios', userUid), {
      ...oldData,
      uid: userUid,
      nome: resolvedName,
      email: resolvedEmail.toLowerCase().trim(),
      telefone: phone || oldData.telefone || oldData.phone || '',
      phone: (phone || oldData.telefone || oldData.phone || '').replace(/\D/g, ''),
      data_nascimento: birthDate || oldData.data_nascimento || oldData.birthDate || '',
      birthDate: birthDate || oldData.birthDate || oldData.data_nascimento || '',
      aniversario: birthDate || oldData.aniversario || '',
      preferencias: preferences || oldData.preferencias || oldData.preferences || '',
      preferences: preferences || oldData.preferences || oldData.preferencias || '',
      cpf: cpf || oldData.cpf || oldData.cpfCnpj || '',
      tipo: 'cliente',
      isLinked: true,
      hasLogin: true,
      isPreRegistered: false,
      linkedAt: serverTimestamp(),
      ativo: true,
      tenantId: activeTenantId,
      updatedAt: serverTimestamp(),
    });

    // 2. Safely deactivate and attempt to delete old manual client doc
    if (linkClientId && linkClientId !== userUid) {
      try {
        await updateDoc(oldDocRef, {
          ativo: false,
          isLinked: true,
          mergedInto: userUid,
          updatedAt: serverTimestamp()
        });
      } catch (updateErr) {
        console.warn("Could not mark old manual client doc as inactive:", updateErr);
      }

      try {
        await deleteDoc(oldDocRef);
      } catch (delErr) {
        console.warn("Client side delete restricted by rules, calling server merge fallback.");
      }

      // Call backend API to guarantee complete cleanup
      try {
        await fetch('/api/clients/merge-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primaryUid: userUid,
            duplicateUid: linkClientId,
            tenantId: activeTenantId
          })
        });
      } catch (mergeApiErr) {
        console.warn("Server merge duplicate fallback finished:", mergeApiErr);
      }
    }

    // 3. Migrate appointments
    const appointmentsRef = collection(db, 'appointments');
    const apptQuery = query(appointmentsRef, where('cliente_id', '==', linkClientId));
    const apptSnapshot = await getDocs(apptQuery);
    if (!apptSnapshot.empty) {
      const batch = writeBatch(db);
      apptSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          cliente_id: userUid,
          cliente_name: resolvedName,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 4. Migrate loyalty record
    const oldLoyaltyId = `${activeTenantId}_${linkClientId}`;
    const newLoyaltyId = `${activeTenantId}_${userUid}`;
    if (oldLoyaltyId !== newLoyaltyId) {
      const oldLoyaltyRef = doc(db, 'loyalty_points', oldLoyaltyId);
      const oldLoyaltySnap = await getDoc(oldLoyaltyRef);
      if (oldLoyaltySnap.exists()) {
        const oldLoyaltyData = oldLoyaltySnap.data();
        await setDoc(doc(db, 'loyalty_points', newLoyaltyId), {
          ...oldLoyaltyData,
          cliente_id: userUid,
          updatedAt: serverTimestamp()
        });
        try {
          await deleteDoc(oldLoyaltyRef);
        } catch (_) {}
      }
    }

    // 5. Migrate loyalty history
    const loyaltyHistoryRef = collection(db, 'loyalty_history');
    const historyQuery = query(loyaltyHistoryRef, where('cliente_id', '==', linkClientId));
    const historySnapshot = await getDocs(historyQuery);
    if (!historySnapshot.empty) {
      const batch = writeBatch(db);
      historySnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          cliente_id: userUid,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 6. Migrate package sales (pacotes_vendas)
    const pkgsRef = collection(db, 'pacotes_vendas');
    const pkgsQuery = query(pkgsRef, where('clientId', '==', linkClientId));
    const pkgsSnapshot = await getDocs(pkgsQuery);
    if (!pkgsSnapshot.empty) {
      const batch = writeBatch(db);
      pkgsSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          clientId: userUid,
          clientName: resolvedName,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 7. Migrate subscriptions (assinaturas)
    const subsRef = collection(db, 'assinaturas');
    const subsQuery = query(subsRef, where('clientId', '==', linkClientId));
    const subsSnapshot = await getDocs(subsQuery);
    if (!subsSnapshot.empty) {
      const batch = writeBatch(db);
      subsSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          clientId: userUid,
          clientName: resolvedName,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 8. Migrate comandas
    const comandasRef = collection(db, 'comandas');
    const comandasQuery = query(comandasRef, where('cliente_id', '==', linkClientId));
    const comandasSnapshot = await getDocs(comandasQuery);
    if (!comandasSnapshot.empty) {
      const batch = writeBatch(db);
      comandasSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          cliente_id: userUid,
          cliente_nome: resolvedName,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 9. Migrate client debts (client_debts)
    const debtsRef = collection(db, 'client_debts');
    const debtsQuery = query(debtsRef, where('cliente_id', '==', linkClientId));
    const debtsSnapshot = await getDocs(debtsQuery);
    if (!debtsSnapshot.empty) {
      const batch = writeBatch(db);
      debtsSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          cliente_id: userUid,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }

    // 10. Migrate debt payments (debt_payments)
    const debtPaymentsRef = collection(db, 'debt_payments');
    const paymentsQuery = query(debtPaymentsRef, where('cliente_id', '==', linkClientId));
    const paymentsSnapshot = await getDocs(paymentsQuery);
    if (!paymentsSnapshot.empty) {
      const batch = writeBatch(db);
      paymentsSnapshot.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, { 
          cliente_id: userUid,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (linkClientId && confirmPassword && password !== confirmPassword) {
      setError('As senhas digitadas não coincidem. Por favor, confira a senha.');
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

    // Check duplicate phone if provided
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone) {
      if (cleanPhone.length < 10) {
        setError('Por favor, informe um número de WhatsApp/Telefone válido com DDD.');
        setLoading(false);
        return;
      }
      try {
        const activeTid = role === 'admin' ? tenantSlug : getActiveTenantId();
        const phoneCheck = await userService.checkPhoneExists(phone, linkClientId || undefined, activeTid);
        if (phoneCheck.exists && !linkClientId) {
          setError(`O telefone "${phone}" já está cadastrado nesta barbearia para o cliente ${phoneCheck.user?.nome || ''}. Utilize outro número ou entre em contato com a recepção.`);
          setLoading(false);
          return;
        }
      } catch (phoneErr) {
        console.warn("Could not verify phone uniqueness:", phoneErr);
      }
    }

    try {
      if (role === 'admin') {
        const tenantSnap = await getDoc(doc(db, 'tenants', tenantSlug));
        if (tenantSnap.exists()) {
          setError(`O identificador "${tenantSlug}" já está em uso por outra barbearia. Escolha outro.`);
          setLoading(false);
          return;
        }
      }

      let user: any = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        await updateProfile(user, { displayName: name });

        try {
          await sendEmailVerification(user);
          if (!linkClientId) {
            setSuccessMessage('Um e-mail de verificação foi enviado para você. Por favor, confirme para validar sua conta.');
          }
        } catch (emailErr) {
          console.warn("Could not send email verification:", emailErr);
        }
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use' && linkClientId) {
          try {
            const signInRes = await signInWithEmailAndPassword(auth, email, password);
            user = signInRes.user;
          } catch (signInErr: any) {
            console.warn("Sign in with existing account failed:", signInErr);
            setShowResetPasswordBtn(true);
            setError('Este e-mail já possui um cadastro no sistema. Digite a senha exata da sua conta para conectar ou clique em "Enviar Link para Redefinir Senha" abaixo.');
            setLoading(false);
            return;
          }
        } else {
          throw authErr;
        }
      }

      if (!user) {
        setError('Não foi possível obter a credencial do usuário. Tente novamente.');
        setLoading(false);
        return;
      }

      const activeTenantId = role === 'admin' ? tenantSlug : getActiveTenantId();
      const tenantIdValue = activeTenantId || null;
      
      if (role === 'admin') {
        await setDoc(doc(db, 'tenants', tenantSlug), {
          id: tenantSlug,
          name: tenantName,
          accentColor: '#10B981',
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          phone: tenantPhone || '(11) 99999-9999',
          email: email,
          address: {
            street: tenantStreet || 'Av. Principal, 100',
            city: tenantCity || 'São Paulo',
            state: tenantState || 'SP',
            zipCode: tenantZipCode || '01000-000'
          }
        });
        localStorage.setItem('barberelite_tenant_id', tenantSlug);
      }

      if (linkClientId) {
        await migrateClientProfile(user.uid, user.email || email, name);
      } else {
        const { collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
        const usersRef = collection(db, 'usuarios');
        const q = query(usersRef, where('email', '==', email.toLowerCase().trim()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const preRegisteredDoc = querySnapshot.docs[0];
          const preRegisteredData = preRegisteredDoc.data();
          const preRegisteredId = preRegisteredDoc.id;

          await setDoc(doc(db, 'usuarios', user.uid), {
            ...preRegisteredData,
            uid: user.uid,
            nome: name || preRegisteredData.nome,
            email: user.email?.toLowerCase().trim(),
            telefone: phone || preRegisteredData.telefone,
            phone: (phone || preRegisteredData.telefone || '').replace(/\D/g, ''),
            data_nascimento: birthDate || preRegisteredData.data_nascimento || '',
            preferencias: preferences || preRegisteredData.preferencias || '',
            cpf: cpf || preRegisteredData.cpf || '',
            ativo: true,
            hasLogin: true,
            isLinked: true,
            updatedAt: serverTimestamp()
          });

          if (preRegisteredId !== user.uid) {
            try {
              await deleteDoc(doc(db, 'usuarios', preRegisteredId));
            } catch (delErr) {
              console.warn("Could not delete old pre-registered user document:", delErr);
            }
          }
        } else {
          await setDoc(doc(db, 'usuarios', user.uid), {
            uid: user.uid,
            email: user.email?.toLowerCase().trim() || email.toLowerCase().trim(),
            nome: name,
            telefone: phone,
            phone: phone.replace(/\D/g, ''),
            data_nascimento: birthDate || '',
            preferencias: preferences || '',
            cpf: cpf || '',
            tipo: role,
            isLinked: true,
            hasLogin: true,
            linkedAt: serverTimestamp(),
            ativo: true,
            tenantId: tenantIdValue,
            indicadoPor: refCode || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }

    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O cadastro por e-mail ainda não foi habilitado no Console do Firebase. Ative "E-mail/senha" em Authentication > Sign-in method.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso.');
      } else {
        setError(`Erro ao criar conta: ${err.message || err.toString()}`);
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

      const docRef = doc(db, 'usuarios', user.uid);
      const docSnap = await getDoc(docRef);
  
      if (linkClientId) {
        await migrateClientProfile(user.uid, user.email || '', user.displayName || '');
      } else if (!docSnap.exists()) {
        const { collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
        const usersRef = collection(db, 'usuarios');
        const q = query(usersRef, where('email', '==', user.email?.toLowerCase().trim()));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const preRegisteredDoc = querySnapshot.docs[0];
          const preRegisteredData = preRegisteredDoc.data();
          const preRegisteredId = preRegisteredDoc.id;

          await setDoc(docRef, {
            ...preRegisteredData,
            uid: user.uid,
            nome: user.displayName || preRegisteredData.nome,
            email: user.email?.toLowerCase().trim(),
            ativo: true,
            hasLogin: true,
            isLinked: true,
            updatedAt: serverTimestamp()
          });

          if (preRegisteredId !== user.uid) {
            await deleteDoc(doc(db, 'usuarios', preRegisteredId));
          }
        } else {
          await setDoc(docRef, {
            uid: user.uid,
            email: user.email,
            nome: user.displayName || 'Usuário Google',
            tipo: 'cliente',
            ativo: true,
            hasLogin: true,
            isLinked: true,
            tenantId: getActiveTenantId(),
            indicadoPor: refCode || null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
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
            {linkClientId ? 'Finalize seu Cadastro na Barbearia' : 'Crie sua conta de Cliente'}
          </h1>
          <p className="text-zinc-400 text-sm">
            {linkClientId 
              ? (linkingProfile ? `Olá, ${linkingProfile.nome}! Complete seus dados e crie sua senha de acesso.` : 'Carregando detalhes da sua ficha...')
              : 'Junte-se a nós para agendar seus serviços e acompanhar seus pontos de fidelidade'}
          </p>
        </div>

        {/* CASE 1: CLIENT IS ALREADY LINKED (PREVENT DUPLICATION) */}
        {linkClientId && isAlreadyLinked && !loadingLinkingProfile ? (
          <div className="bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-3xl shadow-xl space-y-5">
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl space-y-3 text-center">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-white">Cliente Já Vinculado ao Sistema</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Olá, <strong className="text-emerald-400">{linkingProfile?.nome || 'Cliente'}</strong>! Sua conta já foi ativada e está vinculada no sistema.
                </p>
              </div>
            </div>

            <div className="bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800 text-xs space-y-2 text-zinc-300">
              <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Dados da sua Conta Ativa</p>
              <p>👤 <strong>Nome:</strong> {linkingProfile?.nome}</p>
              {(linkingProfile?.telefone || linkingProfile?.phone) && (
                <p>📱 <strong>WhatsApp:</strong> {linkingProfile.telefone || linkingProfile.phone}</p>
              )}
              {linkingProfile?.email && !linkingProfile.email.includes('placeholder') && !linkingProfile.email.includes('manual_') && (
                <p>✉️ <strong>E-mail de Acesso:</strong> <span className="text-emerald-400 font-mono">{linkingProfile.email}</span></p>
              )}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-xs text-amber-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle size={15} className="shrink-0" />
                Deseja alterar ou recuperar sua senha?
              </p>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                Para sua segurança, não é possível criar outro cadastro duplicado. Clique abaixo para receber o link de redefinição de senha diretamente no seu e-mail.
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/40 p-3 rounded-xl flex items-start gap-2 text-red-400 text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/40 p-4 rounded-xl flex items-start gap-3 text-emerald-400 text-xs">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => handleResetPassword(linkingProfile?.email)}
                disabled={sendingReset}
                className="w-full bg-emerald-500 text-zinc-950 py-3.5 rounded-xl font-black text-xs hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {sendingReset ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
                Alterar / Recuperar Senha por E-mail
              </button>

              <button
                type="button"
                onClick={onLoginClick}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 py-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                Fazer Login no Portal
              </button>
            </div>

            <div className="text-center pt-2">
              <button 
                type="button"
                onClick={onLoginClick}
                className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2 mx-auto"
              >
                <ArrowLeft size={14} />
                Voltar para o login
              </button>
            </div>
          </div>
        ) : (
          /* CASE 2: NORMAL OR FIRST ACTIVATION REGISTRATION FORM */
          <form onSubmit={handleRegister} className="bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-3xl shadow-xl space-y-5">
            {linkingProfile && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-wider">
                  <Sparkles className="animate-pulse shrink-0" size={16} />
                  <span>Ficha Localizada — Complete seu Cadastro</span>
                </div>
                <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80 text-xs space-y-1 text-zinc-300">
                  <p>👤 <strong>Nome:</strong> {linkingProfile.nome}</p>
                  {(linkingProfile.telefone || linkingProfile.phone) && (
                    <p>📱 <strong>WhatsApp:</strong> {linkingProfile.telefone || linkingProfile.phone}</p>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Preencha os campos abaixo e crie sua senha para ativar seu histórico de visitas e agendamentos instantaneamente.
                </p>
              </div>
            )}

            {refCode && role === 'cliente' && !linkClientId && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-xl flex items-start gap-3 text-emerald-400 text-xs">
                <Sparkles className="shrink-0 text-emerald-400 mt-0.5 animate-pulse" size={16} />
                <div>
                  <p className="font-bold uppercase tracking-wider">Indicação Ativa!</p>
                  <p className="text-zinc-400 text-[10px] mt-0.5">Você receberá cashback e vantagens extras no seu primeiro agendamento!</p>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/40 p-4 rounded-xl flex flex-col gap-2 text-red-400 text-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-500" />
                  <span>{error}</span>
                </div>
                {showResetPasswordBtn && (
                  <button
                    type="button"
                    onClick={() => handleResetPassword()}
                    className="mt-1 self-start bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <KeyRound size={14} />
                    Enviar Link para Redefinir Senha
                  </button>
                )}
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-500/10 border border-emerald-500/40 p-4 rounded-xl flex items-start gap-3 text-emerald-400 text-xs">
                <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                <span>{successMessage}</span>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Telefone da Barbearia</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                      type="text" 
                      required
                      value={tenantPhone}
                      onChange={(e) => setTenantPhone(e.target.value)}
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Rua / Logradouro</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                      type="text" 
                      required
                      value={tenantStreet}
                      onChange={(e) => setTenantStreet(e.target.value)}
                      placeholder="Ex: Avenida Paulista, 1000"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Cidade</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input 
                        type="text" 
                        required
                        value={tenantCity}
                        onChange={(e) => setTenantCity(e.target.value)}
                        placeholder="Ex: São Paulo"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-1">Estado (UF)</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                      <input 
                        type="text" 
                        required
                        maxLength={2}
                        value={tenantState}
                        onChange={(e) => setTenantState(e.target.value.toUpperCase())}
                        placeholder="Ex: SP"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white uppercase"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Nome Completo */}
            <div className="space-y-1">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Seu Nome Completo</label>
                {linkClientId && linkingProfile?.nome && (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Cadastrado pela Barbearia</span>
                )}
              </div>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input 
                  type="text" 
                  required
                  disabled={Boolean(linkClientId && linkingProfile?.nome)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* WhatsApp / Telefone */}
            <div className="space-y-1">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">WhatsApp / Telefone</label>
                {linkClientId && (linkingProfile?.telefone || linkingProfile?.phone) && (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Cadastrado pela Barbearia</span>
                )}
              </div>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input 
                  type="tel" 
                  required
                  disabled={Boolean(linkClientId && (linkingProfile?.telefone || linkingProfile?.phone))}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* E-mail de Acesso */}
            <div className="space-y-1">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">E-mail de Acesso</label>
                {linkClientId && linkingProfile?.email && !linkingProfile?.email.includes('placeholder') && !linkingProfile?.email.includes('manual_') && (
                  <span className="text-[10px] text-emerald-400 font-medium">E-mail da Ficha</span>
                )}
              </div>
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

            {/* COMPLETION FIELDS FOR CLIENTS: Aniversário, Preferências, CPF */}
            {role === 'cliente' && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4 pt-2 border-t border-zinc-800/60"
              >
                {/* Data de Aniversário */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Cake size={13} className="text-emerald-400" />
                      Data de Nascimento / Aniversário
                    </label>
                    <span className="text-[9px] text-zinc-500">Para mimos e descontos</span>
                  </div>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                      type="date" 
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                    />
                  </div>
                </div>

                {/* Preferências de Corte & Atendimento */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag size={13} className="text-emerald-400" />
                      Suas Preferências de Corte & Estilo
                    </label>
                    <span className="text-[9px] text-zinc-500">Opcional</span>
                  </div>
                  
                  {/* Quick Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {PREFERENCE_SUGGESTIONS.map((tag) => {
                      const isSelected = preferences.toLowerCase().includes(tag.toLowerCase());
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => togglePreferenceTag(tag)}
                          className={`text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-all border ${
                            isSelected 
                              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' 
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{tag}
                        </button>
                      );
                    })}
                  </div>

                  <input 
                    type="text" 
                    value={preferences}
                    onChange={(e) => setPreferences(e.target.value)}
                    placeholder="Ex: Degradê navalhado, barba desenhada, corte na tesoura..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white"
                  />
                </div>

                {/* CPF (opcional) */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1 flex items-center justify-between">
                    <span>CPF</span>
                    <span className="text-[9px] text-zinc-500">Opcional (para recibos / assinaturas)</span>
                  </label>
                  <input 
                    type="text" 
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-3 text-xs focus:outline-none focus:border-emerald-500/50 transition-colors text-white font-mono"
                  />
                </div>
              </motion.div>
            )}

            {/* Senha e Confirmação */}
            <div className="space-y-3 pt-2 border-t border-zinc-800/60">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-emerald-400 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                  <KeyRound size={13} />
                  {linkClientId ? 'Cadastre sua Nova Senha de Acesso' : 'Senha de Acesso'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua nova senha (mín. 6 caracteres)"
                    className="w-full bg-zinc-950 border border-emerald-500/40 focus:border-emerald-400 rounded-xl py-3 pl-12 pr-10 text-xs focus:outline-none transition-colors text-white shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {linkClientId && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">
                    Confirme sua Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita sua nova senha"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500/50 rounded-xl py-3 pl-12 pr-4 text-xs focus:outline-none transition-colors text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              disabled={loading || googleLoading}
              className="w-full bg-emerald-500 text-zinc-950 py-3.5 rounded-xl font-black text-sm hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : (
                role === 'admin' 
                  ? 'Registrar Minha Barbearia' 
                  : (linkClientId ? 'Concluir Cadastro e Acessar' : 'Criar Minha Conta')
              )}
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
                  className="w-full bg-zinc-900 text-white py-3.5 rounded-xl font-bold text-xs hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-800"
                >
                  {googleLoading ? <Loader2 className="animate-spin" size={18} /> : (
                    <>
                      <Chrome size={18} className="text-emerald-500" />
                      {linkClientId ? 'Concluir e Vincular com Google em 1 Clique' : 'Entrar com Google'}
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

              <div className="pt-3 border-t border-zinc-800/80">
                <p className="text-[11px] text-zinc-400">
                  É dono de barbearia e quer testar o sistema?{' '}
                  <a 
                    href="https://wa.me/5543999227226?text=Ol%C3%A1!%20Sou%20dono%20de%20barbearia%20e%20gostaria%20de%20solicitar%20meu%20acesso%20para%20testar%20o%20sistema." 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline font-bold"
                  >
                    Fale com nosso Suporte no WhatsApp
                  </a>
                </p>
              </div>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
