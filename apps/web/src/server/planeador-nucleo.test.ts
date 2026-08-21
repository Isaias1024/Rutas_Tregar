import { randomUUID } from 'node:crypto';
import { fechaOperativa } from '@rutas/shared';
import {
  asignacion,
  auditLog,
  camion,
  cliente,
  db,
  evento,
  horario,
  notificacionProgramada,
  parada,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asignarNucleo, cancelarNucleo, reasignarNucleo } from './planeador-nucleo.ts';
import { borrarRutaNucleo, desactivarHorarioNucleo } from './rutas-nucleo.ts';

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
    // El camion es una propiedad del chofer: sin esto, `asignarNucleo` no
    // tiene de donde sacarlo y responde "sin camion asignado". Se pone despues
    // del insert de `camion` por la FK.
    await db.update(usuario).set({ camionId: camionAId }).where(eq(usuario.id, choferId));
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
    });
    expect(primero.ok).toBe(true);

    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioBId,
      fecha,
      choferId,
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
    });
    expect(primero.ok).toBe(true);

    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioCId,
      fecha,
      choferId,
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
      asignarNucleo(actorId, { horarioId: horarioAId, fecha, choferId }),
      asignarNucleo(actorId, { horarioId: horarioCId, fecha, choferId }),
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
      reasignarNucleo(actorId, { asignacionId: asignacionAId, choferId }),
      reasignarNucleo(actorId, { asignacionId: asignacionBId, choferId }),
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

// "Reglas para Backend — Rutas, Asignaciones y Monitoreo": una asignacion
// bajo una ruta ya borrada o un horario ya desactivado no puede seguir
// contando contra el calendario del chofer, y tampoco puede recibir una
// asignacion nueva. Fixture propia (nunca la de arriba): borra/desactiva de
// verdad una ruta y esa ruta no puede seguir sirviendo a las pruebas que
// vienen despues.
describe('planeador-nucleo: una ruta borrada o un horario desactivado no bloquea al chofer', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionAId = randomUUID();
  const camionBId = randomUUID();
  const rutaAId = randomUUID();
  const rutaBId = randomUUID();
  const horarioAId = randomUUID();
  const horarioBId = randomUUID();
  const horarioC1Id = randomUUID();
  const horarioC2Id = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId}), (${choferId})`);
    await db.insert(usuario).values([
      { id: actorId, credencial: `plan-obs-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `plan-obs-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db
      .insert(cliente)
      .values({ id: clienteId, nombre: 'Cliente de prueba (planeador-nucleo obsoletas)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (planeador-nucleo obsoletas)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (planeador-nucleo obsoletas)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values([
      { id: rutaAId, clienteId, nombre: 'Ruta A (se borra)', paradaInicioId, paradaFinId },
      { id: rutaBId, clienteId, nombre: 'Ruta B (sigue activa)', paradaInicioId, paradaFinId },
    ]);
    await db.insert(camion).values([
      {
        id: camionAId,
        codigo: `T-PNO-A-${camionAId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNOA-001',
      },
      {
        id: camionBId,
        codigo: `T-PNO-B-${camionBId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNOB-001',
      },
    ]);
    await db.update(usuario).set({ camionId: camionAId }).where(eq(usuario.id, choferId));
    // horarioA (ruta A, 06:00-07:00) y horarioB (ruta B, 06:30-07:30) se
    // enciman EN HORARIO a proposito: es la unica forma de que la prueba de
    // "eliminar ruta A libera a Juan para la ruta B" de verdad ejercite el
    // traslape en vez de pasar porque nunca hubo conflicto que resolver.
    await db.insert(horario).values([
      {
        id: horarioAId,
        rutaId: rutaAId,
        turno: 'manana',
        horaInicioEsperada: '06:00',
        horaFinEsperada: '07:00',
        personasEsperadas: 10,
      },
      {
        id: horarioBId,
        rutaId: rutaBId,
        turno: 'manana',
        horaInicioEsperada: '06:30',
        horaFinEsperada: '07:30',
        personasEsperadas: 10,
      },
      // Dos horarios de la MISMA ruta B, tambien encimados, para la prueba
      // de "desactivar un horario" (la ruta en si sigue activa).
      {
        id: horarioC1Id,
        rutaId: rutaBId,
        turno: 'tarde',
        horaInicioEsperada: '14:00',
        horaFinEsperada: '15:00',
        personasEsperadas: 10,
      },
      {
        id: horarioC2Id,
        rutaId: rutaBId,
        turno: 'tarde',
        horaInicioEsperada: '14:30',
        horaFinEsperada: '15:30',
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
    }
    await db.execute(sql`delete from asignacion where chofer_id = ${choferId}`);
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.execute(
      sql`delete from horario where id in (${horarioAId}, ${horarioBId}, ${horarioC1Id}, ${horarioC2Id})`,
    );
    await db.delete(ruta).where(inArray(ruta.id, [rutaAId, rutaBId]));
    await db.delete(camion).where(inArray(camion.id, [camionAId, camionBId]));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, actorId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id in (${actorId}, ${choferId})`);
  });

  it('Caso 1 — borrar la ruta A libera a Juan para una ruta B que antes se encimaba', async () => {
    const fecha = '2026-09-10';
    const primero = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
    });
    expect(primero.ok).toBe(true);

    const borrado = await borrarRutaNucleo(actorId, rutaAId);
    expect(borrado.ok).toBe(true);

    // Sin el fix, esto respondia "conflicto": la asignacion vieja sobre la
    // ruta A ya borrada seguia contando en el calendario de Juan.
    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioBId,
      fecha,
      choferId,
    });
    expect(segundo.ok).toBe(true);
  });

  it('Caso 1b — con la ruta A ya borrada, ya no se le puede crear una asignacion nueva', async () => {
    const fecha = '2026-09-11';
    const resultado = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha,
      choferId,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('no_encontrado');
  });

  it('Caso 3 — desactivar un horario libera la disponibilidad del chofer para el que se le encimaba', async () => {
    const fecha = '2026-09-12';
    const primero = await asignarNucleo(actorId, {
      horarioId: horarioC1Id,
      fecha,
      choferId,
    });
    expect(primero.ok).toBe(true);

    const desactivado = await desactivarHorarioNucleo(actorId, horarioC1Id);
    expect(desactivado.ok).toBe(true);

    // Sin el fix, esto respondia "conflicto": la asignacion vieja sobre el
    // horario ya desactivado seguia contando en el calendario de Juan.
    const segundo = await asignarNucleo(actorId, {
      horarioId: horarioC2Id,
      fecha,
      choferId,
    });
    expect(segundo.ok).toBe(true);
  });

  it('Caso 3b — un horario ya desactivado no acepta una asignacion nueva', async () => {
    const fecha = '2026-09-13';
    const resultado = await asignarNucleo(actorId, {
      horarioId: horarioC1Id,
      fecha,
      choferId,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('no_encontrado');
  });
});

// La regla es "fecha pasada", NUNCA "hora pasada": un dia anterior es solo
// lectura, pero el dia de HOY sigue siendo administrable aunque la hora del
// horario ya haya quedado atras (Planeador administra la planeacion, no la
// ejecucion — eso es Eventos en Vivo). El horario de esta fixture es
// 00:00-00:01 a proposito: ya "termino" a cualquier hora del dia salvo la
// medianoche misma, para que la prueba de verdad ejercite que la hora no
// bloquea nada.
describe('planeador-nucleo: la fecha decide, no la hora del horario', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const chofer2Id = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const camion2Id = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();

  const hoy = fechaOperativa(new Date());
  const ayer = (() => {
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  beforeAll(async () => {
    await db.execute(
      sql`insert into auth.users (id) values (${actorId}), (${choferId}), (${chofer2Id})`,
    );
    await db.insert(usuario).values([
      { id: actorId, credencial: `plan-hoy-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `plan-hoy-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
      { id: chofer2Id, credencial: `plan-hoy-chofer2-${chofer2Id.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db
      .insert(cliente)
      .values({ id: clienteId, nombre: 'Cliente de prueba (planeador-nucleo hoy)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (planeador-nucleo hoy)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (planeador-nucleo hoy)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (planeador-nucleo hoy)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values([
      {
        id: camionId,
        codigo: `T-PNH-A-${camionId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNHA-001',
      },
      {
        id: camion2Id,
        codigo: `T-PNH-B-${camion2Id.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'PNHB-001',
      },
    ]);
    await db.update(usuario).set({ camionId }).where(eq(usuario.id, choferId));
    await db.update(usuario).set({ camionId: camion2Id }).where(eq(usuario.id, chofer2Id));
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'manana',
      horaInicioEsperada: '00:00',
      horaFinEsperada: '00:01',
      personasEsperadas: 10,
    });
  });

  afterAll(async () => {
    const asignacionesCreadas = await db
      .select({ id: asignacion.id })
      .from(asignacion)
      .where(inArray(asignacion.choferId, [choferId, chofer2Id]));
    const ids = asignacionesCreadas.map((a) => a.id);
    if (ids.length > 0) {
      await db.delete(evento).where(inArray(evento.asignacionId, ids));
      await db
        .delete(notificacionProgramada)
        .where(inArray(notificacionProgramada.asignacionId, ids));
      await db.delete(auditLog).where(inArray(auditLog.recursoId, ids));
    }
    await db.execute(sql`delete from asignacion where chofer_id in (${choferId}, ${chofer2Id})`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(inArray(camion.id, [camionId, camion2Id]));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(inArray(usuario.id, [actorId, choferId, chofer2Id]));
    await db.execute(
      sql`delete from auth.users where id in (${actorId}, ${choferId}, ${chofer2Id})`,
    );
  });

  it('una ruta de HOY con horario ya terminado se puede asignar, reasignar y cancelar', async () => {
    const creada = await asignarNucleo(actorId, { horarioId, fecha: hoy, choferId });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const reasignada = await reasignarNucleo(actorId, {
      asignacionId: creada.data.id,
      choferId: chofer2Id,
    });
    expect(reasignada.ok).toBe(true);

    const cancelada = await cancelarNucleo(actorId, creada.data.id);
    expect(cancelada.ok).toBe(true);

    const [fila] = await db
      .select({ canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.id, creada.data.id));
    expect(fila?.canceladaEn).not.toBeNull();
  });

  it('una asignacion de HOY terminada por incidente no se puede reasignar ni cancelar', async () => {
    // Mismo bloqueo que un `retorno` normal (§rutas-nucleo): un incidente
    // tambien cierra la asignacion, y antes solo la puntualidad (`retorno`)
    // lo bloqueaba — el bug que este caso cubre.
    const creada = await asignarNucleo(actorId, { horarioId, fecha: hoy, choferId });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: creada.data.id,
      tipo: 'fin_ruta_incidente',
      ocurrioEn: new Date(),
      origen: 'supervisor',
      capturadoPor: actorId,
      clientEventId: randomUUID(),
      razonIncidente: 'otro',
    });

    const reasignada = await reasignarNucleo(actorId, {
      asignacionId: creada.data.id,
      choferId: chofer2Id,
    });
    expect(reasignada.ok).toBe(false);
    if (!reasignada.ok) {
      expect(reasignada.error.codigo).toBe('conflicto');
    }

    const cancelada = await cancelarNucleo(actorId, creada.data.id);
    expect(cancelada.ok).toBe(false);
    if (!cancelada.ok) {
      expect(cancelada.error.codigo).toBe('conflicto');
    }
  });

  it('una ruta de AYER no se puede crear, reasignar ni cancelar, sin importar la hora', async () => {
    const creada = await asignarNucleo(actorId, { horarioId, fecha: ayer, choferId });
    expect(creada.ok).toBe(false);
    if (creada.ok) return;
    expect(creada.error.codigo).toBe('validacion');

    // reasignarNucleo/cancelarNucleo se prueban sobre una fila insertada
    // directo: asignarNucleo ya la rechaza, como se acaba de comprobar arriba.
    const asignacionAyerId = randomUUID();
    await db.insert(asignacion).values({
      id: asignacionAyerId,
      horarioId,
      fecha: ayer,
      choferId,
      camionId,
      camionCodigo: 'PNHA',
      createdBy: actorId,
    });

    const reasignada = await reasignarNucleo(actorId, {
      asignacionId: asignacionAyerId,
      choferId: chofer2Id,
    });
    expect(reasignada.ok).toBe(false);
    if (!reasignada.ok) {
      expect(reasignada.error.codigo).toBe('validacion');
    }

    const cancelada = await cancelarNucleo(actorId, asignacionAyerId);
    expect(cancelada.ok).toBe(false);
    if (!cancelada.ok) {
      expect(cancelada.error.codigo).toBe('validacion');
    }

    await db.delete(asignacion).where(eq(asignacion.id, asignacionAyerId));
  });
});
