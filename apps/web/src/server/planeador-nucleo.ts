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
import { asignacion, camion, db, horario } from '@rutas/shared/db';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
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

// Se nombra el traslape, no el turno: un chofer puede tener varias rutas el
// mismo dia y lo unico que lo impide es que dos se encimen en horario.
export const MENSAJE_TRASLAPE =
  'Este chofer ya tiene otra ruta asignada que se superpone con este horario.';

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

  const id = crypto.randomUUID();
  return db.transaction(async (tx) => {
    // Auditoria de seguridad: `hayTraslape` es puramente en memoria — leia
    // fuera de cualquier bloqueo y decidia antes de escribir, asi que dos
    // peticiones concurrentes de asignar/reasignar al MISMO chofer el MISMO
    // dia (dos horarios distintos, dos supervisores a la vez, o un
    // doble-clic) podian pasar esta comprobacion las dos ANTES de que
    // cualquiera insertara, dejando al chofer doble-agendado en el mismo
    // turno sin que ninguna violara ninguna restriccion de la base. Un
    // advisory lock con alcance de transaccion (`_xact_`, se libera solo al
    // hacer commit o rollback — nunca hay que soltarlo a mano) serializa
    // cualquier otra transaccion que intente lo mismo para este chofer y
    // esta fecha: la segunda espera a que la primera termine, y para
    // entonces ya ve la asignacion que la primera dejo.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${choferId} || ${fecha}), 1)`);

    const asignacionesDelDia = await tx
      .select({
        horaInicioEsperada: horario.horaInicioEsperada,
        horaFinEsperada: horario.horaFinEsperada,
      })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .where(
        and(
          eq(asignacion.choferId, choferId),
          eq(asignacion.fecha, fecha),
          isNull(asignacion.canceladaEn),
        ),
      );

    if (hayTraslape(asignacionesDelDia, horarioFila)) {
      return errorConflicto(MENSAJE_TRASLAPE);
    }

    const asignacionesDelHorarioEseDia = await tx
      .select({ secuencia: asignacion.secuencia })
      .from(asignacion)
      .where(and(eq(asignacion.horarioId, horarioId), eq(asignacion.fecha, fecha)));

    const secuencia = siguienteSecuencia(asignacionesDelHorarioEseDia.map((a) => a.secuencia));

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
    // "Se crea O reasigna" (paso 14, Done-when): reasignarNucleo ya
    // encolaba esto desde el paso 7; a la creacion inicial le faltaba.
    // `on conflict ... do nothing` sobre el indice parcial (igual que
    // `encolarSiNoExiste` en apps/worker/src/push/programar.ts) porque esta
    // fila recien creada no puede tener ya una pendiente — pero el mismo
    // patron evita que un reasignar inmediato despues choque (ver abajo).
    await tx.execute(
      sql`insert into notificacion_programada (id, asignacion_id, tipo, enviar_en)
          values (${crypto.randomUUID()}, ${id}, 'asignacion_nueva', now())
          on conflict (asignacion_id, tipo) where enviado_en is null do nothing`,
    );

    return { ok: true, data: { id } } satisfies Resultado<{ id: string }>;
  });
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

  return db.transaction(async (tx) => {
    // Mismo advisory lock que asignarNucleo, y por la misma razon:
    // `hayTraslape` decidia fuera de cualquier bloqueo, asi que una
    // reasignacion concurrente al mismo chofer/fecha podia colarse en la
    // ventana entre el SELECT y el INSERT/UPDATE.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${choferId} || ${antes.fecha}), 1)`);

    const asignacionesDelDia = await tx
      .select({
        horaInicioEsperada: horario.horaInicioEsperada,
        horaFinEsperada: horario.horaFinEsperada,
      })
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

    if (hayTraslape(asignacionesDelDia, horarioFila)) {
      return errorConflicto(MENSAJE_TRASLAPE);
    }

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
    // worker la recoge por `enviar_en <= now()` (paso 13). `on conflict do
    // nothing`: si asignarNucleo (u otro reasignar) ya dejo una fila
    // pendiente para esta asignacion, no hace falta una segunda — al
    // enviarla, destinatariosDe() en apps/worker/src/push/enviar.ts resuelve
    // el chofer actual desde `asignacion` en ese momento, no desde esta fila.
    await tx.execute(
      sql`insert into notificacion_programada (id, asignacion_id, tipo, enviar_en)
          values (${crypto.randomUUID()}, ${asignacionId}, 'asignacion_nueva', now())
          on conflict (asignacion_id, tipo) where enviado_en is null do nothing`,
    );

    return { ok: true, data: { id: asignacionId } } satisfies Resultado<{ id: string }>;
  });
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

  // Nunca un DELETE: solo se desasigna al chofer marcando `cancelada_en`.
  // La ruta, el horario, las paradas y los eventos ya marcados se conservan
  // intactos — esta fila es UNICAMENTE el vinculo chofer+camion+fecha, y es
  // lo unico que se suelta. El horario queda libre para otro chofer porque
  // todas las consultas del planeador filtran por `cancelada_en is null`.
  await db.transaction(async (tx) => {
    await tx
      .update(asignacion)
      .set({ canceladaEn: new Date() })
      .where(eq(asignacion.id, asignacionId));
    // Sin esto, el chofer recien desasignado seguia recibiendo el push:
    // `destinatariosDe` en apps/worker/src/push/enviar.ts resuelve el chofer
    // desde `asignacion` al momento de enviar y no mira `cancelada_en`, asi
    // que una fila pendiente encolada por asignar/reasignar sobrevivia a la
    // cancelacion. Solo las pendientes: las ya enviadas son historial.
    await tx.execute(
      sql`delete from notificacion_programada
          where asignacion_id = ${asignacionId} and enviado_en is null`,
    );
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'cancelar',
      recurso: { tipo: 'asignacion', id: asignacionId },
      antes: { choferId: antes.choferId, camionId: antes.camionId },
    });
  });

  return { ok: true, data: { id: asignacionId } };
}
