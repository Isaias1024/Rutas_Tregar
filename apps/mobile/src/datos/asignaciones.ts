import { TZDate } from '@date-fns/tz';
import type { TipoEvento } from '@rutas/shared';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { type CacheAsignaciones, cacheSqlite } from './cache';

// La zona operativa es fija y no una variable de entorno: el proyecto solo opera
// en Mexico y `packages/shared` ya trata `America/Mexico_City` como constante.
const ZONA_OPERATIVA = 'America/Mexico_City';

export type Turno = 'manana' | 'tarde' | 'noche';

export interface EventoDeRuta {
  tipo: TipoEvento;
  ocurrioEn: string;
  lat?: number;
  lng?: number;
  sinGps?: boolean;
}

export interface Parada {
  nombre: string;
  direccion: string;
  lat?: number;
  lng?: number;
}

export interface AsignacionDetallada {
  id: string;
  fecha: string;
  secuencia: number;
  camionCodigo: string;
  /** No nulo = el supervisor solto esta asignacion; la tarjeta la pinta CANCELADA. */
  canceladaEn: string | null;
  /** Los hitos ya marcados, de donde se deriva el estado visible (§ estadoRuta). */
  eventos: EventoDeRuta[];
  horario: {
    id: string;
    turno: Turno;
    horaInicioEsperada: string;
    horaFinEsperada: string;
    ruta: {
      id: string;
      nombre: string;
      paradaInicio: Parada;
      paradaFin: Parada;
    };
  };
}

export interface GrupoDia {
  fecha: string;
  asignaciones: AsignacionDetallada[];
}

export type ConsultaAsignaciones = (
  fechaInicio: string,
  fechaFin: string,
) => Promise<AsignacionDetallada[]>;

/** Hoy, segun el calendario de America/Mexico_City — nunca el del dispositivo ni UTC. */
export function fechaOperativaHoy(): string {
  return format(TZDate.tz(ZONA_OPERATIVA), 'yyyy-MM-dd');
}

/**
 * Aritmetica de calendario pura (Y-M-D + N dias). Ancla en UTC a proposito: no
 * representa un instante, asi que no hay DST ni zona que corra el resultado.
 */
export function sumarDias(fecha: string, dias: number): string {
  const partes = fecha.split('-').map(Number);
  const [anio, mes, dia] = partes;
  if (anio === undefined || mes === undefined || dia === undefined) {
    throw new Error(`sumarDias: fecha invalida "${fecha}"`);
  }
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/**
 * Agrupa por `fecha` tal cual llega de la base, nunca reconstruida desde un
 * `Date`: asi un horario de las 23:30 no brinca de dia por una conversion UTC.
 */
export function agruparPorDia(asignaciones: AsignacionDetallada[]): GrupoDia[] {
  const mapa = new Map<string, AsignacionDetallada[]>();
  for (const asignacion of asignaciones) {
    const lista = mapa.get(asignacion.fecha) ?? [];
    lista.push(asignacion);
    mapa.set(asignacion.fecha, lista);
  }
  for (const lista of mapa.values()) {
    lista.sort((a, b) => a.horario.horaInicioEsperada.localeCompare(b.horario.horaInicioEsperada));
  }
  return [...mapa.entries()]
    .sort(([fechaA], [fechaB]) => fechaA.localeCompare(fechaB))
    .map(([fecha, asignacionesDelDia]) => ({ fecha, asignaciones: asignacionesDelDia }));
}

// Forma cruda de PostgREST: los `to-one` embebidos llegan como objeto, no como
// arreglo de un elemento; `evento` es `to-many` y si llega como arreglo.
interface ParadaCruda {
  nombre: string;
  direccion: string | null;
  lat?: number;
  lng?: number;
}

interface FilaCruda {
  id: string;
  fecha: string;
  secuencia: number;
  camion_codigo: string;
  cancelada_en: string | null;
  evento:
    | {
        tipo: TipoEvento;
        ocurrio_en: string;
        lat?: number | null;
        lng?: number | null;
        sin_gps?: boolean;
      }[]
    | null;
  horario: {
    id: string;
    turno: Turno;
    hora_inicio_esperada: string;
    hora_fin_esperada: string;
    ruta: {
      id: string;
      nombre: string;
      parada_inicio: ParadaCruda | null;
      parada_fin: ParadaCruda | null;
    } | null;
  } | null;
}

function normalizarParada(cruda: ParadaCruda | null | undefined): Parada {
  return {
    nombre: cruda?.nombre ?? '',
    direccion: cruda?.direccion ?? '',
    lat: cruda?.lat,
    lng: cruda?.lng,
  };
}

function normalizar(filas: FilaCruda[]): AsignacionDetallada[] {
  const conRuta = filas.filter(
    (fila): fila is FilaCruda & { horario: NonNullable<FilaCruda['horario']> } =>
      fila.horario !== null && fila.horario.ruta !== null,
  );
  return conRuta.map((fila) => {
    const ruta = fila.horario.ruta as NonNullable<NonNullable<FilaCruda['horario']>['ruta']>;
    return {
      id: fila.id,
      fecha: fila.fecha,
      secuencia: fila.secuencia,
      camionCodigo: fila.camion_codigo,
      canceladaEn: fila.cancelada_en,
      eventos: (fila.evento ?? []).map((evento) => ({
        tipo: evento.tipo,
        ocurrioEn: evento.ocurrio_en,
        lat: evento.lat ?? undefined,
        lng: evento.lng ?? undefined,
        sinGps: evento.sin_gps ?? false,
      })),
      horario: {
        id: fila.horario.id,
        turno: fila.horario.turno,
        horaInicioEsperada: fila.horario.hora_inicio_esperada,
        horaFinEsperada: fila.horario.hora_fin_esperada,
        ruta: {
          id: ruta.id,
          nombre: ruta.nombre,
          paradaInicio: normalizarParada(ruta.parada_inicio),
          paradaFin: normalizarParada(ruta.parada_fin),
        },
      },
    };
  });
}

const SELECT_ASIGNACION_DETALLADA =
  'id, fecha, secuencia, camion_codigo, cancelada_en, evento(tipo, ocurrio_en, lat, lng, sin_gps), horario:horario_id(id, turno, hora_inicio_esperada, hora_fin_esperada, ruta:ruta_id(id, nombre, parada_inicio:parada_inicio_id(nombre, direccion, lat, lng), parada_fin:parada_fin_id(nombre, direccion, lat, lng)))';

/**
 * `incluirCanceladas` existe por Historial: ahi una ruta cancelada es parte de
 * lo que le paso al chofer ese dia. Hoy y Semana la omiten.
 */
async function consultarSupabase(
  fechaInicio: string,
  fechaFin: string,
  incluirCanceladas = false,
): Promise<AsignacionDetallada[]> {
  // RLS (`asignacion_select_chofer`) ya restringe esto a las filas del chofer
  // autenticado: filtrar por chofer_id aqui no agregaria nada.
  let consulta = supabase
    .from('asignacion')
    .select(SELECT_ASIGNACION_DETALLADA)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  if (!incluirCanceladas) {
    consulta = consulta.is('cancelada_en', null);
  }

  const { data, error } = await consulta;
  if (error) {
    throw error;
  }
  return normalizar((data ?? []) as unknown as FilaCruda[]);
}

/** Para la pantalla de detalle (paso 10): una sola asignacion por id. */
export async function obtenerAsignacionPorId(id: string): Promise<AsignacionDetallada | null> {
  const { data, error } = await supabase
    .from('asignacion')
    .select(SELECT_ASIGNACION_DETALLADA)
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return normalizar([data as unknown as FilaCruda])[0] ?? null;
}

/**
 * Nucleo testable: recibe consulta y cache inyectados, sin tocar Supabase ni
 * SQLite. Solo `obtenerAsignaciones` los conecta de verdad.
 */
export async function resolverAsignaciones(
  fechaInicio: string,
  fechaFin: string,
  consultar: ConsultaAsignaciones,
  cache: CacheAsignaciones<AsignacionDetallada>,
): Promise<AsignacionDetallada[]> {
  const clave = `${fechaInicio}_${fechaFin}`;
  try {
    const datos = await consultar(fechaInicio, fechaFin);
    await cache.guardar(clave, datos);
    return datos;
  } catch {
    // Sin red la pantalla abre con lo ultimo guardado, no con un error; sin
    // cache, el arreglo vacio se lee como "hoy no tienes rutas".
    return cache.leer(clave);
  }
}

export function obtenerAsignaciones(
  fechaInicio: string,
  fechaFin: string,
  incluirCanceladas = false,
): Promise<AsignacionDetallada[]> {
  return resolverAsignaciones(
    fechaInicio,
    fechaFin,
    (desde, hasta) => consultarSupabase(desde, hasta, incluirCanceladas),
    cacheSqlite,
  );
}
