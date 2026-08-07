import { asignacion, db, dispositivo, usuario } from '@rutas/shared/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { Logger } from 'pino';

// Envio con expo-server-sdk en tandas (paso 14). Jamas se loguea el token
// ni el nombre ni el telefono del chofer — solo id de fila y contadores.

const MENSAJE_POR_TIPO: Record<string, { titulo: string; cuerpo: string }> = {
  asignacion_nueva: { titulo: 'Rutas', cuerpo: 'Tienes una ruta nueva asignada.' },
  recordatorio_inicio: { titulo: 'Rutas', cuerpo: 'Tu ruta sale pronto, marca que la viste.' },
  alerta_retraso: { titulo: 'Rutas', cuerpo: 'Una ruta va retrasada.' },
};

export interface NotificacionAEnviar {
  id: string;
  tipo: string;
  asignacionId: string;
}

export interface ClientePush {
  sendPushNotificationsAsync: Expo['sendPushNotificationsAsync'];
}

/** alerta_retraso avisa al supervisor/admin; los otros dos, al chofer de la asignacion. */
async function destinatariosDe(tipo: string, asignacionId: string): Promise<string[]> {
  if (tipo === 'alerta_retraso') {
    const filas = await db
      .select({ id: usuario.id })
      .from(usuario)
      .where(
        and(
          inArray(usuario.rol, ['supervisor', 'admin']),
          eq(usuario.activo, true),
          isNull(usuario.deletedAt),
        ),
      );
    return filas.map((fila) => fila.id);
  }

  const [fila] = await db
    .select({ choferId: asignacion.choferId })
    .from(asignacion)
    .where(eq(asignacion.id, asignacionId))
    .limit(1);
  return fila ? [fila.choferId] : [];
}

export async function enviarNotificacion(
  logger: Logger,
  notificacion: NotificacionAEnviar,
  expo: ClientePush = new Expo(),
): Promise<void> {
  const mensajeBase = MENSAJE_POR_TIPO[notificacion.tipo];
  if (!mensajeBase) {
    logger.warn(
      { notificacionId: notificacion.id, tipo: notificacion.tipo },
      'tipo de notificacion desconocido',
    );
    return;
  }

  const usuarioIds = await destinatariosDe(notificacion.tipo, notificacion.asignacionId);
  if (usuarioIds.length === 0) {
    return;
  }

  const dispositivos = await db
    .select({ id: dispositivo.id, expoPushToken: dispositivo.expoPushToken })
    .from(dispositivo)
    .where(inArray(dispositivo.usuarioId, usuarioIds));
  if (dispositivos.length === 0) {
    return;
  }

  const mensajes: ExpoPushMessage[] = dispositivos.map((fila) => ({
    to: fila.expoPushToken,
    title: mensajeBase.titulo,
    body: mensajeBase.cuerpo,
  }));

  const tickets = await expo.sendPushNotificationsAsync(mensajes);

  let eliminados = 0;
  for (const [indice, ticket] of tickets.entries()) {
    const dispositivoCorrespondiente = dispositivos[indice];
    if (
      ticket?.status === 'error' &&
      ticket.details?.error === 'DeviceNotRegistered' &&
      dispositivoCorrespondiente
    ) {
      // Se borra y no se reintenta: un token DeviceNotRegistered nunca va a
      // volver a funcionar.
      await db.delete(dispositivo).where(eq(dispositivo.id, dispositivoCorrespondiente.id));
      eliminados++;
    }
  }

  logger.info(
    {
      notificacionId: notificacion.id,
      tipo: notificacion.tipo,
      enviados: dispositivos.length,
      eliminados,
    },
    'notificacion procesada',
  );
}
