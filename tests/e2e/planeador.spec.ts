import { fechaOperativa } from '@rutas/shared';
import { asignacion, db, horario, ruta } from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { and, eq } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

// Esta suite necesita una ruta con DOS horarios en el turno "manana" — el caso
// que motiva la tabla `horario` y que este paso tiene que poder asignar sin que
// choquen entre si, con dos choferes distintos.
//
// La semilla (`scripts/seed.ts`) da a cada ruta UN solo horario a proposito: es
// un conjunto minimo y fijo. El segundo horario lo crea esta suite en su
// `beforeAll`, que es donde debe vivir un fixture que solo una prueba necesita —
// asi la semilla no crece para sostener un caso de prueba y la suite deja de
// romperse cada vez que alguien ajusta los datos de ejemplo.

/**
 * El dia sobre el que trabajan estas pruebas: el mismo que el Planeador abre
 * seleccionado, que es HOY segun la zona operativa (`diaSeleccionado` arranca en
 * `hoy` cuando la semana en pantalla lo incluye).
 *
 * Antes esto calculaba el lunes de la semana y lo pasaba por `toISOString()`.
 * Eran dos errores encimados: el Planeador casi nunca abre en lunes, y
 * `toISOString()` es UTC — la medianoche local de Monterrey cae en el dia
 * anterior. El resultado era que la limpieza de `beforeEach` vaciaba un dia que
 * nadie tocaba mientras las asignaciones se acumulaban en el dia real, hasta que
 * cada chofer aparecia como "horario encimado" y la suite se caia al abrir el
 * selector. Se usa `fechaOperativa`, la misma funcion que alimenta el `hoy` de
 * la pagina, para que no puedan volver a separarse.
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
// se evalua por chofer y por hora, asi que una asignacion que otra prueba dejo
// en CUALQUIER ruta a las 06:00 apaga a Driver Uno en el selector y esta suite
// se cae sin haber probado nada. La semilla no crea asignaciones, asi que borrar
// el dia entero no destruye datos de referencia.
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

  // Asigna el horario de las 06:00 con Driver Uno. El camion no se teclea: sale
  // de `usuario.camion_id` (T01 para Driver Uno, por la semilla) y el dialogo
  // solo lo muestra.
  await horarioTemprano.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Uno' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  // T01 lo puso el servidor a partir del chofer: nadie lo tecleo en el dialogo.
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeVisible();

  // Asigna el horario de las 08:00 (misma ruta, mismo turno) con Driver Dos /
  // T02: no debe chocar con la asignacion de arriba, porque el traslape se
  // evalua por chofer, no por ruta.
  await horarioTardio.getByRole('button', { name: 'Asignar', exact: true }).click();
  await page.getByLabel('Chofer').click();
  await page.getByRole('option', { name: 'Driver Dos' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();

  await expect(horarioTardio.getByText('#1 · Driver Dos · T02')).toBeVisible();

  // Reasigna la de las 06:00. Como el camion es una propiedad del chofer, la
  // unica forma de cambiarlo es cambiar de chofer: Driver Tres entra con T03.
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
  // 08:00-09:00 son ambas "manana". La regla real es traslape de horas, y
  // una jornada partida en varias vueltas es el caso normal de un chofer.
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

  // Con el mismo chofer va el mismo camion: T01 en las dos vueltas, porque el
  // camion viaja con el chofer.
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
  await expect(horarioTemprano.getByText('#1 · Driver Uno · T01')).toBeHidden();
  // ...lo dice con todas sus letras, no solo quitando la fila: "la fila ya no
  // esta" es indistinguible de un rechazo silencioso.
  await expect(page.getByRole('status')).toContainText('Driver Uno ya no esta asignado');
  // ...la ruta y su horario siguen ahi, listos para otro chofer...
  await expect(horarioTemprano).toBeVisible();
  await expect(horarioTemprano.getByRole('button', { name: 'Asignar', exact: true })).toBeVisible();
  // ...y no quedo ningun mensaje de error en pantalla.
  await expect(horarioTemprano.getByText('No tienes permiso')).toBeHidden();

  // En la base es borrado logico, nunca DELETE: la fila se conserva con su
  // `cancelada_en` puesto, para que el historico y sus eventos sobrevivan.
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
