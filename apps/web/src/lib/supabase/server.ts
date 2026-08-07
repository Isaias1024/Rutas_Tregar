import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

// Cliente de servidor de Supabase, con la sesion en cookies HttpOnly
// (Secure en produccion, SameSite=Lax) que gestiona @supabase/ssr. Es el
// unico cliente Supabase con el JWT del usuario; para operaciones
// administrativas ver `admin.ts`.
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Se llamo desde un Server Component sin poder escribir cookies;
            // `apps/web/proxy.ts` (paso 4) refresca la sesion en cada peticion.
          }
        },
      },
    },
  );
}
