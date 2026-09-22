import { z } from 'zod';
import { idSchema } from './catalogos.ts';

// Logica pura: sin acceso a base ni a sesion, recibe datos ya consultados para
// poder probarse sin Postgres.

/** Las horas llegan como `HH:MM` (zod) o `HH:MM:SS` (columna `time` de Postgres). */
export interface IntervaloHorario {
  horaInicioEsperada: string;
  horaFinEsperada: string;
}

export type AsignacionDelDiaParaChofer = IntervaloHorario;

const MINUTOS_DEL_DIA = 24 * 60;

function aMinutos(hora: string): number {
  const [horas, minutos] = hora.split(':');
  return Number(horas) * 60 + Number(minutos);
}

/**
 * El intervalo en minutos desde medianoche, medio abierto: por eso 08:00-10:00 y
 * 10:00-11:00 no chocan. Cruzar medianoche devuelve dos tramos, por prudencia.
 */
function tramosDelDia(horario: IntervaloHorario): Array<[number, number]> {
  const inicio = aMinutos(horario.horaInicioEsperada);
  const fin = aMinutos(horario.horaFinEsperada);
  if (fin > inicio) {
    return [[inicio, fin]];
  }
  return [
    [inicio, MINUTOS_DEL_DIA],
    [0, fin],
  ];
}

function tramosSeSuperponen(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Traslape real de horarios, no de turnos. Quien llama filtra por chofer y fecha
 * y excluye la propia fila al reasignar.
 */
export function hayTraslape(
  asignacionesDelDia: AsignacionDelDiaParaChofer[],
  horarioNuevo: IntervaloHorario,
): boolean {
  const tramosNuevos = tramosDelDia(horarioNuevo);
  return asignacionesDelDia.some((existente) =>
    tramosDelDia(existente).some((tramoExistente) =>
      tramosNuevos.some((tramoNuevo) => tramosSeSuperponen(tramoExistente, tramoNuevo)),
    ),
  );
}

/** Un camion en mantenimiento no se puede asignar. */
export function camionDisponible(estado: string): boolean {
  return estado !== 'mantenimiento';
}

/**
 * La siguiente `secuencia` del horario ese dia: permite una segunda vuelta sin
 * violar el unico `(horario_id, fecha, secuencia)`.
 */
export function siguienteSecuencia(secuenciasExistentes: number[]): number {
  return secuenciasExistentes.length === 0 ? 1 : Math.max(...secuenciasExistentes) + 1;
}

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');

// Sin `camionId` A PROPOSITO: el camion es propiedad del chofer
// (`usuario.camion_id`); aceptarlo del cliente permitiria "Juan + CAM-005".
export const asignarSchema = z.object({
  horarioId: idSchema,
  fecha: fechaSchema,
  choferId: idSchema,
});
export type Asignar = z.infer<typeof asignarSchema>;

export const reasignarSchema = z.object({
  asignacionId: idSchema,
  choferId: idSchema,
});
export type Reasignar = z.infer<typeof reasignarSchema>;

export const cancelarSchema = z.object({
  asignacionId: idSchema,
});
export type Cancelar = z.infer<typeof cancelarSchema>;
