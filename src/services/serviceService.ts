
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  orderBy,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Service, ServiceCategory } from '../types';
import { getActiveTenantId } from './tenantService';

const SERVICES_COLLECTION = 'services';
const CATEGORIES_COLLECTION = 'service_categories';

export const serviceService = {
  // --- Services ---
  async getServices(onlyActive = true, category?: string, tenantId?: string) {
    const tid = tenantId || getActiveTenantId();
    let q = query(
      collection(db, SERVICES_COLLECTION),
      where('tenantId', '==', tid)
    );
    
    if (onlyActive) {
      q = query(q, where('active', '==', true));
    }
    
    if (category) {
      q = query(q, where('categoria', '==', category));
    }

    const querySnapshot = await getDocs(q);
    const services = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
    return services.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  },

  async getServiceById(id: string) {
    const docRef = doc(db, SERVICES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().tenantId === getActiveTenantId()) {
      return { id: docSnap.id, ...docSnap.data() } as Service;
    }
    return null;
  },

  async createService(data: Partial<Service>) {
    const docRef = await addDoc(collection(db, SERVICES_COLLECTION), {
      tenantId: getActiveTenantId(),
      nome: data.nome || '',
      name: data.nome || '', // compatibilidade
      descricao: data.descricao || '',
      categoria: data.categoria || 'Geral',
      duracao_minutos: data.duracao_minutos || 30,
      duration: data.duracao_minutos || 30, // compatibilidade
      preco: data.preco || 0,
      price: data.preco || 0, // compatibilidade
      active: data.active !== undefined ? data.active : true,
      permite_cortesia: data.permite_cortesia || false,
      tipo_comissao: data.tipo_comissao || 'padrao',
      valor_comissao: data.valor_comissao || 0,
      comissoes_por_profissional: data.comissoes_por_profissional || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateService(id: string, data: Partial<Service>) {
    const docRef = doc(db, SERVICES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Serviço não encontrado ou acesso negado.');
    }
    const updateData: any = { ...data, updatedAt: serverTimestamp() };
    
    // Maintain dual fields for compatibility
    if (data.nome) updateData.name = data.nome;
    if (data.duracao_minutos) updateData.duration = data.duracao_minutos;
    if (data.preco) updateData.price = data.preco;

    await updateDoc(docRef, updateData);
  },

  async deleteService(id: string) {
    const docRef = doc(db, SERVICES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Serviço não encontrado ou acesso negado.');
    }
    await deleteDoc(docRef);
  },

  // --- Categories ---
  async getCategories(onlyActive = true) {
    let q = query(
      collection(db, CATEGORIES_COLLECTION),
      where('tenantId', '==', getActiveTenantId())
    );
    if (onlyActive) {
      q = query(q, where('active', '==', true));
    }
    const querySnapshot = await getDocs(q);
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceCategory));
    return categories.sort((a, b) => (a.order || 0) - (b.order || 0));
  },

  async createCategory(name: string, order: number = 0) {
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
      tenantId: getActiveTenantId(),
      name,
      order,
      active: true,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  },

  async updateCategory(id: string, data: Partial<ServiceCategory>) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Categoria não encontrada ou acesso negado.');
    }
    await updateDoc(docRef, { ...data });
  },

  async deleteCategory(id: string) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Categoria não encontrada ou acesso negado.');
    }
    await deleteDoc(docRef);
  }
};
