import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './index.ts';
import { asignacion, camion, cliente, evento, horario, parada, ruta, usuario } from './schema.ts';

// Pruebas de aislamiento (§8, §9 paso 2): el chofer A jamas debe leer ni
// escribir datos del chofer B, y ningun rol — ni siquiera el dueno de un
// evento — puede actualizarlo o borrarlo. Las cuatro operaciones deben
// fallar.
//
// Se simula lo que hace PostgREST al recibir un JWT (fija `request.jwt.claims`
// y opera como el rol `authenticated`) en una conexion Postgres nueva, sin
// pasar por HTTP ni por el servicio de Auth: es la misma comprobacion, mucho
// mas rapida y sin flakiness de red.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('rls.test.ts: falta DATABASE_URL. Carga el entorno antes de correr las pruebas.');
}

async function comoUsuario(usuarioId: string) {
  const conexion = postgres(connectionString as string);
  await conexion`select set_config(
    'request.jwt.claims',
    ${JSON.stringify({ sub: usuarioId, role: 'authenticated' })},
    false
  )`;
  await conexion`set role authenticated`;
  return conexion;
}

describe('rls: aislamiento entre choferes', () => {
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();
  const choferAId = randomUUID();
  const choferBId = randomUUID();
  const asignacionAId = randomUUID();
  const asignacionBId = randomUUID();
  const eventoAId = randomUUID();

  beforeAll(async () => {
    // Fixtures creados con el cliente de servicio: es el dueno de las
    // tablas y por lo tanto bypassa RLS, igual que el panel en produccion.
    await db.execute(sql`insert into auth.users (id) values (${choferAId}), (${choferBId})`);

    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba RLS' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio RLS',
        direccion: 'Direccion de prueba 1',
        lat: 25.67,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin RLS',
        direccion: 'Direccion de prueba 2',
        lat: 25.68,
        lng: -100.32,
      },
    ]);
    await db.insert(camion).values({
      id: camionId,
      codigo: `RLS-${camionId.slice(0, 8)}`,
      tipo: 'Van',
      placas: 'RLS-0001',
    });
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba RLS',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'manana',
      horaInicioEsperada: '06:00',
      horaFinEsperada: '07:00',
      personasEsperadas: 10,
    });
    await db.insert(usuario).values([
      { id: choferAId, credencial: `chofer-a-${choferAId.slice(0, 8)}`, rol: 'chofer' },
      { id: choferBId, credencial: `chofer-b-${choferBId.slice(0, 8)}`, rol: 'chofer' },
    ]);
    await db.insert(asignacion).values([
      {
        id: asignacionAId,
        horarioId,
        fecha: '2026-08-10',
        choferId: choferAId,
        camionId,
        camionCodigo: 'RLS-A',
        createdBy: choferAId,
      },
      {
        id: asignacionBId,
        horarioId,
        fecha: '2026-08-10',
        secuencia: 2,
        choferId: choferBId,
        camionId,
        camionCodigo: 'RLS-B',
        createdBy: choferBId,
      },
    ]);
    await db.insert(evento).values({
      id: eventoAId,
      asignacionId: asignacionAId,
      tipo: 'vio_ruta',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferAId,
      clientEventId: randomUUID(),
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from evento where id = ${eventoAId}`);
    await db.execute(sql`delete from asignacion where id in (${asignacionAId}, ${asignacionBId})`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.execute(sql`delete from ruta where id = ${rutaId}`);
    await db.execute(sql`delete from camion where id = ${camionId}`);
    await db.execute(sql`delete from parada where id in (${paradaInicioId}, ${paradaFinId})`);
    await db.execute(sql`delete from cliente where id = ${clienteId}`);
    await db.execute(sql`delete from usuario where id in (${choferAId}, ${choferBId})`);
    await db.execute(sql`delete from auth.users where id in (${choferAId}, ${choferBId})`);
  });

  it('el chofer A no puede leer una asignacion del chofer B', async () => {
    const comoA = await comoUsuario(choferAId);
    const filas = await comoA`select id from asignacion where id = ${asignacionBId}`;
    expect(filas).toHaveLength(0);
    await comoA.end();
  });

  it('el chofer A no puede insertar un evento en una asignacion del chofer B', async () => {
    const comoA = await comoUsuario(choferAId);
    await expect(
      comoA`insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
            values (${asignacionBId}, 'vio_ruta', now(), 'app', ${choferAId}, ${randomUUID()})`,
    ).rejects.toThrow();
    await comoA.end();
  });

  it('el chofer A no puede actualizar su propio evento (append-only, sin excepcion)', async () => {
    const comoA = await comoUsuario(choferAId);
    await expect(comoA`update evento set sin_gps = true where id = ${eventoAId}`).rejects.toThrow();
    await comoA.end();
  });

  it('el chofer A no puede borrar su propio evento (append-only, sin excepcion)', async () => {
    const comoA = await comoUsuario(choferAId);
    await expect(comoA`delete from evento where id = ${eventoAId}`).rejects.toThrow();
    await comoA.end();
  });

  it('el chofer A puede apagar su propio debe_cambiar_password', async () => {
    const comoA = await comoUsuario(choferAId);
    await comoA`update usuario set debe_cambiar_password = false where id = ${choferAId}`;
    const [fila] = await comoA`select debe_cambiar_password from usuario where id = ${choferAId}`;
    expect(fila?.debe_cambiar_password).toBe(false);
    await comoA.end();

    await db.execute(sql`update usuario set debe_cambiar_password = true where id = ${choferAId}`);
  });

  it('el chofer A no puede apagar el debe_cambiar_password del chofer B', async () => {
    const comoA = await comoUsuario(choferAId);
    const filas =
      await comoA`update usuario set debe_cambiar_password = false where id = ${choferBId} returning id`;
    expect(filas).toHaveLength(0);
    await comoA.end();
  });

  it('el chofer A no puede cambiar su propio rol (solo debe_cambiar_password tiene GRANT)', async () => {
    const comoA = await comoUsuario(choferAId);
    await expect(comoA`update usuario set rol = 'admin' where id = ${choferAId}`).rejects.toThrow();
    await comoA.end();
  });
});
