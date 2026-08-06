import { z } from 'zod';

/**
 * Validacion de entorno del panel que DEGRADA POR PASO (§10, columna "Requerida
 * a partir del paso"). `BUILD_STEP` (default 99, es decir "build terminado")
 * decide cuales de estas variables son obligatorias hoy; el resto puede faltar
 * sin que el import lance. Nadie mas en el panel lee `process.env` directo.
 */

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
  { clave: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', desdePaso: 6 },
  { clave: 'EXPO_PUBLIC_SUPABASE_URL', desdePaso: 8 },
  { clave: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', desdePaso: 8 },
  { clave: 'WORKER_PORT', desdePaso: 13 },
  { clave: 'WORKER_BASE_URL', desdePaso: 13 },
  { clave: 'WORKER_SHARED_SECRET', desdePaso: 13 },
  { clave: 'EXPO_ACCESS_TOKEN', desdePaso: 14 },
] as const;

type Clave = (typeof ESPECIFICACION)[number]['clave'];

const esquemaCrudo = z.object(
  Object.fromEntries(ESPECIFICACION.map(({ clave }) => [clave, z.string().optional()])) as Record<
    Clave,
    z.ZodOptional<z.ZodString>
  >,
);

function construirEnv(buildStep: number, entorno: NodeJS.ProcessEnv) {
  const crudo = esquemaCrudo.parse(entorno);

  const faltantes = ESPECIFICACION.filter(
    ({ clave, desdePaso }) => buildStep >= desdePaso && !crudo[clave],
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
