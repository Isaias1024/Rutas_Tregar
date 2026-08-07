import type { TipoEvento } from '@rutas/shared';
import * as SQLite from 'expo-sqlite';

// Esquema local del outbox (paso 11). "Offline es requisito, no mejora":
// cada toque escribe primero aqui, nunca directo a Supabase.

export interface PayloadEvento {
  client_event_id: string;
  asignacion_id: string;
  tipo: TipoEvento;
  ocurrio_en: string;
  monotonic_ms: number;
  lat: number | null;
  lng: number | null;
  gps_precision_m: number | null;
  sin_gps: boolean;
  origen: 'app';
  capturado_por: string;
  /** Se aplica en `asignacion` al subir, no en `evento`. */
  contador?: { campo: 'cnt_abordaron' | 'cnt_retornaron'; valor: number };
}

export interface FilaPendiente {
  clientEventId: string;
  payload: PayloadEvento;
  intentos: number;
  /** ISO. `null` significa "elegible ahora mismo" (nunca fallo). */
  proximoIntentoEn: string | null;
}

/**
 * El almacen es una interfaz inyectable a proposito: `registrar.ts` y
 * `flusher.ts` reciben uno en vez de importar `expo-sqlite` directo, para
 * poder probarse con un almacen en memoria sin el modulo nativo (que no
 * existe fuera de un dispositivo o emulador real).
 */
export interface AlmacenPendientes {
  agregar: (fila: FilaPendiente) => Promise<void>;
  listar: () => Promise<FilaPendiente[]>;
  quitar: (clientEventId: string) => Promise<void>;
  marcarReintento: (
    clientEventId: string,
    error: string,
    proximoIntentoEn: string,
  ) => Promise<void>;
  contar: () => Promise<number>;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function abrirDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('rutas-outbox.db').then(async (db) => {
      await db.execAsync(
        'create table if not exists pendiente (client_event_id text primary key, payload text not null, intentos integer not null default 0, ultimo_error text, proximo_intento_en text);',
      );
      return db;
    });
  }
  return dbPromise;
}

export const almacenSqlite: AlmacenPendientes = {
  async agregar(fila) {
    const db = await abrirDb();
    await db.runAsync(
      'insert into pendiente (client_event_id, payload, intentos, proximo_intento_en) values (?, ?, ?, ?);',
      [fila.clientEventId, JSON.stringify(fila.payload), fila.intentos, fila.proximoIntentoEn],
    );
  },
  async listar() {
    const db = await abrirDb();
    const filas = await db.getAllAsync<{
      client_event_id: string;
      payload: string;
      intentos: number;
      proximo_intento_en: string | null;
    }>(
      'select client_event_id, payload, intentos, proximo_intento_en from pendiente order by rowid asc;',
    );
    return filas.map((fila) => ({
      clientEventId: fila.client_event_id,
      payload: JSON.parse(fila.payload) as PayloadEvento,
      intentos: fila.intentos,
      proximoIntentoEn: fila.proximo_intento_en,
    }));
  },
  async quitar(clientEventId) {
    const db = await abrirDb();
    await db.runAsync('delete from pendiente where client_event_id = ?;', [clientEventId]);
  },
  async marcarReintento(clientEventId, error, proximoIntentoEn) {
    const db = await abrirDb();
    await db.runAsync(
      'update pendiente set intentos = intentos + 1, ultimo_error = ?, proximo_intento_en = ? where client_event_id = ?;',
      [error, proximoIntentoEn, clientEventId],
    );
  },
  async contar() {
    const db = await abrirDb();
    const fila = await db.getFirstAsync<{ total: number }>(
      'select count(*) as total from pendiente;',
    );
    return fila?.total ?? 0;
  },
};
