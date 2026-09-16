import * as fs from 'fs';

function auditAllSeptTxs() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const txs = fullData.financial_transactions || [];

  console.log("=== LISTANDO TODAS AS 127 TRANSAÇÕES FINANCEIRAS DE SETEMBRO (01/09 A 14/09) ===");

  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`Total de transações no período: ${septTxs.length}\n`);

  septTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, i: number) => {
    console.log(`[${String(i+1).padStart(3, '0')}] Data: ${t.date} | ID: ${t.id} | Desc: "${t.description}" | Valor: R$ ${t.amount} | ProfID: ${t.profissional_id || 'SEM_ID'} | ProfNome: "${t.profissional_name || ''}" | Cliente: "${t.cliente_name || ''}"`);
  });
}

auditAllSeptTxs();
