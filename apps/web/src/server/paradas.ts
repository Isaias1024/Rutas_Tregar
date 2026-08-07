'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import { paradaCrearSchema, type Resultado } from '@rutas/shared';
import { db, parada } from '@rutas/shared/db';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { obtenerUsuarioActual } from '@/server/sesion';

// Igual que catalogos.ts: parsear con zod -> can() -> transaccion -> escribir
// -> registrarAuditoria (misma tx) -> cerrar.

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para administrar paradas.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'gestionar_rutas_paradas')) {
    return null;
  }
  return actor;
}

// `parada` no tiene borrado logico (§4): no se borra desde el paso 6, solo se
// crea y se lista. Una parada referenciada por una ruta activa se protege por
// la FK `restrict` de `ruta.parada_inicio_id`/`parada_fin_id`.
export async function listarParadas() {
  return db.select().from(parada).orderBy(parada.nombre);
}

export async function crearParada(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = paradaCrearSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(parada).values({ id, ...parseo.data });
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'crear',
      recurso: { tipo: 'parada', id },
      despues: parseo.data,
    });
  });

  revalidatePath('/paradas');
  revalidatePath('/rutas');
  return { ok: true, data: { id } };
}
