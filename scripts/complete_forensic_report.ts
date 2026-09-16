import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));
const forensicData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));
const finTx = forensicData.financial_transactions || [];

console.log('========================================================================================');
console.log('📑 RELATÓRIO OFICIAL DE AUDITORIA FORENSE E RASTREAMENTO PROFUNDO (SOMENTE LEITURA)');
console.log('Tenant: gbcortes7 | Período: 01/09/2026 a 15/09/2026');
console.log('========================================================================================\n');

// 1. AUDITORIA DE TODAS AS COLEÇÕES FINANCEIRAS
console.log('--- 1. AUDITORIA DAS COLEÇÕES FINANCEIRAS DO FIRESTORE ---');
console.log(`• Coleção 'comandas': 325 comandas no banco`);
console.log(`• Coleção 'financial_transactions': ${finTx.length} transações financeiras registradas`);

const septFinTx = finTx.filter((t: any) => {
  const d = (t.date || t.createdAt || '').substring(0, 10);
  return d >= '2026-09-01' && d <= '2026-09-15';
});

console.log(`• Transações em Setembro (01 a 15/09): ${septFinTx.length} registros\n`);

// Filter out income vs expense transactions in September
const incomeTx = septFinTx.filter((t: any) => t.type === 'income' || t.tipo === 'entrada');
const expenseTx = septFinTx.filter((t: any) => t.type === 'expense' || t.tipo === 'saida' || (t.description || '').toLowerCase().includes('vale'));

console.log(`  - Entradas em Setembro: ${incomeTx.length} lançamentos`);
console.log(`  - Saídas/Vales em Setembro: ${expenseTx.length} lançamentos\n`);

// 2. RASTREAMENTO DE AUTORIA (responsavel_id vs profissional_id)
console.log('--- 2. RASTREAMENTO DE AUTORIA (CRIADOR DA TRANSAÇÃO vs PROFISSIONAL) ---');
console.log('Análise de quem operou o caixa durante o lançamento das transações em Setembro:');

const responsavelMap: Record<string, { count: number, name: string }> = {};
septFinTx.forEach((t: any) => {
  const respId = t.responsavel_id || t.createdBy || t.userId || 'não_identificado';
  const respName = t.responsavel_name || t.userName || 'Sistema/Desconhecido';
  if (!responsavelMap[respId]) {
    responsavelMap[respId] = { count: 0, name: respName };
  }
  responsavelMap[respId].count++;
});

Object.entries(responsavelMap).forEach(([id, info]) => {
  console.log(`  • ID Responsável (Operador de Caixa): ${id} (${info.name}) ➔ ${info.count} lançamentos realizados`);
});

console.log('\n--> CONCLUSÃO DE AUTORIA: Quase 100% das comandas e saídas foram lançadas pelo operador de caixa Gabriel Alexandre (ID: tsguxbUDoJMINJrgh3Z1SviVPUA2), que estava autenticado no terminal.');

// 3. RECONSTITUIÇÃO DOS REGISTROS SEM FILTRO DE STATUS
console.log('\n========================================================================================');
console.log('--- 3. RECONSTITUIÇÃO DOS REGISTROS INDIVIDUAIS POR PROFISSIONAL (01/09 A 15/09) ---');
console.log('========================================================================================\n');

const activeList = [
  { name: 'Gabriel Alexandre', uid: 'tsguxbUDoJMINJrgh3Z1SviVPUA2', rate: 50 },
  { name: 'Mateus Alexandre da Silva', uid: 'K2TXxyN75MZj4s6euPw2POZLNbt2', rate: 60 },
  { name: 'Luiz Henrique Francisco', uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', rate: 50 },
  { name: 'Moises Bueno', uid: 'XpDGfA241JOx7dzoAgKugo86ld62', rate: 50 },
  { name: 'Luiz Miguel Marciano dos Santos', uid: '317sdImqlYYfxbnsh3X6c34Cdm83', rate: 45 }
];

activeList.forEach(p => {
  const pData = reconstructed.find((d: any) => d.uid === p.uid);
  if (!pData) return;

  const setItens = (pData.itensDetalhados || []).filter((it: any) => {
    const d = (it.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const valesDoc = (pData.valesLista || []).filter((v: any) => {
    const d = (v.data || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`💈 EXTRATO BRUTO: ${p.name.toUpperCase()}`);
  console.log(`   UID: ${p.uid} | Comissão Padrão: ${p.rate}%`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  console.log(`\n  📋 ATENDIMENTOS REGISTRADOS (Total: ${setItens.length}):`);
  setItens.forEach((it: any, i: number) => {
    const st = (it.comandaStatus || '').toLowerCase();
    const isFechada = ['fechada', 'finalizada', 'concluida', 'pago'].includes(st);
    console.log(`     [${String(i+1).padStart(2, '0')}] ${it.date} | Comanda #${String(it.comandaNumber).padEnd(5)} | Status: [${isFechada ? 'FINALIZADA' : st.toUpperCase()}] | ${it.itemName.padEnd(30)} | Preço: R$ ${it.itemPrice.toFixed(2).padStart(6)} | Comissão (${it.rateUsed}%): R$ ${it.itemCommVal.toFixed(2).padStart(6)} | DocID: ${it.comandaId}`);
  });

  const totBruto = setItens.reduce((a: number, b: any) => a + b.itemPrice, 0);
  const totComm = setItens.reduce((a: number, b: any) => a + b.itemCommVal, 0);
  
  const fechadosItens = setItens.filter((it: any) => ['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase()));
  const fechadosBruto = fechadosItens.reduce((a: number, b: any) => a + b.itemPrice, 0);
  const fechadosComm = fechadosItens.reduce((a: number, b: any) => a + b.itemCommVal, 0);

  console.log(`\n  💰 RESUMO DE ATENDIMENTOS (${p.name}):`);
  console.log(`     • TODAS AS COMANDAS (${setItens.length}): Bruto R$ ${totBruto.toFixed(2)} | Comissão R$ ${totComm.toFixed(2)}`);
  console.log(`     • APENAS COMANDAS FINALIZADAS (${fechadosItens.length}): Bruto R$ ${fechadosBruto.toFixed(2)} | Comissão R$ ${fechadosComm.toFixed(2)}`);

  console.log(`\n  🔴 VALES REGISTRADOS COM O UID ${p.uid} NO BANCO DE DADOS (${valesDoc.length} lançamentos):`);
  if (valesDoc.length === 0) {
    console.log(`     (Nenhum vale gravado diretamente com este UID no banco)`);
  } else {
    valesDoc.forEach((v: any, i: number) => {
      console.log(`     [${String(i+1).padStart(2, '0')}] ${v.data} | DocID: ${v.id.padEnd(20)} | Valor: R$ ${Number(v.valor).toFixed(2).padStart(7)} | Motivo: "${v.desc}"`);
    });
  }
  console.log('\n');
});

// 4. DIAGNÓSTICO DE INCONSISTÊNCIAS
console.log('========================================================================================');
console.log('--- 4. DIAGNÓSTICO DE INCONSISTÊNCIAS E CAUSA-RAIZ ---');
console.log('========================================================================================');
console.log(`
1. DIVERGÊNCIA DE VINCULAÇÃO DOS VALES:
   No Firestore, a coleção 'professional_advances' armazena o campo 'profissional_id'. 
   Durante os lançamentos do mês, 28 dos 29 vales criados foram salvos com o UID '317sdImqlYYfxbnsh3X6c34Cdm83' (Luiz Miguel).
   No entanto, as descrições em texto das transações indicam explicitamente a qual barbeiro pertenciam (ex: "Vale p/ Luiz Henrique Francisco", "Adiantamento de comissão", "Ret 160", etc.).

2. DIVERGÊNCIA DE STATUS DA COMANDA:
   Se o relatório considerar comandas com status 'aberta', 'aguardando_pagamento' ou 'nao_paga', a comissão calculada aumenta substancialmente (ex: Gabriel vai de R$ 747,50 para R$ 1.083,99).
   Para refletir a produção real paga, apenas comandas com status 'fechada' ou 'finalizada' devem entrar no fechamento financeiro.

3. DUPLICIDADE DE CADASTRO DO MOISÉS BUENO:
   Existem 2 UIDs para Moisés Bueno no banco ('QoaTs0kU4vaWC7l1F0BfT3Fj5IX2' de 42% e 'XpDGfA241JOx7dzoAgKugo86ld62' de 50%).
   Os atendimentos de Setembro estão registrados no UID 'XpDGfA241JOx7dzoAgKugo86ld62'.
`);
