import { z } from 'zod';
import { idSchema } from './catalogos.ts';
import { interpretarHoraLocal } from './estado.ts';
import {
  OPCIONES_INCIDENTE,
  ORDEN_PASOS,
  requiereContador,
  type TipoEvento,
  type TipoIncidente,
} from './flujo.ts';

const ocurrioEnLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora invalidas');

/**
 * La captura manual registra algo que YA paso. Se compara contra el reloj del
 * servidor, nunca contra el del navegador del supervisor.
 */
function noEsFutura(ocurrioEnLocal: string): boolean {
  const instante = interpretarHoraLocal(ocurrioEnLocal);
  return instante !== null && instante.getTime() <= Date.now();
}

const MENSAJE_HORA_FUTURA = 'La hora no puede ser en el futuro';

// `ocurrioEnLocal` viene sin zona de un `datetime-local`: el servidor decide que
// es America/Mexico_City, y revalida `tipo` con `puedeRegistrar`.
export const eventoManualSchema = z
  .object({
    asignacionId: idSchema,
    tipo: z.enum(ORDEN_PASOS as [TipoEvento, ...TipoEvento[]]),
    ocurrioEnLocal: ocurrioEnLocalSchema,
    cantidad: z.number().int().min(0).optional(),
  })
  .superRefine((datos, ctx) => {
    if (requiereContador(datos.tipo) && datos.cantidad === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Captura la cantidad de personas.',
        path: ['cantidad'],
      });
    }
    if (!noEsFutura(datos.ocurrioEnLocal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: MENSAJE_HORA_FUTURA,
        path: ['ocurrioEnLocal'],
      });
    }
  });
export type EventoManual = z.infer<typeof eventoManualSchema>;

// El incidente NO entra en `eventoManualSchema`: ese esquema describe la
// secuencia y `fin_ruta_incidente` es la salida de emergencia, con razon obligatoria.
export const incidenteManualSchema = z
  .object({
    asignacionId: idSchema,
    ocurrioEnLocal: ocurrioEnLocalSchema,
    razonIncidente: z.enum(OPCIONES_INCIDENTE as [TipoIncidente, ...TipoIncidente[]], {
      message: 'Elige la razon del incidente',
    }),
  })
  .superRefine((datos, ctx) => {
    if (!noEsFutura(datos.ocurrioEnLocal)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: MENSAJE_HORA_FUTURA,
        path: ['ocurrioEnLocal'],
      });
    }
  });
export type IncidenteManual = z.infer<typeof incidenteManualSchema>;
