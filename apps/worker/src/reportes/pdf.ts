import type { ReportePdf } from '@rutas/shared';
import { cliente, db } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { chromium } from 'playwright';

// Imprime la pagina real del panel con Chromium headless: `page.pdf()` no
// existe en Firefox ni en WebKit.

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
    // El secreto va en un header, no en la URL: sin el, `proxy.ts` manda a
    // Chromium al mismo redirect a /login que a cualquier navegador sin sesion.
    const contextoNavegador = await navegador.newContext({
      extraHTTPHeaders: { 'x-rutas-worker-secret': contexto.secreto },
    });
    const pagina = await contextoNavegador.newPage();
    // `networkidle`: la grafica se monta en el primer render, pero esperar a la
    // red quieta cubre tambien la fuente auto-hospedada.
    await pagina.goto(url.toString(), { waitUntil: 'networkidle' });
    const buffer = await pagina.pdf({ format: 'A4', printBackground: true });
    return { ok: true, buffer };
  } finally {
    await navegador.close();
  }
}
