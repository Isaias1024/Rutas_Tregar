import { z } from 'zod';
import { idSchema } from './catalogos.ts';

// Esquemas de entrada de paradas y rutas (§5, paso 6). Mismo esquema en el
// formulario del cliente y en la server action.

export const paradaCrearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  direccion: z.string().trim().min(1, 'La direccion es obligatoria'),
  lat: z.number().min(-90, 'Latitud invalida').max(90, 'Latitud invalida'),
  lng: z.number().min(-180, 'Longitud invalida').max(180, 'Longitud invalida'),
});
export type ParadaCrear = z.infer<typeof paradaCrearSchema>;

export const paradaEditarSchema = paradaCrearSchema.extend({ id: idSchema });
export type ParadaEditar = z.infer<typeof paradaEditarSchema>;

export const TURNOS = ['manana', 'tarde', 'noche'] as const;

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora invalida (HH:MM)');

const horarioBase = z.object({
  turno: z.enum(TURNOS),
  horaInicioEsperada: horaSchema,
  horaFinEsperada: horaSchema,
  personasEsperadas: z.number().int().positive('Las personas esperadas deben ser mayores a cero'),
});

// Comparacion por texto: ambas horas llegan en el mismo formato `HH:MM`
// zero-padded, asi que el orden lexicografico coincide con el cronologico.
function horaFinPosterior(h: { horaInicioEsperada: string; horaFinEsperada: string }): boolean {
  return h.horaFinEsperada > h.horaInicioEsperada;
}

const MENSAJE_HORAS_INVERTIDAS = 'La hora de fin debe ser posterior a la hora de inicio';

export const horarioSchema = horarioBase.refine(horaFinPosterior, {
  message: MENSAJE_HORAS_INVERTIDAS,
  path: ['horaFinEsperada'],
});
export type Horario = z.infer<typeof horarioSchema>;

export const agregarHorarioSchema = horarioBase
  .extend({ rutaId: idSchema })
  .refine(horaFinPosterior, {
    message: MENSAJE_HORAS_INVERTIDAS,
    path: ['horaFinEsperada'],
  });
export type AgregarHorario = z.infer<typeof agregarHorarioSchema>;

export const editarHorarioSchema = horarioBase.extend({ id: idSchema }).refine(horaFinPosterior, {
  message: MENSAJE_HORAS_INVERTIDAS,
  path: ['horaFinEsperada'],
});
export type EditarHorario = z.infer<typeof editarHorarioSchema>;

function paradasDistintas(r: { paradaInicioId: string; paradaFinId: string }): boolean {
  return r.paradaInicioId !== r.paradaFinId;
}

const MENSAJE_PARADAS_IGUALES = 'La parada de inicio y la de fin deben ser distintas';

const rutaBase = z.object({
  clienteId: idSchema,
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  paradaInicioId: idSchema,
  paradaFinId: idSchema,
});

export const rutaCrearSchema = rutaBase
  .extend({ horarios: z.array(horarioSchema).min(1, 'Agrega al menos un horario') })
  .refine(paradasDistintas, { message: MENSAJE_PARADAS_IGUALES, path: ['paradaFinId'] });
export type RutaCrear = z.infer<typeof rutaCrearSchema>;

export const rutaEditarSchema = rutaBase
  .extend({ id: idSchema })
  .refine(paradasDistintas, { message: MENSAJE_PARADAS_IGUALES, path: ['paradaFinId'] });
export type RutaEditar = z.infer<typeof rutaEditarSchema>;
