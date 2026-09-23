import { fechaOperativa } from '@rutas/shared';
import { asignacion, db, horario, ruta } from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// Esta suite necesita una ruta con DOS horarios en el mismo turno; la semilla
// da uno solo, asi que el segundo lo crea el `beforeAll` de aqui.

/**
 * El dia que el Planeador abre seleccionado: HOY segun la zona operativa. Se
 * usa `fechaOperativa` (no UTC) para que no se separe del `hoy` de la pagina.
 */
function diaDePruebas(): string {
  return fechaOperativa(new Date());
}

const RUTA_DOS_HORARIOS = 'Route 1';

test.beforeAll(async () => {
  const [rutaFila] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(eq(ruta.nombre, RUTA_DOS_HORARIOS))
    .limit(1);
  if (!rutaFila) {
    throw new Error(`setup: no existe la ruta "${RUTA_DOS_HORARIOS}". Corre \`pnpm db:seed\`.`);
  }

  // `time` vuelve de Postgres como 'HH:MM:SS', aunque se inserte 'HH:MM'.
  const [yaExiste] = await db
    .select({ id: horario.id })
    .from(horario)
    .where(and(eq(horario.rutaId, rutaFila.id), eq(horario.horaInicioEsperada, '08:00:00')))
    .limit(1);
  if (!yaExiste) {
    await db.insert(horario).values({
      rutaId: rutaFila.id,
      turno: 'manana',
      horaInicioEsperada: '08:00',
      horaFinEsperada: '09:00',
      personasEsperadas: 15,
    });
  }
});

// Limpia TODAS las asignaciones del dia, no solo las de `Route 1`: el traslape
// se evalua por chofer y hora, y la semilla no crea asignaciones que perder.
test.beforeEach(async () => {
  await db.delete(asignacion).where(eq(asignacion.fecha, diaDePruebas()));
});

test('arma un dia completo con una ruta de dos horarios y reasigna', async ({
  page,
  context,
  baseURL,
}) => {
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');
  await expect(page.getByRole('heading', { name: 'Planeador semanal' })).toBeVisible();

  const horarioTemprano = page.locator('li').filter({ hasText: 'Route 1' }).filter({
    hasText: '06:00',
  });
  const horarioTardio = page.locator('li').filter({ hasText: 'Route 1' }).filter({
    hasText: '08:00',
  });
  await expect(horarioTemprano).toBeVisible();
  await expect(horarioTardio).toBeVisible();

  // El camion no se teclea: sale de `usuario.camion_id` y el dialogo solo lo muestra.
  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Uno' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // T01 lo puso el servidor a partir del chofer: nadie lo tecleo en el dialogo.
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeVisible();

  // Misma ruta y mismo turno con otro chofer: no choca, porque el traslape se
  // evalua por chofer.
  await horarioTardio.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Dos' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTardio.getByText('#1 · Driver Dos · T02')).toBeVisible();

  // El camion es propiedad del chofer: la unica forma de cambiarlo es cambiar
  // de chofer.
  await horarioTemprano.getByRole('button', { name: 'Reasignar' }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Tres' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTemprano.getByText('#1 · Driver Tres · T03')).toBeVisible();
});

test('el mismo chofer toma las dos rutas del dia porque sus horas no se enciman', async ({
  page,
  context,
  baseURL,
}) => {
  // La regla vieja comparaba `turno` y esto era imposible: 06:00-07:00 y
  // 08:00-09:00 son ambas "manana".
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');

  const horarioTemprano = page.locator('li').filter({ hasText: 'Route 1' }).filter({
    hasText: '06:00',
  });
  const horarioTardio = page.locator('li').filter({ hasText: 'Route 1' }).filter({
    hasText: '08:00',
  });

  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Uno' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeVisible();

  // El MISMO chofer, el MISMO dia, en el segundo horario.
  await horarioTardio.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  // Y no aparece apagado: 08:00-09:00 no se encima con 06:00-07:00.
  const opcionDriverUno = page.getByRole('option', { name: 'Driver Uno' });
  await expect(opcionDriverUno).toBeEnabled();
  await opcionDriverUno.click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Con el mismo chofer va el mismo camion, porque el camion viaja con el chofer.
  await expect(horarioTardio.getByText('#1 · Driver Uno · T01')).toBeVisible();
  // Y la primera sigue en pie: son dos rutas del mismo chofer el mismo dia.
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeVisible();
});

test('Cancelar desasigna al chofer y deja la ruta y el horario en pie', async ({
  page,
  context,
  baseURL,
}) => {
  await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
  await page.goto('/planeador');

  const horarioTemprano = page.locator('li').filter({ hasText: 'Route 1' }).filter({
    hasText: '06:00',
  });

  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Uno' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeVisible();

  // Descarta CUALQUIER dialogo del navegador, como quien marca "impedir que esta
  // pagina cree mas dialogos": la confirmacion debe ser del panel, no un confirm().
  page.on('dialog', (dialogo) => dialogo.dismiss());
  await horarioTemprano.getByRole('button', { name: 'Cancelar' }).click();

  const confirmacion = page.getByRole('dialog');
  await expect(confirmacion).toContainText('Quitar al chofer de esta ruta');
  await confirmacion.getByRole('button', { name: 'Quitar chofer' }).click();

  // La interfaz refleja de inmediato que la ruta ya no tiene chofer...
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeHidden();
  // ...lo dice con todas sus letras: "la fila ya no esta" es indistinguible de
  // un rechazo silencioso.
  await expect(page.getByRole('status')).toContainText('Driver Uno ya no esta asignado');
  // ...la ruta y su horario siguen ahi, listos para otro chofer...
  await expect(horarioTemprano).toBeVisible();
  await expect(horarioTemprano.getByRole('button', { name: 'Asignar', exact: true })).toBeVisible();
  // ...y no quedo ningun mensaje de error en pantalla.
  await expect(horarioTemprano.getByText('No tienes permiso')).toBeHidden();

  // En la base es borrado logico, nunca DELETE, para que el historico y sus
  // eventos sobrevivan.
  const fecha = diaDePruebas();
  const [rutaFila] = await db
    .select({ id: ruta.id })
    .from(ruta)
    .where(eq(ruta.nombre, 'Route 1'))
    .limit(1);
  const filas = await db
    .select({ id: asignacion.id, canceladaEn: asignacion.canceladaEn })
    .from(asignacion)
    .innerJoin(horario, eq(horario.id, asignacion.horarioId))
    .where(and(eq(horario.rutaId, rutaFila?.id ?? ''), eq(asignacion.fecha, fecha)));
  expect(filas).toHaveLength(1);
  expect(filas[0]?.canceladaEn).not.toBeNull();

  // Y el horario quedo libre de verdad: se puede volver a asignar.
  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Dos' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(horarioTemprano.getByText('Driver Dos · T02')).toBeVisible();
});
