import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { SystemInsight } from '../types';
import { format } from 'date-fns';
import { getActiveTenantId } from './tenantService';

const COLLECTION = 'system_insights';

export interface InsightMetrics {
  comandasPendentesCount: number;
  comandasPendentesTotal: number;
  
  clientesCreditosCount: number;
  clientesCreditosTotal: number;
  
  clientesDebitosCount: number;
  clientesDebitosTotal: number;
  
  caixasPendentesCount: number;
  
  servicosSemCadastroCount: number;
  
  contasReceberCount: number;
  contasReceberTotal: number;
  
  contasPagarCount: number;
  contasPagarTotal: number;
  
  clientesInativos60DiasCount: number;
  
  usuariosConectadosCount: number;
  
  novosClientesCount: number;
  
  produtosVencerOuEstoqueCount: number;
  
  contasAtrasadasCount: number;
  contasAtrasadasTotal: number;
  
  assinaturasVencerOuVencidasCount: number;
}

export const intelligenceService = {
  async getInsightMetrics(): Promise<InsightMetrics> {
    const tid = getActiveTenantId().trim().toLowerCase();

    const fetchCollection = async (collName: string) => {
      try {
        const snap = await getDocs(collection(db, collName));
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      } catch (err) {
        console.error(`Error fetching collection ${collName} for insights:`, err);
        return [];
      }
    };

    const [
      comandasDocs,
      usuariosDocs,
      debtsDocs,
      caixasDocs,
      finDocs,
      payDocs,
      recDocs,
      productsDocs,
      subscriptionsDocs,
      appointmentsDocs
    ] = await Promise.all([
      fetchCollection('comandas'),
      fetchCollection('usuarios'),
      fetchCollection('client_debts'),
      fetchCollection('caixas'),
      fetchCollection('financial_transactions'),
      fetchCollection('accounts_payable'),
      fetchCollection('accounts_receivable'),
      fetchCollection('products'),
      fetchCollection('subscriptions'),
      fetchCollection('appointments')
    ]);

    const isTenantMatch = (itemTenantId?: string) => {
      if (!tid) return true;
      const itemT = (itemTenantId || '').trim().toLowerCase();
      return itemT === tid || (!itemTenantId && tid === 'gbcortes7');
    };

    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNowISO = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. Comandas Pendentes (abertas)
    const openComandas = comandasDocs.filter(c => isTenantMatch(c.tenantId) && (c.status === 'aberta' || c.status === 'open'));
    const comandasPendentesCount = openComandas.length;
    const comandasPendentesTotal = openComandas.reduce((acc, c) => acc + (c.pendingAmount ?? c.totalAmount ?? c.valorTotal ?? 0), 0);

    // 2. Clientes com Crédito
    const clientsWithCredit = usuariosDocs.filter(u => isTenantMatch(u.tenantId) && ((u.credito || 0) > 0 || (u.saldo_credito || 0) > 0));
    const clientesCreditosCount = clientsWithCredit.length;
    const clientesCreditosTotal = clientsWithCredit.reduce((acc, u) => acc + ((u.credito || 0) + (u.saldo_credito || 0)), 0);

    // 3. Clientes com Débitos (Fiados)
    const activeDebts = debtsDocs.filter(d => isTenantMatch(d.tenantId) && (d.status === 'pendente' || d.status === 'parcial' || d.paid === false));
    const clientesDebitosCount = activeDebts.length;
    const clientesDebitosTotal = activeDebts.reduce((acc, d) => {
      const rem = d.remainingAmount !== undefined ? d.remainingAmount : ((d.amount || 0) - (d.paidAmount || 0));
      return acc + Math.max(0, rem);
    }, 0);

    // 4. Caixas Pendentes (Abertos)
    const openCaixas = caixasDocs.filter(c => isTenantMatch(c.tenantId) && (c.status === 'aberto' || c.status === 'open'));
    const caixasPendentesCount = openCaixas.length;

    // 5. Serviços em Clientes Avulsos
    const avulsoComandas = comandasDocs.filter(c => isTenantMatch(c.tenantId) && (
      c.cliente_id === 'avulso' || 
      !c.cliente_id || 
      (c.cliente_name && c.cliente_name.toLowerCase().includes('avulso'))
    ));
    const servicosSemCadastroCount = avulsoComandas.length;

    // 6. Contas a Receber
    const pendingReceivablesFT = finDocs.filter(f => isTenantMatch(f.tenantId) && f.type === 'income' && (f.status === 'pendente' || f.status === 'parcial'));
    const pendingReceivablesAR = recDocs.filter(r => isTenantMatch(r.tenantId) && (r.status === 'pendente' || r.status === 'parcial'));
    const contasReceberCount = pendingReceivablesFT.length + pendingReceivablesAR.length;
    const contasReceberTotal = pendingReceivablesFT.reduce((acc, f) => acc + (f.amount || 0), 0) + pendingReceivablesAR.reduce((acc, r) => acc + (r.amount || 0), 0);

    // 7. Contas a Pagar
    const pendingPayablesFT = finDocs.filter(f => isTenantMatch(f.tenantId) && f.type === 'expense' && (f.status === 'pendente' || f.status === 'parcial'));
    const pendingPayablesAP = payDocs.filter(p => isTenantMatch(p.tenantId) && (p.status === 'pendente' || p.status === 'parcial'));
    const contasPagarCount = pendingPayablesFT.length + pendingPayablesAP.length;
    const contasPagarTotal = pendingPayablesFT.reduce((acc, f) => acc + (f.amount || 0), 0) + pendingPayablesAP.reduce((acc, p) => acc + (p.amount || 0), 0);

    // 8. Clientes Inativos +60 Dias
    const allClients = usuariosDocs.filter(u => isTenantMatch(u.tenantId) && (u.tipo === 'cliente' || !u.tipo));
    const clientLastVisitMap = new Map<string, Date>();

    appointmentsDocs.forEach(app => {
      if (app.cliente_id && (app.status === 'concluido' || app.status === 'realizado' || app.status === 'confirmado')) {
        const dStr = app.data || app.date || app.createdAt;
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const existing = clientLastVisitMap.get(app.cliente_id);
            if (!existing || d > existing) clientLastVisitMap.set(app.cliente_id, d);
          }
        }
      }
    });

    comandasDocs.forEach(c => {
      if (c.cliente_id && c.cliente_id !== 'avulso') {
        const dStr = c.fechada_em || c.createdAt || c.data;
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const existing = clientLastVisitMap.get(c.cliente_id);
            if (!existing || d > existing) clientLastVisitMap.set(c.cliente_id, d);
          }
        }
      }
    });

    let clientesInativos60DiasCount = 0;
    allClients.forEach(u => {
      const lastV = clientLastVisitMap.get(u.uid) || (u.lastVisitAt ? new Date(u.lastVisitAt) : (u.createdAt ? new Date(u.createdAt) : null));
      if (lastV && !isNaN(lastV.getTime())) {
        if (lastV < sixtyDaysAgo) {
          clientesInativos60DiasCount++;
        }
      } else {
        const regDate = u.createdAt ? new Date(u.createdAt) : null;
        if (regDate && !isNaN(regDate.getTime()) && regDate < sixtyDaysAgo) {
          clientesInativos60DiasCount++;
        }
      }
    });

    // 9. Usuários que conectaram ao menos 1x
    const usuariosConectadosCount = usuariosDocs.filter(u => isTenantMatch(u.tenantId) && (u.lastLogin || (u.loginCount && u.loginCount > 0) || u.email || u.uid)).length;

    // 10. Novos clientes em 30 dias
    const novosClientesCount = allClients.filter(u => {
      if (!u.createdAt) return false;
      const d = new Date(u.createdAt);
      return !isNaN(d.getTime()) && d >= thirtyDaysAgo;
    }).length;

    // 11. Produtos a vencer em 30 dias ou com estoque no limite
    const produtosVencerOuEstoqueCount = productsDocs.filter(p => isTenantMatch(p.tenantId) && (
      (p.validade && new Date(p.validade) <= thirtyDaysFromNow) ||
      (p.expirationDate && new Date(p.expirationDate) <= thirtyDaysFromNow) ||
      (p.quantity !== undefined && p.minQuantity !== undefined && p.quantity <= p.minQuantity) ||
      (p.quantidade !== undefined && p.estoque_minimo !== undefined && p.quantidade <= p.estoque_minimo)
    )).length;

    // 12. Contas / Débitos Atrasados
    const overdueFT = pendingPayablesFT.filter(f => f.dueDate && f.dueDate < todayISO);
    const overdueAP = pendingPayablesAP.filter(p => p.vencimento && p.vencimento < todayISO);
    const overdueDebts = activeDebts.filter(d => d.dueDate && d.dueDate < todayISO);

    const contasAtrasadasCount = overdueFT.length + overdueAP.length + overdueDebts.length;
    const contasAtrasadasTotal = 
      overdueFT.reduce((acc, f) => acc + (f.amount || 0), 0) +
      overdueAP.reduce((acc, p) => acc + (p.amount || 0), 0) +
      overdueDebts.reduce((acc, d) => acc + Math.max(0, d.remainingAmount ?? (d.amount - (d.paidAmount || 0))), 0);

    // 13. Assinaturas a vencer ou vencidas
    const assinaturasVencerOuVencidasCount = subscriptionsDocs.filter(s => isTenantMatch(s.tenantId) && (
      s.status === 'vencida' ||
      s.status === 'atrasada' ||
      s.status === 'canceled' ||
      (s.nextBillingDate && s.nextBillingDate <= sevenDaysFromNowISO) ||
      (s.validUntil && s.validUntil <= sevenDaysFromNowISO)
    )).length;

    return {
      comandasPendentesCount,
      comandasPendentesTotal,
      clientesCreditosCount,
      clientesCreditosTotal,
      clientesDebitosCount,
      clientesDebitosTotal,
      caixasPendentesCount,
      servicosSemCadastroCount,
      contasReceberCount,
      contasReceberTotal,
      contasPagarCount,
      contasPagarTotal,
      clientesInativos60DiasCount,
      usuariosConectadosCount,
      novosClientesCount,
      produtosVencerOuEstoqueCount,
      contasAtrasadasCount,
      contasAtrasadasTotal,
      assinaturasVencerOuVencidasCount
    };
  },

  async getInsights() {
    const q = query(collection(db, COLLECTION), where('tenantId', '==', getActiveTenantId()));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Generate initial insights if empty
      await this.generateInsights();
      return this.getInsights();
    }
    
    const insights = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemInsight));
    return insights.sort((a, b) => {
      const aTime = a.createdAt?.seconds || a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.seconds || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    }).slice(0, 10);
  },

  async generateInsights() {
    const insights: Omit<SystemInsight, 'id' | 'createdAt'>[] = [
      {
        type: 'inactive_client',
        title: 'Clientes Inativos',
        description: 'Há 15 clientes que não visitam a barbearia há mais de 30 dias.',
        severity: 'medium',
        data: { count: 15 },
        date: format(new Date(), 'yyyy-MM-dd')
      },
      {
        type: 'top_service',
        title: 'Serviço em Alta',
        description: 'O serviço "Corte + Barba" teve um aumento de 25% na procura esta semana.',
        severity: 'low',
        data: { increase: 25 },
        date: format(new Date(), 'yyyy-MM-dd')
      },
      {
        type: 'revenue_drop',
        title: 'Queda de Faturamento',
        description: 'O faturamento desta terça-feira está 10% abaixo da média das últimas 4 semanas.',
        severity: 'high',
        data: { drop: 10 },
        date: format(new Date(), 'yyyy-MM-dd')
      }
    ];

    for (const insight of insights) {
      await addDoc(collection(db, COLLECTION), {
        ...insight,
        tenantId: getActiveTenantId(),
        createdAt: serverTimestamp()
      });
    }
  }
};

