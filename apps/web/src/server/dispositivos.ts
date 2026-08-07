// Sin 'use server' a proposito: esto NO es un server action, es el nucleo
// que llama el route handler real (apps/web/src/app/api/dispositivos/route.ts).
// La app movil habla HTTP puro con Bearer token, no el mecanismo de RPC de
// Next para server actions, asi que el endpoint tiene que ser una ruta de
// verdad bajo app/api/.
import type { DispositivoRegistrar } from '@rutas/shared';
import { db, dispositivo } from '@rutas/shared/db';

/**
 * Re-registrar reemplaza, no duplica (paso 14): el mismo (usuario_id,
 * expo_push_token) hace upsert sobre `ultima_vez`, `plataforma` y
 * `app_version` en vez de insertar una fila nueva.
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
