import { existsSync } from 'node:fs';

// Se ejecuta una vez por archivo de prueba, antes de cualquier import del
// codigo bajo prueba. Existe por una razon concreta: los modulos de datos y de
// Supabase validan su configuracion al importarse, asi que una prueba que
// arranca sin variables cargadas revienta en el import y no en una asercion —
// un error que se lee como "el codigo esta roto" cuando en realidad falta el
// entorno.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Las pruebas jamas se ejecutan contra produccion. Si la URL no apunta a
// localhost, se detiene aqui en vez de escribir en la base equivocada.
const url = process.env.DATABASE_URL ?? '';
if (url !== '' && !/(127\.0\.0\.1|localhost)/.test(url)) {
  throw new Error(
    `DATABASE_URL no apunta a una base local (${url}). Las pruebas escriben y ` +
      'truncan tablas: se niegan a correr contra cualquier otra cosa.',
  );
}

// La logica de derivacion del semaforo compara horas en la zona operativa.
// Fijarla aqui hace que la suite de por si sea reproducible en cualquier maquina.
process.env.TZ = process.env.APP_TIMEZONE ?? 'America/Mexico_City';
