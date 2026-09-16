import * as fs from 'fs';

function analyzeLuizMiguelComandasDetail() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const lmUid = '317sdImqlYYfxbnsh3X6c34Cdm83';

  console.log("=======================================================================");
  console.log("ANÁLISE DETALHADA DAS COMANDAS E COMISSÕES DE LUIZ MIGUEL (01/09 A 14/09)");
  console.log("=======================================================================\n");

  // A. Extrato Financeiro (Tabela financial_transactions)
  const txs = fullData.financial_transactions || [];
  const lmTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const pId = t.profissional_id;
    const pName = (t.profissional_name || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    const isVale = desc.includes('vale');
    return !isVale && (pId === lmUid || pName.includes('luiz miguel') || desc.includes('luiz miguel')) && d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`--- A. COMANDAS NO EXTRATO FINANCEIRO CAIXA (${lmTxs.length} COMANDAS PAGAS) ---`);
  let totalFatExtrato = 0;
  let totalCommExtrato = 0;

  lmTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
    const d = (t.date || '').substring(0, 10);
    const fat = t.amount || 0;
    const comm = fat * 0.5; // 50% de comissão padrão do sistema
    totalFatExtrato += fat;
    totalCommExtrato += comm;
    console.log(`[EXTRATO #${String(idx+1).padStart(2, '0')}] Data: ${d} | Faturamento: R$ ${fat.toFixed(2).padStart(6)} | Comissão (50%): R$ ${comm.toFixed(2).padStart(6)} | Cliente: "${t.cliente_name}" | Desc: "${t.description}"`);
  });

  console.log(`\nSoma Faturamento Extrato: R$ ${totalFatExtrato.toFixed(2)}`);
  console.log(`Soma Comissão Extrato (50%): R$ ${totalCommExtrato.toFixed(2)}\n`);

  // B. Banco de Dados (Reconstructed totals por item de serviço)
  const lmReconstructed = reconstructed.find((r: any) => r.uid === lmUid);
  const items = lmReconstructed ? (lmReconstructed.itensDetalhados || []) : [];
  
  const septItems = items.filter((it: any) => {
    const d = (it.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-14' && (it.itemCommVal || 0) > 0;
  });

  console.log(`--- B. BANCO DE DADOS DE COMANDAS (${septItems.length} ITENS DE ATENDIMENTO) ---`);
  let closedCommSum = 0;
  let openCommSum = 0;
  let closedCount = 0;
  let openCount = 0;

  septItems.forEach((it: any, idx: number) => {
    const d = (it.date || '').substring(0, 10);
    const st = it.comandaStatus || 'desconhecido';
    const comm = it.itemCommVal || 0;
    const isClosed = st === 'fechada' || st === 'paga' || st === 'pago';

    if (isClosed) {
      closedCount++;
      closedCommSum += comm;
      console.log(`[ITEM FECHADO #${String(closedCount).padStart(2, '0')}] Data: ${d} | CmdID: ${it.comandaId} | Serviço: "${it.itemName}" | Comissão: R$ ${comm.toFixed(2).padStart(6)} | Status: ${st}`);
    } else {
      openCount++;
      openCommSum += comm;
      console.log(`[ITEM ABERTO/NÃO PAGO #${String(openCount).padStart(2, '0')}] Data: ${d} | CmdID: ${it.comandaId} | Serviço: "${it.itemName}" | Comissão: R$ ${comm.toFixed(2).padStart(6)} | Status: ${st}`);
    }
  });

  console.log(`\n=======================================================================`);
  console.log(`RESUMO COMISSÃO BANCO DE DADOS LUIZ MIGUEL:`);
  console.log(`- Comissão de Itens Fechados/Pagos (${closedCount} itens): R$ ${closedCommSum.toFixed(2)}`);
  console.log(`- Comissão de Itens Abertos/Não Pagos (${openCount} itens): R$ ${openCommSum.toFixed(2)}`);
  console.log(`- Comissão Total (Todos os ${septItems.length} itens): R$ ${(closedCommSum + openCommSum).toFixed(2)}`);
  console.log(`=======================================================================`);
}

analyzeLuizMiguelComandasDetail();
