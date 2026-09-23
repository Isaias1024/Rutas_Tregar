import { randomUUID } from 'node:crypto';
import { cliente, db, parada, ruta } from '@rutas/shared/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { borrarClienteNucleo, rutasDeCliente } from './clientes-nucleo.ts';
import { borrarParadaNucleo, rutasQueUsanParada } from './paradas-nucleo.ts';

// Una parada o un cliente en uso no se pueden eliminar, y una ruta REFERENCIA a
// su parada en vez de copiarla, para que un cambio se propague solo.

describe('paradas y clientes en uso no se pueden eliminar (pasos 1 y 3)', () => {
  const actorId = randomUUID();
  const clienteConRutaId = randomUUID();
  const clienteLibreId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const paradaLibreId = randomUUID();
  const rutaId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId})`);
    await db.execute(
      sql`insert into usuario (id, credencial, rol) values (${actorId}, ${`integ-admin-${actorId.slice(0, 8)}`}, 'admin')`,
    );
    await db.insert(cliente).values([
      { id: clienteConRutaId, nombre: 'Cliente con ruta (integridad)' },
      { id: clienteLibreId, nombre: 'Cliente sin rutas (integridad)' },
    ]);
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Planta Norte (integridad)',
        direccion: 'Av. Industrias 100',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Planta Sur (integridad)',
        direccion: 'Av. Sur 200',
        lat: 25.7,
        lng: -100.3,
      },
      {
        id: paradaLibreId,
        nombre: 'Parada sin usar (integridad)',
        direccion: 'Calle Libre 1',
        lat: 25.6,
        lng: -100.2,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId: clienteConRutaId,
      nombre: 'Planta Norte -> Planta Sur',
      paradaInicioId,
      paradaFinId,
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from audit_log where actor_id = ${actorId}`);
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId, paradaLibreId]));
    await db.delete(cliente).where(inArray(cliente.id, [clienteConRutaId, clienteLibreId]));
    await db.execute(sql`delete from usuario where id = ${actorId}`);
    await db.execute(sql`delete from auth.users where id = ${actorId}`);
  });

  it('rutasQueUsanParada encuentra la ruta tanto por la parada de inicio como por la de fin', async () => {
    const porInicio = await rutasQueUsanParada(paradaInicioId);
    expect(porInicio.map((r) => r.id)).toContain(rutaId);

    const porFin = await rutasQueUsanParada(paradaFinId);
    expect(porFin.map((r) => r.id)).toContain(rutaId);

    const libre = await rutasQueUsanParada(paradaLibreId);
    expect(libre).toHaveLength(0);
  });

  it('borrar una parada en uso se rechaza y nombra las rutas afectadas', async () => {
    const resultado = await borrarParadaNucleo(actorId, paradaInicioId);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('conflicto');
    expect(resultado.error.mensaje).toContain('Planta Norte -> Planta Sur');

    // Y no la borro a medias: sigue viva.
    const [fila] = await db
      .select({ deletedAt: parada.deletedAt })
      .from(parada)
      .where(eq(parada.id, paradaInicioId));
    expect(fila?.deletedAt).toBeNull();
  });

  it('borrar una parada que ninguna ruta usa si procede', async () => {
    const resultado = await borrarParadaNucleo(actorId, paradaLibreId);
    expect(resultado.ok).toBe(true);

    const [fila] = await db
      .select({ deletedAt: parada.deletedAt })
      .from(parada)
      .where(eq(parada.id, paradaLibreId));
    expect(fila?.deletedAt).not.toBeNull();
  });

  it('borrar un cliente con rutas se rechaza; uno sin rutas procede', async () => {
    expect(await rutasDeCliente(clienteConRutaId)).toHaveLength(1);

    const rechazado = await borrarClienteNucleo(actorId, clienteConRutaId);
    expect(rechazado.ok).toBe(false);
    if (!rechazado.ok) {
      expect(rechazado.error.codigo).toBe('conflicto');
    }

    const aceptado = await borrarClienteNucleo(actorId, clienteLibreId);
    expect(aceptado.ok).toBe(true);
  });

  it('una ruta borrada deja de bloquear a su parada y a su cliente', async () => {
    await db.update(ruta).set({ deletedAt: new Date() }).where(eq(ruta.id, rutaId));

    expect(await rutasQueUsanParada(paradaInicioId)).toHaveLength(0);
    expect(await rutasDeCliente(clienteConRutaId)).toHaveLength(0);

    const parada2 = await borrarParadaNucleo(actorId, paradaFinId);
    expect(parada2.ok).toBe(true);

    // Se devuelve la ruta a su estado vivo para no alterar el afterAll.
    await db.update(ruta).set({ deletedAt: null }).where(eq(ruta.id, rutaId));
  });
});

describe('una ruta REFERENCIA a su parada, nunca copia sus datos (paso 5)', () => {
  const clienteId = randomUUID();
  const paradaInicioId = randomUUID();
  const paradaFinId = randomUUID();
  const rutaId = randomUUID();

  beforeAll(async () => {
    await db.insert(cliente).values({ id: clienteId, nombre: 'Cliente de prueba (referencia)' });
    await db.insert(parada).values([
      {
        id: paradaInicioId,
        nombre: 'Nombre original',
        direccion: 'Direccion original',
        lat: 25.68,
        lng: -100.31,
      },
      {
        id: paradaFinId,
        nombre: 'Parada fin (referencia)',
        direccion: 'Direccion 2',
        lat: 25.7,
        lng: -100.3,
      },
    ]);
    await db.insert(ruta).values({
      id: rutaId,
      clienteId,
      nombre: 'Ruta de prueba (referencia)',
      paradaInicioId,
      paradaFinId,
    });
  });

  afterAll(async () => {
    await db.delete(ruta).where(eq(ruta.id, rutaId));
    await db.delete(parada).where(inArray(parada.id, [paradaInicioId, paradaFinId]));
    await db.delete(cliente).where(eq(cliente.id, clienteId));
  });

  it('cambiar la parada cambia lo que ve la ruta, sin tocar la fila de ruta', async () => {
    // Comprobado por comportamiento: si alguien agregara columnas de parada a
    // `ruta` para "cachear", el join dejaria de reflejar el cambio y esto fallaria.
    await db
      .update(parada)
      .set({ nombre: 'Nombre corregido', direccion: 'Direccion corregida', lat: 26.1, lng: -101.2 })
      .where(eq(parada.id, paradaInicioId));

    const [fila] = await db
      .select({
        paradaNombre: parada.nombre,
        paradaDireccion: parada.direccion,
        paradaLat: parada.lat,
      })
      .from(ruta)
      .innerJoin(parada, eq(parada.id, ruta.paradaInicioId))
      .where(eq(ruta.id, rutaId));

    expect(fila?.paradaNombre).toBe('Nombre corregido');
    expect(fila?.paradaDireccion).toBe('Direccion corregida');
    expect(fila?.paradaLat).toBe(26.1);
  });
});
