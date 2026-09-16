import * as fs from 'fs';

const raw = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));

console.log('=== FORENSIC AUDIT ANALYSIS ===\n');

console.log('1. SUMMARY OF COLLECTIONS:');
for (const [col, docs] of Object.entries(raw)) {
  console.log(`- Collection '${col}': ${(docs as any[]).length} documents`);
}

// 2. INSPECT USER MAP
console.log('\n2. USERS MAP (usuarios):');
const usuarios = raw.usuarios || [];
usuarios.forEach((u: any) => {
  console.log(`  UID: ${u.id.padEnd(28)} | Nome: ${(u.nome || u.name || '').padEnd(32)} | Email: ${(u.email || '').padEnd(35)} | Role: ${u.tipo || u.role} | Active: ${u.ativo}`);
});

// 3. INSPECT OTHER COLLECTIONS (cash_movements, bills, financial_transactions, caixa)
console.log('\n3. OTHER FINANCIAL COLLECTIONS:');
['cash_movements', 'bills', 'financial_transactions', 'caixa'].forEach(col => {
  const list = raw[col] || [];
  console.log(`\n--- ${col.toUpperCase()} (${list.length} docs) ---`);
  if (list.length === 0) {
    console.log('  (Empty collection)');
  } else {
    list.forEach((doc: any, i: number) => {
      console.log(`  [${i+1}] ID: ${doc.id} | Data/CreatedAt: ${doc.createdAt || doc.date || doc.data} | Valor: ${doc.amount || doc.valor || doc.value} | CreatedBy/User: ${doc.createdBy || doc.userId || doc.usuarioId} | Desc/Cat: ${doc.description || doc.descricao || doc.categoria || doc.type}`);
    });
  }
});

// 4. INSPECT ADVANCES (professional_advances) WITH DETAILED AUTHORSHIP & CREATEDBY
console.log('\n4. ADVANCES / VALES (professional_advances):');
const advances = raw.professional_advances || [];
advances.forEach((adv: any, i: number) => {
  const dStr = adv.data || adv.date || (adv.createdAt ? String(adv.createdAt).substring(0, 10) : 'N/A');
  console.log(`[#${String(i+1).padStart(2,'0')}] ID: ${adv.id.padEnd(20)} | Data: ${dStr} | Valor: R$ ${String(adv.valor).padStart(6)} | ProID: ${adv.profissional_id} | CreatedBy: ${adv.createdBy || adv.userId || 'N/A'} | CreatedAt: ${adv.createdAt || 'N/A'} | Desc: "${adv.descricao || adv.desc || adv.motivo || ''}"`);
});

// 5. INSPECT COMMISSIONS COLLECTION
console.log('\n5. COMMISSIONS COLLECTION (commissions):');
const comms = raw.commissions || [];
console.log(`Total commissions docs: ${comms.length}`);
comms.slice(0, 15).forEach((c: any, i: number) => {
  console.log(`  [${i+1}] ID: ${c.id} | ProID: ${c.profissional_id} | Valor: ${c.valor || c.amount} | Date/CreatedAt: ${c.createdAt || c.data} | Status: ${c.status}`);
});
