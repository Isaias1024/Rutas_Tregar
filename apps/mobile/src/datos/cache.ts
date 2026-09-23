import * as SQLite from 'expo-sqlite';

/**
 * Cache de solo lectura, aparte del outbox: esto es una copia descartable de lo
 * que el servidor ya sabe, y perderlo no pierde nada; perder el outbox si.
 */
export interface CacheAsignaciones<T> {
  leer: (clave: string) => Promise<T[]>;
  guardar: (clave: string, datos: T[]) => Promise<void>;
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

// Los metodos son genericos (no la constante) para que un mismo cache sirva a
// cualquier tipo de fila sin casarse con uno que vive en un modulo que importa este.
export const cacheSqlite = {
  async leer<T>(clave: string): Promise<T[]> {
    const db = await abrirDb();
    const fila = await db.getFirstAsync<{ datos: string }>(
      'select datos from cache_asignaciones where clave = ?;',
      [clave],
    );
    return fila ? (JSON.parse(fila.datos) as T[]) : [];
  },
  async guardar<T>(clave: string, datos: T[]): Promise<void> {
    const db = await abrirDb();
    await db.runAsync(
      'insert into cache_asignaciones (clave, datos, actualizado_en) values (?, ?, ?) on conflict(clave) do update set datos = excluded.datos, actualizado_en = excluded.actualizado_en;',
      [clave, JSON.stringify(datos), new Date().toISOString()],
    );
  },
};
