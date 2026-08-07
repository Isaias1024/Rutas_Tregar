'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import { eventoManualSchema, type Resultado } from '@rutas/shared';
import { asignacion, camion, db, evento, horario, perfilPersonal, ruta } from '@rutas/shared/db';
import { TZDate } from '@date-fns/tz';
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
  const filasAsignacion = await db
    .select({
      id: asignacion.id,
      fecha: asignacion.fecha,
      horarioId: asignacion.horarioId,
      turno: horario.turno,
      horaInicioEsperada: horario.horaInicioEsperada,
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
    .where(and(eq(asignacion.fecha, fecha), isNull(asignacion.canceladaEn)))
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

  const { asignacionId, tipo, ocurrioEnLocal } = parseo.data;
  const [fechaTexto, horaTexto] = ocurrioEnLocal.split('T');
  const [anio, mes, dia] = (fechaTexto ?? '').split('-').map(Number);
  const [horas, minutos] = (horaTexto ?? '').split(':').map(Number);
  if (
    anio === undefined ||
    mes === undefined ||
    dia === undefined ||
    horas === undefined ||
    minutos === undefined
  ) {
    return errorValidacion('Fecha y hora invalidas', 'ocurrioEnLocal');
  }
  const ocurrioEn = new TZDate(anio, mes - 1, dia, horas, minutos, 0, 'America/Mexico_City');

  const id = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
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
      await registrarAuditoria(tx, {
        actor: actor.id,
        accion: 'crear',
        recurso: { tipo: 'evento', id },
        despues: { asignacionId, tipo, ocurrioEn: ocurrioEn.toISOString(), origen: 'supervisor' },
      });
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

  revalidatePath('/monitor');
  return { ok: true, data: { id } };
}
