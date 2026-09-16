import fs from 'fs';

const rawData = JSON.parse(fs.readFileSync('db_dump.json', 'utf8'));
const { comandas, commissions, advances, cashMovements, financialTransactions, usuarios } = rawData;

const isTenant = (doc: any) => !doc.tenantId || doc.tenantId === 'gbcortes7' || doc.tenant_id === 'gbcortes7';

const gbUsuarios = usuarios.filter(isTenant);
const gbComandas = comandas.filter(isTenant);
const gbComms = commissions.filter(isTenant);
const gbAdvs = advances.filter(isTenant);
const gbCash = cashMovements.filter(isTenant);
const gbFin = financialTransactions.filter(isTenant);

const periodStart = '2026-09-01';
const periodEnd = '2026-09-15';

function getDateStr(doc: any): string {
  if (doc.date) return String(doc.date).substring(0, 10);
  if (doc.data) return String(doc.data).substring(0, 10);
  if (doc.data_fechamento) return String(doc.data_fechamento).substring(0, 10);
  if (doc.closedAt?.seconds) return new Date(doc.closedAt.seconds * 1000).toISOString().substring(0, 10);
  if (doc.createdAt?.seconds) return new Date(doc.createdAt.seconds * 1000).toISOString().substring(0, 10);
  return '';
}

console.log('========================================================================');
console.log(`DEEP DIVE: BREAKDOWN BY STATUS, TYPE & SOURCE (01/09/2026 - 15/09/2026)`);
console.log('========================================================================\n');

// Group Barbers
const targetBarbers = [
  { name: 'Luiz Henrique Francisco', aliases: ['luiz henrique', 'rick', 'henrique'], uids: ['3Xxfoflp1aW5gAutZ2MuDW0jjDF3'] },
  { name: 'Luiz Miguel Marciano dos Santos', aliases: ['luiz miguel', 'miguel'], uids: ['317sdImqlYYfxbnsh3X6c34Cdm83'] },
  { name: 'Mateus Alexandre da Silva', aliases: ['mateus', 'matheus'], uids: ['K2TXxyN75MZj4s6euPw2POZLNbt2'] },
  { name: 'Moises Bueno', aliases: ['moises'], uids: ['QoaTs0kU4vaWC7l1F0BfT3Fj5IX2', 'XpDGfA241JOx7dzoAgKugo86ld62'] },
  { name: 'Gabriel Alexandre', aliases: ['gabriel'], uids: ['tsguxbUDoJMINJrgh3Z1SviVPUA2'] },
  { name: 'Bryan Henrique Vieira', aliases: ['bryan'], uids: ['n9WyREYdI6VeQmbzWrluvYJzEcp2'] }
];

function matchBarber(id?: string, name?: string) {
  if (id) {
    const found = targetBarbers.find(b => b.uids.includes(id));
    if (found) return found;
  }
  const n = (name || '').toLowerCase();
  if (n) {
    if (n.includes('luiz henrique') || n.includes('rick') || (n.includes('henrique') && !n.includes('miguel'))) return targetBarbers[0];
    if (n.includes('luiz miguel') || (n.includes('miguel') && !n.includes('henrique'))) return targetBarbers[1];
    if (n.includes('mateus') || n.includes('matheus')) return targetBarbers[2];
    if (n.includes('moises')) return targetBarbers[3];
    if (n.includes('gabriel')) return targetBarbers[4];
    if (n.includes('bryan')) return targetBarbers[5];
  }
  return null;
}

// Analyze each target barber
targetBarbers.forEach(tb => {
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`💈 PROFISSIONAL: ${tb.name.toUpperCase()}`);
  console.log(`------------------------------------------------------------------------`);

  // 1. Comandas
  const proComandasInPeriod = gbComandas.filter((c: any) => {
    const d = getDateStr(c);
    if (d < periodStart || d > periodEnd) return false;
    // Check if comanda or any item belongs to barber
    const cMatch = matchBarber(c.barbeiro_id || c.profissional_id, c.barbeiro_nome || c.profissional_nome);
    if (cMatch?.name === tb.name) return true;
    return (c.items || []).some((it: any) => {
      const itMatch = matchBarber(it.barbeiro_id || it.profissional_id, it.barbeiro_nome || it.profissional_nome);
      return itMatch?.name === tb.name;
    });
  });

  // Breakdown of comanda items
  const statusStats: Record<string, { serviceGross: number; serviceCount: number; subCount: number; pkgCount: number; prodCount: number; itemsList: any[] }> = {
    fechada: { serviceGross: 0, serviceCount: 0, subCount: 0, pkgCount: 0, prodCount: 0, itemsList: [] },
    aberta: { serviceGross: 0, serviceCount: 0, subCount: 0, pkgCount: 0, prodCount: 0, itemsList: [] },
    cancelada: { serviceGross: 0, serviceCount: 0, subCount: 0, pkgCount: 0, prodCount: 0, itemsList: [] },
    outros: { serviceGross: 0, serviceCount: 0, subCount: 0, pkgCount: 0, prodCount: 0, itemsList: [] }
  };

  proComandasInPeriod.forEach((c: any) => {
    const cStatus = (c.status || 'outros').toLowerCase();
    const targetStatus = statusStats[cStatus] || statusStats['outros'];

    (c.items || []).forEach((it: any) => {
      const itMatch = matchBarber(it.barbeiro_id || it.profissional_id || c.barbeiro_id || c.profissional_id, it.barbeiro_nome || it.profissional_nome || c.barbeiro_nome || c.profissional_nome);
      if (itMatch?.name !== tb.name) return;

      const tipo = (it.tipo || it.type || '').toLowerCase();
      const nome = (it.nome || it.name || it.servico_nome || it.titulo || '').toLowerCase();
      const isProd = it.isProduct || tipo === 'produto' || tipo === 'product';
      const isPkg = it.isPackage || tipo === 'pacote' || tipo === 'package' || nome.includes('pacote');
      const isSub = it.isPlan || it.isSubscription || tipo === 'assinatura' || tipo === 'plano' || tipo === 'subscription' || tipo === 'plan' || nome.includes('assinatura') || nome.includes('plano');

      // Price: what is the actual service catalogue price vs paid price
      const cataloguePrice = Number(it.price || it.preco || it.unitPrice || it.unit_price || it.valor || it.value || 0);
      const paidTotal = Number(it.totalPrice || it.total || it.subtotal || 0);

      if (isSub) {
        targetStatus.subCount++;
      } else if (isPkg) {
        targetStatus.pkgCount++;
      } else if (isProd) {
        targetStatus.prodCount++;
      } else {
        // Pure Service!
        targetStatus.serviceCount++;
        targetStatus.serviceGross += cataloguePrice; // or paidTotal
        targetStatus.itemsList.push({
          comandaId: c.id,
          comandaNum: c.numero || c.number,
          date: getDateStr(c),
          status: c.status,
          client: c.cliente_nome || c.clientName,
          serviceName: it.nome || it.name || it.servico_nome,
          cataloguePrice,
          paidTotal,
          isCortesia: it.isCortesia,
          deductType: it.deductType,
          generateCommission: it.generateCommission,
          commissionValue: it.commissionValue || it.commission_value
        });
      }
    });
  });

  console.log(`📊 COMANDAS DE SERVIÇO (Itens de Serviços nos Comandas):`);
  console.log(`   * STATUS FECHADA: ${statusStats.fechada.serviceCount} serviços | Valor Catálogo: R$ ${statusStats.fechada.serviceGross.toFixed(2)} (Assinaturas: ${statusStats.fechada.subCount}, Pacotes: ${statusStats.fechada.pkgCount}, Produtos: ${statusStats.fechada.prodCount})`);
  console.log(`   * STATUS ABERTA: ${statusStats.aberta.serviceCount} serviços | Valor Catálogo: R$ ${statusStats.aberta.serviceGross.toFixed(2)}`);
  console.log(`   * STATUS CANCELADA: ${statusStats.cancelada.serviceCount} serviços | Valor Catálogo: R$ ${statusStats.cancelada.serviceGross.toFixed(2)}`);

  const allNonCancelledServices = [...statusStats.fechada.itemsList, ...statusStats.aberta.itemsList];
  const allNonCancelledGross = allNonCancelledServices.reduce((acc, i) => acc + i.cataloguePrice, 0);
  console.log(`   => TOTAL SERVIÇOS VÁLIDOS (Fechadas + Abertas): ${allNonCancelledServices.length} serviços | Total Bruto: R$ ${allNonCancelledGross.toFixed(2)}`);

  // 2. Commissions collection
  const proComms = gbComms.filter((cm: any) => {
    const d = getDateStr(cm);
    if (d < periodStart || d > periodEnd) return false;
    const match = matchBarber(cm.profissional_id || cm.barber_id, cm.profissional_name || cm.barber_name);
    return match?.name === tb.name;
  });

  const commsBaseTotal = proComms.reduce((acc: number, c: any) => acc + Number(c.base_value || c.baseValue || 0), 0);
  const commsValTotal = proComms.reduce((acc: number, c: any) => acc + Number(c.commission_value || c.commissionValue || c.valor || 0), 0);
  console.log(`\n💰 COLEÇÃO COMMISSIONS (Gravações de Comissões):`);
  console.log(`   * Total de Lançamentos: ${proComms.length}`);
  console.log(`   * Base Total de Produção: R$ ${commsBaseTotal.toFixed(2)}`);
  console.log(`   * Comissão Total Gravada: R$ ${commsValTotal.toFixed(2)}`);

  // 3. Vales & Advances
  console.log(`\n🏷️ VALES & ADIANTAMENTOS DETALHADOS:`);
  const valesList: any[] = [];

  // from professional_advances
  gbAdvs.filter((a: any) => {
    const d = getDateStr(a);
    if (d < periodStart || d > periodEnd) return false;
    return matchBarber(a.profissional_id, a.profissional_name)?.name === tb.name;
  }).forEach((a: any) => {
    valesList.push({
      id: a.id,
      date: getDateStr(a),
      amount: Number(a.amount || 0),
      desc: a.description || 'Vale (professional_advances)',
      source: 'professional_advances'
    });
  });

  // from cash_movements
  gbCash.filter((cm: any) => {
    const d = getDateStr(cm);
    if (d < periodStart || d > periodEnd) return false;
    const desc = (cm.description || '').toLowerCase();
    const cat = (cm.category || '').toLowerCase();
    const isRepasse = desc.includes('repasse') || cat.includes('repasse');
    const isVale = (desc.includes('vale') || desc.includes('adiantamento') || cat.includes('vale') || cat.includes('adiantamento')) && !isRepasse;
    if (!isVale) return false;
    return matchBarber(cm.profissional_id || cm.barber_id, cm.profissional_name || cm.description)?.name === tb.name;
  }).forEach((cm: any) => {
    const d = getDateStr(cm);
    const amt = Number(cm.amount || 0);
    const isDup = valesList.some(v => Math.abs(v.amount - amt) < 0.01 && v.date === d);
    if (!isDup) {
      valesList.push({
        id: cm.id,
        date: d,
        amount: amt,
        desc: cm.description || 'Vale (cash_movements)',
        source: 'cash_movements'
      });
    } else {
      console.log(`   [Duplicata detectada e unificada]: Cash movement R$ ${amt} em ${d} já existe em professional_advances`);
    }
  });

  // from financial_transactions
  gbFin.filter((f: any) => {
    const d = getDateStr(f);
    if (d < periodStart || d > periodEnd) return false;
    const desc = (f.description || '').toLowerCase();
    const cat = (f.category || '').toLowerCase();
    const isRepasse = desc.includes('repasse') || desc.includes('payout') || desc.includes('pagamento de comiss');
    const isVale = (desc.includes('vale') || desc.includes('adiantamento') || cat.includes('vale') || cat.includes('adiantamento')) && !isRepasse;
    if (!isVale) return false;
    return matchBarber(f.profissional_id || f.barber_id, f.profissional_name || f.description)?.name === tb.name;
  }).forEach((f: any) => {
    const d = getDateStr(f);
    const amt = Number(f.amount || 0);
    const isDup = valesList.some(v => Math.abs(v.amount - amt) < 0.01 && v.date === d);
    if (!isDup) {
      valesList.push({
        id: f.id,
        date: d,
        amount: amt,
        desc: f.description || 'Vale (financial_transactions)',
        source: 'financial_transactions'
      });
    } else {
      console.log(`   [Duplicata detectada e unificada]: Financial transaction R$ ${amt} em ${d} já existe`);
    }
  });

  valesList.forEach(v => {
    console.log(`   - Data: ${v.date} | Valor: R$ ${v.amount.toFixed(2)} | Descrição: "${v.desc}" [Fonte: ${v.source}]`);
  });
  const totalVales = valesList.reduce((acc, v) => acc + v.amount, 0);
  console.log(`   => TOTAL VALES UNIFICADOS: ${valesList.length} vales | R$ ${totalVales.toFixed(2)}`);
});
