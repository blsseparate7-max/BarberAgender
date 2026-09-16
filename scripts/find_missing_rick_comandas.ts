import * as fs from 'fs';

function findMissingComandas() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3';

  console.log("=====================================================================");
  console.log("BUSCA EXAUSTIVA DE COMANDAS PARA LUIZ HENRIQUE / RICK (01/09 A 14/09)");
  console.log("=====================================================================\n");

  // 1. Check ALL comandas collection
  const comandas = fullData.comandas || [];
  console.log(`Total comandas no banco: ${comandas.length}`);

  let rickComandas: any[] = [];
  let allSeptComandas: any[] = [];

  comandas.forEach((c: any) => {
    const createdStr = c.created_at || c.createdAt || c.data || c.date || '';
    const dateOnly = (createdStr.seconds ? new Date(createdStr.seconds * 1000).toISOString() : createdStr).substring(0, 10);
    
    // Check if in Sept 1-14
    if (dateOnly >= '2026-09-01' && dateOnly <= '2026-09-14') {
      allSeptComandas.push({ ...c, dateOnly });
    }

    // Check if Rick was professional
    const profId = c.barber_id || c.profissional_id || c.barbeiro_id || '';
    const profName = (c.barber_name || c.profissional_name || c.barbeiro_nome || '').toLowerCase();
    const clientName = (c.cliente_nome || c.cliente_name || c.client_name || '').toLowerCase();
    const notes = (c.observacoes || c.notes || '').toLowerCase();

    const isRick = profId === rickUid || 
                   profName.includes('rick') || profName.includes('luiz henrique') ||
                   notes.includes('rick') || notes.includes('luiz henrique');

    if (isRick && dateOnly >= '2026-09-01' && dateOnly <= '2026-09-14') {
      rickComandas.push({ ...c, dateOnly });
    }
  });

  console.log(`Comandas do Rick em Setembro (01-14): ${rickComandas.length}`);

  // 2. Check items inside ALL September comandas
  console.log("\n--- ANALISANDO ITENS DE TODAS AS COMANDAS DE SETEMBRO (01-14) ---");
  let itemsCommissionTotal = 0;
  let itemsFaturamentoTotal = 0;

  allSeptComandas.forEach((c: any) => {
    const cDate = c.dateOnly;
    const cBarberId = c.barber_id || c.profissional_id;
    const cBarberName = c.barber_name || c.profissional_name || '';
    const items = c.items || c.itens || [];

    items.forEach((item: any, idx: number) => {
      const itemProfId = item.profissional_id || item.barber_id || cBarberId;
      const itemProfName = item.profissional_name || item.barber_name || cBarberName;
      const itemName = item.nome || item.name || item.description || 'Serviço/Produto';
      const itemPrice = item.preco || item.price || item.valor || item.value || 0;
      const itemCommPct = item.percentualComissao !== undefined ? item.percentualComissao : (c.commission_rate || 50);
      const itemCommVal = item.valorComissao !== undefined ? item.valorComissao : (itemPrice * itemCommPct / 100);

      const isItemRick = itemProfId === rickUid || 
                         (itemProfName && (itemProfName.toLowerCase().includes('rick') || itemProfName.toLowerCase().includes('luiz henrique')));

      if (isItemRick) {
        itemsFaturamentoTotal += itemPrice;
        itemsCommissionTotal += itemCommVal;
        console.log(`[ITEM RICK] Data: ${cDate} | Comanda #${c.numero || c.code || c.id} | Item: "${itemName}" | Preço: R$ ${itemPrice} | Comipct: ${itemCommPct}% | Comiss: R$ ${itemCommVal.toFixed(2)} | Status Comanda: ${c.status}`);
      }
    });
  });

  console.log(`\nTotal Faturamento em Itens: R$ ${itemsFaturamentoTotal.toFixed(2)}`);
  console.log(`Total Comissão em Itens: R$ ${itemsCommissionTotal.toFixed(2)}`);

  // 3. Check appointments collection
  const appointments = fullData.appointments || [];
  console.log(`\n--- ANALISANDO APPOINTMENTS (AGENDAMENTOS) (01-14 SEPT) ---`);
  appointments.forEach((a: any) => {
    const aDate = (a.data || a.date || '').substring(0, 10);
    if (aDate >= '2026-09-01' && aDate <= '2026-09-14') {
      const aProfId = a.barber_id || a.profissional_id;
      const aProfName = (a.barber_name || a.profissional_name || '').toLowerCase();
      if (aProfId === rickUid || aProfName.includes('rick') || aProfName.includes('luiz henrique')) {
        console.log(`Agendamento: Data ${aDate} | Cliente: ${a.cliente_nome || a.client_name} | Serviço: ${a.servico_nome || a.service_name} | Valor: R$ ${a.valor || a.price} | Status: ${a.status}`);
      }
    }
  });

  // 4. Check ALL September financial_transactions to see if any transaction was attributed to another barber or unassigned!
  console.log(`\n--- ANALISANDO TODAS AS TRANSAÇÕES FINANCEIRAS DE SETEMBRO (01-14 SEPT) ---`);
  const txs = fullData.financial_transactions || [];
  txs.forEach((t: any) => {
    const tDate = (t.date || '').substring(0, 10);
    if (tDate >= '2026-09-01' && tDate <= '2026-09-14') {
      const desc = (t.description || '').toLowerCase();
      const profId = t.profissional_id;
      const profName = (t.profissional_name || '').toLowerCase();
      
      // If description mentions Rick or Luiz Henrique but profId is NOT Rick
      if ((desc.includes('rick') || desc.includes('luiz henrique')) && profId !== rickUid) {
        console.log(`⚠️ TRANSAÇÃO COM NOME DO RICK MAS PROF_ID DIFERENTE: Data: ${tDate} | Desc: "${t.description}" | ProfID: ${profId} | ProfNome: "${t.profissional_name}" | Valor: R$ ${t.amount}`);
      }
    }
  });

}

findMissingComandas();
