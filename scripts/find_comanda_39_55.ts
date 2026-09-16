import * as fs from 'fs';

function findExactRickComanda() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const txs = fullData.financial_transactions || [];

  console.log("=== TODOS OS PAGAMENTOS DE COMANDAS DE SETEMBRO (01/09 A 14/09) ===\n");

  const comandas = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const desc = (t.description || '').toLowerCase();
    return d >= '2026-09-01' && d <= '2026-09-14' && !desc.includes('vale');
  });

  console.log(`Total de pagamentos de comanda no período: ${comandas.length}\n`);

  comandas.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
    const amt = t.amount || 0;
    const comm = amt * 0.5;
    console.log(`[${String(idx+1).padStart(3, '0')}] Data: ${t.date} | Valor: R$ ${amt.toFixed(2)} | Comiss (50%): R$ ${comm.toFixed(2)} | Prof: "${t.profissional_name || 'SEM_PROF'}" | Desc: "${t.description}" | Cliente: "${t.cliente_name || ''}"`);
  });
}

findExactRickComanda();
