import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { PaymentMethodConfig } from '../types';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'payment_methods';

export const paymentMethodService = {
  async getPaymentMethods() {
    const q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      await this.seedDefaultMethods();
      return this.getPaymentMethods();
    }

    const list = querySnapshot.docs.map(doc => {
      const data = doc.data();
      const nome = data.nome || data.name || '';
      const name = data.name || data.nome || '';
      const tipo = data.tipo || data.type || 'outros';
      const type = data.type || data.tipo || 'outros';
      const taxa_percentual = data.taxa_percentual !== undefined ? data.taxa_percentual : (data.feePercentage !== undefined ? data.feePercentage : 0);
      const feePercentage = data.feePercentage !== undefined ? data.feePercentage : (data.taxa_percentual !== undefined ? data.taxa_percentual : 0);
      const prazo_recebimento = data.prazo_recebimento !== undefined ? data.prazo_recebimento : (data.settlementDays !== undefined ? data.settlementDays : 0);
      const settlementDays = data.settlementDays !== undefined ? data.settlementDays : (data.prazo_recebimento !== undefined ? data.prazo_recebimento : 0);
      const recebe_na_hora = data.recebe_na_hora !== undefined ? data.recebe_na_hora : (data.receivesImmediately !== undefined ? data.receivesImmediately : false);
      const receivesImmediately = data.receivesImmediately !== undefined ? data.receivesImmediately : (data.recebe_na_hora !== undefined ? data.recebe_na_hora : false);
      const entra_no_caixa = data.entra_no_caixa !== undefined ? data.entra_no_caixa : (data.entersCashImmediately !== undefined ? data.entersCashImmediately : false);
      const entersCashImmediately = data.entersCashImmediately !== undefined ? data.entersCashImmediately : (data.entra_no_caixa !== undefined ? data.entra_no_caixa : false);
      const vai_para_recebiveis = data.vai_para_recebiveis !== undefined ? data.vai_para_recebiveis : (data.goesToReceivables !== undefined ? data.goesToReceivables : false);
      const goesToReceivables = data.goesToReceivables !== undefined ? data.goesToReceivables : (data.vai_para_recebiveis !== undefined ? data.vai_para_recebiveis : false);
      const vai_para_conta_cliente = data.vai_para_conta_cliente !== undefined ? data.vai_para_conta_cliente : (data.goesToClientAccount !== undefined ? data.goesToClientAccount : false);
      const goesToClientAccount = data.goesToClientAccount !== undefined ? data.goesToClientAccount : (data.vai_para_conta_cliente !== undefined ? data.vai_para_conta_cliente : false);
      const permite_parcial = data.permite_parcial !== undefined ? data.permite_parcial : (data.allowsPartial !== undefined ? data.allowsPartial : false);
      const allowsPartial = data.allowsPartial !== undefined ? data.allowsPartial : (data.permite_parcial !== undefined ? data.permite_parcial : false);
      const permite_split = data.permite_split !== undefined ? data.permite_split : (data.allowsSplit !== undefined ? data.allowsSplit : false);
      const allowsSplit = data.allowsSplit !== undefined ? data.allowsSplit : (data.permite_split !== undefined ? data.permite_split : false);

      return {
        ...data,
        id: doc.id,
        nome, name,
        tipo, type,
        taxa_percentual, feePercentage,
        prazo_recebimento, settlementDays,
        recebe_na_hora, receivesImmediately,
        entra_no_caixa, entersCashImmediately,
        vai_para_recebiveis, goesToReceivables,
        vai_para_conta_cliente, goesToClientAccount,
        permite_parcial, allowsPartial,
        permite_split, allowsSplit
      } as PaymentMethodConfig;
    });

    return list.sort((a, b) => a.nome.localeCompare(b.nome));
  },

  async getActivePaymentMethods() {
    const list = await this.getPaymentMethods();
    return list.filter(m => m.status === 'active');
  },

  async createPaymentMethod(data: Partial<PaymentMethodConfig>) {
    const docRef = doc(collection(db, COLLECTION));
    const nome = data.nome || data.name || '';
    const name = data.name || data.nome || '';
    const tipo = data.tipo || data.type || 'outros';
    const type = data.type || data.tipo || 'outros';
    const taxa_percentual = data.taxa_percentual !== undefined ? data.taxa_percentual : (data.feePercentage !== undefined ? data.feePercentage : 0);
    const feePercentage = data.feePercentage !== undefined ? data.feePercentage : (data.taxa_percentual !== undefined ? data.taxa_percentual : 0);
    const prazo_recebimento = data.prazo_recebimento !== undefined ? data.prazo_recebimento : (data.settlementDays !== undefined ? data.settlementDays : 0);
    const settlementDays = data.settlementDays !== undefined ? data.settlementDays : (data.prazo_recebimento !== undefined ? data.prazo_recebimento : 0);
    const recebe_na_hora = data.recebe_na_hora !== undefined ? data.recebe_na_hora : (data.receivesImmediately !== undefined ? data.receivesImmediately : false);
    const receivesImmediately = data.receivesImmediately !== undefined ? data.receivesImmediately : (data.recebe_na_hora !== undefined ? data.recebe_na_hora : false);
    const entra_no_caixa = data.entra_no_caixa !== undefined ? data.entra_no_caixa : (data.entersCashImmediately !== undefined ? data.entersCashImmediately : false);
    const entersCashImmediately = data.entersCashImmediately !== undefined ? data.entersCashImmediately : (data.entra_no_caixa !== undefined ? data.entra_no_caixa : false);
    const vai_para_recebiveis = data.vai_para_recebiveis !== undefined ? data.vai_para_recebiveis : (data.goesToReceivables !== undefined ? data.goesToReceivables : false);
    const goesToReceivables = data.goesToReceivables !== undefined ? data.goesToReceivables : (data.vai_para_recebiveis !== undefined ? data.vai_para_recebiveis : false);
    const vai_para_conta_cliente = data.vai_para_conta_cliente !== undefined ? data.vai_para_conta_cliente : (data.goesToClientAccount !== undefined ? data.goesToClientAccount : false);
    const goesToClientAccount = data.goesToClientAccount !== undefined ? data.goesToClientAccount : (data.vai_para_conta_cliente !== undefined ? data.vai_para_conta_cliente : false);
    const permite_parcial = data.permite_parcial !== undefined ? data.permite_parcial : (data.allowsPartial !== undefined ? data.allowsPartial : false);
    const allowsPartial = data.allowsPartial !== undefined ? data.allowsPartial : (data.permite_parcial !== undefined ? data.permite_parcial : false);
    const permite_split = data.permite_split !== undefined ? data.permite_split : (data.allowsSplit !== undefined ? data.allowsSplit : false);
    const allowsSplit = data.allowsSplit !== undefined ? data.allowsSplit : (data.permite_split !== undefined ? data.permite_split : false);

    const newMethod: PaymentMethodConfig = {
      id: docRef.id,
      tenantId: getActiveTenantId(),
      nome, name,
      tipo, type,
      tipo_legado: tipo,
      status: data.status || 'active',
      taxa_percentual, feePercentage,
      prazo_recebimento, settlementDays,
      recebe_na_hora, receivesImmediately,
      entra_no_caixa, entersCashImmediately,
      vai_para_recebiveis, goesToReceivables,
      vai_para_conta_cliente, goesToClientAccount,
      permite_parcial, allowsPartial,
      permite_split, allowsSplit,
      description: data.description || '',
      internalNotes: data.internalNotes || '',
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any
    };
    await setDoc(docRef, newMethod);
    return docRef.id;
  },

  async updatePaymentMethod(id: string, data: Partial<PaymentMethodConfig>) {
    const docRef = doc(db, COLLECTION, id);
    const updateData: any = { ...data, updatedAt: serverTimestamp() };
    
    // Maintain dual fields for compatibility
    if (data.nome !== undefined || data.name !== undefined) {
      const val = data.name !== undefined && data.name !== '' ? data.name : (data.nome || '');
      updateData.nome = val;
      updateData.name = val;
    }
    if (data.tipo !== undefined || data.type !== undefined) {
      const val = data.type || data.tipo || 'outros';
      updateData.tipo = val;
      updateData.type = val;
      updateData.tipo_legado = val;
    }
    if (data.taxa_percentual !== undefined || data.feePercentage !== undefined) {
      const val = data.feePercentage !== undefined ? data.feePercentage : data.taxa_percentual;
      const numVal = Number(val) || 0;
      updateData.taxa_percentual = numVal;
      updateData.feePercentage = numVal;
    }
    
    // Determine the updated days properly. If settlementDays or prazo_recebimento were supplied:
    let updatedDays: number | undefined = undefined;
    if (data.settlementDays !== undefined && data.prazo_recebimento !== undefined) {
      // If both are present in data (e.g. from spread object), check which one changed or prefer settlementDays if they differ
      updatedDays = Number(data.settlementDays);
    } else if (data.settlementDays !== undefined) {
      updatedDays = Number(data.settlementDays);
    } else if (data.prazo_recebimento !== undefined) {
      updatedDays = Number(data.prazo_recebimento);
    }

    if (updatedDays !== undefined && !isNaN(updatedDays)) {
      updateData.prazo_recebimento = updatedDays;
      updateData.settlementDays = updatedDays;

      // Automatically sync flow rules if changing settlement days or type
      const currentType = updateData.type || updateData.tipo || data.type || data.tipo || 'outros';
      if (currentType === 'fiado') {
        updateData.recebe_na_hora = false;
        updateData.receivesImmediately = false;
        updateData.entra_no_caixa = false;
        updateData.entersCashImmediately = false;
        updateData.vai_para_recebiveis = false;
        updateData.goesToReceivables = false;
        updateData.vai_para_conta_cliente = true;
        updateData.goesToClientAccount = true;
      } else if (updatedDays > 0) {
        updateData.recebe_na_hora = false;
        updateData.receivesImmediately = false;
        updateData.entra_no_caixa = false;
        updateData.entersCashImmediately = false;
        updateData.vai_para_recebiveis = true;
        updateData.goesToReceivables = true;
        updateData.vai_para_conta_cliente = false;
        updateData.goesToClientAccount = false;
      } else {
        updateData.recebe_na_hora = true;
        updateData.receivesImmediately = true;
        updateData.entra_no_caixa = true;
        updateData.entersCashImmediately = true;
        updateData.vai_para_recebiveis = false;
        updateData.goesToReceivables = false;
        updateData.vai_para_conta_cliente = false;
        updateData.goesToClientAccount = false;
      }
    }

    if (data.recebe_na_hora !== undefined || data.receivesImmediately !== undefined) {
      const val = data.receivesImmediately !== undefined ? data.receivesImmediately : data.recebe_na_hora;
      if (updateData.receivesImmediately === undefined) {
        updateData.recebe_na_hora = !!val;
        updateData.receivesImmediately = !!val;
      }
    }
    if (data.entra_no_caixa !== undefined || data.entersCashImmediately !== undefined) {
      const val = data.entersCashImmediately !== undefined ? data.entersCashImmediately : data.entra_no_caixa;
      if (updateData.entersCashImmediately === undefined) {
        updateData.entra_no_caixa = !!val;
        updateData.entersCashImmediately = !!val;
      }
    }
    if (data.vai_para_recebiveis !== undefined || data.goesToReceivables !== undefined) {
      const val = data.goesToReceivables !== undefined ? data.goesToReceivables : data.vai_para_recebiveis;
      if (updateData.goesToReceivables === undefined) {
        updateData.vai_para_recebiveis = !!val;
        updateData.goesToReceivables = !!val;
      }
    }
    if (data.vai_para_conta_cliente !== undefined || data.goesToClientAccount !== undefined) {
      const val = data.goesToClientAccount !== undefined ? data.goesToClientAccount : data.vai_para_conta_cliente;
      if (updateData.goesToClientAccount === undefined) {
        updateData.vai_para_conta_cliente = !!val;
        updateData.goesToClientAccount = !!val;
      }
    }
    if (data.permite_parcial !== undefined || data.allowsPartial !== undefined) {
      const val = data.allowsPartial !== undefined ? data.allowsPartial : data.permite_parcial;
      updateData.permite_parcial = !!val;
      updateData.allowsPartial = !!val;
    }
    if (data.permite_split !== undefined || data.allowsSplit !== undefined) {
      const val = data.allowsSplit !== undefined ? data.allowsSplit : data.permite_split;
      updateData.permite_split = !!val;
      updateData.allowsSplit = !!val;
    }

    await updateDoc(docRef, updateData);
  },

  async deletePaymentMethod(id: string) {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  },

  async seedDefaultMethods() {
    const defaults: Partial<PaymentMethodConfig>[] = [
      { 
        nome: 'Dinheiro', 
        tipo: 'dinheiro', 
        status: 'active', 
        taxa_percentual: 0, 
        prazo_recebimento: 0, 
        recebe_na_hora: true,
        entra_no_caixa: true,
        vai_para_recebiveis: false,
        vai_para_conta_cliente: false,
        permite_parcial: true,
        permite_split: true,
        description: 'Pagamento em espécie'
      },
      { 
        nome: 'PIX', 
        tipo: 'pix', 
        status: 'active', 
        taxa_percentual: 0, 
        prazo_recebimento: 0, 
        recebe_na_hora: true,
        entra_no_caixa: true,
        vai_para_recebiveis: false,
        vai_para_conta_cliente: false,
        permite_parcial: true,
        permite_split: true,
        description: 'Pagamento instantâneo via PIX'
      },
      { 
        nome: 'Cartão de Débito', 
        tipo: 'debito', 
        status: 'active', 
        taxa_percentual: 1.9, 
        prazo_recebimento: 1, 
        recebe_na_hora: false,
        entra_no_caixa: false,
        vai_para_recebiveis: true,
        vai_para_conta_cliente: false,
        permite_parcial: true,
        permite_split: true,
        description: 'Recebimento em D+1'
      },
      { 
        nome: 'Cartão de Crédito', 
        tipo: 'credito', 
        status: 'active', 
        taxa_percentual: 3.5, 
        prazo_recebimento: 30, 
        recebe_na_hora: false,
        entra_no_caixa: false,
        vai_para_recebiveis: true,
        vai_para_conta_cliente: false,
        permite_parcial: true,
        permite_split: true,
        description: 'Recebimento em D+30'
      },
      { 
        nome: 'Fiado', 
        tipo: 'fiado', 
        status: 'active', 
        taxa_percentual: 0, 
        prazo_recebimento: 0, 
        recebe_na_hora: false,
        entra_no_caixa: false,
        vai_para_recebiveis: false,
        vai_para_conta_cliente: true,
        permite_parcial: true,
        permite_split: true,
        description: 'Lançamento na conta do cliente'
      },
      { 
        nome: 'Assinatura', 
        tipo: 'assinatura', 
        status: 'active', 
        taxa_percentual: 0, 
        prazo_recebimento: 0, 
        recebe_na_hora: true,
        entra_no_caixa: false,
        vai_para_recebiveis: false,
        vai_para_conta_cliente: false,
        permite_parcial: false,
        permite_split: false,
        description: 'Uso de créditos de assinatura'
      },
    ];

    for (const method of defaults) {
      await this.createPaymentMethod(method);
    }
  }
};
