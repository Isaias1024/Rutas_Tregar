// Sin `'use server'` a proposito: ahi cada export seria un endpoint RPC. Recibe
// el actor ya autorizado, para que `rutas.ts` sea la unica entrada real.
import {
  type AgregarHorario,
  type EditarHorario,
  fechaOperativa,
  type Resultado,
  type RutaCrear,
  type RutaEditar,
} from '@rutas/shared';
import { asignacion, db, evento, horario, ruta } from '@rutas/shared/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

// Los mismos tres hitos que cierran la ventana de edicion en todo el panel: el
// chofer ya salio con los datos viejos, o la ruta de hoy ya termino.
export const EVENTOS_QUE_BLOQUEAN_EDICION = [
  'inicio_ruta',
  'fin_ruta',
  'fin_ruta_incidente',
  'retorno',
] as const;

const RUTA_EN_CURSO: Resultado<never> = {
  ok: false,
  error: {
    codigo: 'validacion',
    mensaje:
      'Esta ruta ya tiene un viaje iniciado o terminado hoy. Espera a manana o edita despues de que termine el dia operativo.',
  },
};

const HORARIO_EN_CURSO: Resultado<never> = {
  ok: false,
  error: {
    codigo: 'validacion',
    mensaje:
      'Este horario ya tiene un viaje iniciado o terminado hoy. Espera a manana o edita despues de que termine el dia operativo.',
  },
};

/** `true` si ALGUN horario de esta ruta tiene una asignacion de hoy ya iniciada o terminada. */
async function rutaTieneViajeEnCursoHoy(rutaId: string): Promise<boolean> {
  const hoy = fechaOperativa(new Date());
  const filas = await db
    .select({ id: asignacion.id })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(evento, eq(evento.asignacionId, asignacion.id))
    .where(
      and(
        eq(horario.rutaId, rutaId),
        eq(asignacion.fecha, hoy),
        inArray(evento.tipo, EVENTOS_QUE_BLOQUEAN_EDICION),
      ),
    )
    .limit(1);
  return filas.length > 0;
}

/** `true` si la asignacion de hoy de este horario ya esta iniciada o terminada. */
async function horarioTieneViajeEnCursoHoy(horarioId: string): Promise<boolean> {
  const hoy = fechaOperativa(new Date());
  const filas = await db
    .select({ id: asignacion.id })
    .from(asignacion)
    .innerJoin(evento, eq(evento.asignacionId, asignacion.id))
    .where(
      and(
        eq(asignacion.horarioId, horarioId),
        eq(asignacion.fecha, hoy),
        inArray(evento.tipo, EVENTOS_QUE_BLOQUEAN_EDICION),
      ),
    )
    .limit(1);
  return filas.length > 0;
}

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

  if (await rutaTieneViajeEnCursoHoy(datos.id)) {
    return RUTA_EN_CURSO;
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

  // Nunca un DELETE: solo fija `deleted_at` y conserva la fila, aunque la ruta
  // ya tenga asignaciones.
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

export async function editarHorarioNucleo(
  actorId: string,
  datos: EditarHorario,
): Promise<Resultado<{ id: string }>> {
  const [antes] = await db
    .select()
    .from(horario)
    .where(and(eq(horario.id, datos.id), isNull(horario.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  if (await horarioTieneViajeEnCursoHoy(datos.id)) {
    return HORARIO_EN_CURSO;
  }

  const { id, ...cambios } = datos;
  await db.transaction(async (tx) => {
    await tx.update(horario).set(cambios).where(eq(horario.id, id));
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'editar',
      recurso: { tipo: 'horario', id },
      antes: {
        turno: antes.turno,
        horaInicioEsperada: antes.horaInicioEsperada,
        horaFinEsperada: antes.horaFinEsperada,
        personasEsperadas: antes.personasEsperadas,
      },
      despues: cambios,
    });
  });

  return { ok: true, data: { id } };
}

export async function desactivarHorarioNucleo(
  actorId: string,
  id: string,
): Promise<Resultado<{ id: string }>> {
  // `activo = true` y `deleted_at is null` en la busqueda: sin eso, desactivar
  // dos veces respondia `ok` y dejaba bitacora de algo que no ocurrio.
  const [antes] = await db
    .select({ turno: horario.turno })
    .from(horario)
    .where(and(eq(horario.id, id), eq(horario.activo, true), isNull(horario.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  // Nunca un DELETE: solo fija `activo = false` y conserva la fila, aunque el
  // horario ya tenga asignaciones.
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
