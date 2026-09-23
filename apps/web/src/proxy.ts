// `@/lib/env` importa primero A PROPOSITO: su carga de `.env` corre antes de
// que `@rutas/shared/db` lea DATABASE_URL (mismo peligro que en invitacion.ts).
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { db, usuario } from '@rutas/shared/db';
import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

// En Next 16 el archivo se llama `proxy.ts`: con el nombre viejo no se ejecuta
// nada y el panel queda abierto sin error visible.

// No son publicas: son las rutas que traen su propia autenticacion. La app
// movil usa Bearer token, y el consentimiento lo abre un chofer sin sesion de panel.
const RUTAS_PUBLICAS = [
  '/login',
  '/auth/callback',
  '/api/dispositivos',
  '/privacidad',
  '/consentimiento',
];
// `/api/reportes` no cae bajo el prefijo `/reportes`: sin esta entrada cualquier
// usuario autenticado, incluido un chofer, podria descargar el CSV.
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

// Unica ruta que acepta el secreto del worker en vez de cookies: Chromium
// headless no trae sesion y esta es la pagina que imprime a PDF.
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

/** Comparacion en tiempo constante; el worker tiene su propia copia a proposito. */
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
    // de supervisor/admin por cookies.
  }

  // Proxy no tiene acceso a `next/headers`: las cookies se leen y escriben sobre
  // request/response, el patron que documenta @supabase/ssr.
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

  // El login por contrasena deja `debe_cambiar_password` en true: no hay paso
  // de la pantalla hasta cambiarla, misma compuerta que usa la app movil.
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

// `public/` queda fuera: el optimizador de imagenes se pide el archivo sin la
// cookie, y con el redirect a /login `next/image` recibiria HTML.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|gif|webp|avif|svg|ico)$).*)',
  ],
};
