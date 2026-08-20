import { describe, expect, it } from 'vitest';
import { camionCrearSchema, supervisorCrearSchema } from './catalogos.ts';

describe('camionCrearSchema — el tipo es un catalogo cerrado', () => {
  it('acepta los tres tipos de la flota', () => {
    for (const tipo of ['Van', 'Urvan', 'Autobus']) {
      const parseo = camionCrearSchema.safeParse({
        codigo: 'T99',
        tipo,
        placas: 'ABC-123',
        km: 0,
        estado: 'disponible',
      });
      expect(parseo.success).toBe(true);
    }
  });

  it('rechaza un tipo fuera del catalogo, aunque haya existido antes (p. ej. "Sprinter")', () => {
    const parseo = camionCrearSchema.safeParse({
      codigo: 'T99',
      tipo: 'Sprinter',
      placas: 'ABC-123',
      km: 0,
      estado: 'disponible',
    });
    expect(parseo.success).toBe(false);
  });
});

describe('supervisorCrearSchema', () => {
  it('acepta nombre y correo validos', () => {
    const parseo = supervisorCrearSchema.safeParse({
      nombre: 'Ana Torres',
      correo: 'ana.torres@tregar.com',
    });
    expect(parseo.success).toBe(true);
  });

  it('rechaza un correo mal formado', () => {
    const parseo = supervisorCrearSchema.safeParse({
      nombre: 'Ana Torres',
      correo: 'no-es-un-correo',
    });
    expect(parseo.success).toBe(false);
  });

  it('rechaza el nombre vacio', () => {
    const parseo = supervisorCrearSchema.safeParse({
      nombre: '  ',
      correo: 'ana.torres@tregar.com',
    });
    expect(parseo.success).toBe(false);
  });
});
