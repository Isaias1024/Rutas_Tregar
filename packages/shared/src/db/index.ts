import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// Reexporta tablas y enums para que quien importe `db` desde aqui pueda armar
// consultas sin un segundo import a una ruta interna del paquete.
export * from './schema.ts';

// Unico lugar del proyecto que abre una conexion a Postgres: ni panel, ni worker,
// ni scripts crean su propio cliente `postgres()`.
type Db = ReturnType<typeof drizzle<typeof schema>>;

let instancia: Db | undefined;

function conectar(): Db {
  if (!instancia) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'packages/shared/src/db/index.ts: falta DATABASE_URL. Quien importe este ' +
          "modulo debe cargar el entorno primero (process.loadEnvFile('.env')).",
      );
    }
    instancia = drizzle(postgres(connectionString), { schema });
  }
  return instancia;
}

// `db` se conecta perezosamente, en el primer metodo que se le llame: asi el
// error por DATABASE_URL ausente depende de consultar, no del orden de imports.
export const db: Db = new Proxy({} as Db, {
  get(_objetivo, propiedad) {
    const real = conectar();
    const valor = Reflect.get(real, propiedad, real);
    // `this` importa dentro de drizzle: atado a la instancia real y no al proxy,
    // para que `db.transaction(...)` funcione igual.
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

/**
 * El cliente `postgres.js` crudo detras de `db`, para el cursor por lotes del CSV.
 * Va como funcion porque el `.bind()` del proxy pierde `.unsafe` y `.cursor`.
 */
export function clienteSql(): ReturnType<typeof postgres> {
  return conectar().$client;
}
