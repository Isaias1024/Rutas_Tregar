'use server';

// `@/lib/env` importa primero A PROPOSITO (ver invitacion.ts, proxy.ts y
// server/catalogos.ts): su carga de `.env` tiene que correr antes de que
// `@rutas/shared/db` evalue `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { cambiarPasswordSchema, type Resultado } from '@rutas/shared';
import { db, usuario } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { crearClienteServidor } from '@/lib/supabase/server';
import { obtenerUsuarioActual } from '@/server/sesion';

const SIN_SESION: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'Tu sesion ya no es valida. Vuelve a entrar.' },
};

/**
 * Cambia la contrasena de QUIEN LLAMA, nunca la de otro usuario — por eso no
 * pasa por `can()` como el resto de las mutaciones administrativas de
 * catalogos.ts: no hay recurso ajeno que proteger, solo la propia sesion que
 * `obtenerUsuarioActual()` ya resuelve. Se audita igual, porque un cambio de
 * contrasena vale la pena que quede en la bitacora.
 *
 * Usa el cliente de SESION (`crearClienteServidor`), no `supabaseAdmin`:
 * `admin.updateUserById` revoca los refresh tokens existentes del usuario
 * como si fuera un cambio impuesto desde fuera, y eso incluye la sesion
 * actual — quien acaba de cambiar su propia contrasena se quedaria sin
 * sesion en la misma peticion. `auth.updateUser` sobre la sesion propia
 * cambia la contrasena sin invalidarse a si misma (mismo mecanismo que ya
 * usa `apps/mobile/src/app/cambiar-password.tsx`).
 */
export async function cambiarMiPassword(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = cambiarPasswordSchema.safeParse(input);
  if (!parseo.success) {
    return {
      ok: false,
      error: {
        codigo: 'validacion',
        mensaje: parseo.error.issues[0]?.message ?? 'Entrada invalida',
      },
    };
  }

  const actor = await obtenerUsuarioActual();
  if (!actor) {
    return SIN_SESION;
  }

  const supabase = await crearClienteServidor();
  const { error: errorAuth } = await supabase.auth.updateUser({ password: parseo.data.nueva });
  if (errorAuth) {
    return {
      ok: false,
      error: {
        codigo: 'validacion',
        mensaje: `No se pudo cambiar la contrasena: ${errorAuth.message}`,
      },
    };
  }

  await db.transaction(async (tx) => {
    await tx.update(usuario).set({ debeCambiarPassword: false }).where(eq(usuario.id, actor.id));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'editar',
      recurso: { tipo: 'usuario', id: actor.id },
      despues: { evento: 'cambio_password' },
    });
  });

  revalidatePath('/cuenta');
  return { ok: true, data: { id: actor.id } };
}
