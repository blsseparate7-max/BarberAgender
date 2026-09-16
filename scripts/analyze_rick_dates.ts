import * as fs from 'fs';

function analyzeRickByDate() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const rickData = reconstructed.find((r: any) => r.uid === rickUid);

  const byDate: Record<string, { comm: number, items: string[] }> = {};

  (rickData.itensDetalhados || []).forEach((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    if (d >= '2026-09-01' && d <= '2026-09-14' && comm > 0) {
      if (!byDate[d]) byDate[d] = { comm: 0, items: [] };
      byDate[d].comm += comm;
      byDate[d].items.push(`${item.itemName} (R$ ${comm.toFixed(2)})`);
    }
  });

  console.log("=== RESUMO DIA A DIA DAS COMISSÕES DO RICK (01/09 A 14/09) ===");
  let cumulative = 0;
  Object.keys(byDate).sort().forEach((d) => {
    const dayComm = byDate[d].comm;
    cumulative += dayComm;
    console.log(`Data: ${d} | Comissão do Dia: R$ ${dayComm.toFixed(2).padStart(6)} | Acumulado até o dia: R$ ${cumulative.toFixed(2).padStart(6)} | Itens: ${byDate[d].items.join(', ')}`);
  });
}

analyzeRickByDate();
