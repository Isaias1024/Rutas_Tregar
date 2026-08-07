import { asignacion, camion, cliente, db, horario, parada, ruta, usuario } from '@rutas/shared/db';
import { expect, type Page, test } from '@playwright/test';
import { eq, sql } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// El flujo principal del panel (§9 paso 16): las paginas que un admin visita
// a diario. No es exhaustivo — es la muestra representativa que el
// Done-when pide recorrer.
const PAGINAS_FLUJO_PRINCIPAL = [
  '/monitor',
  '/planeador',
  '/catalogos/clientes',
  '/reportes/cumplimiento',
  '/bitacora',
];

async function contarInputsSinEtiqueta(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sinEtiqueta: string[] = [];
    const controles = document.querySelectorAll('input, select, textarea');
    for (const control of Array.from(controles)) {
      const elemento = control as HTMLInputElement;
      // `type="hidden"` y `aria-hidden="true"` (este ultimo lo deja Radix en
      // un `<select>` nativo oculto, de respaldo para autocompletado, con
      // `tabindex="-1"` — nunca lo alcanza un lector de pantalla ni el
      // teclado) quedan fuera a proposito: no son controles que alguien
      // pueda de verdad encontrar sin etiqueta.
      if (elemento.type === 'hidden' || elemento.getAttribute('aria-hidden') === 'true') {
        continue;
      }
      const tieneAriaLabel = elemento.hasAttribute('aria-label');
      const tieneAriaLabelledby = elemento.hasAttribute('aria-labelledby');
      const tieneLabelAsociado = elemento.labels !== null && elemento.labels.length > 0;
      if (!tieneAriaLabel && !tieneAriaLabelledby && !tieneLabelAsociado) {
        sinEtiqueta.push(elemento.outerHTML.slice(0, 120));
      }
    }
    return sinEtiqueta;
  });
}

test.describe('Accesibilidad', () => {
  let choferId: string;
  let clienteId: string;
  let paradaInicioId: string;
  let paradaFinId: string;
  let rutaId: string;
  let horarioId: string;
  let camionId: string;
  let asignacionId: string;

  test.beforeAll(async () => {
    choferId = crypto.randomUUID();
    clienteId = crypto.randomUUID();
    paradaInicioId = crypto.randomUUID();
    paradaFinId = crypto.randomUUID();
    rutaId = crypto.randomUUID();
    horarioId = crypto.randomUUID();
    camionId = crypto.randomUUID();
    asignacionId = crypto.randomUUID();

    await db.execute(sql`insert into auth.users (id) values (${choferId})`);
    await db.insert(usuario).values({
      id: choferId,
      credencial: `a11y-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente E2E Accesibilidad' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (a11y)',
        direccion: 'Direccion 1',
        lat: 25.6866,
        lng: -100.3161,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (a11y)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta E2E Accesibilidad',
      paradaInicioId,
      paradaFinId,
    });
    await db.insert(horario).values({
      id: horarioId,
      rutaId,
      turno: 'manana',
      horaInicioEsperada: '06:00',
      horaFinEsperada: '07:00',
      personasEsperadas: 10,
    });
    await db.insert(camion).values({
      id: camionId,
      codigo: `T-A11Y-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'A11-001',
    });
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(
        new Date(),
      ),
      choferId,
      camionId,
      camionCodigo: `T-A11Y-${camionId.slice(0, 6)}`,
      createdBy: choferId,
    });
  });

  test.afterAll(async () => {
    await db.delete(asignacion).where(eq(asignacion.id, asignacionId));
    await db.delete(horario).where(eq(horario.id, horarioId));
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(camion).where(eq(camion.id, camionId));
    await db.delete(parada).where(eq(parada.id, paradaInicioId));
    await db.delete(parada).where(eq(parada.id, paradaFinId));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.delete(usuario).where(eq(usuario.id, choferId));
    await db.execute(sql`delete from auth.users where id = ${choferId}`);
  });

  test('cada pagina del flujo principal tiene exactamente un h1', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');

    for (const pagina of PAGINAS_FLUJO_PRINCIPAL) {
      await page.goto(pagina);
      await expect(page.locator('h1'), `${pagina} deberia tener exactamente un h1`).toHaveCount(1);
    }
  });

  test('toda entrada del flujo principal tiene una etiqueta programatica', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');

    for (const pagina of PAGINAS_FLUJO_PRINCIPAL) {
      await page.goto(pagina);
      const sinEtiqueta = await contarInputsSinEtiqueta(page);
      expect(
        sinEtiqueta,
        `${pagina} tiene entradas sin label/aria-label: ${sinEtiqueta.join(', ')}`,
      ).toEqual([]);
    }
  });

  test('ninguna pagina del panel produce scroll horizontal a 320px de ancho', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.setViewportSize({ width: 320, height: 800 });

    for (const pagina of PAGINAS_FLUJO_PRINCIPAL) {
      await page.goto(pagina);
      const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
      const anchoVentana = await page.evaluate(() => window.innerWidth);
      expect(anchoDocumento, `${pagina} produce scroll horizontal a 320px`).toBeLessThanOrEqual(
        anchoVentana,
      );
    }
  });

  test('el elemento enfocado con teclado muestra un anillo de foco visible', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/monitor');

    await page.keyboard.press('Tab');
    const estiloFoco = await page.evaluate(() => {
      const activo = document.activeElement;
      if (!activo || activo === document.body) {
        return null;
      }
      const estilo = getComputedStyle(activo);
      return { outlineStyle: estilo.outlineStyle, boxShadow: estilo.boxShadow };
    });

    expect(estiloFoco).not.toBeNull();
    const tieneAnillo =
      estiloFoco?.outlineStyle !== 'none' || (estiloFoco?.boxShadow ?? 'none') !== 'none';
    expect(
      tieneAnillo,
      `El elemento enfocado no muestra anillo de foco: ${JSON.stringify(estiloFoco)}`,
    ).toBe(true);
  });

  test('el teclado recorre el panel sin atrapar el foco', async ({ page, context, baseURL }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/monitor');

    const elementosVisitados = new Set<string>();
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const identidad = await page.evaluate(() => {
        const activo = document.activeElement;
        if (!activo) {
          return null;
        }
        return `${activo.tagName}:${activo.textContent?.trim().slice(0, 30) ?? activo.getAttribute('aria-label') ?? ''}`;
      });
      if (identidad) {
        elementosVisitados.add(identidad);
      }
    }

    // Si el foco quedara atrapado en un solo elemento, 15 tabulaciones
    // habrian visitado nada mas ese elemento repetido.
    expect(elementosVisitados.size).toBeGreaterThan(1);
  });

  test('la pastilla de estado en el monitor nunca depende solo del color: su texto esta en el DOM', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/monitor');

    const fila = page
      .locator('tr:visible, li:visible')
      .filter({ hasText: 'Ruta E2E Accesibilidad' });
    await expect(fila).toBeVisible();
    // Sin ningun evento capturado, el estado es "Pendiente" — su texto tiene
    // que estar en el DOM, no solo un color de fondo.
    await expect(fila.getByText('Pendiente')).toBeVisible();
  });
});
