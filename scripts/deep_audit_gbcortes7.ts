import * as fs from 'fs';

function deepAuditTenantGbcortes7V2() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');
  
  const usuarios = fullData.usuarios || [];
  const txs = fullData.financial_transactions || [];
  const commsTable = fullData.commissions || [];

  console.log("==================================================================================");
  console.log("AUDITORIA INTEGRAL DE COMANDAS, PORCENTAGENS E VALES (01/09/2026 A 15/09/2026)");
  console.log("==================================================================================\n");

  // Build user map
  const userMap: Record<string, any> = {};
  usuarios.forEach((u: any) => {
    const uid = u.id || u.uid;
    userMap[uid] = u;
    if (u.email) userMap[u.email.toLowerCase()] = u;
    const name = (u.nome || u.name || '').toLowerCase();
    if (name) userMap[name] = u;
  });

  console.log("--- PROFISSIONAIS CADASTRADOS NO TENANT ---");
  usuarios.forEach((u: any) => {
    console.log(`- Nome: "${u.nome || u.name}" | Email: "${u.email}" | UID: ${u.id || u.uid} | % Comissão Padrão: ${u.percentual_comissao || u.commission_percentage || 50}%`);
  });

  // Collect all items from reconstructed (which parsed every comanda service item in Firestore)
  // Reconstructed array has: [{ uid, nome, email, totalComandas, totalFaturamento, totalComissao, itensDetalhados: [...] }]

  interface AuditItem {
    comandaId: string;
    date: string;
    itemName: string;
    itemPrice: number;
    pctUsed: number;
    commVal: number;
    status: string;
  }

  interface ProfReport {
    uid: string;
    name: string;
    email: string;
    itemsFechados: AuditItem[];
    itemsAbertos: AuditItem[];
    fatFechado: number;
    commFechada: number;
    vales: any[];
    totalVales: number;
  }

  const reports: Record<string, ProfReport> = {};

  // Initialize for all users
  usuarios.forEach((u: any) => {
    const uid = u.id || u.uid;
    reports[uid] = {
      uid,
      name: u.nome || u.name || u.email,
      email: u.email || '',
      itemsFechados: [],
      itemsAbertos: [],
      fatFechado: 0,
      commFechada: 0,
      vales: [],
      totalVales: 0
    };
  });

  // Process reconstructed items
  reconstructed.forEach((rec: any) => {
    const rUid = rec.uid;
    if (!reports[rUid]) {
      reports[rUid] = {
        uid: rUid,
        name: rec.nome || 'Profissional',
        email: rec.email || '',
        itemsFechados: [],
        itemsAbertos: [],
        fatFechado: 0,
        commFechada: 0,
        vales: [],
        totalVales: 0
      };
    }

    const items = rec.itensDetalhados || [];
    items.forEach((it: any) => {
      const d = (it.date || '').substring(0, 10);
      if (d < '2026-09-01' || d > '2026-09-15') return;

      const commVal = Number(it.itemCommVal || 0);
      const price = Number(it.itemPrice || 0);
      
      // Calculate effective percentage
      let pct = 50;
      if (price > 0 && commVal > 0) {
        pct = Math.round((commVal / price) * 100);
      }

      const st = (it.comandaStatus || '').toLowerCase();
      const isClosed = st === 'fechada' || st === 'paga' || st === 'pago' || st === 'concluido';

      const auditItem: AuditItem = {
        comandaId: it.comandaId,
        date: d,
        itemName: it.itemName || 'Serviço/Produto',
        itemPrice: price,
        pctUsed: pct,
        commVal,
        status: st
      };

      if (isClosed) {
        reports[rUid].itemsFechados.push(auditItem);
        reports[rUid].fatFechado += price;
        reports[rUid].commFechada += commVal;
      } else {
        reports[rUid].itemsAbertos.push(auditItem);
      }
    });
  });

  // Process Vales (from financial_transactions)
  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const valesTxs = septTxs.filter((t: any) => (t.description || '').toLowerCase().includes('vale'));

  valesTxs.forEach((v: any) => {
    const d = (v.date || '').substring(0, 10);
    const amt = Number(v.amount || 0);
    const desc = v.description || '';
    const descLower = desc.toLowerCase();
    const pId = v.profissional_id;
    const pName = v.profissional_name || '';

    let targetUid = pId;

    // If pId is undefined, match by name in description!
    if (!targetUid || !reports[targetUid]) {
      const foundUser = usuarios.find((u: any) => {
        const uName = (u.nome || u.name || '').toLowerCase();
        return uName && descLower.includes(uName);
      });
      if (foundUser) targetUid = foundUser.id || foundUser.uid;
    }

    if (!targetUid || !reports[targetUid]) {
      targetUid = 'unknown';
      if (!reports['unknown']) {
        reports['unknown'] = {
          uid: 'unknown',
          name: 'Vales sem Profissional Identificado',
          email: '',
          itemsFechados: [],
          itemsAbertos: [],
          fatFechado: 0,
          commFechada: 0,
          vales: [],
          totalVales: 0
        };
      }
    }

    reports[targetUid].vales.push({
      id: v.id,
      date: d,
      amount: amt,
      description: desc,
      profIdInRecord: pId,
      profNameInRecord: pName
    });
    reports[targetUid].totalVales += amt;
  });

  // Print results
  console.log("==================================================================================");
  console.log("RESULTADO DA ANÁLISE COMPLETA POR PROFISSIONAL (01/09 A 15/09)");
  console.log("==================================================================================\n");

  Object.values(reports).forEach((p) => {
    if (p.itemsFechados.length === 0 && p.itemsAbertos.length === 0 && p.vales.length === 0) {
      return;
    }

    console.log(`\n=====================================================================`);
    console.log(`👤 PROFISSIONAL: ${p.name.toUpperCase()} (${p.email || 'UID: ' + p.uid})`);
    console.log(`=====================================================================`);
    console.log(`📌 ITENS EM COMANDAS FECHADAS/PAGAS (${p.itemsFechados.length} itens):`);
    
    // Group by percentage
    const pcts: Record<number, { count: number, fat: number, comm: number }> = {};

    p.itemsFechados.forEach((it, idx) => {
      if (!pcts[it.pctUsed]) pcts[it.pctUsed] = { count: 0, fat: 0, comm: 0 };
      pcts[it.pctUsed].count++;
      pcts[it.pctUsed].fat += it.itemPrice;
      pcts[it.pctUsed].comm += it.commVal;

      console.log(`  [#${String(idx+1).padStart(2, '0')}] ${it.date} | Cmd #${it.comandaId.substring(0, 6)} | Item: "${it.itemName}" | Preço: R$ ${it.itemPrice.toFixed(2).padStart(6)} | % Aplicada: ${it.pctUsed}% | Comissão: R$ ${it.commVal.toFixed(2).padStart(6)}`);
    });

    console.log(`\n📊 DESDOBRAMENTO DE COMISSÃO POR PORCENTAGEM (%):`);
    Object.keys(pcts).forEach((pctK) => {
      const k = Number(pctK);
      const b = pcts[k];
      console.log(`  • Faixa ${k}%: ${b.count} itens | Faturamento: R$ ${b.fat.toFixed(2)} | Comissão: R$ ${b.comm.toFixed(2)}`);
    });

    console.log(`\n💵 RESUMO DE COMISSÃO (COMANDAS FECHADAS):`);
    console.log(`  - Faturamento Bruto Fechado: R$ ${p.fatFechado.toFixed(2)}`);
    console.log(`  - Comissão Bruta Devida: R$ ${p.commFechada.toFixed(2)}`);

    console.log(`\n🎟️ VALES / ADIANTAMENTOS RETIRADOS (${p.vales.length} vales):`);
    p.vales.forEach((v, idx) => {
      const hasId = v.profIdInRecord ? "OK" : "⚠️ SEM PROFID NO REGISTRO";
      console.log(`  [Vale #${String(idx+1).padStart(2, '0')}] ${v.date} | R$ ${v.amount.toFixed(2).padStart(6)} | Desc: "${v.description}" | (${hasId})`);
    });
    console.log(`  - Total de Vales Retirados: R$ ${p.totalVales.toFixed(2)}`);

    const saldoLiquido = p.commFechada - p.totalVales;
    console.log(`\n💰 BALANÇO FINANCEIRO REAL APURADO (COMISSÃO - VALES):`);
    if (saldoLiquido >= 0) {
      console.log(`  ➡️ A PAGAR AO PROFISSIONAL VIA PIX: R$ ${saldoLiquido.toFixed(2)}`);
    } else {
      console.log(`  ➡️ DEVEDOR (VALES SUPERAM A COMISSÃO): R$ ${Math.abs(saldoLiquido).toFixed(2)} (Saldo Líquido = R$ 0,00)`);
    }

    if (p.itemsAbertos.length > 0) {
      let openCommSum = 0;
      p.itemsAbertos.forEach(it => openCommSum += it.commVal);
      console.log(`\n⚠️ COMANDAS ABERTAS / NÃO PAGAS NO PERÍODO: ${p.itemsAbertos.length} itens (Comissão Pendente: R$ ${openCommSum.toFixed(2)})`);
    }
  });
}

deepAuditTenantGbcortes7V2();
