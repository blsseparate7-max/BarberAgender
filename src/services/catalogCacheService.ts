import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Service, UserProfile } from '../types';
import { getActiveTenantId } from './tenantService';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutos de cache em memória de sessão

let servicesCache: { [tenantId: string]: CacheEntry<Service[]> } = {};
let productsCache: { [tenantId: string]: CacheEntry<Product[]> } = {};
let packagesCache: { [tenantId: string]: CacheEntry<any[]> } = {};

export const catalogCacheService = {
  async getServices(forceRefresh = false, tenantId?: string): Promise<Service[]> {
    const tid = tenantId || getActiveTenantId();
    const now = Date.now();
    const cached = servicesCache[tid];

    if (!forceRefresh && cached && (now - cached.timestamp < TTL_MS)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(db, 'services'),
        where('tenantId', '==', tid),
        where('active', '==', true)
      );
      const snap = await getDocs(q);
      const services = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
      services.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

      servicesCache[tid] = {
        data: services,
        timestamp: now
      };
      return services;
    } catch (err) {
      console.warn('[catalogCacheService] Falha ao buscar serviços:', err);
      return cached ? cached.data : [];
    }
  },

  async getProducts(forceRefresh = false, tenantId?: string): Promise<Product[]> {
    const tid = tenantId || getActiveTenantId();
    const now = Date.now();
    const cached = productsCache[tid];

    if (!forceRefresh && cached && (now - cached.timestamp < TTL_MS)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(db, 'products'),
        where('tenantId', '==', tid)
      );
      const snap = await getDocs(q);
      const products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      productsCache[tid] = {
        data: products,
        timestamp: now
      };
      return products;
    } catch (err) {
      console.warn('[catalogCacheService] Falha ao buscar produtos:', err);
      return cached ? cached.data : [];
    }
  },

  async getPackageConfigs(forceRefresh = false, tenantId?: string): Promise<any[]> {
    const tid = tenantId || getActiveTenantId();
    const now = Date.now();
    const cached = packagesCache[tid];

    if (!forceRefresh && cached && (now - cached.timestamp < TTL_MS)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(db, 'pacotes_config'),
        where('tenantId', '==', tid)
      );
      const snap = await getDocs(q);
      const configs = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((p: any) => p.active !== false);

      packagesCache[tid] = {
        data: configs,
        timestamp: now
      };
      return configs;
    } catch (err) {
      console.warn('[catalogCacheService] Falha ao buscar pacotes config:', err);
      return cached ? cached.data : [];
    }
  },

  invalidate(tenantId?: string) {
    const tid = tenantId || getActiveTenantId();
    delete servicesCache[tid];
    delete productsCache[tid];
    delete packagesCache[tid];
  }
};
