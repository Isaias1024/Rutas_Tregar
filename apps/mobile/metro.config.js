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

// Configuracion de monorepo: Metro tiene que vigilar el paquete hermano
// @rutas/shared y saber buscar dependencias tanto en el node_modules local
// como en el de la raiz (pnpm los deja en los dos niveles segun el
// hoisting).
// Se AGREGA a los defaults, no los reemplaza: `getDefaultConfig` ya trae sus
// propias carpetas vigiladas y pisarlas es justo lo que reclama
// `expo-doctor` ("watchFolders does not contain all entries from Expo's
// defaults").
// Vigila solo `packages/shared`, NUNCA la raiz del monorepo completa: la raiz
// arrastra `apps/web` (Next.js + `.next`), `apps/worker` y el `node_modules`
// raiz hoisteado a Metro, y en Windows el watcher nativo se queda sin
// terminar de indexar todo eso dentro del timeout de metro-file-map
// ("Failed to start watch mode."), lo que deja el file-system interno sin
// inicializar y tumba a `react-native-css-interop` con
// "Cannot read properties of undefined (reading 'getSha1')".
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(raizMonorepo, 'packages/shared'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(raizMonorepo, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
