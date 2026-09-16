import * as fs from 'fs';

function findRickMissingComanda() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const txs = fullData.financial_transactions || [];
  const septTxs = txs.filter((t: any) => {
    const d = (t.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-14';
  });

  console.log("=== BUSCANDO TRANSAÇÕES / COMANDAS DE SETEMBRO QUE PODEM SER DO RICK ===\n");

  // Let's list all transactions in Sept 05, 06, 10, 11, 14 or any transaction with amount near 79.10 or 39.55 or 35 + 44.10, or assigned to Luiz Miguel or SEM_ID!
  septTxs.forEach((t: any) => {
    const d = (t.date || '').substring(0, 10);
    const desc = t.description || '';
    const profName = t.profissional_name || '';
    const profId = t.profissional_id;
    const isVale = desc.toLowerCase().includes('vale');

    if (!isVale) {
      console.log(`Data: ${d} | ID: ${t.id} | Desc: "${desc}" | Valor: R$ ${t.amount} | Prof: "${profName}" (ID: ${profId}) | Cliente: "${t.cliente_name || ''}"`);
    }
  });

  console.log("\n=== VERIFICANDO TRANSAÇÕES SEM PROFISSIONAL ID OU COM NOME SEMELHANTE ===");
  septTxs.filter((t: any) => !t.description.toLowerCase().includes('vale')).forEach((t: any) => {
    if (!t.profissional_id || t.profissional_id === 'SEM_ID') {
      console.log(`SEM PROFISSIONAL -> Data: ${t.date} | Valor: R$ ${t.amount} | Desc: "${t.description}"`);
    }
  });
}

findRickMissingComanda();
