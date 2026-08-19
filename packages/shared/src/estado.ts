import { TZDate } from '@date-fns/tz';
import { differenceInMinutes } from 'date-fns';
import type { TipoEvento } from './flujo.ts';
import type { EstadoSemaforo } from './tokens.ts';

// La derivacion del semaforo (paso 12). El estado NUNCA se guarda en
// ninguna columna: siempre se calcula a partir de los eventos.

export const ZONA_OPERATIVA = 'America/Mexico_City';

/**
 * El dia de operacion (`YYYY-MM-DD`) que corresponde a `ahora` en la zona
 * operativa — el mismo formato que la columna `asignacion.fecha`.
 *
 * Existe para poder preguntar "que rutas de hoy en adelante trae este chofer"
 * comparando texto contra `date`, sin convertir la columna. Se calcula por
 * zona IANA y nunca por offset fijo: a las 23:00 del 1 de enero en Monterrey
 * ya es dia 2 en UTC, y `new Date().toISOString().slice(0, 10)` devolveria el
 * dia equivocado justo en el turno de noche, que es cuando esto mas importa.
 */
export function fechaOperativa(ahora: Date): string {
  const local = new TZDate(ahora, ZONA_OPERATIVA);
  const mes = String(local.getMonth() + 1).padStart(2, '0');
  const dia = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${mes}-${dia}`;
}

/**
 * `true` si `fecha` (YYYY-MM-DD) ya paso segun el dia de operacion actual —
 * es decir, es estrictamente anterior a hoy en `America/Mexico_City`. Hoy
 * mismo NO cuenta como pasado: la planeacion sigue siendo editable durante
 * todo el dia de operacion.
 */
export function esFechaPasada(fecha: string, ahora: Date = new Date()): boolean {
  return fecha < fechaOperativa(ahora);
}

/**
 * La hora de un `<input type="datetime-local">` ('YYYY-MM-DDTHH:mm', sin
 * zona) interpretada en `America/Mexico_City` — el servidor decide la zona,
 * nunca el host que procesa la peticion. `null` si el texto no trae una
 * fecha completa. Unica fuente: la captura manual del supervisor (eventos e
 * incidentes) y su validacion comparten este parseo, no cada quien el suyo.
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
  // Terminal y primero que cualquier otra cosa: una ruta con incidente no
  // habla de puntualidad, y puede llevar `inicio_ruta` (el incidente ocurrio
  // a medio camino) o no llevarlo (ni siquiera pudo arrancar). En los dos
  // casos es "incidente", nunca "en curso" ni "a tiempo/tarde/adelantado".
  const conIncidente = eventos.some((evento) => evento.tipo === 'fin_ruta_incidente');
  if (conIncidente) {
    return { estado: 'incidente', sospechoso: false };
  }

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
