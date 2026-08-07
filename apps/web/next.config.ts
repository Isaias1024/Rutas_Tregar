import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const raizMonorepo = `${import.meta.dirname}/../..`;

// Next solo carga `.env*` desde la raiz de ESTA app (apps/web) por convencion
// propia; el unico `.env` del proyecto vive en la raiz del monorepo — el
// mismo que cargan drizzle-kit, vitest y los scripts con
// `process.loadEnvFile('.env')`. Sin esta linea, `next dev`/`next build`
// arrancarian sin ninguna de esas variables, en el proceso principal y en
// cada worker que Next levanta para recolectar datos de pagina (ambos vuelven
// a evaluar este archivo).
loadEnvConfig(raizMonorepo);

const nextConfig: NextConfig = {
  transpilePackages: ['@rutas/shared'],
  outputFileTracingRoot: raizMonorepo,
  typedRoutes: true,
  // Next 16 bloquea con 403 los recursos de `next dev` cuando el navegador
  // entra por un origen que no sea `localhost`. Todo este proyecto usa
  // `127.0.0.1` a proposito (Supabase local, Playwright, `E2E_BASE_URL`), y
  // sin esto React nunca hidrata: el bundle del runtime se bloquea, ningun
  // manejador de clic se conecta, y cualquier prueba e2e se cuelga
  // esperando un dialogo que jamas abre.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
