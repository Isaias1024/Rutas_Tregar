import { asignacion, db, horario, ruta } from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
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

// Limpia TODAS las asignaciones del lunes de la semana actual, no solo las de
// "Centro - Planta Norte": el traslape se evalua por chofer y por hora, asi que
// una asignacion que otra corrida dejo en CUALQUIER ruta a las 06:00 apaga a
// Juan Perez en el selector y esta suite se cae sin haber probado nada. La
// semilla no crea asignaciones, asi que borrar el dia entero no destruye datos
// de referencia.
test.beforeEach(async () => {
  await db.delete(asignacion).where(eq(asignacion.fecha, aISO(lunesDeSemana(new Date()))));
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

  // El `confirm()` nativo ya no existe, y esta linea es la que lo garantiza:
  // descarta CUALQUIER dialogo del navegador, que es lo mismo que le pasa a
  // quien marca "impedir que esta pagina cree mas dialogos" en Chrome. Con un
  // `confirm()` de por medio, la cancelacion nunca llegaba al servidor y el
  // boton se leia como muerto — el defecto que se reporto. La confirmacion es
  // ahora un dialogo del propio panel, que el navegador no puede suprimir.
  page.on('dialog', (dialogo) => dialogo.dismiss());
  await horarioTemprano.getByRole('button', { name: 'Cancelar' }).click();

  const confirmacion = page.getByRole('dialog');
  await expect(confirmacion).toContainText('Quitar al chofer de esta ruta');
  await confirmacion.getByRole('button', { name: 'Quitar chofer' }).click();

  // La interfaz refleja de inmediato que la ruta ya no tiene chofer...
  await expect(horarioTemprano.getByText('#1 · Juan Perez · T23')).toBeHidden();
  // ...lo dice con todas sus letras, no solo quitando la fila: "la fila ya no
  // esta" es indistinguible de un rechazo silencioso.
  await expect(page.getByRole('status')).toContainText('Juan Perez ya no esta asignado');
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
