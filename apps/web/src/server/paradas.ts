'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` corre antes de que `@rutas/shared/db` lea DATABASE_URL.
import '@/lib/env';
import { idSchema, paradaCrearSchema, paradaEditarSchema, type Resultado } from '@rutas/shared';
import { db, parada } from '@rutas/shared/db';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import { registrarAuditoria } from '@/lib/audit/registrar';
import {
  borrarParadaNucleo,
  type RutaQueUsaParada,
  rutasQueUsanParada,
} from '@/server/paradas-nucleo';
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

const NO_ENCONTRADA: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'La parada no existe.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'gestionar_rutas_paradas')) {
    return null;
  }
  return actor;
}

// Borrado logico: la parada sale del selector, pero una ruta que ya la referencia
// sigue resolviendo su nombre porque `listarRutas` no filtra por `deleted_at`.
export async function listarParadas() {
  return db.select().from(parada).where(isNull(parada.deletedAt)).orderBy(parada.nombre);
}

/**
 * Para la advertencia previa a editar una parada. Lleva su `can()` propio aunque
 * solo lea: en un archivo `'use server'` cada export es un endpoint RPC.
 */
export async function consultarRutasQueUsanParada(
  input: unknown,
): Promise<Resultado<RutaQueUsaParada[]>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  return { ok: true, data: await rutasQueUsanParada(parseo.data) };
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

export async function editarParada(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = paradaEditarSchema.safeParse(input);
  if (!parseo.success) {
    const primero = parseo.error.issues[0];
    return errorValidacion(primero?.message ?? 'Entrada invalida', primero?.path[0]?.toString());
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  // `isNull(deleted_at)`, igual que borrarParada: editar una parada ya borrada
  // respondia `ok` y la revivia a medias en la bitacora.
  const [antes] = await db
    .select()
    .from(parada)
    .where(and(eq(parada.id, parseo.data.id), isNull(parada.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADA;
  }

  const { id, ...datos } = parseo.data;
  await db.transaction(async (tx) => {
    await tx.update(parada).set(datos).where(eq(parada.id, id));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'editar',
      recurso: { tipo: 'parada', id },
      antes: { nombre: antes.nombre, direccion: antes.direccion, lat: antes.lat, lng: antes.lng },
      despues: datos,
    });
  });

  revalidatePath('/paradas');
  revalidatePath('/rutas');
  return { ok: true, data: { id } };
}

export async function borrarParada(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await borrarParadaNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/paradas');
    revalidatePath('/rutas');
  }
  return resultado;
}
