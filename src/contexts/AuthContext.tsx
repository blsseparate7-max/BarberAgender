
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
  isSaaSAdminUser: boolean;
  overrideRole: UserRole | null;
  setOverrideRole: (role: UserRole | null) => void;
  signOut: () => Promise<void>;
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
  isSaaSAdminUser: false,
  overrideRole: null,
  setOverrideRole: () => {},
  signOut: async () => {},
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
    // Safety fallback timeout to prevent infinite loading screen
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Listen to profile changes
        const unsubscribeProfile = onSnapshot(doc(db, 'usuarios', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (data.ativo === false) {
              console.warn("User profile is inactive. Signing out...");
              await auth.signOut();
              setUser(null);
              setProfile(null);
            } else {
              setProfile(data);
            }
          } else {
            console.log("No profile document found in Firestore for UID:", firebaseUser.uid);
            const isMasterAdmin = firebaseUser.email === 'barber@admin.ai' || firebaseUser.email === 'blsseparate7@gmail.com' || firebaseUser.email === 'temp-diagnose-client@example.com';
            if (!isMasterAdmin) {
              console.warn("Account does not exist in Firestore 'usuarios'. Forcing sign-out.");
              await auth.signOut();
              setUser(null);
              setProfile(null);
            } else {
              setProfile(null);
            }
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

    return () => {
      clearTimeout(timer);
      unsubscribeAuth();
    };
  }, []);

  const isSaaSAdminUser = profile?.email === 'barber@admin.ai' || user?.email === 'barber@admin.ai' || profile?.email === 'blsseparate7@gmail.com' || user?.email === 'blsseparate7@gmail.com' || profile?.tipo === 'saas_admin';
  const activeRole = (isSaaSAdminUser && overrideRole) || 
    (isSaaSAdminUser
      ? 'saas_admin' 
      : (profile?.tipo || 'cliente'));

  const adjustedProfile = React.useMemo(() => {
    if (profile) {
      return { ...profile, tipo: activeRole };
    }
    if (isSaaSAdminUser) {
      return {
        uid: user?.uid || 'saas-admin-uid',
        email: user?.email || 'barber@admin.ai',
        nome: 'Super Administrador SaaS',
        tipo: 'saas_admin',
        ativo: true
      } as UserProfile;
    }
    return null;
  }, [profile, user?.uid, user?.email, activeRole, isSaaSAdminUser]);

  const signOut = async () => {
    localStorage.removeItem('barberelite_override_role');
    setOverrideRoleState(null);
    await auth.signOut();
    setUser(null);
    setProfile(null);
  };

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
      isSaaSAdminUser,
      overrideRole,
      setOverrideRole,
      signOut,
    };
  }, [user, adjustedProfile, loading, overrideRole, activeRole, isSaaSAdminUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
