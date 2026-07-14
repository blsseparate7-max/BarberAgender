import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getActiveTenantId } from './tenantService';

export const resetService = {
  async resetAllDatabase(): Promise<{ totalDeleted: number; error?: string }> {
    try {
      const currentUser = auth.currentUser;
      const activeTenantId = getActiveTenantId();
      
      const collectionsToClear = [
        'appointments',
        'comandas',
        'financial_transactions',
        'cash_sessions',
        'cash_movements',
        'accounts_payable',
        'accounts_receivable',
        'products',
        'product_categories',
        'inventory_movements',
        'tipos_fornecedores',
        'services',
        'service_categories',
        'cupons_desconto',
        'pesquisa_perguntas',
        'pesquisa_respostas',
        'mensagens_modelos',
        'commissions',
        'professional_advances',
        'professional_payments',
        'pacotes_vendas',
        'subscriptions',
        'automation_campaigns',
        'agenda_blocks',
        'loyalties',
        'payment_methods',
        'settings'
      ];

      let totalDeleted = 0;

      // 1. Clear simple collections
      for (const colName of collectionsToClear) {
        try {
          const querySnapshot = await getDocs(collection(db, colName));
          if (!querySnapshot.empty) {
            const batch = writeBatch(db);
            let count = 0;
            querySnapshot.docs.forEach((docSnap) => {
              batch.delete(docSnap.ref);
              totalDeleted++;
              count++;
            });
            if (count > 0) {
              await batch.commit();
            }
          }
        } catch (err) {
          console.error(`Error clearing collection ${colName}:`, err);
        }
      }

      // 2. Clear 'usuarios' collection except the currently authenticated user
      try {
        const usersSnapshot = await getDocs(collection(db, 'usuarios'));
        if (!usersSnapshot.empty) {
          const batch = writeBatch(db);
          let count = 0;
          usersSnapshot.docs.forEach((docSnap) => {
            const uid = docSnap.id;
            if (currentUser && uid === currentUser.uid) {
              // Keep the logged in user so they stay authenticated
              return;
            }
            batch.delete(docSnap.ref);
            totalDeleted++;
            count++;
          });
          if (count > 0) {
            await batch.commit();
          }
        }
      } catch (err) {
        console.error('Error clearing usuarios collection:', err);
      }

      // 3. Clear 'tenants' collection except the currently active tenant
      try {
        const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
        if (!tenantsSnapshot.empty) {
          const batch = writeBatch(db);
          let count = 0;
          tenantsSnapshot.docs.forEach((docSnap) => {
            const tenantId = docSnap.id;
            if (tenantId === activeTenantId) {
              // Keep current tenant
              return;
            }
            batch.delete(docSnap.ref);
            totalDeleted++;
            count++;
          });
          if (count > 0) {
            await batch.commit();
          }
        }
      } catch (err) {
        console.error('Error clearing tenants collection:', err);
      }

      return { totalDeleted };
    } catch (error: any) {
      console.error('Error resetting database:', error);
      return { totalDeleted: 0, error: error.message || 'Erro desconhecido ao resetar o banco de dados.' };
    }
  }
};
