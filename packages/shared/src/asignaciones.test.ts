import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AsignacionDelDiaParaChofer,
  camionDisponible,
  hayTraslape,
  siguienteSecuencia,
} from './asignaciones.ts';
import { asignacion, camion, cliente, db, horario, parada, ruta, usuario } from './db/index.ts';

describe('logica pura', () => {
  describe('hayTraslape', () => {
    const asignacionesDelDia: AsignacionDelDiaParaChofer[] = [
      { horarioId: 'horario-a', turno: 'manana' },
    ];

    it('rechaza un segundo horario del mismo turno', () => {
      expect(hayTraslape(asignacionesDelDia, { id: 'horario-b', turno: 'manana' })).toBe(true);
    });

    it('acepta un horario de otro turno', () => {
      expect(hayTraslape(asignacionesDelDia, { id: 'horario-b', turno: 'tarde' })).toBe(false);
    });

    it('no se traslapa consigo mismo (mismo horario_id)', () => {
      expect(hayTraslape(asignacionesDelDia, { id: 'horario-a', turno: 'manana' })).toBe(false);
    });
  });

  describe('camionDisponible', () => {
    it('rechaza un camion en mantenimiento', () => {
      expect(camionDisponible('mantenimiento')).toBe(false);
    });

    it('acepta un camion disponible o asignado', () => {
      expect(camionDisponible('disponible')).toBe(true);
      expect(camionDisponible('asignado')).toBe(true);
    });
  });

  describe('siguienteSecuencia', () => {
    it('empieza en 1 cuando nadie ha tomado el horario ese dia', () => {
      expect(siguienteSecuencia([])).toBe(1);
    });

    it('continua despues de la mas alta existente', () => {
      expect(siguienteSecuencia([1])).toBe(2);
      expect(siguienteSecuencia([1, 2])).toBe(3);
    });
  });
});

describe('logica pura contra datos reales de Postgres', () => {
  const actorId = randomUUID();
  const chofer1Id = randomUUID();
  const chofer2Id = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const rutaId = randomUUID();
  const horario1Id = randomUUID();
  const horario2Id = randomUUID();
  const camionDisponibleId = randomUUID();
  const camionMantenimientoId = randomUUID();
  const fecha = '2026-09-07';
  // Fecha distinta para el bloque "dos horarios distintos no chocan" +
  // "mismo chofer si choca": evita pisar el unico (horario_id, fecha,
  // secuencia) que ya ocupan las filas del bloque de la secuencia arriba.
  const fechaDosHorarios = '2026-09-08';

  beforeAll(async () => {
    await db.execute(
      sql`insert into auth.users (id) values (${actorId}), (${chofer1Id}), (${chofer2Id})`,
    );
    await db.insert(usuario).values([
      { id: actorId, credencial: `asig-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: chofer1Id, credencial: `asig-chofer1-${chofer1Id.slice(0, 8)}`, rol: 'chofer' },
      { id: chofer2Id, credencial: `asig-chofer2-${chofer2Id.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (asignaciones)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio',
        direccion: 'Direccion 1',
        lat: 25.6866,
        lng: -100.3161,
      },
      { id: paradaFinId, nombre: 'Parada fin', direccion: 'Direccion 2', lat: 25.7, lng: -100.3 },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (asignaciones)',
      paradaInicioId,
      paradaFinId,
    });
    // Dos horarios DISTINTOS de la MISMA ruta, mismo turno: el caso del
    // paso 6 que el paso 7 tiene que poder asignar sin que choquen entre si.
    await db.insert(horario).values([
      {
        id: horario1Id,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '06:00',
        horaFinEsperada: '07:00',
        personasEsperadas: 20,
      },
      {
        id: horario2Id,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '08:00',
        horaFinEsperada: '09:00',
        personasEsperadas: 15,
      },
    ]);
    await db.insert(camion).values([
      {
        id: camionDisponibleId,
        codigo: `T-ASIG-DISP-${camionDisponibleId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'ASG-001',
      },
      {
        id: camionMantenimientoId,
        codigo: `T-ASIG-MANT-${camionMantenimientoId.slice(0, 6)}`,
        tipo: 'sprinter',
        placas: 'ASG-002',
        estado: 'mantenimiento',
      },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.delete(asignacion).where(eq(asignacion.horarioId, horario1Id));
    await db.delete(asignacion).where(eq(asignacion.horarioId, horario2Id));
    await db.delete(horario).where(eq(horario.rutaId, rutaId));
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionDisponibleId));
    await db.delete(camion).where(eq(camion.id, camionMantenimientoId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, actorId));
    await db.delete(usuario).where(eq(usuario.id, chofer1Id));
    await db.delete(usuario).where(eq(usuario.id, chofer2Id));
    await db.execute(
      sql`delete from auth.users where id in (${actorId}, ${chofer1Id}, ${chofer2Id})`,
    );
  });

  it('un camion consultado con estado=mantenimiento se rechaza', async () => {
    const [fila] = await db
      .select({ estado: camion.estado })
      .from(camion)
      .where(eq(camion.id, camionMantenimientoId))
      .limit(1);
    expect(fila).toBeDefined();
    expect(camionDisponible(fila?.estado ?? 'mantenimiento')).toBe(false);

    const [filaDisponible] = await db
      .select({ estado: camion.estado })
      .from(camion)
      .where(eq(camion.id, camionDisponibleId))
      .limit(1);
    expect(camionDisponible(filaDisponible?.estado ?? 'mantenimiento')).toBe(true);
  });

  it('la segunda vuelta del mismo horario el mismo dia obtiene secuencia=2', async () => {
    await db.insert(asignacion).values({
      id: randomUUID(),
      horarioId: horario1Id,
      fecha,
      secuencia: 1,
      choferId: chofer1Id,
      camionId: camionDisponibleId,
      camionCodigo: 'T-ASIG-DISP',
      createdBy: actorId,
    });

    const existentes = await db
      .select({ secuencia: asignacion.secuencia })
      .from(asignacion)
      .where(and(eq(asignacion.horarioId, horario1Id), eq(asignacion.fecha, fecha)));

    expect(siguienteSecuencia(existentes.map((a) => a.secuencia))).toBe(2);

    // Une la segunda vuelta con un chofer distinto para respetar el
    // unico (horario_id, fecha, secuencia) sin chocar con la de arriba.
    await db.insert(asignacion).values({
      id: randomUUID(),
      horarioId: horario1Id,
      fecha,
      secuencia: 2,
      choferId: chofer2Id,
      camionId: camionDisponibleId,
      camionCodigo: 'T-ASIG-DISP',
      createdBy: actorId,
    });

    const filas = await db
      .select({ secuencia: asignacion.secuencia })
      .from(asignacion)
      .where(and(eq(asignacion.horarioId, horario1Id), eq(asignacion.fecha, fecha)));
    expect(filas.map((f) => f.secuencia).sort()).toEqual([1, 2]);
  });

  it('dos horarios distintos de la misma ruta y el mismo turno no chocan entre choferes distintos', async () => {
    // chofer1 toma horario1, chofer2 toma horario2, ambos turno "manana",
    // mismo dia. El traslape se evalua por chofer: ninguno ve la asignacion
    // del otro en su propio calendario.
    await db.insert(asignacion).values([
      {
        id: randomUUID(),
        horarioId: horario1Id,
        fecha: fechaDosHorarios,
        secuencia: 1,
        choferId: chofer1Id,
        camionId: camionDisponibleId,
        camionCodigo: 'T-ASIG-DISP',
        createdBy: actorId,
      },
      {
        id: randomUUID(),
        horarioId: horario2Id,
        fecha: fechaDosHorarios,
        secuencia: 1,
        choferId: chofer2Id,
        camionId: camionDisponibleId,
        camionCodigo: 'T-ASIG-DISP',
        createdBy: actorId,
      },
    ]);

    const asignacionesChofer1 = await db
      .select({ horarioId: asignacion.horarioId, turno: horario.turno })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .where(and(eq(asignacion.choferId, chofer1Id), eq(asignacion.fecha, fechaDosHorarios)));
    expect(hayTraslape(asignacionesChofer1, { id: horario1Id, turno: 'manana' })).toBe(false);

    const asignacionesChofer2 = await db
      .select({ horarioId: asignacion.horarioId, turno: horario.turno })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .where(and(eq(asignacion.choferId, chofer2Id), eq(asignacion.fecha, fechaDosHorarios)));
    expect(hayTraslape(asignacionesChofer2, { id: horario2Id, turno: 'manana' })).toBe(false);
  });

  it('el mismo chofer con otra asignacion del mismo turno si se detecta como traslape', async () => {
    // chofer1 ya esta en horario1 (manana) ese dia (fila insertada arriba);
    // intentar ponerlo tambien en horario2 (tambien manana) es el conflicto
    // real que el paso 7 pide bloquear.
    const asignacionesChofer1 = await db
      .select({ horarioId: asignacion.horarioId, turno: horario.turno })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .where(and(eq(asignacion.choferId, chofer1Id), eq(asignacion.fecha, fechaDosHorarios)));

    expect(hayTraslape(asignacionesChofer1, { id: horario2Id, turno: 'manana' })).toBe(true);
  });
});
