import { db, usuario } from '@rutas/shared/db';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import type { BrowserContext } from '@playwright/test';
import { eq } from 'drizzle-orm';

// El login real del panel es OAuth de Google, no automatizable en e2e sin
// credenciales reales. En su lugar, esto crea (o reutiliza) un usuario de
// prueba con contrasena conocida, inicia sesion con el cliente anon —
// exactamente el mismo mecanismo que usa Supabase Auth — y replica la cookie
// que @supabase/ssr deja para que `proxy.ts` la lea igual que en produccion.
// El formato (nombre `sb-<host>-auth-token`, prefijo `base64-`, particion a
// los 3180 bytes) sale de `@supabase/ssr/dist/module/cookies.js` y
// `utils/chunker.js`.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('tests/e2e/ayuda-sesion.ts: faltan variables de Supabase en .env.');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD_PRUEBA = 'E2E-password-12345';

async function asegurarUsuarioDePrueba(
  correo: string,
  credencial: string,
  rol: 'admin' | 'supervisor',
): Promise<string> {
  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers();
  if (errorLista) {
    throw new Error(`No se pudo listar usuarios de Auth: ${errorLista.message}`);
  }
  let usuarioAuth = lista.users.find((u) => u.email === correo);

  if (!usuarioAuth) {
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: PASSWORD_PRUEBA,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear el usuario de prueba "${correo}": ${error?.message}`);
    }
    usuarioAuth = data.user;
  } else {
    await admin.auth.admin.updateUserById(usuarioAuth.id, { password: PASSWORD_PRUEBA });
  }

  const [fila] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.id, usuarioAuth.id))
    .limit(1);
  if (fila) {
    await db
      .update(usuario)
      .set({ activo: true, deletedAt: null, rol })
      .where(eq(usuario.id, usuarioAuth.id));
  } else {
    await db.insert(usuario).values({
      id: usuarioAuth.id,
      credencial,
      rol,
      correo,
      activo: true,
      debeCambiarPassword: false,
    });
  }

  return usuarioAuth.id;
}

function nombreCookieSesion(): string {
  const hostname = new URL(supabaseUrl as string).hostname;
  return `sb-${hostname.split('.')[0]}-auth-token`;
}

const LIMITE_CHUNK = 3180;

function construirCookies(sesion: Session, dominio: string) {
  const crudo = JSON.stringify(sesion);
  const codificado = `base64-${Buffer.from(crudo, 'utf-8').toString('base64url')}`;
  const nombre = nombreCookieSesion();

  const partes: Array<{ name: string; value: string }> =
    encodeURIComponent(codificado).length <= LIMITE_CHUNK
      ? [{ name: nombre, value: codificado }]
      : Array.from({ length: Math.ceil(codificado.length / LIMITE_CHUNK) }, (_, i) => ({
          name: `${nombre}.${i}`,
          value: codificado.slice(i * LIMITE_CHUNK, (i + 1) * LIMITE_CHUNK),
        }));

  return partes.map(({ name, value }) => ({
    name,
    value,
    domain: dominio,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
    secure: false,
  }));
}

export async function iniciarSesionComo(
  context: BrowserContext,
  rol: 'admin' | 'supervisor',
  baseURL: string,
): Promise<void> {
  const correo = rol === 'admin' ? 'e2e-admin@example.com' : 'e2e-supervisor@example.com';

  await asegurarUsuarioDePrueba(correo, `e2e-${rol}`, rol);

  const anon = createClient(supabaseUrl as string, anonKey as string);
  const { data, error } = await anon.auth.signInWithPassword({
    email: correo,
    password: PASSWORD_PRUEBA,
  });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesion como ${rol}: ${error?.message}`);
  }

  const dominio = new URL(baseURL).hostname;
  await context.addCookies(construirCookies(data.session, dominio));
}
