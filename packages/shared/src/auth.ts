import { z } from 'zod';

// Esquemas del login por correo+contrasena del panel (admin/supervisor) y del
// cambio de contrasena en /cuenta. El login por Google no pasa por aqui: no
// tiene entrada que validar mas alla del click.

export const loginPasswordSchema = z.object({
  correo: z.email('Correo invalido'),
  password: z.string().min(1, 'La contrasena es obligatoria'),
});

export const cambiarPasswordSchema = z
  .object({
    nueva: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres'),
    confirmacion: z.string(),
  })
  .refine((valores) => valores.nueva === valores.confirmacion, {
    message: 'Las dos contrasenas no coinciden',
    path: ['confirmacion'],
  });

export type LoginPassword = z.infer<typeof loginPasswordSchema>;
export type CambiarPassword = z.infer<typeof cambiarPasswordSchema>;
