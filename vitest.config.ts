import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Vitest no arranca a traves de Next, asi que nada carga `.env` por el.
// `process.loadEnvFile` es nativo de Node 24 — sin dependencia extra y sin
// olvidarlo en algun sitio de llamada, porque vive en el config que siempre
// se evalua.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const raiz = fileURLToPath(new URL('.', import.meta.url));

/** Rutas que ningun proyecto de pruebas debe recorrer. */
const excluirSiempre = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.expo/**',
  '**/.turbo/**',
  // El bundle del blueprint vive dentro del proyecto y trae una copia de este
  // mismo archivo bajo `workspace/`. Sin esta linea vitest recolecta las pruebas
  // dos veces y descubre un segundo config raiz.
  'blueprints/**',
  // La app movil corre con jest-expo (`pnpm test:mobile`), no con vitest.
  'apps/mobile/**',
  // Playwright tiene su propio runner (`pnpm test:e2e`).
  'tests/e2e/**',
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'raiz',
          root: raiz,
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: excluirSiempre,
        },
      },
      {
        test: {
          name: 'shared',
          root: raiz,
          environment: 'node',
          include: ['packages/shared/src/**/*.test.ts'],
          exclude: excluirSiempre,
          setupFiles: ['./vitest.setup.ts'],
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
        resolve: {
          alias: {
            '@rutas/shared': `${raiz}packages/shared/src`,
          },
        },
      },
      {
        test: {
          name: 'web',
          root: raiz,
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts'],
          exclude: excluirSiempre,
          setupFiles: ['./vitest.setup.ts'],
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
        resolve: {
          // `@/` es el alias de Next dentro de apps/web. Vitest no hereda los
          // `paths` del tsconfig, asi que se repite aqui explicitamente.
          alias: {
            '@/': `${raiz}apps/web/src/`,
            '@rutas/shared': `${raiz}packages/shared/src`,
          },
        },
      },
      {
        test: {
          name: 'worker',
          root: raiz,
          environment: 'node',
          include: ['apps/worker/src/**/*.test.ts'],
          exclude: excluirSiempre,
          setupFiles: ['./vitest.setup.ts'],
          hookTimeout: 60_000,
          testTimeout: 60_000,
        },
        resolve: {
          alias: {
            '@rutas/shared': `${raiz}packages/shared/src`,
          },
        },
      },
    ],
  },
});
