// `@/lib/env` importa primero A PROPOSITO (ver invitacion.ts): su carga de
// `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
import '@/lib/env';
import { db, perfilPersonal, usuario } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { crearClienteServidor } from '@/lib/supabase/server';

export interface UsuarioSesion {
  id: string;
  rol: 'admin' | 'supervisor' | 'chofer';
  credencial: string;
  correo: string | null;
  debeCambiarPassword: boolean;
  nombre: string | null;
}

/**
 * Resuelve el usuario de la sesion actual con su nombre y rol. `proxy.ts` ya
 * garantizo sesion valida y fila activa: esto es para mostrar, no para autorizar.
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
      correo: usuario.correo,
      debeCambiarPassword: usuario.debeCambiarPassword,
      nombre: perfilPersonal.nombre,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .where(eq(usuario.id, user.id))
    .limit(1);

  return fila ?? null;
}
