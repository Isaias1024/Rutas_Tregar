// Sin `'use server'` a proposito (ver rutas-nucleo.ts, paradas-nucleo.ts): el
// nucleo recibe el actor ya autorizado y no toca `next/headers`, para que
// `catalogos.ts` sea el unico endpoint real y esta regla se pueda probar
// contra Postgres sin una peticion real de Next.
import type { Resultado } from '@rutas/shared';
import { cliente, db, ruta } from '@rutas/shared/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

const NO_ENCONTRADO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'El recurso no existe o ya fue borrado.' },
};

/** Las rutas vivas de un cliente. Misma definicion de "en uso" que la parada. */
export async function rutasDeCliente(clienteId: string) {
  return db
    .select({ id: ruta.id, nombre: ruta.nombre })
    .from(ruta)
    .where(and(eq(ruta.clienteId, clienteId), isNull(ruta.deletedAt)))
    .orderBy(asc(ruta.nombre));
}

export async function borrarClienteNucleo(
  actorId: string,
  id: string,
): Promise<Resultado<{ id: string }>> {
  // `isNull(deleted_at)` no es decorativo: sin el, borrar dos veces la misma
  // fila respondia `ok` la segunda vez y el panel acusaba "eliminado
  // correctamente" sobre algo que ya no existia. Pasa de verdad: dos pestanas
  // abiertas, o una lista que quedo vieja.
  const [antes] = await db
    .select()
    .from(cliente)
    .where(and(eq(cliente.id, id), isNull(cliente.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  // Un cliente con rutas vivas no se borra: cada una de esas rutas quedaria
  // apuntando (via FK `restrict`) a un cliente que ninguna pantalla resuelve,
  // y los reportes por cliente perderian su encabezado. Un cliente cuyas rutas
  // ya se retiraron si se puede ir.
  const enUso = await rutasDeCliente(id);
  if (enUso.length > 0) {
    const nombres = enUso.map((r) => r.nombre).join(', ');
    return {
      ok: false,
      error: {
        codigo: 'conflicto',
        mensaje: `Este cliente tiene ${enUso.length} ${enUso.length === 1 ? 'ruta asociada' : 'rutas asociadas'} (${nombres}) y no puede eliminarse. Borra primero esas rutas.`,
      },
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(cliente).set({ deletedAt: new Date() }).where(eq(cliente.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'borrar',
      recurso: { tipo: 'cliente', id },
      antes: { nombre: antes.nombre },
    });
  });

  return { ok: true, data: { id } };
}
