import * as fs from 'fs';

function checkFiles() {
  const files = fs.readdirSync('.');
  console.log("Files in root:", files.filter(f => f.endsWith('.json') || f.endsWith('.ts')));
}

checkFiles();
