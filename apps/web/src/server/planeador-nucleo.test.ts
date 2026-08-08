import { randomUUID } from 'node:crypto';
import {
  asignacion,
  auditLog,
  camion,
  cliente,
  db,
  horario,
  notificacionProgramada,
  parada,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asignarNucleo, cancelarNucleo, reasignarNucleo } from './planeador-nucleo.ts';

describe('planeador-nucleo contra Postgres real', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionAId = randomUUID();
  const camionBId = randomUUID();
  const rutaId = randomUUID();
  const horarioAId = randomUUID();
  const horarioBId = randomUUID();
  const horarioCId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId}), (${choferId})`);
    await db.insert(usuario).values([
      { id: actorId, credencial: `plan-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `plan-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db
      .insert(cliente)
      .values({ id: clienteId, nombre: 'Cliente de prueba (planeador-nucleo)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (planeador-nucleo)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (planeador-nucleo)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (planeador-nucleo)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values([
      {
        id: camionAId,
        codigo: `T-PN-A-${camionAId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNA-001',
      },
      {
        id: camionBId,
        codigo: `T-PN-B-${camionBId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNB-001',
      },
    ]);
    // Tres horarios del MISMO turno. El traslape se evalua por horas, no por
    // turno (packages/shared/src/asignaciones.ts): A y B estan separados y
    // pueden ser del mismo chofer el mismo dia; C cae encima de A y no.
    await db.insert(horario).values([
      {
        id: horarioAId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '06:00',
        horaFinEsperada: '07:00',
        personasEsperadas: 10,
      },
      {
        id: horarioBId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '08:00',
        horaFinEsperada: '09:00',
        personasEsperadas: 10,
      },
      {
        id: horarioCId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '06:30',
        horaFinEsperada: '07:30',
        personasEsperadas: 10,
      },
    ]);
  });

  afterAll(async () => {
    const asignacionesCreadas = await db
      .select({ id: asignacion.id })
      .from(asignacion)
      .where(eq(asignacion.choferId, choferId));
    const ids = asignacionesCreadas.map((a) => a.id);
    if (ids.length > 0) {
      await db
        .delete(notificacionProgramada)
        .where(inArray(notificacionProgramada.asignacionId, ids));
      await db.delete(auditLog).where(inArray(auditLog.recursoId, ids));
    }
    await db.execute(sql`delete from asignacion where chofer_id = ${choferId}`);
    await db.execute(
      sql`delete from horario where id in (${horarioAId}, ${horarioBId}, ${horarioCId})`,
    );
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionAId));
    await db.delete(camion).where(eq(camion.id, camionBId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, actorId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id in (${actorId}, ${choferId})`);
  });

  it('acepta dos rutas del mismo chofer el mismo dia cuando las horas no se enciman', async () => {
    // 06:00-07:00 y 08:00-09:00, mismo turno, mismo chofer, misma fecha:
    // esto es la jornada normal de un chofer y NO puede rechazarse.
    const fecha = '2026-09-01';
    const primero = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
      camionId: camionAId,
    });
    expect(primero.ok).toBe(true);

    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioBId,
      fecha,
      choferId,
      camionId: camionBId,
    });
    expect(segundo.ok).toBe(true);

    const filas = await db
      .select({ id: asignacion.id })
      .from(asignacion)
      .where(sql`chofer_id = ${choferId} and fecha = ${fecha} and cancelada_en is null`);
    expect(filas).toHaveLength(2);
  });

  it('rechaza una ruta que se encima con otra del mismo chofer ese dia', async () => {
    // horarioC (06:30-07:30) cae dentro de horarioA (06:00-07:00).
    const fecha = '2026-09-04';
    const primero = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
      camionId: camionAId,
    });
    expect(primero.ok).toBe(true);

    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioCId,
      fecha,
      choferId,
      camionId: camionBId,
    });
    expect(segundo.ok).toBe(false);
    if (!segundo.ok) {
      expect(segundo.error.codigo).toBe('conflicto');
    }
  });

  it('cancelar desasigna al chofer sin borrar la fila y deja el horario libre', async () => {
    const fecha = '2026-09-05';
    const creada = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
      camionId: camionAId,
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) {
      return;
    }

    const cancelada = await cancelarNucleo(actorId, creada.data.id);
    expect(cancelada.ok).toBe(true);

    // La fila sigue ahi (borrado logico), solo con `cancelada_en` puesto.
    const [fila] = await db
      .select({ id: asignacion.id, canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.id, creada.data.id));
    expect(fila?.id).toBe(creada.data.id);
    expect(fila?.canceladaEn).not.toBeNull();

    // El horario sigue existiendo: cancelar no toca ruta, horario ni paradas.
    const [horarioSigue] = await db
      .select({ id: horario.id })
      .from(horario)
      .where(eq(horario.id, horarioAId));
    expect(horarioSigue?.id).toBe(horarioAId);

    // Y el push pendiente se limpia: si no, el chofer recien desasignado
    // seguiria recibiendo "tienes una ruta nueva".
    const pendientes = await db
      .select({ id: notificacionProgramada.id })
      .from(notificacionProgramada)
      .where(
        and(
          eq(notificacionProgramada.asignacionId, creada.data.id),
          isNull(notificacionProgramada.enviadoEn),
        ),
      );
    expect(pendientes).toHaveLength(0);

    // El mismo chofer puede volver a tomar ese horario: la cancelada ya no
    // cuenta en su calendario.
    const reasignada = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
      camionId: camionAId,
    });
    expect(reasignada.ok).toBe(true);
  });

  // Auditoria de seguridad: prueba directa del advisory lock
  // (pg_advisory_xact_lock) agregado a asignarNucleo/reasignarNucleo.
  // Antes de ese cambio, `hayTraslape` se evaluaba FUERA de cualquier
  // bloqueo, asi que dos llamadas concurrentes para el mismo chofer/fecha
  // podian pasar la comprobacion las dos antes de que cualquiera insertara
  // — un TOCTOU real, no teorico. `Promise.all` aqui dispara las dos
  // peticiones al mismo tiempo, sin esperar una a la otra desde el lado del
  // cliente: si el lock no sirviera, ambas podrian resultar en `ok: true`.
  it('dos asignaciones concurrentes encimadas al mismo chofer/fecha: exactamente una tiene exito', async () => {
    const fecha = '2026-09-02';
    // horarioA (06:00-07:00) y horarioC (06:30-07:30) SI se enciman: es el
    // par que de verdad ejercita el lock. Con A y B (separados) las dos
    // deben pasar y la prueba no mediria nada.
    const [resultadoA, resultadoB] = await Promise.all([
      asignarNucleo(actorId, { horarioId: horarioAId, fecha, choferId, camionId: camionAId }),
      asignarNucleo(actorId, { horarioId: horarioCId, fecha, choferId, camionId: camionBId }),
    ]);

    const exitos = [resultadoA, resultadoB].filter((r) => r.ok);
    const conflictos = [resultadoA, resultadoB].filter((r) => !r.ok);
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(1);
    if (!conflictos[0]?.ok) {
      expect(conflictos[0]?.error.codigo).toBe('conflicto');
    }

    // Confirma tambien contra la base, no solo contra la respuesta: exactamente
    // una fila para este chofer en esta fecha, nunca dos.
    const filas = await db
      .select({ id: asignacion.id })
      .from(asignacion)
      .where(sql`chofer_id = ${choferId} and fecha = ${fecha} and cancelada_en is null`);
    expect(filas).toHaveLength(1);
  });

  it('reasignar hereda el mismo bloqueo: dos reasignaciones concurrentes al mismo chofer/fecha, una sola tiene exito', async () => {
    const fecha = '2026-09-03';
    // Dos asignaciones existentes, cada una a un chofer DISTINTO del que se
    // va a reasignar, para que el UNIQUE (horario_id, fecha, secuencia) no
    // interfiera con lo que esta prueba de verdad mide.
    const otroChoferId = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${otroChoferId})`);
    await db.insert(usuario).values({
      id: otroChoferId,
      credencial: `plan-otro-${otroChoferId.slice(0, 8)}`,
      rol: 'chofer',
    });

    const asignacionAId = randomUUID();
    const asignacionBId = randomUUID();
    await db.insert(asignacion).values([
      {
        id: asignacionAId,
        horarioId: horarioAId,
        fecha,
        choferId: otroChoferId,
        camionId: camionAId,
        camionCodigo: 'PNA',
        createdBy: actorId,
      },
      {
        id: asignacionBId,
        horarioId: horarioCId,
        fecha,
        choferId: otroChoferId,
        camionId: camionBId,
        camionCodigo: 'PNB',
        createdBy: actorId,
      },
    ]);

    const [resultadoA, resultadoB] = await Promise.all([
      reasignarNucleo(actorId, { asignacionId: asignacionAId, choferId, camionId: camionAId }),
      reasignarNucleo(actorId, { asignacionId: asignacionBId, choferId, camionId: camionBId }),
    ]);

    const exitos = [resultadoA, resultadoB].filter((r) => r.ok);
    expect(exitos).toHaveLength(1);

    await db.execute(
      sql`delete from notificacion_programada where asignacion_id in (${asignacionAId}, ${asignacionBId})`,
    );
    await db.execute(
      sql`delete from audit_log where recurso_id in (${asignacionAId}, ${asignacionBId})`,
    );
    await db.execute(sql`delete from asignacion where id in (${asignacionAId}, ${asignacionBId})`);
    await db.delete(usuario).where(eq(usuario.id, otroChoferId));
    await db.execute(sql`delete from auth.users where id = ${otroChoferId}`);
  });
});
