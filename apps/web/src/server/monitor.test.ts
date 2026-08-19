import { randomUUID } from 'node:crypto';
import { asignacion, camion, cliente, db, horario, parada, ruta, usuario } from '@rutas/shared/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listarMonitorDelDia, registrarIncidenteManual } from './monitor.ts';
import { asignarNucleo } from './planeador-nucleo.ts';
import { borrarRutaNucleo, desactivarHorarioNucleo } from './rutas-nucleo.ts';

// "Reglas para Backend — Rutas, Asignaciones y Monitoreo", Caso 2: una ruta
// eliminada (o un horario desactivado) no debe seguir apareciendo en Monitor
// aunque su asignacion siga con `cancelada_en` nulo — Monitor consulta el
// estado actual de `ruta`/`horario` en vivo, nunca una copia.
describe('monitor: una ruta borrada o un horario desactivado desaparece del monitor del dia', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId}), (${choferId})`);
    await db.insert(usuario).values([
      { id: actorId, credencial: `monitor-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `monitor-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (monitor)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (monitor)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (monitor)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (monitor)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-MON-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'MON-001',
    });
    // El planeador deriva el camion del chofer: sin este vinculo no se puede
    // asignar. Va despues del insert de `camion` por la FK.
    await db.update(usuario).set({ camionId }).where(eq(usuario.id, choferId));
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'manana',
      horaInicioEsperada: '06:00',
      horaFinEsperada: '07:00',
      personasEsperadas: 10,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from asignacion where chofer_id = ${choferId}`);
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(inArray(usuario.id, [actorId, choferId]));
    await db.execute(sql`delete from auth.users where id in (${actorId}, ${choferId})`);
  });

  it('la asignacion aparece en Monitor mientras la ruta y el horario siguen activos', async () => {
    const fecha = '2026-09-14';
    const creada = await asignarNucleo(actorId, { horarioId, fecha, choferId });
    expect(creada.ok).toBe(true);

    const filas = await listarMonitorDelDia(fecha);
    expect(filas.some((fila) => fila.horarioId === horarioId)).toBe(true);
  });

  it('Caso 2 — al borrar la ruta, la asignacion desaparece de Monitor aunque no este cancelada', async () => {
    const fecha = '2026-09-14';
    const borrado = await borrarRutaNucleo(actorId, rutaId);
    expect(borrado.ok).toBe(true);

    // La fila sigue existiendo y sigue sin cancelar: es la fuente unica de
    // verdad la que cambio (la ruta), no la asignacion.
    const [filaAsignacion] = await db
      .select({ canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.horarioId, horarioId));
    expect(filaAsignacion?.canceladaEn).toBeNull();

    const filas = await listarMonitorDelDia(fecha);
    expect(filas.some((fila) => fila.horarioId === horarioId)).toBe(false);
  });
});

describe('monitor: desactivar un horario tambien lo saca de Monitor sin tocar la asignacion', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId}), (${choferId})`);
    await db.insert(usuario).values([
      { id: actorId, credencial: `monitor-h-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `monitor-h-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db
      .insert(cliente)
      .values({ id: clienteId, nombre: 'Cliente de prueba (monitor horario)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (monitor horario)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (monitor horario)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (monitor horario)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-MONH-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'MONH-001',
    });
    await db.update(usuario).set({ camionId }).where(eq(usuario.id, choferId));
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'tarde',
      horaInicioEsperada: '14:00',
      horaFinEsperada: '15:00',
      personasEsperadas: 10,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from asignacion where chofer_id = ${choferId}`);
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(inArray(usuario.id, [actorId, choferId]));
    await db.execute(sql`delete from auth.users where id in (${actorId}, ${choferId})`);
  });

  it('Caso 3 — al desactivar el horario, la asignacion desaparece de Monitor sin cancelarse', async () => {
    const fecha = '2026-09-15';
    const creada = await asignarNucleo(actorId, { horarioId, fecha, choferId });
    expect(creada.ok).toBe(true);

    const desactivado = await desactivarHorarioNucleo(actorId, horarioId);
    expect(desactivado.ok).toBe(true);

    const [filaAsignacion] = await db
      .select({ canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.horarioId, horarioId));
    expect(filaAsignacion?.canceladaEn).toBeNull();

    const filas = await listarMonitorDelDia(fecha);
    expect(filas.some((fila) => fila.horarioId === horarioId)).toBe(false);
  });
});

// `registrarIncidenteManual` parsea con zod ANTES de resolver el actor
// (`obtenerUsuarioActual`, que necesita `next/headers` y no existe fuera de
// una peticion real de Next). Con entrada invalida la funcion nunca llega a
// intentar leer la sesion, asi que se puede probar aqui — mismo truco que
// usa rutas.test.ts.
describe('registrarIncidenteManual: rechaza entrada invalida antes de tocar sesion o base', () => {
  it('exige la razon del incidente', async () => {
    const resultado = await registrarIncidenteManual({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
    expect(resultado.error.campo).toBe('razonIncidente');
  });

  it('rechaza una razon fuera del catalogo', async () => {
    const resultado = await registrarIncidenteManual({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
      razonIncidente: 'se_poncho_una_llanta',
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
  });
});
