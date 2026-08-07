import { z } from 'zod';

// El unico esquema de entrada de POST /api/dispositivos (paso 14). El
// usuario_id nunca viene en el cuerpo: lo fija el servidor a partir de la
// sesion, para que un usuario solo pueda registrar su propio dispositivo.

export const dispositivoRegistrarSchema = z.object({
  expoPushToken: z.string().trim().min(1, 'Falta el token de Expo'),
  plataforma: z.enum(['ios', 'android']),
  appVersion: z.string().trim().min(1, 'Falta la version de la app'),
});
export type DispositivoRegistrar = z.infer<typeof dispositivoRegistrarSchema>;
