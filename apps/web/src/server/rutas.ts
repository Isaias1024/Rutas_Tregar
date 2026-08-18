'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import {
  agregarHorarioSchema,
  editarHorarioSchema,
  fechaOperativa,
  idSchema,
  type Resultado,
  rutaCrearSchema,
  rutaEditarSchema,
} from '@rutas/shared';
import { asignacion, cliente, db, evento, horario, parada, ruta } from '@rutas/shared/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import {
  actualizarRutaNucleo,
  agregarHorarioNucleo,
  borrarRutaNucleo,
  crearRutaNucleo,
  desactivarHorarioNucleo,
  editarHorarioNucleo,
} from '@/server/rutas-nucleo';
import { obtenerUsuarioActual } from '@/server/sesion';

// Mismo orden obligatorio que catalogos.ts: parsear con zod -> can() ->
// transaccion -> escribir -> registrarAuditoria (misma tx) -> cerrar. La
// transaccion, la escritura y la auditoria viven en rutas-nucleo.ts; aqui
// solo se parsea, se autoriza y se revalida la cache.

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para administrar rutas.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'gestionar_rutas_paradas')) {
    return null;
  }
  return actor;
}

// === consultas =====================================================================

const paradaInicio = alias(parada, 'parada_inicio');
const paradaFin = alias(parada, 'parada_fin');

export async function listarRutas() {
  const filasRuta = await db
    .select({
      id: ruta.id,
      nombre: ruta.nombre,
      clienteId: ruta.clienteId,
      clienteNombre: cliente.nombre,
      paradaInicioId: ruta.paradaInicioId,
      paradaInicioNombre: paradaInicio.nombre,
      paradaFinId: ruta.paradaFinId,
      paradaFinNombre: paradaFin.nombre,
      activa: ruta.activa,
    })
    .from(ruta)
    .innerJoin(cliente, eq(cliente.id, ruta.clienteId))
    .innerJoin(paradaInicio, eq(paradaInicio.id, ruta.paradaInicioId))
    .innerJoin(paradaFin, eq(paradaFin.id, ruta.paradaFinId))
    .where(isNull(ruta.deletedAt))
    .orderBy(ruta.nombre);

  // `bloqueadaHoy`: ya hay un viaje de hoy en este horario que arranco o
  // termino (mismos hitos que cierran Cancelar/Reasignar en el planeador).
  // El panel deshabilita "Editar" con esto para no dejar que el supervisor
  // escriba un cambio que el nucleo va a rechazar de todas formas.
  const hoy = fechaOperativa(new Date());
  const filasHorario = await db
    .select({
      id: horario.id,
      rutaId: horario.rutaId,
      turno: horario.turno,
      horaInicioEsperada: horario.horaInicioEsperada,
      horaFinEsperada: horario.horaFinEsperada,
      personasEsperadas: horario.personasEsperadas,
      activo: horario.activo,
      bloqueadaHoy: sql<boolean>`exists(
        select 1 from ${asignacion}
        where ${asignacion.horarioId} = ${horario.id}
          and ${asignacion.fecha} = ${hoy}
          and exists(
            select 1 from ${evento}
            where ${evento.asignacionId} = ${asignacion.id}
              and ${evento.tipo} in ('inicio_ruta', 'fin_ruta', 'fin_ruta_incidente', 'retorno')
          )
      )`,
    })
    .from(horario)
    .where(and(isNull(horario.deletedAt), eq(horario.activo, true)));

  const horariosPorRuta = new Map<string, typeof filasHorario>();
  for (const fila of filasHorario) {
    const lista = horariosPorRuta.get(fila.rutaId) ?? [];
    lista.push(fila);
    horariosPorRuta.set(fila.rutaId, lista);
  }

  return filasRuta.map((fila) => ({
    ...fila,
    horarios: horariosPorRuta.get(fila.id) ?? [],
  }));
}

// === ruta ===========================================================================

export async function crearRuta(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = rutaCrearSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    // El ultimo segmento de la ruta, no el primero: un horario invalido
    // dentro de `horarios[]` reporta la ruta completa (`horarios.0.campo`),
    // y el campo que de verdad importa nombrar es el ultimo (`campo`), no el
    // nombre del arreglo que lo contiene.
    return errorValidacion(
      primero?.message ?? 'Entrada invalida',
      primero?.path[primero.path.length - 1]?.toString(),
    );
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await crearRutaNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}

export async function actualizarRuta(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = rutaEditarSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    // El ultimo segmento de la ruta, no el primero: un horario invalido
    // dentro de `horarios[]` reporta la ruta completa (`horarios.0.campo`),
    // y el campo que de verdad importa nombrar es el ultimo (`campo`), no el
    // nombre del arreglo que lo contiene.
    return errorValidacion(
      primero?.message ?? 'Entrada invalida',
      primero?.path[primero.path.length - 1]?.toString(),
    );
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await actualizarRutaNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}

export async function borrarRuta(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await borrarRutaNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}

// === horario ========================================================================

export async function agregarHorario(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = agregarHorarioSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    // El ultimo segmento de la ruta, no el primero: un horario invalido
    // dentro de `horarios[]` reporta la ruta completa (`horarios.0.campo`),
    // y el campo que de verdad importa nombrar es el ultimo (`campo`), no el
    // nombre del arreglo que lo contiene.
    return errorValidacion(
      primero?.message ?? 'Entrada invalida',
      primero?.path[primero.path.length - 1]?.toString(),
    );
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await agregarHorarioNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}

export async function editarHorario(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = editarHorarioSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(
      primero?.message ?? 'Entrada invalida',
      primero?.path[primero.path.length - 1]?.toString(),
    );
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await editarHorarioNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}

export async function desactivarHorario(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await desactivarHorarioNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/rutas');
  }
  return resultado;
}
