import * as fs from 'fs';

function findSubsetsFast() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const rickData = reconstructed.find((r: any) => r.uid === rickUid);

  const items = (rickData.itensDetalhados || []).filter((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    return d >= '2026-09-01' && d <= '2026-09-14' && comm > 0;
  });

  const totalAll = items.reduce((a: number, b: any) => a + b.itemCommVal, 0);
  const target = 404.05;
  const targetDiff = Math.round((totalAll - target) * 100); // in cents

  console.log(`Total geral: R$ ${totalAll.toFixed(2)} (${Math.round(totalAll * 100)} centavos)`);
  console.log(`Target: R$ ${target.toFixed(2)} (${Math.round(target * 100)} centavos)`);
  console.log(`Diferença exata a remover: R$ ${(totalAll - target).toFixed(2)} (${targetDiff} centavos)\n`);

  const cents = items.map((it: any) => Math.round(it.itemCommVal * 100));

  // Find subsets of cents that sum to targetDiff
  const matches: number[][] = [];

  function searchDiff(idx: number, currentSum: number, currentSet: number[]) {
    if (currentSum === targetDiff) {
      matches.push([...currentSet]);
      return;
    }
    if (idx >= cents.length || currentSum > targetDiff) return;

    searchDiff(idx + 1, currentSum + cents[idx], [...currentSet, idx]);
    searchDiff(idx + 1, currentSum, currentSet);
  }

  searchDiff(0, 0, []);

  console.log(`Combinações de itens para remover que resultam em R$ 404.05: ${matches.length}`);

  matches.forEach((m, i) => {
    console.log(`\n--- OPÇÃO ${i + 1} ---`);
    console.log("ITENS QUE DEVEM SER REMOVIDOS:");
    m.forEach(idx => {
      const it = items[idx];
      console.log(`   - Data: ${it.date} | CmdID: ${it.comandaId} | Serviço: "${it.itemName}" | Comissão: R$ ${it.itemCommVal.toFixed(2)} | Status: ${it.comandaStatus}`);
    });
  });
}

findSubsetsFast();
