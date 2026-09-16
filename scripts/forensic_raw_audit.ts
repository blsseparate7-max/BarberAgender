import * as fs from 'fs';

// Let's inspect the files and collections available to generate the comprehensive raw forensic ledger
const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

console.log('========================================================================================');
console.log('🔎 AUDITORIA FORENSE E RASTREAMENTO PROFUNDO (MODO SOMENTE LEITURA)');
console.log('Tenant: gbcortes7 | Período: 01/09/2026 a 15/09/2026');
console.log('========================================================================================\n');

// 1. RAW VALES DUMP (ALL FIELDS)
console.log('========================================================================================');
console.log('1. EXTRATO BRUTO DE TODOS OS VALES / SAÍDAS (professional_advances)');
console.log('========================================================================================');

const allVales: any[] = [];
reconstructed.forEach((p: any) => {
  (p.valesLista || []).forEach((v: any) => {
    allVales.push({
      proNameNoDoc: p.profissional,
      proUidNoDoc: p.uid,
      id: v.id,
      data: v.data,
      valor: Number(v.valor),
      desc: v.desc
    });
  });
});

// Sort by date then value
allVales.sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);

allVales.forEach((v, idx) => {
  console.log(`[#${String(idx + 1).padStart(2, '0')}] ID: ${v.id.padEnd(20)} | Data: ${v.data} | Valor: R$ ${v.valor.toFixed(2).padStart(7)} | Profissional Vinculado: ${v.proNameNoDoc} (${v.proUidNoDoc}) | Desc: "${v.desc}"`);
});

console.log(`\nTOTAL DE VALES NO BANCO: ${allVales.length} lançamentos | SOMA TOTAL: R$ ${allVales.reduce((a, b) => a + b.valor, 0).toFixed(2)}\n`);

// 2. RAW COMANDAS DUMP BY PROFESSIONAL (01/09 TO 15/09)
console.log('========================================================================================');
console.log('2. EXTRATO BRUTO DE ATENDIMENTOS POR PROFISSIONAL (TODOS OS STATUS: FECHADA, ABERTA, ETC.)');
console.log('========================================================================================');

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

  console.log(`\n----------------------------------------------------------------------------------------`);
  console.log(`💈 PROFISSIONAL: ${p.name.toUpperCase()} (UID: ${p.uid}) | % Comissão: ${p.rate}%`);
  console.log(`Total de atendimentos registrados no período: ${setItens.length}`);
  console.log(`----------------------------------------------------------------------------------------`);
  
  // Sort items by date then comandaNumber
  setItens.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '') || (a.comandaNumber || '').localeCompare(b.comandaNumber || ''));

  let somaBruta = 0;
  let somaComm = 0;
  let somaFechadaBruta = 0;
  let somaFechadaComm = 0;

  setItens.forEach((it: any) => {
    somaBruta += it.itemPrice;
    somaComm += it.itemCommVal;
    const isClosed = ['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase());
    if (isClosed) {
      somaFechadaBruta += it.itemPrice;
      somaFechadaComm += it.itemCommVal;
    }
    console.log(`  • Data: ${it.date} | Comanda: #${it.comandaNumber.padEnd(5)} | Status: [${it.comandaStatus.padEnd(10)}] | Serviço: ${it.itemName.padEnd(30)} | Preço: R$ ${it.itemPrice.toFixed(2).padStart(6)} | Comissão (${it.rateUsed}%): R$ ${it.itemCommVal.toFixed(2).padStart(6)} | DocID: ${it.comandaId}`);
  });

  console.log(`\n  >> SUB-TOTAIS PARA ${p.name.toUpperCase()}:`);
  console.log(`     - TOTAL GERAL (Todas as ${setItens.length} comandas): Bruto: R$ ${somaBruta.toFixed(2)} | Comissão: R$ ${somaComm.toFixed(2)}`);
  console.log(`     - APENAS FECHADAS: Bruto: R$ ${somaFechadaBruta.toFixed(2)} | Comissão: R$ ${somaFechadaComm.toFixed(2)}`);
});
