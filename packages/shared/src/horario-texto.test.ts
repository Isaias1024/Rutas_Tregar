import { describe, expect, it } from 'vitest';
import { horaEsperadaTexto, horaInstanteTexto } from './horario-texto.ts';

describe('horaEsperadaTexto', () => {
  it('medianoche es 12:00 AM, no 0:00', () => {
    expect(horaEsperadaTexto('00:00:00')).toBe('12:00 AM');
  });

  it('mediodia es 12:00 PM, no 0:00', () => {
    expect(horaEsperadaTexto('12:00:00')).toBe('12:00 PM');
  });

  it('mañana', () => {
    expect(horaEsperadaTexto('04:00:00')).toBe('4:00 AM');
  });

  it('tarde, sin arrastrar el PM de las 12 (14:00 no es 2:00 PM PM)', () => {
    expect(horaEsperadaTexto('14:00:00')).toBe('2:00 PM');
  });

  it('acepta HH:mm sin segundos', () => {
    expect(horaEsperadaTexto('18:45')).toBe('6:45 PM');
  });
});

describe('horaInstanteTexto', () => {
  it('convierte un instante UTC a 12h en la zona operativa', () => {
    // 2026-08-10T12:30:00Z = 06:30 en America/Mexico_City (UTC-6 en agosto).
    expect(horaInstanteTexto(new Date('2026-08-10T12:30:00.000Z'))).toBe('6:30 AM');
  });

  it('acepta un timestamp en ms', () => {
    const ms = new Date('2026-08-10T20:00:00.000Z').getTime(); // 14:00 local
    expect(horaInstanteTexto(ms)).toBe('2:00 PM');
  });
});
