import * as fs from 'fs';

function inspectRickReconstructed() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  const rickData = reconstructed.find((r: any) => r.uid === rickUid);
  console.log("=== INSPEÇÃO DETALHADA DE RECONSTRUCTED_TOTALS PARA RICK ===");
  if (!rickData) {
    console.log("Rick não encontrado em reconstructed_totals.json");
    return;
  }

  console.log(`Profissional: ${rickData.nome} (UID: ${rickData.uid})`);
  console.log(`Total de Atendimentos no Arquivo: ${(rickData.itensDetalhados || []).length}`);

  let totalSeptFaturamento = 0;
  let totalSeptComissao = 0;
  let septCount = 0;

  (rickData.itensDetalhados || []).forEach((item: any, i: number) => {
    const d = (item.date || '').substring(0, 10);
    if (d >= '2026-09-01' && d <= '2026-09-14') {
      septCount++;
      const val = item.itemValue || 0;
      const comm = item.itemCommVal || 0;
      totalSeptFaturamento += val;
      totalSeptComissao += comm;
      console.log(`[${String(septCount).padStart(2, '0')}] Data: ${d} | Item: "${item.itemName}" | Valor Item: R$ ${val.toFixed(2)} | Comiss: R$ ${comm.toFixed(2)} | ComandaID: ${item.comandaId}`);
    }
  });

  console.log(`\nConsolidado Setembro (01 a 14/09):`);
  console.log(`Qtd Atendimentos: ${septCount}`);
  console.log(`Faturamento Total: R$ ${totalSeptFaturamento.toFixed(2)}`);
  console.log(`Comissão Total: R$ ${totalSeptComissao.toFixed(2)}`);
}

inspectRickReconstructed();
