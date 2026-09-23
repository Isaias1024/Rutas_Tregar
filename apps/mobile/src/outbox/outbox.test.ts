import { randomUUID } from 'node:crypto';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { fetch as fetchUndici } from 'undici';
import type { AlmacenPendientes, FilaPendiente, PayloadEvento } from './db';
import { esperaExponencial, subirPendiente, vaciarCola } from './flusher';
import { construirPayload, registrarEvento } from './registrar';

function crearAlmacenFalso(): AlmacenPendientes & { filas: Map<string, FilaPendiente> } {
  const filas = new Map<string, FilaPendiente>();
  return {
    filas,
    async agregar(fila) {
      filas.set(fila.clientEventId, fila);
    },
    async listar() {
      return [...filas.values()];
    },
    async quitar(clientEventId) {
      filas.delete(clientEventId);
    },
    async marcarReintento(clientEventId, _error, proximoIntentoEn) {
      const fila = filas.get(clientEventId);
      if (fila) {
        filas.set(clientEventId, { ...fila, intentos: fila.intentos + 1, proximoIntentoEn });
      }
    },
    async contar() {
      return filas.size;
    },
  };
}

function payloadDePrueba(overrides: Partial<PayloadEvento> = {}): PayloadEvento {
  return {
    client_event_id: randomUUID(),
    asignacion_id: randomUUID(),
    tipo: 'vio_ruta',
    ocurrio_en: new Date().toISOString(),
    monotonic_ms: 1000,
    lat: null,
    lng: null,
    gps_precision_m: null,
    sin_gps: true,
    origen: 'app',
    capturado_por: randomUUID(),
    ...overrides,
  };
}

describe('construirPayload', () => {
  it('arma el payload con la ubicacion capturada', () => {
    const payload = construirPayload(
      { asignacionId: 'a1', tipo: 'listo_inicio', capturadoPor: 'c1' },
      { lat: 25.6, lng: -100.3, gpsPrecisionM: 5, sinGps: false },
      'id-de-prueba',
    );
    expect(payload.asignacion_id).toBe('a1');
    expect(payload.tipo).toBe('listo_inicio');
    expect(payload.lat).toBe(25.6);
    expect(payload.sin_gps).toBe(false);
    expect(payload.origen).toBe('app');
    expect(payload.client_event_id).toBe('id-de-prueba');
  });

  it('sin ubicacion (permiso negado, timeout o paso sin GPS) queda sin_gps=true y coordenadas nulas', () => {
    const payload = construirPayload(
      { asignacionId: 'a1', tipo: 'vio_ruta', capturadoPor: 'c1' },
      null,
      'id-de-prueba',
    );
    expect(payload.lat).toBeNull();
    expect(payload.lng).toBeNull();
    expect(payload.sin_gps).toBe(true);
  });

  it('incluye el contador cuando se pasa', () => {
    const payload = construirPayload(
      {
        asignacionId: 'a1',
        tipo: 'fin_ruta',
        capturadoPor: 'c1',
        contador: { campo: 'cnt_abordaron', valor: 12 },
      },
      null,
      'id-de-prueba',
    );
    expect(payload.contador).toEqual({ campo: 'cnt_abordaron', valor: 12 });
  });
});

describe('registrarEvento (encolar sin red)', () => {
  it('escribe en el almacen y regresa el payload de inmediato, sin tocar la red', async () => {
    const almacen = crearAlmacenFalso();
    const payload = await registrarEvento(
      { asignacionId: 'a1', tipo: 'vio_ruta', capturadoPor: 'c1' },
      almacen,
      () => randomUUID(),
    );
    expect(almacen.filas.size).toBe(1);
    expect(almacen.filas.get(payload.client_event_id)?.payload).toEqual(payload);
  });
});

describe('esperaExponencial', () => {
  it('crece con cada intento y respeta el tope', () => {
    expect(esperaExponencial(0)).toBe(1000);
    expect(esperaExponencial(1)).toBe(2000);
    expect(esperaExponencial(2)).toBe(4000);
    expect(esperaExponencial(10)).toBe(30_000);
  });
});

describe('vaciarCola (almacen falso)', () => {
  it('sube exito y conflicto y los quita de la cola; deja error para la proxima pasada', async () => {
    const almacen = crearAlmacenFalso();
    await almacen.agregar({
      clientEventId: 'exito-1',
      payload: payloadDePrueba({ client_event_id: 'exito-1' }),
      intentos: 0,
      proximoIntentoEn: null,
    });
    await almacen.agregar({
      clientEventId: 'error-1',
      payload: payloadDePrueba({ client_event_id: 'error-1' }),
      intentos: 0,
      proximoIntentoEn: null,
    });

    const clienteFalso = {
      from: (tabla: string) => ({
        insert: async (fila: { client_event_id: string }) => {
          if (tabla !== 'evento') {
            return { error: null };
          }
          return fila.client_event_id === 'error-1'
            ? { error: { code: '500', message: 'fallo simulado' } }
            : { error: null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    } as unknown as SupabaseClient;

    await vaciarCola(almacen, clienteFalso);

    expect(almacen.filas.has('exito-1')).toBe(false);
    expect(almacen.filas.has('error-1')).toBe(true);
    expect(almacen.filas.get('error-1')?.intentos).toBe(1);
    expect(almacen.filas.get('error-1')?.proximoIntentoEn).not.toBeNull();
  });

  it('no reintenta una fila cuyo proximoIntentoEn todavia no llega', async () => {
    const almacen = crearAlmacenFalso();
    const enElFuturo = new Date(Date.now() + 60_000).toISOString();
    await almacen.agregar({
      clientEventId: 'espera-1',
      payload: payloadDePrueba({ client_event_id: 'espera-1' }),
      intentos: 1,
      proximoIntentoEn: enElFuturo,
    });

    let seLlamo = false;
    const clienteFalso = {
      from: () => ({
        insert: async () => {
          seLlamo = true;
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;

    await vaciarCola(almacen, clienteFalso);

    expect(seLlamo).toBe(false);
    expect(almacen.filas.has('espera-1')).toBe(true);
  });
});

describe('subirPendiente: idempotencia contra Supabase real', () => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  // El `fetch` global de jest-expo es `expo/fetch`, que fuera de un dispositivo
  // real responde vacio: se le pasa a supabase-js el fetch de `undici`.
  const fetchReal = fetchUndici as unknown as typeof globalThis.fetch;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchReal },
  });
  const sql = postgres(process.env.DATABASE_URL as string);

  const correo = `outbox-test-${randomUUID().slice(0, 8)}@choferes.rutas.local`;
  const passwordPrueba = 'Outbox-Prueba-12345678';

  let choferId: string;
  let clienteId: string;
  let paradaInicioId: string;
  let paradaFinId: string;
  let rutaId: string;
  let horarioId: string;
  let camionId: string;
  let asignacionId: string;
  let clienteChofer: SupabaseClient;

  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: correo,
      password: passwordPrueba,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear el chofer de prueba: ${error?.message}`);
    }
    choferId = data.user.id;

    clienteId = randomUUID();
    paradaInicioId = randomUUID();
    paradaFinId = randomUUID();
    rutaId = randomUUID();
    horarioId = randomUUID();
    camionId = randomUUID();
    asignacionId = randomUUID();

    await sql`insert into usuario (id, credencial, rol) values (${choferId}, ${`outbox-${choferId.slice(0, 8)}`}, 'chofer')`;
    await sql`insert into cliente (id, nombre) values (${clienteId}, 'Cliente de prueba (outbox)')`;
    await sql`insert into parada (id, nombre, direccion, lat, lng) values
      (${paradaInicioId}, 'Parada inicio', 'Direccion 1', 25.6866, -100.3161),
      (${paradaFinId}, 'Parada fin', 'Direccion 2', 25.7, -100.3)`;
    await sql`insert into ruta (id, cliente_id, nombre, parada_inicio_id, parada_fin_id) values
      (${rutaId}, ${clienteId}, 'Ruta de prueba (outbox)', ${paradaInicioId}, ${paradaFinId})`;
    await sql`insert into horario (id, ruta_id, turno, hora_inicio_esperada, hora_fin_esperada, personas_esperadas) values
      (${horarioId}, ${rutaId}, 'manana', '06:00', '07:00', 10)`;
    await sql`insert into camion (id, codigo, tipo, placas) values
      (${camionId}, ${`T-OUTBOX-${camionId.slice(0, 6)}`}, 'sprinter', 'OUT-001')`;
    await sql`insert into asignacion (id, horario_id, fecha, chofer_id, camion_id, camion_codigo, created_by) values
      (${asignacionId}, ${horarioId}, '2026-08-10', ${choferId}, ${camionId}, 'T-OUTBOX', ${choferId})`;

    const anon = createClient(supabaseUrl, anonKey, { global: { fetch: fetchReal } });
    const { data: sesion, error: errorSesion } = await anon.auth.signInWithPassword({
      email: correo,
      password: passwordPrueba,
    });
    if (errorSesion || !sesion.session) {
      throw new Error(
        `No se pudo iniciar sesion como el chofer de prueba: ${errorSesion?.message}`,
      );
    }
    clienteChofer = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${sesion.session.access_token}` },
        fetch: fetchReal,
      },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    await sql`delete from evento where asignacion_id = ${asignacionId}`;
    await sql`delete from audit_log where actor_id = ${choferId}`;
    await sql`delete from asignacion where id = ${asignacionId}`;
    await sql`delete from horario where id = ${horarioId}`;
    await sql`delete from ruta where id = ${rutaId}`;
    await sql`delete from camion where id = ${camionId}`;
    await sql`delete from parada where id in (${paradaInicioId}, ${paradaFinId})`;
    await sql`delete from cliente where id = ${clienteId}`;
    await sql`delete from usuario where id = ${choferId}`;
    await sql.end();
    await admin.auth.admin.deleteUser(choferId);
  });

  it('el mismo client_event_id enviado dos veces deja exactamente una fila en evento', async () => {
    const payload = payloadDePrueba({
      client_event_id: randomUUID(),
      asignacion_id: asignacionId,
      tipo: 'vio_ruta',
      capturado_por: choferId,
    });

    const primero = await subirPendiente(payload, clienteChofer);
    expect(primero).toBe('exito');

    const segundo = await subirPendiente(payload, clienteChofer);
    expect(segundo).toBe('conflicto');

    const filas =
      await sql`select id from evento where client_event_id = ${payload.client_event_id}`;
    expect(filas).toHaveLength(1);
  });

  it('un conflicto por (asignacion_id, tipo) tambien se trata como exito', async () => {
    const primero = payloadDePrueba({
      client_event_id: randomUUID(),
      asignacion_id: asignacionId,
      tipo: 'listo_inicio',
      capturado_por: choferId,
    });
    const segundoConOtroClientEventId = payloadDePrueba({
      client_event_id: randomUUID(),
      asignacion_id: asignacionId,
      tipo: 'listo_inicio',
      capturado_por: choferId,
    });

    expect(await subirPendiente(primero, clienteChofer)).toBe('exito');
    expect(await subirPendiente(segundoConOtroClientEventId, clienteChofer)).toBe('conflicto');

    const filas =
      await sql`select id from evento where asignacion_id = ${asignacionId} and tipo = 'listo_inicio'`;
    expect(filas).toHaveLength(1);
  });

  // Orden a proposito: el trigger exige el siguiente paso de ORDEN_PASOS, asi que
  // "vaciarCola... inicio_ruta" tiene que correr antes que "...fin_ruta".
  it('vaciarCola sobre la cola real: sube lo pendiente y la deja vacia', async () => {
    const almacen = crearAlmacenFalso();
    const payload = payloadDePrueba({
      client_event_id: randomUUID(),
      asignacion_id: asignacionId,
      tipo: 'inicio_ruta',
      capturado_por: choferId,
    });
    await almacen.agregar({
      clientEventId: payload.client_event_id,
      payload,
      intentos: 0,
      proximoIntentoEn: null,
    });

    await vaciarCola(almacen, clienteChofer);

    expect(almacen.filas.size).toBe(0);
    const filas =
      await sql`select id from evento where client_event_id = ${payload.client_event_id}`;
    expect(filas).toHaveLength(1);
  });

  it('sube el contador a la asignacion al registrar fin_ruta', async () => {
    const payload = payloadDePrueba({
      client_event_id: randomUUID(),
      asignacion_id: asignacionId,
      tipo: 'fin_ruta',
      capturado_por: choferId,
      contador: { campo: 'cnt_abordaron', valor: 17 },
    });

    expect(await subirPendiente(payload, clienteChofer)).toBe('exito');

    const [fila] = await sql`select cnt_abordaron from asignacion where id = ${asignacionId}`;
    expect(fila?.cnt_abordaron).toBe(17);
  });
});
