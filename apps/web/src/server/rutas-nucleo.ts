// Sin `'use server'` a proposito: cada funcion exportada de un archivo con
// esa directiva se vuelve un endpoint invocable por RPC desde el cliente, con
// o sin auth propia. Igual que `registrarAuditoria` (lib/audit/registrar.ts),
// este modulo es el nucleo de escritura — recibe el actor ya autorizado, no
// resuelve sesion ni permisos — para que `rutas.ts` (que si valida `can()`)
// sea el unico punto de entrada real, y para que este nucleo se pueda probar
// contra Postgres sin pasar por `next/headers`, que no existe fuera de una
// peticion real de Next.
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

// Los mismos tres hitos que cierran la ventana de edicion en el resto del
// panel (§ planeador: Cancelar/Reasignar se deshabilitan igual para una
// asignacion de hoy ya completada). `inicio_ruta` cuenta porque el chofer ya
// salio siguiendo los datos viejos; `fin_ruta`/`fin_ruta_incidente` cuentan
// porque la ruta de hoy ya termino.
const EVENTOS_QUE_BLOQUEAN_EDICION = [
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
  // `activo = true` y `deleted_at is null` en la busqueda, no solo el id: sin
  // eso, desactivar dos veces el mismo horario respondia `ok` la segunda y
  // dejaba una fila de bitacora por una desactivacion que no ocurrio. El panel
  // solo ofrece el boton sobre horarios activos (listarRutas los filtra), asi
  // que un segundo intento siempre viene de una pantalla vieja.
  const [antes] = await db
    .select({ turno: horario.turno })
    .from(horario)
    .where(and(eq(horario.id, id), eq(horario.activo, true), isNull(horario.deletedAt)))
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
