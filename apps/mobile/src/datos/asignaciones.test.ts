import {
  agruparPorDia,
  type AsignacionDetallada,
  resolverAsignaciones,
  sumarDias,
} from './asignaciones';

function crearAsignacion(overrides: Partial<AsignacionDetallada> = {}): AsignacionDetallada {
  return {
    id: 'a1',
    fecha: '2026-08-10',
    secuencia: 1,
    camionCodigo: 'T23',
    canceladaEn: null,
    eventos: [],
    horario: {
      id: 'h1',
      turno: 'manana',
      horaInicioEsperada: '06:00:00',
      horaFinEsperada: '07:00:00',
      ruta: {
        id: 'r1',
        nombre: 'Centro - Planta Norte',
        paradaInicio: { nombre: 'Terminal Centro', direccion: 'Av. Colon 100' },
        paradaFin: { nombre: 'Planta Norte', direccion: 'Carr. Saltillo km 12' },
      },
    },
    ...overrides,
  };
}

describe('agruparPorDia', () => {
  it('agrupa una ruta a las 23:30 en su propio dia operativo, no en el siguiente', () => {
    const temprana = crearAsignacion({ id: 'a-temprana' });
    const tardia = crearAsignacion({
      id: 'a-2330',
      horario: { ...crearAsignacion().horario, id: 'h2', horaInicioEsperada: '23:30:00' },
    });

    const grupos = agruparPorDia([temprana, tardia]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.fecha).toBe('2026-08-10');
    expect(grupos[0]?.asignaciones.map((a) => a.id)).toEqual(['a-temprana', 'a-2330']);
  });

  it('ordena dentro del dia por hora de inicio esperada', () => {
    const tarde = crearAsignacion({
      id: 'a-tarde',
      horario: { ...crearAsignacion().horario, id: 'h-tarde', horaInicioEsperada: '14:00:00' },
    });
    const temprano = crearAsignacion({
      id: 'a-temprano',
      horario: { ...crearAsignacion().horario, id: 'h-temprano', horaInicioEsperada: '05:00:00' },
    });

    const grupos = agruparPorDia([tarde, temprano]);

    expect(grupos[0]?.asignaciones.map((a) => a.id)).toEqual(['a-temprano', 'a-tarde']);
  });

  it('ordena los grupos por fecha ascendente', () => {
    const diaSiguiente = crearAsignacion({ id: 'a-dia-siguiente', fecha: '2026-08-11' });
    const diaAnterior = crearAsignacion({ id: 'a-dia-anterior', fecha: '2026-08-09' });

    const grupos = agruparPorDia([diaSiguiente, diaAnterior]);

    expect(grupos.map((g) => g.fecha)).toEqual(['2026-08-09', '2026-08-11']);
  });

  it('sin asignaciones no produce ningun grupo', () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});

describe('sumarDias', () => {
  it('suma dias dentro del mismo mes', () => {
    expect(sumarDias('2026-08-10', 1)).toBe('2026-08-11');
  });

  it('cruza el fin de mes correctamente', () => {
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('con 0 dias devuelve la misma fecha', () => {
    expect(sumarDias('2026-08-10', 0)).toBe('2026-08-10');
  });
});

describe('resolverAsignaciones', () => {
  it('consulta la red, guarda en cache y devuelve los datos frescos', async () => {
    const datos = [crearAsignacion()];
    const guardados: Record<string, AsignacionDetallada[]> = {};

    const resultado = await resolverAsignaciones('2026-08-10', '2026-08-10', async () => datos, {
      leer: async (clave) => guardados[clave] ?? [],
      guardar: async (clave, valor) => {
        guardados[clave] = valor;
      },
    });

    expect(resultado).toEqual(datos);
    expect(guardados['2026-08-10_2026-08-10']).toEqual(datos);
  });

  it('lee del cache local cuando la consulta de red falla', async () => {
    const cacheado = [crearAsignacion({ id: 'a-cache' })];

    const resultado = await resolverAsignaciones(
      '2026-08-10',
      '2026-08-10',
      async () => {
        throw new Error('sin red');
      },
      {
        leer: async () => cacheado,
        guardar: async () => {},
      },
    );

    expect(resultado).toEqual(cacheado);
  });

  it('devuelve un arreglo vacio si la red falla y no hay nada en cache', async () => {
    const resultado = await resolverAsignaciones(
      '2026-08-10',
      '2026-08-10',
      async () => {
        throw new Error('sin red');
      },
      {
        leer: async () => [],
        guardar: async () => {},
      },
    );

    expect(resultado).toEqual([]);
  });

  it('no guarda en cache cuando la consulta de red falla', async () => {
    let seLlamoGuardar = false;

    await resolverAsignaciones(
      '2026-08-10',
      '2026-08-10',
      async () => {
        throw new Error('sin red');
      },
      {
        leer: async () => [],
        guardar: async () => {
          seLlamoGuardar = true;
        },
      },
    );

    expect(seLlamoGuardar).toBe(false);
  });
});
