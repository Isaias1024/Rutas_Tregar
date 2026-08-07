// `@/lib/env` importa primero A PROPOSITO (ver invitacion.ts, proxy.ts y
// server/catalogos.ts): su carga de `.env` tiene que correr antes de que
// `@rutas/shared/db` evalue `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { db, perfilPersonal, usuario } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { crearClienteServidor } from '@/lib/supabase/server';

export interface UsuarioSesion {
  id: string;
  rol: 'admin' | 'supervisor' | 'chofer';
  credencial: string;
  nombre: string | null;
}

/**
 * Resuelve el usuario de la sesion actual, con su nombre (via
 * `perfil_personal`) y su rol. `proxy.ts` ya garantiza que quien llega hasta
 * aqui tiene sesion valida y fila activa; esto solo la vuelve a leer para
 * mostrarla, no para autorizar.
 */
export async function obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [fila] = await db
    .select({
      id: usuario.id,
      rol: usuario.rol,
      credencial: usuario.credencial,
      nombre: perfilPersonal.nombre,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .where(eq(usuario.id, user.id))
    .limit(1);

  return fila ?? null;
}
