'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts): su carga de
// `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Import de solo efecto.
import '@/lib/env';
import { idSchema, paradaCrearSchema, paradaEditarSchema, type Resultado } from '@rutas/shared';
import { db, parada } from '@rutas/shared/db';
import { and, eq, isNull } from 'drizzle-orm';
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

// El borrado es logico (`deleted_at`), igual que cliente/camion: una parada
// borrada desaparece de aqui (y por tanto del selector de "nueva ruta"), pero
// una ruta que ya la referencia sigue resolviendo su nombre via `innerJoin`
// en listarRutas(), que no filtra por deleted_at. La FK `restrict` de
// `ruta.parada_inicio_id`/`parada_fin_id` solo protege contra un DELETE real,
// que este modulo nunca emite.
export async function listarParadas() {
  return db.select().from(parada).where(isNull(parada.deletedAt)).orderBy(parada.nombre);
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

  // `isNull(deleted_at)`, igual que borrarParada abajo: editar una parada ya
  // borrada respondia `ok` y la revivia a medias en la bitacora, sobre una
  // fila que ninguna pantalla vuelve a mostrar.
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

  const [antes] = await db
    .select()
    .from(parada)
    .where(and(eq(parada.id, parseo.data), isNull(parada.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADA;
  }

  await db.transaction(async (tx) => {
    await tx.update(parada).set({ deletedAt: new Date() }).where(eq(parada.id, parseo.data));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'borrar',
      recurso: { tipo: 'parada', id: parseo.data },
      antes: { nombre: antes.nombre, direccion: antes.direccion, lat: antes.lat, lng: antes.lng },
    });
  });

  revalidatePath('/paradas');
  revalidatePath('/rutas');
  return { ok: true, data: { id: parseo.data } };
}
