#!/usr/bin/env node
/**
 * Genera `.env` a partir de `.env.example` mas los valores reales que imprime
 * `supabase status -o env`.
 *
 * Dos propiedades que este script tiene que cumplir, y que fallo antes:
 *
 * 1. IDEMPOTENTE. Si `.env` ya existe NO lo toca y sale 0. El bloque Bootstrap se
 *    corre dos veces seguidas y la segunda no puede pisar secretos editados a mano.
 *
 * 2. RUIDOSO AL FALLAR. Un `.env` con `DATABASE_URL` vacia NO es un estado valido
 *    de este proyecto: es un build muerto que todavia no lo sabe. `DATABASE_URL` es
 *    obligatoria desde el paso 2 y nada vuelve a correr este script, asi que
 *    escribir campos vacios y salir 0 convierte un fallo duro en uno silencioso que
 *    reaparece tres pasos despues como "drizzle-kit no crea nada".
 *    Si Supabase no responde, este script SALE 1 y dice que hacer.
 *
 * Escribir la plantilla con valores vacios es legitimo en exactamente un caso: que
 * alguien quiera el archivo sin levantar Supabase. Eso se pide a proposito con
 * `--sin-supabase`; nunca ocurre por accidente.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const DESTINO = '.env';
const sinSupabase = process.argv.includes('--sin-supabase');

if (existsSync(DESTINO)) {
  console.log(`${DESTINO} ya existe — no se toca.`);
  process.exit(0);
}

if (!existsSync('.env.example')) {
  console.error('Falta .env.example. Copia el directorio workspace/ del bundle primero.');
  process.exit(1);
}

/**
 * Lee el estado del stack local.
 *
 * Se usa `execSync` con una cadena de comando y NO `execFileSync('pnpm', [...])`:
 * en Windows `pnpm` no es un ejecutable sino un shim `.cmd`, y `execFileSync` sin
 * shell no puede lanzarlo — falla con `spawnSync pnpm ENOENT`. Comprobado
 * ejecutandolo en Windows 11. `execSync` pasa por el shell y resuelve el shim.
 * La cadena es una constante literal, sin interpolar nada, asi que no hay
 * superficie de inyeccion; y a diferencia de `shell: true` no dispara DEP0190.
 *
 * @returns {Record<string,string>}
 */
function estadoSupabase() {
  const salida = execSync('pnpm exec supabase status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /** @type {Record<string,string>} */
  const mapa = {};
  for (const linea of salida.split('\n')) {
    const m = linea.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m?.[1]) mapa[m[1]] = m[2] ?? '';
  }
  return mapa;
}

/** @type {Record<string,string>} */
let s = {};

if (!sinSupabase) {
  try {
    s = estadoSupabase();
  } catch (e) {
    console.error('');
    console.error('No se pudo leer `supabase status`. El stack local no esta respondiendo.');
    console.error(`  ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    console.error('');
    console.error('Levantalo y vuelve a correr este comando:');
    console.error('    pnpm db:up && pnpm env:write');
    console.error('');
    console.error('NO se escribe un .env con DATABASE_URL vacia: es obligatoria desde el');
    console.error('paso 2 y nada vuelve a generarla, asi que el build moriria mas adelante');
    console.error('con un error que no apunta aqui.');
    console.error('');
    console.error('Si de verdad quieres la plantilla vacia, pidela a proposito:');
    console.error('    pnpm env:write --sin-supabase');
    process.exit(1);
  }

  // Una llamada que salio 0 pero no trajo lo que hace falta es el mismo fallo con
  // otra cara: se detecta aqui y no tres pasos despues.
  const faltantes = ['DB_URL', 'API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY'].filter((k) => !s[k]);
  if (faltantes.length > 0) {
    console.error(`\`supabase status\` respondio pero no trajo: ${faltantes.join(', ')}.`);
    console.error('Revisa `pnpm db:status` antes de continuar. No se escribe un .env incompleto.');
    process.exit(1);
  }
} else {
  console.warn('--sin-supabase: se escribe la plantilla con los valores de Supabase vacios.');
  console.warn('El paso 2 fallara hasta que corras `pnpm db:up && rm .env && pnpm env:write`.');
}

const api = s.API_URL ?? '';
const anon = s.ANON_KEY ?? '';
const service = s.SERVICE_ROLE_KEY ?? '';
const db = s.DB_URL ?? '';

/** @type {Record<string,string>} */
const valores = {
  DATABASE_URL: db,
  DIRECT_DATABASE_URL: db,
  NEXT_PUBLIC_SUPABASE_URL: api,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
  SUPABASE_SERVICE_ROLE_KEY: service,
  EXPO_PUBLIC_SUPABASE_URL: api,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: anon,
  GOOGLE_OAUTH_ALLOWED_DOMAIN: 'example.com',
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: '',
  WORKER_PORT: '8787',
  WORKER_BASE_URL: 'http://127.0.0.1:8787',
  WORKER_SHARED_SECRET: crypto.randomUUID(),
  EXPO_ACCESS_TOKEN: '',
  APP_TIMEZONE: 'America/Mexico_City',
  LOG_LEVEL: 'info',
  E2E_BASE_URL: 'http://127.0.0.1:3000',
};

const lineas = readFileSync('.env.example', 'utf8')
  .split('\n')
  .map((linea) => {
    const m = linea.match(/^([A-Z0-9_]+)=/);
    const clave = m?.[1];
    if (!clave || !(clave in valores)) return linea;
    return `${clave}=${valores[clave]}`;
  });

writeFileSync(DESTINO, `${lineas.join('\n').trimEnd()}\n`, 'utf8');
console.log(
  sinSupabase
    ? `${DESTINO} escrito a partir de .env.example, SIN los valores de Supabase.`
    : `${DESTINO} escrito a partir de .env.example + supabase status.`,
);
