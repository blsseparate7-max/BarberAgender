import * as fs from 'fs';

const raw = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));
const cashMovements = raw.cash_movements || [];

console.log('Sample cash_movements docs:');
cashMovements.slice(0, 10).forEach((m: any) => {
  console.log(m);
});
