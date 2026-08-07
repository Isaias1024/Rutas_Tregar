import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Cliente con la service role key: puede saltarse RLS y usar el API de
// administracion de Supabase Auth (alta de choferes, paso 5 en adelante).
// Por eso esta guardia va primero, antes de tocar cualquier variable de
// entorno: si por error algo del lado del cliente llegara a importar este
// archivo, revienta aqui y no expone la llave.
if (typeof window !== 'undefined') {
  throw new Error(
    'apps/web/src/lib/supabase/admin.ts usa la service role key y jamas debe ' +
      'importarse desde el navegador.',
  );
}

export const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL as string,
  env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
