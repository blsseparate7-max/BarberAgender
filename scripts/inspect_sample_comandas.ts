import * as fs from 'fs';

function inspectSampleComandas() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const comandas = fullData.comandas || [];
  console.log(`Total comandas array length: ${comandas.length}`);
  if (comandas.length > 0) {
    console.log("Sample comanda structure:", JSON.stringify(comandas[0], null, 2));
  }
}

inspectSampleComandas();
