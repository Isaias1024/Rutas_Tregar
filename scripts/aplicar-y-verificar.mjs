// Aplica las migraciones pendientes contra la base que indique DIRECT_DATABASE_URL
// y verifica los tres hechos que cierran los avisos del linter de Supabase.
// Uso: DIRECT_DATABASE_URL="<cadena>" node scripts/aplicar-y-verificar.mjs
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DIRECT_DATABASE_URL;
if (!url) {
  console.error('Falta DIRECT_DATABASE_URL en el entorno.');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const destino = await sql`select current_database() db, inet_server_addr()::text host`;
console.log(`Destino: ${destino[0].db} @ ${destino[0].host ?? 'local'}`);

const antes = await sql`select count(*)::int c from drizzle.__drizzle_migrations`.catch(() => [{ c: 0 }]);
console.log(`Migraciones ya aplicadas: ${antes[0].c}`);

await migrate(drizzle(sql), { migrationsFolder: './drizzle' });

const despues = await sql`select count(*)::int c from drizzle.__drizzle_migrations`;
console.log(`Migraciones tras aplicar: ${despues[0].c}`);

const enPublic = await sql`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef`;
const sinPolitica = await sql`
  select t.tablename from pg_tables t
  where t.schemaname = 'public'
    and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t.tablename)`;
const privilegios = await sql`
  select p.proname,
         has_function_privilege('anon', p.oid, 'execute') anon,
         has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'seguridad' order by 1`;

console.log('\nFunciones security definer aun en public (debe ser 0):', enPublic.length, enPublic.map((r) => r.proname));
console.log('Tablas con RLS y sin politica (debe ser vacio):', sinPolitica.map((r) => r.tablename));
console.table(privilegios);

await sql.end();

const ok = enPublic.length === 0 && sinPolitica.length === 0;
console.log(ok ? '\nOK: los avisos del linter quedan cerrados.' : '\nFALLO: revisar lo de arriba.');
process.exit(ok ? 0 : 1);
