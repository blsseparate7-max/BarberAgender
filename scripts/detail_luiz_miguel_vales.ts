import * as fs from 'fs';

function detailLuizMiguelVales() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const txs = fullData.financial_transactions || [];
  const lmUid = '317sdImqlYYfxbnsh3X6c34Cdm83';

  console.log("=== TODOS OS VALES DO LUIZ MIGUEL REGISTRADOS EM SETEMBRO (01/09 A 14/09) ===");

  const lmVales = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const desc = (t.description || '').toLowerCase();
    const isVale = desc.includes('vale');
    const pId = t.profissional_id;
    const pName = (t.profissional_name || '').toLowerCase();
    return isVale && (pId === lmUid || pName.includes('luiz miguel') || desc.includes('luiz miguel')) && d >= '2026-09-01' && d <= '2026-09-14';
  });

  let totalValesLM = 0;
  lmVales.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((v: any, idx: number) => {
    const d = (v.date || '').substring(0, 10);
    const amt = v.amount || 0;
    totalValesLM += amt;
    console.log(`[VALE LM #${String(idx+1).padStart(2, '0')}] Data: ${d} | R$ ${amt.toFixed(2).padStart(6)} | ID: ${v.id} | Desc: "${v.description}" | Prof: "${v.profissional_name}" (ID: ${v.profissional_id})`);
  });

  console.log(`\nTOTAL DE VALES DO LUIZ MIGUEL NO SISTEMA: R$ ${totalValesLM.toFixed(2)} (${lmVales.length} vales)\n`);

  // Let's also check if there are vales assigned to OTHER professionals that mention "Luiz Miguel" or vice versa!
  console.log("=== BUSCANDO VALES QUE POSSAM TER SIDO LANÇADOS COM ERRO DE NOMES OU PROFISSIONAIS ===");
  const allSeptVales = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const desc = (t.description || '').toLowerCase();
    return desc.includes('vale') && d >= '2026-09-01' && d <= '2026-09-14';
  });

  allSeptVales.forEach((v: any, idx: number) => {
    const desc = (v.description || '').toLowerCase();
    const pName = (v.profissional_name || '').toLowerCase();
    const pId = v.profissional_id;
    const amt = v.amount || 0;
    const d = (v.date || '').substring(0, 10);

    // Check mismatch between desc name and pName/pId
    if (desc.includes('luiz miguel') && pId !== lmUid) {
      console.log(`🚨 SUSPEITA! Descrição menciona Luiz Miguel, mas ProfID = ${pId} (${pName})! Data: ${d} | R$ ${amt} | Desc: "${v.description}"`);
    }
    if (desc.includes('luiz henrique') && pId === lmUid) {
      console.log(`🚨 SUSPEITA! ProfID = Luiz Miguel, mas Descrição menciona Luiz Henrique! Data: ${d} | R$ ${amt} | Desc: "${v.description}"`);
    }
    if (desc.includes('miguel') && !desc.includes('luiz miguel') && pId === lmUid) {
      console.log(`🔍 OBSERVAÇÃO! Descrição menciona "Miguel" (pode ser Luiz Miguel ou filho/outro): Data: ${d} | R$ ${amt} | Desc: "${v.description}"`);
    }
  });
}

detailLuizMiguelVales();
