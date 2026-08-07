import { redirect } from 'next/navigation';
import { NavegacionPanel } from '@/components/shell/navegacion-panel';
import { obtenerUsuarioActual } from '@/server/sesion';

// Cada pagina bajo (panel) depende de la sesion y del dia operativo: nada
// aqui vale la pena cachear estaticamente.
export const dynamic = 'force-dynamic';

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioActual();

  // `proxy.ts` ya garantiza sesion valida y fila activa antes de llegar aqui;
  // esto es una red de seguridad, no la comprobacion principal.
  if (!usuario) {
    redirect('/login');
  }

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <NavegacionPanel nombre={usuario.nombre ?? usuario.credencial} rol={usuario.rol} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
