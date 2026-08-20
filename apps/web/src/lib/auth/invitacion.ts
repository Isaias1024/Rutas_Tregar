// `@/lib/env` importa primero A PROPOSITO: su carga de `.env` (necesaria
// fuera del proceso principal de Next) tiene que correr antes de que
// `@rutas/shared/db` evalue su propio `process.env.DATABASE_URL` al importarse.
import { env } from '@/lib/env';
import type { Resultado } from '@rutas/shared';
import { db, usuario } from '@rutas/shared/db';
import { eq, type InferSelectModel } from 'drizzle-orm';

export type UsuarioInvitado = InferSelectModel<typeof usuario>;

export function dominioDe(correo: string): string {
  return correo.slice(correo.indexOf('@') + 1).toLowerCase();
}

const NO_INVITADO = {
  ok: false,
  error: { codigo: 'no_invitado', mensaje: 'Este correo no tiene una invitacion activa.' },
} as const;

/**
 * La compuerta del panel: no existe ninguna ruta que cree una cuenta desde
 * una peticion no autenticada, asi que un correo solo entra si ya hay una
 * fila de `usuario` activa para el, en el dominio corporativo permitido.
 */
export async function verificarInvitacion(correo: string): Promise<Resultado<UsuarioInvitado>> {
  const dominioPermitido = (env.GOOGLE_OAUTH_ALLOWED_DOMAIN as string).toLowerCase();

  // Verificado del lado del servidor: el parametro `hd` que manda Google es
  // una sugerencia, no una garantia.
  if (dominioDe(correo) !== dominioPermitido) {
    return NO_INVITADO;
  }

  const [fila] = await db.select().from(usuario).where(eq(usuario.correo, correo)).limit(1);

  if (!fila || fila.deletedAt !== null || !fila.activo) {
    return NO_INVITADO;
  }

  return { ok: true, data: fila };
}
