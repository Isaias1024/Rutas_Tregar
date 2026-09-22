import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// Cliente con la service role key: se salta RLS. La guardia va antes de tocar el
// entorno, para que un import desde el cliente reviente sin exponer la llave.
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
