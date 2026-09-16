import * as fs from 'fs';

function detailRickComandaStatuses() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  const rickData = reconstructed.find((r: any) => r.uid === rickUid);
  const items = rickData ? (rickData.itensDetalhados || []) : [];

  console.log("=== DETALHAMENTO DE TODAS AS COMANDAS DO RICK (POR COMANDA) ===\n");

  const byComanda: Record<string, { date: string, status: string, items: any[], commTotal: number }> = {};

  items.forEach((item: any) => {
    const d = (item.date || '').substring(0, 10);
    if (d >= '2026-09-01' && d <= '2026-09-14') {
      const cId = item.comandaId;
      if (!byComanda[cId]) {
        byComanda[cId] = {
          date: d,
          status: item.comandaStatus || item.status || 'desconhecido',
          items: [],
          commTotal: 0
        };
      }
      byComanda[cId].items.push(item);
      byComanda[cId].commTotal += (item.itemCommVal || 0);
    }
  });

  Object.keys(byComanda).forEach((cId) => {
    const c = byComanda[cId];
    console.log(`Comanda ID: ${cId} | Data: ${c.date} | Status: ${c.status} | Comiss Total: R$ ${c.commTotal.toFixed(2)}`);
    c.items.forEach(it => {
      console.log(`   - Item: "${it.itemName}" | Comiss: R$ ${(it.itemCommVal||0).toFixed(2)}`);
    });
  });

  console.log("\n--- SOMA APENAS COMANDAS COM STATUS 'fechada' OU 'paga' ---");
  const closedComms = Object.values(byComanda)
    .filter(c => c.status === 'fechada' || c.status === 'paga' || c.status === 'pago')
    .reduce((acc, c) => acc + c.commTotal, 0);

  console.log(`Total Comissão Apenas Fechadas: R$ ${closedComms.toFixed(2)}`);

  console.log("\n--- COMANDAS QUE NÃO ESTÃO FECHADAS ---");
  Object.values(byComanda)
    .filter(c => c.status !== 'fechada' && c.status !== 'paga' && c.status !== 'pago')
    .forEach(c => {
      console.log(`Data: ${c.date} | Status: "${c.status}" | Comiss: R$ ${c.commTotal.toFixed(2)}`);
    });
}

detailRickComandaStatuses();
