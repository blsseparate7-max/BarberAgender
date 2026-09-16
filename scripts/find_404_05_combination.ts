import * as fs from 'fs';

function findCombination() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const rickData = reconstructed.find((r: any) => r.uid === rickUid);

  const items = (rickData.itensDetalhados || []).filter((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    return d >= '2026-09-01' && d <= '2026-09-14' && comm > 0;
  });

  console.log(`Total de itens com comissão de Setembro: ${items.length}`);
  console.log(`Soma de todos os 27 itens de comanda: R$ ${items.reduce((a: number, b: any) => a + b.itemCommVal, 0).toFixed(2)}`);

  // Let's print each item with its date, comandaId, service, commission
  items.forEach((it: any, idx: number) => {
    console.log(`[${String(idx+1).padStart(2, '0')}] ${it.date} | Cmd #${it.comandaId} | ${it.itemName} | R$ ${it.itemCommVal.toFixed(2)}`);
  });

  // Check if up to Sept 12th minus something is 404.05
  // Total up to Sept 12th = 430.45.
  // 430.45 - 404.05 = 26.40 (or 2 * 26.40 = 52.80 gross)
  // Let's check if there is an item of 26.40 or 25.85 + 0.55, or if 447.95 - 404.05 = 43.90!
  // Wait! 447.95 - 404.05 = 43.90!
  // Is 43.90 = 17.50 (13/09) + 26.40? Or 17.50 + 25.85 (25.85 is comanda rRaN3WeTcQHaGu1ow0YM "Navalhado, Barba e Sobrancelhas" on 12/09)?

  console.log("\n--- TESTANDO SUBDIFERENÇAS DE COMANDAS DA LISTA DO BANCO ---");
  const totalAll = items.reduce((a: number, b: any) => a + b.itemCommVal, 0);
  items.forEach((it: any) => {
    const diff = totalAll - it.itemCommVal;
    if (Math.abs(diff - 404.05) < 0.05) {
      console.log(`🎯 ENCONTRADO! Removendo o item "${it.itemName}" (Comissão: R$ ${it.itemCommVal.toFixed(2)}) de ${it.date}, o total fica EXACTAMENTE R$ ${diff.toFixed(2)}!`);
    }
  });

  // What if 2 items removed?
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const diff = totalAll - items[i].itemCommVal - items[j].itemCommVal;
      if (Math.abs(diff - 404.05) < 0.05) {
        console.log(`🎯 ENCONTRADO (2 itens)! Removendo "${items[i].itemName}" (${items[i].date}) e "${items[j].itemName}" (${items[j].date}), total fica R$ ${diff.toFixed(2)}`);
      }
    }
  }
}

findCombination();
