'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import {
  eventoManualSchema,
  incidenteManualSchema,
  interpretarHoraLocal,
  puedeRegistrar,
  requiereContador,
  type Resultado,
} from '@rutas/shared';
import { asignacion, camion, db, evento, horario, perfilPersonal, ruta } from '@rutas/shared/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { obtenerUsuarioActual } from '@/server/sesion';

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para capturar eventos.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'capturar_evento')) {
    return null;
  }
  return actor;
}

// === consulta del dia ===============================================================

export async function listarMonitorDelDia(fecha: string) {
  // Monitor no guarda su propia copia de que ruta esta activa: consulta
  // `ruta`/`horario` en vivo en cada llamada. Si la ruta se borro o el
  // horario se desactivo despues de crear esta asignacion, la fila deja de
  // calificar aqui aunque `asignacion.cancelada_en` siga nulo — es lo que
  // impide que una ruta eliminada "sobreviva" en el monitor del dia.
  const filasAsignacion = await db
    .select({
      id: asignacion.id,
      fecha: asignacion.fecha,
      horarioId: asignacion.horarioId,
      turno: horario.turno,
      horaInicioEsperada: horario.horaInicioEsperada,
      horaFinEsperada: horario.horaFinEsperada,
      rutaNombre: ruta.nombre,
      choferNombre: perfilPersonal.nombre,
      camionCodigo: asignacion.camionCodigo,
      camionEstado: camion.estado,
    })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, asignacion.choferId))
    .innerJoin(camion, eq(camion.id, asignacion.camionId))
    .where(
      and(
        eq(asignacion.fecha, fecha),
        isNull(asignacion.canceladaEn),
        isNull(horario.deletedAt),
        eq(horario.activo, true),
        isNull(ruta.deletedAt),
      ),
    )
    .orderBy(horario.horaInicioEsperada);

  const asignacionIds = filasAsignacion.map((fila) => fila.id);
  const filasEvento =
    asignacionIds.length > 0
      ? await db
          .select({
            asignacionId: evento.asignacionId,
            tipo: evento.tipo,
            ocurrioEn: evento.ocurrioEn,
            recibidoEn: evento.recibidoEn,
          })
          .from(evento)
          .where(inArray(evento.asignacionId, asignacionIds))
      : [];

  const eventosPorAsignacion = new Map<string, typeof filasEvento>();
  for (const fila of filasEvento) {
    const lista = eventosPorAsignacion.get(fila.asignacionId) ?? [];
    lista.push(fila);
    eventosPorAsignacion.set(fila.asignacionId, lista);
  }

  return filasAsignacion.map((fila) => ({
    ...fila,
    eventos: eventosPorAsignacion.get(fila.id) ?? [],
  }));
}

// === captura manual ==================================================================

export async function registrarEventoManual(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = eventoManualSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const { asignacionId, tipo, ocurrioEnLocal, cantidad } = parseo.data;
  const ocurrioEn = interpretarHoraLocal(ocurrioEnLocal);
  if (!ocurrioEn) {
    return errorValidacion('Fecha y hora invalidas', 'ocurrioEnLocal');
  }

  const id = crypto.randomUUID();
  let resultado: Resultado<{ id: string }>;
  try {
    resultado = await db.transaction(async (tx) => {
      // Misma maquina de estados que sigue el chofer en la app (§ flujo.ts,
      // `puedeRegistrar`): la pantalla del supervisor ya solo ofrece el
      // siguiente paso, pero esto es lo que de verdad lo impone — nunca hay
      // que confiar en que el cliente mande el `tipo` correcto.
      const eventosExistentes = await tx
        .select({ tipo: evento.tipo })
        .from(evento)
        .where(eq(evento.asignacionId, asignacionId));
      if (!puedeRegistrar(tipo, eventosExistentes)) {
        return errorValidacion(
          'Ese no es el siguiente paso de la secuencia para esta ruta.',
          'tipo',
        );
      }

      // Sin GPS a proposito: es una captura manual del supervisor, nunca
      // trae coordenadas del dispositivo del chofer.
      await tx.insert(evento).values({
        id,
        asignacionId,
        tipo,
        ocurrioEn,
        lat: null,
        lng: null,
        gpsPrecisionM: null,
        sinGps: true,
        // Fijo, nunca lo que mande el cliente: es lo que distingue un
        // reporte del supervisor de uno que de verdad vino de la app.
        origen: 'supervisor',
        capturadoPor: actor.id,
        clientEventId: crypto.randomUUID(),
      });

      // Mismos dos pasos que la cola del chofer (apps/mobile/src/outbox/
      // flusher.ts): el evento vive en `evento` (append-only) y el contador
      // vive en `asignacion`, nunca en la fila del evento.
      if (requiereContador(tipo) && cantidad !== undefined) {
        await tx
          .update(asignacion)
          .set(tipo === 'fin_ruta' ? { cntAbordaron: cantidad } : { cntRetornaron: cantidad })
          .where(eq(asignacion.id, asignacionId));
      }

      await registrarAuditoria(tx, {
        actor: actor.id,
        accion: 'crear',
        recurso: { tipo: 'evento', id },
        despues: {
          asignacionId,
          tipo,
          ocurrioEn: ocurrioEn.toISOString(),
          origen: 'supervisor',
          ...(requiereContador(tipo) ? { cantidad } : {}),
        },
      });

      return { ok: true, data: { id } } satisfies Resultado<{ id: string }>;
    });
  } catch (error) {
    // Unique violation: (asignacion_id, tipo) ya existe (23505) — el evento
    // ya estaba registrado, casi siempre porque el chofer lo marco primero.
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return errorValidacion(
        'Ese paso ya tiene un evento registrado para esta asignacion.',
        'tipo',
      );
    }
    throw error;
  }

  if (resultado.ok) {
    revalidatePath('/monitor');
  }
  return resultado;
}

// === incidente (fuera de la secuencia) ==============================================

/**
 * Cierra una ruta por incidente desde el panel, cuando el chofer no pudo
 * hacerlo desde la app (telefono sin bateria, sin senal, o el chofer mismo
 * incomunicado — que es justo cuando hay un incidente que reportar).
 *
 * Es una accion aparte de `registrarEventoManual` a proposito, y no pasa por
 * `siguientePaso()`: `fin_ruta_incidente` no pertenece a `ORDEN_PASOS`, se
 * puede registrar en cualquier momento mientras la ruta no haya cerrado ya, y
 * exige una razon que ningun paso de la secuencia pide. Meterla en la misma
 * accion obligaria a `siguientePaso()` a proponer algo que por definicion no
 * propone. Quien impone la regla sigue siendo `puedeRegistrar`, aqui abajo.
 */
export async function registrarIncidenteManual(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = incidenteManualSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const { asignacionId, ocurrioEnLocal, razonIncidente } = parseo.data;
  const ocurrioEn = interpretarHoraLocal(ocurrioEnLocal);
  if (!ocurrioEn) {
    return errorValidacion('Fecha y hora invalidas', 'ocurrioEnLocal');
  }

  const id = crypto.randomUUID();
  let resultado: Resultado<{ id: string }>;
  try {
    resultado = await db.transaction(async (tx) => {
      const eventosExistentes = await tx
        .select({ tipo: evento.tipo })
        .from(evento)
        .where(eq(evento.asignacionId, asignacionId));
      if (!puedeRegistrar('fin_ruta_incidente', eventosExistentes)) {
        return errorValidacion('Esta ruta ya esta cerrada.', 'asignacionId');
      }

      await tx.insert(evento).values({
        id,
        asignacionId,
        tipo: 'fin_ruta_incidente',
        ocurrioEn,
        lat: null,
        lng: null,
        gpsPrecisionM: null,
        sinGps: true,
        origen: 'supervisor',
        capturadoPor: actor.id,
        clientEventId: crypto.randomUUID(),
        razonIncidente,
      });

      await registrarAuditoria(tx, {
        actor: actor.id,
        accion: 'crear',
        recurso: { tipo: 'evento', id },
        despues: {
          asignacionId,
          tipo: 'fin_ruta_incidente',
          ocurrioEn: ocurrioEn.toISOString(),
          origen: 'supervisor',
          razonIncidente,
        },
      });

      return { ok: true, data: { id } } satisfies Resultado<{ id: string }>;
    });
  } catch (error) {
    // Mismo caso que arriba: el chofer alcanzo a marcarlo desde la app entre
    // que se abrio el dialogo y se confirmo.
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return errorValidacion('Esta ruta ya tiene un incidente registrado.', 'asignacionId');
    }
    throw error;
  }

  if (resultado.ok) {
    revalidatePath('/monitor');
  }
  return resultado;
}
