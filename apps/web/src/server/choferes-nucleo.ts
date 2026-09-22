// Sin `'use server'` a proposito (ver rutas-nucleo.ts): recibe el actor ya
// autorizado y no toca `next/headers`, asi se prueba contra Postgres sin Next.
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
 * Las rutas de HOY EN ADELANTE de un chofer: lo que se le muestra antes de la
 * baja y justo lo que se soltara, por el filtro compartido `condicionFuturasDe`.
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
 * Suelta las asignaciones futuras dentro de la transaccion de quien llama; marca
 * `cancelada_en`, no toca las pasadas y devuelve los ids para la bitacora.
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

  // Se cancela por lista de ids y no con un `update ... from`: asi la escritura
  // no puede alcanzar ninguna fila que la advertencia no mostrara.
  await tx.update(asignacion).set({ canceladaEn: new Date() }).where(inArray(asignacion.id, ids));

  // Mismo motivo que en cancelarNucleo: el chofer que salio no debe recibir el
  // push de "tienes una ruta nueva". Solo las pendientes.
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
 * La parte comun de "este chofer se va", compartida por el borrado del catalogo
 * y la baja de la LFPDPPP: libera rutas futuras y deja UNA entrada de bitacora.
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
