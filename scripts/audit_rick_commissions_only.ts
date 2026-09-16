import * as fs from 'fs';

function auditCommissionsGenerated() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  console.log("=======================================================================");
  console.log("APURAÇÃO DAS COMANDAS QUE EFETIVAMENTE GERARAM REGISTRO DE COMISSÃO");
  console.log("PARA O PROFISSIONAL RICK (LUIZ HENRIQUE) - 01/09 A 14/09");
  console.log("=======================================================================\n");

  // 1. Coleção 'commissions'
  const commissions = fullData.commissions || [];
  console.log(`Total de documentos na coleção 'commissions': ${commissions.length}`);

  const rickCommsDoc = commissions.filter((c: any) => {
    const d = (c.date || c.created_at || c.data || '').substring(0, 10);
    const pId = c.profissional_id || c.barber_id;
    const pName = (c.profissional_name || c.barber_name || '').toLowerCase();
    const isRick = pId === rickUid || pName.includes('rick') || pName.includes('luiz henrique');
    return isRick && d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`Comissões registradas no período para Rick: ${rickCommsDoc.length}`);
  let totalDocComm = 0;
  rickCommsDoc.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((c: any, i: number) => {
    const amt = c.commission_value || c.amount || c.valor || 0;
    totalDocComm += amt;
    console.log(`[DOC COMM #${i+1}] Data: ${c.date} | Cliente: ${c.client_name || c.cliente_nome} | Serviço: ${c.service_name || c.servico_nome} | Base: R$ ${c.base_value || 0} | Comissão: R$ ${amt.toFixed(2)} | Status: ${c.status}`);
  });
  console.log(`Soma na coleção 'commissions': R$ ${totalDocComm.toFixed(2)}\n`);

  // 2. Financial Transactions de Comandas que geraram comissão
  const txs = fullData.financial_transactions || [];
  const rickTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const pId = t.profissional_id;
    const pName = (t.profissional_name || '').toLowerCase();
    const isRick = pId === rickUid || pName.includes('rick') || pName.includes('luiz henrique');
    const isVale = (t.description || '').toLowerCase().includes('vale');
    return isRick && !isVale && d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`Transações Financeiras de Atendimentos do Rick no período: ${rickTxs.length}`);
  let totalTxComm = 0;
  let totalTxFaturamento = 0;

  rickTxs.sort((a: any, b: any) => (a.date || '').localeCompare(b.date || '')).forEach((t: any, i: number) => {
    const fat = t.amount || 0;
    const comm = fat * 0.5; // 50% de comissão
    totalTxFaturamento += fat;
    totalTxComm += comm;
    console.log(`[TX #${String(i+1).padStart(2, '0')}] Data: ${t.date} | Faturamento: R$ ${fat.toFixed(2)} | Comissão (50%): R$ ${comm.toFixed(2)} | Desc: "${t.description}" | Cliente: "${t.cliente_name}"`);
  });

  console.log(`\nSoma Faturamento Transações: R$ ${totalTxFaturamento.toFixed(2)}`);
  console.log(`Soma Comissões Geradas (50%): R$ ${totalTxComm.toFixed(2)}`);
}

auditCommissionsGenerated();
