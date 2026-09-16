import * as fs from 'fs';

function checkBackupFiles() {
  const files = fs.readdirSync('.');
  const backupFiles = files.filter(f => f.includes('backup') || f.includes('forensic') || f.includes('json') || f.includes('dump'));
  console.log("Arquivos de backup/JSON encontrados no projeto:", backupFiles);
  backupFiles.forEach(f => {
    try {
      const stat = fs.statSync(f);
      console.log(`- ${f}: ${stat.size} bytes | Modificado em: ${stat.mtime}`);
    } catch(e) {}
  });
}

checkBackupFiles();
