import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// El entorno se carga ANTES que cualquier import propio: no hay lib/env.ts en el
// worker, y es lo unico que garantiza DATABASE_URL en servidor.ts y scheduler.ts.
const ENV_RAIZ = path.resolve(import.meta.dirname, '../../../.env');
if (existsSync(ENV_RAIZ)) {
  process.loadEnvFile(ENV_RAIZ);
}

const { default: pino } = await import('pino');
const { iniciarServidor } = await import('./servidor.ts');
const { iniciarScheduler } = await import('./scheduler.ts');

const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

// Instancia unica de pino, pasada a servidor.ts y scheduler.ts. El redact cubre
// lo que no se puede loguear: tokens, credenciales y datos personales.
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
  const panelBaseUrl = process.env.PANEL_BASE_URL;
  if (Number.isNaN(puerto) || !secreto || !panelBaseUrl) {
    logger.error('faltan WORKER_PORT, WORKER_SHARED_SECRET o PANEL_BASE_URL en el entorno');
    process.exit(1);
  }

  iniciarServidor({ puerto, secreto, panelBaseUrl, logger });
  iniciarScheduler(logger);
  logger.info({ puerto }, 'rutas-worker arrancado');
} else {
  console.log('Uso: rutas-worker --version | serve');
  process.exit(0);
}
