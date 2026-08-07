import { z } from 'zod';
import { idSchema } from './catalogos.ts';
import { ORDEN_PASOS, type TipoEvento } from './flujo.ts';

// El unico esquema de entrada del paso 12: la captura manual del supervisor.
// `ocurrioEnLocal` viene tal cual de un <input type="datetime-local"> —
// 'YYYY-MM-DDTHH:mm', sin zona — porque el servidor es quien decide que esa
// hora es America/Mexico_City, nunca la zona del host que la procesa.

export const eventoManualSchema = z.object({
  asignacionId: idSchema,
  tipo: z.enum(ORDEN_PASOS as [TipoEvento, ...TipoEvento[]]),
  ocurrioEnLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora invalidas'),
});
export type EventoManual = z.infer<typeof eventoManualSchema>;
