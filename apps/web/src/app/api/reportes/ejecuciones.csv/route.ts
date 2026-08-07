// `@/lib/env` importa primero A PROPOSITO (ver server/catalogos.ts): su
// carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { NextResponse } from 'next/server';
import { streamBitacoraEjecucionesCsv } from '@/server/reportes-csv';

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// `proxy.ts` ya exige sesion de `supervisor`/`admin` para todo `/api/reportes/*`
// (mismo patron que las paginas de `/reportes`): no hace falta repetir ese
// gate aqui.
export async function GET(request: Request): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');

  if (!desde || !hasta || !FECHA_VALIDA.test(desde) || !FECHA_VALIDA.test(hasta) || desde > hasta) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          codigo: 'validacion',
          mensaje: 'Se requiere "desde" y "hasta" en formato YYYY-MM-DD, con desde <= hasta.',
        },
      },
      { status: 422 },
    );
  }

  const stream = streamBitacoraEjecucionesCsv(desde, hasta);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ejecuciones-${desde}-a-${hasta}.csv"`,
    },
  });
}
