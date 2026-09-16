import * as fs from 'fs';

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

// Find Luiz Miguel's entry which contains the 28 vales
const luizEntry = reconstructed.find((r: any) => r.uid === '317sdImqlYYfxbnsh3X6c34Cdm83');
const vales = luizEntry?.valesLista || [];

console.log(`TOTAL DE VALES EM LUIZ MIGUEL: ${vales.length}`);

let sumAll = 0;
vales.forEach((v: any, i: number) => {
  sumAll += v.valor || 0;
  console.log(`${String(i+1).padStart(2, '0')}. ID: ${v.id.padEnd(22)} | Data: ${v.data} | R$ ${String(v.valor).padStart(7)} | Motivo: "${v.motivo || ''}" | Desc: "${v.description || ''}" | Notes: "${v.notes || ''}"`);
});

console.log(`\nSoma total de todos os 28 vales: R$ ${sumAll.toFixed(2)}`);
