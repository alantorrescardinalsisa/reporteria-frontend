import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

function section(title) {
  console.log('');
  console.log('='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`);

  const result = spawnSync(
    command,
    args,
    {
      encoding: 'utf8',
      env: process.env,
      shell: process.platform === 'win32',
    },
  );

  if (result.stdout) {
    console.log(result.stdout);
  }

  if (result.stderr) {
    console.error(result.stderr);
  }

  console.log(
    `Código de salida: ${result.status}`,
  );

  return result.status ?? 1;
}

function showFile(filename) {
  if (!existsSync(filename)) {
    console.error(
      `FALTA ARCHIVO: ${filename}`,
    );
    return;
  }

  console.log(`ARCHIVO: ${filename}`);
  console.log(readFileSync(filename, 'utf8'));
}

section('INFORMACIÓN DEL ENTORNO');

console.log(`Node: ${process.version}`);
console.log(`Plataforma: ${process.platform}`);
console.log(`Arquitectura: ${process.arch}`);
console.log(
  `VITE_API_URL configurada: ${
    process.env.VITE_API_URL ? 'SÍ' : 'NO'
  }`,
);

section('VERSIONES INSTALADAS');

run('npm', [
  'exec',
  '--',
  'tsc',
  '--version',
]);

run('npm', [
  'exec',
  '--',
  'vite',
  '--version',
]);

section('ARCHIVOS DE CONFIGURACIÓN');

[
  'package.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'src/vite-env.d.ts',
].forEach(showFile);

section('ARCHIVOS CRÍTICOS');

[
  'src/App.tsx',
  'src/api.ts',
  'src/App.css',
  'src/main.tsx',
].forEach((filename) => {
  console.log(
    `${filename}: ${
      existsSync(filename)
        ? 'EXISTE'
        : 'NO EXISTE'
    }`,
  );
});

section('BÚSQUEDA DE ENTIDADES HTML CORRUPTAS');

const entitiesResult = run(
  'node',
  [
    '-e',
    `
      const fs = require('fs');
      const files = ['src/App.tsx', 'src/api.ts'];

      let found = false;

      for (const file of files) {
        if (!fs.existsSync(file)) {
          console.error('No existe: ' + file);
          found = true;
          continue;
        }

        const text = fs.readFileSync(file, 'utf8');
        const lines = text.split(/\\r?\\n/);

        lines.forEach((line, index) => {
          if (
            line.includes('&lt;') ||
            line.includes('&gt;') ||
            line.includes('&amp;') ||
            line.includes('<br>') ||
            line.includes('<br ') ||
            line.includes(')
          ) {
            found = true;
            console.error(
              file +
                 +
                ': ' +
                line.trim()
            );
          }
        });
      }

      if (found) {
        console.error(
          'Se detectaron posibles entidades HTML dentro del código.'
        );
        process.exit(1);
      }

      console.log(
        'No se detectaron entidades HTML sospechosas.'
      );
    `,
  ],
);

section('DIAGNÓSTICO TYPESCRIPT');

const typeScriptExit = run(
  'npm',
  [
    'exec',
    '--',
    'tsc',
    '-b',
    '--pretty',
    'false',
    '--verbose',
    '--force',
  ],
);

if (typeScriptExit !== 0) {
  section('RESULTADO FINAL');

  console.error(
    'FALLO EN TYPESCRIPT.',
  );

  console.error(
    'Busca arriba la primera línea con "error TS".',
  );

  process.exit(typeScriptExit);
}

section('DIAGNÓSTICO VITE');

const viteExit = run(
  'npm',
  [
    'exec',
    '--',
    'vite',
    'build',
    '--debug',
  ],
);

if (viteExit !== 0) {
  section('RESULTADO FINAL');

  console.error(
    'TYPESCRIPT FINALIZÓ CORRECTAMENTE.',
  );

  console.error(
    'EL FALLO ESTÁ EN VITE, ROLLUP, UN IMPORT O UN ASSET.',
  );

  process.exit(viteExit);
}

section('RESULTADO FINAL');

if (entitiesResult !== 0) {
  console.error(
    'El build terminó, pero se detectaron entidades HTML sospechosas.',
  );

  process.exit(entitiesResult);
}

console.log(
  'DIAGNÓSTICO COMPLETADO: TYPESCRIPT Y VITE FINALIZARON CORRECTAMENTE.',
);
