import * as fs from 'fs';

function printFullSummaryTable() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  const usuarios = fullData.usuarios || [];
  const txs = fullData.financial_transactions || [];

  console.log("=== ANÁLISE COMPLETA E COMPARAÇÃO ENTRE SISTEMA X ITEM A ITEM ===");

  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const valesTxs = septTxs.filter((t: any) => (t.description || '').toLowerCase().includes('vale'));

  reconstructed.forEach((rec: any) => {
    const uid = rec.uid;
    const name = rec.nome;
    const email = rec.email;

    const items = rec.itensDetalhados || [];
    
    // Filter closed items from 01/09 to 15/09
    const closedItems = items.filter((it: any) => {
      const d = (it.date || '').substring(0, 10);
      const st = (it.comandaStatus || '').toLowerCase();
      return d >= '2026-09-01' && d <= '2026-09-15' && (st === 'fechada' || st === 'paga' || st === 'pago');
    });

    let itemFatSum = 0;
    let itemCommSum = 0;
    const itemPctCounts: Record<number, number> = {};

    closedItems.forEach((it: any) => {
      const price = Number(it.itemPrice || 0);
      const comm = Number(it.itemCommVal || 0);
      itemFatSum += price;
      itemCommSum += comm;
      let pct = price > 0 ? Math.round((comm / price) * 100) : 50;
      itemPctCounts[pct] = (itemPctCounts[pct] || 0) + 1;
    });

    // Vales assigned via profID or via name in description
    const userVales = valesTxs.filter((v: any) => {
      const pId = v.profissional_id;
      const pName = (v.profissional_name || '').toLowerCase();
      const desc = (v.description || '').toLowerCase();
      const uName = (name || '').toLowerCase();
      
      return pId === uid || pName.includes(uName) || (uName.length > 3 && desc.includes(uName));
    });

    let valesSum = 0;
    userVales.forEach((v: any) => valesSum += Number(v.amount || 0));

    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`👤 BARBEIRO / PROFISSIONAL: ${name} (${email})`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`1. COMANDAS FECHADAS (${closedItems.length} itens de serviço/produto):`);
    console.log(`   - Faturamento Bruto (Itens Fechados): R$ ${itemFatSum.toFixed(2)}`);
    console.log(`   - Comissão Gerada (% real de cada item): R$ ${itemCommSum.toFixed(2)}`);
    console.log(`   - % de comissão aplicadas nos itens: ${JSON.stringify(itemPctCounts)}`);

    console.log(`2. VALES E ADIANTAMENTOS (${userVales.length} vales no período):`);
    console.log(`   - Total de Vales Retirados: R$ ${valesSum.toFixed(2)}`);
    userVales.forEach((v: any) => {
      console.log(`     * [${v.date.substring(0, 10)}] R$ ${Number(v.amount).toFixed(2)} | Desc: "${v.description}" (ID: ${v.id})`);
    });

    const saldoLiquido = itemCommSum - valesSum;
    console.log(`3. SALDO FINAL LÍQUIDO DEVIMENTO:`);
    if (saldoLiquido >= 0) {
      console.log(`   ✅ A PAGAR VIA PIX: R$ ${saldoLiquido.toFixed(2)}`);
    } else {
      console.log(`   ⚠️ DEVEDOR (VALES EXCEDEM COMISSÃO EM R$ ${Math.abs(saldoLiquido).toFixed(2)}) -> SALDO A PAGAR = R$ 0,00`);
    }
  });
}

printFullSummaryTable();
