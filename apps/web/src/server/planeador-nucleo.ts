// Sin `'use server'` a proposito (ver rutas-nucleo.ts): recibe el actor ya
// autorizado y no toca `next/headers`, asi se prueba contra Postgres sin Next.
import {
  type Asignar,
  camionDisponible,
  esFechaPasada,
  hayTraslape,
  type Reasignar,
  type Resultado,
  siguienteSecuencia,
} from '@rutas/shared';
import { asignacion, camion, db, evento, horario, ruta, usuario } from '@rutas/shared/db';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { EVENTOS_QUE_BLOQUEAN_EDICION } from '@/server/rutas-nucleo';

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

export const MENSAJE_CHOFER_SIN_CAMION =
  'Este chofer no tiene un camion asignado. Asignaselo en Catalogos > Choferes antes de planearlo.';
export const MENSAJE_CHOFER_INACTIVO = 'Este chofer esta inactivo o fue dado de baja.';

// La pantalla ya oculta estos botones en un dia pasado, pero el servidor es
// quien de verdad decide: el cliente puede llamar la accion directo.
export const MENSAJE_DIA_PASADO = 'Este dia ya paso: la planeacion es de solo lectura.';

// `fin_ruta_incidente` cierra la asignacion igual que `retorno`, asi que
// bloquea Cancelar/Reasignar lo mismo que un regreso normal.
export const MENSAJE_ASIGNACION_EN_CURSO =
  'Esta asignacion ya tiene un viaje iniciado o terminado hoy. Espera a manana o edita despues de que termine el dia operativo.';

/** `true` si esta asignacion ya registro un evento que cierra su ventana de edicion (§rutas-nucleo). */
async function asignacionBloqueadaHoy(asignacionId: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: evento.id })
    .from(evento)
    .where(
      and(
        eq(evento.asignacionId, asignacionId),
        inArray(evento.tipo, EVENTOS_QUE_BLOQUEAN_EDICION),
      ),
    )
    .limit(1);
  return !!fila;
}

/**
 * El camion que le toca a un chofer AHORA, desde `usuario.camion_id` y nunca del
 * cliente. Valida de paso rol, alta, baja y que el camion no este en taller.
 */
async function resolverCamionDelChofer(
  choferId: string,
): Promise<Resultado<{ id: string; codigo: string }>> {
  const [fila] = await db
    .select({
      choferActivo: usuario.activo,
      camionId: usuario.camionId,
      camionCodigo: camion.codigo,
      camionEstado: camion.estado,
      camionBorrado: camion.deletedAt,
    })
    .from(usuario)
    .leftJoin(camion, eq(camion.id, usuario.camionId))
    .where(and(eq(usuario.id, choferId), eq(usuario.rol, 'chofer'), isNull(usuario.deletedAt)))
    .limit(1);

  if (!fila) {
    return NO_ENCONTRADO;
  }
  if (!fila.choferActivo) {
    return errorValidacion(MENSAJE_CHOFER_INACTIVO, 'choferId');
  }
  // `camionCodigo` nulo con `camionId` no nulo solo pasa si la fila se borro
  // duro fuera de la app (la FK es `on delete set null`): se trata como sin camion.
  if (!fila.camionId || !fila.camionCodigo) {
    return errorValidacion(MENSAJE_CHOFER_SIN_CAMION, 'choferId');
  }
  if (fila.camionBorrado) {
    return errorValidacion(MENSAJE_CHOFER_SIN_CAMION, 'choferId');
  }
  if (!camionDisponible(fila.camionEstado ?? '')) {
    return errorValidacion('El camion de este chofer esta en mantenimiento.', 'choferId');
  }

  return { ok: true, data: { id: fila.camionId, codigo: fila.camionCodigo } };
}

export async function asignarNucleo(
  actorId: string,
  datos: Asignar,
): Promise<Resultado<{ id: string }>> {
  const { horarioId, fecha, choferId } = datos;

  if (esFechaPasada(fecha)) {
    return errorValidacion(MENSAJE_DIA_PASADO, 'fecha');
  }

  // Mismo filtro que `listarHorariosActivos`: un horario desactivado o de una
  // ruta borrada no es asignable aunque la fila siga existiendo.
  const [horarioFila] = await db
    .select({
      id: horario.id,
      horaInicioEsperada: horario.horaInicioEsperada,
      horaFinEsperada: horario.horaFinEsperada,
    })
    .from(horario)
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(
      and(
        eq(horario.id, horarioId),
        isNull(horario.deletedAt),
        eq(horario.activo, true),
        isNull(ruta.deletedAt),
      ),
    )
    .limit(1);
  if (!horarioFila) {
    return NO_ENCONTRADO;
  }

  const camionDelChofer = await resolverCamionDelChofer(choferId);
  if (!camionDelChofer.ok) {
    return camionDelChofer;
  }
  const { id: camionId, codigo: camionCodigo } = camionDelChofer.data;

  const id = crypto.randomUUID();
  return db.transaction(async (tx) => {
    // `hayTraslape` decide en memoria, fuera de cualquier bloqueo: sin este
    // lock dos peticiones concurrentes doble-agendan al chofer en el mismo turno.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${choferId} || ${fecha}), 1)`);

    // Una asignacion bajo un horario desactivado o una ruta borrada dejo de ser
    // real y no debe ocupar hueco en el calendario del chofer.
    const asignacionesDelDia = await tx
      .select({
        horaInicioEsperada: horario.horaInicioEsperada,
        horaFinEsperada: horario.horaFinEsperada,
      })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .innerJoin(ruta, eq(ruta.id, horario.rutaId))
      .where(
        and(
          eq(asignacion.choferId, choferId),
          eq(asignacion.fecha, fecha),
          isNull(asignacion.canceladaEn),
          isNull(horario.deletedAt),
          eq(horario.activo, true),
          isNull(ruta.deletedAt),
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
      // Fotografia historica: se congela el camion que de verdad se uso ese dia;
      // el derivado en vivo solo gobierna las asignaciones nuevas.
      camionCodigo,
      createdBy: actorId,
    });
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'crear',
      recurso: { tipo: 'asignacion', id },
      despues: { horarioId, fecha, secuencia, choferId, camionId, camionCodigo },
    });
    // `on conflict do nothing` sobre el indice parcial: evita que un reasignar
    // inmediato despues de crear encole una segunda pendiente.
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
  const { asignacionId, choferId } = datos;

  const [antes] = await db
    .select()
    .from(asignacion)
    .where(and(eq(asignacion.id, asignacionId), isNull(asignacion.canceladaEn)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }
  if (esFechaPasada(antes.fecha)) {
    return errorValidacion(MENSAJE_DIA_PASADO, 'fecha');
  }
  if (await asignacionBloqueadaHoy(asignacionId)) {
    return errorConflicto(MENSAJE_ASIGNACION_EN_CURSO);
  }

  const [horarioFila] = await db
    .select()
    .from(horario)
    .where(eq(horario.id, antes.horarioId))
    .limit(1);
  if (!horarioFila) {
    return NO_ENCONTRADO;
  }

  // El camion del chofer NUEVO, resuelto igual que en asignarNucleo: al
  // reasignar, la fila deja de quedarse con el camion del chofer anterior.
  const camionDelChofer = await resolverCamionDelChofer(choferId);
  if (!camionDelChofer.ok) {
    return camionDelChofer;
  }
  const { id: camionId, codigo: camionCodigo } = camionDelChofer.data;

  return db.transaction(async (tx) => {
    // Mismo advisory lock que asignarNucleo y por la misma razon: `hayTraslape`
    // decide fuera de cualquier bloqueo.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${choferId} || ${antes.fecha}), 1)`);

    // Mismo criterio que asignarNucleo: una asignacion bajo un horario
    // desactivado o una ruta borrada no cuenta contra el calendario.
    const asignacionesDelDia = await tx
      .select({
        horaInicioEsperada: horario.horaInicioEsperada,
        horaFinEsperada: horario.horaFinEsperada,
      })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .innerJoin(ruta, eq(ruta.id, horario.rutaId))
      .where(
        and(
          eq(asignacion.choferId, choferId),
          eq(asignacion.fecha, antes.fecha),
          isNull(asignacion.canceladaEn),
          ne(asignacion.id, asignacionId),
          isNull(horario.deletedAt),
          eq(horario.activo, true),
          isNull(ruta.deletedAt),
        ),
      );

    if (hayTraslape(asignacionesDelDia, horarioFila)) {
      return errorConflicto(MENSAJE_TRASLAPE);
    }

    await tx
      .update(asignacion)
      .set({ choferId, camionId, camionCodigo })
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
      despues: { choferId, camionId, camionCodigo },
    });
    // `on conflict do nothing`: basta una pendiente por asignacion — al enviar,
    // `destinatariosDe` resuelve el chofer actual, no el de esta fila.
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
  if (esFechaPasada(antes.fecha)) {
    return errorValidacion(MENSAJE_DIA_PASADO, 'fecha');
  }
  if (await asignacionBloqueadaHoy(asignacionId)) {
    return errorConflicto(MENSAJE_ASIGNACION_EN_CURSO);
  }

  // Nunca un DELETE: cancelar solo suelta el vinculo chofer+camion+fecha. El
  // horario queda libre porque todo el planeador filtra `cancelada_en is null`.
  await db.transaction(async (tx) => {
    await tx
      .update(asignacion)
      .set({ canceladaEn: new Date() })
      .where(eq(asignacion.id, asignacionId));
    // `destinatariosDe` resuelve el chofer al momento de enviar y no mira
    // `cancelada_en`: sin esto el chofer desasignado seguia recibiendo el push.
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
