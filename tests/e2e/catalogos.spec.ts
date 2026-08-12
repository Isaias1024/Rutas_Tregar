import { expect, test } from '@playwright/test';
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

    page.once('dialog', (dialogo) => dialogo.accept());
    await filaEditada.getByRole('button', { name: 'Borrar' }).click();

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
