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

      const productData = productDoc.data();
      const currentStock = productData.currentStock || 0;
      let newStock = currentStock;

      // Calculate new stock based on movement type
      if (movement.type === 'entrada') {
        newStock += movement.quantity;
      } else if (['saida', 'consumo_interno', 'venda'].includes(movement.type)) {
        newStock -= movement.quantity;
      } else if (movement.type === 'ajuste') {
        newStock = movement.quantity; // In adjustment, quantity is the new total
      }

      // Prevent negative stock unless it's an adjustment
      if (newStock < 0 && movement.type !== 'ajuste') {
        throw new Error("Estoque insuficiente para esta operação");
      }

      let financialId = undefined;
      let commissionId = undefined;

      // 1. Create financial transaction if requested
      if (financialData && financialData.amount > 0) {
        const financialRef = doc(collection(db, 'financial_transactions'));
        financialId = financialRef.id;
        
        transaction.set(financialRef, {
          tenantId: getActiveTenantId(),
          type: movement.type === 'venda' ? 'income' : 'expense',
          amount: financialData.amount,
          date: movement.date,
          category: financialData.category,
          description: `Estoque: ${movement.type.replace('_', ' ')} - ${movement.productName} (${movement.quantity} un)${movement.categoryReason ? ` [${movement.categoryReason}]` : ''}`,
          paymentMethod: financialData.paymentMethod || 'dinheiro',
          status: 'pago',
          profissional_id: movement.profissional_id || '',
          profissional_name: movement.profissional_name || '',
          cliente_id: movement.cliente_id || null,
          cliente_name: movement.cliente_name || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      // 2. Generate sales commission if it's a direct sale ('venda') with a professional assigned
      if (movement.type === 'venda' && movement.profissional_id) {
        const bSnap = await transaction.get(doc(db, 'usuarios', movement.profissional_id));
        const barberData = bSnap.exists() ? bSnap.data() : null;
        const defaultPercentage = barberData?.commission_percentage || 0;

        const tipoComissao = productData.tipo_comissao || 'padrao';
        const valorComissao = productData.valor_comissao !== undefined ? productData.valor_comissao : 0;
        const proOverride = productData.comissoes_por_profissional?.[movement.profissional_id];
        const effectiveRule = proOverride || { tipo: tipoComissao, valor: valorComissao };

        const totalSale = financialData?.amount || movement.totalAmount || (movement.quantity * (productData.salePrice || 0));
        let comm_percentage = defaultPercentage;
        let comm_value = 0;

        if (effectiveRule.tipo === 'percentual') {
          comm_percentage = effectiveRule.valor;
          comm_value = (totalSale * comm_percentage) / 100;
        } else if (effectiveRule.tipo === 'fixo') {
          comm_value = effectiveRule.valor * movement.quantity;
          comm_percentage = totalSale > 0 ? (comm_value / totalSale) * 100 : 0;
        } else {
          comm_percentage = defaultPercentage;
          comm_value = (totalSale * comm_percentage) / 100;
        }

        if (comm_value > 0) {
          const commRef = doc(collection(db, 'commissions'));
          commissionId = commRef.id;
          transaction.set(commRef, {
            id: commRef.id,
            tenantId: getActiveTenantId(),
            profissional_id: movement.profissional_id,
            profissional_name: movement.profissional_name,
            comanda_id: null,
            comanda_number: 'BALCÃO',
            cliente_id: movement.cliente_id || null,
            cliente_name: movement.cliente_name || 'Cliente Avulso',
            servico_id: movement.produto_id,
            servico_nome: `[Produto] ${movement.productName}`,
            item_type: 'produto',
            base_value: totalSale,
            commission_percentage: Math.round(comm_percentage),
            commission_value: Math.round(comm_value * 100) / 100,
            date: movement.date,
            status: 'pendente',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }

      // 3. Create movement record with full context
      const movementRef = doc(collection(db, MOVEMENTS_COLLECTION));
      transaction.set(movementRef, {
        produto_id: movement.produto_id || '',
        productName: movement.productName || '',
        type: movement.type || 'entrada',
        quantity: movement.quantity || 0,
        unitPrice: movement.unitPrice ?? productData.salePrice ?? 0,
        costPrice: movement.costPrice ?? productData.costPrice ?? 0,
        totalAmount: movement.totalAmount ?? financialData?.amount ?? 0,
        reason: movement.reason || '',
        categoryReason: movement.categoryReason || '',
        profissional_id: movement.profissional_id || '',
        profissional_name: movement.profissional_name || '',
        cliente_id: movement.cliente_id || '',
        cliente_name: movement.cliente_name || '',
        fornecedor_id: movement.fornecedor_id || '',
        fornecedor_name: movement.fornecedor_name || '',
        paymentMethod: movement.paymentMethod || financialData?.paymentMethod || '',
        financialId: financialId || null,
        commissionId: commissionId || null,
        date: movement.date || new Date().toISOString().split('T')[0],
        tenantId: getActiveTenantId(),
        createdAt: new Date().toISOString()
      });

      // 4. Update product stock and optional supplier/cost price
      const productUpdate: any = {
        currentStock: newStock,
        updatedAt: new Date().toISOString()
      };

      if (movement.type === 'entrada') {
        if (movement.fornecedor_id) {
          productUpdate.fornecedor_id = movement.fornecedor_id;
          productUpdate.fornecedor_name = movement.fornecedor_name || '';
        }
        if (movement.costPrice !== undefined && movement.costPrice > 0) {
          productUpdate.costPrice = movement.costPrice;
        }
      }

      transaction.update(productRef, productUpdate);

      return movementRef.id;
    });
  }
};
