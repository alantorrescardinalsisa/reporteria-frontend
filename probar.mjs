import { readFileSync } from 'node:fs';

const API = 'https://reporteria-api.onrender.com';
const filePath = process.argv[2];

if (!filePath) {
  console.error('Uso: node probar.mjs ruta/al/archivo.xlsx');
  process.exit(1);
}

// 1) health
const health = await fetch(`${API}/health`);
console.log('HEALTH:', health.status, await health.json());

// 2) ingestar
const bytes = readFileSync(filePath);
const blob = new Blob([bytes], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const form = new FormData();
form.append('file', blob, filePath.split('/').pop());
form.append('uploaded_by', 'test-cli');

const res = await fetch(`${API}/ingestar`, { method: 'POST', body: form });
const text = await res.text();
console.log('INGESTAR:', res.status);
console.log(text);
