import { timingSafeEqual } from 'node:crypto';
import { serve, type ServerType } from '@hono/node-server';
import { reportePdfSchema } from '@rutas/shared';
import { db } from '@rutas/shared/db';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Logger } from 'pino';
import { generarPdfCliente } from './reportes/pdf.ts';

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
  panelBaseUrl: string;
  verificarSalud?: () => Promise<boolean>;
}

export function crearApp({
  secreto,
  logger,
  panelBaseUrl,
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

    // Cuerpo plano `{codigo, mensaje}`, igual que `secreto_invalido` y
    // `limite_excedido` arriba: este endpoint es el unico del worker y nunca
    // adopto el sobre `Resultado<T>` (`{ok, error}`) que usan las server
    // actions del panel — mantenerlo consistente consigo mismo importa mas
    // que igualarlo a un patron de otro proceso.
    const cuerpo = await c.req.json().catch(() => null);
    const parseo = reportePdfSchema.safeParse(cuerpo);
    if (!parseo.success) {
      const primero = parseo.error.issues[0];
      return c.json({ codigo: 'validacion', mensaje: primero?.message ?? 'Entrada invalida' }, 422);
    }

    // Auditoria de seguridad: sin este try/catch, un fallo de Chromium (o de
    // red hacia el panel) llegaba sin capturar hasta el manejador de errores
    // por default de Hono, que usa SU PROPIO `console.error` — no la
    // instancia de `pino` con `redact` que se crea en index.ts. Hoy ningun
    // dato sensible viaja por ese camino de error, pero es el UNICO punto de
    // todo el worker donde un error podia imprimirse fuera del logger
    // configurado, asi que se cierra por consistencia antes de que algo
    // sensible llegue a pasar por ahi.
    try {
      const resultado = await generarPdfCliente(parseo.data, { panelBaseUrl, secreto });
      if (!resultado.ok) {
        logger.info({ path: '/reportes/pdf', codigo: resultado.codigo }, 'PDF no generado');
        return c.json({ codigo: resultado.codigo, mensaje: resultado.mensaje }, 404);
      }

      logger.info({ path: '/reportes/pdf', clienteId: parseo.data.clienteId }, 'PDF generado');
      return c.body(new Uint8Array(resultado.buffer), 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reporte-${parseo.data.clienteId}.pdf"`,
      });
    } catch (error) {
      logger.error({ path: '/reportes/pdf', err: error }, 'fallo al generar el PDF');
      return c.json({ codigo: 'error_interno', mensaje: 'No se pudo generar el PDF.' }, 500);
    }
  });

  return app;
}

export function iniciarServidor(opciones: OpcionesApp & { puerto: number }): ServerType {
  const app = crearApp(opciones);
  return serve({ fetch: app.fetch, port: opciones.puerto }, (info) => {
    opciones.logger.info({ puerto: info.port }, 'servidor HTTP escuchando');
  });
}
