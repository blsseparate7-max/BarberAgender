import * as fs from 'fs';

function auditRick() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');

  // Let's find user with email rickbolado@gbcortes7.com
  const usuarios = fullData.usuarios || [];
  console.log("=== TODOS OS USUÁRIOS ===");
  usuarios.forEach((u: any) => {
    console.log(`UID: ${u.uid || u.id} | Email: ${u.email} | Nome: ${u.nome} | Tipo: ${u.tipo}`);
  });

  const rickUser = usuarios.find((u: any) => (u.email || '').toLowerCase() === 'rickbolado@gbcortes7.com');
  console.log("\n=== USUÁRIO ENCONTRADO ===");
  console.log(rickUser);

  const rickUid = rickUser?.uid || rickUser?.id || '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  // Find all financial transactions / comandas for Rick
  const txs = fullData.financial_transactions || [];
  const rickTxs = txs.filter((t: any) => t.profissional_id === rickUid || (t.profissional_name || '').toLowerCase().includes('luiz henrique') || (t.profissional_name || '').toLowerCase().includes('rick'));

  console.log(`\n=== TRANSAÇÕES FINANCEIRAS / COMANDAS PARA RICK (${rickTxs.length}) ===`);
  let totalComissaoRick = 0;
  let totalFaturamentoRick = 0;

  rickTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, idx: number) => {
    const d = (t.date || '').substring(0, 10);
    const amt = t.amount || 0;
    // Calculate commission based on 50% or standard rate
    const comm = amt * 0.5; // let's check
    totalFaturamentoRick += amt;
    totalComissaoRick += comm;
    console.log(`${idx+1}. Data: ${d} | Comanda: ${t.description || t.comanda_id} | Cliente: ${t.cliente_name} | Faturamento: R$ ${amt.toFixed(2)} | Serviço: R$ ${t.service_amount || amt} | Prod: R$ ${t.product_amount || 0}`);
  });

  console.log(`\nFaturamento Bruto Total: R$ ${totalFaturamentoRick.toFixed(2)}`);

  // Let's check reconstructed totals for Rick
  const rickReconstructed = reconstructed.find((r: any) => r.uid === rickUid);
  console.log("\n=== DADOS RECONSTRUÍDOS PARA RICK ===");
  if (rickReconstructed) {
    console.log(`Nome: ${rickReconstructed.nome}`);
    console.log(`UID: ${rickReconstructed.uid}`);
    console.log(`Atendimentos: ${(rickReconstructed.itensDetalhados || []).length}`);
    console.log(`Comissão Total Calculada: R$ ${rickReconstructed.comissaoFinal}`);
    console.log(`Vales Lista (${(rickReconstructed.valesLista || []).length}):`);
    (rickReconstructed.valesLista || []).forEach((v: any, i: number) => {
      console.log(`  [${i+1}] DocID: ${v.id} | Data: ${v.data} | Valor: R$ ${v.valor} | Motivo/Desc: "${v.motivo || v.description}" | ProfID no Doc: ${v.profissional_id} | ProfNome: ${v.profissional_name}`);
    });
  }

  // Also check all 28 advances in the system to see every single advance and whether any mention Rick, Luiz Henrique, or have dates/values for him!
  console.log("\n=== BUSCA EXAUSTIVA EM TODOS OS VALES DO SISTEMA (SETEMBRO) ===");
  let allVales: any[] = [];
  reconstructed.forEach((p: any) => {
    (p.valesLista || []).forEach((v: any) => allVales.push(v));
  });

  allVales.sort((a: any, b: any) => (a.data || '').localeCompare(b.data || '')).forEach((v: any, i: number) => {
    console.log(`${String(i+1).padStart(2, '0')}. ID: ${v.id} | Data: ${v.data} | Valor: R$ ${v.valor} | ProfID: ${v.profissional_id} | ProfNome: "${v.profissional_name}" | Motivo: "${v.motivo}" | Desc: "${v.description}" | Notes: "${v.notes}" | Supplier: "${v.supplier}"`);
  });
}

auditRick();
