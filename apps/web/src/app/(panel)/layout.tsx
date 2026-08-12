import { TZDate } from '@date-fns/tz';
import { redirect } from 'next/navigation';
import { MarcoPanel } from '@/components/shell/marco-panel';
import { obtenerUsuarioActual } from '@/server/sesion';
import { cerrarSesion } from './acciones-sesion';

// Cada pagina bajo (panel) depende de la sesion y del dia operativo: nada
// aqui vale la pena cachear estaticamente.
export const dynamic = 'force-dynamic';

const FORMATO_FECHA_LARGA = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const usuario = await obtenerUsuarioActual();

  // `proxy.ts` ya garantiza sesion valida y fila activa antes de llegar aqui;
  // esto es una red de seguridad, no la comprobacion principal.
  if (!usuario) {
    redirect('/login');
  }

  // La fecha se formatea aqui y no en el cliente: el navegador del supervisor
  // podria estar en otra zona, y el dia operativo es siempre el de Monterrey.
  const fechaLarga = FORMATO_FECHA_LARGA.format(TZDate.tz('America/Mexico_City'));

  return (
    <MarcoPanel
      nombre={usuario.nombre ?? usuario.credencial}
      credencial={usuario.credencial}
      rol={usuario.rol}
      fechaLarga={fechaLarga}
      accionCerrarSesion={cerrarSesion}
    >
      {children}
    </MarcoPanel>
  );
}
