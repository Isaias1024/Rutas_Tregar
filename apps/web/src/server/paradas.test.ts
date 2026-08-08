import { randomUUID } from 'node:crypto';
import { paradaCrearSchema, paradaEditarSchema } from '@rutas/shared';
import { describe, expect, it } from 'vitest';
import { editarParada } from './paradas.ts';

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
  // Igual que crearRuta/agregarHorario en rutas.test.ts: con entrada
  // invalida, zod falla antes de que la funcion intente resolver el actor
  // (`obtenerUsuarioActual`, que necesita `next/headers`, ausente aqui).

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
