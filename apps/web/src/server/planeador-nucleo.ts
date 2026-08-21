// Sin `'use server'` a proposito (ver rutas-nucleo.ts): el nucleo recibe el
// actor ya autorizado y no toca `next/headers`, para que `planeador.ts` sea
// el unico endpoint real y este archivo se pueda probar contra Postgres sin
// una peticion real de Next.
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

// La pantalla ya oculta estos botones en un dia pasado (planeador-semana.tsx);
// esto es la misma regla del lado del servidor, que es el que de verdad
// decide — nunca hay que confiar en que el cliente no llame a la accion
// directo.
export const MENSAJE_DIA_PASADO = 'Este dia ya paso: la planeacion es de solo lectura.';

// Mismo criterio que rutas-nucleo.ts para bloquear la edicion de una ruta u
// horario ya en curso: `fin_ruta_incidente` cierra la asignacion igual que
// `retorno` (§ tabla-rutas: "lo que ya ocurrio hoy no se edita"), asi que
// Cancelar/Reasignar tienen que quedar tan bloqueados por un incidente como
// por un regreso normal — no solo del lado del cliente, el servidor es quien
// de verdad lo impone.
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
 * El camion que le toca a un chofer AHORA, resuelto desde `usuario.camion_id`
 * — nunca desde lo que mande el cliente. Es la unica autoridad sobre el par
 * chofer/camion: si Juan pasa de CAM-001 a CAM-010, la siguiente asignacion
 * usa CAM-010 sin que nadie lo escriba en ningun formulario.
 *
 * Valida de paso lo que exige el planeador antes de asignar: que el chofer
 * exista, tenga rol `chofer`, siga activo y sin baja, tenga camion, y que ese
 * camion no este borrado ni en mantenimiento.
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
  // `camionCodigo` nulo con `camionId` no nulo significa que el leftJoin no
  // encontro el camion: la FK es `on delete set null`, asi que en la practica
  // solo pasa si la fila se borro duro fuera de la app. Se trata igual que
  // "sin camion" en vez de reventar mas abajo con un codigo indefinido.
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

  // Mismo filtro que `listarHorariosActivos` (planeador.ts): un horario
  // desactivado o de una ruta ya borrada no es un horario asignable, aunque
  // la fila todavia exista. Sin el join a `ruta` y el `activo = true`, esta
  // funcion aceptaba una asignacion nueva contra un horario que el panel ya
  // no ofrece — la unica razon por la que no se veia el problema es que la
  // pantalla no deja llegar hasta aqui con ese id, no que el nucleo lo
  // rechace.
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

    // No cuenta una asignacion cuyo horario ya se desactivo o cuya ruta ya
    // se borro: esa ejecucion dejo de ser real (§ Reglas para Backend — "una
    // asignacion obsoleta no debe bloquear al chofer"), asi que no debe
    // ocupar hueco en su calendario. Se consulta el estado actual de
    // `horario`/`ruta` en cada llamada — nunca una copia — para que esto se
    // arregle solo el dia que alguien borra o desactiva la ruta A y no haga
    // falta ninguna migracion de datos para las asignaciones que ya existian.
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
      // Fotografia historica (§13): se congela el codigo que de verdad se uso
      // ese dia. Si Juan cambia de camion despues, esta fila sigue diciendo
      // cual manejo — el derivado en vivo solo gobierna las asignaciones nuevas.
      camionCodigo,
      createdBy: actorId,
    });
    await registrarAuditoria(tx, {
      actor: actorId,
      accion: 'crear',
      recurso: { tipo: 'asignacion', id },
      despues: { horarioId, fecha, secuencia, choferId, camionId, camionCodigo },
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
  // reasignar de Juan a Pedro, la fila pasa a traer el camion de Pedro sin
  // que nadie lo elija. Reasignar es justo donde una asignacion podia quedar
  // con el camion del chofer anterior.
  const camionDelChofer = await resolverCamionDelChofer(choferId);
  if (!camionDelChofer.ok) {
    return camionDelChofer;
  }
  const { id: camionId, codigo: camionCodigo } = camionDelChofer.data;

  return db.transaction(async (tx) => {
    // Mismo advisory lock que asignarNucleo, y por la misma razon:
    // `hayTraslape` decidia fuera de cualquier bloqueo, asi que una
    // reasignacion concurrente al mismo chofer/fecha podia colarse en la
    // ventana entre el SELECT y el INSERT/UPDATE.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${choferId} || ${antes.fecha}), 1)`);

    // Mismo criterio que asignarNucleo: una asignacion bajo un horario ya
    // desactivado o una ruta ya borrada no cuenta contra el calendario del
    // chofer.
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
  if (esFechaPasada(antes.fecha)) {
    return errorValidacion(MENSAJE_DIA_PASADO, 'fecha');
  }
  if (await asignacionBloqueadaHoy(asignacionId)) {
    return errorConflicto(MENSAJE_ASIGNACION_EN_CURSO);
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
