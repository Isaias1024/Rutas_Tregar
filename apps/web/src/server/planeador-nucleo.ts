// Sin `'use server'` a proposito (ver rutas-nucleo.ts): el nucleo recibe el
// actor ya autorizado y no toca `next/headers`, para que `planeador.ts` sea
// el unico endpoint real y este archivo se pueda probar contra Postgres sin
// una peticion real de Next.
import {
  type Asignar,
  camionDisponible,
  hayTraslape,
  type Reasignar,
  type Resultado,
  siguienteSecuencia,
} from '@rutas/shared';
import { asignacion, camion, db, horario, notificacionProgramada } from '@rutas/shared/db';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

const NO_ENCONTRADO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'El recurso no existe o ya fue borrado.' },
};

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

function errorConflicto(mensaje: string): Resultado<never> {
  return { ok: false, error: { codigo: 'conflicto', mensaje } };
}

export async function asignarNucleo(
  actorId: string,
  datos: Asignar,
): Promise<Resultado<{ id: string }>> {
  const { horarioId, fecha, choferId, camionId } = datos;

  const [horarioFila] = await db
    .select()
    .from(horario)
    .where(and(eq(horario.id, horarioId), isNull(horario.deletedAt)))
    .limit(1);
  if (!horarioFila) {
    return NO_ENCONTRADO;
  }

  const [camionFila] = await db
    .select()
    .from(camion)
    .where(and(eq(camion.id, camionId), isNull(camion.deletedAt)))
    .limit(1);
  if (!camionFila) {
    return NO_ENCONTRADO;
  }
  if (!camionDisponible(camionFila.estado)) {
    return errorValidacion('El camion esta en mantenimiento.', 'camionId');
  }

  const asignacionesDelDia = await db
    .select({ horarioId: asignacion.horarioId, turno: horario.turno })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .where(
      and(
        eq(asignacion.choferId, choferId),
        eq(asignacion.fecha, fecha),
        isNull(asignacion.canceladaEn),
      ),
    );

  if (hayTraslape(asignacionesDelDia, { id: horarioId, turno: horarioFila.turno })) {
    return errorConflicto('Este chofer ya tiene otra ruta asignada en ese turno y fecha.');
  }

  const asignacionesDelHorarioEseDia = await db
    .select({ secuencia: asignacion.secuencia })
    .from(asignacion)
    .where(and(eq(asignacion.horarioId, horarioId), eq(asignacion.fecha, fecha)));

  const secuencia = siguienteSecuencia(asignacionesDelHorarioEseDia.map((a) => a.secuencia));

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(asignacion).values({
      id,
      horarioId,
      fecha,
      secuencia,
      choferId,
      camionId,
      camionCodigo: camionFila.codigo,
      createdBy: actorId,
    });
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'crear',
      recurso: { tipo: 'asignacion', id },
      despues: { horarioId, fecha, secuencia, choferId, camionId, camionCodigo: camionFila.codigo },
    });
  });

  return { ok: true, data: { id } };
}

export async function reasignarNucleo(
  actorId: string,
  datos: Reasignar,
): Promise<Resultado<{ id: string }>> {
  const { asignacionId, choferId, camionId } = datos;

  const [antes] = await db
    .select()
    .from(asignacion)
    .where(and(eq(asignacion.id, asignacionId), isNull(asignacion.canceladaEn)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  const [horarioFila] = await db
    .select()
    .from(horario)
    .where(eq(horario.id, antes.horarioId))
    .limit(1);
  if (!horarioFila) {
    return NO_ENCONTRADO;
  }

  const [camionFila] = await db
    .select()
    .from(camion)
    .where(and(eq(camion.id, camionId), isNull(camion.deletedAt)))
    .limit(1);
  if (!camionFila) {
    return NO_ENCONTRADO;
  }
  if (!camionDisponible(camionFila.estado)) {
    return errorValidacion('El camion esta en mantenimiento.', 'camionId');
  }

  const asignacionesDelDia = await db
    .select({ horarioId: asignacion.horarioId, turno: horario.turno })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .where(
      and(
        eq(asignacion.choferId, choferId),
        eq(asignacion.fecha, antes.fecha),
        isNull(asignacion.canceladaEn),
        ne(asignacion.id, asignacionId),
      ),
    );

  if (hayTraslape(asignacionesDelDia, { id: antes.horarioId, turno: horarioFila.turno })) {
    return errorConflicto('Este chofer ya tiene otra ruta asignada en ese turno y fecha.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(asignacion)
      .set({ choferId, camionId, camionCodigo: camionFila.codigo })
      .where(eq(asignacion.id, asignacionId));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'reasignar',
      recurso: { tipo: 'asignacion', id: asignacionId },
      antes: {
        choferId: antes.choferId,
        camionId: antes.camionId,
        camionCodigo: antes.camionCodigo,
      },
      despues: { choferId, camionId, camionCodigo: camionFila.codigo },
    });
    // Reasignar de ultimo minuto se le avisa al chofer nuevo: la cola del
    // worker la recoge por `enviar_en <= now()` (paso 13).
    await tx.insert(notificacionProgramada).values({
      id: crypto.randomUUID(),
      asignacionId,
      tipo: 'asignacion_nueva',
      enviarEn: new Date(),
    });
  });

  return { ok: true, data: { id: asignacionId } };
}

export async function cancelarNucleo(
  actorId: string,
  asignacionId: string,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select()
    .from(asignacion)
    .where(and(eq(asignacion.id, asignacionId), isNull(asignacion.canceladaEn)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  // Nunca un DELETE: la fila y sus eventos se conservan, solo se marca
  // `cancelada_en` (Done-when del paso 7).
  await db.transaction(async (tx) => {
    await tx
      .update(asignacion)
      .set({ canceladaEn: new Date() })
      .where(eq(asignacion.id, asignacionId));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'cancelar',
      recurso: { tipo: 'asignacion', id: asignacionId },
      antes: { choferId: antes.choferId, camionId: antes.camionId },
    });
  });

  return { ok: true, data: { id: asignacionId } };
}
