// `@/lib/env` importa primero A PROPOSITO (ver server/catalogos.ts): su carga
// de `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
import '@/lib/env';
import { reportePdfSchema } from '@rutas/shared';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

// Puente entre el boton "Descargar" (sesion de cookies) y el worker (secreto
// compartido): este handler es el unico que lee `WORKER_SHARED_SECRET`.
export async function POST(request: Request): Promise<NextResponse | Response> {
  const cuerpo = await request.json().catch(() => null);
  const parseo = reportePdfSchema.safeParse(cuerpo);
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

  const secreto = env.WORKER_SHARED_SECRET;
  const baseWorker = env.WORKER_BASE_URL;
  if (!secreto || !baseWorker) {
    return NextResponse.json(
      { ok: false, error: { codigo: 'config', mensaje: 'El worker no esta configurado.' } },
      { status: 500 },
    );
  }

  const respuestaWorker = await fetch(`${baseWorker}/reportes/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rutas-worker-secret': secreto },
    body: JSON.stringify(parseo.data),
  });

  if (!respuestaWorker.ok) {
    const cuerpoError = await respuestaWorker.json().catch(() => ({
      codigo: 'error_worker',
      mensaje: 'El worker no pudo generar el PDF.',
    }));
    return NextResponse.json({ ok: false, error: cuerpoError }, { status: respuestaWorker.status });
  }

  return new Response(respuestaWorker.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        respuestaWorker.headers.get('content-disposition') ?? 'attachment; filename="reporte.pdf"',
    },
  });
}
