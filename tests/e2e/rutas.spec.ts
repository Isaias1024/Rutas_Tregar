import { expect, test } from '@playwright/test';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// Este entorno no tiene una llave real de Google Maps (`.env` la deja vacia
// a proposito): el selector de paradas siempre cae en captura manual aqui,
// que es exactamente el camino que el Done-when del paso 6 pide poder probar.

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
    await page.getByRole('option', { name: 'Manufacturas del Norte' }).click();

    await page.getByLabel('Nombre').fill(nombreRuta);

    await page.getByLabel('Parada de inicio').click();
    await page.getByRole('option', { name: 'Terminal Centro — Monterrey' }).click();

    await page.getByLabel('Parada de fin').click();
    await page.getByRole('option', { name: 'Planta Sur — Santa Catarina' }).click();

    // El primer horario ya trae valores validos por defecto (manana,
    // 06:00-06:30, 1 persona). Agregamos un segundo del mismo turno: es
    // justo el caso que el paso 6 exige aceptar.
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
    await page.getByRole('option', { name: 'Manufacturas del Norte' }).click();
    await page.getByLabel('Nombre').fill(`Ruta invertida E2E ${Date.now()}`);
    await page.getByLabel('Parada de inicio').click();
    await page.getByRole('option', { name: 'Terminal Centro — Monterrey' }).click();
    await page.getByLabel('Parada de fin').click();
    await page.getByRole('option', { name: 'Planta Sur — Santa Catarina' }).click();

    await page.getByLabel('Hora de inicio').fill('10:00');
    await page.getByLabel('Hora de fin').fill('09:00');

    await page.getByRole('button', { name: 'Crear' }).click();

    await expect(
      page.getByText('La hora de fin debe ser posterior a la hora de inicio'),
    ).toBeVisible();
  });
});
