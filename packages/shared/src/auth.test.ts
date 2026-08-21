import { describe, expect, it } from 'vitest';
import { cambiarPasswordSchema, loginPasswordSchema } from './auth.ts';

describe('loginPasswordSchema', () => {
  it('acepta correo y contrasena validos', () => {
    const parseo = loginPasswordSchema.safeParse({
      correo: 'admin@test.com',
      password: 'Admin123!',
    });
    expect(parseo.success).toBe(true);
  });

  it('rechaza un correo mal formado', () => {
    const parseo = loginPasswordSchema.safeParse({
      correo: 'no-es-un-correo',
      password: 'Admin123!',
    });
    expect(parseo.success).toBe(false);
  });

  it('rechaza una contrasena vacia', () => {
    const parseo = loginPasswordSchema.safeParse({
      correo: 'admin@test.com',
      password: '',
    });
    expect(parseo.success).toBe(false);
  });
});

describe('cambiarPasswordSchema', () => {
  it('acepta dos contrasenas iguales de al menos 8 caracteres', () => {
    const parseo = cambiarPasswordSchema.safeParse({
      nueva: 'NuevaClave1',
      confirmacion: 'NuevaClave1',
    });
    expect(parseo.success).toBe(true);
  });

  it('rechaza una contrasena de menos de 8 caracteres', () => {
    const parseo = cambiarPasswordSchema.safeParse({
      nueva: 'Corta1',
      confirmacion: 'Corta1',
    });
    expect(parseo.success).toBe(false);
  });

  it('rechaza cuando la confirmacion no coincide', () => {
    const parseo = cambiarPasswordSchema.safeParse({
      nueva: 'NuevaClave1',
      confirmacion: 'OtraClave1',
    });
    expect(parseo.success).toBe(false);
  });
});
