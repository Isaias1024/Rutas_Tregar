import { TZDate } from '@date-fns/tz';
import {
  asignacion,
  camion,
  cliente,
  db,
  evento,
  horario,
  parada,
  ruta,
  usuario,
} from '@rutas/shared/db';
import { expect, test } from '@playwright/test';
import { eq, sql } from 'drizzle-orm';
import { iniciarSesionComo } from './ayuda-sesion.ts';

function fechaOperativaHoy(): string {
  const ahora = TZDate.tz('America/Mexico_City');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

const NOMBRE_RUTA = 'Ruta E2E Monitor';

test.describe('Monitor', () => {
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
      credencial: `monitor-${choferId.slice(0, 8)}`,
      rol: 'chofer',
    });
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente E2E Monitor' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Parada inicio (monitor)',
        direccion: 'Direccion 1',
        lat: 25.6866,
        lng: -100.3161,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (monitor)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db
      .insert(ruta)
      .values({ id: rutaId, clienteId, nombre: NOMBRE_RUTA, paradaInicioId, paradaFinId });
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
      codigo: `T-MON-${camionId.slice(0, 6)}`,
      tipo: 'sprinter',
      placas: 'MON-001',
    });
    await db.insert(asignacion).values({
      id: asignacionId,
      horarioId,
      fecha: fechaOperativaHoy(),
      choferId,
      camionId,
      camionCodigo: `T-MON-${camionId.slice(0, 6)}`,
      createdBy: choferId,
    });
  });

  test.afterAll(async () => {
    await db.execute(
      sql`delete from audit_log where recurso_tipo = 'evento' and recurso_id in (select id::text from evento where asignacion_id = ${asignacionId})`,
    );
    await db.delete(evento).where(eq(evento.asignacionId, asignacionId));
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

  test('muestra tarjetas sin scroll horizontal a 375px, la pastilla lleva texto, y la captura manual crea un evento de supervisor', async ({
    page,
    context,
    baseURL,
  }) => {
    await iniciarSesionComo(context, 'admin', baseURL ?? 'http://127.0.0.1:3000');
    await page.goto('/monitor');
    await expect(page.getByRole('heading', { name: 'Monitor' })).toBeVisible();

    const fila = page.locator('tr:visible, li:visible').filter({ hasText: NOMBRE_RUTA });
    await expect(fila).toBeVisible();

    // El estado inicial es "Pendiente" (sin eventos): la pastilla debe traer
    // texto ademas de color, legible incluso sin distinguir el color.
    await expect(fila.getByText('Pendiente')).toBeVisible();

    const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
    const anchoVentana = await page.evaluate(() => window.innerWidth);
    expect(anchoDocumento).toBeLessThanOrEqual(anchoVentana);

    await fila.getByRole('button', { name: /Registrar/ }).click();
    await page.getByLabel('Paso').click();
    await page.getByRole('option', { name: 'Vio la ruta' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(fila.getByText('En curso')).toBeVisible();

    const [filaEvento] = await db.execute<{ origen: string }>(
      sql`select origen from evento where asignacion_id = ${asignacionId} and tipo = 'vio_ruta'`,
    );
    expect(filaEvento?.origen).toBe('supervisor');
  });
});
