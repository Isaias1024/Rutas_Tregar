'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
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
 * Cambia la contrasena de QUIEN LLAMA: sin `can()` porque no hay recurso ajeno,
 * y con el cliente de SESION, porque `admin.updateUserById` revoca sus tokens.
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
