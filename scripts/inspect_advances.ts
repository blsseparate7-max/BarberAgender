import * as fs from 'fs';

function inspectAdvances() {
  const forensicData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8'));
  const advs = forensicData.professional_advances || [];
  const comms = forensicData.commissions || [];
  const usuarios = forensicData.usuarios || [];

  console.log("=== USUÁRIOS ===");
  usuarios.forEach((u: any) => console.log(`UID: ${u.uid || u.id} | Nome: ${u.nome} | Tipo: ${u.tipo}`));

  console.log("\n=== PROFESSIONAL ADVANCES (SETEMBRO 01 A 14) ===");
  const septAdvs = advs.filter((a: any) => {
    const d = (a.date || '').substring(0, 10);
    return d >= '2026-09-01' && d <= '2026-09-14';
  });

  septAdvs.forEach((a: any) => {
    console.log(`ID: ${a.id} | Date: ${a.date} | Amount: ${a.amount} | Status: ${a.status} | prof_id: ${a.profissional_id} | prof_name: ${a.profissional_name} | desc: "${a.description}" | notes: "${a.notes}" | supplier: "${a.supplier}"`);
  });
}

inspectAdvances();
