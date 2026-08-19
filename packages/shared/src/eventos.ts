import { z } from 'zod';
import { idSchema } from './catalogos.ts';
import {
  OPCIONES_INCIDENTE,
  ORDEN_PASOS,
  requiereContador,
  type TipoEvento,
  type TipoIncidente,
} from './flujo.ts';

// El unico esquema de entrada del paso 12: la captura manual del supervisor.
// `ocurrioEnLocal` viene tal cual de un <input type="datetime-local"> —
// 'YYYY-MM-DDTHH:mm', sin zona — porque el servidor es quien decide que esa
// hora es America/Mexico_City, nunca la zona del host que la procesa.
//
// `tipo` sigue siendo parte del payload (el servidor lo vuelve a validar
// contra `puedeRegistrar`, no confia en lo que mande el cliente), pero la
// pantalla ya no deja elegirlo: solo ofrece el siguiente paso de la
// secuencia (§ Eventos en Vivo — registro manual).
export const eventoManualSchema = z
  .object({
    asignacionId: idSchema,
    tipo: z.enum(ORDEN_PASOS as [TipoEvento, ...TipoEvento[]]),
    ocurrioEnLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora invalidas'),
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
  });
export type EventoManual = z.infer<typeof eventoManualSchema>;

// El incidente NO entra en `eventoManualSchema`: ese esquema describe la
// secuencia, y `fin_ruta_incidente` es la salida de emergencia, no un paso.
// Mezclarlos obligaria a `tipo` a aceptar un valor que `siguientePaso()`
// jamas propone y a `cantidad` a volverse condicional por partida doble.
// Son dos entradas distintas porque son dos acciones distintas: una avanza
// la ruta, la otra la cierra sin completarla y exige una razon.
export const incidenteManualSchema = z.object({
  asignacionId: idSchema,
  ocurrioEnLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora invalidas'),
  razonIncidente: z.enum(OPCIONES_INCIDENTE as [TipoIncidente, ...TipoIncidente[]], {
    message: 'Elige la razon del incidente',
  }),
});
export type IncidenteManual = z.infer<typeof incidenteManualSchema>;
