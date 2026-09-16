import * as fs from 'fs';

function findSubsetsFor404() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const rickData = reconstructed.find((r: any) => r.uid === rickUid);

  const items = (rickData.itensDetalhados || []).filter((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    return d >= '2026-09-01' && d <= '2026-09-14' && comm > 0;
  });

  console.log(`Total itens no pool: ${items.length}`);
  const target = 404.05;

  // Let's find subsets of items that sum to 404.05
  const results: any[] = [];

  function search(idx: number, currentSum: number, currentSet: any[]) {
    if (Math.abs(currentSum - target) < 0.01) {
      results.push([...currentSet]);
      return;
    }
    if (idx >= items.length || currentSum > target + 0.05) return;

    // Include
    search(idx + 1, currentSum + items[idx].itemCommVal, [...currentSet, items[idx]]);
    // Exclude
    search(idx + 1, currentSum, currentSet);
  }

  search(0, 0, []);

  console.log(`\nSubconjuntos encontrados somando R$ ${target.toFixed(2)}: ${results.length}`);

  results.forEach((res, rIdx) => {
    console.log(`\n--- OPÇÃO ${rIdx + 1} (${res.length} itens) ---`);
    const excluded = items.filter((it: any) => !res.includes(it));
    console.log("ITENS EXCLUÍDOS NESSA OPÇÃO:");
    excluded.forEach((ex: any) => {
      console.log(`   - Data: ${ex.date} | CmdID: ${ex.comandaId} | Serviço: "${ex.itemName}" | Comissão: R$ ${ex.itemCommVal.toFixed(2)} | Status: ${ex.comandaStatus}`);
    });
  });
}

findSubsetsFor404();
