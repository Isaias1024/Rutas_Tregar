'use server';

import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

/**
 * Cierra la sesion desde el menu de usuario. No toca ninguna tabla ni hay recurso
 * que autorizar, asi que no pasa por `can()` ni escribe en la bitacora.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect('/login');
}
