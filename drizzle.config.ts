import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit es un CLI suelto: no arranca a traves de Next y nadie carga
// `.env` por el. Sin estas tres lineas `pnpm db:migrate` sale con codigo 1
// quejandose de una cadena de conexion ausente — y no crea nada.
// El cargador vive AQUI, en el config que drizzle-kit siempre evalua, y no en
// cada sitio de llamada, precisamente para que no se pueda olvidar en uno.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'Falta DATABASE_URL. Levanta Supabase local con `pnpm db:up` y genera el ' +
      'archivo de entorno con `pnpm env:write`.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/shared/src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
  // El dashboard de Supabase es solo lectura para este proyecto: Drizzle es el
  // unico sistema de migraciones. `strict` obliga a confirmar cualquier
  // sentencia destructiva en vez de aplicarla en silencio.
  strict: true,
  verbose: true,
  schemaFilter: ['public'],
});
