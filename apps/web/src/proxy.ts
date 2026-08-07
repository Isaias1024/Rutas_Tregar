// `@/lib/env` importa primero A PROPOSITO: su carga de `.env` tiene que
// correr antes de que `@rutas/shared/db` evalue su propio
// `process.env.DATABASE_URL` al importarse (mismo peligro que en invitacion.ts).
import { env } from '@/lib/env';
import { db, usuario } from '@rutas/shared/db';
import { createServerClient } from '@supabase/ssr';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

// En Next 16 el archivo se llama `proxy.ts`, no `middleware.ts`: el nombre
// viejo ya no se ejecuta y deja el panel abierto sin error visible. Proxy
// corre en el runtime de Node por default desde v16, por eso puede consultar
// Postgres directo aqui igual que un server component.

const RUTAS_PUBLICAS = ['/login', '/auth/callback'];
const PREFIJOS_ADMIN = ['/catalogos', '/rutas', '/paradas', '/bitacora'];
const PREFIJOS_SUPERVISOR_ADMIN = ['/monitor', '/planeador', '/reportes'];

function coincide(pathname: string, prefijos: string[]): boolean {
  return prefijos.some((prefijo) => pathname === prefijo || pathname.startsWith(`${prefijo}/`));
}

function respuestaNoAutorizado(mensaje: string) {
  return NextResponse.json(
    { ok: false, error: { codigo: 'no_autorizado', mensaje } },
    { status: 403 },
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (coincide(pathname, RUTAS_PUBLICAS)) {
    return NextResponse.next();
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

  if (coincide(pathname, PREFIJOS_ADMIN) && fila.rol !== 'admin') {
    return respuestaNoAutorizado('Esta seccion es solo para administradores.');
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
};
