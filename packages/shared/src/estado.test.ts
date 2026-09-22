import { describe, expect, it } from 'vitest';
import {
  derivarEstado,
  distanciaEnMetros,
  type EventoParaEstado,
  interpretarHoraLocal,
  ubicacionEsCorrecta,
} from './estado.ts';

const HORA_ESPERADA = '06:00:00';
const AHORA = new Date('2026-08-10T13:00:00.000Z'); // 07:00 America/Mexico_City

function eventoInicioRuta(
  ocurrioEnLocal: string,
  recibidoEnLocal = ocurrioEnLocal,
): EventoParaEstado {
  return {
    tipo: 'inicio_ruta',
    ocurrioEn: `2026-08-10T${ocurrioEnLocal}:00.000-06:00`,
    recibidoEn: `2026-08-10T${recibidoEnLocal}:00.000-06:00`,
  };
}

function eventoRetorno(ocurrioEnLocal: string): EventoParaEstado {
  return {
    tipo: 'retorno',
    ocurrioEn: `2026-08-10T${ocurrioEnLocal}:00.000-06:00`,
    recibidoEn: `2026-08-10T${ocurrioEnLocal}:00.000-06:00`,
  };
}

describe('derivarEstado', () => {
  it('sin eventos: pendiente', () => {
    const resultado = derivarEstado({ eventos: [], horaEsperada: HORA_ESPERADA, ahora: AHORA });
    expect(resultado.estado).toBe('pendiente');
    expect(resultado.sospechoso).toBe(false);
  });

  it('con vio_ruta pero sin inicio_ruta: en_curso', () => {
    const resultado = derivarEstado({
      eventos: [
        {
          tipo: 'vio_ruta',
          ocurrioEn: '2026-08-10T05:50:00.000-06:00',
          recibidoEn: '2026-08-10T05:50:00.000-06:00',
        },
      ],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('en_curso');
  });

  it('inicio_ruta sin retorno: en_curso, con la puntualidad de arranque aparte', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:25')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('en_curso');
    expect(resultado.puntualidadInicio).toBe('tarde');
  });

  it('inicio_ruta 4 minutos despues de la hora esperada + retorno: a tiempo', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:04'), eventoRetorno('07:00')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('a_tiempo');
    expect(resultado.puntualidadInicio).toBe('a_tiempo');
  });

  it('inicio_ruta 25 minutos despues de la hora esperada + retorno: tarde', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:25'), eventoRetorno('07:00')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('tarde');
    expect(resultado.puntualidadInicio).toBe('tarde');
  });

  it('inicio_ruta 20 minutos antes de la hora esperada + retorno: adelantado', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('05:40'), eventoRetorno('07:00')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('adelantado');
    expect(resultado.puntualidadInicio).toBe('adelantado');
  });

  it('borde exacto +10: sigue siendo a tiempo (mas de +10 es tarde, no +10 mismo)', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:10'), eventoRetorno('07:00')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('a_tiempo');
  });

  it('borde exacto -15: sigue siendo a tiempo (menos de -15 es adelantado, no -15 mismo)', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('05:45'), eventoRetorno('07:00')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('a_tiempo');
  });

  it('marca sospechoso cuando ocurrio_en y recibido_en difieren mas del umbral y llego en vivo', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:04', '06:20')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.sospechoso).toBe(true);
  });

  it('no marca sospechoso cuando la diferencia esta dentro del umbral', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:04', '06:06')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.sospechoso).toBe(false);
  });

  it('no marca sospechoso si el evento no llego en vivo (se evalua mucho despues de recibido)', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:04', '06:20')],
      horaEsperada: HORA_ESPERADA,
      ahora: new Date('2026-08-11T13:00:00.000Z'), // un dia despues
    });
    expect(resultado.sospechoso).toBe(false);
  });

  it('con fin_ruta_incidente despues de inicio_ruta: incidente, no en_curso ni puntualidad', () => {
    // Antes de esta correccion solo se miraba `inicio_ruta` y se devolvia la
    // puntualidad normal, escondiendo que la ruta ya habia cerrado por incidente.
    const resultado = derivarEstado({
      eventos: [
        eventoInicioRuta('06:04'),
        {
          tipo: 'fin_ruta_incidente',
          ocurrioEn: '2026-08-10T06:30:00.000-06:00',
          recibidoEn: '2026-08-10T06:30:00.000-06:00',
        },
      ],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('incidente');
    expect(resultado.sospechoso).toBe(false);
  });

  it('con fin_ruta_incidente sin inicio_ruta (nunca arranco): incidente, no en_curso', () => {
    const resultado = derivarEstado({
      eventos: [
        {
          tipo: 'vio_ruta',
          ocurrioEn: '2026-08-10T05:50:00.000-06:00',
          recibidoEn: '2026-08-10T05:50:00.000-06:00',
        },
        {
          tipo: 'fin_ruta_incidente',
          ocurrioEn: '2026-08-10T05:55:00.000-06:00',
          recibidoEn: '2026-08-10T05:55:00.000-06:00',
        },
      ],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('incidente');
  });
});

describe('distanciaEnMetros / ubicacionEsCorrecta', () => {
  // Dos puntos en Monterrey: uno a ~50m de la parada (dentro del umbral de
  // 100m) y otro a varios kilometros (claramente fuera).
  const PARADA_LAT = 25.6866;
  const PARADA_LNG = -100.3161;
  const CERCA_LAT = 25.68705;
  const CERCA_LNG = -100.3161;
  const LEJOS_LAT = 25.72;
  const LEJOS_LNG = -100.35;

  it('distancia cero entre el mismo punto', () => {
    expect(distanciaEnMetros(PARADA_LAT, PARADA_LNG, PARADA_LAT, PARADA_LNG)).toBe(0);
  });

  it('ubicacion correcta dentro del umbral', () => {
    expect(ubicacionEsCorrecta(CERCA_LAT, CERCA_LNG, PARADA_LAT, PARADA_LNG)).toBe(true);
  });

  it('ubicacion incorrecta fuera del umbral', () => {
    expect(ubicacionEsCorrecta(LEJOS_LAT, LEJOS_LNG, PARADA_LAT, PARADA_LNG)).toBe(false);
  });

  it('undefined si falta alguna coordenada (sin GPS, o la parada no la trae)', () => {
    expect(ubicacionEsCorrecta(null, null, PARADA_LAT, PARADA_LNG)).toBeUndefined();
    expect(ubicacionEsCorrecta(CERCA_LAT, CERCA_LNG, undefined, undefined)).toBeUndefined();
  });
});

describe('interpretarHoraLocal', () => {
  it('interpreta un texto de datetime-local como instante en America/Mexico_City', () => {
    // `getTime()` compara el instante real, sin depender de en que formato de
    // zona lo imprima TZDate.
    const instante = interpretarHoraLocal('2026-08-10T06:30');
    expect(instante?.getTime()).toBe(new Date('2026-08-10T12:30:00.000Z').getTime());
  });

  it('devuelve null si el texto no trae fecha y hora completas', () => {
    expect(interpretarHoraLocal('2026-08-10')).toBeNull();
    expect(interpretarHoraLocal('')).toBeNull();
    expect(interpretarHoraLocal('no es una fecha')).toBeNull();
  });
});
