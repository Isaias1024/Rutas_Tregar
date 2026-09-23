process.loadEnvFile('.env');

import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, perfilPersonal, usuario } from '../packages/shared/src/db/index.ts';

/**
 * Crea el primer usuario administrador en un Supabase ya migrado (produccion o
 * staging). A diferencia de `seed.ts`, NO borra nada: solo inserta si no existe
 * ya un `usuario` con ese correo o credencial.
 *
 * Variables requeridas en `.env`:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_CORREO
 *   ADMIN_PASSWORD
 *   ADMIN_CREDENCIAL
 *   ADMIN_NOMBRE
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const correo = process.env.ADMIN_CORREO;
const password = process.env.ADMIN_PASSWORD;
const credencial = process.env.ADMIN_CREDENCIAL;
const nombre = process.env.ADMIN_NOMBRE;

const faltantes = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  ADMIN_CORREO: correo,
  ADMIN_PASSWORD: password,
  ADMIN_CREDENCIAL: credencial,
  ADMIN_NOMBRE: nombre,
})
  .filter(([, valor]) => !valor)
  .map(([clave]) => clave);

if (faltantes.length > 0) {
  console.error(
    `scripts/crear-admin-produccion.ts: faltan variables en .env: ${faltantes.join(', ')}`,
  );
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl as string, serviceRoleKey as string, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function crearAdmin() {
  const [existente] = await db
    .select({ id: usuario.id, correo: usuario.correo, credencial: usuario.credencial })
    .from(usuario)
    .where(eq(usuario.correo, correo as string))
    .limit(1);

  if (existente) {
    console.error(
      `Ya existe un usuario con el correo "${correo}" (credencial "${existente.credencial}"). ` +
        'Este script no sobrescribe cuentas existentes.',
    );
    process.exit(1);
  }

  const [existentePorCredencial] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.credencial, credencial as string))
    .limit(1);

  if (existentePorCredencial) {
    console.error(`Ya existe un usuario con la credencial "${credencial}".`);
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear la cuenta de Auth "${correo}": ${error?.message}`);
  }

  await db.insert(usuario).values({
    id: data.user.id,
    credencial: credencial as string,
    rol: 'admin',
    correo: correo as string,
    activo: true,
    // Contrasena temporal: se fuerza el cambio en el primer ingreso.
    debeCambiarPassword: true,
  });

  await db.insert(perfilPersonal).values({
    usuarioId: data.user.id,
    nombre: nombre as string,
    correo: correo as string,
  });
}

async function principal() {
  await crearAdmin();

  console.log('');
  console.log('Administrador creado.');
  console.log('');
  console.log(`  Correo       ${correo}`);
  console.log(`  Credencial   ${credencial}`);
  console.log(`  Contrasena   (la que capturaste en ADMIN_PASSWORD)`);
  console.log('');
  console.log(
    'Va a pedir cambio de contrasena en el primer ingreso. Tambien puede entrar con ' +
      '"Entrar con Google" si el correo es del dominio permitido (GOOGLE_OAUTH_ALLOWED_DOMAIN).',
  );
  console.log('');
}

await principal();
process.exit(0);
