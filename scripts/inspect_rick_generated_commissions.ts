import * as fs from 'fs';

function inspectRickGeneratedCommissions() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  const rickData = reconstructed.find((r: any) => r.uid === rickUid);
  const items = rickData ? (rickData.itensDetalhados || []) : [];

  console.log("=== TODOS OS ATENDIMENTOS DE COMANDA QUE GERARAM COMISSÃO (> 0) PARA RICK (01/09 A 14/09) ===\n");

  let totalComm = 0;
  let count = 0;

  items.forEach((item: any) => {
    const d = (item.date || '').substring(0, 10);
    const comm = item.itemCommVal || 0;
    if (d >= '2026-09-01' && d <= '2026-09-14' && comm > 0) {
      count++;
      totalComm += comm;
      console.log(`[${String(count).padStart(2, '0')}] Data: ${d} | ComandaID: ${item.comandaId} | Serviço: "${item.itemName}" | Comissão Gerada: R$ ${comm.toFixed(2)} | Status Comanda: ${item.comandaStatus || 'paga/fechada'}`);
    }
  });

  console.log(`\n=======================================================================`);
  console.log(`TOTAL DE COMANDAS QUE GERARAM COMISSÃO: ${count} itens`);
  console.log(`SOMA TOTAL DA COMISSÃO GERADA PARA O PROFISSIONAL: R$ ${totalComm.toFixed(2)}`);
  console.log(`=======================================================================`);
}

inspectRickGeneratedCommissions();
