import * as fs from 'fs';

function checkKeys() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  console.log("Keys in full_forensic_data.json:", Object.keys(fullData));
  if (Array.isArray(fullData)) {
    console.log("It is an array of length", fullData.length);
  }
}

checkKeys();
