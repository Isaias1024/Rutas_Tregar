import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseReal } from '@/lib/supabase';
import { almacenSqlite, type AlmacenPendientes, type PayloadEvento } from './db';

export type ResultadoSubida = 'exito' | 'conflicto' | 'error';

/**
 * `23505` es `unique_violation` en Postgres: lo produce tanto el unique de
 * `client_event_id` como el de `(asignacion_id, tipo)`. Un conflicto por
 * cualquiera de los dos es exactamente lo que deja un reintento correcto —
 * el evento ya quedo insertado la vez anterior — asi que se trata como
 * exito, nunca como motivo para reintentar de nuevo.
 */
const CODIGO_CONFLICTO_POSTGRES = '23505';

const BASE_ESPERA_MS = 1000;
const TOPE_ESPERA_MS = 30_000;

/** Espera exponencial simple: 1s, 2s, 4s, ... hasta el tope. */
export function esperaExponencial(intentos: number): number {
  return Math.min(BASE_ESPERA_MS * 2 ** intentos, TOPE_ESPERA_MS);
}

/**
 * Sube una sola fila. `cliente` es inyectable para las pruebas — la app real
 * siempre usa el cliente autenticado del chofer (`@/lib/supabase`).
 */
export async function subirPendiente(
  payload: PayloadEvento,
  cliente: SupabaseClient = supabaseReal,
): Promise<ResultadoSubida> {
  const { contador, ...evento } = payload;
  const { error } = await cliente.from('evento').insert(evento);

  if (error && error.code !== CODIGO_CONFLICTO_POSTGRES) {
    return 'error';
  }

  if (contador) {
    // El contador solo importa si el evento en si se aplico (exito o ya
    // aplicado antes via conflicto): en ambos casos vale la pena intentar
    // dejarlo escrito.
    await cliente
      .from('asignacion')
      .update({ [contador.campo]: contador.valor })
      .eq('id', evento.asignacion_id);
  }

  return error ? 'conflicto' : 'exito';
}

/**
 * Sube toda la cola. Cada fila que tuvo un intento reciente respeta su
 * propia espera exponencial antes de reintentar (`proximoIntentoEn`);
 * `exito` y `conflicto` borran la fila, `error` la deja para la proxima
 * pasada con un nuevo `proximoIntentoEn`. `almacen` y `cliente` son
 * inyectables — la app real usa `almacenSqlite` y el cliente de
 * `@/lib/supabase`.
 */
export async function vaciarCola(
  almacen: AlmacenPendientes = almacenSqlite,
  cliente: SupabaseClient = supabaseReal,
): Promise<void> {
  const ahora = Date.now();
  const pendientes = await almacen.listar();
  for (const fila of pendientes) {
    if (fila.proximoIntentoEn && new Date(fila.proximoIntentoEn).getTime() > ahora) {
      continue;
    }
    const resultado = await subirPendiente(fila.payload, cliente);
    if (resultado === 'exito' || resultado === 'conflicto') {
      await almacen.quitar(fila.clientEventId);
    } else {
      const proximoIntentoEn = new Date(ahora + esperaExponencial(fila.intentos + 1)).toISOString();
      await almacen.marcarReintento(
        fila.clientEventId,
        'fallo de red o servidor',
        proximoIntentoEn,
      );
    }
  }
}
