import * as fs from 'fs';

const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

const txs = fullData.financial_transactions || [];
const rickTxs = txs.filter((t: any) => t.profissional_id === rickUid || (t.profissional_name || '').toLowerCase().includes('luiz henrique') || (t.profissional_name || '').toLowerCase().includes('rick'));

console.log(`=== DETALHAMENTO DE TODAS AS ${rickTxs.length} TRANSAÇÕES DO RICK ===\n`);

let totalComandasVal = 0;
let totalComandasComm = 0;
let totalValesVal = 0;

rickTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
  const d = (t.date || '').substring(0, 10);
  const desc = t.description || '';
  const isVale = desc.toLowerCase().includes('vale');
  const amt = t.amount || 0;
  
  if (isVale) {
    totalValesVal += amt;
    console.log(`[VALE ${idx+1}] Data: ${d} | Valor: R$ ${amt.toFixed(2)} | ID: ${t.id} | Descrição: "${desc}"`);
  } else {
    const comm = amt * 0.5; // 50%
    totalComandasVal += amt;
    totalComandasComm += comm;
    console.log(`[COMANDA ${idx+1}] Data: ${d} | Faturamento: R$ ${amt.toFixed(2)} | Comissão (50%): R$ ${comm.toFixed(2)} | Descrição: "${desc}" | Cliente: ${t.cliente_name}`);
  }
});

console.log("\n--- RESUMO CONSOLIDADO PARA RICK (01 a 14/09) ---");
console.log(`Total Faturamento Comandas: R$ ${totalComandasVal.toFixed(2)}`);
console.log(`Total Comissão Gerada (50%): R$ ${totalComandasComm.toFixed(2)}`);
console.log(`Total Vales no extrato: R$ ${totalValesVal.toFixed(2)}`);
console.log(`Saldo Teórico (Comissão - Vales): R$ ${(totalComandasComm - totalValesVal).toFixed(2)}`);
