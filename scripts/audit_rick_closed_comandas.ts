import * as fs from 'fs';

function auditClosedComandas() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  console.log("=== INSPEÇÃO APENAS DE COMANDAS FECHADAS/PAGAS DO RICK (01/09 A 14/09) ===\n");

  const rickData = reconstructed.find((r: any) => r.uid === rickUid);
  const items = rickData ? (rickData.itensDetalhados || []) : [];

  let countClosed = 0;
  let totalCommClosed = 0;
  let totalGrossClosed = 0;

  let countOpen = 0;
  let totalCommOpen = 0;

  console.log("--- LISTA COMPLETA DE ATENDIMENTOS DO RICK E STATUS DA COMANDA ---");

  items.forEach((item: any, idx: number) => {
    const d = (item.date || '').substring(0, 10);
    if (d >= '2026-09-01' && d <= '2026-09-14') {
      const comm = item.itemCommVal || 0;
      const status = item.comandaStatus || item.status || 'desconhecido';
      const isClosed = status === 'fechada' || status === 'pago' || status === 'paga' || status === 'concluido' || status === 'fechado';

      if (isClosed && comm > 0) {
        countClosed++;
        totalCommClosed += comm;
        console.log(`[FECHADA #${countClosed}] Data: ${d} | Cmd: ${item.comandaId} | Item: "${item.itemName}" | Comissão: R$ ${comm.toFixed(2)} | Status: ${status}`);
      } else if (comm > 0) {
        countOpen++;
        totalCommOpen += comm;
        console.log(`[NÃO FECHADA #${countOpen}] Data: ${d} | Cmd: ${item.comandaId} | Item: "${item.itemName}" | Comissão: R$ ${comm.toFixed(2)} | Status: ${status}`);
      } else {
        console.log(`[SEM COMISSÃO / ZERADA] Data: ${d} | Cmd: ${item.comandaId} | Item: "${item.itemName}" | Status: ${status}`);
      }
    }
  });

  console.log("\n=======================================================================");
  console.log(`TOTAL DE COMANDAS FECHADAS DO RICK: ${countClosed} itens`);
  console.log(`COMISSÃO TOTAL DAS COMANDAS FECHADAS: R$ ${totalCommClosed.toFixed(2)}`);
  console.log(`COMISSÃO TOTAL DE COMANDAS ABERTAS/AGENDADAS (IGNORADAS): R$ ${totalCommOpen.toFixed(2)}`);
  console.log("=======================================================================");
}

auditClosedComandas();
