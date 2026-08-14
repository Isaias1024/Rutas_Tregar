import { z } from 'zod';

// Esquemas de entrada de los catalogos (§5: "todo esquema de entrada vive en
// packages/shared/src"). El mismo esquema valida en el formulario del
// cliente y en la server action.

export const idSchema = z.uuid();

export const clienteCrearSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
});
export const clienteEditarSchema = clienteCrearSchema.extend({
  id: idSchema,
  activo: z.boolean(),
});

export const ESTADOS_CAMION = ['disponible', 'asignado', 'mantenimiento'] as const;

export const camionCrearSchema = z.object({
  codigo: z.string().trim().min(1, 'El codigo es obligatorio'),
  tipo: z.string().trim().min(1, 'El tipo es obligatorio'),
  placas: z.string().trim().min(1, 'Las placas son obligatorias'),
  // Sin coerce ni default: el formulario ya manda un `number` real
  // (`valueAsNumber` en el input) y ya trae `0`/`'disponible'` como valor
  // inicial. Mantener el tipo de entrada identico al de salida es lo que
  // evita el choque de tipos entre zodResolver y react-hook-form.
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
// `camionId` vive aqui y NO en el planeador: el camion es del chofer, y este
// formulario es el unico lugar donde se elige cual le toca. `null` es un
// estado legitimo (un chofer recien dado de alta todavia no tiene camion),
// pero un chofer sin camion no se puede asignar a una ruta — eso lo valida
// `asignarNucleo`, no este esquema.
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

export type ClienteCrear = z.infer<typeof clienteCrearSchema>;
export type ClienteEditar = z.infer<typeof clienteEditarSchema>;
export type CamionCrear = z.infer<typeof camionCrearSchema>;
export type CamionEditar = z.infer<typeof camionEditarSchema>;
export type ChoferCrear = z.infer<typeof choferCrearSchema>;
export type ChoferEditar = z.infer<typeof choferEditarSchema>;
