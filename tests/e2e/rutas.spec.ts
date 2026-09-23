import { expect, test } from '@playwright/test';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// Este entorno no tiene llave de Google Maps (`.env` la deja vacia a proposito):
// el selector de paradas siempre cae en captura manual aqui.

test.describe('Paradas y rutas', () => {
  test('un admin da de alta una parada por captura manual (sin llave de Maps)', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/paradas');
    await expect(page.getByRole('heading', { name: 'Paradas' })).toBeVisible();

    const nombreParada = `Parada E2E ${Date.now()}`;

    await page.getByRole('button', { name: 'Nueva parada' }).click();
    await expect(
      page.getByText('No hay una llave de Google Maps configurada en este ambiente'),
    ).toBeVisible();

    await page.getByLabel('Nombre').fill(nombreParada);
    await page.getByLabel('Direccion').fill('Calle de prueba 123, Monterrey, N.L.');
    await page.getByLabel('Latitud').fill('25.6866');
    await page.getByLabel('Longitud').fill('-100.3161');
    await page.getByRole('button', { name: 'Crear' }).click();

    const filaCreada = page.locator('tr:visible, li:visible').filter({ hasText: nombreParada });
    await expect(filaCreada).toBeVisible();
  });

  test('un admin edita una parada existente por captura manual (sin llave de Maps)', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/paradas');
    await expect(page.getByRole('heading', { name: 'Paradas' })).toBeVisible();

    const nombreOriginal = `Parada E2E editar ${Date.now()}`;
    const nombreEditado = `${nombreOriginal} (editada)`;

    await page.getByRole('button', { name: 'Nueva parada' }).click();
    await page.getByLabel('Nombre').fill(nombreOriginal);
    await page.getByLabel('Direccion').fill('Calle de prueba 456, Monterrey, N.L.');
    await page.getByLabel('Latitud').fill('25.6866');
    await page.getByLabel('Longitud').fill('-100.3161');
    await page.getByRole('button', { name: 'Crear' }).click();

    const filaCreada = page.locator('tr:visible, li:visible').filter({ hasText: nombreOriginal });
    await expect(filaCreada).toBeVisible();

    await filaCreada.getByRole('button', { name: 'Editar' }).click();

    // El dialogo de edicion reutiliza el mismo selector, precargado: el flujo es
    // identico al de creacion, solo cambia el titulo y el verbo del boton.
    await expect(page.getByRole('heading', { name: 'Editar parada' })).toBeVisible();
    await expect(page.getByLabel('Nombre')).toHaveValue(nombreOriginal);
    await expect(page.getByLabel('Direccion')).toHaveValue('Calle de prueba 456, Monterrey, N.L.');
    await expect(page.getByLabel('Latitud')).toHaveValue('25.6866');
    await expect(page.getByLabel('Longitud')).toHaveValue('-100.3161');

    await page.getByLabel('Nombre').fill(nombreEditado);
    await page.getByLabel('Latitud').fill('25.7');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    const filaEditada = page.locator('tr:visible, li:visible').filter({ hasText: nombreEditado });
    await expect(filaEditada).toBeVisible();
    await expect(filaEditada).toContainText('25.70000');
  });

  test('un admin borra una parada y deja de aparecer en el listado', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/paradas');
    await expect(page.getByRole('heading', { name: 'Paradas' })).toBeVisible();

    const nombreParada = `Parada E2E borrar ${Date.now()}`;

    await page.getByRole('button', { name: 'Nueva parada' }).click();
    await page.getByLabel('Nombre').fill(nombreParada);
    await page.getByLabel('Direccion').fill('Calle de prueba 789, Monterrey, N.L.');
    await page.getByLabel('Latitud').fill('25.6866');
    await page.getByLabel('Longitud').fill('-100.3161');
    await page.getByRole('button', { name: 'Crear' }).click();

    const filaCreada = page.locator('tr:visible, li:visible').filter({ hasText: nombreParada });
    await expect(filaCreada).toBeVisible();

    // `dismiss()` sobre cualquier dialogo NATIVO: si quedara un `confirm()`, el
    // navegador puede suprimirlo y el borrado no ocurriria nunca.
    page.on('dialog', (dialogo) => dialogo.dismiss());
    await filaCreada.getByRole('button', { name: 'Borrar' }).click();
    await expect(page.getByRole('dialog')).toContainText('Borrar parada');
    await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();

    // Acusa el borrado ademas de hacerlo: "la fila ya no esta" no distingue un
    // borrado exitoso de uno rechazado en silencio.
    await expect(page.getByText(`Parada "${nombreParada}" eliminada correctamente.`)).toBeVisible();
    await expect(filaCreada).toBeHidden();
  });

  test('un admin da de alta una ruta con dos horarios en el mismo turno', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/rutas');
    await expect(page.getByRole('heading', { name: 'Rutas' })).toBeVisible();

    const nombreRuta = `Ruta E2E ${Date.now()}`;

    await page.getByRole('button', { name: 'Nueva ruta' }).click();

    await page.getByLabel('Cliente').click();
    await page.getByRole('option', { name: 'Test Client' }).click();

    await page.getByLabel('Nombre').fill(nombreRuta);

    await page.getByLabel('Parada de inicio').click();
    await page.getByRole('option', { name: 'Stop 1' }).click();

    await page.getByLabel('Parada de fin').click();
    await page.getByRole('option', { name: 'Stop 4' }).click();

    // Un segundo horario del mismo turno que el que viene por defecto: es justo
    // el caso que hay que aceptar.
    await page.getByRole('button', { name: 'Agregar horario' }).click();

    await page.getByRole('button', { name: 'Crear' }).click();

    const filaCreada = page.locator('li').filter({ hasText: nombreRuta });
    await expect(filaCreada).toBeVisible();
    await expect(filaCreada.getByText('Manana')).toHaveCount(2);
  });

  test('muestra el mensaje de error cuando las horas de un horario estan invertidas', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/rutas');

    await page.getByRole('button', { name: 'Nueva ruta' }).click();

    await page.getByLabel('Cliente').click();
    await page.getByRole('option', { name: 'Test Client' }).click();
    await page.getByLabel('Nombre').fill(`Ruta invertida E2E ${Date.now()}`);
    await page.getByLabel('Parada de inicio').click();
    await page.getByRole('option', { name: 'Stop 1' }).click();
    await page.getByLabel('Parada de fin').click();
    await page.getByRole('option', { name: 'Stop 4' }).click();

    await page.getByLabel('Hora de inicio').fill('10:00');
    await page.getByLabel('Hora de fin').fill('09:00');

    await page.getByRole('button', { name: 'Crear' }).click();

    await expect(
      page.getByText('La hora de fin debe ser posterior a la hora de inicio'),
    ).toBeVisible();
  });
});
