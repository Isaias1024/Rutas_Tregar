import Image from 'next/image';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
    <main className="flex min-h-full flex-1 items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-6 shadow-tarjeta sm:p-8">
        <div className="space-y-3 text-center">
          <Image
            src="/tregar-logo.jpg"
            alt="Tregar"
            width={152}
            height={48}
            priority
            className="mx-auto h-10 w-auto"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Rutas</h1>
            <p className="text-sm text-muted-foreground">
              Panel de operacion de transporte de personal
            </p>
          </div>
        </div>
        {mensaje ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {mensaje}
          </p>
        ) : null}
        <form action={iniciarSesionConGoogle}>
          <Button type="submit" className="w-full">
            Entrar con Google
          </Button>
        </form>
      </div>
    </main>
  );
}
