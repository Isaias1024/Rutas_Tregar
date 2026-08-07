import { z } from 'zod';
import { idSchema } from './catalogos.ts';

// Esquema de entrada del paso 15 compartido entre el panel (que dispara la
// peticion) y el worker (que la recibe en POST /reportes/pdf).

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha invalida (YYYY-MM-DD)');

export const reportePdfSchema = z
  .object({
    clienteId: idSchema,
    desde: fechaSchema,
    hasta: fechaSchema,
  })
  .refine((datos) => datos.desde <= datos.hasta, {
    message: '"desde" no puede ser posterior a "hasta"',
    path: ['hasta'],
  });
export type ReportePdf = z.infer<typeof reportePdfSchema>;
