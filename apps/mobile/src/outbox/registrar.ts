import type { TipoEvento, TipoIncidente } from '@rutas/shared';
import * as Crypto from 'expo-crypto';
import { capturarUbicacion, type CoordenadasCapturadas } from '@/ubicacion';
import { almacenSqlite, type AlmacenPendientes, type PayloadEvento } from './db';

// Solo estos dos pasos capturan GPS.
const REQUIERE_GPS: ReadonlySet<TipoEvento> = new Set(['listo_inicio', 'fin_ruta']);

export interface DatosRegistro {
  asignacionId: string;
  tipo: TipoEvento;
  capturadoPor: string;
  contador?: { campo: 'cnt_abordaron' | 'cnt_retornaron'; valor: number };
  razonIncidente?: TipoIncidente;
}

/** Puro: separado de registrarEvento para poder probarse sin GPS, SQLite ni expo-crypto. */
export function construirPayload(
  datos: DatosRegistro,
  ubicacion: CoordenadasCapturadas | null,
  clientEventId: string,
): PayloadEvento {
  return {
    client_event_id: clientEventId,
    asignacion_id: datos.asignacionId,
    tipo: datos.tipo,
    ocurrio_en: new Date().toISOString(),
    monotonic_ms: Math.round(globalThis.performance.now()),
    lat: ubicacion?.lat ?? null,
    lng: ubicacion?.lng ?? null,
    gps_precision_m: ubicacion?.gpsPrecisionM ?? null,
    sin_gps: ubicacion ? ubicacion.sinGps : true,
    origen: 'app',
    capturado_por: datos.capturadoPor,
    contador: datos.contador,
    razon_incidente: datos.razonIncidente ?? null,
  };
}

/**
 * Cada toque escribe primero aqui y regresa de inmediato: la UI avanza sin red.
 * `almacen` y `generarId` son inyectables porque expo-crypto no corre en pruebas.
 */
export async function registrarEvento(
  datos: DatosRegistro,
  almacen: AlmacenPendientes = almacenSqlite,
  generarId: () => string = () => Crypto.randomUUID(),
): Promise<PayloadEvento> {
  const ubicacion = REQUIERE_GPS.has(datos.tipo) ? await capturarUbicacion() : null;
  const payload = construirPayload(datos, ubicacion, generarId());
  await almacen.agregar({
    clientEventId: payload.client_event_id,
    payload,
    intentos: 0,
    proximoIntentoEn: null,
  });
  return payload;
}
