import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

console.log("=== EXTRATO COMPLETO DE DADOS GRAVADOS NO BANCO ATÉ O DIA 13/09 E ATÉ O DIA 14/09 ===\n");

reconstructed.forEach((p: any) => {
  const name = p.nome || 'Barbeiro Sem Nome';
  const uid = p.uid;
  console.log(`========================================================`);
  console.log(`PROFISSIONAL: ${name} (UID: ${uid})`);
  console.log(`========================================================`);

  const itens = p.itensDetalhados || [];
  const vales = p.valesLista || [];

  // Up to 13/09
  const itens13 = itens.filter((it: any) => (it.date || '').substring(0, 10) <= '2026-09-13');
  const vales13 = vales.filter((v: any) => (v.data || '').substring(0, 10) <= '2026-09-13');

  // Up to 14/09
  const itens14 = itens.filter((it: any) => (it.date || '').substring(0, 10) <= '2026-09-14');
  const vales14 = vales.filter((v: any) => (v.data || '').substring(0, 10) <= '2026-09-14');

  console.log(`--- ATENDIMENTOS E COMISSÕES ---`);
  console.log(`  Até 13/09: ${itens13.length} atendimentos | Comissão Total: R$ ${itens13.reduce((a: number, b: any) => a + (b.itemCommVal || 0), 0).toFixed(2)}`);
  console.log(`  Até 14/09: ${itens14.length} atendimentos | Comissão Total: R$ ${itens14.reduce((a: number, b: any) => a + (b.itemCommVal || 0), 0).toFixed(2)}`);

  console.log(`--- VALES E ADIANTAMETOS ---`);
  console.log(`  Até 13/09: ${vales13.length} vales registrados | Total R$: ${vales13.reduce((a: number, b: any) => a + (b.valor || 0), 0).toFixed(2)}`);
  console.log(`  Até 14/09: ${vales14.length} vales registrados | Total R$: ${vales14.reduce((a: number, b: any) => a + (b.valor || 0), 0).toFixed(2)}`);
  
  if (vales14.length > 0) {
    console.log(`  Listagem de Vales até 14/09:`);
    vales14.forEach((v: any) => {
      console.log(`    * ${v.data} | DocID: ${v.id} | Valor: R$ ${v.valor} | Motivo: "${v.motivo || v.description || ''}"`);
    });
  }
  console.log("");
});
