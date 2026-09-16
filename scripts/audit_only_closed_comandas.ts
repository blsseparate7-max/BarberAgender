import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

console.log('========================================================================');
console.log('🔍 AUDITORIA: APENAS COMANDAS COM STATUS "FECHADA" / "FINALIZADA"');
console.log('Período: 01/09/2026 a 15/09/2026 | Apenas Profissionais Ativos');
console.log('========================================================================\n');

const activePros = [
  { name: 'Gabriel Alexandre', uid: 'tsguxbUDoJMINJrgh3Z1SviVPUA2', rate: 50 },
  { name: 'Mateus Alexandre da Silva', uid: 'K2TXxyN75MZj4s6euPw2POZLNbt2', rate: 60 },
  { name: 'Luiz Henrique Francisco', uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', rate: 50 },
  { name: 'Moises Bueno', uid: 'XpDGfA241JOx7dzoAgKugo86ld62', rate: 50 },
  { name: 'Luiz Miguel Marciano dos Santos', uid: '317sdImqlYYfxbnsh3X6c34Cdm83', rate: 45 }
];

activePros.forEach(p => {
  const proData = data.find((d: any) => d.uid === p.uid);
  if (!proData) return;

  const todosItensSetembro = (proData.itensDetalhados || []).filter((it: any) => {
    const d = (it.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  // FILTRO ESTRITO: Apenas comandas FECHADAS/FINALIZADAS
  const itensFechados = todosItensSetembro.filter((it: any) => {
    const st = (it.comandaStatus || '').toLowerCase();
    return st === 'fechada' || st === 'finalizada' || st === 'concluida' || st === 'pago';
  });

  const itensAbertos = todosItensSetembro.filter((it: any) => {
    const st = (it.comandaStatus || '').toLowerCase();
    return st !== 'fechada' && st !== 'finalizada' && st !== 'concluida' && st !== 'pago';
  });

  const brutoFechado = itensFechados.reduce((acc: number, it: any) => acc + (it.itemPrice || 0), 0);
  const commFechada = itensFechados.reduce((acc: number, it: any) => acc + (it.itemCommVal || 0), 0);

  const brutoAberto = itensAbertos.reduce((acc: number, it: any) => acc + (it.itemPrice || 0), 0);
  const commAberta = itensAbertos.reduce((acc: number, it: any) => acc + (it.itemCommVal || 0), 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`💈 PROFISSIONAL: ${p.name.toUpperCase()}`);
  console.log(`   • Total de Comandas Registradas: ${todosItensSetembro.length}`);
  console.log(`\n   ✅ COMANDAS REALMENTE FECHADAS / FINALIZADAS:`);
  console.log(`      • Quantidade: ${itensFechados.length} atendimentos`);
  console.log(`      • Produção Bruta Fechada: R$ ${brutoFechado.toFixed(2)}`);
  console.log(`      • Comissão Fechada a Receber: R$ ${commFechada.toFixed(2)}`);

  if (itensAbertos.length > 0) {
    console.log(`\n   ⏳ COMANDAS AINDA ABERTAS / NÃO FINALIZADAS:`);
    console.log(`      • Quantidade: ${itensAbertos.length} atendimentos`);
    console.log(`      • Produção em Aberto: R$ ${brutoAberto.toFixed(2)}`);
    console.log(`      • Comissão em Aberto: R$ ${commAberta.toFixed(2)}`);
    console.log(`      • Detalhe das comanda abertas:`);
    itensAbertos.forEach((it: any) => {
      console.log(`        - Comanda #${it.comandaNumber} (${it.date}): ${it.itemName} (R$ ${it.itemPrice.toFixed(2)}) - Status: [${it.comandaStatus}]`);
    });
  } else {
    console.log(`\n   ✨ Nenhuma comanda aberta pendente.`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
