import * as fs from 'fs';

const forensic = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));
const advs = forensic.professional_advances || [];

console.log(`TOTAL DE ADVANCES: ${advs.length}\n`);
advs.forEach((a: any) => {
  console.log(JSON.stringify(a, null, 2));
});
