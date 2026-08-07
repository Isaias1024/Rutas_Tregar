import type { ReportePdf } from '@rutas/shared';
import { cliente, db } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright';

// Imprime la pagina real del panel con Chromium headless (§9 paso 15, §6:
// "un solo diseno que mantener"). Solo Chromium: `page.pdf()` no existe en
// Firefox ni en WebKit (§ worker-y-reportes.md).

export type ResultadoPdf =
  | { ok: true; buffer: Buffer }
  | { ok: false; codigo: 'no_encontrado'; mensaje: string };

export interface ContextoPdf {
  panelBaseUrl: string;
  secreto: string;
}

export async function generarPdfCliente(
  datos: ReportePdf,
  contexto: ContextoPdf,
): Promise<ResultadoPdf> {
  const [fila] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(eq(cliente.id, datos.clienteId))
    .limit(1);
  if (!fila) {
    return { ok: false, codigo: 'no_encontrado', mensaje: 'El cliente no existe.' };
  }

  const url = new URL(`/reportes/cliente/${datos.clienteId}/imprimible`, contexto.panelBaseUrl);
  url.searchParams.set('desde', datos.desde);
  url.searchParams.set('hasta', datos.hasta);

  const navegador = await chromium.launch();
  try {
    // El secreto va en un header de la peticion, no en la URL: `proxy.ts`
    // solo acepta esta ruta sin sesion de cookies si trae
    // `x-rutas-worker-secret` (paso 15). Sin este header, Chromium chocaria
    // con el mismo redirect a /login que ve cualquier navegador sin sesion.
    const contextoNavegador = await navegador.newContext({
      extraHTTPHeaders: { 'x-rutas-worker-secret': contexto.secreto },
    });
    const pagina = await contextoNavegador.newPage();
    // `networkidle`: la grafica de Recharts se monta sincrona en el primer
    // render (§6), pero esperar a que la red este quieta cubre tambien la
    // fuente Inter auto-hospedada y cualquier otro recurso de la pagina.
    await pagina.goto(url.toString(), { waitUntil: 'networkidle' });
    const buffer = await pagina.pdf({ format: 'A4', printBackground: true });
    return { ok: true, buffer };
  } finally {
    await navegador.close();
  }
}
