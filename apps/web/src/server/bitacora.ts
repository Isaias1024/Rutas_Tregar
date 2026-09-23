'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
import '@/lib/env';
import { auditLog, db, perfilPersonal, usuario } from '@rutas/shared/db';
import { and, desc, eq, lt } from 'drizzle-orm';

// Sin `can()` propio (mismo patron que monitor.ts y reportes.ts): `proxy.ts` ya
// gatea `/bitacora` bajo PREFIJOS_ADMIN.

const LIMITE_DEFAULT = 50;
const LIMITE_MAXIMO = 200;

export interface FilaBitacora {
  id: number;
  actorId: string;
  actorNombre: string | null;
  actorCredencial: string;
  accion: string;
  recursoTipo: string;
  recursoId: string;
  antes: unknown;
  despues: unknown;
  createdAt: Date;
}

export interface PaginaBitacora {
  filas: FilaBitacora[];
  cursorSiguiente: string | null;
}

export interface FiltrosBitacora {
  cursor?: string;
  limite?: number;
  recursoTipo?: string;
  actorId?: string;
}

/**
 * Cursor sobre `id` solo: `audit_log.id` es un `bigserial` que crece en el mismo
 * orden que `created_at`, asi que no hace falta el segundo campo para desempatar.
 */
export async function listarBitacora(filtros: FiltrosBitacora = {}): Promise<PaginaBitacora> {
  const limite = Math.min(filtros.limite ?? LIMITE_DEFAULT, LIMITE_MAXIMO);
  const condiciones = [];
  if (filtros.recursoTipo) {
    condiciones.push(eq(auditLog.recursoTipo, filtros.recursoTipo));
  }
  if (filtros.actorId) {
    condiciones.push(eq(auditLog.actorId, filtros.actorId));
  }
  if (filtros.cursor) {
    const idCursor = Number(filtros.cursor);
    if (!Number.isNaN(idCursor)) {
      condiciones.push(lt(auditLog.id, idCursor));
    }
  }

  const filas = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorNombre: perfilPersonal.nombre,
      actorCredencial: usuario.credencial,
      accion: auditLog.accion,
      recursoTipo: auditLog.recursoTipo,
      recursoId: auditLog.recursoId,
      antes: auditLog.antes,
      despues: auditLog.despues,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(usuario, eq(usuario.id, auditLog.actorId))
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, auditLog.actorId))
    .where(condiciones.length > 0 ? and(...condiciones) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limite + 1);

  const hayMas = filas.length > limite;
  const pagina = hayMas ? filas.slice(0, limite) : filas;
  const ultima = pagina[pagina.length - 1];

  return {
    filas: pagina,
    cursorSiguiente: hayMas && ultima ? String(ultima.id) : null,
  };
}

export interface ActorFiltro {
  id: string;
  nombre: string | null;
  credencial: string;
}

/** Alimenta el selector de actor; incluye dados de baja: sus filas siguen en la bitacora. */
export async function listarActoresParaFiltro(): Promise<ActorFiltro[]> {
  return db
    .select({ id: usuario.id, nombre: perfilPersonal.nombre, credencial: usuario.credencial })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .orderBy(usuario.credencial);
}
