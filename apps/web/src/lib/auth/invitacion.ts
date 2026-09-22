// `@/lib/env` importa primero A PROPOSITO: su carga de `.env` corre antes de
// que `@rutas/shared/db` lea DATABASE_URL.
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
 * La compuerta del panel: ninguna ruta crea cuentas desde una peticion no
 * autenticada, asi que un correo solo entra si ya tiene fila de `usuario` activa.
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
