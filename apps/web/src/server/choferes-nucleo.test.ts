import { randomUUID } from 'node:crypto';
import {
  asignacion,
  camion,
  cliente,
  db,
  horario,
  parada,
  perfilPersonal,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bajaEmpleadoNucleo } from './baja-nucleo.ts';
import { liberarAsignacionesFuturas, rutasActivasDeChofer } from './choferes-nucleo.ts';
import { asignarNucleo, reasignarNucleo } from './planeador-nucleo.ts';

// El camion es una propiedad del chofer y el planeador lo deriva, nunca lo
// recibe; dar de baja suelta las rutas futuras sin tocar el historial.

/** Fecha fija en el pasado y en el futuro respecto de "hoy", sea cual sea el dia. */
function diasDesdeHoy(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

describe('el camion se deriva del chofer, nunca se elige (pasos 8-11)', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const choferSinCamionId = randomUUID();
  const choferInactivoId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionViejoId = randomUUID();
  const camionNuevoId = randomUUID();
  const camionTallerId = randomUUID();
  const rutaId = randomUUID();
  const horarioAId = randomUUID();
  const horarioBId = randomUUID();

  const codigoViejo = `T-DER-VIE-${camionViejoId.slice(0, 4)}`;
  const codigoNuevo = `T-DER-NUE-${camionNuevoId.slice(0, 4)}`;

  beforeAll(async () => {
    await db.execute(
      sql`insert into auth.users (id) values (${actorId}), (${choferId}), (${choferSinCamionId}), (${choferInactivoId})`,
    );
    await db.insert(usuario).values([
      { id: actorId, credencial: `der-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `der-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
      {
        id: choferSinCamionId,
        credencial: `der-sincam-${choferSinCamionId.slice(0, 8)}`,
        rol: 'chofer',
      },
      {
        id: choferInactivoId,
        credencial: `der-inact-${choferInactivoId.slice(0, 8)}`,
        rol: 'chofer',
        activo: false,
      },
    ]);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (derivacion)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (derivacion)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (derivacion)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (derivacion)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values([
      { id: camionViejoId, codigo: codigoViejo, tipo: 'sprinter', placas: 'DER-001' },
      { id: camionNuevoId, codigo: codigoNuevo, tipo: 'sprinter', placas: 'DER-002' },
      {
        id: camionTallerId,
        codigo: `T-DER-TAL-${camionTallerId.slice(0, 4)}`,
        tipo: 'sprinter',
        placas: 'DER-003',
        estado: 'mantenimiento',
      },
    ]);
    await db.update(usuario).set({ camionId: camionViejoId }).where(eq(usuario.id, choferId));
    await db
      .update(usuario)
      .set({ camionId: camionTallerId })
      .where(eq(usuario.id, choferInactivoId));
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
        turno: 'tarde',
        horaInicioEsperada: '15:00',
        horaFinEsperada: '16:00',
        personasEsperadas: 10,
      },
    ]);
  });

  afterAll(async () => {
    const ids = [actorId, choferId, choferSinCamionId, choferInactivoId];
    await db.execute(sql`delete from notificacion_programada where asignacion_id in
      (select id from asignacion where chofer_id in (${choferId}, ${choferSinCamionId}, ${choferInactivoId}))`);
    await db.execute(
      sql`delete from asignacion where chofer_id in (${choferId}, ${choferSinCamionId}, ${choferInactivoId})`,
    );
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.execute(sql`delete from horario where id in (${horarioAId}, ${horarioBId})`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.execute(
      sql`update usuario set camion_id = null where id in (${choferId}, ${choferInactivoId})`,
    );
    await db
      .delete(camion)
      .where(inArray(camion.id, [camionViejoId, camionNuevoId, camionTallerId]));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(inArray(usuario.id, ids));
    await db.execute(
      sql`delete from auth.users where id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  });

  it('la asignacion toma el camion que el chofer trae, sin que nadie lo mande', async () => {
    const creada = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha: diasDesdeHoy(40),
      choferId,
    });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    const [fila] = await db
      .select({ camionId: asignacion.camionId, camionCodigo: asignacion.camionCodigo })
      .from(asignacion)
      .where(eq(asignacion.id, creada.data.id));
    expect(fila?.camionId).toBe(camionViejoId);
    expect(fila?.camionCodigo).toBe(codigoViejo);
  });

  it('un chofer sin camion no se puede asignar', async () => {
    const resultado = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha: diasDesdeHoy(41),
      choferId: choferSinCamionId,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
    expect(resultado.error.campo).toBe('choferId');
  });

  it('un chofer inactivo no se puede asignar aunque tenga camion', async () => {
    const resultado = await asignarNucleo(actorId, {
      horarioId: horarioAId,
      fecha: diasDesdeHoy(42),
      choferId: choferInactivoId,
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
  });

  it('cambiar el camion del chofer cambia las asignaciones NUEVAS y respeta las historicas', async () => {
    // La historica quedo con `codigoViejo` en la primera prueba de este bloque.
    const historica = await db
      .select({ id: asignacion.id, camionCodigo: asignacion.camionCodigo })
      .from(asignacion)
      .where(eq(asignacion.choferId, choferId));
    expect(historica[0]?.camionCodigo).toBe(codigoViejo);

    // Juan pasa de CAM-001 a CAM-010.
    await db.update(usuario).set({ camionId: camionNuevoId }).where(eq(usuario.id, choferId));

    const nueva = await asignarNucleo(actorId, {
      horarioId: horarioBId,
      fecha: diasDesdeHoy(43),
      choferId,
    });
    expect(nueva.ok).toBe(true);
    if (!nueva.ok) return;

    const [filaNueva] = await db
      .select({ camionCodigo: asignacion.camionCodigo })
      .from(asignacion)
      .where(eq(asignacion.id, nueva.data.id));
    expect(filaNueva?.camionCodigo).toBe(codigoNuevo);

    // Y la vieja NO se reescribio: es la fotografia de lo que de verdad se uso.
    const [filaVieja] = await db
      .select({ camionCodigo: asignacion.camionCodigo })
      .from(asignacion)
      .where(eq(asignacion.id, historica[0]?.id ?? ''));
    expect(filaVieja?.camionCodigo).toBe(codigoViejo);
  });

  it('reasignar a otro chofer trae el camion del chofer nuevo', async () => {
    const fecha = diasDesdeHoy(44);
    const creada = await asignarNucleo(actorId, { horarioId: horarioAId, fecha, choferId });
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;

    // El chofer destino necesita camion propio; se le da el viejo.
    await db
      .update(usuario)
      .set({ camionId: camionViejoId })
      .where(eq(usuario.id, choferSinCamionId));

    const reasignada = await reasignarNucleo(actorId, {
      asignacionId: creada.data.id,
      choferId: choferSinCamionId,
    });
    expect(reasignada.ok).toBe(true);

    const [fila] = await db
      .select({ choferId: asignacion.choferId, camionCodigo: asignacion.camionCodigo })
      .from(asignacion)
      .where(eq(asignacion.id, creada.data.id));
    expect(fila?.choferId).toBe(choferSinCamionId);
    expect(fila?.camionCodigo).toBe(codigoViejo);

    await db.execute(sql`update usuario set camion_id = null where id = ${choferSinCamionId}`);
  });
});

describe('dar de baja a un chofer libera sus rutas futuras y conserva el historial (paso 7)', () => {
  const actorId = randomUUID();
  const choferId = randomUUID();
  const relevoId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();
  const asignacionPasadaId = randomUUID();

  beforeAll(async () => {
    await db.execute(
      sql`insert into auth.users (id) values (${actorId}), (${choferId}), (${relevoId})`,
    );
    await db.insert(usuario).values([
      { id: actorId, credencial: `baja-admin-${actorId.slice(0, 8)}`, rol: 'admin' },
      { id: choferId, credencial: `baja-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
      { id: relevoId, credencial: `baja-relevo-${relevoId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db.insert(perfilPersonal).values({ usuarioId: choferId, nombre: 'Juan Perez (prueba)' });
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (baja)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (baja)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (baja)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta Norte (baja)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-BAJ-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'BAJ-001',
    });
    await db
      .update(usuario)
      .set({ camionId })
      .where(inArray(usuario.id, [choferId, relevoId]));
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'manana',
      horaInicioEsperada: '04:00',
      horaFinEsperada: '05:00',
      personasEsperadas: 10,
    });
    // Una ruta YA EJECUTADA: es historial laboral. Se inserta directo porque
    // asignarNucleo valida contra el calendario vivo, no contra el pasado.
    await db.insert(asignacion).values({
      id: asignacionPasadaId,
      horarioId,
      fecha: diasDesdeHoy(-30),
      choferId,
      camionId,
      camionCodigo: 'T-BAJ-HIST',
      createdBy: actorId,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from notificacion_programada where asignacion_id in
      (select id from asignacion where chofer_id in (${choferId}, ${relevoId}))`);
    await db.execute(sql`delete from asignacion where chofer_id in (${choferId}, ${relevoId})`);
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.execute(
      sql`update usuario set camion_id = null where id in (${choferId}, ${relevoId})`,
    );
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(inArray(usuario.id, [actorId, choferId, relevoId]));
    await db.execute(
      sql`delete from auth.users where id in (${actorId}, ${choferId}, ${relevoId})`,
    );
  });

  it('rutasActivasDeChofer muestra las de hoy en adelante y NO las ya ejecutadas', async () => {
    const futura = await asignarNucleo(actorId, {
      horarioId,
      fecha: diasDesdeHoy(3),
      choferId,
    });
    expect(futura.ok).toBe(true);

    const activas = await rutasActivasDeChofer(choferId);
    expect(activas).toHaveLength(1);
    expect(activas[0]?.rutaNombre).toBe('Ruta Norte (baja)');
    // La del mes pasado no aparece: es historial, no algo que se vaya a soltar.
    expect(activas.some((r) => r.asignacionId === asignacionPasadaId)).toBe(false);
  });

  it('la baja suelta las futuras, conserva las pasadas y deja el horario libre', async () => {
    const activasAntes = await rutasActivasDeChofer(choferId);
    expect(activasAntes.length).toBeGreaterThan(0);
    const fechaLiberada = activasAntes[0]?.fecha ?? '';

    const baja = await bajaEmpleadoNucleo(actorId, choferId);
    expect(baja.ok).toBe(true);

    // La futura quedo cancelada...
    const [futura] = await db
      .select({ canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.id, activasAntes[0]?.asignacionId ?? ''));
    expect(futura?.canceladaEn).not.toBeNull();

    // ...y la pasada NO: el historial de rutas realizadas se conserva.
    const [pasada] = await db
      .select({ canceladaEn: asignacion.canceladaEn })
      .from(asignacion)
      .where(eq(asignacion.id, asignacionPasadaId));
    expect(pasada?.canceladaEn).toBeNull();

    // La ruta, el horario, el cliente, las paradas y el camion siguen ahi.
    const [rutaSigue] = await db.select({ id: ruta.id }).from(ruta).where(eq(ruta.id, rutaId));
    expect(rutaSigue?.id).toBe(rutaId);
    const [camionSigue] = await db
      .select({ id: camion.id })
      .from(camion)
      .where(eq(camion.id, camionId));
    expect(camionSigue?.id).toBe(camionId);

    // Y el horario quedo libre: otro chofer lo puede tomar ese mismo dia.
    const delRelevo = await asignarNucleo(actorId, {
      horarioId,
      fecha: fechaLiberada,
      choferId: relevoId,
    });
    expect(delRelevo.ok).toBe(true);
  });

  it('liberarAsignacionesFuturas sobre un chofer sin rutas futuras no hace nada', async () => {
    const liberadas = await db.transaction((tx) => liberarAsignacionesFuturas(tx, choferId));
    expect(liberadas).toHaveLength(0);
  });
});
