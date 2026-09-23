import { z } from 'zod';

// El usuario_id nunca viene en el cuerpo: lo fija el servidor desde la sesion,
// para que nadie registre un dispositivo ajeno.

export const dispositivoRegistrarSchema = z.object({
  expoPushToken: z.string().trim().min(1, 'Falta el token de Expo'),
  plataforma: z.enum(['ios', 'android']),
  appVersion: z.string().trim().min(1, 'Falta la version de la app'),
});
export type DispositivoRegistrar = z.infer<typeof dispositivoRegistrarSchema>;
