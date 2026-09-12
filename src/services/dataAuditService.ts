import { 
  collection, 
  getDocs, 
  doc, 
  deleteDoc, 
  writeBatch,
  query,
  where,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getActiveTenantId } from './tenantService';

export interface AuditReportResult {
  totalRemovedAmount: number;
  removedTransactionsCount: number;
  removedCommissionsCount: number;
  removedCommissionsAmount: number;
  removedCashMovementsCount: number;
  removedEmptyComandasCount: number;
  affectedComandasCount: number;
  details: {
    orphanTransactions: Array<{ id: string; description: string; amount: number; date: string; reason: string }>;
    duplicateTransactions: Array<{ id: string; description: string; amount: number; date: string; reason: string }>;
    cancelledComandaTransactions: Array<{ id: string; description: string; amount: number; date: string; comandaNumber?: string }>;
    orphanCommissions: Array<{ id: string; profissional_name: string; value: number; date: string; reason: string }>;
    orphanCashMovements: Array<{ id: string; description: string; amount: number; date: string }>;
    emptyComandas: Array<{ id: string; number?: string; date?: string }>;
  };
}

export const dataAuditService = {
  /**
   * Executa a auditoria e limpeza profunda de dados órfãos, fantasmas e duplicidades.
   */
  async cleanOrphanAndGhostData(userId: string, userName: string): Promise<AuditReportResult> {
    const activeTenantId = getActiveTenantId();

    // 1. Carrega todas as comandas do tenant
    const comandasQ = activeTenantId 
      ? query(collection(db, 'comandas'), where('tenantId', '==', activeTenantId))
      : query(collection(db, 'comandas'));
    const comandasSnap = await getDocs(comandasQ);
    const comandas = comandasSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const comandaMap = new Map(comandas.map(c => [c.id, c]));

    // 2. Carrega todas as transações financeiras
    const txQ = activeTenantId 
      ? query(collection(db, 'financial_transactions'), where('tenantId', '==', activeTenantId))
      : query(collection(db, 'financial_transactions'));
    const txSnap = await getDocs(txQ);
    const transactions = txSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() as any }));

    // 3. Carrega todas as comissões
    const commQ = activeTenantId 
      ? query(collection(db, 'commissions'), where('tenantId', '==', activeTenantId))
      : query(collection(db, 'commissions'));
    const commSnap = await getDocs(commQ);
    const commissions = commSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() as any }));

    // 4. Carrega todas as movimentações de caixa
    const cmQ = collection(db, 'cash_movements');
    const cmSnap = await getDocs(cmQ);
    const cashMovements = cmSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() as any }));

    // 5. Carrega agendamentos
    const appQ = activeTenantId 
      ? query(collection(db, 'appointments'), where('tenantId', '==', activeTenantId))
      : query(collection(db, 'appointments'));
    const appSnap = await getDocs(appQ);
    const appointments = appSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    const appointmentMap = new Map(appointments.map(a => [a.id, a]));

    const result: AuditReportResult = {
      totalRemovedAmount: 0,
      removedTransactionsCount: 0,
      removedCommissionsCount: 0,
      removedCommissionsAmount: 0,
      removedCashMovementsCount: 0,
      removedEmptyComandasCount: 0,
      affectedComandasCount: 0,
      details: {
        orphanTransactions: [],
        duplicateTransactions: [],
        cancelledComandaTransactions: [],
        orphanCommissions: [],
        orphanCashMovements: [],
        emptyComandas: []
      }
    };

    const txsToDelete: any[] = [];
    const commsToDelete: any[] = [];
    const cmsToDelete: any[] = [];
    const comandasToDelete: any[] = [];

    // --- A. AUDITAR TRANSAÇÕES FINANCEIRAS ---
    const seenSignatures = new Map<string, any>();

    for (const t of transactions) {
      const comId = t.comanda_id;
      const amount = Number(t.amount || 0);

      // 1. Transação vinculada a Comanda Inexistente (Órfã pura)
      if (comId && !comandaMap.has(comId)) {
        txsToDelete.push(t);
        result.totalRemovedAmount += amount;
        result.details.orphanTransactions.push({
          id: t.id,
          description: t.description || 'Sem descrição',
          amount,
          date: t.date || '',
          reason: `Comanda vinculada [ID: ${comId}] não existe no banco de dados.`
        });
        continue;
      }

      // 2. Transação vinculada a Comanda Cancelada ou Ausente
      if (comId && comandaMap.has(comId)) {
        const cmd = comandaMap.get(comId);
        if (cmd.status === 'cancelada' || cmd.status === 'ausente') {
          txsToDelete.push(t);
          result.totalRemovedAmount += amount;
          result.details.cancelledComandaTransactions.push({
            id: t.id,
            description: t.description || 'Sem descrição',
            amount,
            date: t.date || '',
            comandaNumber: cmd.number
          });
          continue;
        }
      }

      // 3. Transação com agendamento_id onde já existe Comanda Fechada/Paga para aquele agendamento (Duplicidade legada)
      if (t.agendamento_id && !t.comanda_id) {
        const matchingComanda = comandas.find(c => 
          c.agendamento_id === t.agendamento_id || 
          (c.items && c.items.some((it: any) => it.agendamento_id === t.agendamento_id))
        );
        if (matchingComanda && (matchingComanda.status === 'fechada' || matchingComanda.status === 'nao_paga')) {
          txsToDelete.push(t);
          result.totalRemovedAmount += amount;
          result.details.duplicateTransactions.push({
            id: t.id,
            description: t.description || 'Sem descrição',
            amount,
            date: t.date || '',
            reason: `Duplicidade: Lançamento direto do agendamento substituído pela Comanda #${matchingComanda.number}`
          });
          continue;
        }
      }

      // 4. Detecção de Duplicidade Exata (mesmo dia, cliente, valor, descrição e método de pagamento)
      if (t.type === 'income' && t.status === 'pago') {
        const sig = `${t.date}_${t.amount}_${t.paymentMethod}_${t.cliente_id || 'sem_cliente'}_${t.description}`;
        if (seenSignatures.has(sig)) {
          // É uma duplicidade
          txsToDelete.push(t);
          result.totalRemovedAmount += amount;
          result.details.duplicateTransactions.push({
            id: t.id,
            description: t.description || 'Sem descrição',
            amount,
            date: t.date || '',
            reason: `Duplicidade exata do lançamento ID ${seenSignatures.get(sig).id}`
          });
          continue;
        } else {
          seenSignatures.set(sig, t);
        }
      }
    }

    // --- B. AUDITAR COMISSÕES ÓRFÃS ---
    for (const c of commissions) {
      const comId = c.comanda_id;
      const val = Number(c.commission_value || 0);

      if (comId) {
        const linkedComanda = comandaMap.get(comId);
        if (!linkedComanda) {
          commsToDelete.push(c);
          result.removedCommissionsAmount += val;
          result.details.orphanCommissions.push({
            id: c.id,
            profissional_name: c.profissional_name || 'Desconhecido',
            value: val,
            date: c.date || '',
            reason: `Comanda de origem [ID: ${comId}] não existe mais.`
          });
        } else if (linkedComanda.status === 'cancelada' || linkedComanda.status === 'ausente') {
          commsToDelete.push(c);
          result.removedCommissionsAmount += val;
          result.details.orphanCommissions.push({
            id: c.id,
            profissional_name: c.profissional_name || 'Desconhecido',
            value: val,
            date: c.date || '',
            reason: `Comanda #${linkedComanda.number} foi cancelada/ausente.`
          });
        }
      } else if (c.agendamento_id) {
        // Comissão legada de agendamento que já possui comanda fechada
        const matchingComanda = comandas.find(cmd => cmd.agendamento_id === c.agendamento_id);
        if (matchingComanda && matchingComanda.status === 'fechada') {
          // Verificar se a comanda já gerou uma comissão própria para evitar duplicar
          const hasComandaComm = commissions.some(otherC => otherC.comanda_id === matchingComanda.id);
          if (hasComandaComm) {
            commsToDelete.push(c);
            result.removedCommissionsAmount += val;
            result.details.orphanCommissions.push({
              id: c.id,
              profissional_name: c.profissional_name || 'Desconhecido',
              value: val,
              date: c.date || '',
              reason: `Duplicidade: Substituída pela comissão da Comanda #${matchingComanda.number}`
            });
          }
        }
      }
    }

    // --- C. AUDITAR MOVIMENTOS DE CAIXA ÓRFÃOS ---
    for (const cm of cashMovements) {
      const comId = cm.referencia_id || cm.comanda_id;
      if (comId && (cm.category === 'Comanda' || cm.category === 'Venda')) {
        const linkedComanda = comandaMap.get(comId);
        if (linkedComanda && (linkedComanda.status === 'cancelada' || linkedComanda.status === 'ausente')) {
          cmsToDelete.push(cm);
          result.details.orphanCashMovements.push({
            id: cm.id,
            description: cm.description || 'Movimento de caixa',
            amount: cm.amount || 0,
            date: cm.date || ''
          });
        }
      }
    }

    // --- D. AUDITAR COMANDAS FANTASMAS (Abertas sem itens e sem cliente há mais de 48h ou criadas vazias) ---
    for (const cmd of comandas) {
      if ((cmd.status === 'aberta' || cmd.status === 'aguardando_pagamento') && (!cmd.items || cmd.items.length === 0)) {
        comandasToDelete.push(cmd);
        result.details.emptyComandas.push({
          id: cmd.id,
          number: cmd.number || 'Sem número',
          date: cmd.createdAt?.toDate ? cmd.createdAt.toDate().toISOString() : ''
        });
      }
    }

    // --- EXECUTAR LIMPEZA EM BATCHES SEGUROS ---
    const allDocsToDelete = [
      ...txsToDelete.map(t => doc(db, 'financial_transactions', t.id)),
      ...commsToDelete.map(c => doc(db, 'commissions', c.id)),
      ...cmsToDelete.map(cm => doc(db, 'cash_movements', cm.id)),
      ...comandasToDelete.map(cmd => doc(db, 'comandas', cmd.id))
    ];

    const CHUNK_SIZE = 450;
    for (let i = 0; i < allDocsToDelete.length; i += CHUNK_SIZE) {
      const chunk = allDocsToDelete.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(ref => batch.delete(ref));
      await batch.commit();
    }

    result.removedTransactionsCount = txsToDelete.length;
    result.removedCommissionsCount = commsToDelete.length;
    result.removedCashMovementsCount = cmsToDelete.length;
    result.removedEmptyComandasCount = comandasToDelete.length;
    result.affectedComandasCount = comandas.length;

    // Salvar Log Oficial de Auditoria no Banco para transparência
    try {
      await addDoc(collection(db, 'audit_reconciliation_logs'), {
        userId,
        userName,
        tenantId: activeTenantId,
        date: new Date().toISOString(),
        summary: {
          totalRemovedAmount: result.totalRemovedAmount,
          removedTransactionsCount: result.removedTransactionsCount,
          removedCommissionsCount: result.removedCommissionsCount,
          removedCommissionsAmount: result.removedCommissionsAmount,
          removedCashMovementsCount: result.removedCashMovementsCount,
          removedEmptyComandasCount: result.removedEmptyComandasCount,
          affectedComandasCount: result.affectedComandasCount
        },
        details: result.details,
        createdAt: serverTimestamp()
      });
    } catch (logErr) {
      console.warn("Não foi possível persistir log de auditoria:", logErr);
    }

    return result;
  }
};
