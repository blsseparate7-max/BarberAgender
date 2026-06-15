
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
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserRole } from '../types';

const COLLECTION = 'usuarios';

export const userService = {
  async getUsersByRole(role: UserRole, onlyActive = true) {
    let q = query(
      collection(db, COLLECTION), 
      where('tipo', '==', role),
      orderBy('nome', 'asc')
    );
    
    if (onlyActive) {
      q = query(q, where('ativo', '==', true));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
  },

  async getAllBarbers() {
    return this.getUsersByRole('barbeiro', false); // Get all to show status in list
  },

  async getAllClients() {
    return this.getUsersByRole('cliente', false); // Get all to show status in list
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
    if (docSnap.exists()) {
      return { uid: docSnap.id, ...docSnap.data() } as UserProfile;
    }
    return null;
  },

  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    const docRef = doc(db, COLLECTION, uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
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
    }
  },

  async createUser(data: Partial<UserProfile>) {
    const docRef = doc(firestoreCollection(db, COLLECTION));
    const uid = docRef.id;
    
    const newUser: UserProfile = {
      uid,
      nome: data.nome || '',
      email: data.email || '',
      tipo: data.tipo || 'cliente',
      ativo: data.ativo !== undefined ? data.ativo : true,
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
    
    await setDoc(docRef, newUser);
    return newUser;
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
