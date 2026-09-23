// Sin `'use server'` a proposito (ver rutas-nucleo.ts): recibe el actor ya
// autorizado y no toca `next/headers`, asi se prueba contra Postgres sin Next.
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
 * La baja de la LFPDPPP en una sola transaccion. La fila de `usuario` se conserva:
 * es la que sostiene el historial de `asignacion` y `evento`.
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
    // Dentro de la transaccion, para que un rollback devuelva las rutas al
    // chofer. Las pasadas no se tocan: son el historial.
    await liberarYAuditar(tx, actorId, usuarioId);
    // DELETE de la fila completa, no un UPDATE a columnas nulas: la tabla es
    // "una fila por usuario, o ninguna si ya se dio de baja".
    await tx.delete(perfilPersonal).where(eq(perfilPersonal.usuarioId, usuarioId));
    // El cascade de `dispositivo` solo dispara al borrar la fila de `usuario`,
    // que aqui se conserva a proposito.
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

  // Revocar en Supabase Auth queda fuera de la transaccion. Si falla, los datos
  // ya se borraron y `proxy.ts` bloquea al usuario por `activo`/`deleted_at`.
  try {
    await supabaseAdmin.auth.admin.updateUserById(usuarioId, { ban_duration: '876000h' });
  } catch {
    // Ya quedo auditado y bloqueado por `proxy.ts`; no hay nada que revertir.
  }

  return { ok: true, data: { id: usuarioId } };
}
