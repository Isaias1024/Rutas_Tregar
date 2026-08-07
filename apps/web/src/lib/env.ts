import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Validacion de entorno del panel que DEGRADA POR PASO (§10, columna "Requerida
 * a partir del paso"). `BUILD_STEP` (default 99, es decir "build terminado")
 * decide cuales de estas variables son obligatorias hoy; el resto puede faltar
 * sin que el import lance. Nadie mas en el panel lee `process.env` directo.
 *
 * Next solo carga `.env*` desde la raiz de `apps/web`, pero el unico `.env`
 * del proyecto vive en la raiz del monorepo, y los workers que Next levanta
 * para recolectar datos de pagina no reevaluan `next.config.ts`. Por eso la
 * carga tiene que pasar por aqui — el mismo patron que usan drizzle.config.ts,
 * vitest.setup.ts y los scripts de `scripts/` con `process.loadEnvFile('.env')`.
 * Next (dev, build y cada worker) siempre corre con cwd = apps/web, asi que
 * la raiz del monorepo esta dos niveles arriba. Bajo Vitest, cwd ya es la
 * raiz (vitest.setup.ts corre primero y ya dejo `.env` cargado), asi que esta
 * ruta no existe ahi y el guard no hace nada. En produccion tampoco existe
 * este archivo: las variables llegan ya puestas por la plataforma.
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
  // `desdePaso: 6` documenta desde cuando §10 la pide en un despliegue real,
  // pero NUNCA se exige aqui (ver CLAVES_OPCIONALES abajo): el propio paso 6
  // pide que, sin ella, el formulario de parada degrade a captura manual de
  // coordenadas en vez de romper el build o la pantalla.
  { clave: 'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', desdePaso: 6 },
  { clave: 'EXPO_PUBLIC_SUPABASE_URL', desdePaso: 8 },
  { clave: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', desdePaso: 8 },
  { clave: 'WORKER_PORT', desdePaso: 13 },
  { clave: 'WORKER_BASE_URL', desdePaso: 13 },
  { clave: 'WORKER_SHARED_SECRET', desdePaso: 13 },
  { clave: 'EXPO_ACCESS_TOKEN', desdePaso: 14 },
] as const;

type Clave = (typeof ESPECIFICACION)[number]['clave'];

// La unica variable de la tabla que §10 documenta "requerida desde el paso N"
// sin que este modulo la exija nunca: su propio paso de origen (6) pide
// degradar a captura manual en vez de fallar cuando falta.
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
