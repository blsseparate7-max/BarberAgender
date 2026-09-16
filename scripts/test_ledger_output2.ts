import * as fs from 'fs';
import { calculateProfessionalLedger } from '../src/services/ledgerService';

function testLedgerOutput2() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const usuarios = fullData.usuarios || [];
  const comms = fullData.commissions || [];
  const advs = fullData.financial_transactions?.filter((t: any) => (t.description || '').toLowerCase().includes('vale')) || [];
  const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8') || '[]');

  console.log(`Total usuarios in array: ${usuarios.length}`);

  // Map reconstructed items as commissions
  const reconstructedComms: any[] = [];
  reconstructed.forEach((r: any) => {
    (r.itensDetalhados || []).forEach((it: any) => {
      reconstructedComms.push({
        id: it.itemId || it.comandaId,
        profissional_id: r.uid,
        profissional_name: r.nome,
        date: it.date,
        commission_value: it.itemCommVal,
        base_value: (it.itemCommVal || 0) * 2,
        status: (it.comandaStatus === 'fechada' || it.comandaStatus === 'paga') ? 'pendente' : 'aberta'
      });
    });
  });

  usuarios.forEach((barber: any) => {
    const res = calculateProfessionalLedger(
      barber,
      reconstructedComms,
      advs,
      '2026-09-01',
      '2026-09-14',
      [],
      []
    );
    console.log(`\nBarbeiro: ${res.nome} (${res.email}) - UID: ${res.uid}`);
    console.log(`- Atendimentos Mês: ${res.totalAtendimentosMes}`);
    console.log(`- Faturamento Bruto Mês: R$ ${res.faturamentoBrutoMes.toFixed(2)}`);
    console.log(`- Comissão Gerada Mês: R$ ${res.comissaoGeradaMes.toFixed(2)}`);
    console.log(`- Vales Pendentes: R$ ${res.valesPendentes.toFixed(2)}`);
    console.log(`- Saldo Pendente Líquido (A Receber): R$ ${res.saldoPendenteLiquido.toFixed(2)}`);
  });
}

testLedgerOutput2();
