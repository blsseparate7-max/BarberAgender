
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { TabId, UserProfile, UserRole } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isGerente: boolean;
  isBarbeiro: boolean;
  isCliente: boolean;
  isSaaSAdmin: boolean;
  overrideRole: UserRole | null;
  setOverrideRole: (role: UserRole | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isGerente: false,
  isBarbeiro: false,
  isCliente: false,
  isSaaSAdmin: false,
  overrideRole: null,
  setOverrideRole: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideRole, setOverrideRoleState] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('barberelite_override_role');
    return saved ? (saved as UserRole) : null;
  });

  const setOverrideRole = (role: UserRole | null) => {
    setOverrideRoleState(role);
    if (role) {
      localStorage.setItem('barberelite_override_role', role);
    } else {
      localStorage.removeItem('barberelite_override_role');
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen to profile changes
        const unsubscribeProfile = onSnapshot(doc(db, 'usuarios', firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            console.log("No profile document found for UID:", firebaseUser.uid);
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching profile (UID: " + firebaseUser.uid + "):", error);
          setLoading(false);
        });

        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const isSaaSAdminUser = profile?.email === 'barber@admin.ai' || user?.email === 'barber@admin.ai' || profile?.tipo === 'saas_admin';
  const activeRole = (isSaaSAdminUser && overrideRole) || 
    (isSaaSAdminUser
      ? 'saas_admin' 
      : (profile?.tipo || 'cliente'));

  const adjustedProfile = React.useMemo(() => {
    if (profile) {
      return { ...profile, tipo: activeRole };
    }
    return {
      uid: user?.uid || 'temp-uid',
      email: user?.email || '',
      nome: user?.displayName || 'Usuário Simulado',
      tipo: activeRole,
      ativo: true
    } as UserProfile;
  }, [profile, user?.uid, user?.email, user?.displayName, activeRole]);

  const value = React.useMemo(() => {
    return {
      user,
      profile: adjustedProfile,
      loading,
      isAdmin: activeRole === 'admin',
      isGerente: activeRole === 'gerente',
      isBarbeiro: activeRole === 'barbeiro',
      isCliente: activeRole === 'cliente',
      isSaaSAdmin: activeRole === 'saas_admin',
      overrideRole,
      setOverrideRole,
    };
  }, [user, adjustedProfile, loading, overrideRole, activeRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
