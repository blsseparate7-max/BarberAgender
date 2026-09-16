import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

console.log("=== TODOS OS VALES DO RECONSTRUCTED_TOTALS.JSON ===\n");

reconstructed.forEach((p: any) => {
  console.log(`Profissional: ${p.nome} (UID: ${p.uid})`);
  const vales = p.valesLista || [];
  console.log(`Quantidade de vales: ${vales.length}`);
  vales.forEach((v: any, i: number) => {
    console.log(` [${i+1}] ID: ${v.id} | Data: ${v.data} | Valor: R$ ${v.valor} | Desc: "${v.description || v.motivo}" | ProfID: ${v.profissional_id || v.profId} | ProfNome: ${v.profissional_name || v.profNome}`);
    if (v.raw) console.log(`      RAW:`, JSON.stringify(v.raw));
  });
  console.log("");
});
