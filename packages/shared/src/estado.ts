import { TZDate } from '@date-fns/tz';
import { differenceInMinutes } from 'date-fns';
import type { TipoEvento } from './flujo.ts';
import type { EstadoSemaforo } from './tokens.ts';

// La derivacion del semaforo (paso 12). El estado NUNCA se guarda en
// ninguna columna: siempre se calcula a partir de los eventos.

const ZONA_OPERATIVA = 'America/Mexico_City';

/** ±10 min alrededor de la hora esperada sigue siendo "a tiempo". */
export const TOLERANCIA_A_TIEMPO_MIN = 10;
/** Mas de 15 min antes de la hora esperada es "adelantado". */
export const UMBRAL_ADELANTADO_MIN = 15;
/** Mas de 5 min de diferencia entre ocurrio_en y recibido_en es sospechoso. */
export const UMBRAL_SOSPECHOSO_MIN = 5;
/** El evento "llego en linea" si se recibio hace menos de 60 min. */
export const VENTANA_EN_VIVO_MIN = 60;

export interface EventoParaEstado {
  tipo: TipoEvento;
  ocurrioEn: string;
  recibidoEn: string;
}

export interface ResultadoEstado {
  estado: EstadoSemaforo;
  sospechoso: boolean;
}

/** Minutos entre `instanteIso` y `horaEsperada` (HH:mm[:ss]), mismo dia de `instanteIso`. */
function offsetEnMinutos(instanteIso: string, horaEsperada: string): number {
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
 * Sospechoso cuando el reloj del dispositivo y el del servidor discrepan
 * mas alla del umbral, PERO solo si el evento "llego en linea" — se evalua
 * cerca de cuando se recibio, no una relectura de historial viejo (`ahora`
 * es lo que distingue una cosa de la otra).
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
  const inicioRuta = eventos.find((evento) => evento.tipo === 'inicio_ruta');

  if (inicioRuta) {
    return {
      estado: estadoPorPuntualidad(offsetEnMinutos(inicioRuta.ocurrioEn, horaEsperada)),
      sospechoso: esSospechoso(inicioRuta, ahora),
    };
  }

  if (eventos.length === 0) {
    return { estado: 'pendiente', sospechoso: false };
  }

  // Hay progreso (vio_ruta y/o listo_inicio) pero todavia no sale.
  return { estado: 'en_curso', sospechoso: false };
}
