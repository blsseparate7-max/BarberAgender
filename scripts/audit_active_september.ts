import * as fs from 'fs';

const data = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

console.log('================================================================');
console.log('📊 AUDITORIA OFICIAL: APENAS PROFISSIONAIS ATIVOS (01/09 A 15/09)');
console.log('================================================================\n');

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

  const itensSetembro = (proData.itensDetalhados || []).filter((it: any) => {
    const d = (it.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const faturamentoBruto = itensSetembro.reduce((acc: number, it: any) => acc + (it.itemPrice || 0), 0);
  const comissaoGerada = itensSetembro.reduce((acc: number, it: any) => acc + (it.itemCommVal || 0), 0);

  // Group items by service name
  const servicosAgrupados: Record<string, { count: number, total: number }> = {};
  itensSetembro.forEach((it: any) => {
    const sName = it.itemName || 'Outros';
    if (!servicosAgrupados[sName]) servicosAgrupados[sName] = { count: 0, total: 0 };
    servicosAgrupados[sName].count++;
    servicosAgrupados[sName].total += it.itemPrice;
  });

  // Daily distribution
  const porDia: Record<string, { count: number, total: number, comm: number }> = {};
  itensSetembro.forEach((it: any) => {
    const d = (it.date || '').substring(0, 10);
    if (!porDia[d]) porDia[d] = { count: 0, total: 0, comm: 0 };
    porDia[d].count++;
    porDia[d].total += it.itemPrice;
    porDia[d].comm += it.itemCommVal;
  });

  // Vales
  const valesSetembro = (proData.valesLista || []).filter((v: any) => {
    const d = (v.data || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });
  const totalVales = valesSetembro.reduce((acc: number, v: any) => acc + (Number(v.valor) || 0), 0);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`💈 PROFISSIONAL ATIVO: ${p.name.toUpperCase()}`);
  console.log(`   • ID / UID: ${p.uid}`);
  console.log(`   • Comissão Padrão: ${p.rate}%`);
  console.log(`\n   🟢 ENTRADAS (PRODUÇÃO & ATENDIMENTOS DE 01/09 A 15/09):`);
  console.log(`      • Total de Atendimentos no período: ${itensSetembro.length} cortes/serviços`);
  console.log(`      • Faturamento Bruto Gerado: R$ ${faturamentoBruto.toFixed(2)}`);
  console.log(`      • Comissão Gerada: R$ ${comissaoGerada.toFixed(2)}`);
  console.log(`\n      📋 Serviços Realizados:`);
  Object.entries(servicosAgrupados).forEach(([s, v]) => {
    console.log(`         - ${s}: ${v.count}x (Total: R$ ${v.total.toFixed(2)})`);
  });

  console.log(`\n      📅 Produção Dia a Dia (Setembro):`);
  Object.entries(porDia).sort().forEach(([d, v]) => {
    console.log(`         - ${d.split('-').reverse().join('/')}: ${v.count} atendimentos | Bruto: R$ ${v.total.toFixed(2)} | Comissão: R$ ${v.comm.toFixed(2)}`);
  });

  console.log(`\n   🔴 SAÍDAS (VALES & ADIANTAMENTOS VINCULADOS A ESTE UID DE 01/09 A 15/09):`);
  console.log(`      • Quantidade de Vales: ${valesSetembro.length}`);
  console.log(`      • Total de Vales: R$ ${totalVales.toFixed(2)}`);
  if (valesSetembro.length > 0) {
    valesSetembro.forEach((v: any, idx: number) => {
      console.log(`         ${idx + 1}. Data: ${v.data.split('-').reverse().join('/')} | Valor: R$ ${Number(v.valor).toFixed(2)} | Motivo: ${v.desc}`);
    });
  } else {
    console.log(`         (Nenhum vale registrado com este UID no banco)`);
  }

  console.log(`\n   💰 RESUMO FINANCEIRO (SETEMBRO):`);
  console.log(`      • (+) Comissão Gerada: R$ ${comissaoGerada.toFixed(2)}`);
  console.log(`      • (-) Vales Vinculados ao UID: R$ ${totalVales.toFixed(2)}`);
  console.log(`      👉 SALDO LÍQUIDO NO BANCO: R$ ${(comissaoGerada - totalVales).toFixed(2)}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
