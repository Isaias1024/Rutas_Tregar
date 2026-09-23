import { describe, expect, it } from 'vitest';
import { crearSupervisor, desactivarSupervisor } from './catalogos.ts';

// Estas funciones parsean con zod ANTES de resolver el actor, asi que con
// entrada invalida nunca llegan a `next/headers` y se pueden probar aqui.

describe('crearSupervisor: rechaza entrada invalida antes de tocar sesion o base', () => {
  it('rechaza un correo mal formado', async () => {
    const resultado = await crearSupervisor({ nombre: 'Ana Torres', correo: 'no-es-un-correo' });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
  });

  it('rechaza el nombre vacio', async () => {
    const resultado = await crearSupervisor({ nombre: '', correo: 'ana@tregar.com' });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
  });
});

describe('desactivarSupervisor: rechaza un id invalido antes de tocar sesion o base', () => {
  it('rechaza algo que no es un uuid', async () => {
    const resultado = await desactivarSupervisor('no-es-un-uuid');
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.codigo).toBe('validacion');
  });
});
