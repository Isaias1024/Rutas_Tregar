import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const raizMonorepo = `${import.meta.dirname}/../..`;

// Next solo carga `.env*` desde apps/web, pero el unico `.env` del proyecto vive
// en la raiz del monorepo; sin esta linea `next dev`/`build` arranca sin nada.
loadEnvConfig(raizMonorepo);

// `unsafe-eval` solo en `next dev`: Turbopack evalua RSC y HMR con `eval()`.
const esDesarrollo = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Permisiva para Google Maps: la lista de subdominios de Maps JS es larga y
  // cambiante, y romper el mapa en produccion no se notaria.
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''} https://maps.googleapis.com https://maps.gstatic.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  // Sin Supabase a proposito: ningun componente cliente abre su propio cliente,
  // todo pasa por el servidor. Quien agregue uno tendra que decidir el origen.
  `connect-src 'self' https://maps.googleapis.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Con Cloudflare Access/VPN descartados, sin esto el panel quedaba embebible:
  // clickjacking contra un admin sobre acciones como "Dar de baja".
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  transpilePackages: ['@rutas/shared'],
  outputFileTracingRoot: raizMonorepo,
  typedRoutes: true,
  // Next 16 responde 403 a los recursos de `next dev` fuera de `localhost`, y
  // todo el proyecto usa `127.0.0.1`: sin esto React nunca hidrata.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // El panel no usa camara, microfono ni geolocalizacion del navegador:
          // el GPS es exclusivo de la app movil nativa.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Defensa en profundidad sobre el HTTPS que Vercel ya fuerza; en HTTP
          // local el navegador lo ignora.
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
