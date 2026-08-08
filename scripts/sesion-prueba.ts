process.loadEnvFile('.env');

import { chromium } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, perfilPersonal, usuario } from '../packages/shared/src/db/index.ts';

/**
 * Abre el panel en un navegador con una sesion de prueba ya iniciada.
 *
 * Existe por una razon concreta: el unico login del panel es OAuth de Google
 * (`apps/web/src/app/(auth)/login/page.tsx`) y en local esta APAGADO a
 * proposito (`supabase/config.toml`, `[auth.external.google] enabled = false`,
 * porque las pruebas de invitacion usan el API de administracion y no
 * necesitan salir a internet). Sin este script no hay forma de entrar al
 * panel en una maquina de desarrollo sin dar de alta un cliente OAuth real
 * en Google Cloud.
 *
 * Hace exactamente lo mismo que `tests/e2e/ayuda-sesion.ts` — crea o reutiliza
 * un usuario con contrasena conocida, inicia sesion con el cliente anon y
 * replica la cookie que deja `@supabase/ssr` — solo que en vez de correr una
 * prueba deja el navegador abierto para probar a mano.
 *
 * SOLO PARA LOCAL. No hay ninguna ruta de produccion que lo invoque, y depende
 * de la service role key, que jamas sale del servidor.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    'scripts/sesion-prueba.ts: faltan variables de Supabase en .env. Corre `pnpm db:up && pnpm env:write` primero.',
  );
  process.exit(1);
}

const PASSWORD_PRUEBA = 'Prueba-local-12345';

function leerArgumento(bandera: string, porDefecto: string): string {
  const indice = process.argv.indexOf(bandera);
  const valor = indice === -1 ? undefined : process.argv[indice + 1];
  return valor ?? porDefecto;
}

const rolPedido = leerArgumento('--rol', 'admin');
if (rolPedido !== 'admin' && rolPedido !== 'supervisor') {
  console.error(`Rol invalido: "${rolPedido}". Usa --rol admin o --rol supervisor.`);
  process.exit(1);
}
const rol: 'admin' | 'supervisor' = rolPedido;
// El panel local siempre vive aqui (`pnpm dev` fija el puerto 3000). Si corre
// en otro lado se pasa con `--url`; no se lee PANEL_BASE_URL del entorno para
// no meter una variable mas a `globalEnv` de turbo.json por un script local.
const baseUrl = leerArgumento('--url', 'http://127.0.0.1:3000');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const correo = `prueba-${rol}@example.com`;
const credencial = `prueba-${rol}`;
const nombre = rol === 'admin' ? 'Admin de prueba' : 'Supervisor de prueba';

async function asegurarUsuario(): Promise<string> {
  const { data: lista, error: errorLista } = await admin.auth.admin.listUsers();
  if (errorLista) {
    throw new Error(`No se pudo listar usuarios de Auth: ${errorLista.message}`);
  }
  let usuarioAuth = lista.users.find((u) => u.email === correo);

  if (usuarioAuth) {
    await admin.auth.admin.updateUserById(usuarioAuth.id, { password: PASSWORD_PRUEBA });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: PASSWORD_PRUEBA,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear el usuario de prueba "${correo}": ${error?.message}`);
    }
    usuarioAuth = data.user;
  }

  const [fila] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.id, usuarioAuth.id))
    .limit(1);

  if (fila) {
    await db
      .update(usuario)
      .set({ rol, activo: true, deletedAt: null, debeCambiarPassword: false })
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

  await db
    .insert(perfilPersonal)
    .values({ usuarioId: usuarioAuth.id, nombre, correo })
    .onConflictDoNothing({ target: perfilPersonal.usuarioId });

  return usuarioAuth.id;
}

// El formato de la cookie (nombre `sb-<host>-auth-token`, prefijo `base64-`,
// particion a los 3180 bytes) sale de `@supabase/ssr/dist/module/cookies.js`
// y `utils/chunker.js`. Es el mismo calculo que hace tests/e2e/ayuda-sesion.ts.
const LIMITE_CHUNK = 3180;

function construirCookies(sesion: Session, dominio: string) {
  const hostname = new URL(supabaseUrl as string).hostname;
  const base = `sb-${hostname.split('.')[0]}-auth-token`;
  const codificado = `base64-${Buffer.from(JSON.stringify(sesion), 'utf-8').toString('base64url')}`;

  const partes =
    encodeURIComponent(codificado).length <= LIMITE_CHUNK
      ? [{ name: base, value: codificado }]
      : Array.from({ length: Math.ceil(codificado.length / LIMITE_CHUNK) }, (_, i) => ({
          name: `${base}.${i}`,
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

async function principal() {
  await asegurarUsuario();

  const anon = createClient(supabaseUrl as string, anonKey as string);
  const { data, error } = await anon.auth.signInWithPassword({
    email: correo,
    password: PASSWORD_PRUEBA,
  });
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesion como ${rol}: ${error?.message}`);
  }

  const navegador = await chromium.launch({ headless: false });
  const contexto = await navegador.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
  });
  await contexto.addCookies(construirCookies(data.session, new URL(baseUrl).hostname));

  const pagina = await contexto.newPage();
  const destino = rol === 'admin' ? '/planeador' : '/monitor';
  await pagina.goto(`${baseUrl}${destino}`);

  console.log('');
  console.log(`Navegador abierto en ${baseUrl}${destino}`);
  console.log(`  usuario: ${credencial} (${rol})`);
  console.log('');
  console.log('Cierra la ventana del navegador para terminar este comando.');

  await new Promise<void>((resolver) => navegador.on('disconnected', () => resolver()));
}

await principal();
process.exit(0);
