import { randomUUID } from 'node:crypto';
import { agregarHorarioSchema, type RutaCrear, rutaCrearSchema } from '@rutas/shared';
import { asignacion, camion, cliente, db, horario, parada, ruta, usuario } from '@rutas/shared/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agregarHorario, crearRuta } from './rutas.ts';
import { borrarRutaNucleo, crearRutaNucleo, desactivarHorarioNucleo } from './rutas-nucleo.ts';

function datosRuta(overrides: Partial<RutaCrear> = {}): RutaCrear {
  return {
    clienteId: randomUUID(),
    nombre: 'Centro - Planta Norte',
    paradaInicioId: randomUUID(),
    paradaFinId: randomUUID(),
    horarios: [
      {
        turno: 'manana',
        horaInicioEsperada: '06:00',
        horaFinEsperada: '06:30',
        personasEsperadas: 20,
      },
    ],
    ...overrides,
  };
}

describe('esquemas de validacion (paso 6)', () => {
  it('rechaza un horario con hora_fin anterior a hora_inicio y nombra el campo', () => {
    const parseo = rutaCrearSchema.safeParse(
      datosRuta({
        horarios: [
          {
            turno: 'manana',
            horaInicioEsperada: '08:00',
            horaFinEsperada: '07:30',
            personasEsperadas: 20,
          },
        ],
      }),
    );
    expect(parseo.success).toBe(false);
    if (!parseo.success) {
      expect(parseo.error.issues[0]?.path).toContain('horaFinEsperada');
    }
  });

  it('rechaza personas_esperadas menor o igual a cero en un horario', () => {
    const parseo = rutaCrearSchema.safeParse(
      datosRuta({
        horarios: [
          {
            turno: 'tarde',
            horaInicioEsperada: '14:00',
            horaFinEsperada: '14:30',
            personasEsperadas: 0,
          },
        ],
      }),
    );
    expect(parseo.success).toBe(false);
  });

  it('rechaza una ruta sin ningun horario', () => {
    const parseo = rutaCrearSchema.safeParse(datosRuta({ horarios: [] }));
    expect(parseo.success).toBe(false);
  });

  it('acepta dos horarios de la misma ruta con el mismo turno', () => {
    const parseo = rutaCrearSchema.safeParse(
      datosRuta({
        horarios: [
          {
            turno: 'manana',
            horaInicioEsperada: '06:00',
            horaFinEsperada: '06:30',
            personasEsperadas: 20,
          },
          {
            turno: 'manana',
            horaInicioEsperada: '08:00',
            horaFinEsperada: '08:30',
            personasEsperadas: 15,
          },
        ],
      }),
    );
    expect(parseo.success).toBe(true);
  });

  it('rechaza una ruta con la misma parada de inicio y de fin', () => {
    const paradaId = randomUUID();
    const parseo = rutaCrearSchema.safeParse(
      datosRuta({ paradaInicioId: paradaId, paradaFinId: paradaId }),
    );
    expect(parseo.success).toBe(false);
  });

  it('agregarHorarioSchema tambien exige hora_fin posterior a hora_inicio', () => {
    const parseo = agregarHorarioSchema.safeParse({
      rutaId: randomUUID(),
      turno: 'noche',
      horaInicioEsperada: '22:00',
      horaFinEsperada: '21:00',
      personasEsperadas: 10,
    });
    expect(parseo.success).toBe(false);
  });
});

describe('server actions: rechazan entrada invalida antes de tocar sesion o base', () => {
  // `crearRuta`/`agregarHorario` parsean con zod ANTES de resolver el actor
  // (`obtenerUsuarioActual`, que necesita `next/headers`, ausente fuera de
  // una peticion real de Next). Con entrada invalida, esta prueba corre sin
  // ese contexto porque la funcion nunca llega a intentar leerlo.

  it('crearRuta responde validacion 422 con horas invertidas, sin necesitar sesion', async () => {
    const resultado = await crearRuta(
      datosRuta({
        horarios: [
          {
            turno: 'manana',
            horaInicioEsperada: '08:00',
            horaFinEsperada: '07:00',
            personasEsperadas: 20,
          },
        ],
      }),
    );
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
      expect(resultado.error.campo).toBe('horaFinEsperada');
    }
  });

  it('crearRuta responde validacion 422 sin ningun horario', async () => {
    const resultado = await crearRuta(datosRuta({ horarios: [] }));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });

  it('agregarHorario responde validacion 422 con personas_esperadas en cero', async () => {
    const resultado = await agregarHorario({
      rutaId: randomUUID(),
      turno: 'tarde',
      horaInicioEsperada: '14:00',
      horaFinEsperada: '14:30',
      personasEsperadas: 0,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });
});

describe('rutas-nucleo contra Postgres real', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId}), (${choferId})`);
    await db.insert(usuario).values([
      { id: actorId, credencial: `rutas-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `rutas-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (rutas)' });
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
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-RUTAS-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'RUT-001',
    });
  });

  afterAll(async () => {
    const rutasCreadas = await db
      .select({ id: ruta.id })
      .from(ruta)
      .where(eq(ruta.clienteId, clienteId));
    const rutaIds = rutasCreadas.map((r) => r.id);

    if (rutaIds.length > 0) {
      const horariosCreados = await db
        .select({ id: horario.id })
        .from(horario)
        .where(inArray(horario.rutaId, rutaIds));
      const horarioIds = horariosCreados.map((h) => h.id);
      if (horarioIds.length > 0) {
        await db.delete(asignacion).where(inArray(asignacion.horarioId, horarioIds));
        await db.delete(horario).where(inArray(horario.rutaId, rutaIds));
      }
      await db.delete(ruta).where(inArray(ruta.id, rutaIds));
    }

    await db.execute(sql`delete from audit_log where actor_id in (${actorId}, ${choferId})`);
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, actorId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id in (${actorId}, ${choferId})`);
  });

  it('crearRutaNucleo guarda la ruta y sus dos horarios del mismo turno', async () => {
    const resultado = await crearRutaNucleo(
      actorId,
      datosRuta({
        clienteId,
        paradaInicioId,
        paradaFinId,
        horarios: [
          {
            turno: 'manana',
            horaInicioEsperada: '06:00',
            horaFinEsperada: '06:30',
            personasEsperadas: 20,
          },
          {
            turno: 'manana',
            horaInicioEsperada: '08:00',
            horaFinEsperada: '08:30',
            personasEsperadas: 15,
          },
        ],
      }),
    );
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const horariosGuardados = await db
      .select()
      .from(horario)
      .where(eq(horario.rutaId, resultado.data.id));
    expect(horariosGuardados).toHaveLength(2);
    expect(horariosGuardados.every((h) => h.turno === 'manana')).toBe(true);
  });

  it('borrar una ruta con asignaciones fija deleted_at y conserva la fila, nunca DELETE', async () => {
    const creada = await crearRutaNucleo(
      actorId,
      datosRuta({ clienteId, paradaInicioId, paradaFinId }),
    );
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    const rutaId = creada.data.id;

    const [horarioCreado] = await db
      .select()
      .from(horario)
      .where(eq(horario.rutaId, rutaId))
      .limit(1);
    if (!horarioCreado) throw new Error('setup: horario no encontrado');

    await db.insert(asignacion).values({
      id: randomUUID(),
      horarioId: horarioCreado.id,
      fecha: '2026-08-10',
      choferId,
      camionId,
      camionCodigo: 'T-RUTAS-TEST',
      createdBy: actorId,
    });

    const resultado = await borrarRutaNucleo(actorId, rutaId);
    expect(resultado.ok).toBe(true);

    const [filaRuta] = await db.select().from(ruta).where(eq(ruta.id, rutaId)).limit(1);
    expect(filaRuta).toBeDefined();
    expect(filaRuta?.deletedAt).not.toBeNull();

    const asignacionesRestantes = await db
      .select()
      .from(asignacion)
      .where(eq(asignacion.horarioId, horarioCreado.id));
    expect(asignacionesRestantes).toHaveLength(1);
  });

  it('desactivar un horario con asignaciones fija activo=false y conserva la fila', async () => {
    const creada = await crearRutaNucleo(
      actorId,
      datosRuta({ clienteId, paradaInicioId, paradaFinId }),
    );
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const [horarioCreado] = await db
      .select()
      .from(horario)
      .where(eq(horario.rutaId, creada.data.id))
      .limit(1);
    if (!horarioCreado) throw new Error('setup: horario no encontrado');

    await db.insert(asignacion).values({
      id: randomUUID(),
      horarioId: horarioCreado.id,
      fecha: '2026-08-11',
      choferId,
      camionId,
      camionCodigo: 'T-RUTAS-TEST',
      createdBy: actorId,
    });

    const resultado = await desactivarHorarioNucleo(actorId, horarioCreado.id);
    expect(resultado.ok).toBe(true);

    const [filaHorario] = await db
      .select()
      .from(horario)
      .where(eq(horario.id, horarioCreado.id))
      .limit(1);
    expect(filaHorario).toBeDefined();
    expect(filaHorario?.activo).toBe(false);
  });

  it('borrar una ruta ya borrada responde no_encontrado, no un exito falso', async () => {
    const creada = await crearRutaNucleo(
      actorId,
      datosRuta({ clienteId, paradaInicioId, paradaFinId }),
    );
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    expect((await borrarRutaNucleo(actorId, creada.data.id)).ok).toBe(true);

    // Segundo intento: la pantalla que lo dispara quedo vieja (otra pestana ya
    // borro la fila). Responder `ok` aqui hacia que el panel acusara "eliminada
    // correctamente" sobre algo inexistente y pisara el `deleted_at` original.
    const repetido = await borrarRutaNucleo(actorId, creada.data.id);
    expect(repetido.ok).toBe(false);
    if (repetido.ok) return;
    expect(repetido.error.codigo).toBe('no_encontrado');
  });

  it('desactivar un horario ya desactivado responde no_encontrado y no vuelve a auditar', async () => {
    const creada = await crearRutaNucleo(
      actorId,
      datosRuta({ clienteId, paradaInicioId, paradaFinId }),
    );
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const [horarioCreado] = await db
      .select()
      .from(horario)
      .where(eq(horario.rutaId, creada.data.id))
      .limit(1);
    if (!horarioCreado) throw new Error('setup: horario no encontrado');

    expect((await desactivarHorarioNucleo(actorId, horarioCreado.id)).ok).toBe(true);

    const repetido = await desactivarHorarioNucleo(actorId, horarioCreado.id);
    expect(repetido.ok).toBe(false);
    if (repetido.ok) return;
    expect(repetido.error.codigo).toBe('no_encontrado');

    // Y la bitacora tiene UNA sola entrada: la desactivacion que si ocurrio.
    const entradas = await db.execute(
      sql`select count(*)::int as total from audit_log
          where recurso_tipo = 'horario' and recurso_id = ${horarioCreado.id}`,
    );
    expect(entradas[0]?.total).toBe(1);
  });
});
