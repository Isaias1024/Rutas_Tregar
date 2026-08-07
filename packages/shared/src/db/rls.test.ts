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
    // Por rango, no por `eventoAId`: el grupo de auditoria de seguridad (mas
    // abajo) inserta sus propios eventos y filas de `audit_log` via el
    // trigger `asignacion_auditar_contadores`, con ids que este bloque no
    // conoce.
    await db.execute(
      sql`delete from audit_log where recurso_id in (${asignacionAId}, ${asignacionBId})`,
    );
    await db.execute(
      sql`delete from evento where asignacion_id in (${asignacionAId}, ${asignacionBId})`,
    );
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

  it('el chofer A puede registrar cnt_abordaron en su propia asignacion, DESPUES de marcar fin_ruta', async () => {
    // Refleja el flujo real de dos pasos del outbox
    // (apps/mobile/src/outbox/flusher.ts): primero el evento, aparte el
    // contador. `asignacion_update_contadores_propios` (auditoria de
    // seguridad, post paso 16) exige que el evento ya exista antes de
    // aceptar el contador — sin este insert previo, la prueba de abajo
    // fallaria contra la politica nueva, no solo contra la vieja.
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: asignacionAId,
      tipo: 'listo_inicio',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferAId,
      clientEventId: randomUUID(),
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: asignacionAId,
      tipo: 'inicio_ruta',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferAId,
      clientEventId: randomUUID(),
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: asignacionAId,
      tipo: 'fin_ruta',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferAId,
      clientEventId: randomUUID(),
    });

    const comoA = await comoUsuario(choferAId);
    await comoA`update asignacion set cnt_abordaron = 12 where id = ${asignacionAId}`;
    const [fila] = await comoA`select cnt_abordaron from asignacion where id = ${asignacionAId}`;
    expect(fila?.cnt_abordaron).toBe(12);
    await comoA.end();
  });

  it('el chofer B NO puede registrar cnt_abordaron en su PROPIA asignacion sin haber marcado fin_ruta', async () => {
    // asignacionB no tiene ningun evento sembrado: prueba el hueco en si
    // (contador sin evento), separado de la prueba de aislamiento
    // cross-chofer de mas abajo. A diferencia de un `USING` que excluye la
    // fila (0 filas, sin error), aqui la fila SI es visible/editable por
    // `USING` — es el `WITH CHECK` sobre el resultado el que la rechaza, y
    // eso Postgres lo reporta como una excepcion, no como 0 filas.
    const comoB = await comoUsuario(choferBId);
    await expect(
      comoB`update asignacion set cnt_abordaron = 7 where id = ${asignacionBId}`,
    ).rejects.toThrow(/row-level security/);
    await comoB.end();
  });

  it('el chofer B NO puede registrar cnt_retornaron en su PROPIA asignacion sin haber marcado retorno', async () => {
    const comoB = await comoUsuario(choferBId);
    await expect(
      comoB`update asignacion set cnt_retornaron = 5 where id = ${asignacionBId}`,
    ).rejects.toThrow(/row-level security/);
    await comoB.end();
  });

  it('el chofer A no puede tocar el cnt_abordaron de una asignacion del chofer B', async () => {
    const comoA = await comoUsuario(choferAId);
    const filas =
      await comoA`update asignacion set cnt_abordaron = 99 where id = ${asignacionBId} returning id`;
    expect(filas).toHaveLength(0);
    await comoA.end();
  });

  it('el chofer A no puede cambiar el camion de su propia asignacion (solo los contadores tienen GRANT)', async () => {
    const comoA = await comoUsuario(choferAId);
    await expect(
      comoA`update asignacion set camion_id = ${camionId} where id = ${asignacionAId}`,
    ).rejects.toThrow();
    await comoA.end();
  });
});

// Auditoria de seguridad (post paso 16): el `evento_insert_chofer` original
// solo comprobaba la propiedad de la asignacion, nunca `origen` ni
// `capturado_por` ni el orden de los cinco pasos — un JWT de chofer robado, o
// un cliente movil modificado, podia mandar directo a PostgREST un evento con
// `origen: 'supervisor'`, `capturado_por` de otra persona, o fuera de orden.
describe('rls: el trigger de evento fuerza origen/capturado_por y el orden', () => {
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();
  const choferId = randomUUID();
  const otraPersonaId = randomUUID();
  const asignacionId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${choferId}), (${otraPersonaId})`);
    await db
      .insert(cliente)
      .values({ id: clienteId, nombre: 'Cliente de prueba (evento-trigger)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (evento-trigger)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (evento-trigger)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(camion).values({
      id: camionId,
      codigo: `EVT-${camionId.slice(0, 8)}`,
      tipo: 'Van',
      placas: 'EVT-0001',
    });
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (evento-trigger)',
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
      { id: choferId, credencial: `chofer-evt-${choferId.slice(0, 8)}`, rol: 'chofer' },
      { id: otraPersonaId, credencial: `otra-evt-${otraPersonaId.slice(0, 8)}`, rol: 'supervisor' },
    ]);
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: '2026-08-10',
      choferId,
      camionId,
      camionCodigo: 'EVT-A',
      createdBy: choferId,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from evento where asignacion_id = ${asignacionId}`);
    await db.execute(sql`delete from asignacion where id = ${asignacionId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.execute(sql`delete from ruta where id = ${rutaId}`);
    await db.execute(sql`delete from camion where id = ${camionId}`);
    await db.execute(sql`delete from parada where id in (${paradaInicioId}, ${paradaFinId})`);
    await db.execute(sql`delete from cliente where id = ${clienteId}`);
    await db.execute(sql`delete from usuario where id in (${choferId}, ${otraPersonaId})`);
    await db.execute(sql`delete from auth.users where id in (${choferId}, ${otraPersonaId})`);
  });

  it('un evento insertado con origen=supervisor via PostgREST queda forzado a origen=app', async () => {
    const comoChofer = await comoUsuario(choferId);
    await comoChofer`
      insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
      values (${asignacionId}, 'vio_ruta', now(), 'supervisor', ${choferId}, ${randomUUID()})
    `;
    const [fila] =
      await comoChofer`select origen from evento where asignacion_id = ${asignacionId}`;
    expect(fila?.origen).toBe('app');
    await comoChofer.end();
  });

  it('un evento con capturado_por de otra persona queda forzado al propio auth.uid()', async () => {
    // El "vio_ruta" de la prueba anterior ya ocupo ese paso; este usa el
    // siguiente de la secuencia (listo_inicio) para no chocar con el orden.
    const comoChofer = await comoUsuario(choferId);
    await comoChofer`
      insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
      values (${asignacionId}, 'listo_inicio', now(), 'app', ${otraPersonaId}, ${randomUUID()})
    `;
    const [fila] =
      await comoChofer`select capturado_por from evento where asignacion_id = ${asignacionId} and tipo = 'listo_inicio'`;
    expect(fila?.capturado_por).toBe(choferId);
    await comoChofer.end();
  });

  it('un chofer no puede saltarse un paso (marcar fin_ruta sin inicio_ruta)', async () => {
    // Van registrados vio_ruta y listo_inicio (pruebas anteriores); falta
    // inicio_ruta antes de fin_ruta.
    const comoChofer = await comoUsuario(choferId);
    await expect(
      comoChofer`
        insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
        values (${asignacionId}, 'fin_ruta', now(), 'app', ${choferId}, ${randomUUID()})
      `,
    ).rejects.toThrow(/fuera de orden/);
    await comoChofer.end();
  });

  it('un chofer no puede repetir un paso ya marcado (vio_ruta otra vez)', async () => {
    // Rechazado por el UNIQUE evento_asignacion_tipo_key, no por el trigger
    // de orden: un `tipo` que ya existe se deja pasar sin validar orden a
    // proposito (es el mismo camino que produce un reintento idempotente del
    // outbox), asi que este repetido cae en el mismo mecanismo de siempre —
    // el resultado final (rechazado) es igual, cambia solo cual restriccion
    // lo atrapa.
    const comoChofer = await comoUsuario(choferId);
    await expect(
      comoChofer`
        insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
        values (${asignacionId}, 'vio_ruta', now(), 'app', ${choferId}, ${randomUUID()})
      `,
    ).rejects.toThrow(/duplicate key value|evento_asignacion_tipo_key/);
    await comoChofer.end();
  });

  it('marcando el paso correcto en orden (inicio_ruta), el insert se acepta', async () => {
    const comoChofer = await comoUsuario(choferId);
    await comoChofer`
      insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
      values (${asignacionId}, 'inicio_ruta', now(), 'app', ${choferId}, ${randomUUID()})
    `;
    const filas =
      await comoChofer`select id from evento where asignacion_id = ${asignacionId} and tipo = 'inicio_ruta'`;
    expect(filas).toHaveLength(1);
    await comoChofer.end();
  });

  it('la captura manual del supervisor (connection de servicio) NO pasa por el trigger de orden ni de origen', async () => {
    // auth.uid() es null en la connection de servicio: el trigger deja
    // origen/capturado_por/orden tal cual los mando la server action — esto
    // es lo que permite que apps/web/src/server/monitor.ts rellene un hueco
    // fuera de orden con origen='supervisor' a proposito.
    const idEvento = randomUUID();
    await db.insert(evento).values({
      id: idEvento,
      asignacionId,
      tipo: 'retorno',
      ocurrioEn: new Date(),
      origen: 'supervisor',
      capturadoPor: otraPersonaId,
      clientEventId: randomUUID(),
    });
    const [fila] = await db.select().from(evento).where(sql`id = ${idEvento}`);
    expect(fila?.origen).toBe('supervisor');
    expect(fila?.capturadoPor).toBe(otraPersonaId);
  });
});

// Auditoria de seguridad (post paso 16): antes, un chofer podia corregir sus
// propios contadores via PostgREST sin dejar ningun rastro en `audit_log` —
// solo el camino del panel (server action) lo auditaba.
describe('rls: el trigger de auditoria registra las correcciones directas del chofer', () => {
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();
  const choferId = randomUUID();
  const asignacionId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${choferId})`);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (auditoria)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (auditoria)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (auditoria)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(camion).values({
      id: camionId,
      codigo: `AUD-${camionId.slice(0, 8)}`,
      tipo: 'Van',
      placas: 'AUD-0001',
    });
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (auditoria)',
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
    await db.insert(usuario).values({
      id: choferId,
      credencial: `chofer-aud-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: '2026-08-10',
      choferId,
      camionId,
      camionCodigo: 'AUD-A',
      createdBy: choferId,
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId,
      tipo: 'fin_ruta',
      ocurrioEn: new Date(),
      origen: 'app',
      capturadoPor: choferId,
      clientEventId: randomUUID(),
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where recurso_id = ${asignacionId}`);
    await db.execute(sql`delete from evento where asignacion_id = ${asignacionId}`);
    await db.execute(sql`delete from asignacion where id = ${asignacionId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.execute(sql`delete from ruta where id = ${rutaId}`);
    await db.execute(sql`delete from camion where id = ${camionId}`);
    await db.execute(sql`delete from parada where id in (${paradaInicioId}, ${paradaFinId})`);
    await db.execute(sql`delete from cliente where id = ${clienteId}`);
    await db.execute(sql`delete from usuario where id = ${choferId}`);
    await db.execute(sql`delete from auth.users where id = ${choferId}`);
  });

  it('actualizar cnt_abordaron via PostgREST deja una fila en audit_log con accion corregir_contadores', async () => {
    const comoChofer = await comoUsuario(choferId);
    await comoChofer`update asignacion set cnt_abordaron = 15 where id = ${asignacionId}`;
    await comoChofer.end();

    const filas = await db.execute<{ accion: string; actor_id: string }>(
      sql`select accion, actor_id from audit_log where recurso_tipo = 'asignacion' and recurso_id = ${asignacionId}`,
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]?.accion).toBe('corregir_contadores');
    expect(filas[0]?.actor_id).toBe(choferId);
  });

  it('una escritura del panel (connection de servicio) NO dispara el trigger de auditoria por duplicado', async () => {
    // auth.uid() es null: el trigger no inserta nada, porque esa escritura
    // ya pasa por registrarAuditoria() en la misma transaccion de TypeScript
    // — insertar aqui tambien duplicaria la bitacora.
    await db.update(asignacion).set({ cntRetornaron: 20 }).where(sql`id = ${asignacionId}`);
    const filas = await db.execute<{ accion: string }>(
      sql`select accion from audit_log where recurso_tipo = 'asignacion' and recurso_id = ${asignacionId}`,
    );
    // Sigue siendo solo la fila de la prueba anterior — ninguna nueva.
    expect(filas).toHaveLength(1);
  });
});

// Auditoria de seguridad (post paso 16): antes, dar de baja a un chofer
// (apps/web/src/server/baja-nucleo.ts) solo bloqueaba el panel web
// (`proxy.ts`); nada en RLS comprobaba `usuario.activo`/`deleted_at`, asi que
// un JWT ya emitido seguia funcionando contra PostgREST hasta que expirara
// por su cuenta o el baneo (best-effort, con error silenciado) tuviera exito.
describe('rls: una cuenta desactivada pierde acceso de inmediato, sin depender del baneo de Auth', () => {
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const camionId = randomUUID();
  const rutaId = randomUUID();
  const horarioId = randomUUID();
  const choferId = randomUUID();
  const asignacionId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${choferId})`);
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (baja-rls)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (baja-rls)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (baja-rls)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(camion).values({
      id: camionId,
      codigo: `BAJ-${camionId.slice(0, 8)}`,
      tipo: 'Van',
      placas: 'BAJ-0001',
    });
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (baja-rls)',
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
    await db.insert(usuario).values({
      id: choferId,
      credencial: `chofer-baja-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: '2026-08-10',
      choferId,
      camionId,
      camionCodigo: 'BAJ-A',
      createdBy: choferId,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from evento where asignacion_id = ${asignacionId}`);
    await db.execute(sql`delete from asignacion where id = ${asignacionId}`);
    await db.execute(sql`delete from horario where id = ${horarioId}`);
    await db.execute(sql`delete from ruta where id = ${rutaId}`);
    await db.execute(sql`delete from camion where id = ${camionId}`);
    await db.execute(sql`delete from parada where id in (${paradaInicioId}, ${paradaFinId})`);
    await db.execute(sql`delete from cliente where id = ${clienteId}`);
    await db.execute(sql`delete from usuario where id = ${choferId}`);
    await db.execute(sql`delete from auth.users where id = ${choferId}`);
  });

  it('con activo=true, el chofer lee su propia asignacion normalmente', async () => {
    const comoChofer = await comoUsuario(choferId);
    const filas = await comoChofer`select id from asignacion where id = ${asignacionId}`;
    expect(filas).toHaveLength(1);
    await comoChofer.end();
  });

  it('al marcar activo=false (baja), el MISMO JWT ya no puede leer ni escribir nada, sin esperar a que expire', async () => {
    await db.update(usuario).set({ activo: false }).where(sql`id = ${choferId}`);

    const comoChofer = await comoUsuario(choferId);

    const filasAsignacion = await comoChofer`select id from asignacion where id = ${asignacionId}`;
    expect(filasAsignacion).toHaveLength(0);

    const filasUsuario = await comoChofer`select id from usuario where id = ${choferId}`;
    expect(filasUsuario).toHaveLength(0);

    await expect(
      comoChofer`
        insert into evento (asignacion_id, tipo, ocurrio_en, origen, capturado_por, client_event_id)
        values (${asignacionId}, 'vio_ruta', now(), 'app', ${choferId}, ${randomUUID()})
      `,
    ).rejects.toThrow();

    const filasRuta = await comoChofer`select id from ruta where id = ${rutaId}`;
    expect(filasRuta).toHaveLength(0);

    await comoChofer.end();
    await db.update(usuario).set({ activo: true }).where(sql`id = ${choferId}`);
  });
});
