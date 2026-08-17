process.loadEnvFile('.env');

import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db, usuario } from '../packages/shared/src/db/index.ts';

/**
 * Devuelve a un chofer SEMBRADO su contrasena conocida (`Driver123!`).
 *
 * `pnpm db:seed` ya deja los tres choferes con esa contrasena, asi que en una
 * base recien sembrada este script no hace falta. Sirve despues, cuando la
 * contrasena dejo de servir:
 *   - se ejercito el cambio obligatorio del primer ingreso y ahora la del
 *     dispositivo es otra;
 *   - alguien la cambio a mano probando la pantalla de cambio de contrasena.
 *
 * NO crea choferes: crear uno rompia el conteo exacto de tres que el seed
 * valida. Si el chofer no existe, manda a correr el seed.
 *
 * SOLO PARA LOCAL. Depende de la service role key, que jamas sale del servidor.
 * Igual que `sesion-prueba.ts`, no pasa por `can()` ni escribe en la bitacora:
 * no es una mutacion administrativa del panel, es andamiaje de desarrollo.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'scripts/chofer-prueba.ts: faltan variables de Supabase en .env. Corre `pnpm db:up && pnpm env:write` primero.',
  );
  process.exit(1);
}

// La misma que siembra `scripts/seed.ts`. Si cambia alla, cambia aqui.
const PASSWORD_CHOFER = 'Driver123!';

function leerArgumento(bandera: string, porDefecto: string): string {
  const indice = process.argv.indexOf(bandera);
  const valor = indice === -1 ? undefined : process.argv[indice + 1];
  return valor ?? porDefecto;
}

const credencial = leerArgumento('--credencial', 'driver1').trim().toLowerCase();
// Vuelve a exigir el cambio de contrasena del primer ingreso, que es un paso
// del guion manual (docs/pruebas-manuales.md §8, paso 6) y hay que poder
// reproducir sin volver a sembrar toda la base.
const forzarCambio = process.argv.includes('--forzar-cambio');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function restablecer(): Promise<void> {
  const [fila] = await db
    .select({ id: usuario.id, rol: usuario.rol })
    .from(usuario)
    .where(eq(usuario.credencial, credencial))
    .limit(1);

  if (!fila) {
    console.error(
      `No existe ningun usuario con credencial "${credencial}".\n` +
        'Corre `pnpm db:seed` para sembrar driver1, driver2 y driver3.',
    );
    process.exit(1);
  }
  if (fila.rol !== 'chofer') {
    console.error(
      `"${credencial}" existe pero es ${fila.rol}, no chofer.\n` +
        'Para entrar al panel con ese usuario usa `pnpm panel:sesion`.',
    );
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(fila.id, {
    password: PASSWORD_CHOFER,
  });
  if (error) {
    throw new Error(`No se pudo restablecer la contrasena de "${credencial}": ${error.message}`);
  }

  // Reactivar tambien: si el chofer se dio de baja probando el paso 10 del
  // guion, la contrasena sola no lo deja entrar.
  await db
    .update(usuario)
    .set({ activo: true, deletedAt: null, debeCambiarPassword: forzarCambio })
    .where(eq(usuario.id, fila.id));
}

async function principal() {
  await restablecer();

  console.log('');
  console.log('Contrasena restablecida. Entra a la app con:');
  console.log('');
  console.log(`  Credencial   ${credencial}`);
  console.log(`  Contrasena   ${PASSWORD_CHOFER}`);
  console.log('');
  console.log(
    forzarCambio
      ? 'Va a pedir cambio de contrasena al entrar (--forzar-cambio).'
      : 'Entra directo a "Hoy". Usa --forzar-cambio para probar el primer ingreso.',
  );
  console.log('');
}

await principal();
process.exit(0);
