import { timingSafeEqual } from 'node:crypto';
import { serve, type ServerType } from '@hono/node-server';
import { db } from '@rutas/shared/db';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Logger } from 'pino';

// Hono sobre @hono/node-server (§13). El secreto compartido se compara en
// tiempo constante, nunca con `===` sobre el string crudo (§ worker-y-reportes.md).

const LIMITE_PETICIONES_POR_MINUTO = 30;
const VENTANA_MS = 60_000;

async function verificarSaludReal(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Comparacion en tiempo constante. `timingSafeEqual` exige buffers del
 * mismo tamano y lanza si no coinciden — en vez de salir temprano (lo que
 * filtrarla por temporizacion), se compara el recibido contra si mismo para
 * mantener un costo similar antes de responder que no coincide.
 */
function secretosCoinciden(recibido: string, esperado: string): boolean {
  const bufRecibido = Buffer.from(recibido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecibido.length !== bufEsperado.length) {
    timingSafeEqual(bufRecibido, bufRecibido);
    return false;
  }
  return timingSafeEqual(bufRecibido, bufEsperado);
}

export interface OpcionesApp {
  secreto: string;
  logger: Logger;
  verificarSalud?: () => Promise<boolean>;
}

export function crearApp({
  secreto,
  logger,
  verificarSalud = verificarSaludReal,
}: OpcionesApp): Hono {
  const app = new Hono();
  const peticionesPorSecreto = new Map<string, number[]>();

  app.get('/salud', async (c) => {
    const saludable = await verificarSalud();
    return c.json({ db: saludable ? 'ok' : 'caida' }, saludable ? 200 : 503);
  });

  app.post('/reportes/pdf', async (c) => {
    const secretoRecibido = c.req.header('x-rutas-worker-secret');
    if (!secretoRecibido || !secretosCoinciden(secretoRecibido, secreto)) {
      return c.json({ codigo: 'secreto_invalido', mensaje: 'Secreto invalido o ausente.' }, 401);
    }

    const ahora = Date.now();
    const marcasVigentes = (peticionesPorSecreto.get(secretoRecibido) ?? []).filter(
      (instante) => ahora - instante < VENTANA_MS,
    );
    if (marcasVigentes.length >= LIMITE_PETICIONES_POR_MINUTO) {
      return c.json({ codigo: 'limite_excedido', mensaje: 'Demasiadas peticiones.' }, 429);
    }
    marcasVigentes.push(ahora);
    peticionesPorSecreto.set(secretoRecibido, marcasVigentes);

    // La generacion real del PDF (imprimir la pagina del panel con
    // Playwright/Chromium) llega en un paso posterior; este endpoint por
    // ahora solo demuestra que la autenticacion y el limite de tasa
    // funcionan de verdad.
    logger.info({ path: '/reportes/pdf' }, 'solicitud de reporte autenticada');
    return c.json({ ok: true, mensaje: 'Generacion de PDF pendiente de implementar.' }, 200);
  });

  return app;
}

export function iniciarServidor(opciones: OpcionesApp & { puerto: number }): ServerType {
  const app = crearApp(opciones);
  return serve({ fetch: app.fetch, port: opciones.puerto }, (info) => {
    opciones.logger.info({ puerto: info.port }, 'servidor HTTP escuchando');
  });
}
