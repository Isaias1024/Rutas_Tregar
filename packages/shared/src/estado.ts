import { TZDate } from '@date-fns/tz';
import { differenceInMinutes } from 'date-fns';
import type { TipoEvento } from './flujo.ts';
import type { EstadoSemaforo } from './tokens.ts';

// El estado nunca se persiste: siempre se deriva de los eventos.

export const ZONA_OPERATIVA = 'America/Mexico_City';

/**
 * El dia de operacion (`YYYY-MM-DD`) de `ahora`, comparable como texto contra
 * `asignacion.fecha`. Por zona IANA: en turno de noche el dia UTC ya es otro.
 */
export function fechaOperativa(ahora: Date): string {
  const local = new TZDate(ahora, ZONA_OPERATIVA);
  const mes = String(local.getMonth() + 1).padStart(2, '0');
  const dia = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${mes}-${dia}`;
}

/**
 * Hoy NO cuenta como pasado: la planeacion sigue siendo editable durante todo
 * el dia de operacion.
 */
export function esFechaPasada(fecha: string, ahora: Date = new Date()): boolean {
  return fecha < fechaOperativa(ahora);
}

/**
 * Interpreta un `datetime-local` (sin zona) en la zona operativa: la zona la
 * decide el servidor, no el host que atiende la peticion. `null` si falta fecha.
 */
export function interpretarHoraLocal(ocurrioEnLocal: string): TZDate | null {
  const [fechaTexto, horaTexto] = ocurrioEnLocal.split('T');
  const [anio, mes, dia] = (fechaTexto ?? '').split('-').map(Number);
  const [horas, minutos] = (horaTexto ?? '').split(':').map(Number);
  if (
    anio === undefined ||
    mes === undefined ||
    dia === undefined ||
    horas === undefined ||
    minutos === undefined
  ) {
    return null;
  }
  return new TZDate(anio, mes - 1, dia, horas, minutos, 0, ZONA_OPERATIVA);
}

/** ±10 min alrededor de la hora esperada sigue siendo "a tiempo". */
export const TOLERANCIA_A_TIEMPO_MIN = 10;
/** Mas de 15 min antes de la hora esperada es "adelantado". */
export const UMBRAL_ADELANTADO_MIN = 15;
/** Mas de 5 min de diferencia entre ocurrio_en y recibido_en es sospechoso. */
export const UMBRAL_SOSPECHOSO_MIN = 5;
/** El evento "llego en linea" si se recibio hace menos de 60 min. */
export const VENTANA_EN_VIVO_MIN = 60;
/** A mas de 100m de la parada esperada, la ubicacion del evento no cuadra. */
export const UMBRAL_UBICACION_CORRECTA_M = 100;

export type Puntualidad = 'a_tiempo' | 'tarde' | 'adelantado';

export interface EventoParaEstado {
  tipo: TipoEvento;
  ocurrioEn: string;
  recibidoEn: string;
}

export interface ResultadoEstado {
  estado: EstadoSemaforo;
  sospechoso: boolean;
  /**
   * Puntualidad de la salida, ya disponible con la ruta en curso; al cerrar,
   * `estado` toma este mismo valor.
   */
  puntualidadInicio: Puntualidad | null;
}

/** Distancia entre dos coordenadas en metros (haversine); la comparten panel y app. */
export function distanciaEnMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radioTierraM = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return radioTierraM * c;
}

/** `undefined` cuando falta alguna coordenada: sin GPS o parada sin ubicacion. */
export function ubicacionEsCorrecta(
  eventoLat: number | null | undefined,
  eventoLng: number | null | undefined,
  paradaLat: number | null | undefined,
  paradaLng: number | null | undefined,
): boolean | undefined {
  if (
    eventoLat === null ||
    eventoLat === undefined ||
    eventoLng === null ||
    eventoLng === undefined ||
    paradaLat === null ||
    paradaLat === undefined ||
    paradaLng === null ||
    paradaLng === undefined
  ) {
    return undefined;
  }
  return (
    distanciaEnMetros(eventoLat, eventoLng, paradaLat, paradaLng) <= UMBRAL_UBICACION_CORRECTA_M
  );
}

/** Minutos entre `instanteIso` y `horaEsperada` (HH:mm[:ss]), mismo dia de `instanteIso`. */
export function offsetEnMinutos(instanteIso: string, horaEsperada: string): number {
  const instante = new TZDate(instanteIso, ZONA_OPERATIVA);
  const [horas, minutos] = horaEsperada.split(':').map(Number);
  const esperado = new TZDate(
    instante.getFullYear(),
    instante.getMonth(),
    instante.getDate(),
    horas ?? 0,
    minutos ?? 0,
    0,
    ZONA_OPERATIVA,
  );
  return differenceInMinutes(instante, esperado);
}

function estadoPorPuntualidad(offsetMin: number): 'a_tiempo' | 'tarde' | 'adelantado' {
  if (offsetMin > TOLERANCIA_A_TIEMPO_MIN) {
    return 'tarde';
  }
  if (offsetMin < -UMBRAL_ADELANTADO_MIN) {
    return 'adelantado';
  }
  return 'a_tiempo';
}

/**
 * Solo aplica a eventos recien recibidos: una relectura de historial viejo
 * siempre discrepa y no es sospechosa.
 */
function esSospechoso(evento: EventoParaEstado, ahora: Date): boolean {
  const llegoEnVivo =
    Math.abs(differenceInMinutes(ahora, new Date(evento.recibidoEn))) <= VENTANA_EN_VIVO_MIN;
  if (!llegoEnVivo) {
    return false;
  }
  const desfaseMin = Math.abs(
    differenceInMinutes(new Date(evento.ocurrioEn), new Date(evento.recibidoEn)),
  );
  return desfaseMin > UMBRAL_SOSPECHOSO_MIN;
}

export function derivarEstado({
  eventos,
  horaEsperada,
  ahora,
}: {
  eventos: EventoParaEstado[];
  horaEsperada: string;
  ahora: Date;
}): ResultadoEstado {
  // Terminal y con prioridad sobre todo lo demas: con o sin `inicio_ruta`, una
  // ruta con incidente no habla de puntualidad.
  const conIncidente = eventos.some((evento) => evento.tipo === 'fin_ruta_incidente');
  if (conIncidente) {
    return { estado: 'incidente', sospechoso: false, puntualidadInicio: null };
  }

  const inicioRuta = eventos.find((evento) => evento.tipo === 'inicio_ruta');

  if (inicioRuta) {
    const puntualidadInicio = estadoPorPuntualidad(
      offsetEnMinutos(inicioRuta.ocurrioEn, horaEsperada),
    );
    // `retorno` es lo unico que cierra la ruta; antes de eso el estado es
    // `en_curso` por tarde que haya salido.
    const terminada = eventos.some((evento) => evento.tipo === 'retorno');
    return {
      estado: terminada ? puntualidadInicio : 'en_curso',
      sospechoso: esSospechoso(inicioRuta, ahora),
      puntualidadInicio,
    };
  }

  if (eventos.length === 0) {
    return { estado: 'pendiente', sospechoso: false, puntualidadInicio: null };
  }

  // Hay progreso (vio_ruta y/o listo_inicio) pero todavia no sale.
  return { estado: 'en_curso', sospechoso: false, puntualidadInicio: null };
}
