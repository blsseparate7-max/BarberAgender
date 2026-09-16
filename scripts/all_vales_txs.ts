import * as fs from 'fs';

const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
const txs = fullData.financial_transactions || [];
const valesTxs = txs.filter((t: any) => (t.description || '').toLowerCase().includes('vale'));

console.log(`=== TODOS OS ${valesTxs.length} VALES REGISTRADOS EM FINANCIAL_TRANSACTIONS ===\n`);

valesTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
  console.log(`${String(idx+1).padStart(2, '0')}. Data: ${t.date} | Valor: R$ ${t.amount} | ID: ${t.id} | Desc: "${t.description}" | ProfID: ${t.profissional_id} | ProfNome: "${t.profissional_name}"`);
});
