import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));
console.log("Reconstructed items count:", reconstructed.length);

reconstructed.forEach((item: any) => {
  console.log(`\n=== PROFISSIONAL: ${item.nome} (${item.uid}) ===`);
  console.log("Vales Lista count:", (item.valesLista || []).length);
  (item.valesLista || []).forEach((v: any) => {
    console.log(`  DocID: ${v.id} | Data: ${v.data} | Valor: R$ ${v.valor} | Motivo: "${v.motivo}" | Source: ${v.origem} | profId: ${v.profId} | profName: ${v.profNome}`);
  });
});
