import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

async function iniciarSesionConGoogle() {
  'use server';

  const encabezados = await headers();
  const protocolo = encabezados.get('x-forwarded-proto') ?? 'http';
  const host = encabezados.get('host');
  const origen = `${protocolo}://${host}`;

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origen}/auth/callback` },
  });

  if (error || !data.url) {
    redirect('/login?error=oauth');
  }

  redirect(data.url);
}

const MENSAJES_ERROR: Record<string, string> = {
  no_invitado:
    'Este correo no tiene una invitacion activa. Pide a un administrador que te de de alta.',
  oauth: 'No se pudo iniciar sesion con Google. Intenta de nuevo.',
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mensaje = error ? (MENSAJES_ERROR[error] ?? MENSAJES_ERROR.oauth) : null;

  return (
    <main>
      <h1>Rutas</h1>
      {mensaje ? <p role="alert">{mensaje}</p> : null}
      <form action={iniciarSesionConGoogle}>
        <button type="submit">Entrar con Google</button>
      </form>
    </main>
  );
}
