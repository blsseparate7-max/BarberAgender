import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { tenantService, TenantProfile, getActiveTenantId } from '../services/tenantService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

interface TenantContextType {
  tenantId: string;
  tenant: TenantProfile | null;
  loading: boolean;
  refreshTenant: () => Promise<void>;
  updateTenantProfile: (data: Partial<TenantProfile>) => Promise<void>;
  tenantsList: TenantProfile[];
}

const TenantContext = createContext<TenantContextType>({
  tenantId: '',
  tenant: null,
  loading: true,
  refreshTenant: async () => {},
  updateTenantProfile: async () => {},
  tenantsList: [],
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, user } = useAuth();
  const [tenantId, setTenantId] = useState<string>(getActiveTenantId());
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [tenantsList, setTenantsList] = useState<TenantProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Load active tenant data
  const loadTenantData = async (id: string) => {
    try {
      const activeTenant = await tenantService.getOrCreateTenant(id);
      setTenant(activeTenant);
      
      // Apply theme color dynamically to document element!
      if (activeTenant?.accentColor) {
        document.documentElement.style.setProperty('--color-accent', activeTenant.accentColor);
        // Also inject dynamic styles for custom rings or gradients if needed
        const hoverColor = adjustColorBrightness(activeTenant.accentColor, -15);
        document.documentElement.style.setProperty('--color-accent-hover', hoverColor);
      }
    } catch (error) {
      console.error("Error loading tenant data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to adjust color brightness (for hover effects)
  const adjustColorBrightness = (hex: string, percent: number) => {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.max(0, Math.min(255, R + (R * percent) / 100));
    G = Math.max(0, Math.min(255, G + (G * percent) / 100));
    B = Math.max(0, Math.min(255, B + (B * percent) / 100));

    const rHex = Math.round(R).toString(16).padStart(2, '0');
    const gHex = Math.round(G).toString(16).padStart(2, '0');
    const bHex = Math.round(B).toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  };

  // Watch URL or LocalStorage/Profile changes to keep tenant in sync
  useEffect(() => {
    const currentId = getActiveTenantId();
    if (currentId !== tenantId) {
      setTenantId(currentId);
    }
  }, [window.location.search]);

  // Sync tenant ID with authenticated user's profile if user doesn't have a specific URL parameter override
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasUrlParam = params.get('tenant') || params.get('tenantId');
    
    if (!hasUrlParam && profile) {
      // Sync tenantId with logged-in user profile's tenantId
      const userTenant = (profile as any).tenantId;
      if (userTenant && userTenant !== tenantId) {
        setTenantId(userTenant);
        localStorage.setItem('barberelite_tenant_id', userTenant);
      }
    }
  }, [profile]);

  useEffect(() => {
    // Safety fallback timeout to prevent infinite loading screen
    const timer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    if (tenantId) {
      loadTenantData(tenantId);
    } else {
      setLoading(false);
    }

    return () => clearTimeout(timer);
  }, [tenantId]);

  // Fetch list of tenants for admin visibility
  useEffect(() => {
    tenantService.listTenants().then(setTenantsList).catch(err => console.error(err));
  }, []);

  const refreshTenant = async () => {
    await loadTenantData(tenantId);
  };

  const updateTenantProfile = async (data: Partial<TenantProfile>) => {
    try {
      await tenantService.updateTenant(tenantId, data);
      await loadTenantData(tenantId);
      toast.success("Perfil da Barbearia atualizado com sucesso!");
    } catch (error) {
      console.error("Error updating tenant profile:", error);
      toast.error("Ocorreu um erro ao salvar as configurações da barbearia.");
      throw error;
    }
  };

  return (
    <TenantContext.Provider value={{
      tenantId,
      tenant,
      loading,
      refreshTenant,
      updateTenantProfile,
      tenantsList
    }}>
      {children}
    </TenantContext.Provider>
  );
};
