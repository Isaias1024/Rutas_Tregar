import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Punto de entrada ejecutable. En este paso hace exactamente dos cosas: con
// `--version` imprime la version y sale 0; con `serve` avisa que aun no esta
// implementado y sale 0. Es un stub a proposito — el paso 13 lo reemplaza con
// el servidor y el scheduler reales.

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

const comando = process.argv[2];

if (comando === '--version') {
  console.log(`rutas-worker ${pkg.version}`);
  process.exit(0);
} else if (comando === 'serve') {
  console.log('rutas-worker: serve aun no esta implementado');
  process.exit(0);
} else {
  console.log('Uso: rutas-worker --version | serve');
  process.exit(0);
}
