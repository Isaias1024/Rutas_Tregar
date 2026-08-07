import { randomUUID } from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import {
  asignacion,
  camion,
  cliente,
  db,
  dispositivo,
  horario,
  notificacionProgramada,
  parada,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { and, eq, sql } from 'drizzle-orm';
import type { ExpoPushTicket } from 'expo-server-sdk';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientePush } from './enviar.ts';
import { enviarNotificacion } from './enviar.ts';
import { programarAlertasRetraso, programarRecordatorios } from './programar.ts';

const ZONA_OPERATIVA = 'America/Mexico_City';

function instanteLocal(fecha: string, hora: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const [horas, minutos] = hora.split(':').map(Number);
  return new TZDate(
    anio ?? 1970,
    (mes ?? 1) - 1,
    dia ?? 1,
    horas ?? 0,
    minutos ?? 0,
    0,
    ZONA_OPERATIVA,
  );
}

describe('push (paso 14)', () => {
  const choferId = randomUUID();
  const supervisorId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const rutaId = randomUUID();
  const camionId = randomUUID();
  const fechaHoy = '2026-08-10';
  const ahora = instanteLocal(fechaHoy, '06:00');

  let horarioProntoId: string;
  let horarioLejanoId: string;
  let horarioRetrasadoId: string;
  let asignacionProntoId: string;
  let asignacionLejanaId: string;
  let asignacionRetrasadaId: string;

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${choferId}), (${supervisorId})`);
    await db.insert(usuario).values([
      { id: choferId, credencial: `push-chofer-${choferId.slice(0, 8)}`, rol: 'chofer' },
      { id: supervisorId, credencial: `push-super-${supervisorId.slice(0, 8)}`, rol: 'supervisor' },
    ]);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (push)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (push)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (push)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (push)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-PUSH-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'PSH-001',
    });

    horarioProntoId = randomUUID();
    horarioLejanoId = randomUUID();
    horarioRetrasadoId = randomUUID();
    await db.insert(horario).values([
      // 06:25: dispara el recordatorio (30 min antes = 05:55, ya paso de las 06:00 = ahora).
      {
        id: horarioProntoId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '06:25',
        horaFinEsperada: '07:25',
        personasEsperadas: 10,
      },
      // 09:00: ni el recordatorio ni la alerta deben dispararse todavia.
      {
        id: horarioLejanoId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '09:00',
        horaFinEsperada: '10:00',
        personasEsperadas: 10,
      },
      // 05:30: ya paso la hora esperada de inicio -> alerta de retraso.
      {
        id: horarioRetrasadoId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '05:30',
        horaFinEsperada: '06:30',
        personasEsperadas: 10,
      },
    ]);

    asignacionProntoId = randomUUID();
    asignacionLejanaId = randomUUID();
    asignacionRetrasadaId = randomUUID();
    await db.insert(asignacion).values([
      {
        id: asignacionProntoId,
        horarioId: horarioProntoId,
        fecha: fechaHoy,
        choferId,
        camionId,
        camionCodigo: 'T-PUSH',
        createdBy: choferId,
      },
      {
        id: asignacionLejanaId,
        horarioId: horarioLejanoId,
        fecha: fechaHoy,
        secuencia: 1,
        choferId,
        camionId,
        camionCodigo: 'T-PUSH',
        createdBy: choferId,
      },
      {
        id: asignacionRetrasadaId,
        horarioId: horarioRetrasadoId,
        fecha: fechaHoy,
        secuencia: 1,
        choferId,
        camionId,
        camionCodigo: 'T-PUSH',
        createdBy: choferId,
      },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where actor_id in (${choferId}, ${supervisorId})`);
    await db
      .delete(notificacionProgramada)
      .where(
        sql`asignacion_id in (${asignacionProntoId}, ${asignacionLejanaId}, ${asignacionRetrasadaId})`,
      );
    await db.delete(dispositivo).where(eq(dispositivo.usuarioId, choferId));
    await db.execute(
      sql`delete from asignacion where id in (${asignacionProntoId}, ${asignacionLejanaId}, ${asignacionRetrasadaId})`,
    );
    await db.execute(
      sql`delete from horario where id in (${horarioProntoId}, ${horarioLejanoId}, ${horarioRetrasadoId})`,
    );
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.delete(usuario).where(eq(usuario.id, supervisorId));
    await db.execute(sql`delete from auth.users where id in (${choferId}, ${supervisorId})`);
  });

  describe('programarRecordatorios', () => {
    it('encola recordatorio_inicio cuando faltan <= 30 min y no hay inicio_ruta', async () => {
      const total = await programarRecordatorios(ahora);
      expect(total).toBeGreaterThanOrEqual(1);

      const filas = await db
        .select()
        .from(notificacionProgramada)
        .where(
          and(
            eq(notificacionProgramada.asignacionId, asignacionProntoId),
            eq(notificacionProgramada.tipo, 'recordatorio_inicio'),
          ),
        );
      expect(filas).toHaveLength(1);
    });

    it('no encola para una asignacion cuya hora esperada esta lejos', async () => {
      await programarRecordatorios(ahora);
      const filas = await db
        .select()
        .from(notificacionProgramada)
        .where(eq(notificacionProgramada.asignacionId, asignacionLejanaId));
      expect(filas).toHaveLength(0);
    });

    it('el barrido es idempotente: correr dos veces deja una sola fila pendiente', async () => {
      await programarRecordatorios(ahora);
      await programarRecordatorios(ahora);

      const filas = await db
        .select()
        .from(notificacionProgramada)
        .where(
          and(
            eq(notificacionProgramada.asignacionId, asignacionProntoId),
            eq(notificacionProgramada.tipo, 'recordatorio_inicio'),
          ),
        );
      expect(filas).toHaveLength(1);
    });
  });

  describe('programarAlertasRetraso', () => {
    it('encola alerta_retraso cuando ya paso la hora esperada sin inicio_ruta', async () => {
      const total = await programarAlertasRetraso(ahora);
      expect(total).toBeGreaterThanOrEqual(1);

      const filas = await db
        .select()
        .from(notificacionProgramada)
        .where(
          and(
            eq(notificacionProgramada.asignacionId, asignacionRetrasadaId),
            eq(notificacionProgramada.tipo, 'alerta_retraso'),
          ),
        );
      expect(filas).toHaveLength(1);
    });

    it('no encola para una asignacion cuya hora esperada todavia no llega', async () => {
      await programarAlertasRetraso(ahora);
      const filas = await db
        .select()
        .from(notificacionProgramada)
        .where(
          and(
            eq(notificacionProgramada.asignacionId, asignacionLejanaId),
            eq(notificacionProgramada.tipo, 'alerta_retraso'),
          ),
        );
      expect(filas).toHaveLength(0);
    });
  });

  describe('enviarNotificacion', () => {
    it('un ticket DeviceNotRegistered borra la fila de dispositivo y no revienta', async () => {
      const dispositivoId = randomUUID();
      await db.insert(dispositivo).values({
        id: dispositivoId,
        usuarioId: choferId,
        expoPushToken: 'ExponentPushToken[token-de-prueba-invalido]',
        plataforma: 'ios',
        appVersion: '1.0.0',
      });

      const clienteFalso: ClientePush = {
        sendPushNotificationsAsync: async () =>
          [
            {
              status: 'error',
              message: 'DeviceNotRegistered',
              details: { error: 'DeviceNotRegistered' },
            },
          ] as ExpoPushTicket[],
      };

      const logger = pino({ enabled: false });
      await enviarNotificacion(
        logger,
        { id: randomUUID(), tipo: 'asignacion_nueva', asignacionId: asignacionProntoId },
        clienteFalso,
      );

      const filas = await db.select().from(dispositivo).where(eq(dispositivo.id, dispositivoId));
      expect(filas).toHaveLength(0);
    });

    it('ningun log emitido menciona el token del dispositivo', async () => {
      const dispositivoId = randomUUID();
      const tokenSecreto = 'ExponentPushToken[NUNCA-DEBE-APARECER-EN-UN-LOG]';
      await db.insert(dispositivo).values({
        id: dispositivoId,
        usuarioId: choferId,
        expoPushToken: tokenSecreto,
        plataforma: 'android',
        appVersion: '1.0.0',
      });

      const clienteFalso: ClientePush = {
        sendPushNotificationsAsync: async () =>
          [{ status: 'ok', id: 'ticket-1' }] as ExpoPushTicket[],
      };

      const lineasCapturadas: string[] = [];
      const logger = pino(
        {
          redact: {
            paths: [
              'token',
              'password',
              'authorization',
              'expo_push_token',
              'telefono',
              'correo',
              'nombre',
            ],
            censor: '[redactado]',
          },
        },
        { write: (linea: string) => lineasCapturadas.push(linea) },
      );

      await enviarNotificacion(
        logger,
        { id: randomUUID(), tipo: 'asignacion_nueva', asignacionId: asignacionProntoId },
        clienteFalso,
      );

      const salidaCompleta = lineasCapturadas.join('\n');
      expect(salidaCompleta).not.toContain(tokenSecreto);

      await db.delete(dispositivo).where(eq(dispositivo.id, dispositivoId));
    });
  });
});
