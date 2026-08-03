import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getActiveTenantId } from '../services/tenantService';
import { permissionService, TenantPermissions, FunctionPermissions, DEFAULT_GERENTE_PERMISSIONS, DEFAULT_BARBEIRO_PERMISSIONS } from '../services/permissionService';

export function usePermissions() {
  const { profile, isAdmin, isSaaSAdmin } = useAuth();
  const [permissions, setPermissions] = useState<TenantPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const tenantId = profile?.tenantId || getActiveTenantId();

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    // Subscribe to permission changes in real time
    const docRef = doc(db, 'tenant_permissions', tenantId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setPermissions({
          id: snap.id,
          tenantId: data.tenantId || tenantId,
          gerente: { ...DEFAULT_GERENTE_PERMISSIONS, ...(data.gerente || {}) },
          barbeiro: { ...DEFAULT_BARBEIRO_PERMISSIONS, ...(data.barbeiro || {}) }
        } as TenantPermissions);
      } else {
        // Fallback to default permissions if document doesn't exist
        setPermissions({
          id: tenantId,
          tenantId: tenantId,
          gerente: DEFAULT_GERENTE_PERMISSIONS,
          barbeiro: DEFAULT_BARBEIRO_PERMISSIONS
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to tenant permissions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const hasPermission = (permissionKey: keyof FunctionPermissions): boolean => {
    // If Admin or SaaS Admin, always allow
    if (isAdmin || isSaaSAdmin || profile?.tipo === 'admin' || profile?.tipo === 'saas_admin') {
      return true;
    }

    const role = profile?.tipo || 'cliente';
    return permissionService.hasPermission(role, permissionKey, permissions);
  };

  return {
    permissions,
    hasPermission,
    loading
  };
}
export default usePermissions;
