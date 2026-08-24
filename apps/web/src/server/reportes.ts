'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts, monitor.ts): su
// carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { derivarEstado, type EstadoSemaforo } from '@rutas/shared';
import { asignacion, cliente, db, evento, horario, perfilPersonal, ruta } from '@rutas/shared/db';
import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

// Las cuatro consultas del paso 15. Todas asumen que quien llega hasta aqui
// ya paso el gate de `supervisor`/`admin` de `proxy.ts` (mismo patron que
// monitor.ts: no hay `can()` propio aqui porque la ruta ya lo exige).

const LIMITE_DEFAULT = 50;
const LIMITE_MAXIMO = 200;

function rangoValido(desde: string, hasta: string) {
  return and(
    gte(asignacion.fecha, desde),
    lte(asignacion.fecha, hasta),
    isNull(asignacion.canceladaEn),
  );
}

export interface ClienteBasico {
  id: string;
  nombre: string;
}

/** Usado por la portada del PDF (`/reportes/cliente/[id]/imprimible`, paso 15). */
export async function obtenerClientePorId(id: string): Promise<ClienteBasico | null> {
  const [fila] = await db
    .select({ id: cliente.id, nombre: cliente.nombre })
    .from(cliente)
    .where(eq(cliente.id, id))
    .limit(1);
  return fila ?? null;
}

// === 1. Cumplimiento por chofer, desglosado por origen =====================
// Done-when: los conteos de origen='app' y origen='supervisor' NUNCA se
// suman en un solo total — se devuelven en dos sub-objetos separados y quien
// consuma esto tiene que sumarlos a proposito si de verdad los quiere juntos.

export interface ConteoOrigen {
  total: number;
  aTiempo: number;
}

export interface FilaCumplimiento {
  choferId: string;
  choferNombre: string | null;
  app: ConteoOrigen;
  supervisor: ConteoOrigen;
}

export async function obtenerCumplimientoPorChofer(
  desde: string,
  hasta: string,
): Promise<FilaCumplimiento[]> {
  const filas = await db
    .select({
      choferId: asignacion.choferId,
      choferNombre: perfilPersonal.nombre,
      origen: evento.origen,
      ocurrioEn: evento.ocurrioEn,
      horaInicioEsperada: horario.horaInicioEsperada,
    })
    .from(evento)
    .innerJoin(asignacion, eq(asignacion.id, evento.asignacionId))
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, asignacion.choferId))
    .where(and(eq(evento.tipo, 'inicio_ruta'), rangoValido(desde, hasta)));

  const porChofer = new Map<string, FilaCumplimiento>();
  for (const fila of filas) {
    let acumulado = porChofer.get(fila.choferId);
    if (!acumulado) {
      acumulado = {
        choferId: fila.choferId,
        choferNombre: fila.choferNombre,
        app: { total: 0, aTiempo: 0 },
        supervisor: { total: 0, aTiempo: 0 },
      };
      porChofer.set(fila.choferId, acumulado);
    }

    const { puntualidadInicio } = derivarEstado({
      eventos: [
        {
          tipo: 'inicio_ruta',
          ocurrioEn: fila.ocurrioEn.toISOString(),
          recibidoEn: fila.ocurrioEn.toISOString(),
        },
      ],
      horaEsperada: fila.horaInicioEsperada,
      ahora: fila.ocurrioEn,
    });

    const bucket = fila.origen === 'app' ? acumulado.app : acumulado.supervisor;
    bucket.total += 1;
    if (puntualidadInicio === 'a_tiempo') {
      bucket.aTiempo += 1;
    }
  }

  return [...porChofer.values()].sort((a, b) =>
    (a.choferNombre ?? '').localeCompare(b.choferNombre ?? ''),
  );
}

// === 2. Ocupacion por ruta ===================================================
// Done-when: una asignacion con `cnt_abordaron` nulo se EXCLUYE del promedio,
// nunca cuenta como cero. `avg()` de Postgres ya ignora NULL por definicion
// del estandar SQL (los excluye tanto de la suma como del denominador) — la
// trampa comun es escribir `sum(cnt_abordaron) / count(*)`, que SI cuenta el
// nulo como cero porque `count(*)` cuenta la fila aunque el contador este
// vacio. Por eso aqui va `avg()` puro y nunca esa division a mano.

export interface FilaOcupacion {
  rutaId: string;
  rutaNombre: string;
  totalAsignaciones: number;
  esperadosPromedio: number;
  abordaronPromedio: number | null;
  retornaronPromedio: number | null;
}

export async function obtenerOcupacionPorRuta(
  desde: string,
  hasta: string,
  opciones: { clienteId?: string } = {},
): Promise<FilaOcupacion[]> {
  const condiciones = [rangoValido(desde, hasta)];
  if (opciones.clienteId) {
    condiciones.push(eq(ruta.clienteId, opciones.clienteId));
  }

  return db
    .select({
      rutaId: ruta.id,
      rutaNombre: ruta.nombre,
      totalAsignaciones: sql<number>`count(*)::int`,
      esperadosPromedio: sql<number>`avg(${horario.personasEsperadas})::float`,
      abordaronPromedio: sql<number | null>`avg(${asignacion.cntAbordaron})::float`,
      retornaronPromedio: sql<number | null>`avg(${asignacion.cntRetornaron})::float`,
    })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(and(...condiciones))
    .groupBy(ruta.id, ruta.nombre)
    .orderBy(ruta.nombre);
}

// === 2b. Cumplimiento por ruta de un cliente ================================
// Version de (1) agrupada por ruta en vez de chofer, para la portada del PDF
// (§9 paso 15: "puntualidad y ocupacion de todas sus rutas").

export interface FilaCumplimientoRuta {
  rutaId: string;
  rutaNombre: string;
  app: ConteoOrigen;
  supervisor: ConteoOrigen;
  /** Estado de la ejecucion mas reciente en el rango — la pastilla de la portada del PDF. */
  ultimoEstado: EstadoSemaforo | null;
  ultimaEjecucionEn: Date | null;
}

export async function obtenerCumplimientoPorRutaDeCliente(
  clienteId: string,
  desde: string,
  hasta: string,
): Promise<FilaCumplimientoRuta[]> {
  const filas = await db
    .select({
      rutaId: ruta.id,
      rutaNombre: ruta.nombre,
      origen: evento.origen,
      ocurrioEn: evento.ocurrioEn,
      horaInicioEsperada: horario.horaInicioEsperada,
    })
    .from(evento)
    .innerJoin(asignacion, eq(asignacion.id, evento.asignacionId))
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .where(
      and(eq(evento.tipo, 'inicio_ruta'), eq(ruta.clienteId, clienteId), rangoValido(desde, hasta)),
    );

  const porRuta = new Map<string, FilaCumplimientoRuta>();
  for (const fila of filas) {
    let acumulado = porRuta.get(fila.rutaId);
    if (!acumulado) {
      acumulado = {
        rutaId: fila.rutaId,
        rutaNombre: fila.rutaNombre,
        app: { total: 0, aTiempo: 0 },
        supervisor: { total: 0, aTiempo: 0 },
        ultimoEstado: null,
        ultimaEjecucionEn: null,
      };
      porRuta.set(fila.rutaId, acumulado);
    }

    const { puntualidadInicio } = derivarEstado({
      eventos: [
        {
          tipo: 'inicio_ruta',
          ocurrioEn: fila.ocurrioEn.toISOString(),
          recibidoEn: fila.ocurrioEn.toISOString(),
        },
      ],
      horaEsperada: fila.horaInicioEsperada,
      ahora: fila.ocurrioEn,
    });

    const bucket = fila.origen === 'app' ? acumulado.app : acumulado.supervisor;
    bucket.total += 1;
    if (puntualidadInicio === 'a_tiempo') {
      bucket.aTiempo += 1;
    }

    if (!acumulado.ultimaEjecucionEn || fila.ocurrioEn > acumulado.ultimaEjecucionEn) {
      acumulado.ultimaEjecucionEn = fila.ocurrioEn;
      acumulado.ultimoEstado = puntualidadInicio;
    }
  }

  return [...porRuta.values()].sort((a, b) => a.rutaNombre.localeCompare(b.rutaNombre));
}

// === 3. Resumen por cliente ==================================================
// Mismo criterio que el reporte 1: puntualidad separada por origen. La
// ocupacion se calcula igual que en el reporte 2 pero agregada por cliente.

export interface FilaResumenCliente {
  clienteId: string;
  clienteNombre: string;
  totalAsignaciones: number;
  app: ConteoOrigen;
  supervisor: ConteoOrigen;
  abordaronPromedio: number | null;
  retornaronPromedio: number | null;
}

export async function obtenerResumenPorCliente(
  desde: string,
  hasta: string,
): Promise<FilaResumenCliente[]> {
  const [filasPuntualidad, filasOcupacion] = await Promise.all([
    db
      .select({
        clienteId: cliente.id,
        origen: evento.origen,
        ocurrioEn: evento.ocurrioEn,
        horaInicioEsperada: horario.horaInicioEsperada,
      })
      .from(evento)
      .innerJoin(asignacion, eq(asignacion.id, evento.asignacionId))
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .innerJoin(ruta, eq(ruta.id, horario.rutaId))
      .innerJoin(cliente, eq(cliente.id, ruta.clienteId))
      .where(and(eq(evento.tipo, 'inicio_ruta'), rangoValido(desde, hasta))),
    db
      .select({
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        totalAsignaciones: sql<number>`count(*)::int`,
        abordaronPromedio: sql<number | null>`avg(${asignacion.cntAbordaron})::float`,
        retornaronPromedio: sql<number | null>`avg(${asignacion.cntRetornaron})::float`,
      })
      .from(asignacion)
      .innerJoin(horario, eq(horario.id, asignacion.horarioId))
      .innerJoin(ruta, eq(ruta.id, horario.rutaId))
      .innerJoin(cliente, eq(cliente.id, ruta.clienteId))
      .where(rangoValido(desde, hasta))
      .groupBy(cliente.id, cliente.nombre),
  ]);

  const porCliente = new Map<string, FilaResumenCliente>();
  for (const fila of filasOcupacion) {
    porCliente.set(fila.clienteId, {
      clienteId: fila.clienteId,
      clienteNombre: fila.clienteNombre,
      totalAsignaciones: fila.totalAsignaciones,
      app: { total: 0, aTiempo: 0 },
      supervisor: { total: 0, aTiempo: 0 },
      abordaronPromedio: fila.abordaronPromedio,
      retornaronPromedio: fila.retornaronPromedio,
    });
  }

  for (const fila of filasPuntualidad) {
    const acumulado = porCliente.get(fila.clienteId);
    if (!acumulado) {
      continue;
    }
    const { puntualidadInicio } = derivarEstado({
      eventos: [
        {
          tipo: 'inicio_ruta',
          ocurrioEn: fila.ocurrioEn.toISOString(),
          recibidoEn: fila.ocurrioEn.toISOString(),
        },
      ],
      horaEsperada: fila.horaInicioEsperada,
      ahora: fila.ocurrioEn,
    });
    const bucket = fila.origen === 'app' ? acumulado.app : acumulado.supervisor;
    bucket.total += 1;
    if (puntualidadInicio === 'a_tiempo') {
      bucket.aTiempo += 1;
    }
  }

  return [...porCliente.values()].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre));
}

// === 4. Bitacora de ejecuciones =============================================
// Version paginada (pantalla HTML, cursor sobre (fecha, id) — igual que §5
// documenta para la bitacora de auditoria) y version CSV en streaming (la
// descarga, sin limite de rango practico: un cursor de Postgres entrega
// lotes en vez de que el arreglo completo viva en memoria del proceso).

export interface FilaEjecucion {
  id: string;
  fecha: string;
  rutaNombre: string;
  turno: string;
  choferNombre: string | null;
  camionCodigo: string;
  horaInicioEsperada: string;
  vioRutaEn: Date | null;
  listoInicioEn: Date | null;
  inicioRutaEn: Date | null;
  inicioRutaOrigen: string | null;
  finRutaEn: Date | null;
  finRutaOrigen: string | null;
  cntAbordaron: number | null;
  retornoEn: Date | null;
  retornoOrigen: string | null;
  cntRetornaron: number | null;
}

export interface PaginaEjecuciones {
  filas: FilaEjecucion[];
  cursorSiguiente: string | null;
}

function columnasEjecucion() {
  return {
    id: asignacion.id,
    fecha: asignacion.fecha,
    rutaNombre: ruta.nombre,
    turno: horario.turno,
    choferNombre: perfilPersonal.nombre,
    camionCodigo: asignacion.camionCodigo,
    horaInicioEsperada: horario.horaInicioEsperada,
    cntAbordaron: asignacion.cntAbordaron,
    cntRetornaron: asignacion.cntRetornaron,
    vioRutaEn: sql<Date | null>`max(${evento.ocurrioEn}) filter (where ${evento.tipo} = 'vio_ruta')`,
    listoInicioEn: sql<Date | null>`max(${evento.ocurrioEn}) filter (where ${evento.tipo} = 'listo_inicio')`,
    inicioRutaEn: sql<Date | null>`max(${evento.ocurrioEn}) filter (where ${evento.tipo} = 'inicio_ruta')`,
    inicioRutaOrigen: sql<
      string | null
    >`max(${evento.origen}::text) filter (where ${evento.tipo} = 'inicio_ruta')`,
    finRutaEn: sql<Date | null>`max(${evento.ocurrioEn}) filter (where ${evento.tipo} = 'fin_ruta')`,
    finRutaOrigen: sql<
      string | null
    >`max(${evento.origen}::text) filter (where ${evento.tipo} = 'fin_ruta')`,
    retornoEn: sql<Date | null>`max(${evento.ocurrioEn}) filter (where ${evento.tipo} = 'retorno')`,
    retornoOrigen: sql<
      string | null
    >`max(${evento.origen}::text) filter (where ${evento.tipo} = 'retorno')`,
  };
}

export async function listarBitacoraEjecuciones(opciones: {
  desde: string;
  hasta: string;
  cursor?: string;
  limite?: number;
}): Promise<PaginaEjecuciones> {
  const limite = Math.min(opciones.limite ?? LIMITE_DEFAULT, LIMITE_MAXIMO);
  const condiciones = [rangoValido(opciones.desde, opciones.hasta)];

  if (opciones.cursor) {
    const [fechaCursor, idCursor] = opciones.cursor.split('_');
    if (fechaCursor && idCursor) {
      condiciones.push(
        sql`(${asignacion.fecha}, ${asignacion.id}) < (${fechaCursor}, ${idCursor})`,
      );
    }
  }

  const filas = await db
    .select(columnasEjecucion())
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .innerJoin(ruta, eq(ruta.id, horario.rutaId))
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, asignacion.choferId))
    .leftJoin(evento, eq(evento.asignacionId, asignacion.id))
    .where(and(...condiciones))
    .groupBy(
      asignacion.id,
      ruta.nombre,
      horario.turno,
      horario.horaInicioEsperada,
      perfilPersonal.nombre,
    )
    .orderBy(desc(asignacion.fecha), desc(asignacion.id))
    .limit(limite + 1);

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina[pagina.length - 1];

  return {
    filas: pagina,
    cursorSiguiente: hayMas && ultima ? `${ultima.fecha}_${ultima.id}` : null,
  };
}
