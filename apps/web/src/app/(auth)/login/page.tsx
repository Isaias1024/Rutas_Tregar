// `@/lib/env` importa primero A PROPOSITO (ver invitacion.ts): su carga de
// `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
import '@/lib/env';
import { loginPasswordSchema } from '@rutas/shared';
import { db, usuario } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import Image from 'next/image';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// Un solo mensaje generico para correo, contrasena o cuenta inactiva: mismo
// criterio que la app movil.
async function iniciarSesionConPassword(formData: FormData) {
  'use server';

  const parseo = loginPasswordSchema.safeParse({
    correo: formData.get('correo'),
    password: formData.get('password'),
  });
  if (!parseo.success) {
    redirect('/login?error=credenciales_invalidas');
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parseo.data.correo,
    password: parseo.data.password,
  });
  if (error || !data.user) {
    redirect('/login?error=credenciales_invalidas');
  }

  const [fila] = await db.select().from(usuario).where(eq(usuario.id, data.user.id)).limit(1);
  if (!fila?.activo || fila.deletedAt !== null) {
    await supabase.auth.signOut();
    redirect('/login?error=credenciales_invalidas');
  }

  // El `redirect()` de una server action no vuelve a pasar por `proxy.ts`: por
  // rol solo, un primer ingreso se saltaria la compuerta de /cuenta.
  if (fila.debeCambiarPassword) {
    redirect('/cuenta');
  }
  redirect(fila.rol === 'admin' ? '/planeador' : '/monitor');
}

const MENSAJES_ERROR: Record<string, string> = {
  no_invitado:
    'Este correo no tiene una invitacion activa. Pide a un administrador que te de de alta.',
  oauth: 'No se pudo iniciar sesion con Google. Intenta de nuevo.',
  credenciales_invalidas: 'Correo o contrasena incorrectos.',
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

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">o</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form action={iniciarSesionConPassword} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="login-correo" className="text-sm font-medium">
              Correo
            </label>
            <Input id="login-correo" name="correo" type="email" required />
          </div>
          <div className="space-y-1">
            <label htmlFor="login-password" className="text-sm font-medium">
              Contrasena
            </label>
            <Input id="login-password" name="password" type="password" required />
          </div>
          <Button type="submit" variant="outline" className="w-full">
            Entrar con correo y contrasena
          </Button>
        </form>
      </div>
    </main>
  );
}
