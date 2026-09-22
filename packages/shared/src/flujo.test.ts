import { describe, expect, it } from 'vitest';
import {
  estadoRuta,
  puedeRegistrar,
  requiereContador,
  siguientePaso,
  type TipoEvento,
} from './flujo.ts';

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

  it('fin_ruta_incidente esta disponible desde antes de cualquier evento, no solo tras inicio_ruta', () => {
    expect(puedeRegistrar('fin_ruta_incidente', [])).toBe(true);
    expect(puedeRegistrar('fin_ruta_incidente', eventos('vio_ruta'))).toBe(true);
    expect(puedeRegistrar('fin_ruta_incidente', eventos('vio_ruta', 'listo_inicio'))).toBe(true);
    expect(
      puedeRegistrar('fin_ruta_incidente', eventos('vio_ruta', 'listo_inicio', 'inicio_ruta')),
    ).toBe(true);
  });

  it('fin_ruta_incidente se cierra una vez que la ruta ya termino', () => {
    expect(
      puedeRegistrar(
        'fin_ruta_incidente',
        eventos('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta', 'retorno'),
      ),
    ).toBe(false);
    expect(puedeRegistrar('fin_ruta_incidente', eventos('vio_ruta', 'fin_ruta_incidente'))).toBe(
      false,
    );
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

describe('estadoRuta', () => {
  it('sin eventos esta pendiente', () => {
    expect(estadoRuta([])).toBe('pendiente');
  });

  it('vio_ruta y listo_inicio todavia son preparacion: sigue pendiente', () => {
    // La ruta no ha arrancado hasta inicio_ruta; marcarla "en curso" antes
    // le diria al chofer que ya salio cuando sigue en el patio.
    expect(estadoRuta(eventos('vio_ruta'))).toBe('pendiente');
    expect(estadoRuta(eventos('vio_ruta', 'listo_inicio'))).toBe('pendiente');
  });

  it('inicio_ruta la pone en curso, y fin_ruta la mantiene en curso', () => {
    expect(estadoRuta(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta'))).toBe('en_curso');
    expect(estadoRuta(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta'))).toBe(
      'en_curso',
    );
  });

  it('retorno la cierra como completada', () => {
    expect(
      estadoRuta(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta', 'fin_ruta', 'retorno')),
    ).toBe('completada');
  });

  it('cancelada gana sobre cualquier avance previo', () => {
    // Una ruta cancelada a media ejecucion sigue trayendo sus eventos: si el
    // avance ganara, diria "en curso" para algo que ya nadie va a manejar.
    expect(
      estadoRuta(eventos('vio_ruta', 'listo_inicio', 'inicio_ruta'), '2026-08-14T10:00:00Z'),
    ).toBe('cancelada');
    expect(estadoRuta([], '2026-08-14T10:00:00Z')).toBe('cancelada');
  });

  it('null y undefined en canceladaEn no cancelan nada', () => {
    expect(estadoRuta(eventos('inicio_ruta'), null)).toBe('en_curso');
    expect(estadoRuta(eventos('inicio_ruta'), undefined)).toBe('en_curso');
  });
});
