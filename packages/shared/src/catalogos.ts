import { z } from 'zod';

// El mismo esquema valida en el formulario del cliente y en la server action.

export const idSchema = z.uuid();

export const clienteCrearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
});
export const clienteEditarSchema = clienteCrearSchema.extend({
  id: idSchema,
  activo: z.boolean(),
});

export const ESTADOS_CAMION = ['disponible', 'asignado', 'mantenimiento'] as const;

/** El catalogo cerrado de tipos de camion de la flota. Nada de texto libre. */
export const TIPOS_CAMION = ['Van', 'Urvan', 'Autobus'] as const;

export const camionCrearSchema = z.object({
  codigo: z.string().trim().min(1, 'El codigo es obligatorio'),
  tipo: z.enum(TIPOS_CAMION, { message: 'Elige un tipo de camion' }),
  placas: z.string().trim().min(1, 'Las placas son obligatorias'),
  // Sin coerce ni default: el formulario ya manda un `number` real y su valor
  // inicial. Igualar entrada y salida evita el choque zodResolver/react-hook-form.
  km: z.number().int().min(0),
  estado: z.enum(ESTADOS_CAMION),
});
export const camionEditarSchema = camionCrearSchema.extend({
  id: idSchema,
});

export const choferCrearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  correo: z.union([z.email('Correo invalido'), z.literal('')]).optional(),
  telefono: z.string().trim().optional(),
});
// `camionId` vive aqui y NO en el planeador: el camion es del chofer y este es el
// unico lugar donde se elige. `null` es legitimo; asignarlo ya lo valida el nucleo.
export const choferEditarSchema = z.object({
  id: idSchema,
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  correo: z.union([z.email('Correo invalido'), z.literal('')]).optional(),
  telefono: z.string().trim().optional(),
  activo: z.boolean(),
  camionId: z
    .union([idSchema, z.literal('')])
    .nullable()
    .optional(),
});

// Sin contrasena ni credencial: el panel entra por Google. Que el correo sea del
// dominio permitido lo valida el servidor, porque aqui no se leen variables.
export const supervisorCrearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  correo: z.email('Correo invalido'),
});

export type ClienteCrear = z.infer<typeof clienteCrearSchema>;
export type ClienteEditar = z.infer<typeof clienteEditarSchema>;
export type CamionCrear = z.infer<typeof camionCrearSchema>;
export type CamionEditar = z.infer<typeof camionEditarSchema>;
export type ChoferCrear = z.infer<typeof choferCrearSchema>;
export type ChoferEditar = z.infer<typeof choferEditarSchema>;
export type SupervisorCrear = z.infer<typeof supervisorCrearSchema>;
