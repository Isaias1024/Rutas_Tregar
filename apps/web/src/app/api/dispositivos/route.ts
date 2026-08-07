// `@/lib/env` importa primero A PROPOSITO (ver server/catalogos.ts): su
// carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { dispositivoRegistrarSchema } from '@rutas/shared';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { registrarDispositivo } from '@/server/dispositivos';

// Unico endpoint HTTP real del panel (no un server action): la app movil
// guarda su sesion en expo-secure-store, no en cookies del navegador, asi
// que se autentica con `Authorization: Bearer <access_token>` — el mismo
// access_token que ya trae de iniciar sesion contra Supabase — y este
// handler lo valida contra el cliente anonimo de Supabase, no contra
// `crearClienteServidor()` (que solo sabe leer cookies).
export async function POST(request: Request): Promise<NextResponse> {
  const encabezadoAuth = request.headers.get('authorization');
  const token = encabezadoAuth?.startsWith('Bearer ') ? encabezadoAuth.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: { codigo: 'no_autorizado', mensaje: 'Falta la sesion.' } },
      { status: 401 },
    );
  }

  const supabaseAnon = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL as string,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const {
    data: { user },
    error: errorAuth,
  } = await supabaseAnon.auth.getUser(token);
  if (errorAuth || !user) {
    return NextResponse.json(
      { ok: false, error: { codigo: 'no_autorizado', mensaje: 'Sesion invalida.' } },
      { status: 401 },
    );
  }

  const cuerpo = await request.json().catch(() => null);
  const parseo = dispositivoRegistrarSchema.safeParse(cuerpo);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return NextResponse.json(
      {
        ok: false,
        error: {
          codigo: 'validacion',
          mensaje: primero?.message ?? 'Entrada invalida',
          campo: primero?.path[0]?.toString(),
        },
      },
      { status: 422 },
    );
  }

  // El usuario solo puede registrar su propio dispositivo: usuario_id sale
  // de la sesion verificada arriba, nunca del cuerpo de la peticion.
  await registrarDispositivo(user.id, parseo.data);

  return NextResponse.json({ ok: true, data: { id: user.id } });
}
