import * as fs from 'fs';

function find3945() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const comandas = fullData.comandas || [];

  console.log("=== BUSCANDO TUDO QUE DÁ R$ 39,45 OU R$ 78,90 EM SETEMBRO (01-14) ===");

  comandas.forEach((c: any) => {
    const d = (c.created_at || c.createdAt || c.data || c.date || '').substring(0, 10);
    const total = c.total || c.valor_total || c.total_amount || 0;
    const comm = c.valor_comissao || c.commission_value || (total * 0.5);
    const status = c.status;

    if (Math.abs(comm - 39.45) < 0.1 || Math.abs(total - 78.90) < 0.1 || Math.abs(total - 39.45) < 0.1) {
      console.log(`ACHOU COMANDA! Data: ${d} | ID: ${c.id} | Total: ${total} | Comm: ${comm} | Status: ${status} | Barber: ${c.barber_name || c.barbeiro_nome}`);
    }
  });

  const txs = fullData.financial_transactions || [];
  txs.forEach((t: any) => {
    const amt = t.amount || 0;
    if (Math.abs(amt - 39.45) < 0.1 || Math.abs(amt - 78.90) < 0.1) {
      console.log(`ACHOU TRANSAÇÃO! Data: ${t.date} | ID: ${t.id} | Amt: ${amt} | Desc: "${t.description}" | Prof: ${t.profissional_name}`);
    }
  });
}

find3945();
