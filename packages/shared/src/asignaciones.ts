import { z } from 'zod';
import { idSchema } from './catalogos.ts';

// Logica pura de asignacion (§paso 7) + los esquemas de entrada de
// asignar/reasignar/cancelar. Sin acceso a base ni a sesion: reciben datos
// ya consultados y devuelven una decision, para poder probarse sin Postgres.

export type Turno = 'manana' | 'tarde' | 'noche';

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
 * El intervalo del horario dentro del dia, en minutos desde medianoche y
 * medio abierto: `[inicio, fin)`. Medio abierto es justo lo que hace que
 * 08:00–10:00 y 10:00–11:00 NO cuenten como conflicto: la primera termina
 * exactamente donde arranca la segunda.
 *
 * `horarioSchema` ya exige `fin > inicio`, asi que el caso `fin <= inicio`
 * solo puede venir de una fila vieja que cruza medianoche. Ahi el horario
 * ocupa dos tramos del mismo dia — la cola despues del inicio y la cabeza
 * antes del fin — y se devuelven los dos: preferimos marcar un conflicto de
 * mas que dejar a un chofer doble-agendado de madrugada.
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
 * Traslape real de horarios, no de turnos: un chofer puede tener CUANTAS
 * rutas quepan en su dia mientras ninguna se encime con otra. La regla vieja
 * comparaba `turno`, lo que en la practica era "un chofer, una ruta por
 * turno" y bloqueaba el caso normal de 04:00–05:00 mas 08:00–09:00.
 *
 * Quien llama filtra por chofer y por fecha, y excluye la propia fila cuando
 * reasigna. Aqui solo se comparan intervalos: dos asignaciones del MISMO
 * horario (una segunda vuelta) tienen las mismas horas y por lo tanto si se
 * superponen — el mismo chofer no puede manejar las dos.
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
