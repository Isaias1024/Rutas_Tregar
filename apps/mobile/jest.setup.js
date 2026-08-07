const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

// Jest no arranca via Expo/Metro, asi que nada carga `.env` por el. Mismo
// necesidad que metro.config.js, next.config.ts y vitest.config.ts, pero
// `process.loadEnvFile` resulto poco confiable bajo los workers de Jest
// (se observo cargar en un worker y no en otro para el mismo archivo), asi
// que aqui se parsea a mano — sin dependencias, un archivo `.env` simple de
// `CLAVE=valor` por linea.
const envRaiz = path.resolve(__dirname, '../../.env');
if (existsSync(envRaiz)) {
  const contenido = readFileSync(envRaiz, 'utf-8');
  for (const linea of contenido.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) {
      continue;
    }
    const indice = limpia.indexOf('=');
    if (indice === -1) {
      continue;
    }
    const clave = limpia.slice(0, indice).trim();
    let valor = limpia.slice(indice + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) {
      process.env[clave] = valor;
    }
  }
}
