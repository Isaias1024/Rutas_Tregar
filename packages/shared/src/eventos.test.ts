import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eventoManualSchema, incidenteManualSchema } from './eventos.ts';

// La captura manual del supervisor tiene DOS entradas, no una: la secuencia
// (`eventoManualSchema`) y la salida por incidente (`incidenteManualSchema`).
// Estas pruebas fijan esa separacion — si alguien la colapsa en un solo
// esquema, aqui se nota.

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
    // zod ignora las llaves extra por defecto: lo que se fija aqui es que
    // `cantidad` no forma parte del tipo de salida, no que el parseo falle.
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
});
