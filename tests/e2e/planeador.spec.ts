import { asignacion, db, horario, ruta } from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// Usa la semilla del paso 5/6: la ruta "Centro - Planta Norte" trae DOS
// horarios en el turno "manana" (06:00-07:00 y 08:00-09:00) — el caso que
// motiva la tabla `horario` y que este paso tiene que poder asignar sin que
// choquen entre si, con dos choferes distintos.

function lunesDeSemana(fecha: Date): Date {
  const dia = fecha.getDay();
  const diferencia = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(fecha);
  lunes.setDate(fecha.getDate() + diferencia);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

// Limpia cualquier asignacion que una corrida anterior haya dejado para esta
// ruta en el lunes de la semana actual, para que la prueba sea repetible sin
// importar cuantas veces haya corrido antes en la misma semana real.
test.beforeEach(async () => {
  const fechaLunes = aISO(lunesDeSemana(new Date()));
  const [rutaFila] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(eq(ruta.nombre, 'Centro - Planta Norte'))
    .limit(1);
  if (!rutaFila) {
    return;
  }
  const horarios = await db
    .select({ id: horario.id })
    .from(horario)
    .where(eq(horario.rutaId, rutaFila.id));
  const horarioIds = horarios.map((h) => h.id);
  if (horarioIds.length === 0) {
    return;
  }
  await db
    .delete(asignacion)
    .where(and(inArray(asignacion.horarioId, horarioIds), eq(asignacion.fecha, fechaLunes)));
});

test('arma un dia completo con una ruta de dos horarios y reasigna', async ({
  page,
  context,
  baseURL,
}) => {
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');
  await expect(page.getByRole('heading', { name: 'Planeador semanal' })).toBeVisible();

  const horarioTemprano = page.locator('li').filter({ hasText: 'Centro - Planta Norte' }).filter({
    hasText: '06:00',
  });
  const horarioTardio = page.locator('li').filter({ hasText: 'Centro - Planta Norte' }).filter({
    hasText: '08:00',
  });
  await expect(horarioTemprano).toBeVisible();
  await expect(horarioTardio).toBeVisible();

  // Asigna el horario de las 06:00 con Juan Perez / T23.
  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Juan Perez' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T23' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeVisible();

  // Asigna el horario de las 08:00 (misma ruta, mismo turno) con Maria
  // Garcia / T24: no debe chocar con la asignacion de arriba, porque el
  // traslape se evalua por chofer, no por ruta.
  await horarioTardio.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Maria Garcia' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T24' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTardio.getByText('#1 · Maria Garcia · T24')).toBeVisible();

  // Reasigna la de las 06:00: mismo chofer, cambia el camion a T24.
  await horarioTemprano.getByRole('button', { name: 'Reasignar' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T24' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTemprano.getByText('#1 · Juan Perez · T24')).toBeVisible();
});

test('el mismo chofer toma las dos rutas del dia porque sus horas no se enciman', async ({
  page,
  context,
  baseURL,
}) => {
  // La regla vieja comparaba `turno` y esto era imposible: 06:00-07:00 y
  // 08:00-09:00 son ambas "manana". La regla real es traslape de horas, y
  // una jornada partida en varias vueltas es el caso normal de un chofer.
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');

  const horarioTemprano = page.locator('li').filter({ hasText: 'Centro - Planta Norte' }).filter({
    hasText: '06:00',
  });
  const horarioTardio = page.locator('li').filter({ hasText: 'Centro - Planta Norte' }).filter({
    hasText: '08:00',
  });

  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Juan Perez' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T23' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeVisible();

  // El MISMO chofer, el MISMO dia, en el segundo horario.
  await horarioTardio.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  // Y no aparece apagado: 08:00-09:00 no se encima con 06:00-07:00.
  const opcionJuan = page.getByRole('option', { name: 'Juan Perez' });
  await expect(opcionJuan).toBeEnabled();
  await opcionJuan.click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T24' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTardio.getByText('#1 · Juan Perez · T24')).toBeVisible();
  // Y la primera sigue en pie: son dos rutas del mismo chofer el mismo dia.
  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeVisible();
});

test('Cancelar desasigna al chofer y deja la ruta y el horario en pie', async ({
  page,
  context,
  baseURL,
}) => {
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');

  const horarioTemprano = page.locator('li').filter({ hasText: 'Centro - Planta Norte' }).filter({
    hasText: '06:00',
  });

  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Juan Perez' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T23' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeVisible();

  // Playwright DESCARTA los dialogos nativos por default: sin este manejador
  // el `confirm()` de BotonCancelar se cancelaria solo y la prueba pasaria
  // sin haber cancelado nada.
  page.once('dialog', (dialogo) => dialogo.accept());
  await horarioTemprano.getByRole('button', { name: 'Cancelar' }).click();

  // La interfaz refleja de inmediato que la ruta ya no tiene chofer...
  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeHidden();
  // ...la ruta y su horario siguen ahi, listos para otro chofer...
  await expect(horarioTemprano).toBeVisible();
  await expect(horarioTemprano.getByRole('button', { name: 'Asignar', exact: true })).toBeVisible();
  // ...y no quedo ningun mensaje de error en pantalla.
  await expect(horarioTemprano.getByText('No tienes permiso')).toBeHidden();

  // En la base es borrado logico, nunca DELETE: la fila se conserva con su
  // `cancelada_en` puesto, para que el historico y sus eventos sobrevivan.
  const fechaLunes = aISO(lunesDeSemana(new Date()));
  const [rutaFila] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(eq(ruta.nombre, 'Centro - Planta Norte'))
    .limit(1);
  const filas = await db
    .select({ id: asignacion.id, canceladaEn: asignacion.canceladaEn })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .where(and(eq(horario.rutaId, rutaFila?.id ?? ''), eq(asignacion.fecha, fechaLunes)));
  expect(filas).toHaveLength(1);
  expect(filas[0]?.canceladaEn).not.toBeNull();

  // Y el horario quedo libre de verdad: se puede volver a asignar.
  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Maria Garcia' }).click();
  await page.getByLabel('Camion').click();
  await page.getByRole('option', { name: 'T24' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('Maria Garcia · T24')).toBeVisible();
});
