import { randomUUID } from 'node:crypto';
import { cliente, db } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generarPdfCliente } from './pdf.ts';

// Contra Chromium real y el panel real (§9 paso 15): `vitest.setup.ts` ya
// carga `.env`, asi que `PANEL_BASE_URL`/`WORKER_SHARED_SECRET` son los
// mismos valores con los que arranco `pnpm --filter @rutas/web dev` — que
// tiene que estar corriendo para que esta prueba pase de verdad, igual que
// `tests/e2e/**` necesita el panel arriba. No hay forma honesta de probar
// "Chromium imprime la pagina real" sin una pagina real que imprimir.
const PANEL_BASE_URL = process.env.PANEL_BASE_URL ?? 'http://127.0.0.1:3000';
const SECRETO = process.env.WORKER_SHARED_SECRET ?? '';

describe('generarPdfCliente', () => {
  const clienteId = randomUUID();

  beforeAll(async () => {
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (pdf)' });
  });

  afterAll(async () => {
    await db.delete(cliente).where(eq(cliente.id, clienteId));
  });

  it('produce un archivo que empieza con %PDF- y pesa mas de cero bytes', async () => {
    const resultado = await generarPdfCliente(
      { clienteId, desde: '2026-01-01', hasta: '2026-01-31' },
      { panelBaseUrl: PANEL_BASE_URL, secreto: SECRETO },
    );

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) {
      return;
    }
    expect(resultado.buffer.length).toBeGreaterThan(0);
    expect(resultado.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 30_000);

  it('responde no_encontrado para un cliente que no existe, sin abrir Chromium', async () => {
    const resultado = await generarPdfCliente(
      { clienteId: randomUUID(), desde: '2026-01-01', hasta: '2026-01-31' },
      { panelBaseUrl: PANEL_BASE_URL, secreto: SECRETO },
    );

    expect(resultado.ok).toBe(false);
    if (resultado.ok) {
      return;
    }
    expect(resultado.codigo).toBe('no_encontrado');
  });
});
