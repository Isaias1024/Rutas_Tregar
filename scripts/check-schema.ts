import { sql } from 'drizzle-orm';

// Carga entorno antes de cualquier import propio que abra conexion: por eso el
// cliente compartido se importa dinamico, despues de esta linea.
process.loadEnvFile('.env');

const { db } = await import('../packages/shared/src/db/index.ts');

// Las doce tablas por nombre. No se cuentan filas de un catalogo: un conteo se
// desincroniza en cuanto alguien agrega una tabla.
const TABLAS_ESPERADAS = [
  'cliente',
  'usuario',
  'perfil_personal',
  'camion',
  'parada',
  'ruta',
  'horario',
  'asignacion',
  'evento',
  'dispositivo',
  'notificacion_programada',
  'audit_log',
] as const;

const filasTablas = await db.execute<{ table_name: string }>(
  sql`select table_name from information_schema.tables where table_schema = 'public'`,
);
const existentes = new Set(filasTablas.map((fila) => fila.table_name));

const faltantes = TABLAS_ESPERADAS.filter((tabla) => !existentes.has(tabla));
if (faltantes.length > 0) {
  console.error(`db:check — faltan tablas: ${faltantes.join(', ')}`);
  process.exit(1);
}

// `evento` es append-only por permiso: ninguna politica de UPDATE ni de
// DELETE debe existir, para ningun rol.
const politicasProhibidas = await db.execute<{ cmd: string; policyname: string }>(
  sql`select cmd, policyname from pg_policies
      where schemaname = 'public' and tablename = 'evento' and cmd in ('UPDATE', 'DELETE')`,
);
if (politicasProhibidas.length > 0) {
  const nombres = politicasProhibidas.map((p) => `${p.policyname} (${p.cmd})`).join(', ');
  console.error(
    `db:check — evento tiene politicas de UPDATE/DELETE que no deberia tener: ${nombres}`,
  );
  process.exit(1);
}

console.log(
  `db:check OK — ${TABLAS_ESPERADAS.length} tablas presentes, evento sin politica de UPDATE ni DELETE.`,
);
process.exit(0);
