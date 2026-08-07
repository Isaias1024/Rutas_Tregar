import { randomUUID } from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import {
  asignacion,
  camion,
  cliente,
  db,
  evento,
  horario,
  parada,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  obtenerCumplimientoPorChofer,
  obtenerOcupacionPorRuta,
  obtenerResumenPorCliente,
  listarBitacoraEjecuciones,
} from './reportes.ts';
import { streamBitacoraEjecucionesCsv } from './reportes-csv.ts';

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

describe('reportes (paso 15) contra Postgres real', () => {
  const choferId = randomUUID();
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const rutaId = randomUUID();
  const camionId = randomUUID();
  const horarioTempranoId = randomUUID();
  const horarioTardioId = randomUUID();
  const asignacionA1Id = randomUUID();
  const asignacionA2Id = randomUUID();
  const asignacionB1Id = randomUUID();

  const desde = '2026-08-10';
  const hasta = '2026-08-11';

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${choferId})`);
    await db.insert(usuario).values({
      id: choferId,
      credencial: `reportes-chofer-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (reportes)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (reportes)',
        direccion: 'Direccion 1',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (reportes)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (reportes)',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-REP-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'REP-001',
    });
    await db.insert(horario).values([
      {
        id: horarioTempranoId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '06:00',
        horaFinEsperada: '07:00',
        personasEsperadas: 20,
      },
      {
        id: horarioTardioId,
        rutaId,
        turno: 'manana',
        horaInicioEsperada: '08:00',
        horaFinEsperada: '09:00',
        personasEsperadas: 10,
      },
    ]);

    // A1: a tiempo (06:05, dentro de la tolerancia de ±10 min), origen app,
    // y CON contadores — es la unica fila que debe entrar al promedio de
    // ocupacion.
    await db.insert(asignacion).values({
      id: asignacionA1Id,
      horarioId: horarioTempranoId,
      fecha: desde,
      secuencia: 1,
      choferId,
      camionId,
      camionCodigo: 'T-REP',
      cntAbordaron: 18,
      cntRetornaron: 17,
      createdBy: choferId,
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: asignacionA1Id,
      tipo: 'inicio_ruta',
      ocurrioEn: instanteLocal(desde, '06:05'),
      origen: 'app',
      capturadoPor: choferId,
      clientEventId: randomUUID(),
    });

    // A2: mismo horario, otro dia del rango, SIN eventos y SIN contadores
    // (cnt_abordaron/cnt_retornaron nulos) — la fila que un `sum()/count(*)`
    // contaria mal como cero.
    await db.insert(asignacion).values({
      id: asignacionA2Id,
      horarioId: horarioTempranoId,
      fecha: hasta,
      secuencia: 1,
      choferId,
      camionId,
      camionCodigo: 'T-REP',
      createdBy: choferId,
    });

    // B1: tarde (08:20 contra 08:00 esperado), origen supervisor, sin
    // contadores tampoco — separa el desglose de origen del de A1.
    await db.insert(asignacion).values({
      id: asignacionB1Id,
      horarioId: horarioTardioId,
      fecha: desde,
      secuencia: 1,
      choferId,
      camionId,
      camionCodigo: 'T-REP',
      createdBy: choferId,
    });
    await db.insert(evento).values({
      id: randomUUID(),
      asignacionId: asignacionB1Id,
      tipo: 'inicio_ruta',
      ocurrioEn: instanteLocal(desde, '08:20'),
      origen: 'supervisor',
      capturadoPor: choferId,
      clientEventId: randomUUID(),
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where actor_id = ${choferId}`);
    await db.execute(
      sql`delete from evento where asignacion_id in (${asignacionA1Id}, ${asignacionA2Id}, ${asignacionB1Id})`,
    );
    await db.execute(
      sql`delete from asignacion where id in (${asignacionA1Id}, ${asignacionA2Id}, ${asignacionB1Id})`,
    );
    await db.execute(
      sql`delete from horario where id in (${horarioTempranoId}, ${horarioTardioId})`,
    );
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id = ${choferId}`);
  });

  describe('1. cumplimiento por chofer', () => {
    it('desglosa app y supervisor sin sumarlos en un solo total', async () => {
      const filas = await obtenerCumplimientoPorChofer(desde, hasta);
      const fila = filas.find((f) => f.choferId === choferId);
      expect(fila).toBeDefined();
      // Si el codigo sumara los origenes en un solo contador, cualquiera de
      // estas dos aserciones fallaria (el total combinado seria 2, no 1).
      expect(fila?.app).toEqual({ total: 1, aTiempo: 1 });
      expect(fila?.supervisor).toEqual({ total: 1, aTiempo: 0 });
    });
  });

  describe('2. ocupacion por ruta', () => {
    it('excluye cnt_abordaron nulo del promedio en vez de contarlo como cero', async () => {
      const filas = await obtenerOcupacionPorRuta(desde, hasta);
      const fila = filas.find((f) => f.rutaId === rutaId);
      expect(fila).toBeDefined();
      // Dos asignaciones cuentan para el total, pero solo A1 tiene
      // contadores: avg([18, null]) = 18, NUNCA (18 + 0) / 2 = 9.
      expect(fila?.totalAsignaciones).toBe(3);
      expect(fila?.abordaronPromedio).toBe(18);
      expect(fila?.retornaronPromedio).toBe(17);
    });
  });

  describe('3. resumen por cliente', () => {
    it('agrega ocupacion y desglosa origen igual que el reporte 1', async () => {
      const filas = await obtenerResumenPorCliente(desde, hasta);
      const fila = filas.find((f) => f.clienteId === clienteId);
      expect(fila).toBeDefined();
      expect(fila?.totalAsignaciones).toBe(3);
      expect(fila?.abordaronPromedio).toBe(18);
      expect(fila?.app).toEqual({ total: 1, aTiempo: 1 });
      expect(fila?.supervisor).toEqual({ total: 1, aTiempo: 0 });
    });
  });

  describe('4. bitacora de ejecuciones — pantalla paginada', () => {
    it('pagina por cursor: dos paginas de limite 2 cubren las 3 filas sin repetir', async () => {
      const primera = await listarBitacoraEjecuciones({ desde, hasta, limite: 2 });
      expect(primera.filas).toHaveLength(2);
      expect(primera.cursorSiguiente).not.toBeNull();

      const segunda = await listarBitacoraEjecuciones({
        desde,
        hasta,
        limite: 2,
        cursor: primera.cursorSiguiente ?? undefined,
      });
      expect(segunda.filas).toHaveLength(1);
      expect(segunda.cursorSiguiente).toBeNull();

      const idsVistos = new Set([...primera.filas, ...segunda.filas].map((f) => f.id));
      expect(idsVistos.size).toBe(3);
    });

    it('trae el origen del evento inicio_ruta por fila', async () => {
      const { filas } = await listarBitacoraEjecuciones({ desde, hasta, limite: 10 });
      const filaA1 = filas.find((f) => f.id === asignacionA1Id);
      expect(filaA1?.inicioRutaOrigen).toBe('app');
      const filaB1 = filas.find((f) => f.id === asignacionB1Id);
      expect(filaB1?.inicioRutaOrigen).toBe('supervisor');
    });
  });

  describe('4b. bitacora de ejecuciones — CSV en streaming', () => {
    it('el primer chunk leido del stream es exactamente el encabezado, antes de cualquier fila', async () => {
      const stream = streamBitacoraEjecucionesCsv(desde, hasta);
      const lector = stream.getReader();
      const decodificador = new TextDecoder();

      const primerChunk = await lector.read();
      expect(primerChunk.done).toBe(false);
      const textoPrimerChunk = decodificador.decode(primerChunk.value);
      expect(textoPrimerChunk.startsWith('fecha,ruta,turno,chofer,camion,')).toBe(true);
      // El encabezado se encola en una sola pieza, antes de que el cursor de
      // Postgres pida el primer lote: en este punto todavia no hay ninguna
      // fila de datos en el chunk que se acaba de leer.
      expect(textoPrimerChunk.split('\n').filter(Boolean)).toHaveLength(1);

      await lector.cancel();
    });

    it('emite las 3 filas del rango con los contadores y el origen correctos', async () => {
      const stream = streamBitacoraEjecucionesCsv(desde, hasta);
      const lector = stream.getReader();
      const decodificador = new TextDecoder();
      let completo = '';
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        completo += decodificador.decode(value);
      }

      const lineas = completo.trim().split('\n');
      expect(lineas[0]).toBe(
        'fecha,ruta,turno,chofer,camion,hora_inicio_esperada,vio_ruta_en,listo_inicio_en,' +
          'inicio_ruta_en,inicio_ruta_origen,fin_ruta_en,fin_ruta_origen,cnt_abordaron,' +
          'retorno_en,retorno_origen,cnt_retornaron',
      );
      // encabezado + 3 filas de datos.
      expect(lineas).toHaveLength(4);
      const filaConAbordaron = lineas.find((l) => l.includes(',18,'));
      expect(filaConAbordaron).toBeDefined();
      expect(filaConAbordaron).toContain('app');
    });
  });
});
