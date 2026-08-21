'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import { asignarSchema, cancelarSchema, type Resultado, reasignarSchema } from '@rutas/shared';
import {
  asignacion,
  camion,
  db,
  evento,
  horario,
  perfilPersonal,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import { asignarNucleo, cancelarNucleo, reasignarNucleo } from '@/server/planeador-nucleo';
import { obtenerUsuarioActual } from '@/server/sesion';

// Mismo orden obligatorio que catalogos.ts/rutas.ts: parsear con zod ->
// can() -> transaccion -> escribir -> registrarAuditoria (misma tx) ->
// cerrar. La transaccion, la escritura y la auditoria viven en
// planeador-nucleo.ts.

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para planear.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'planear')) {
    return null;
  }
  return actor;
}

// === consultas =====================================================================

export async function listarHorariosActivos() {
  return db
    .select({
      id: horario.id,
      turno: horario.turno,
      horaInicioEsperada: horario.horaInicioEsperada,
      horaFinEsperada: horario.horaFinEsperada,
      personasEsperadas: horario.personasEsperadas,
      rutaId: ruta.id,
      rutaNombre: ruta.nombre,
    })
    .from(horario)
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(and(isNull(horario.deletedAt), eq(horario.activo, true), isNull(ruta.deletedAt)))
    .orderBy(horario.horaInicioEsperada);
}

export async function listarAsignacionesSemana(fechas: string[]) {
  if (fechas.length === 0) {
    return [];
  }
  return db
    .select({
      id: asignacion.id,
      horarioId: asignacion.horarioId,
      fecha: asignacion.fecha,
      secuencia: asignacion.secuencia,
      choferId: asignacion.choferId,
      choferNombre: perfilPersonal.nombre,
      camionId: asignacion.camionId,
      camionCodigo: asignacion.camionCodigo,
      // Mismo criterio que planeador-nucleo.ts (`asignacionBloqueadaHoy`): un
      // regreso normal y un cierre por incidente bloquean la edicion igual.
      // Esto solo evita ofrecer un boton que el servidor iba a rechazar.
      bloqueada: sql<boolean>`exists(
        select 1 from ${evento}
        where ${evento.asignacionId} = ${asignacion.id}
          and ${evento.tipo} in ('inicio_ruta', 'fin_ruta', 'fin_ruta_incidente', 'retorno')
      )`,
    })
    .from(asignacion)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, asignacion.choferId))
    .where(and(inArray(asignacion.fecha, fechas), isNull(asignacion.canceladaEn)));
}

/**
 * Los choferes que se pueden planear, cada uno con el camion que trae HOY.
 *
 * El camion viaja junto al chofer porque el planeador ya no lo elige: lo
 * muestra. Un chofer sin camion (o con el camion en mantenimiento) llega con
 * `camionCodigo` nulo / `camionEnMantenimiento` en true para que la pantalla
 * lo pueda apagar antes de que el servidor lo rechace — la decision real
 * sigue siendo la de `asignarNucleo`.
 */
export async function listarChoferesElegibles() {
  return db
    .select({
      id: usuario.id,
      nombre: perfilPersonal.nombre,
      camionCodigo: camion.codigo,
      camionEnMantenimiento: sql<boolean>`coalesce(${camion.estado} = 'mantenimiento', false)`,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .leftJoin(camion, and(eq(camion.id, usuario.camionId), isNull(camion.deletedAt)))
    .where(and(eq(usuario.rol, 'chofer'), eq(usuario.activo, true), isNull(usuario.deletedAt)))
    .orderBy(perfilPersonal.nombre);
}

// === mutaciones =====================================================================

export async function asignar(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = asignarSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await asignarNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/planeador');
  }
  return resultado;
}

export async function reasignar(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = reasignarSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await reasignarNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/planeador');
  }
  return resultado;
}

export async function cancelar(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = cancelarSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await cancelarNucleo(actor.id, parseo.data.asignacionId);
  if (resultado.ok) {
    revalidatePath('/planeador');
  }
  return resultado;
}
