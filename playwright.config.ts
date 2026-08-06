import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Playwright arranca fuera de Next: nadie mas carga `.env` por el.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  // El bundle del blueprint trae una copia de este archivo bajo
  // `blueprints/rutas-transporte-personal/workspace/`. Sin esta exclusion
  // Playwright encuentra un segundo config raiz al recorrer el arbol.
  testIgnore: ['**/node_modules/**', 'blueprints/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  },
  projects: [
    {
      // El monitor en vivo se disena primero a 375px. El proyecto movil corre
      // primero a proposito: si el diseno se rompe, se rompe aqui.
      name: 'movil-375',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'pnpm --filter @rutas/web dev --port 3000',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
