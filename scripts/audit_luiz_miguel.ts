import * as fs from 'fs';

function auditLuizMiguel() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');

  const usuarios = fullData.usuarios || [];
  const lmUser = usuarios.find((u: any) => (u.email || '').toLowerCase() === 'luizmiguel@gbcortes7.com');

  console.log("=== USUÁRIO LUIZ MIGUEL ===");
  console.log(lmUser);

  const lmUid = lmUser?.uid || lmUser?.id || '317sdImqlYYfxbnsh3X6c34Cdm83';

  console.log(`\nUID do Luiz Miguel: ${lmUid}`);

  // 1. Transactions for Luiz Miguel in financial_transactions
  const txs = fullData.financial_transactions || [];
  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-14';
  });

  const lmTxs = septTxs.filter((t: any) => {
    const pId = t.profissional_id;
    const pName = (t.profissional_name || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    return pId === lmUid || pName.includes('luiz miguel') || desc.includes('luiz miguel');
  });

  console.log(`\n=== 1. TRANSAÇÕES FINANCEIRAS DE SETEMBRO (01/09 A 14/09) ATRIBUÍDAS AO LUIZ MIGUEL (${lmTxs.length}) ===`);
  
  let totalComandasVal = 0;
  let totalComandasComm = 0;
  let totalValesVal = 0;
  let countComandas = 0;
  let countVales = 0;

  lmTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
    const d = (t.date || '').substring(0, 10);
    const amt = t.amount || 0;
    const desc = t.description || '';
    const isVale = desc.toLowerCase().includes('vale');

    if (isVale) {
      countVales++;
      totalValesVal += amt;
      console.log(`[VALE #${countVales}] Data: ${d} | Valor: R$ ${amt.toFixed(2)} | ID: ${t.id} | Desc: "${desc}" | ProfID: ${t.profissional_id} | ProfNome: "${t.profissional_name}"`);
    } else {
      countComandas++;
      const comm = amt * 0.5; // 50%
      totalComandasVal += amt;
      totalComandasComm += comm;
      console.log(`[COMANDA #${countComandas}] Data: ${d} | Faturamento: R$ ${amt.toFixed(2)} | Comissão (50%): R$ ${comm.toFixed(2)} | Desc: "${desc}" | Cliente: "${t.cliente_name}"`);
    }
  });

  console.log(`\n--- RESUMO DE LUIZ MIGUEL NO EXTRATO DE TRANSAÇÕES FINANCEIRAS ---`);
  console.log(`Total Comandas (atendimentos): ${countComandas}`);
  console.log(`Faturamento Total Comandas: R$ ${totalComandasVal.toFixed(2)}`);
  console.log(`Comissão Total Gerada (50%): R$ ${totalComandasComm.toFixed(2)}`);
  console.log(`Total Vales no Extrato: R$ ${totalValesVal.toFixed(2)} (${countVales} vales)`);
  console.log(`Saldo Teórico (Comissão - Vales): R$ ${(totalComandasComm - totalValesVal).toFixed(2)}`);

  // 2. Inspection of ALL Vales in the system to see if any vale was wrong!
  console.log(`\n=== 2. AUDITORIA DE TODOS OS VALES DE SETEMBRO NO SISTEMA INTEIRO ===`);
  const allValesInSept = septTxs.filter((t: any) => (t.description || '').toLowerCase().includes('vale'));

  allValesInSept.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((v: any, idx: number) => {
    const d = (v.date || '').substring(0, 10);
    const amt = v.amount || 0;
    const desc = v.description || '';
    const pName = v.profissional_name || '';
    const pId = v.profissional_id;
    console.log(`[VALE GERAL #${String(idx+1).padStart(2, '0')}] Data: ${d} | Valor: R$ ${amt.toFixed(2)} | Desc: "${desc}" | ProfNome: "${pName}" | ProfID: ${pId}`);
  });

  // 3. Reconstructed totals for Luiz Miguel (all items in comandas)
  const lmReconstructed = reconstructed.find((r: any) => r.uid === lmUid);
  console.log(`\n=== 3. BANCO DE DADOS DE COMANDAS RECONSTRUÍDO (ITENS) PARA LUIZ MIGUEL ===`);
  if (lmReconstructed) {
    const items = (lmReconstructed.itensDetalhados || []).filter((it: any) => {
      const d = (it.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14' && (it.itemCommVal || 0) > 0;
    });

    let reconClosedComm = 0;
    let reconOpenComm = 0;

    items.forEach((it: any, i: number) => {
      const d = (it.date || '').substring(0, 10);
      const st = it.comandaStatus || 'fechada';
      const comm = it.itemCommVal || 0;
      if (st === 'fechada' || st === 'paga' || st === 'pago') reconClosedComm += comm;
      else reconOpenComm += comm;
      console.log(`[ITEM #${String(i+1).padStart(2, '0')}] Data: ${d} | CmdID: ${it.comandaId} | Serviço: "${it.itemName}" | Comiss: R$ ${comm.toFixed(2)} | Status: ${st}`);
    });

    console.log(`\nComissão Itens Fechados: R$ ${reconClosedComm.toFixed(2)}`);
    console.log(`Comissão Itens Abertos: R$ ${reconOpenComm.toFixed(2)}`);
    console.log(`Comissão Total Todos Itens: R$ ${(reconClosedComm + reconOpenComm).toFixed(2)}`);
  }
}

auditLuizMiguel();
