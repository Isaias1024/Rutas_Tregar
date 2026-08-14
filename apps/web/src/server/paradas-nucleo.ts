// Sin `'use server'` a proposito (ver rutas-nucleo.ts, planeador-nucleo.ts):
// el nucleo recibe el actor ya autorizado y no toca `next/headers`, para que
// `paradas.ts` sea el unico endpoint real y estas reglas se puedan probar
// contra Postgres sin una peticion real de Next.
import type { Resultado } from '@rutas/shared';
import { db, parada, ruta } from '@rutas/shared/db';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

const NO_ENCONTRADA: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'La parada no existe.' },
};

export interface RutaQueUsaParada {
  id: string;
  nombre: string;
}

/**
 * Las rutas vivas que usan una parada, como inicio o como fin.
 *
 * Sostiene las dos reglas del paso 1 — la advertencia antes de editar y el
 * bloqueo antes de borrar — con una sola definicion de "en uso", para que no
 * puedan discrepar: seria posible advertir sobre tres rutas y bloquear por
 * cuatro.
 *
 * Solo rutas no borradas: una ruta ya retirada no tiene por que impedir que
 * se limpie el catalogo de paradas.
 */
export async function rutasQueUsanParada(paradaId: string): Promise<RutaQueUsaParada[]> {
  return db
    .select({ id: ruta.id, nombre: ruta.nombre })
    .from(ruta)
    .where(
      and(
        isNull(ruta.deletedAt),
        or(eq(ruta.paradaInicioId, paradaId), eq(ruta.paradaFinId, paradaId)),
      ),
    )
    .orderBy(asc(ruta.nombre));
}

export async function borrarParadaNucleo(
  actorId: string,
  id: string,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select()
    .from(parada)
    .where(and(eq(parada.id, id), isNull(parada.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADA;
  }

  // Una parada en uso NO se borra (paso 1): la ruta que la referencia se
  // quedaria sin punto de inicio o de fin real. El borrado logico no salvaba
  // esto — la FK `restrict` solo protege contra un DELETE duro, que este
  // modulo nunca emite, asi que sin esta comprobacion la parada desaparecia
  // del catalogo y las rutas seguian colgando de una fila invisible.
  const enUso = await rutasQueUsanParada(id);
  if (enUso.length > 0) {
    const nombres = enUso.map((r) => r.nombre).join(', ');
    return {
      ok: false,
      error: {
        codigo: 'conflicto',
        mensaje: `Esta parada se usa en ${enUso.length} ${enUso.length === 1 ? 'ruta' : 'rutas'} (${nombres}) y no puede eliminarse sin afectarlas. Cambia primero esas rutas de parada.`,
      },
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(parada).set({ deletedAt: new Date() }).where(eq(parada.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'borrar',
      recurso: { tipo: 'parada', id },
      antes: { nombre: antes.nombre, direccion: antes.direccion, lat: antes.lat, lng: antes.lng },
    });
  });

  return { ok: true, data: { id } };
}
