import { existsSync, readFileSync } from 'node:fs';

const files = [
  'src/App.tsx',
  'src/api.ts',
  'src/App.css',
  'src/index.css',
  'src/main.tsx',
  'src/vite-env.d.ts',
];

const forbidden = ['&lt;', '&gt;', '&amp;', '<br>', '<br/>', '<br />'];

let failed = false;

for (const filename of files) {
  if (!existsSync(filename)) continue;

  const content = readFileSync(filename, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    forbidden.forEach((token) => {
      if (line.includes(token)) {
        failed = true;
        console.error(`${filename}:${index + 1}: entidad HTML invalida "${token}"`);
        console.error(`  ${line.trim()}`);
      }
    });
  });

  if (
    filename.endsWith('.css') &&
    (content.includes("from 'react'") ||
      content.includes('from "react"') ||
      content.includes('useCallback') ||
      content.includes('export default function App'))
  ) {
    failed = true;
    console.error(`${filename}: contiene codigo React/TypeScript`);
  }
}

if (failed) {
  console.error('');
  console.error('La validacion del codigo fuente fallo.');
  process.exit(1);
}

console.log('Codigo fuente validado correctamente.');
