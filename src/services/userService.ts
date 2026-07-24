
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  collection as firestoreCollection,
  serverTimestamp,
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { getActiveTenantId } from './tenantService';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const COLLECTION = 'usuarios';

export const userService = {
  async getUsersByRole(role: UserRole, onlyActive = true, tenantId?: string) {
    const tid = tenantId || getActiveTenantId();
    let q = query(
      collection(db, COLLECTION), 
      where('tipo', '==', role),
      where('tenantId', '==', tid)
    );
    
    if (onlyActive) {
      q = query(q, where('ativo', '==', true));
    }

    const querySnapshot = await getDocs(q);
    const users = querySnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
      .filter(u => !tid || u.tenantId === tid);
    return users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  subscribeToUsersByRole(role: UserRole, onlyActive = true, callback: (users: UserProfile[]) => void) {
    const tid = getActiveTenantId();
    let q = query(
      collection(db, COLLECTION), 
      where('tipo', '==', role),
      where('tenantId', '==', tid)
    );
    
    if (onlyActive) {
      q = query(q, where('ativo', '==', true));
    }

    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => !tid || u.tenantId === tid);
      const sorted = users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      callback(sorted);
    });
  },

  subscribeToAllBarbers(onlyActive = true, callback: (barbers: UserProfile[]) => void) {
    const tid = getActiveTenantId();
    let q = query(
      collection(db, COLLECTION), 
      where('tipo', 'in', ['barbeiro', 'gerente']),
      where('tenantId', '==', tid)
    );
    
    if (onlyActive) {
      q = query(q, where('ativo', '==', true));
    }

    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => !tid || u.tenantId === tid);
      const sorted = users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      callback(sorted);
    });
  },

  subscribeToAllClients(onlyActive = true, callback: (clients: UserProfile[]) => void) {
    return this.subscribeToUsersByRole('cliente', onlyActive, callback);
  },

  async getAllBarbers(onlyActive = true, tenantId?: string) {
    const tid = tenantId || getActiveTenantId();
    let q = query(
      collection(db, COLLECTION),
      where('tipo', 'in', ['barbeiro', 'gerente']),
      where('tenantId', '==', tid)
    );
    if (onlyActive) {
      q = query(q, where('ativo', '==', true));
    }
    const querySnapshot = await getDocs(q);
    const users = querySnapshot.docs
      .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
      .filter(u => !tid || u.tenantId === tid);
    return users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  async getAllClients(onlyActive = true) {
    return this.getUsersByRole('cliente', onlyActive);
  },

  async searchUsers(role: UserRole, searchTerm: string) {
    // Basic search on client side for multiple fields or use specific queries
    // For production, a specialized search index like Algolia or full-text-search is better
    // Here we implement a simple name search or filter the results
    const users = await this.getUsersByRole(role, false);
    const term = searchTerm.toLowerCase();
    
    return users.filter(u => 
      u.nome.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term) || 
      (u.telefone && u.telefone.includes(term)) ||
      (u.phone && u.phone.includes(term))
    );
  },

  async getUserProfile(uid: string) {
    const docRef = doc(db, COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().tenantId === getActiveTenantId()) {
      return { uid: docSnap.id, ...docSnap.data() } as UserProfile;
    }
    return null;
  },

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Usuário não encontrado ou acesso negado.');
    }
    const updateData: any = { 
      ...data, 
      updatedAt: serverTimestamp() 
    };

    // Mantém campos duplicados atualizados para compatibilidade bi-direcional perfeita
    if (data.nome !== undefined) {
      updateData.nome = data.nome;
    }
    
    if (data.telefone !== undefined) {
      updateData.telefone = data.telefone;
      updateData.phone = data.telefone;
    } else if (data.phone !== undefined) {
      updateData.phone = data.phone;
      updateData.telefone = data.phone;
    }
    
    if (data.observacoes !== undefined) {
      updateData.observacoes = data.observacoes;
      updateData.observations = data.observacoes;
    } else if (data.observations !== undefined) {
      updateData.observations = data.observations;
      updateData.observacoes = data.observations;
    }

    if (data.especialidade !== undefined) {
      updateData.especialidade = data.especialidade;
      updateData.specialty = data.especialidade;
    } else if (data.specialty !== undefined) {
      updateData.specialty = data.specialty;
      updateData.especialidade = data.specialty;
    }

    if (data.percentual_comissao !== undefined) {
      updateData.percentual_comissao = data.percentual_comissao;
      updateData.commission_percentage = data.percentual_comissao;
    } else if (data.commission_percentage !== undefined) {
      updateData.commission_percentage = data.commission_percentage;
      updateData.percentual_comissao = data.commission_percentage;
    }

    if (data.meta_mensal !== undefined) {
      updateData.meta_mensal = data.meta_mensal;
      updateData.monthly_goal = data.meta_mensal;
    } else if (data.monthly_goal !== undefined) {
      updateData.monthly_goal = data.monthly_goal;
      updateData.meta_mensal = data.monthly_goal;
    }

    if (data.is_gestor !== undefined) {
      updateData.is_gestor = data.is_gestor;
      updateData.is_manager = data.is_gestor;
    } else if (data.is_manager !== undefined) {
      updateData.is_manager = data.is_manager;
      updateData.is_gestor = data.is_manager;
    }

    if (data.saldo_atual !== undefined) {
      updateData.saldo_atual = data.saldo_atual;
      updateData.balance = data.saldo_atual;
    } else if (data.balance !== undefined) {
      updateData.balance = data.balance;
      updateData.saldo_atual = data.balance;
    }

    if (data.total_gasto !== undefined) {
      updateData.total_gasto = data.total_gasto;
      updateData.totalSpent = data.total_gasto;
    } else if (data.totalSpent !== undefined) {
      updateData.totalSpent = data.totalSpent;
      updateData.total_gasto = data.totalSpent;
    }

    if (data.total_pago !== undefined) {
      updateData.total_pago = data.total_pago;
      updateData.totalPaid = data.total_pago;
    } else if (data.totalPaid !== undefined) {
      updateData.totalPaid = data.totalPaid;
      updateData.total_pago = data.totalPaid;
    }

    await updateDoc(docRef, updateData);
  },

  async createUser(data: Partial<UserProfile> & { password?: string }) {
    let uid = data.uid || '';
    
    if (data.password && data.email) {
      let createdOnServer = false;
      
      // 1. Try to create the user account on the server using Admin SDK
      try {
        const response = await fetch('/api/admin/create-user-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: data.email.toLowerCase().trim(),
            password: data.password,
            displayName: data.nome || ''
          })
        });
        
        const resData = await response.json();
        if (response.ok && resData.success && resData.uid) {
          uid = resData.uid;
          createdOnServer = true;
          console.log(`Professional Auth created securely on server. UID: ${uid}`);
        } else {
          // If the server explicitly returned an error like "email already exists", throw it immediately to avoid duplicate attempts
          if (resData.error && (resData.error.includes('utilizado') || resData.error.includes('existe') || resData.code === 'auth/email-already-exists')) {
            throw new Error(resData.error || 'Este e-mail já está sendo utilizado por outro usuário.');
          }
          console.warn("Server-side auth creation failed or not available, falling back to client-side secondary app:", resData.error);
        }
      } catch (serverErr: any) {
        // If it's a critical validation or registration error, bubble it up
        if (serverErr.message && (serverErr.message.includes('utilizado') || serverErr.message.includes('existe') || serverErr.message.includes('senha'))) {
          throw serverErr;
        }
        console.warn("Could not create user auth on server, attempting client fallback...", serverErr);
      }

      // 2. Client-side secondary app fallback if server creation was unsuccessful
      if (!createdOnServer) {
        const tempAppName = `temp-auth-app-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
        const tempApp = initializeApp(firebaseConfig, tempAppName);
        const tempAuth = getAuth(tempApp);
        try {
          const userCredential = await createUserWithEmailAndPassword(tempAuth, data.email, data.password);
          uid = userCredential.user.uid;
          await signOut(tempAuth);
        } catch (authError: any) {
          console.error("Erro ao criar usuário de autenticação no Firebase (client-side):", authError);
          if (authError.code === 'auth/email-already-in-use') {
            // Fallback: Check if there's an existing profile document in Firestore with this email to reuse its UID
            try {
              const usersRef = collection(db, COLLECTION);
              const q = query(usersRef, where('email', '==', data.email.toLowerCase().trim()));
              const qSnap = await getDocs(q);
              if (!qSnap.empty) {
                uid = qSnap.docs[0].id;
              } else {
                throw new Error('Este e-mail já está sendo utilizado por outro usuário.');
              }
            } catch (fallbackErr: any) {
              throw new Error(fallbackErr.message || 'Este e-mail já está sendo utilizado por outro usuário.');
            }
          } else if (authError.code === 'auth/invalid-email') {
            throw new Error('O e-mail fornecido é inválido.');
          } else if (authError.code === 'auth/weak-password') {
            throw new Error('A senha é muito fraca. Deve ter no mínimo 6 caracteres.');
          }
          throw authError;
        } finally {
          await deleteApp(tempApp);
        }
      }
    }

    const docRef = uid ? doc(db, COLLECTION, uid) : doc(firestoreCollection(db, COLLECTION));
    const finalUid = docRef.id;
    
    const newUser: UserProfile = {
      uid: finalUid,
      nome: data.nome || '',
      email: data.email || '',
      tipo: data.tipo || 'cliente',
      ativo: data.ativo !== undefined ? data.ativo : true,
      tenantId: data.tenantId || getActiveTenantId(),
      telefone: data.telefone || '',
      phone: data.telefone || '', // dual storage for safety
      observacoes: data.observacoes || '',
      observations: data.observacoes || '', // dual storage for safety
      
      // Defaults for clients
      saldo_atual: data.saldo_atual || 0,
      balance: data.saldo_atual || 0,
      total_gasto: data.total_gasto || 0,
      totalSpent: data.total_gasto || 0,
      total_pago: data.total_pago || 0,
      totalPaid: data.total_pago || 0,
      total_em_aberto: data.total_em_aberto || 0,
      
      // Defaults for professionals
      especialidade: data.especialidade || '',
      specialty: data.especialidade || '',
      percentual_comissao: data.percentual_comissao || 0,
      commission_percentage: data.percentual_comissao || 0,
      meta_mensal: data.meta_mensal || 0,
      monthly_goal: data.meta_mensal || 0,
      is_gestor: data.is_gestor || false,
      is_manager: data.is_gestor || false,
      horario_de_trabalho: data.horario_de_trabalho || [],
      
      ...data, // other fields
      
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Ensure we don't save the password to the Firestore user profile
    if ('password' in newUser) {
      delete (newUser as any).password;
    }
    
    await setDoc(docRef, newUser);
    return newUser;
  },

  async getAllUsersSystem() {
    const q = query(collection(db, COLLECTION));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
  },

  async deleteUser(uid: string) {
    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, {
        ativo: false,
        updatedAt: serverTimestamp()
      });
    }
  }
};
