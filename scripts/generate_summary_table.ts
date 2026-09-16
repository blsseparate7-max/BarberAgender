import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

// Generate complete markdown report for the user
const activeList = [
  { name: 'Gabriel Alexandre', uid: 'tsguxbUDoJMINJrgh3Z1SviVPUA2', rate: 50 },
  { name: 'Mateus Alexandre da Silva', uid: 'K2TXxyN75MZj4s6euPw2POZLNbt2', rate: 60 },
  { name: 'Luiz Henrique Francisco', uid: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3', rate: 50 },
  { name: 'Moises Bueno', uid: 'XpDGfA241JOx7dzoAgKugo86ld62', rate: 50 },
  { name: 'Luiz Miguel Marciano dos Santos', uid: '317sdImqlYYfxbnsh3X6c34Cdm83', rate: 45 }
];

const summaryData: any[] = [];

activeList.forEach(p => {
  const pData = reconstructed.find((d: any) => d.uid === p.uid);
  if (!pData) return;

  const setItens = (pData.itensDetalhados || []).filter((it: any) => {
    const d = (it.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-15';
  });

  const fechadas = setItens.filter((it: any) => ['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase()));
  const abertas = setItens.filter((it: any) => !['fechada', 'finalizada', 'concluida', 'pago'].includes((it.comandaStatus || '').toLowerCase()));

  summaryData.push({
    name: p.name,
    uid: p.uid,
    rate: p.rate,
    totalCount: setItens.length,
    totalBruto: setItens.reduce((a: number, b: any) => a + b.itemPrice, 0),
    totalComm: setItens.reduce((a: number, b: any) => a + b.itemCommVal, 0),
    fechadasCount: fechadas.length,
    fechadasBruto: fechadas.reduce((a: number, b: any) => a + b.itemPrice, 0),
    fechadasComm: fechadas.reduce((a: number, b: any) => a + b.itemCommVal, 0),
    abertasCount: abertas.length,
    abertasBruto: abertas.reduce((a: number, b: any) => a + b.itemPrice, 0),
    abertasComm: abertas.reduce((a: number, b: any) => a + b.itemCommVal, 0)
  });
});

console.log('SUMMARY TABLE:');
console.log(JSON.stringify(summaryData, null, 2));
