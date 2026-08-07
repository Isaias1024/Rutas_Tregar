const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Mismo patron que apps/web/next.config.ts: Expo/Metro solo carga `.env*`
// desde la raiz de esta app, pero el unico `.env` del monorepo vive en la
// raiz del workspace. Sin esto, `expo start` arranca sin ninguna variable
// `EXPO_PUBLIC_*` y el cliente de Supabase no tiene URL ni llave.
const envRaiz = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envRaiz)) {
  process.loadEnvFile(envRaiz);
}

const raizMonorepo = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

// Configuracion de monorepo: Metro tiene que vigilar la raiz del workspace
// (paquetes hermanos como @rutas/shared) y saber buscar dependencias tanto
// en el node_modules local como en el de la raiz (pnpm los deja en los dos
// niveles segun el hoisting).
config.watchFolders = [raizMonorepo];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(raizMonorepo, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
