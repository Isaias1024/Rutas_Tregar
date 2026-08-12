import { redirect } from 'next/navigation';
import { obtenerUsuarioActual } from '@/server/sesion';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const usuario = await obtenerUsuarioActual();

  if (!usuario) {
    redirect('/login');
  }

  redirect(usuario.rol === 'admin' ? '/planeador' : '/monitor');
}
