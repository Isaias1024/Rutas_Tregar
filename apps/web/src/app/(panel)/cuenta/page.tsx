import { redirect } from 'next/navigation';
import { obtenerUsuarioActual } from '@/server/sesion';
import { cambiarMiPassword } from './actions';
import { FormularioCuenta } from './formulario-cuenta';

export const dynamic = 'force-dynamic';

export default async function PaginaCuenta() {
  const actor = await obtenerUsuarioActual();
  // `proxy.ts` ya garantiza sesion valida antes de llegar aqui; esto solo
  // cubre el tipo (`obtenerUsuarioActual` puede devolver null en teoria).
  if (!actor) {
    redirect('/login');
  }

  return (
    <FormularioCuenta
      correo={actor.correo}
      credencial={actor.credencial}
      rol={actor.rol}
      debeCambiarPassword={actor.debeCambiarPassword}
      accionCambiarPassword={cambiarMiPassword}
    />
  );
}
