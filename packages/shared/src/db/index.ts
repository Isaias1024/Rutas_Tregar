import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

// Reexporta cada tabla y enum de schema.ts para que quien importe `db` desde
// aqui tambien pueda construir consultas (`db.select().from(usuario)`) sin un
// segundo import a una ruta interna del paquete.
export * from './schema.ts';

// Unico lugar del proyecto que abre una conexion a Postgres. Nadie mas —
// panel, worker ni scripts — crea su propio cliente `postgres()`.
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

// `db` se conecta perezosamente, en el primer metodo que se le llame, no al
// importarse. Un modulo que solo importa `{ db }` (por ejemplo para
// reexportar tipos, o porque el orden de sus propios imports no garantiza
// que el entorno ya este cargado) ya no revienta por eso: el error de
// DATABASE_URL ausente solo aparece si de verdad se intenta consultar la
// base antes de cargar el entorno, no por el orden en que el bundler
// evaluo los modulos.
export const db: Db = new Proxy({} as Db, {
  get(_objetivo, propiedad) {
    const real = conectar();
    const valor = Reflect.get(real, propiedad, real);
    // `this` importa dentro de drizzle (transaction, select, insert...):
    // atado a la instancia real, no al proxy, para que un metodo llamado
    // como `db.transaction(...)` funcione igual que si `db` fuera la
    // instancia real.
    return typeof valor === 'function' ? valor.bind(real) : valor;
  },
});

/**
 * El cliente `postgres.js` crudo detras de `db` (paso 15), para el unico caso
 * que drizzle no cubre: un cursor que entrega filas en lotes sin acumular el
 * arreglo completo (CSV en streaming de la bitacora de ejecuciones). NO abre
 * una conexion nueva — reutiliza la misma instancia perezosa de `conectar()`.
 * Se expone como funcion y no como `db.$client` porque el `Proxy` de arriba
 * hace `.bind(real)` sobre todo valor que sea funcion, y `bind` no conserva
 * los metodos (`.unsafe`, `.cursor`) que `postgres.js` cuelga como
 * propiedades del propio `sql` — un `db.$client` a traves del proxy vendria
 * roto.
 */
export function clienteSql(): ReturnType<typeof postgres> {
  return conectar().$client;
}
