import * as fs from 'fs';

function checkRecordsAfter14() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');

  console.log("=== INSPEÇÃO DE REGISTROS COM DATA APÓS 14/09/2026 ===");

  const txs = fullData.financial_transactions || [];
  const after14Txs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d > '2026-09-14';
  });

  console.log(`Transações financeiras após 14/09: ${after14Txs.length}`);
  after14Txs.forEach((t: any) => {
    console.log(`- Data: ${t.date} | Valor: R$ ${t.amount} | Desc: "${t.description}" | ID: ${t.id}`);
  });

  const comms = fullData.commissions || [];
  const after14Comms = comms.filter((c: any) => {
    const d = (c.date || c.created_at || '').substring(0, 10);
    return d > '2026-09-14';
  });
  console.log(`Comissões após 14/09: ${after14Comms.length}`);

  const advances = fullData.professional_advances || [];
  const after14Advances = advances.filter((a: any) => {
    const d = (a.date || a.created_at || '').substring(0, 10);
    return d > '2026-09-14';
  });
  console.log(`Adiantamentos após 14/09: ${after14Advances.length}`);
}

checkRecordsAfter14();
