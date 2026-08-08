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
    const ochoADiez: AsignacionDelDiaParaChofer[] = [
      { horaInicioEsperada: '08:00', horaFinEsperada: '10:00' },
    ];

    it('acepta varias rutas separadas el mismo dia, aunque sean del mismo turno', () => {
      // El caso que la regla vieja (por turno) bloqueaba de mas: la jornada
      // de 8 horas de un chofer cabe partida en varias vueltas.
      const jornada: AsignacionDelDiaParaChofer[] = [
        { horaInicioEsperada: '04:00', horaFinEsperada: '05:00' },
        { horaInicioEsperada: '08:00', horaFinEsperada: '09:00' },
        { horaInicioEsperada: '12:00', horaFinEsperada: '13:00' },
      ];
      expect(hayTraslape(jornada, { horaInicioEsperada: '16:00', horaFinEsperada: '17:00' })).toBe(
        false,
      );
      expect(hayTraslape([], { horaInicioEsperada: '04:00', horaFinEsperada: '05:00' })).toBe(
        false,
      );
    });

    it('rechaza un horario que empieza dentro de otro', () => {
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '09:00', horaFinEsperada: '11:00' }),
      ).toBe(true);
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '09:30', horaFinEsperada: '10:30' }),
      ).toBe(true);
    });

    it('rechaza un horario contenido en otro y uno que lo contiene', () => {
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '08:30', horaFinEsperada: '09:00' }),
      ).toBe(true);
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '07:00', horaFinEsperada: '11:00' }),
      ).toBe(true);
    });

    it('acepta dos rutas consecutivas: 08:00-10:00 y 10:00-11:00', () => {
      // El intervalo es medio abierto: terminar exactamente donde arranca la
      // siguiente no es conflicto.
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '10:00', horaFinEsperada: '11:00' }),
      ).toBe(false);
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '06:00', horaFinEsperada: '08:00' }),
      ).toBe(false);
    });

    it('rechaza el mismo horario dos veces: el chofer no puede manejar las dos vueltas', () => {
      expect(
        hayTraslape(ochoADiez, { horaInicioEsperada: '08:00', horaFinEsperada: '10:00' }),
      ).toBe(true);
    });

    it('compara igual con segundos (`HH:MM:SS`, como llega de la columna time)', () => {
      const conSegundos: AsignacionDelDiaParaChofer[] = [
        { horaInicioEsperada: '08:00:00', horaFinEsperada: '10:00:00' },
      ];
      expect(
        hayTraslape(conSegundos, { horaInicioEsperada: '10:00:00', horaFinEsperada: '11:00:00' }),
      ).toBe(false);
      expect(
        hayTraslape(conSegundos, { horaInicioEsperada: '09:00:00', horaFinEsperada: '11:00:00' }),
      ).toBe(true);
    });

    it('un horario que cruza medianoche ocupa los dos tramos del dia', () => {
      const nocturno: AsignacionDelDiaParaChofer[] = [
        { horaInicioEsperada: '22:00', horaFinEsperada: '06:00' },
      ];
      expect(hayTraslape(nocturno, { horaInicioEsperada: '04:00', horaFinEsperada: '05:00' })).toBe(
        true,
      );
      expect(hayTraslape(nocturno, { horaInicioEsperada: '23:00', horaFinEsperada: '23:30' })).toBe(
        true,
      );
      expect(hayTraslape(nocturno, { horaInicioEsperada: '08:00', horaFinEsperada: '09:00' })).toBe(
        false,
      );
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

  /** El calendario de un chofer en `fechaDosHorarios`, tal como lo lee planeador-nucleo. */
  function horasDelDia(choferId: string) {
    return db
      .select({
        horaInicioEsperada: horario.horaInicioEsperada,
        horaFinEsperada: horario.horaFinEsperada,
      })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .where(and(eq(asignacion.choferId, choferId), eq(asignacion.fecha, fechaDosHorarios)));
  }

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

    // chofer1 solo ve 06:00-07:00 en su calendario, chofer2 solo 08:00-09:00:
    // cada quien puede tomar el horario del otro sin conflicto.
    const asignacionesChofer1 = await horasDelDia(chofer1Id);
    expect(asignacionesChofer1).toEqual([
      { horaInicioEsperada: '06:00:00', horaFinEsperada: '07:00:00' },
    ]);
    expect(
      hayTraslape(asignacionesChofer1, { horaInicioEsperada: '08:00', horaFinEsperada: '09:00' }),
    ).toBe(false);

    const asignacionesChofer2 = await horasDelDia(chofer2Id);
    expect(
      hayTraslape(asignacionesChofer2, { horaInicioEsperada: '06:00', horaFinEsperada: '07:00' }),
    ).toBe(false);
  });

  it('el mismo chofer: horas separadas se aceptan, horas encimadas se rechazan', async () => {
    // chofer1 ya esta en horario1 (06:00-07:00) ese dia. horario2 es
    // 08:00-09:00, MISMO turno "manana": la regla vieja lo rechazaba por
    // turno, la nueva lo acepta porque las horas no se tocan. Lo que si se
    // rechaza es una ruta que cae encima de 06:00-07:00.
    const asignacionesChofer1 = await horasDelDia(chofer1Id);

    expect(
      hayTraslape(asignacionesChofer1, { horaInicioEsperada: '08:00', horaFinEsperada: '09:00' }),
    ).toBe(false);
    expect(
      hayTraslape(asignacionesChofer1, { horaInicioEsperada: '06:30', horaFinEsperada: '07:30' }),
    ).toBe(true);
    // Consecutivas, pegadas: 07:00 arranca justo donde termina la anterior.
    expect(
      hayTraslape(asignacionesChofer1, { horaInicioEsperada: '07:00', horaFinEsperada: '08:00' }),
    ).toBe(false);
  });
});
