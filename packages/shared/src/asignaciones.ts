import { z } from 'zod';
import { idSchema } from './catalogos.ts';

// Logica pura de asignacion (§paso 7) + los esquemas de entrada de
// asignar/reasignar/cancelar. Sin acceso a base ni a sesion: reciben datos
// ya consultados y devuelven una decision, para poder probarse sin Postgres.

export type Turno = 'manana' | 'tarde' | 'noche';

export interface AsignacionDelDiaParaChofer {
  horarioId: string;
  turno: Turno;
}

/**
 * El traslape se evalua por turno, no por ruta ni por horario: si el chofer
 * ya tiene, ese mismo dia, otra asignacion activa en el mismo turno pero de
 * un horario distinto, es un conflicto — sin importar si esa otra asignacion
 * es de la misma ruta o de una distinta. Dos horarios DISTINTOS del mismo
 * turno con choferes DISTINTOS no chocan entre si porque cada uno se evalua
 * contra el calendario de su propio chofer.
 */
export function hayTraslape(
  asignacionesDelDia: AsignacionDelDiaParaChofer[],
  horarioNuevo: { id: string; turno: Turno },
): boolean {
  return asignacionesDelDia.some(
    (a) => a.turno === horarioNuevo.turno && a.horarioId !== horarioNuevo.id,
  );
}

/** Un camion en mantenimiento no se puede asignar. */
export function camionDisponible(estado: string): boolean {
  return estado !== 'mantenimiento';
}

/**
 * La siguiente `secuencia` para un horario ya asignado ese dia: 1 si nadie lo
 * ha tomado, o la mas alta existente + 1. Es lo que permite una segunda
 * vuelta del mismo horario el mismo dia sin violar el unico
 * `(horario_id, fecha, secuencia)`.
 */
export function siguienteSecuencia(secuenciasExistentes: number[]): number {
  return secuenciasExistentes.length === 0 ? 1 : Math.max(...secuenciasExistentes) + 1;
}

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');

export const asignarSchema = z.object({
  horarioId: idSchema,
  fecha: fechaSchema,
  choferId: idSchema,
  camionId: idSchema,
});
export type Asignar = z.infer<typeof asignarSchema>;

export const reasignarSchema = z.object({
  asignacionId: idSchema,
  choferId: idSchema,
  camionId: idSchema,
});
export type Reasignar = z.infer<typeof reasignarSchema>;

export const cancelarSchema = z.object({
  asignacionId: idSchema,
});
export type Cancelar = z.infer<typeof cancelarSchema>;
