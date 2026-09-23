const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

// Jest no arranca via Expo/Metro, asi que nada carga `.env`. Se parsea a mano
// porque `process.loadEnvFile` cargaba en unos workers de Jest y en otros no.
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

// El `performance` de las pruebas de React Native no trae `markResourceTiming`,
// que el fetch de `undici` llama para instrumentarse.
if (typeof performance !== 'undefined' && typeof performance.markResourceTiming !== 'function') {
  performance.markResourceTiming = () => {};
}
