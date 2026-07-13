import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  getDoc, 
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { Product, ProductCategory, InventoryMovement } from '../types';
import { getActiveTenantId } from './tenantService';

const PRODUCTS_COLLECTION = 'products';
const CATEGORIES_COLLECTION = 'product_categories';
const MOVEMENTS_COLLECTION = 'inventory_movements';

export const inventoryService = {
  // Products
  async getProducts() {
    const q = query(collection(db, PRODUCTS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
    return products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  async getProduct(id: string) {
    const docRef = doc(db, PRODUCTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Product;
    }
    return null;
  },

  async createProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
      ...product,
      tenantId: getActiveTenantId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return docRef.id;
  },

  async updateProduct(id: string, data: Partial<Product>) {
    const docRef = doc(db, PRODUCTS_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  },

  async deleteProduct(id: string) {
    const docRef = doc(db, PRODUCTS_COLLECTION, id);
    await deleteDoc(docRef);
  },

  // Categories
  async getCategories() {
    const q = query(collection(db, CATEGORIES_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductCategory));
    return categories.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  async createCategory(name: string) {
    const docRef = await addDoc(collection(db, CATEGORIES_COLLECTION), {
      tenantId: getActiveTenantId(),
      name,
      active: true
    });
    return docRef.id;
  },

  async updateCategory(id: string, name: string) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    await updateDoc(docRef, { name });
  },

  async deleteCategory(id: string) {
    const docRef = doc(db, CATEGORIES_COLLECTION, id);
    await deleteDoc(docRef);
  },

  // Movements
  async getMovements(produto_id?: string) {
    let q = query(collection(db, MOVEMENTS_COLLECTION), where('tenantId', '==', getActiveTenantId()));
    if (produto_id) {
      q = query(q, where('produto_id', '==', produto_id));
    }
    const querySnapshot = await getDocs(q);
    const movements = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryMovement));
    return movements.sort((a, b) => {
      const aDate = a.date || '';
      const bDate = b.date || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      const aTime = a.createdAt || '';
      const bTime = b.createdAt || '';
      return bTime.localeCompare(aTime);
    });
  },

  async registerMovement(
    movement: Omit<InventoryMovement, 'id' | 'createdAt'>, 
    financialData?: { amount: number; paymentMethod: string; category: string }
  ) {
    return await runTransaction(db, async (transaction) => {
      const productRef = doc(db, PRODUCTS_COLLECTION, movement.produto_id);
      const productDoc = await transaction.get(productRef);
      
      if (!productDoc.exists()) {
        throw new Error("Produto não encontrado");
      }

      const currentStock = productDoc.data().currentStock || 0;
      let newStock = currentStock;

      // Calculate new stock based on movement type
      if (movement.type === 'entrada') {
        newStock += movement.quantity;
      } else if (['saida', 'consumo_interno', 'venda'].includes(movement.type)) {
        newStock -= movement.quantity;
      } else if (movement.type === 'ajuste') {
        newStock = movement.quantity; // In adjustment, quantity is the new total
      }

      // Prevent negative stock unless it's an adjustment or specific rule
      if (newStock < 0 && movement.type !== 'ajuste') {
        throw new Error("Estoque insuficiente para esta operação");
      }

      let financialId = undefined;

      // Create financial transaction if needed
      if (financialData) {
        const financialRef = doc(collection(db, 'financial_transactions'));
        financialId = financialRef.id;
        
        transaction.set(financialRef, {
          tenantId: getActiveTenantId(),
          type: movement.type === 'venda' ? 'income' : 'expense',
          amount: financialData.amount,
          date: movement.date,
          category: financialData.category,
          description: `Estoque: ${movement.type.replace('_', ' ')} - ${movement.productName} (${movement.quantity} un)`,
          paymentMethod: financialData.paymentMethod,
          status: 'pago',
          profissional_id: movement.profissional_id,
          profissional_name: movement.profissional_name,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // Create movement record
      const movementRef = doc(collection(db, MOVEMENTS_COLLECTION));
      transaction.set(movementRef, {
        ...movement,
        tenantId: getActiveTenantId(),
        financialId,
        createdAt: new Date().toISOString()
      });

      // Update product stock
      transaction.update(productRef, {
        currentStock: newStock,
        updatedAt: new Date().toISOString()
      });

      return movementRef.id;
    });
  }
};
