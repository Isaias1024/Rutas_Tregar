const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Mismo patron que apps/web/next.config.ts: Metro solo carga `.env*` desde esta
// app, y sin esto `expo start` arranca sin ninguna `EXPO_PUBLIC_*`.
const envRaiz = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envRaiz)) {
  process.loadEnvFile(envRaiz);
}

const raizMonorepo = path.resolve(__dirname, '../..');

const config = getDefaultConfig(__dirname);

// Se AGREGA a los defaults, no los reemplaza: pisarlos es lo que reclama
// `expo-doctor`.

// Vigila solo `packages/shared`, nunca la raiz del monorepo: en Windows el
// watcher no termina de indexarla y tumba a `react-native-css-interop`.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(raizMonorepo, 'packages/shared'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(raizMonorepo, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './src/global.css' });
