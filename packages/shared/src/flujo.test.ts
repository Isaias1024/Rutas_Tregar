import { describe, expect, it } from 'vitest';
import { puedeRegistrar, requiereContador, siguientePaso, type TipoEvento } from './flujo.ts';

function eventos(...tipos: TipoEvento[]) {
  return tipos.map((tipo) => ({ tipo }));
}

describe('siguientePaso', () => {
  it('sin eventos, el primer paso es vio_ruta', () => {
    expect(siguientePaso([])).toBe('vio_ruta');
  });

  it('respeta el orden estricto: cada evento marcado avanza al siguiente', () => {
    expect(siguientePaso(eventos('vio_ruta'))).toBe('listo_inicio');
    expect(siguientePaso(eventos('vio_ruta', 'listo_inicio'))).toBe('inicio_ruta');
    expect(siguientePaso(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta'))).toBe('fin_ruta');
    expect(siguientePaso(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta'))).toBe(
      'retorno',
    );
  });

  it('con los cinco pasos registrados, no queda ningun paso pendiente', () => {
    expect(
      siguientePaso(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta', 'retorno')),
    ).toBeNull();
  });

  it('con un hueco, regresa el paso faltante y no el siguiente de la lista', () => {
    // vio_ruta y fin_ruta marcados, pero listo_inicio e inicio_ruta no: el
    // hueco es listo_inicio, no retorno.
    expect(siguientePaso(eventos('vio_ruta', 'fin_ruta'))).toBe('listo_inicio');
  });
});

describe('puedeRegistrar', () => {
  it('acepta el paso que siguientePaso senala', () => {
    expect(puedeRegistrar('vio_ruta', [])).toBe(true);
    expect(puedeRegistrar('listo_inicio', eventos('vio_ruta'))).toBe(true);
  });

  it('rechaza saltarse un paso', () => {
    expect(puedeRegistrar('inicio_ruta', eventos('vio_ruta'))).toBe(false);
  });

  it('rechaza repetir un paso ya marcado', () => {
    expect(puedeRegistrar('vio_ruta', eventos('vio_ruta'))).toBe(false);
  });
});

describe('requiereContador', () => {
  it('fin_ruta y retorno requieren contador', () => {
    expect(requiereContador('fin_ruta')).toBe(true);
    expect(requiereContador('retorno')).toBe(true);
  });

  it('los otros tres pasos no requieren contador', () => {
    expect(requiereContador('vio_ruta')).toBe(false);
    expect(requiereContador('listo_inicio')).toBe(false);
    expect(requiereContador('inicio_ruta')).toBe(false);
  });
});
