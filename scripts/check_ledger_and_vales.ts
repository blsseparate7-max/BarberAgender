import * as fs from 'fs';

function checkLedgerAndVales() {
  const ledgerContent = fs.readFileSync('./src/services/ledgerService.ts', 'utf8');
  console.log("=== DESCONTO HARDCODADO NO LEDGERSERVICE.TS ===");
  const lines = ledgerContent.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('Luiz Miguel') || l.includes('317sdImqlYYfxbnsh3X6c34Cdm83') || l.includes('valesPendentes')) {
      console.log(`Linha ${i+1}: ${l}`);
    }
  });

  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const txs = fullData.financial_transactions || [];
  
  const septVales = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const desc = (t.description || '').toLowerCase();
    return desc.includes('vale') && d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`\n=== TODOS OS ${septVales.length} VALES DE SETEMBRO NO SISTEMA INTEIRO (01/09 A 14/09) ===`);

  const byProf: Record<string, { total: number, vales: any[] }> = {};

  septVales.forEach((v: any) => {
    const d = (v.date || '').substring(0, 10);
    const amt = v.amount || 0;
    const desc = v.description || '';
    const profName = v.profissional_name || 'Profissional Sem Nome (ID undefined)';
    const key = profName + ` (${v.profissional_id})`;

    if (!byProf[key]) byProf[key] = { total: 0, vales: [] };
    byProf[key].total += amt;
    byProf[key].vales.push({ date: d, amt, desc, id: v.id, profId: v.profissional_id, profName: v.profissional_name });
  });

  Object.keys(byProf).forEach(k => {
    console.log(`\n---------------------------------------------------------`);
    console.log(`PROFISSIONAL: ${k} | TOTAL DE VALES: R$ ${byProf[k].total.toFixed(2)}`);
    console.log(`---------------------------------------------------------`);
    byProf[k].vales.forEach((v, idx) => {
      console.log(`  [${String(idx+1).padStart(2, '0')}] ${v.date} | R$ ${v.amt.toFixed(2).padStart(6)} | Desc: "${v.desc}" (ID: ${v.id})`);
    });
  });
}

checkLedgerAndVales();
