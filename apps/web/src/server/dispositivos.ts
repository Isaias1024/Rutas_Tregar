// Sin 'use server' a proposito: no es un server action sino el nucleo que llama
// el route handler, porque la app movil habla HTTP puro con Bearer token.
import type { DispositivoRegistrar } from '@rutas/shared';
import { db, dispositivo } from '@rutas/shared/db';

/**
 * Re-registrar reemplaza, no duplica: el mismo (usuario_id, expo_push_token)
 * hace upsert sobre `ultima_vez`, `plataforma` y `app_version`.
 */
export async function registrarDispositivo(
  usuarioId: string,
  datos: DispositivoRegistrar,
): Promise<void> {
  await db
    .insert(dispositivo)
    .values({
      id: crypto.randomUUID(),
      usuarioId,
      expoPushToken: datos.expoPushToken,
      plataforma: datos.plataforma,
      appVersion: datos.appVersion,
    })
    .onConflictDoUpdate({
      target: [dispositivo.usuarioId, dispositivo.expoPushToken],
      set: {
        plataforma: datos.plataforma,
        appVersion: datos.appVersion,
        ultimaVez: new Date(),
      },
    });
}
