// Sin `'use server'` a proposito (ver rutas-nucleo.ts, planeador-nucleo.ts):
// el nucleo recibe el actor ya autorizado y no toca `next/headers`, para que
// `baja.ts` sea el unico endpoint real y este archivo se pueda probar
// contra Postgres sin una peticion real de Next.
import type { Resultado } from '@rutas/shared';
import { db, dispositivo, perfilPersonal, usuario } from '@rutas/shared/db';
import { and, eq, isNull } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { liberarYAuditar } from '@/server/choferes-nucleo';

const NO_ENCONTRADO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'El empleado no existe o ya fue dado de baja.' },
};

/**
 * La baja de la LFPDPPP (§4, §9 paso 16): vacia `perfil_personal`, borra
 * `dispositivo` y marca `usuario.deleted_at`/`activo = false`, todo en una
 * transaccion — si cualquier escritura falla, ninguna queda aplicada. La
 * fila de `usuario` se conserva siempre: es lo que sostiene el historial de
 * `asignacion` y `evento` (§4: "el unico cascade a datos personales... para
 * que la baja los borre" es `usuario -> perfil_personal`, no `usuario`
 * mismo).
 */
export async function bajaEmpleadoNucleo(
  actorId: string,
  usuarioId: string,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select()
    .from(usuario)
    .where(and(eq(usuario.id, usuarioId), isNull(usuario.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  const [perfilAntes] = await db
    .select()
    .from(perfilPersonal)
    .where(eq(perfilPersonal.usuarioId, usuarioId))
    .limit(1);

  await db.transaction(async (tx) => {
    // Antes que nada, soltar sus rutas de hoy en adelante: un chofer dado de
    // baja no puede seguir apareciendo como responsable de una ruta que ya no
    // va a manejar, y esos horarios tienen que quedar libres para otro. Va
    // DENTRO de esta transaccion: si la baja se revierte, las asignaciones
    // vuelven a ser suyas. Las pasadas no se tocan — son el historial.
    await liberarYAuditar(tx, actorId, usuarioId);
    // "Vacia perfil_personal" es literal: DELETE de la fila completa, no un
    // UPDATE a columnas nulas — §4 documenta la tabla como "una fila por
    // usuario, o ninguna si ya se dio de baja".
    await tx.delete(perfilPersonal).where(eq(perfilPersonal.usuarioId, usuarioId));
    // `dispositivo` tiene cascade desde `usuario` (§4), pero ese cascade
    // solo dispara si se borra la fila de `usuario` — y aqui se conserva a
    // proposito, asi que el borrado va explicito.
    await tx.delete(dispositivo).where(eq(dispositivo.usuarioId, usuarioId));
    await tx
      .update(usuario)
      .set({ activo: false, deletedAt: new Date() })
      .where(eq(usuario.id, usuarioId));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'baja',
      recurso: { tipo: 'usuario', id: usuarioId },
      antes: { tuvoPerfil: perfilAntes !== undefined, activo: antes.activo },
      despues: { perfilPersonal: null, activo: false },
    });
  });

  // Revocar el acceso en Supabase Auth es un efecto secundario FUERA de la
  // transaccion de Postgres — no hay forma de meter una llamada HTTP dentro
  // de un rollback. Si esto falla, los datos personales YA se borraron (el
  // requisito de la LFPDPPP) y `proxy.ts` ya bloquea a este usuario en su
  // siguiente peticion via `activo = false` / `deleted_at`, asi que el
  // baneo de Supabase Auth es defensa en profundidad, no la unica barrera —
  // un fallo de red aqui no revierte la baja, solo se ignora.
  try {
    await supabaseAdmin.auth.admin.updateUserById(usuarioId, { ban_duration: '876000h' });
  } catch {
    // Ya quedo auditado y bloqueado por `proxy.ts`; no hay nada que revertir.
  }

  return { ok: true, data: { id: usuarioId } };
}
