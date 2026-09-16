import * as fs from 'fs';

function printCleanPerProfReport() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const txs = fullData.financial_transactions || [];

  const activeBarbers = [
    { name: 'Luiz Henrique Francisco (Rick)', uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', matchKeys: ['luiz henrique', 'rick'] },
    { name: 'Luiz Miguel Marciano dos Santos', uid: '317sdImqlYYfxbnsh3X6c34Cdm83', matchKeys: ['luiz miguel', 'miguel marciano'] },
    { name: 'Mateus Alexandre da Silva', uid: 'K2TXxyN75MZj4s6euPw2POZLNbt2', matchKeys: ['mateus alexandre', 'mateus'] },
    { name: 'Moises Bueno', uid: 'QoaTs0kU4vaWC7l1F0BfT3Fj5IX2', matchKeys: ['moises bueno', 'moises'] },
    { name: 'Gabriel Alexandre', uid: 'tsguxbUDoJMINJrgh3Z1SviVPUA2', matchKeys: ['gabriel alexandre', 'gabriel'] }
  ];

  console.log("==========================================================================================");
  console.log("APURAÇÃO PERICIAL COMPLETA DE CADA BARBEIRO (01/09/2026 A 15/09/2026)");
  console.log("==========================================================================================\n");

  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const valesTxs = septTxs.filter((t: any) => (t.description || '').toLowerCase().includes('vale'));

  activeBarbers.forEach((barber) => {
    // 1. Get closed items for this barber
    const userReconstructed = reconstructed.find((r: any) => r.uid === barber.uid);
    const items = userReconstructed ? (userReconstructed.itensDetalhados || []) : [];

    const closedItems = items.filter((it: any) => {
      const d = (it.date || '').substring(0, 10);
      const st = (it.comandaStatus || '').toLowerCase();
      return d >= '2026-09-01' && d <= '2026-09-15' && (st === 'fechada' || st === 'paga' || st === 'pago');
    });

    let itemFatSum = 0;
    let itemCommSum = 0;
    const pctCounts: Record<number, { count: number, fat: number, comm: number }> = {};

    closedItems.forEach((it: any) => {
      const price = Number(it.itemPrice || 0);
      const comm = Number(it.itemCommVal || 0);
      itemFatSum += price;
      itemCommSum += comm;
      const pct = price > 0 ? Math.round((comm / price) * 100) : 50;

      if (!pctCounts[pct]) pctCounts[pct] = { count: 0, fat: 0, comm: 0 };
      pctCounts[pct].count++;
      pctCounts[pct].fat += price;
      pctCounts[pct].comm += comm;
    });

    // 2. Get Vales for this barber
    const userVales = valesTxs.filter((v: any) => {
      const pId = v.profissional_id;
      const pName = (v.profissional_name || '').toLowerCase();
      const desc = (v.description || '').toLowerCase();

      if (pId === barber.uid) return true;
      return barber.matchKeys.some(k => pName.includes(k) || desc.includes(k));
    });

    let valesSum = 0;
    userVales.forEach((v: any) => valesSum += Number(v.amount || 0));

    console.log(`\n==========================================================================================`);
    console.log(`💈 PROFISSIONAL: ${barber.name.toUpperCase()}`);
    console.log(`==========================================================================================`);
    console.log(`📊 1. COMANDAS FECHADAS NO BANCO (01/09 A 15/09):`);
    console.log(`   - Quantidade de Itens Fechados: ${closedItems.length}`);
    console.log(`   - Faturamento Bruto Atendido: R$ ${itemFatSum.toFixed(2)}`);
    console.log(`   - Comissão Bruta Devida (% item a item): R$ ${itemCommSum.toFixed(2)}`);
    console.log(`   - Distribuição de % de Comissão nos Serviços:`);
    Object.keys(pctCounts).forEach(pct => {
      const pNum = Number(pct);
      const data = pctCounts[pNum];
      console.log(`     * Faixa de ${pNum}% de Comissão: ${data.count} itens | Faturamento R$ ${data.fat.toFixed(2)} | Comissão R$ ${data.comm.toFixed(2)}`);
    });

    console.log(`\n🎟️ 2. VALES / ADIANTAMENTOS RETIRADOS NO PERÍODO (${userVales.length} vales):`);
    userVales.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((v: any, idx: number) => {
      console.log(`   [Vale #${String(idx+1).padStart(2, '0')}] ${v.date.substring(0, 10)} | R$ ${Number(v.amount).toFixed(2).padStart(6)} | Desc: "${v.description}" (ID: ${v.id})`);
    });
    console.log(`   - Total de Vales Retirados: R$ ${valesSum.toFixed(2)}`);

    const saldoDevido = itemCommSum - valesSum;
    console.log(`\n💰 3. BALANÇO FINANCEIRO REAL (COMISSÃO GERADA DA COMANDA - VALES):`);
    if (saldoDevido >= 0) {
      console.log(`   ✅ SALDO A PAGAR AO BARBEIRO VIA PIX: R$ ${saldoDevido.toFixed(2)}`);
    } else {
      console.log(`   ⚠️ VALES EXCEDERAM A COMISSÃO EM: R$ ${Math.abs(saldoDevido).toFixed(2)} (Saldo a Pagar ao Barbeiro = R$ 0,00)`);
    }
  });
}

printCleanPerProfReport();
