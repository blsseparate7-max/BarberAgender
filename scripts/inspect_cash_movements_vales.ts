import * as fs from 'fs';

const raw = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));

const cashMovements = raw.cash_movements || [];

console.log('=== ANALYSING CASH_MOVEMENTS FOR VALES (01/09 TO 15/09) ===\n');

const valesFromCash = cashMovements.filter((m: any) => {
  const dStr = m.createdAt || m.date || m.data || '';
  const d = dStr.substring(0, 10);
  const desc = (m.description || m.descricao || '').toLowerCase();
  const cat = (m.categoria || m.category || '').toLowerCase();
  const type = (m.type || m.tipo || '').toLowerCase();

  return d >= '2026-09-01' && d <= '2026-09-15' && (desc.includes('vale') || cat.includes('vale') || desc.includes('adiantamento') || desc.includes('ret') || type === 'saida');
});

console.log(`Found ${valesFromCash.length} cash movement entries for vales/saidas in September:\n`);

valesFromCash.sort((a: any, b: any) => (a.createdAt || '').localeCompare(b.createdAt || ''));

valesFromCash.forEach((m: any, idx: number) => {
  console.log(`[#${String(idx+1).padStart(2,'0')}] ID: ${m.id.padEnd(20)} | Date: ${(m.createdAt || m.date || '').substring(0, 19)} | Amount: R$ ${String(m.amount || m.valor).padStart(7)} | Type: ${(m.type || m.tipo || '').padEnd(8)} | Desc: "${m.description || m.descricao}" | CreatedBy: ${m.createdBy || m.userId || 'N/A'}`);
});
