import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Validacion que DEGRADA POR PASO (`BUILD_STEP`) y unico lugar que lee
 * `process.env`: Next solo busca `.env` en apps/web y sus workers no lo recargan.
 */
const ENV_RAIZ = path.resolve(process.cwd(), '../../.env');
if (existsSync(ENV_RAIZ)) {
  process.loadEnvFile(ENV_RAIZ);
}

const ESPECIFICACION = [
  { clave: 'APP_TIMEZONE', desdePaso: 1 },
  { clave: 'LOG_LEVEL', desdePaso: 1 },
  { clave: 'DATABASE_URL', desdePaso: 2 },
  { clave: 'DIRECT_DATABASE_URL', desdePaso: 2 },
  { clave: 'NEXT_PUBLIC_SUPABASE_URL', desdePaso: 3 },
  { clave: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desdePaso: 3 },
  { clave: 'SUPABASE_SERVICE_ROLE_KEY', desdePaso: 3 },
  { clave: 'GOOGLE_OAUTH_ALLOWED_DOMAIN', desdePaso: 3 },
  { clave: 'E2E_BASE_URL', desdePaso: 5 },
  // `desdePaso: 6` documenta desde cuando se pide en un despliegue real, pero
  // nunca se exige aqui: sin ella la parada degrada a captura manual.
  { clave: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', desdePaso: 6 },
  { clave: 'EXPO_PUBLIC_SUPABASE_URL', desdePaso: 8 },
  { clave: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', desdePaso: 8 },
  { clave: 'WORKER_PORT', desdePaso: 13 },
  { clave: 'WORKER_BASE_URL', desdePaso: 13 },
  { clave: 'WORKER_SHARED_SECRET', desdePaso: 13 },
  { clave: 'EXPO_ACCESS_TOKEN', desdePaso: 14 },
  // La lee la app, no el panel: `pnpm build` es la compuerta que confirma que el
  // `.env` del proyecto entero esta completo, no solo lo que este proceso importa.
  { clave: 'EXPO_PUBLIC_PANEL_BASE_URL', desdePaso: 14 },
  // La lee el worker, no el panel, pero se valida aqui por la misma razon.
  { clave: 'PANEL_BASE_URL', desdePaso: 15 },
] as const;

type Clave = (typeof ESPECIFICACION)[number]['clave'];

// La unica variable requerida en la documentacion que este modulo nunca exige:
// su paso de origen pide degradar a captura manual en vez de fallar.
const CLAVES_OPCIONALES = new Set<Clave>(['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']);

const esquemaCrudo = z.object(
  Object.fromEntries(ESPECIFICACION.map(({ clave }) => [clave, z.string().optional()])) as Record<
    Clave,
    z.ZodOptional<z.ZodString>
  >,
);

function construirEnv(buildStep: number, entorno: NodeJS.ProcessEnv) {
  const crudo = esquemaCrudo.parse(entorno);

  const faltantes = ESPECIFICACION.filter(
    ({ clave, desdePaso }) =>
      !CLAVES_OPCIONALES.has(clave) && buildStep >= desdePaso && !crudo[clave],
  ).map(({ clave }) => clave);

  if (faltantes.length > 0) {
    throw new Error(
      `apps/web/src/lib/env.ts: faltan variables de entorno requeridas desde BUILD_STEP=${buildStep}: ${faltantes.join(', ')}`,
    );
  }

  return crudo as Record<Clave, string | undefined>;
}

const buildStep = Number.parseInt(process.env.BUILD_STEP ?? '99', 10);

export const env = construirEnv(Number.isNaN(buildStep) ? 99 : buildStep, process.env);
