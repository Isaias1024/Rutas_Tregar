import { randomUUID } from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import { describe, expect, it } from 'vitest';
import { ZONA_OPERATIVA } from './estado.ts';
import { eventoManualSchema, incidenteManualSchema } from './eventos.ts';

// La captura manual tiene DOS entradas: la secuencia y la salida por incidente.
// Si alguien las colapsa en un solo esquema, aqui se nota.

/** 'YYYY-MM-DDTHH:mm' en America/Mexico_City, `minutos` desde ahora (negativo = pasado). */
function horaLocalRelativa(minutos: number): string {
  const instante = new TZDate(Date.now() + minutos * 60_000, ZONA_OPERATIVA);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${instante.getFullYear()}-${pad(instante.getMonth() + 1)}-${pad(instante.getDate())}T${pad(instante.getHours())}:${pad(instante.getMinutes())}`;
}

describe('eventoManualSchema — solo la secuencia', () => {
  it('acepta un paso de ORDEN_PASOS', () => {
    const parseo = eventoManualSchema.safeParse({
      asignacionId: randomUUID(),
      tipo: 'inicio_ruta',
      ocurrioEnLocal: '2026-08-18T06:15',
    });
    expect(parseo.success).toBe(true);
  });

  it('rechaza fin_ruta_incidente: no pertenece a la secuencia y tiene su propia entrada', () => {
    const parseo = eventoManualSchema.safeParse({
      asignacionId: randomUUID(),
      tipo: 'fin_ruta_incidente',
      ocurrioEnLocal: '2026-08-18T06:15',
    });
    expect(parseo.success).toBe(false);
  });

  it('exige cantidad en los pasos que llevan contador', () => {
    const parseo = eventoManualSchema.safeParse({
      asignacionId: randomUUID(),
      tipo: 'fin_ruta',
      ocurrioEnLocal: '2026-08-18T07:00',
    });
    expect(parseo.success).toBe(false);
    if (!parseo.success) {
      expect(parseo.error.issues[0]?.path).toContain('cantidad');
    }
  });

  it('rechaza una hora en el futuro: la captura manual registra algo que ya paso', () => {
    const parseo = eventoManualSchema.safeParse({
      asignacionId: randomUUID(),
      tipo: 'vio_ruta',
      ocurrioEnLocal: horaLocalRelativa(30),
    });
    expect(parseo.success).toBe(false);
    if (!parseo.success) {
      expect(parseo.error.issues.some((i) => i.path.includes('ocurrioEnLocal'))).toBe(true);
    }
  });

  it('acepta el instante exacto de ahora y cualquier hora pasada', () => {
    expect(
      eventoManualSchema.safeParse({
        asignacionId: randomUUID(),
        tipo: 'vio_ruta',
        ocurrioEnLocal: horaLocalRelativa(0),
      }).success,
    ).toBe(true);
    expect(
      eventoManualSchema.safeParse({
        asignacionId: randomUUID(),
        tipo: 'vio_ruta',
        ocurrioEnLocal: horaLocalRelativa(-30),
      }).success,
    ).toBe(true);
  });
});

describe('incidenteManualSchema — la salida por incidente', () => {
  it('acepta una razon valida', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
      razonIncidente: 'choque',
    });
    expect(parseo.success).toBe(true);
  });

  it('exige la razon: es lo unico que este evento pide y ningun hito normal pide', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
    });
    expect(parseo.success).toBe(false);
    if (!parseo.success) {
      expect(parseo.error.issues[0]?.path).toContain('razonIncidente');
    }
  });

  it('rechaza una razon que no esta en el catalogo', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
      razonIncidente: 'se_poncho_una_llanta',
    });
    expect(parseo.success).toBe(false);
  });

  it('no acepta un contador: cerrar por incidente no cuenta personas', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '2026-08-18T06:40',
      razonIncidente: 'trafico',
      cantidad: 12,
    });
    // zod ignora las llaves extra: lo que se fija es que `cantidad` no forma
    // parte del tipo de salida, no que el parseo falle.
    expect(parseo.success).toBe(true);
    if (parseo.success) {
      expect('cantidad' in parseo.data).toBe(false);
    }
  });

  it('rechaza una hora sin el formato del input datetime-local', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: '18/08/2026 06:40',
      razonIncidente: 'otro',
    });
    expect(parseo.success).toBe(false);
  });

  it('rechaza una hora en el futuro: mismo criterio que eventoManualSchema', () => {
    const parseo = incidenteManualSchema.safeParse({
      asignacionId: randomUUID(),
      ocurrioEnLocal: horaLocalRelativa(45),
      razonIncidente: 'choque',
    });
    expect(parseo.success).toBe(false);
    if (!parseo.success) {
      expect(parseo.error.issues.some((i) => i.path.includes('ocurrioEnLocal'))).toBe(true);
    }
  });
});
