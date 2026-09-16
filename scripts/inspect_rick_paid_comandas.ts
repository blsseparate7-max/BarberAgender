import * as fs from 'fs';

function inspectRickPaidComandas() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';
  const rickData = reconstructed.find((r: any) => r.uid === rickUid);

  console.log("=== ITENS DE COMANDA DO RICK COM COMISSÃO > 0 (01 A 14/09) ===\n");

  let totalComm = 0;
  let count = 0;

  (rickData.itensDetalhados || []).forEach((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    if (d >= '2026-09-01' && d <= '2026-09-14' && comm > 0) {
      count++;
      totalComm += comm;
      console.log(`[${String(count).padStart(2, '0')}] Data: ${d} | Comanda: ${item.comandaId} | Item: "${item.itemName}" | Comissão: R$ ${comm.toFixed(2)}`);
    }
  });

  console.log(`\nTotal de itens com comissão válida: ${count}`);
  console.log(`SOMA DA COMISSÃO DE TODAS AS COMANDAS DO RICK DO BANCO: R$ ${totalComm.toFixed(2)}`);
}

inspectRickPaidComandas();
