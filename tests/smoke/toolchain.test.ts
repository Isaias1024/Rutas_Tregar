import { afterEach, describe, expect, it, vi } from 'vitest';
import { semaforo } from '../../packages/shared/src/tokens.ts';

const ESTADOS_SEMAFORO = ['pendiente', 'en_curso', 'a_tiempo', 'tarde', 'adelantado'] as const;

describe('packages/shared/src/tokens.ts', () => {
  it('exporta los cinco estados del semaforo, cada uno con icono y texto no vacios', () => {
    expect(Object.keys(semaforo)).toHaveLength(5);
    for (const estado of ESTADOS_SEMAFORO) {
      expect(semaforo[estado].texto.length).toBeGreaterThan(0);
      expect(semaforo[estado].icono.length).toBeGreaterThan(0);
    }
  });
});

describe('apps/web/src/lib/env.ts', () => {
  const entornoOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...entornoOriginal };
  });

  it('BUILD_STEP=1 con solo DATABASE_URL y APP_TIMEZONE no lanza al importar', async () => {
    vi.resetModules();
    process.env = {
      ...entornoOriginal,
      BUILD_STEP: '1',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      APP_TIMEZONE: 'America/Mexico_City',
    };

    await expect(import('../../apps/web/src/lib/env.ts')).resolves.toBeDefined();
  });

  it('BUILD_STEP=14 sin EXPO_ACCESS_TOKEN lanza nombrando la variable ausente', async () => {
    vi.resetModules();
    process.env = {
      ...entornoOriginal,
      BUILD_STEP: '14',
      APP_TIMEZONE: 'America/Mexico_City',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      DIRECT_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.com',
      E2E_BASE_URL: 'http://127.0.0.1:3000',
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'clave',
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      WORKER_PORT: '8787',
      WORKER_BASE_URL: 'http://127.0.0.1:8787',
      WORKER_SHARED_SECRET: 'secreto',
      // EXPO_ACCESS_TOKEN falta a proposito.
    };

    await expect(import('../../apps/web/src/lib/env.ts')).rejects.toThrow('EXPO_ACCESS_TOKEN');
  });
});
