// `@/lib/env` importa primero A PROPOSITO (ver server/catalogos.ts): su
// carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { reportePdfSchema } from '@rutas/shared';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

// Puente entre el boton "Descargar" del panel (sesion de cookies, ya la
// exige `proxy.ts` para todo `/api/reportes/*`) y `POST {WORKER_BASE_URL}/reportes/pdf`
// (secreto compartido). El navegador nunca ve `WORKER_SHARED_SECRET`: este
// route handler es el unico que lo lee y lo manda.
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
