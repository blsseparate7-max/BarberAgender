
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

// Cache em memória inteligente para reduzir leituras redundantes do Firestore
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const servicesCache = new Map<string, CacheEntry<Service[]>>();
const categoriesCache = new Map<string, CacheEntry<ServiceCategory[]>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function invalidateServiceCache(tenantId?: string) {
  if (tenantId) {
    for (const key of servicesCache.keys()) {
      if (key.includes(tenantId)) servicesCache.delete(key);
    }
    for (const key of categoriesCache.keys()) {
      if (key.includes(tenantId)) categoriesCache.delete(key);
    }
  } else {
    servicesCache.clear();
    categoriesCache.clear();
  }
}

export const serviceService = {
  // --- Services ---
  async getServices(onlyActive = true, category?: string, tenantId?: string, bypassCache = false) {
    const tid = (tenantId || getActiveTenantId() || '').trim().toLowerCase();
    const cacheKey = `${tid}_active:${onlyActive}_cat:${category || 'all'}`;

    if (!bypassCache) {
      const cached = servicesCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
      }
    }

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
    const sorted = services.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    servicesCache.set(cacheKey, { data: sorted, timestamp: Date.now() });
    return sorted;
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
    const tid = getActiveTenantId();
    const docRef = await addDoc(collection(db, SERVICES_COLLECTION), {
      tenantId: tid,
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
      fotoUrl: data.fotoUrl || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    invalidateServiceCache(tid);
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
    invalidateServiceCache(snap.data().tenantId);
  },

  async deleteService(id: string) {
    const docRef = doc(db, SERVICES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Serviço não encontrado ou acesso negado.');
    }
    await deleteDoc(docRef);
    invalidateServiceCache(snap.data().tenantId);
  },

  // --- Categories ---
  async getCategories(onlyActive = true, tenantId?: string, bypassCache = false) {
    const tid = (tenantId || getActiveTenantId() || '').trim().toLowerCase();
    const cacheKey = `${tid}_active:${onlyActive}`;

    if (!bypassCache) {
      const cached = categoriesCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
      }
    }

    let q = query(
      collection(db, CATEGORIES_COLLECTION),
      where('tenantId', '==', tid)
    );
    if (onlyActive) {
      q = query(q, where('active', '==', true));
    }
    const querySnapshot = await getDocs(q);
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceCategory));
    const sorted = categories.sort((a, b) => (a.order || 0) - (b.order || 0));

    categoriesCache.set(cacheKey, { data: sorted, timestamp: Date.now() });
    return sorted;
  },

  async createCategory(name: string, order: number = 0) {
    const tid = getActiveTenantId();
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
      tenantId: tid,
      name,
      order,
      active: true,
      createdAt: serverTimestamp(),
    });
    invalidateServiceCache(tid);
    return docRef.id;
  },

  async updateCategory(id: string, data: Partial<ServiceCategory>) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Categoria não encontrada ou acesso negado.');
    }
    await updateDoc(docRef, { ...data });
    invalidateServiceCache(snap.data().tenantId);
  },

  async deleteCategory(id: string) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    const snap = await getDoc(docRef);
    if (!snap.exists() || snap.data().tenantId !== getActiveTenantId()) {
      throw new Error('Categoria não encontrada ou acesso negado.');
    }
    await deleteDoc(docRef);
    invalidateServiceCache(snap.data().tenantId);
  }
};
