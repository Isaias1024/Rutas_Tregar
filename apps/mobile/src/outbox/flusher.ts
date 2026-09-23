import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as supabaseReal } from '@/lib/supabase';
import { almacenSqlite, type AlmacenPendientes, type PayloadEvento } from './db';

export type ResultadoSubida = 'exito' | 'conflicto' | 'error';

/**
 * `23505` lo produce tanto `client_event_id` como `(asignacion_id, tipo)`: el
 * evento ya quedo insertado en el intento anterior, asi que cuenta como exito.
 */
const CODIGO_CONFLICTO_POSTGRES = '23505';

const BASE_ESPERA_MS = 1000;
const TOPE_ESPERA_MS = 30_000;

/** Espera exponencial simple: 1s, 2s, 4s, ... hasta el tope. */
export function esperaExponencial(intentos: number): number {
  return Math.min(BASE_ESPERA_MS * 2 ** intentos, TOPE_ESPERA_MS);
}

/** Sube una sola fila. `cliente` es inyectable para las pruebas. */
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
    // El contador solo importa si el evento se aplico, sea ahora o en el intento
    // anterior que provoco el conflicto.
    await cliente
      .from('asignacion')
      .update({ [contador.campo]: contador.valor })
      .eq('id', evento.asignacion_id);
  }

  return error ? 'conflicto' : 'exito';
}

/**
 * Sube toda la cola respetando la espera exponencial de cada fila: `exito` y
 * `conflicto` la borran, `error` la deja para la proxima pasada.
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
