import * as fs from 'fs';

function inspectUsersInJson() {
  const fullData = JSON.parse(fs.readFileSync('./full_forensic_data.json', 'utf8') || '{}');
  const usuarios = fullData.usuarios || [];
  console.log("=== USUÁRIOS NO FULL_FORENSIC_DATA.JSON ===");
  usuarios.forEach((u: any) => {
    console.log(`ID: ${u.id || u.uid} | Nome: "${u.nome || u.name}" | Email: "${u.email}" | Role: "${u.role || u.cargo}" | Status: ${u.status || u.ativo}`);
  });
}

inspectUsersInJson();
