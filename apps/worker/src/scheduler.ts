import { db, notificacionProgramada } from '@rutas/shared/db';
import { Cron } from 'croner';
import { and, eq, isNull, lte } from 'drizzle-orm';
import type { Logger } from 'pino';

// croner en America/Mexico_City, barriendo notificacion_programada cada
// minuto (§13, § worker-y-reportes.md). Idempotente por diseno: enviado_en
// se marca ANTES de enviar, y is null es el filtro de recogida, para que un
// reinicio a media tanda no duplique avisos.

export interface NotificacionPendiente {
  id: string;
  tipo: string;
  asignacionId: string;
}

export type EnviarNotificacion = (notificacion: NotificacionPendiente) => Promise<void>;

/**
 * La entrega real (expo-server-sdk) llega en el paso 14. Este placeholder
 * existe para que el barrido de hoy ya tenga la forma final: marcar y
 * despues intentar enviar, nunca al reves.
 */
const enviarPlaceholder: EnviarNotificacion = async () => {};

export async function barrerNotificacionesPendientes(
  logger: Logger,
  enviar: EnviarNotificacion = enviarPlaceholder,
): Promise<number> {
  const pendientes = await db
    .select({
      id: notificacionProgramada.id,
      tipo: notificacionProgramada.tipo,
      asignacionId: notificacionProgramada.asignacionId,
    })
    .from(notificacionProgramada)
    .where(
      and(
        isNull(notificacionProgramada.enviadoEn),
        lte(notificacionProgramada.enviarEn, new Date()),
      ),
    );

  for (const notificacion of pendientes) {
    // Se marca ANTES de enviar: si el proceso muere a media tanda, el
    // siguiente barrido no la vuelve a recoger ni la duplica.
    await db
      .update(notificacionProgramada)
      .set({ enviadoEn: new Date() })
      .where(eq(notificacionProgramada.id, notificacion.id));

    try {
      await enviar(notificacion);
    } catch (error) {
      logger.error({ err: error, notificacionId: notificacion.id }, 'fallo al enviar notificacion');
    }
  }

  return pendientes.length;
}

export function iniciarScheduler(logger: Logger, enviar?: EnviarNotificacion): Cron {
  return new Cron('* * * * *', { timezone: 'America/Mexico_City' }, async () => {
    const total = await barrerNotificacionesPendientes(logger, enviar);
    if (total > 0) {
      logger.info({ total }, 'notificaciones procesadas');
    }
  });
}
