import * as fs from 'fs';
import { calculateProfessionalLedger } from '../src/services/ledgerService';

function testLedgerOutput() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const barbers = fullData.usuarios || [];
  const comms = fullData.commissions || [];
  const advs = fullData.financial_transactions?.filter((t: any) => (t.description || '').toLowerCase().includes('vale')) || [];
  const comandas = fullData.comandas || [];

  console.log("=== LEDGER OUTPUT FOR ALL BARBERS (01/09 A 14/09) ===");

  barbers.forEach((barber: any) => {
    const res = calculateProfessionalLedger(
      barber,
      comms,
      advs,
      '2026-09-01',
      '2026-09-14',
      comandas,
      []
    );
    console.log(`\nBarbeiro: ${res.nome} (${res.email})`);
    console.log(`- Faturamento Bruto Mês: R$ ${res.faturamentoBrutoMes.toFixed(2)}`);
    console.log(`- Comissão Gerada Mês: R$ ${res.comissaoGeradaMes.toFixed(2)}`);
    console.log(`- Vales Pendentes: R$ ${res.valesPendentes.toFixed(2)}`);
    console.log(`- Saldo Pendente Líquido (A Receber): R$ ${res.saldoPendenteLiquido.toFixed(2)}`);
  });
}

testLedgerOutput();
