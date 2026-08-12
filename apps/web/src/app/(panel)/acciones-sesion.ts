'use server';

import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

/**
 * Cierra la sesion desde el menu de usuario de la barra superior.
 *
 * No es una mutacion administrativa: no toca ninguna tabla y no hay recurso
 * sobre el que autorizar, asi que no pasa por `can()` ni escribe en la
 * bitacora. Lo unico que hace es borrar las cookies de sesion.
 */
export async function cerrarSesion(): Promise<void> {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect('/login');
}
