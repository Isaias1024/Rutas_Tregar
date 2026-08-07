import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// Reexporta cada tabla y enum de schema.ts para que quien importe `db` desde
// aqui tambien pueda construir consultas (`db.select().from(usuario)`) sin un
// segundo import a una ruta interna del paquete.
export * from './schema.ts';

// Unico lugar del proyecto que abre una conexion a Postgres. Nadie mas —
// panel, worker ni scripts — crea su propio cliente `postgres()`.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'packages/shared/src/db/index.ts: falta DATABASE_URL. Quien importe este ' +
      "modulo debe cargar el entorno primero (process.loadEnvFile('.env')).",
  );
}

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
