import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { supabase } from '@/lib/supabase';

// La zona operativa completa vive aqui, no en una variable de entorno: el
// proyecto solo opera en Mexico y `packages/shared` ya trata `America/Mexico_City`
// como fija (§ datos-y-rls.md). `EXPO_PUBLIC_*` es lo unico que Expo inlina
// del entorno, y una zona horaria no necesita variar por ambiente.
const ZONA_OPERATIVA = 'America/Mexico_City';

export type Turno = 'manana' | 'tarde' | 'noche';

export interface AsignacionDetallada {
  id: string;
  fecha: string;
  secuencia: number;
  camionCodigo: string;
  horario: {
    id: string;
    turno: Turno;
    horaInicioEsperada: string;
    horaFinEsperada: string;
    ruta: {
      id: string;
      nombre: string;
      paradaInicioNombre: string;
      paradaFinNombre: string;
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

export interface CacheAsignaciones {
  leer: (clave: string) => Promise<AsignacionDetallada[]>;
  guardar: (clave: string, datos: AsignacionDetallada[]) => Promise<void>;
}

/** Hoy, segun el calendario de America/Mexico_City — nunca el del dispositivo ni UTC. */
export function fechaOperativaHoy(): string {
  return format(TZDate.tz(ZONA_OPERATIVA), 'yyyy-MM-dd');
}

/**
 * Aritmetica de calendario pura (Y-M-D + N dias). Ancla en UTC a proposito:
 * no representa un instante real, solo suma digitos de fecha, asi que no hay
 * DST ni zona horaria de por medio que pueda correr el resultado.
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
 * Agrupa por `fecha` tal cual llega de la base — nunca reconstruida a partir
 * de un `Date` combinando fecha y hora. Es lo que garantiza que un horario a
 * las 23:30 se quede en su dia operativo y no brinque al siguiente por una
 * conversion UTC (Done-when del paso 9).
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

// Forma cruda que devuelve PostgREST para el select anidado (verificado
// contra el Supabase local: los `to-one` embebidos llegan como objeto, no
// como arreglo de un elemento).
interface FilaCruda {
  id: string;
  fecha: string;
  secuencia: number;
  camion_codigo: string;
  horario: {
    id: string;
    turno: Turno;
    hora_inicio_esperada: string;
    hora_fin_esperada: string;
    ruta: {
      id: string;
      nombre: string;
      parada_inicio: { nombre: string } | null;
      parada_fin: { nombre: string } | null;
    } | null;
  } | null;
}

function normalizar(filas: FilaCruda[]): AsignacionDetallada[] {
  const conRuta = filas.filter(
    (fila): fila is FilaCruda & { horario: NonNullable<FilaCruda['horario']> } =>
      fila.horario !== null && fila.horario.ruta !== null,
  );
  return conRuta.map((fila) => {
    const ruta = fila.horario.ruta as NonNullable<FilaCruda['horario']>['ruta'];
    return {
      id: fila.id,
      fecha: fila.fecha,
      secuencia: fila.secuencia,
      camionCodigo: fila.camion_codigo,
      horario: {
        id: fila.horario.id,
        turno: fila.horario.turno,
        horaInicioEsperada: fila.horario.hora_inicio_esperada,
        horaFinEsperada: fila.horario.hora_fin_esperada,
        ruta: {
          id: ruta?.id ?? '',
          nombre: ruta?.nombre ?? '',
          paradaInicioNombre: ruta?.parada_inicio?.nombre ?? '',
          paradaFinNombre: ruta?.parada_fin?.nombre ?? '',
        },
      },
    };
  });
}

async function consultarSupabase(
  fechaInicio: string,
  fechaFin: string,
): Promise<AsignacionDetallada[]> {
  // RLS (`asignacion_select_chofer`, paso 2) ya restringe esto a las propias
  // filas del chofer autenticado: no hace falta filtrar por chofer_id aqui,
  // y no habria como burlarlo aunque se intentara.
  const { data, error } = await supabase
    .from('asignacion')
    .select(
      'id, fecha, secuencia, camion_codigo, horario:horario_id(id, turno, hora_inicio_esperada, hora_fin_esperada, ruta:ruta_id(id, nombre, parada_inicio:parada_inicio_id(nombre), parada_fin:parada_fin_id(nombre)))',
    )
    .is('cancelada_en', null)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  if (error) {
    throw error;
  }
  return normalizar((data ?? []) as unknown as FilaCruda[]);
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function abrirDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('rutas-cache.db').then(async (db) => {
      await db.execAsync(
        'create table if not exists cache_asignaciones (clave text primary key, datos text not null, actualizado_en text not null);',
      );
      return db;
    });
  }
  return dbPromise;
}

const cacheSqlite: CacheAsignaciones = {
  async leer(clave) {
    const db = await abrirDb();
    const fila = await db.getFirstAsync<{ datos: string }>(
      'select datos from cache_asignaciones where clave = ?;',
      [clave],
    );
    return fila ? (JSON.parse(fila.datos) as AsignacionDetallada[]) : [];
  },
  async guardar(clave, datos) {
    const db = await abrirDb();
    await db.runAsync(
      'insert into cache_asignaciones (clave, datos, actualizado_en) values (?, ?, ?) on conflict(clave) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;',
      [clave, JSON.stringify(datos), new Date().toISOString()],
    );
  },
};

/**
 * Nucleo testable: recibe la consulta y el cache inyectados, sin tocar
 * Supabase ni SQLite directamente. `obtenerAsignaciones` (abajo) es el unico
 * que los conecta de verdad; las pruebas usan dobles en memoria.
 */
export async function resolverAsignaciones(
  fechaInicio: string,
  fechaFin: string,
  consultar: ConsultaAsignaciones,
  cache: CacheAsignaciones,
): Promise<AsignacionDetallada[]> {
  const clave = `${fechaInicio}_${fechaFin}`;
  try {
    const datos = await consultar(fechaInicio, fechaFin);
    await cache.guardar(clave, datos);
    return datos;
  } catch {
    // Sin red: la pantalla abre con lo ultimo que se guardo, no con un
    // error (Done-when del paso 9). Si tampoco hay cache, un arreglo vacio
    // se ve igual que "hoy no tienes rutas", que es un estado ya cubierto.
    return cache.leer(clave);
  }
}

export function obtenerAsignaciones(
  fechaInicio: string,
  fechaFin: string,
): Promise<AsignacionDetallada[]> {
  return resolverAsignaciones(fechaInicio, fechaFin, consultarSupabase, cacheSqlite);
}
