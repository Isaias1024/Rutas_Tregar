// Sin `'use server'` a proposito: cada funcion exportada de un archivo con
// esa directiva se vuelve un endpoint invocable por RPC desde el cliente, con
// o sin auth propia. Igual que `registrarAuditoria` (lib/audit/registrar.ts),
// este modulo es el nucleo de escritura — recibe el actor ya autorizado, no
// resuelve sesion ni permisos — para que `rutas.ts` (que si valida `can()`)
// sea el unico punto de entrada real, y para que este nucleo se pueda probar
// contra Postgres sin pasar por `next/headers`, que no existe fuera de una
// peticion real de Next.
import type { AgregarHorario, Resultado, RutaCrear, RutaEditar } from '@rutas/shared';
import { db, horario, ruta } from '@rutas/shared/db';
import { and, eq, isNull } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

const NO_ENCONTRADO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'El recurso no existe o ya fue borrado.' },
};

export async function crearRutaNucleo(
  actorId: string,
  datos: RutaCrear,
): Promise<Resultado<{ id: string }>> {
  const { horarios, ...datosRuta } = datos;
  const id = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(ruta).values({ id, ...datosRuta });
    await tx
      .insert(horario)
      .values(horarios.map((h) => ({ id: crypto.randomUUID(), rutaId: id, ...h })));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'crear',
      recurso: { tipo: 'ruta', id },
      despues: { ...datosRuta, horarios: horarios.length },
    });
  });

  return { ok: true, data: { id } };
}

export async function actualizarRutaNucleo(
  actorId: string,
  datos: RutaEditar,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select()
    .from(ruta)
    .where(and(eq(ruta.id, datos.id), isNull(ruta.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  const { id, ...cambios } = datos;
  await db.transaction(async (tx) => {
    await tx.update(ruta).set(cambios).where(eq(ruta.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'editar',
      recurso: { tipo: 'ruta', id },
      antes: {
        clienteId: antes.clienteId,
        nombre: antes.nombre,
        paradaInicioId: antes.paradaInicioId,
        paradaFinId: antes.paradaFinId,
      },
      despues: cambios,
    });
  });

  return { ok: true, data: { id } };
}

export async function borrarRutaNucleo(
  actorId: string,
  id: string,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select({ nombre: ruta.nombre })
    .from(ruta)
    .where(and(eq(ruta.id, id), isNull(ruta.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  // Nunca un DELETE: aunque la ruta ya tenga asignaciones, esto solo fija
  // `deleted_at` y conserva la fila (Done-when del paso 6).
  await db.transaction(async (tx) => {
    await tx.update(ruta).set({ deletedAt: new Date() }).where(eq(ruta.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'borrar',
      recurso: { tipo: 'ruta', id },
      antes: { nombre: antes.nombre },
    });
  });

  return { ok: true, data: { id } };
}

export async function agregarHorarioNucleo(
  actorId: string,
  datos: AgregarHorario,
): Promise<Resultado<{ id: string }>> {
  const [rutaExistente] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(and(eq(ruta.id, datos.rutaId), isNull(ruta.deletedAt)))
    .limit(1);
  if (!rutaExistente) {
    return NO_ENCONTRADO;
  }

  const { rutaId, ...datosHorario } = datos;
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(horario).values({ id, rutaId, ...datosHorario });
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'crear',
      recurso: { tipo: 'horario', id },
      despues: { rutaId, ...datosHorario },
    });
  });

  return { ok: true, data: { id } };
}

export async function desactivarHorarioNucleo(
  actorId: string,
  id: string,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select({ turno: horario.turno })
    .from(horario)
    .where(eq(horario.id, id))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  // Nunca un DELETE: aunque el horario ya tenga asignaciones, esto solo fija
  // `activo = false` y conserva la fila (Done-when del paso 6).
  await db.transaction(async (tx) => {
    await tx.update(horario).set({ activo: false }).where(eq(horario.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'borrar',
      recurso: { tipo: 'horario', id },
      antes: { turno: antes.turno },
    });
  });

  return { ok: true, data: { id } };
}
