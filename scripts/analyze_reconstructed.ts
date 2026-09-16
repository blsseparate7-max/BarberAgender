import * as fs from 'fs';

function analyze() {
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));
  const forensicData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));

  console.log("=== DADOS DO RECONSTRUCTED TOTALS E FORENSIC DATA ===");
  console.log(`Coleções encontradas em forensicData:`, Object.keys(forensicData));

  reconstructed.forEach((p: any) => {
    console.log(`\n======================================================`);
    console.log(`PROFISSIONAL: ${p.nome} (UID: ${p.uid})`);
    console.log(`======================================================`);

    const setItens1to14 = (p.itensDetalhados || []).filter((it: any) => {
      const d = (it.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    const setItens15 = (p.itensDetalhados || []).filter((it: any) => {
      const d = (it.date || '').substring(0, 10);
      return d === '2026-09-15';
    });

    const valesList1to14 = (p.valesLista || []).filter((v: any) => {
      const d = (v.data || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    const valesList15 = (p.valesLista || []).filter((v: any) => {
      const d = (v.data || '').substring(0, 10);
      return d === '2026-09-15';
    });

    console.log(`Atendimentos (01/09 a 14/09): Total ${setItens1to14.length}`);
    const fechados1to14 = setItens1to14.filter((it: any) => ['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase()));
    const abertos1to14 = setItens1to14.filter((it: any) => !['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase()));

    const sumBrutoFechado = fechados1to14.reduce((acc: number, it: any) => acc + (it.itemPrice || 0), 0);
    const sumCommFechado = fechados1to14.reduce((acc: number, it: any) => acc + (it.itemCommVal || 0), 0);

    const sumBrutoAberto = abertos1to14.reduce((acc: number, it: any) => acc + (it.itemPrice || 0), 0);
    const sumCommAberto = abertos1to14.reduce((acc: number, it: any) => acc + (it.itemCommVal || 0), 0);

    console.log(`  - FINALIZADAS (01-14): ${fechados1to14.length} | Bruto: R$ ${sumBrutoFechado.toFixed(2)} | Comissão: R$ ${sumCommFechado.toFixed(2)}`);
    console.log(`  - EM ABERTO (01-14): ${abertos1to14.length} | Bruto: R$ ${sumBrutoAberto.toFixed(2)} | Comissão: R$ ${sumCommAberto.toFixed(2)}`);
    if (abertos1to14.length > 0) {
      console.log(`    Comandas em aberto detalhadas:`);
      abertos1to14.forEach((it: any) => {
        console.log(`      * ${it.date} | Comanda #${it.comandaNumber} | Status: [${it.comandaStatus}] | ${it.itemName} | Preço: R$ ${it.itemPrice} | Comm: R$ ${it.itemCommVal}`);
      });
    }

    if (setItens15.length > 0) {
      console.log(`  - ATENDIMENTOS EM 15/09: ${setItens15.length} itens`);
      setItens15.forEach((it: any) => {
        console.log(`      * ${it.date} | Comanda #${it.comandaNumber} | Status: [${it.comandaStatus}] | ${it.itemName} | Preço: R$ ${it.itemPrice} | Comm: R$ ${it.itemCommVal}`);
      });
    }

    console.log(`Vales (01/09 a 14/09): Total ${valesList1to14.length}`);
    let sumVales1to14 = 0;
    valesList1to14.forEach((v: any) => {
      sumVales1to14 += v.valor || 0;
      console.log(`  - ${v.data} | DocID: ${v.id} | R$ ${v.valor} | Motivo: "${v.motivo}" | ProfID: ${v.profId}`);
    });
    console.log(`  -> Soma Vales (01-14): R$ ${sumVales1to14.toFixed(2)}`);

    if (valesList15.length > 0) {
      console.log(`  - VALES EM 15/09: ${valesList15.length} itens`);
      valesList15.forEach((v: any) => {
        console.log(`      * ${v.data} | DocID: ${v.id} | R$ ${v.valor} | Motivo: "${v.motivo}"`);
      });
    }
  });
}

analyze();
