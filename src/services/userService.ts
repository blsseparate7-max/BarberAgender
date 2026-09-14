
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
import { db, auth } from '../firebase';
import { UserProfile, UserRole } from '../types';
import { getActiveTenantId } from './tenantService';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const COLLECTION = 'usuarios';

export const userService = {
  async getUsersByRole(role: UserRole, onlyActive = true, tenantId?: string) {
    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const constraints = [where('tipo', '==', role)];
    if (tid === 'gbcortes7') {
      constraints.push(where('tenantId', 'in', [tid, '']));
    } else {
      constraints.push(where('tenantId', '==', tid));
    }
    const q = query(
      collection(db, COLLECTION), 
      ...constraints
    );
    
    const querySnapshot = await getDocs(q);
    let users = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
    
    if (onlyActive) {
      users = users.filter(u => u.ativo !== false);
    }
    return users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  subscribeToUsersByRole(role: UserRole, onlyActive = true, callback: (users: UserProfile[]) => void, tenantId?: string) {
    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const constraints = [where('tipo', '==', role)];
    if (tid === 'gbcortes7') {
      constraints.push(where('tenantId', 'in', [tid, '']));
    } else {
      constraints.push(where('tenantId', '==', tid));
    }
    const q = query(
      collection(db, COLLECTION), 
      ...constraints
    );

    return onSnapshot(q, (snapshot) => {
      let users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      if (onlyActive) {
        users = users.filter(u => u.ativo !== false);
      }
      const sorted = users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      callback(sorted);
    });
  },

  subscribeToAllBarbers(onlyActive = true, callback: (barbers: UserProfile[]) => void, tenantId?: string) {
    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const q = query(
      collection(db, COLLECTION), 
      where('tipo', 'in', ['barbeiro', 'gerente', 'admin'])
    );

    return onSnapshot(q, (snapshot) => {
      let users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      
      // Filter case-insensitively by tenant ID
      users = users.filter(u => {
        const uTenant = (u.tenantId || '').trim().toLowerCase();
        if (!tid || tid === 'gbcortes7') {
          return uTenant === tid || uTenant === '' || uTenant === 'gbcortes7' || uTenant === 'gbcortes7' || uTenant === 'gbcortes7';
        }
        return uTenant === tid || uTenant === '';
      });

      if (onlyActive) {
        users = users.filter(u => u.ativo !== false);
      }
      const sorted = users.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
      callback(sorted);
    });
  },

  subscribeToAllClients(onlyActive = true, callback: (clients: UserProfile[]) => void, tenantId?: string) {
    return this.subscribeToUsersByRole('cliente', onlyActive, callback, tenantId);
  },

  async getAllBarbers(onlyActive = true, tenantId?: string) {
    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const q = query(
      collection(db, COLLECTION),
      where('tipo', 'in', ['barbeiro', 'gerente', 'admin'])
    );
    const querySnapshot = await getDocs(q);
    let users = querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

    // Filter case-insensitively by tenant ID
    users = users.filter(u => {
      const uTenant = (u.tenantId || '').trim().toLowerCase();
      if (!tid || tid === 'gbcortes7') {
        return uTenant === tid || uTenant === '' || uTenant === 'gbcortes7';
      }
      return uTenant === tid || uTenant === '';
    });

    if (onlyActive) {
      users = users.filter(u => u.ativo !== false);
    }
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

  async getUserByPhone(phone: string, tenantId?: string) {
    if (!phone) return null;
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) return null;

    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const clients = await this.getUsersByRole('cliente', false, tid);
    const found = clients.find(c => {
      const p1 = (c.telefone || '').replace(/\D/g, '');
      const p2 = (c.phone || '').replace(/\D/g, '');
      return p1 === cleanPhone || p2 === cleanPhone;
    });

    if (found) return found;
    return null;
  },

  async getUserByEmail(email: string, tenantId?: string) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail || cleanEmail.includes('placeholder') || cleanEmail.includes('manual_') || cleanEmail.includes('sem-email') || cleanEmail.includes('sem_email')) {
      return null;
    }

    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const clients = await this.getUsersByRole('cliente', false, tid);
    const found = clients.find(c => (c.email || '').toLowerCase().trim() === cleanEmail);

    if (found) return found;
    return null;
  },

  async checkPhoneExists(phone: string, currentUid?: string, tenantId?: string): Promise<{ exists: boolean; user?: UserProfile }> {
    if (!phone) return { exists: false };
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) return { exists: false };

    const foundUser = await this.getUserByPhone(phone, tenantId);
    if (foundUser && (!currentUid || foundUser.uid !== currentUid)) {
      return { exists: true, user: foundUser };
    }
    return { exists: false };
  },

  async checkEmailExists(email: string, currentUid?: string, tenantId?: string): Promise<{ exists: boolean; user?: UserProfile }> {
    if (!email) return { exists: false };
    const foundUser = await this.getUserByEmail(email, tenantId);
    if (foundUser && (!currentUid || foundUser.uid !== currentUid)) {
      return { exists: true, user: foundUser };
    }
    return { exists: false };
  },

  async unifyDuplicateClients(tenantId?: string): Promise<{ mergedCount: number; details: string[] }> {
    const tid = (tenantId || getActiveTenantId()).trim().toLowerCase();
    const clients = await this.getUsersByRole('cliente', false, tid);
    
    // Group active clients by clean phone, real email, or core name
    const groups: Map<string, UserProfile[]> = new Map();

    const getCoreNameKey = (fullName: string): string => {
      if (!fullName) return '';
      const clean = fullName
        .replace(/\(.*?\)/g, '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      const words = clean.split(/\s+/).filter(w => w.length > 1 && !['de', 'da', 'do', 'dos', 'das', 'e'].includes(w));
      if (words.length >= 2) return `core_${words[0]}_${words[1]}`;
      if (words.length === 1) return `core_${words[0]}`;
      return '';
    };

    clients.forEach(c => {
      if (c.ativo === false) return; // ignore already deactivated
      const phoneDigits = (c.telefone || c.phone || '').replace(/\D/g, '');
      const email = (c.email || '').toLowerCase().trim();
      const isRealEmail = email && !email.includes('placeholder') && !email.includes('manual_') && !email.includes('sem-email') && !email.includes('sem_email');
      const coreNameKey = getCoreNameKey(c.nome || '');

      if (phoneDigits && phoneDigits.length >= 8) {
        const key = `phone_${phoneDigits}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(c);
      } else if (isRealEmail) {
        const key = `email_${email}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(c);
      } else if (coreNameKey) {
        if (!groups.has(coreNameKey)) groups.set(coreNameKey, []);
        groups.get(coreNameKey)!.push(c);
      }
    });

    let mergedCount = 0;
    const details: string[] = [];

    for (const [, group] of groups.entries()) {
      const uniqueClients = Array.from(new Map(group.map(c => [c.uid, c])).values());
      if (uniqueClients.length > 1) {
        // Sort: prefer linked accounts, then accounts with phone number, then highest total_gasto
        uniqueClients.sort((a, b) => {
          if (a.isLinked && !b.isLinked) return -1;
          if (!a.isLinked && b.isLinked) return 1;
          const aPhone = Boolean(a.telefone || a.phone);
          const bPhone = Boolean(b.telefone || b.phone);
          if (aPhone && !bPhone) return -1;
          if (!aPhone && bPhone) return 1;
          return (b.total_gasto || b.totalSpent || 0) - (a.total_gasto || a.totalSpent || 0);
        });

        const primary = uniqueClients[0];
        const duplicates = uniqueClients.slice(1);

        for (const dup of duplicates) {
          try {
            const newSaldo = (primary.saldo_atual || 0) + (dup.saldo_atual || 0);
            const newGasto = (primary.total_gasto || 0) + (dup.total_gasto || 0);
            const newPago = (primary.total_pago || 0) + (dup.total_pago || 0);
            const newEmAberto = (primary.total_em_aberto || 0) + (dup.total_em_aberto || 0);

            // Update primary user doc
            await updateDoc(doc(db, COLLECTION, primary.uid), {
              saldo_atual: newSaldo,
              balance: newSaldo,
              total_gasto: newGasto,
              totalSpent: newGasto,
              total_pago: newPago,
              totalPaid: newPago,
              total_em_aberto: newEmAberto,
              telefone: primary.telefone || dup.telefone || primary.phone || dup.phone || '',
              phone: primary.phone || dup.phone || primary.telefone || dup.telefone || '',
              cpf: primary.cpf || dup.cpf || null,
              cpfCnpj: primary.cpfCnpj || dup.cpfCnpj || null,
              birthDate: primary.birthDate || dup.birthDate || '',
              observacoes: (primary.observacoes ? primary.observacoes + ' | ' : '') + (dup.observacoes ? '[Unificado]: ' + dup.observacoes : '')
            });

            // Re-link debts from dup to primary
            const debtsQ = query(collection(db, 'client_debts'), where('client_id', '==', dup.uid));
            const debtsSnap = await getDocs(debtsQ);
            for (const dDoc of debtsSnap.docs) {
              await updateDoc(dDoc.ref, { client_id: primary.uid });
            }

            // Re-link comandas from dup to primary
            const comQ = query(collection(db, 'comandas'), where('cliente_id', '==', dup.uid));
            const comSnap = await getDocs(comQ);
            for (const cDoc of comSnap.docs) {
              await updateDoc(cDoc.ref, { cliente_id: primary.uid, cliente_nome: primary.nome });
            }

            // Deactivate duplicate user profile
            await updateDoc(doc(db, COLLECTION, dup.uid), {
              ativo: false,
              nome: `${dup.nome} (Unificado com ${primary.nome})`,
              observacoes: `Perfil unificado automaticamente com ${primary.uid}`
            });

            mergedCount++;
            details.push(`Cliente "${dup.nome}" (ID: ${dup.uid}) unificado com "${primary.nome}" (ID: ${primary.uid}).`);
          } catch (err) {
            console.error("Erro ao unificar duplicado:", dup.uid, err);
          }
        }
      }
    }

    return { mergedCount, details };
  },

  async getUserProfile(uid: string) {
    if (!uid) return null;
    const docRef = doc(db, COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const tid = (getActiveTenantId() || '').trim().toLowerCase();
      const uTenant = (data.tenantId || '').trim().toLowerCase();
      if (!tid || uTenant === tid || (!data.tenantId && tid === 'gbcortes7')) {
        return { uid: docSnap.id, ...data } as UserProfile;
      }
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
    const tid = data.tenantId || getActiveTenantId();

    // Prevent duplicate phone or email registration
    const phoneVal = data.telefone || data.phone || '';
    if (phoneVal) {
      const phoneCheck = await this.checkPhoneExists(phoneVal, undefined, tid);
      if (phoneCheck.exists && phoneCheck.user) {
        throw new Error(`Já existe um cliente cadastrado com este telefone (${phoneCheck.user.nome}). Utilize o perfil existente para registrar atendimentos.`);
      }
    }

    if (data.email) {
      const emailCheck = await this.checkEmailExists(data.email, undefined, tid);
      if (emailCheck.exists && emailCheck.user) {
        throw new Error(`Já existe um cliente cadastrado com este e-mail (${emailCheck.user.nome}). Utilize o perfil existente.`);
      }
    }
    
    if (data.password && data.email) {
      let createdOnServer = false;
      
      // 1. Try to create the user account on the server using Admin SDK
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/admin/create-user-auth', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
      isLinked: data.isLinked !== undefined ? data.isLinked : Boolean(data.password),
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
