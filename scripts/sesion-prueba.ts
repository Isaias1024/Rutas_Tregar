process.loadEnvFile('.env');

import { chromium } from '@playwright/test';
import { createClient, type Session } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, perfilPersonal, usuario } from '../packages/shared/src/db/index.ts';

/**
 * Abre el panel con una sesion de prueba ya iniciada, porque el unico login es
 * OAuth de Google y en local esta apagado. SOLO PARA LOCAL: usa la service key.
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

// Los mismos usuarios que siembra `scripts/seed.ts`: una cuenta propia dejaria
// dos admins en una base recien sembrada y romperia sus conteos exactos.
const PASSWORD_POR_ROL = {
  admin: 'Admin123!',
  supervisor: 'Supervisor123!',
} as const;

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
// El panel local siempre vive aqui (`pnpm dev` fija el puerto 3000); para otro
// lado esta `--url`, sin meter una variable mas al `globalEnv` de turbo.json.
const baseUrl = leerArgumento('--url', 'http://127.0.0.1:3000');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD_PRUEBA = PASSWORD_POR_ROL[rol];
const correo = `${rol}@test.com`;
const credencial = rol;
const nombre = rol === 'admin' ? 'Administrator Test' : 'Supervisor Test';

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

// El formato de la cookie sale de `@supabase/ssr` (cookies.js y chunker.js);
// es el mismo calculo que hace tests/e2e/ayuda-sesion.ts.
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

  // `viewport: null` deja que la pagina siga el tamano real de la ventana: con
  // un viewport fijo, maximizar deja una franja sin pintar y corta las listas.
  const navegador = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });
  const contexto = await navegador.newContext({
    viewport: null,
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
