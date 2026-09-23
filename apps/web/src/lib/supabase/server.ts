import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

// Cliente de servidor con la sesion en cookies HttpOnly que gestiona
// @supabase/ssr. Unico cliente con el JWT del usuario; ver `admin.ts` para el resto.
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
            // `proxy.ts` refresca la sesion en cada peticion.
          }
        },
      },
    },
  );
}
