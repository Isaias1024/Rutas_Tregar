import { cliente, db } from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

test.describe('Catalogos', () => {
  test('un admin da de alta un cliente, lo edita y lo borra logicamente', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/catalogos/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();

    const nombreCliente = `Cliente E2E ${Date.now()}`;

    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre').fill(nombreCliente);
    await page.getByRole('button', { name: 'Crear' }).click();

    const filaCreada = page.locator('tr:visible, li:visible').filter({ hasText: nombreCliente });
    await expect(filaCreada).toBeVisible();

    const nombreEditado = `${nombreCliente} editado`;
    await filaCreada.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Nombre').fill(nombreEditado);
    await page.getByRole('button', { name: 'Guardar' }).click();

    const filaEditada = page.locator('tr:visible, li:visible').filter({ hasText: nombreEditado });
    await expect(filaEditada).toBeVisible();

    // Ningun `confirm()` nativo: si alguno sobrevive, esta llamada lo descarta
    // (equivale a que devuelva `false`) y el borrado no ocurre — que es
    // exactamente el fallo que se reportaba. La confirmacion tiene que ser un
    // dialogo propio del panel, imposible de suprimir por el navegador.
    page.on('dialog', (dialogo) => dialogo.dismiss());
    await filaEditada.getByRole('button', { name: 'Borrar' }).click();
    await expect(page.getByRole('dialog')).toContainText('Borrar cliente');
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();

    // El boton tiene que ACUSAR el borrado, no solo hacerlo. Sin esto la
    // pantalla solo "deja de mostrar la fila", que es indistinguible de un
    // borrado rechazado en silencio — el sintoma que se reportaba como "el
    // boton de eliminar no funciona".
    await expect(
      page.getByText(`Cliente "${nombreEditado}" eliminado correctamente.`),
    ).toBeVisible();

    // Borrado logico: desaparece de la lista, pero la fila sigue en la base
    // (`borrarCliente` solo fija `deleted_at`, nunca hace DELETE). La tabla
    // de escritorio y las tarjetas de movil coexisten siempre en el DOM —
    // una queda oculta por CSS segun el viewport — por eso el filtro
    // `:visible` en vez de `getByText` a secas, que resolveria a las dos.
    await expect(
      page.locator('tr:visible, li:visible').filter({ hasText: nombreEditado }),
    ).toHaveCount(0);
  });

  test('borrar un cliente que otra pestana ya borro lo dice, no finge que se borro', async ({
    page,
    context,
    baseURL,
  }) => {
    // `borrarCliente` vive en una server action que necesita `next/headers`, asi
    // que no hay forma de probarla con vitest: la unica prueba honesta de su
    // predicado `deleted_at is null` es esta, contra el panel real.
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/catalogos/clientes');

    const nombre = `Cliente carrera ${Date.now()}`;
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByRole('button', { name: 'Crear' }).click();

    const fila = page.locator('tr:visible, li:visible').filter({ hasText: nombre });
    await expect(fila).toBeVisible();

    await fila.getByRole('button', { name: 'Borrar' }).click();
    const confirmacion = page.getByRole('dialog');
    await expect(confirmacion).toContainText('Borrar cliente');

    // La otra pestana gana la carrera mientras el dialogo esta abierto.
    await db.update(cliente).set({ deletedAt: new Date() }).where(eq(cliente.nombre, nombre));

    await confirmacion.getByRole('button', { name: 'Borrar' }).click();

    // Sin el predicado, esto respondia `ok` y la pantalla acusaba "eliminado
    // correctamente" sobre una fila que ya no existia.
    await expect(confirmacion.getByRole('alert')).toContainText('El recurso no existe');
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('un supervisor tiene el mismo acceso a catalogos que un admin', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'supervisor', baseURL ?? 'http://127.0.0.1:3000');
    const respuesta = await page.goto('/catalogos/clientes');
    expect(respuesta?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  });
});
