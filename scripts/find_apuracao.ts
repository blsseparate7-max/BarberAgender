import * as fs from 'fs';
import * as path from 'path';

function searchFiles(dir: string, pattern: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        searchFiles(fullPath, pattern);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(pattern.toLowerCase())) {
        console.log(`Found "${pattern}" in ${fullPath}`);
      }
    }
  }
}

searchFiles('./src', 'apura');
