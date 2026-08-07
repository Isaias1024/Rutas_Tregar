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

// Auditoria de seguridad: el panel no tenia NINGUN encabezado de seguridad
// (§11 "Security Misconfiguration"). Con Cloudflare Access/VPN
// deliberadamente descartados (§2 del blueprint, compensado solo con
// `noindex` + limite de intentos + sesiones cortas), la falta de
// `X-Frame-Options`/`frame-ancestors` dejaba el panel embebible en un
// `<iframe>` de cualquier sitio — la superficie clasica de clickjacking
// contra un admin autenticado sobre acciones destructivas como "Dar de
// baja".
//
// Sin `connect-src` hacia Supabase a proposito: ningun componente cliente de
// este panel abre su propio cliente de Supabase (`grep -rl createClient
// apps/web/src --include=*.tsx` no encuentra nada) — toda la conexion pasa
// por el servidor (`crearClienteServidor()`), asi que el navegador nunca
// necesita hablarle directo. Si algun dia se agrega un cliente de Supabase
// del lado del navegador, esta linea se queda corta a proposito para
// forzar a quien lo agregue a decidir el origen explicito en ese momento.
//
// CSP deliberadamente permisiva en script/img/connect para Google Maps
// (paso 6: buscador de direccion + mapa en /paradas y /rutas) — la lista
// exacta de subdominios que la API de Maps JS necesita es larga y cambia
// entre versiones, y esta app no tiene forma de probarla en vivo contra una
// llave real en este entorno. Se prefiere una CSP real pero generosa en esas
// tres directivas a una estricta que se arriesgue a romper el mapa en
// produccion sin que nadie lo note hasta que un supervisor reporte que no
// puede dar de alta una parada. `frame-ancestors 'none'` (la proteccion que
// de verdad importaba aqui) no tiene ese riesgo: no depende de ningun
// recurso de terceros.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  `connect-src 'self' https://maps.googleapis.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // El panel no usa camara, microfono ni la geolocalizacion del
          // NAVEGADOR (el GPS es exclusivo de la app movil nativa, un
          // permiso de sistema operativo aparte, no de esta API web).
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Vercel fuerza HTTPS de por si; este encabezado es defensa en
          // profundidad explicita, y un navegador solo lo honra sobre una
          // conexion ya HTTPS, asi que no afecta `next dev` en HTTP local.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
