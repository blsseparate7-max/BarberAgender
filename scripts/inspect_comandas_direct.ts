import * as fs from 'fs';

function inspectComandasDirect() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const comandas = fullData.comandas || [];
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  console.log("=== INSPEÇÃO DIRETA DE COMANDAS NO BANCO (FULL_FORENSIC_DATA) ===");

  const rickComandas = comandas.filter((c: any) => {
    const d = (c.created_at || c.createdAt || c.data || c.date || '').substring(0, 10);
    const bId = c.barber_id || c.barbeiro_id || c.profissional_id;
    const bName = (c.barber_name || c.barbeiro_nome || c.profissional_name || '').toLowerCase();
    const isRick = bId === rickUid || bName.includes('rick') || bName.includes('luiz henrique');
    return isRick && d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log(`Total de comandas de Rick encontradas na coleção 'comandas': ${rickComandas.length}\n`);

  let totalCommFechada = 0;
  let totalCommAberta = 0;
  let totalCommGeral = 0;

  rickComandas.forEach((c: any, i: number) => {
    const d = (c.created_at || c.createdAt || c.data || c.date || '').substring(0, 10);
    const status = c.status || 'sem_status';
    const total = c.total || c.total_amount || c.valor_total || 0;
    
    // Look for explicit commission field or calculate 50%
    const explicitComm = c.valor_comissao ?? c.commission_value ?? c.comissao_barbeiro ?? c.comissao;
    const items = c.items || c.servicos || c.itens || [];
    
    // Sum of items commissions
    let itemsCommSum = 0;
    items.forEach((it: any) => {
      if (it.commission_value !== undefined) itemsCommSum += it.commission_value;
      else if (it.valor_comissao !== undefined) itemsCommSum += it.valor_comissao;
      else itemsCommSum += ((it.price || it.valor || it.itemValue || 0) * 0.5);
    });

    const finalComm = explicitComm !== undefined ? Number(explicitComm) : (itemsCommSum > 0 ? itemsCommSum : total * 0.5);

    totalCommGeral += finalComm;
    if (status === 'fechada' || status === 'paga' || status === 'pago' || status === 'concluido') {
      totalCommFechada += finalComm;
    } else {
      totalCommAberta += finalComm;
    }

    console.log(`[CMD #${String(i+1).padStart(2, '0')}] Data: ${d} | ID: ${c.id} | Status: ${status} | Total Cmd: R$ ${total.toFixed(2)} | Comissão Calc: R$ ${finalComm.toFixed(2)} | Cliente: "${c.client_name || c.cliente_nome}"`);
  });

  console.log("\n=======================================================================");
  console.log(`SOMA COMISSÃO COMANDAS FECHADAS/PAGAS: R$ ${totalCommFechada.toFixed(2)}`);
  console.log(`SOMA COMISSÃO COMANDAS ABERTAS/NÃO PAGAS: R$ ${totalCommAberta.toFixed(2)}`);
  console.log(`SOMA TOTAL GERAL COMANDAS: R$ ${totalCommGeral.toFixed(2)}`);
  console.log("=======================================================================");
}

inspectComandasDirect();
