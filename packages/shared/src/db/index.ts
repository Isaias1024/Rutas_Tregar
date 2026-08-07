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
