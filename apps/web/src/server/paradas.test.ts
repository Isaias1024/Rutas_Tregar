import { randomUUID } from 'node:crypto';
import { paradaCrearSchema, paradaEditarSchema } from '@rutas/shared';
import { parada as paradaTabla, db } from '@rutas/shared/db';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { borrarParada, editarParada, listarParadas } from './paradas.ts';

function datosParada(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    nombre: 'Planta Norte — Caseta 2',
    direccion: 'Av. Industrias 100, Apodaca, N.L.',
    lat: 25.6866,
    lng: -100.3161,
    ...overrides,
  };
}

describe('esquemas de validacion de parada (busqueda de direccion y mapa)', () => {
  it('paradaCrearSchema exige lat y lng numericos dentro de rango', () => {
    expect(paradaCrearSchema.safeParse(datosParada()).success).toBe(true);
    expect(paradaCrearSchema.safeParse(datosParada({ lat: 200 })).success).toBe(false);
    expect(paradaCrearSchema.safeParse(datosParada({ lng: -200 })).success).toBe(false);
  });

  it('paradaCrearSchema rechaza lat/lng ausentes (nunca hay coordenadas a medias)', () => {
    const parseo = paradaCrearSchema.safeParse(datosParada({ lat: undefined }));
    expect(parseo.success).toBe(false);
  });

  it('paradaEditarSchema exige el mismo esquema de crear mas un id valido', () => {
    const id = randomUUID();
    expect(paradaEditarSchema.safeParse({ ...datosParada(), id }).success).toBe(true);
    expect(paradaEditarSchema.safeParse(datosParada()).success).toBe(false);
    expect(paradaEditarSchema.safeParse({ ...datosParada(), id: 'no-es-uuid' }).success).toBe(
      false,
    );
  });
});

describe('editarParada: rechaza entrada invalida antes de tocar sesion o base', () => {
  // Igual que en rutas.test.ts: con entrada invalida, zod falla antes de que la
  // funcion intente resolver el actor con `next/headers`.

  it('responde validacion 422 con id invalido', async () => {
    const resultado = await editarParada({ ...datosParada(), id: 'no-es-uuid' });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });

  it('responde validacion 422 con latitud fuera de rango', async () => {
    const resultado = await editarParada({ ...datosParada({ lat: 500 }), id: randomUUID() });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
      expect(resultado.error.campo).toBe('lat');
    }
  });

  it('responde validacion 422 sin nombre', async () => {
    const resultado = await editarParada({ ...datosParada({ nombre: '' }), id: randomUUID() });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });
});

describe('borrarParada: rechaza entrada invalida antes de tocar sesion o base', () => {
  it('responde validacion 422 con id invalido', async () => {
    const resultado = await borrarParada('no-es-uuid');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });

  it('responde validacion 422 sin id', async () => {
    const resultado = await borrarParada(undefined);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('validacion');
    }
  });
});

describe('listarParadas contra Postgres real: filtra el borrado logico', () => {
  const idsCreados: string[] = [];

  afterAll(async () => {
    if (idsCreados.length > 0) {
      for (const id of idsCreados) {
        await db.delete(paradaTabla).where(eq(paradaTabla.id, id));
      }
    }
  });

  it('una parada con deleted_at no aparece en listarParadas', async () => {
    const id = randomUUID();
    idsCreados.push(id);
    await db.insert(paradaTabla).values({ id, ...datosParada() });

    const antes = await listarParadas();
    expect(antes.some((p) => p.id === id)).toBe(true);

    await db.update(paradaTabla).set({ deletedAt: new Date() }).where(eq(paradaTabla.id, id));

    const despues = await listarParadas();
    expect(despues.some((p) => p.id === id)).toBe(false);
  });
});
