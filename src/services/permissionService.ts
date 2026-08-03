import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';

export interface FunctionPermissions {
  reopen_comanda: boolean;      // Reabrir comanda
  apply_discount: boolean;      // Aplicar descontos customizados
  add_cortesia: boolean;        // Lançar cortesia
  edit_price: boolean;          // Alterar preço unitário de itens
  reset_payments: boolean;      // Zerar lançamentos de pagamentos parciais
  sell_subscription: boolean;   // Vender assinaturas/pacotes
  delete_subscription: boolean; // Cancelar/excluir assinaturas de clientes
  view_financial: boolean;      // Visualizar painel e relatórios financeiros
  manage_cash: boolean;         // Abrir/fechar/reabrir caixas diários
  edit_clients: boolean;        // Cadastrar/editar perfis de clientes
}

export interface TenantPermissions {
  id: string;
  tenantId: string;
  gerente: FunctionPermissions;
  barbeiro: FunctionPermissions;
  updatedAt?: any;
}

export const DEFAULT_GERENTE_PERMISSIONS: FunctionPermissions = {
  reopen_comanda: true,
  apply_discount: true,
  add_cortesia: true,
  edit_price: true,
  reset_payments: true,
  sell_subscription: true,
  delete_subscription: true,
  view_financial: true,
  manage_cash: true,
  edit_clients: true,
};

export const DEFAULT_BARBEIRO_PERMISSIONS: FunctionPermissions = {
  reopen_comanda: false,
  apply_discount: false,
  add_cortesia: false,
  edit_price: false,
  reset_payments: false,
  sell_subscription: true,
  delete_subscription: false,
  view_financial: false,
  manage_cash: false,
  edit_clients: true,
};

export const permissionService = {
  async getPermissions(tenantId: string = getActiveTenantId()): Promise<TenantPermissions> {
    if (!tenantId) {
      return {
        id: 'default',
        tenantId: 'default',
        gerente: DEFAULT_GERENTE_PERMISSIONS,
        barbeiro: DEFAULT_BARBEIRO_PERMISSIONS
      };
    }

    try {
      const docRef = doc(db, 'tenant_permissions', tenantId);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        return {
          id: snap.id,
          tenantId: data.tenantId || tenantId,
          gerente: { ...DEFAULT_GERENTE_PERMISSIONS, ...(data.gerente || {}) },
          barbeiro: { ...DEFAULT_BARBEIRO_PERMISSIONS, ...(data.barbeiro || {}) }
        } as TenantPermissions;
      }

      // If document doesn't exist, return default structure but don't save yet
      return {
        id: tenantId,
        tenantId: tenantId,
        gerente: DEFAULT_GERENTE_PERMISSIONS,
        barbeiro: DEFAULT_BARBEIRO_PERMISSIONS
      };
    } catch (error) {
      console.error(`Error getting permissions for ${tenantId}:`, error);
      return {
        id: tenantId,
        tenantId: tenantId,
        gerente: DEFAULT_GERENTE_PERMISSIONS,
        barbeiro: DEFAULT_BARBEIRO_PERMISSIONS
      };
    }
  },

  async savePermissions(permissions: Omit<TenantPermissions, 'id' | 'updatedAt'>, tenantId: string = getActiveTenantId()): Promise<void> {
    try {
      const docRef = doc(db, 'tenant_permissions', tenantId);
      await setDoc(docRef, {
        tenantId,
        gerente: permissions.gerente,
        barbeiro: permissions.barbeiro,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error(`Error saving permissions for ${tenantId}:`, error);
      throw error;
    }
  },

  /**
   * Evaluates if a given role has a specific permission based on active tenant permissions.
   * If the user is admin/saas_admin, they always have all permissions.
   */
  hasPermission(role: string, permissionKey: keyof FunctionPermissions, tenantPerms: TenantPermissions | null): boolean {
    if (role === 'admin' || role === 'saas_admin') {
      return true;
    }
    if (!tenantPerms) {
      // Fallback to defaults
      if (role === 'gerente') {
        return DEFAULT_GERENTE_PERMISSIONS[permissionKey];
      }
      if (role === 'barbeiro') {
        return DEFAULT_BARBEIRO_PERMISSIONS[permissionKey];
      }
      return false;
    }

    if (role === 'gerente') {
      return tenantPerms.gerente?.[permissionKey] ?? DEFAULT_GERENTE_PERMISSIONS[permissionKey];
    }
    if (role === 'barbeiro') {
      return tenantPerms.barbeiro?.[permissionKey] ?? DEFAULT_BARBEIRO_PERMISSIONS[permissionKey];
    }

    return false;
  }
};
