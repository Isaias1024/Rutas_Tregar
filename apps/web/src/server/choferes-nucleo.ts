// Sin `'use server'` a proposito (ver rutas-nucleo.ts, planeador-nucleo.ts):
// el nucleo recibe el actor ya autorizado y no toca `next/headers`, para que
// `catalogos.ts`/`baja.ts` sean los unicos endpoints reales y este archivo se
// pueda probar contra Postgres sin una peticion real de Next.
import { fechaOperativa } from '@rutas/shared';
import {
  asignacion,
  camion,
  db,
  horario,
  notificacionProgramada,
  perfilPersonal,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { registrarAuditoria } from '@/lib/audit/registrar';

/** El mismo `tx` que produce `db.transaction`, igual que en registrar.ts. */
type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface RutaActivaDeChofer {
  asignacionId: string;
  fecha: string;
  turno: string;
  horaInicioEsperada: string;
  rutaNombre: string;
  camionCodigo: string;
}

/**
 * Las rutas de HOY EN ADELANTE que trae un chofer: lo que hay que enseñarle
 * al usuario antes de darlo de baja, y exactamente el mismo conjunto que
 * `liberarAsignacionesFuturas` va a soltar si confirma. Las dos funciones
 * comparten el filtro (`condicionFuturasDe`) a proposito — si la advertencia
 * y la accion pudieran divergir, el usuario estaria confirmando una lista y
 * el sistema aplicando otra.
 *
 * "Hoy" se calcula en la zona operativa, no en UTC: a las 23:00 en Monterrey
 * ya es el dia siguiente en UTC y la ruta de las 04:00 de mañana se veria
 * como pasada.
 *
 * Se excluyen las asignaciones bajo ruta borrada u horario desactivado por la
 * misma razon que en el planeador: ya no son ejecuciones reales, no bloquean
 * a nadie y no tienen por que aparecer en una advertencia.
 */
function condicionFuturasDe(choferId: string, desde: string) {
  return and(
    eq(asignacion.choferId, choferId),
    gte(asignacion.fecha, desde),
    isNull(asignacion.canceladaEn),
    isNull(horario.deletedAt),
    eq(horario.activo, true),
    isNull(ruta.deletedAt),
  );
}

export async function rutasActivasDeChofer(
  choferId: string,
  ahora: Date = new Date(),
): Promise<RutaActivaDeChofer[]> {
  return db
    .select({
      asignacionId: asignacion.id,
      fecha: asignacion.fecha,
      turno: horario.turno,
      horaInicioEsperada: horario.horaInicioEsperada,
      rutaNombre: ruta.nombre,
      camionCodigo: asignacion.camionCodigo,
    })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(condicionFuturasDe(choferId, fechaOperativa(ahora)))
    .orderBy(asc(asignacion.fecha), asc(horario.horaInicioEsperada));
}

/**
 * Suelta las asignaciones de hoy en adelante de un chofer que se va, DENTRO
 * de la transaccion de quien llama (la baja y la liberacion se aplican o
 * fallan juntas).
 *
 * Marca `cancelada_en` — nunca un DELETE — asi que la ruta, el horario, las
 * paradas, el cliente, el camion y los eventos ya marcados quedan intactos, y
 * el horario queda libre para otro chofer porque todas las consultas del
 * planeador filtran `cancelada_en is null`. Las asignaciones PASADAS no se
 * tocan: son el historial laboral que la baja tiene que conservar.
 *
 * Devuelve los ids liberados para que quien llama los deje en la bitacora.
 */
export async function liberarAsignacionesFuturas(
  tx: Transaccion,
  choferId: string,
  ahora: Date = new Date(),
): Promise<string[]> {
  const desde = fechaOperativa(ahora);

  const porLiberar = await tx
    .select({ id: asignacion.id })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(condicionFuturasDe(choferId, desde));

  const ids = porLiberar.map((fila) => fila.id);
  if (ids.length === 0) {
    return [];
  }

  // Se cancela por lista de ids y no con un `update ... from`: el conjunto ya
  // quedo acotado arriba por el mismo filtro que vio el usuario, y asi la
  // escritura no puede alcanzar ninguna fila que la advertencia no mostrara.
  await tx.update(asignacion).set({ canceladaEn: new Date() }).where(inArray(asignacion.id, ids));

  // Mismo motivo que en cancelarNucleo: el chofer que acaba de salir no debe
  // recibir el push de "tienes una ruta nueva". Solo las pendientes; las ya
  // enviadas son historial.
  await tx
    .delete(notificacionProgramada)
    .where(
      and(
        inArray(notificacionProgramada.asignacionId, ids),
        isNull(notificacionProgramada.enviadoEn),
      ),
    );

  return ids;
}

/**
 * La parte comun de "este chofer se va": libera sus rutas futuras y deja UNA
 * entrada de bitacora que dice cuales fueron. La usan tanto el borrado del
 * catalogo (`borrarChofer`) como la baja de la LFPDPPP (`bajaEmpleadoNucleo`),
 * que se diferencian en lo demas pero coinciden exactamente en esto.
 */
export async function liberarYAuditar(
  tx: Transaccion,
  actorId: string,
  choferId: string,
  ahora: Date = new Date(),
): Promise<string[]> {
  const liberadas = await liberarAsignacionesFuturas(tx, choferId, ahora);
  if (liberadas.length > 0) {
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'liberar_asignaciones',
      recurso: { tipo: 'usuario', id: choferId },
      despues: { asignacionesLiberadas: liberadas },
    });
  }
  return liberadas;
}

/** Los camiones que se le pueden asignar a un chofer (catalogo vivo). */
export async function listarCamionesAsignables() {
  return db
    .select({ id: camion.id, codigo: camion.codigo, estado: camion.estado })
    .from(camion)
    .where(isNull(camion.deletedAt))
    .orderBy(camion.codigo);
}

/** Choferes con el codigo de su camion resuelto, para el catalogo. */
export async function listarChoferesConCamion() {
  return db
    .select({
      id: usuario.id,
      credencial: usuario.credencial,
      activo: usuario.activo,
      camionId: usuario.camionId,
      camionCodigo: camion.codigo,
      nombre: perfilPersonal.nombre,
      correo: perfilPersonal.correo,
      telefono: perfilPersonal.telefono,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .leftJoin(camion, eq(camion.id, usuario.camionId))
    .where(and(eq(usuario.rol, 'chofer'), isNull(usuario.deletedAt)))
    .orderBy(perfilPersonal.nombre);
}
