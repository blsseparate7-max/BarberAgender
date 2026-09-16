import * as fs from 'fs';

const content = fs.readFileSync('./src/pages/Financeiro.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.toLowerCase().includes('comiss') || line.toLowerCase().includes('apura')) {
    console.log(`Line ${index + 1}: ${line}`);
  }
});
