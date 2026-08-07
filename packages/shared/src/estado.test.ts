import { describe, expect, it } from 'vitest';
import { derivarEstado, type EventoParaEstado } from './estado.ts';

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

  it('inicio_ruta 4 minutos despues de la hora esperada: a tiempo', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:04')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('a_tiempo');
  });

  it('inicio_ruta 25 minutos despues de la hora esperada: tarde', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:25')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('tarde');
  });

  it('inicio_ruta 20 minutos antes de la hora esperada: adelantado', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('05:40')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('adelantado');
  });

  it('borde exacto +10: sigue siendo a tiempo (mas de +10 es tarde, no +10 mismo)', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('06:10')],
      horaEsperada: HORA_ESPERADA,
      ahora: AHORA,
    });
    expect(resultado.estado).toBe('a_tiempo');
  });

  it('borde exacto -15: sigue siendo a tiempo (menos de -15 es adelantado, no -15 mismo)', () => {
    const resultado = derivarEstado({
      eventos: [eventoInicioRuta('05:45')],
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
});
