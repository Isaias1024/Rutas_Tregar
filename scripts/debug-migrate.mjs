import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('No hay DATABASE_URL/DIRECT_DATABASE_URL en el entorno.');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('OK: migraciones aplicadas');
} catch (e) {
  console.error('ERROR REAL:');
  console.error(e);
} finally {
  await sql.end();
}
