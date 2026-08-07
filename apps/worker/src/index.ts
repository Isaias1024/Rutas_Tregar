import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Punto de entrada ejecutable. `--version` imprime la version y sale 0;
// `serve` arranca el servidor HTTP y el scheduler de verdad (paso 13).
//
// El entorno se carga ANTES que cualquier otro import propio (§ worker-y-reportes.md):
// no hay un lib/env.ts en el worker, asi que esto es lo unico que garantiza
// que DATABASE_URL, WORKER_PORT, etc. existan cuando servidor.ts y
// scheduler.ts los lean.
const ENV_RAIZ = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(ENV_RAIZ)) {
  process.loadEnvFile(ENV_RAIZ);
}

const { default: pino } = await import('pino');
const { iniciarServidor } = await import('./servidor.ts');
const { iniciarScheduler } = await import('./scheduler.ts');

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

// Instancia unica de pino, creada aqui y pasada a servidor.ts y scheduler.ts
// (§ worker-y-reportes.md: "no hay un modulo de logger aparte"). El redact
// cubre todo lo que la LFPDPPP y el sentido comun prohiben loguear: tokens,
// credenciales y datos personales de empleados.
const logger = pino({
  redact: {
    paths: [
      'token',
      'password',
      'authorization',
      'expo_push_token',
      'telefono',
      'correo',
      'nombre',
    ],
    censor: '[redactado]',
  },
});

const comando = process.argv[2];

if (comando === '--version') {
  console.log(`rutas-worker ${pkg.version}`);
  process.exit(0);
} else if (comando === 'serve') {
  const puerto = Number.parseInt(process.env.WORKER_PORT ?? '', 10);
  const secreto = process.env.WORKER_SHARED_SECRET;
  if (Number.isNaN(puerto) || !secreto) {
    logger.error('faltan WORKER_PORT o WORKER_SHARED_SECRET en el entorno');
    process.exit(1);
  }

  iniciarServidor({ puerto, secreto, logger });
  iniciarScheduler(logger);
  logger.info({ puerto }, 'rutas-worker arrancado');
} else {
  console.log('Uso: rutas-worker --version | serve');
  process.exit(0);
}
