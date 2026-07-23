
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
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
              // Auto-correct discrepancies in Firestore database records
              const userEmail = (data.email || '').toLowerCase().trim();
              let needsUpdate = false;
              let updateFields: Partial<UserProfile> = {};

              if (userEmail === 'barber@admin.ai') {
                if (data.tenantId !== 'saas' || data.tipo !== 'saas_admin') {
                  needsUpdate = true;
                  updateFields = { tenantId: 'saas', tipo: 'saas_admin' };
                }
              } else if (userEmail === 'barbeariagbcortes7@gmail.com') {
                if (data.tenantId !== 'gbcortes7' || data.tipo !== 'admin') {
                  needsUpdate = true;
                  updateFields = { tenantId: 'gbcortes7', tipo: 'admin' };
                }
              }

              if (needsUpdate) {
                console.log(`Auto-correcting DB user profile for ${userEmail}:`, updateFields);
                try {
                  const { updateDoc } = await import('firebase/firestore');
                  await updateDoc(doc(db, 'usuarios', firebaseUser.uid), updateFields);
                } catch (updateErr) {
                  console.error(`Failed to auto-correct profile for ${userEmail} in DB:`, updateErr);
                }
              }

              // Set the profile state with any corrected values immediately to prevent UI lag/mismatch
              setProfile({
                ...data,
                ...updateFields
              });
            }
          } else {
            console.log("No profile document found in Firestore for UID:", firebaseUser.uid);
            
            let healedProfile: UserProfile | null = null;
            try {
              if (firebaseUser.email) {
                const userEmail = firebaseUser.email.toLowerCase().trim();
                console.log("Auto-heal starting. querying tenants by ownerEmail for:", userEmail);
                const tenantsRef = collection(db, 'tenants');
                const qOwner = query(tenantsRef, where('ownerEmail', '==', userEmail));
                let qSnapOwner;
                try {
                  qSnapOwner = await getDocs(qOwner);
                  console.log("Query by ownerEmail succeeded. Empty?", qSnapOwner.empty);
                } catch (err) {
                  console.error("Failed querying tenants by ownerEmail:", err);
                  throw err;
                }
                
                let foundTenantId = '';
                let foundOwnerName = '';
                
                if (!qSnapOwner.empty) {
                  const tenantDoc = qSnapOwner.docs[0];
                  foundTenantId = tenantDoc.id;
                  foundOwnerName = tenantDoc.data().ownerName || tenantDoc.data().name || 'Proprietário';
                } else {
                  console.log("No ownerEmail match, querying tenants by email for:", userEmail);
                  const qEmail = query(tenantsRef, where('email', '==', userEmail));
                  let qSnapEmail;
                  try {
                    qSnapEmail = await getDocs(qEmail);
                    console.log("Query by tenant email succeeded. Empty?", qSnapEmail.empty);
                  } catch (err) {
                    console.error("Failed querying tenants by email:", err);
                    throw err;
                  }
                  if (!qSnapEmail.empty) {
                    const tenantDoc = qSnapEmail.docs[0];
                    foundTenantId = tenantDoc.id;
                    foundOwnerName = tenantDoc.data().ownerName || tenantDoc.data().name || 'Proprietário';
                  }
                }
                
                if (foundTenantId) {
                  console.log("Found matching tenant owner email! Creating missing profile in Firestore...");
                  const newProfile: UserProfile = {
                    uid: firebaseUser.uid,
                    nome: foundOwnerName,
                    email: userEmail,
                    tipo: 'admin',
                    ativo: true,
                    tenantId: foundTenantId,
                    telefone: firebaseUser.phoneNumber || '',
                    phone: firebaseUser.phoneNumber || '',
                    saldo_atual: 0,
                    total_gasto: 0,
                    total_pago: 0,
                    total_em_aberto: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  };
                  try {
                    await setDoc(doc(db, 'usuarios', firebaseUser.uid), newProfile);
                    console.log("Missing profile successfully created/auto-healed!");
                  } catch (err) {
                    console.error("Failed writing to 'usuarios' collection:", err);
                    throw err;
                  }
                  setProfile(newProfile);
                  healedProfile = newProfile;
                } else {
                  console.log("No tenant match found for email in auto-heal.");
                }
              }
            } catch (healErr) {
              console.error("Error attempting to auto-heal missing user profile:", healErr);
            }

            if (!healedProfile) {
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

  const isSaaSAdminUser = (profile?.email === 'barber@admin.ai' || user?.email === 'barber@admin.ai' || profile?.email === 'blsseparate7@gmail.com' || user?.email === 'blsseparate7@gmail.com' || (profile?.tipo === 'saas_admin' && profile?.email !== 'barbeariagbcortes7@gmail.com')) && user?.email !== 'barbeariagbcortes7@gmail.com';
  const activeRole = (isSaaSAdminUser && overrideRole) || 
    (isSaaSAdminUser
      ? 'saas_admin' 
      : ((profile?.email === 'barbeariagbcortes7@gmail.com' ? 'admin' : profile?.tipo) || 'cliente'));

  const adjustedProfile = React.useMemo(() => {
    if (profile) {
      const finalProfile = { ...profile, tipo: activeRole };
      if (finalProfile.email?.toLowerCase().trim() === 'barber@admin.ai') {
        finalProfile.tenantId = 'saas';
        finalProfile.tipo = 'saas_admin';
      } else if (finalProfile.email?.toLowerCase().trim() === 'barbeariagbcortes7@gmail.com') {
        finalProfile.tenantId = 'gbcortes7';
        finalProfile.tipo = 'admin';
      }
      return finalProfile;
    }
    if (isSaaSAdminUser) {
      return {
        uid: user?.uid || 'saas-admin-uid',
        email: user?.email || 'barber@admin.ai',
        nome: 'Super Administrador SaaS',
        tipo: 'saas_admin',
        tenantId: 'saas',
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
