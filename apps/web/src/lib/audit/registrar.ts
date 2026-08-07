import { auditLog, type db } from '@rutas/shared/db';

/**
 * El tipo exacto de transaccion que produce `db.transaction(async (tx) => ...)`.
 * `registrarAuditoria` SIEMPRE recibe ese `tx`; jamas abre una conexion propia.
 */
type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface EntradaAuditoria {
  actor: string;
  accion: string;
  recurso: { tipo: string; id: string };
  antes?: unknown;
  despues?: unknown;
  ip?: string;
}

/**
 * Escribe una fila en `audit_log` **dentro de la transaccion de quien llama**.
 * Es lo que garantiza que la bitacora y la mutacion se apliquen o fallen
 * juntas: si este insert viola una restriccion (por ejemplo, un `actor` sin
 * fila en `usuario`), la transaccion completa se revierte y la mutacion que
 * la origino tampoco queda aplicada.
 */
export async function registrarAuditoria(
  tx: Transaccion,
  entrada: EntradaAuditoria,
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entrada.actor,
    accion: entrada.accion,
    recursoTipo: entrada.recurso.tipo,
    recursoId: entrada.recurso.id,
    antes: entrada.antes ?? null,
    despues: entrada.despues ?? null,
    ip: entrada.ip ?? null,
  });
}
