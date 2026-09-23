import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { ZONA_OPERATIVA } from './estado.ts';

/**
 * Formato de horario visible en toda la UI: 12 horas con AM/PM, nunca 24h. Estas
 * dos funciones son la unica fuente: nadie arma "HH:mm" a mano.
 */

/**
 * Una hora de reloj suelta (`HH:mm[:ss]`, como la columna `time` de Postgres) a
 * `h:mm a`. No hay zona que aplicar: no es un instante.
 */
export function horaEsperadaTexto(horaHHmm: string): string {
  const [horas, minutos] = horaHHmm.split(':').map(Number);
  const referencia = new Date(2000, 0, 1, horas ?? 0, minutos ?? 0);
  return format(referencia, 'h:mm a');
}

/** Un instante (`Date` o timestamp en ms) a `h:mm a`, en la zona operativa. */
export function horaInstanteTexto(instante: Date | number): string {
  const ms = typeof instante === 'number' ? instante : instante.getTime();
  return format(new TZDate(ms, ZONA_OPERATIVA), 'h:mm a');
}
