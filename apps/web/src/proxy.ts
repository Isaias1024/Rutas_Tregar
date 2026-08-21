// `@/lib/env` importa primero A PROPOSITO: su carga de `.env` tiene que
// correr antes de que `@rutas/shared/db` evalue su propio
// `process.env.DATABASE_URL` al importarse (mismo peligro que en invitacion.ts).
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { db, usuario } from '@rutas/shared/db';
import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

// En Next 16 el archivo se llama `proxy.ts`, no `middleware.ts`: el nombre
// viejo ya no se ejecuta y deja el panel abierto sin error visible. Proxy
// corre en el runtime de Node por default desde v16, por eso puede consultar
// Postgres directo aqui igual que un server component.

// No son publicas en el sentido de "cualquiera pasa": son las rutas que el
// proxy no gatea con la sesion de cookies del panel porque tienen su propia
// autenticacion. POST /api/dispositivos (paso 14) la llama la app movil, que
// guarda su sesion en expo-secure-store, no en cookies del navegador — se
// autentica con un header `Authorization: Bearer <access_token>` que el
// route handler mismo valida contra Supabase.
// El aviso de privacidad y la pantalla de consentimiento (paso 16) las abre
// la app del chofer sin sesion del panel — un chofer no puede ni debe tener
// una.
const RUTAS_PUBLICAS = [
  '/login',
  '/auth/callback',
  '/api/dispositivos',
  '/privacidad',
  '/consentimiento',
];
// `/api/reportes` (el CSV en streaming) entra aqui igual que `/reportes`: no
// esta bajo el prefijo `/reportes` como string, asi que sin esta entrada
// cualquier usuario autenticado (incluido un chofer) podria descargarlo.
// Admin y supervisor comparten exactamente el mismo acceso de panel (la
// unica diferencia funcional entre ambos es 'crear_supervisor' en
// @/lib/authz/can, que no gatea ninguna ruta todavia): no existe ningun
// prefijo exclusivo de admin.
const PREFIJOS_SUPERVISOR_ADMIN = [
  '/monitor',
  '/planeador',
  '/reportes',
  '/api/reportes',
  '/catalogos',
  '/rutas',
  '/paradas',
  '/bitacora',
];

// Patron de la unica ruta que acepta el secreto del worker EN VEZ de una
// sesion de cookies (paso 15, §5): Chromium headless no trae sesion de
// navegador, y esta es la pagina que imprime a PDF.
const RUTA_IMPRIMIBLE = /^\/reportes\/cliente\/[^/]+\/imprimible$/;

function coincide(pathname: string, prefijos: string[]): boolean {
  return prefijos.some((prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`));
}

function respuestaNoAutorizado(mensaje: string) {
  return NextResponse.json(
    { ok: false, error: { codigo: 'no_autorizado', mensaje } },
    { status: 403 },
  );
}

/**
 * Comparacion en tiempo constante (igual que apps/worker/src/servidor.ts:
 * el mismo secreto compartido, otro proceso, sin un modulo comun entre panel
 * y worker para no acoplarlos por una funcion de tres lineas).
 */
function secretosCoinciden(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecibido.length !== bufEsperado.length) {
    timingSafeEqual(bufRecibido, bufRecibido);
    return false;
  }
  return timingSafeEqual(bufRecibido, bufEsperado);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (coincide(pathname, RUTAS_PUBLICAS)) {
    return NextResponse.next();
  }

  if (RUTA_IMPRIMIBLE.test(pathname)) {
    const secretoRecibido = request.headers.get('x-rutas-worker-secret');
    const secretoEsperado = env.WORKER_SHARED_SECRET;
    if (secretoRecibido && secretoEsperado && secretosCoinciden(secretoRecibido, secretoEsperado)) {
      return NextResponse.next();
    }
    // Sin secreto valido: sigue el flujo normal de abajo, que exige sesion
    // de supervisor/admin por cookies como cualquier otra pagina de /reportes.
  }

  // Proxy no tiene acceso a `next/headers` (eso es solo para render): las
  // cookies se leen y se escriben directo sobre request/response, que es el
  // patron que documenta @supabase/ssr para middleware.
  let respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirigirALogin = () => {
    const destino = new URL('/login', request.url);
    destino.searchParams.set('next', pathname);
    return NextResponse.redirect(destino);
  };

  if (!user) {
    return redirigirALogin();
  }

  const [fila] = await db.select().from(usuario).where(eq(usuario.id, user.id)).limit(1);

  if (!fila?.activo || fila.deletedAt !== null) {
    return redirigirALogin();
  }

  // El login por contrasena (crearSupervisor, y cualquier alta futura) deja
  // debe_cambiar_password en true: no hay paso de la pantalla hasta que se
  // cambie, misma compuerta que ya usa la app movil con sus choferes.
  if (fila.debeCambiarPassword && pathname !== '/cuenta') {
    return NextResponse.redirect(new URL('/cuenta', request.url));
  }

  if (
    coincide(pathname, PREFIJOS_SUPERVISOR_ADMIN) &&
    fila.rol !== 'admin' &&
    fila.rol !== 'supervisor'
  ) {
    return respuestaNoAutorizado('No tienes permiso para ver esta seccion.');
  }

  return respuesta;
}

// Los archivos estaticos de `public/` quedan fuera a proposito, ademas de las
// rutas internas de Next. El optimizador de imagenes se pide a si mismo el
// archivo original desde el servidor, sin la cookie de sesion: si el proxy lo
// contesta con el redirect a /login, `next/image` recibe HTML donde esperaba un
// JPEG y el logo de la barra lateral sale roto. Ninguno de estos archivos
// contiene datos de la operacion.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico)$).*)',
  ],
};
