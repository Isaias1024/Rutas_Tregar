import { randomUUID } from 'node:crypto';
import {
  asignacion,
  camion,
  cliente,
  db,
  dispositivo,
  evento,
  horario,
  parada,
  perfilPersonal,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bajaEmpleadoNucleo } from './baja-nucleo';

describe('bajaEmpleadoNucleo (paso 16) contra Postgres real', () => {
  const actorId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const rutaId = randomUUID();
  const camionId = randomUUID();
  const horarioId = randomUUID();

  async function sembrarEmpleado(): Promise<{ choferId: string; asignacionId: string }> {
    const choferId = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${choferId})`);
    await db.insert(usuario).values({
      id: choferId,
      credencial: `baja-chofer-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(perfilPersonal).values({
      usuarioId: choferId,
      nombre: 'Empleado de prueba (baja)',
      correo: 'empleado@ejemplo.com',
      telefono: '5555555555',
    });
    await db.insert(dispositivo).values({
      id: randomUUID(),
      usuarioId: choferId,
      expoPushToken: `ExponentPushToken[baja-${choferId.slice(0, 8)}]`,
      plataforma: 'android',
      appVersion: '1.0.0',
    });

    const asignacionId = randomUUID();
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: '2026-08-10',
      choferId,
      camionId,
      camionCodigo: 'T-BAJA',
      createdBy: choferId,
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId,
      tipo: 'vio_ruta',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferId,
      clientEventId: randomUUID(),
    });

    return { choferId, asignacionId };
  }

  async function limpiarEmpleado(choferId: string, asignacionId: string) {
    await db.execute(sql`delete from audit_log where actor_id in (${actorId}, ${choferId})`);
    await db.delete(evento).where(eq(evento.asignacionId, asignacionId));
    await db.delete(asignacion).where(eq(asignacion.id, asignacionId));
    await db.delete(dispositivo).where(eq(dispositivo.usuarioId, choferId));
    await db.delete(perfilPersonal).where(eq(perfilPersonal.usuarioId, choferId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id = ${choferId}`);
  }

  beforeAll(async () => {
    // `actorId` tiene que ser un `usuario` real: `audit_log.actor_id` lleva FK
    // NOT NULL contra esa tabla.
    await db.execute(sql`insert into auth.users (id) values (${actorId})`);
    await db.insert(usuario).values({
      id: actorId,
      credencial: `baja-admin-${actorId.slice(0, 8)}`,
      rol: 'admin',
    });
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
      nombre: 'Ruta de prueba (baja)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-BAJA-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'BAJ-001',
    });
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
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.delete(usuario).where(eq(usuario.id, actorId));
    await db.execute(sql`delete from auth.users where id = ${actorId}`);
  });

  it('vacia perfil_personal, borra dispositivo y conserva la fila de usuario', async () => {
    const { choferId, asignacionId } = await sembrarEmpleado();

    const resultado = await bajaEmpleadoNucleo(actorId, choferId);
    expect(resultado.ok).toBe(true);

    const [perfil] = await db
      .select()
      .from(perfilPersonal)
      .where(eq(perfilPersonal.usuarioId, choferId));
    expect(perfil).toBeUndefined();

    const dispositivos = await db
      .select()
      .from(dispositivo)
      .where(eq(dispositivo.usuarioId, choferId));
    expect(dispositivos).toHaveLength(0);

    const [filaUsuario] = await db.select().from(usuario).where(eq(usuario.id, choferId));
    expect(filaUsuario).toBeDefined();
    expect(filaUsuario?.activo).toBe(false);
    expect(filaUsuario?.deletedAt).not.toBeNull();

    await limpiarEmpleado(choferId, asignacionId);
  });

  it('conserva las asignaciones y los eventos historicos despues de la baja', async () => {
    const { choferId, asignacionId } = await sembrarEmpleado();

    await bajaEmpleadoNucleo(actorId, choferId);

    const [filaAsignacion] = await db
      .select()
      .from(asignacion)
      .where(eq(asignacion.id, asignacionId));
    expect(filaAsignacion).toBeDefined();
    expect(filaAsignacion?.choferId).toBe(choferId);

    const eventos = await db.select().from(evento).where(eq(evento.asignacionId, asignacionId));
    expect(eventos).toHaveLength(1);

    await limpiarEmpleado(choferId, asignacionId);
  });

  it('registra la accion "baja" en audit_log', async () => {
    const { choferId, asignacionId } = await sembrarEmpleado();

    await bajaEmpleadoNucleo(actorId, choferId);

    const filas = await db.execute<{ accion: string }>(
      sql`select accion from audit_log where recurso_tipo = 'usuario' and recurso_id = ${choferId}`,
    );
    expect(filas.some((f) => f.accion === 'baja')).toBe(true);

    await limpiarEmpleado(choferId, asignacionId);
  });

  it('revierte TODO si cualquier parte de la transaccion falla (actor sin fila en usuario)', async () => {
    const { choferId, asignacionId } = await sembrarEmpleado();
    const actorInexistente = randomUUID();

    // Con un actor sin fila en `usuario`, el INSERT de la bitacora —ultimo paso
    // de la transaccion— viola la FK: asi se comprueba que la baja falla completa.
    await expect(bajaEmpleadoNucleo(actorInexistente, choferId)).rejects.toThrow();

    const [perfil] = await db
      .select()
      .from(perfilPersonal)
      .where(eq(perfilPersonal.usuarioId, choferId));
    expect(perfil).toBeDefined();

    const dispositivos = await db
      .select()
      .from(dispositivo)
      .where(eq(dispositivo.usuarioId, choferId));
    expect(dispositivos).toHaveLength(1);

    const [filaUsuario] = await db.select().from(usuario).where(eq(usuario.id, choferId));
    expect(filaUsuario?.activo).toBe(true);
    expect(filaUsuario?.deletedAt).toBeNull();

    await limpiarEmpleado(choferId, asignacionId);
  });

  it('responde no_encontrado y no toca nada si el usuario ya fue dado de baja', async () => {
    const { choferId, asignacionId } = await sembrarEmpleado();

    const primera = await bajaEmpleadoNucleo(actorId, choferId);
    expect(primera.ok).toBe(true);

    const segunda = await bajaEmpleadoNucleo(actorId, choferId);
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) {
      expect(segunda.error.codigo).toBe('no_encontrado');
    }

    await limpiarEmpleado(choferId, asignacionId);
  });

  it('falla completa (no deja nada a medias) si el usuario no existe', async () => {
    const resultado = await bajaEmpleadoNucleo(actorId, randomUUID());
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('no_encontrado');
    }
  });
});
