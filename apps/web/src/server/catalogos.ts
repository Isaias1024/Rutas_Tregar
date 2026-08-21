'use server';

// `@/lib/env` importa primero A PROPOSITO (ver invitacion.ts y proxy.ts):
// su carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse. Ademas de ese efecto, este
// archivo si lee `env.GOOGLE_OAUTH_ALLOWED_DOMAIN` en `crearSupervisor`.
import { env } from '@/lib/env';
import {
  camionCrearSchema,
  camionEditarSchema,
  choferCrearSchema,
  choferEditarSchema,
  clienteCrearSchema,
  clienteEditarSchema,
  idSchema,
  type Resultado,
  supervisorCrearSchema,
} from '@rutas/shared';
import { camion, cliente, db, perfilPersonal, usuario } from '@rutas/shared/db';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dominioDe } from '@/lib/auth/invitacion';
import { can } from '@/lib/authz/can';
import { registrarAuditoria } from '@/lib/audit/registrar';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { borrarClienteNucleo } from '@/server/clientes-nucleo';
import {
  liberarYAuditar,
  listarChoferesConCamion,
  type RutaActivaDeChofer,
  rutasActivasDeChofer,
} from '@/server/choferes-nucleo';
import { obtenerUsuarioActual } from '@/server/sesion';

// Cada mutacion sigue el orden obligatorio: parsear con zod -> can() ->
// transaccion -> escribir -> registrarAuditoria (misma tx) -> cerrar.

function errorValidacion(mensaje: string, campo?: string): Resultado<never> {
  return { ok: false, error: { codigo: 'validacion', mensaje, campo } };
}

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para administrar catalogos.' },
};

const NO_ENCONTRADO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_encontrado', mensaje: 'El recurso no existe o ya fue borrado.' },
};

async function actorAutorizado() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'gestionar_catalogos')) {
    return null;
  }
  return actor;
}

// === cliente ======================================================================

export async function listarClientes() {
  return db.select().from(cliente).where(isNull(cliente.deletedAt)).orderBy(cliente.nombre);
}

export async function crearCliente(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = clienteCrearSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida', 'nombre');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(cliente).values({ id, nombre: parseo.data.nombre });
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'crear',
      recurso: { tipo: 'cliente', id },
      despues: parseo.data,
    });
  });

  revalidatePath('/catalogos/clientes');
  return { ok: true, data: { id } };
}

export async function editarCliente(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = clienteEditarSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const [antes] = await db
    .select()
    .from(cliente)
    .where(and(eq(cliente.id, parseo.data.id), isNull(cliente.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(cliente)
      .set({ nombre: parseo.data.nombre, activo: parseo.data.activo })
      .where(eq(cliente.id, parseo.data.id));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'editar',
      recurso: { tipo: 'cliente', id: parseo.data.id },
      antes: { nombre: antes.nombre, activo: antes.activo },
      despues: { nombre: parseo.data.nombre, activo: parseo.data.activo },
    });
  });

  revalidatePath('/catalogos/clientes');
  return { ok: true, data: { id: parseo.data.id } };
}

export async function borrarCliente(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const resultado = await borrarClienteNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/catalogos/clientes');
  }
  return resultado;
}

// === camion =========================================================================

export async function listarCamiones() {
  return db.select().from(camion).where(isNull(camion.deletedAt)).orderBy(camion.codigo);
}

export async function crearCamion(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = camionCrearSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(camion).values({ id, ...parseo.data });
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'crear',
      recurso: { tipo: 'camion', id },
      despues: parseo.data,
    });
  });

  revalidatePath('/catalogos/camiones');
  return { ok: true, data: { id } };
}

export async function editarCamion(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = camionEditarSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const [antes] = await db
    .select()
    .from(camion)
    .where(and(eq(camion.id, parseo.data.id), isNull(camion.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  const { id, ...cambios } = parseo.data;
  await db.transaction(async (tx) => {
    await tx.update(camion).set(cambios).where(eq(camion.id, id));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'editar',
      recurso: { tipo: 'camion', id },
      antes: {
        codigo: antes.codigo,
        tipo: antes.tipo,
        placas: antes.placas,
        km: antes.km,
        estado: antes.estado,
      },
      despues: cambios,
    });
  });

  revalidatePath('/catalogos/camiones');
  return { ok: true, data: { id } };
}

export async function borrarCamion(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  // Mismo `isNull(deleted_at)` que en borrarCliente, por la misma razon.
  const [antes] = await db
    .select()
    .from(camion)
    .where(and(eq(camion.id, parseo.data), isNull(camion.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  await db.transaction(async (tx) => {
    await tx.update(camion).set({ deletedAt: new Date() }).where(eq(camion.id, parseo.data));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'borrar',
      recurso: { tipo: 'camion', id: parseo.data },
      antes: { codigo: antes.codigo },
    });
  });

  revalidatePath('/catalogos/camiones');
  return { ok: true, data: { id: parseo.data } };
}

// === chofer (usuario + perfil_personal) ============================================

// Delega en choferes-nucleo.ts, que resuelve tambien el codigo del camion:
// el catalogo tiene que mostrar que camion trae cada chofer, porque desde el
// paso 8 de las reglas es aqui —y solo aqui— donde ese vinculo se elige.
export async function listarChoferes() {
  return listarChoferesConCamion();
}

/**
 * Las rutas de hoy en adelante de un chofer, para la advertencia previa a la
 * baja o al borrado. Este archivo es `'use server'`, asi que cada export es
 * un endpoint RPC invocable desde el navegador — por eso lleva su propio
 * `can()` aunque solo lea: son nombres de ruta y horarios de personal.
 */
export async function consultarRutasActivasDeChofer(
  input: unknown,
): Promise<Resultado<RutaActivaDeChofer[]>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  return { ok: true, data: await rutasActivasDeChofer(parseo.data) };
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function credencialBase(nombre: string): string {
  const partes = nombre
    .trim()
    .split(/\s+/)
    .map(normalizar)
    .filter((parte) => parte.length > 0);
  const base =
    partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : (partes[0] ?? 'chofer');
  return base.slice(0, 20) || 'chofer';
}

async function credencialDisponible(candidata: string): Promise<boolean> {
  const [fila] = await db
    .select({ id: usuario.id })
    .from(usuario)
    .where(eq(usuario.credencial, candidata))
    .limit(1);
  return !fila;
}

async function generarCredencialUnica(nombre: string): Promise<string> {
  const base = credencialBase(nombre);
  if (await credencialDisponible(base)) {
    return base;
  }
  for (let sufijo = 2; sufijo <= 50; sufijo++) {
    const candidata = `${base}${sufijo}`;
    if (await credencialDisponible(candidata)) {
      return candidata;
    }
  }
  throw new Error('No se pudo generar una credencial unica para el chofer.');
}

function generarPasswordTemporal(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let resultado = '';
  for (const byte of bytes) {
    resultado += alfabeto[byte % alfabeto.length];
  }
  return resultado;
}

export async function crearChofer(
  input: unknown,
): Promise<Resultado<{ id: string; credencial: string; passwordTemporal: string }>> {
  const parseo = choferCrearSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida', 'nombre');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const { nombre } = parseo.data;
  const correo = parseo.data.correo || undefined;
  const telefono = parseo.data.telefono || undefined;

  const credencial = await generarCredencialUnica(nombre);
  const passwordTemporal = generarPasswordTemporal();
  const correoSintetico = `${credencial}@choferes.rutas.local`;

  const { data: alta, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
    email: correoSintetico,
    password: passwordTemporal,
    email_confirm: true,
  });

  if (errorAuth || !alta.user) {
    return errorValidacion(
      `No se pudo crear la cuenta del chofer: ${errorAuth?.message ?? 'error desconocido'}`,
    );
  }

  const nuevoId = alta.user.id;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(usuario).values({
        id: nuevoId,
        credencial,
        rol: 'chofer',
        debeCambiarPassword: true,
      });
      await tx.insert(perfilPersonal).values({ usuarioId: nuevoId, nombre, correo, telefono });
      await registrarAuditoria(tx, {
        actor: actor.id,
        accion: 'crear',
        recurso: { tipo: 'usuario', id: nuevoId },
        despues: { credencial, rol: 'chofer', nombre },
      });
    });
  } catch (error) {
    // Si Postgres falla, no dejamos un usuario de Auth huerfano sin fila
    // en `usuario`: las dos escrituras tienen que quedar juntas o ninguna.
    await supabaseAdmin.auth.admin.deleteUser(nuevoId);
    throw error;
  }

  revalidatePath('/catalogos/choferes');
  return { ok: true, data: { id: nuevoId, credencial, passwordTemporal } };
}

export async function editarChofer(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = choferEditarSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  const [antes] = await db
    .select({
      activo: usuario.activo,
      camionId: usuario.camionId,
      nombre: perfilPersonal.nombre,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .where(
      and(eq(usuario.id, parseo.data.id), eq(usuario.rol, 'chofer'), isNull(usuario.deletedAt)),
    )
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  const { id, nombre, activo } = parseo.data;
  const correo = parseo.data.correo || null;
  const telefono = parseo.data.telefono || null;
  // `''` (el "sin camion" del `<select>`) y `null` significan lo mismo aqui:
  // soltar el camion. Se normalizan a `null` antes de tocar la columna.
  const camionId = parseo.data.camionId ? parseo.data.camionId : null;

  // El camion tiene que existir y no estar borrado. Sin esto, el planeador
  // resolveria mas tarde un `camion_id` colgado y respondia "este chofer no
  // tiene camion" sin explicar por que — el error pertenece a este formulario,
  // que es donde de verdad se eligio.
  if (camionId) {
    const [camionFila] = await db
      .select({ id: camion.id })
      .from(camion)
      .where(and(eq(camion.id, camionId), isNull(camion.deletedAt)))
      .limit(1);
    if (!camionFila) {
      return errorValidacion('El camion seleccionado no existe o fue borrado.', 'camionId');
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(usuario).set({ activo, camionId }).where(eq(usuario.id, id));
    await tx
      .update(perfilPersonal)
      .set({ nombre, correo, telefono, actualizadoEn: new Date() })
      .where(eq(perfilPersonal.usuarioId, id));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'editar',
      recurso: { tipo: 'usuario', id },
      antes: { nombre: antes.nombre, activo: antes.activo, camionId: antes.camionId },
      despues: { nombre, activo, camionId },
    });
  });

  revalidatePath('/catalogos/choferes');
  return { ok: true, data: { id } };
}

export async function borrarChofer(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorAutorizado();
  if (!actor) {
    return SIN_PERMISO;
  }

  // Mismo `isNull(deleted_at)` que en borrarCliente. Aqui ademas evita que un
  // borrado repetido pise el `deleted_at` original con una fecha nueva, que es
  // lo que sostiene el plazo de conservacion del historico.
  const [antes] = await db
    .select({ credencial: usuario.credencial })
    .from(usuario)
    .where(and(eq(usuario.id, parseo.data), eq(usuario.rol, 'chofer'), isNull(usuario.deletedAt)))
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  await db.transaction(async (tx) => {
    // Igual que la baja (baja-nucleo.ts): un chofer que sale del catalogo
    // suelta sus rutas de hoy en adelante en la MISMA transaccion, para que
    // esos horarios queden libres y ninguna ruta quede apuntando a alguien
    // que ya no existe para el planeador. Las pasadas se conservan.
    await liberarYAuditar(tx, actor.id, parseo.data);
    await tx
      .update(usuario)
      .set({ activo: false, deletedAt: new Date() })
      .where(eq(usuario.id, parseo.data));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'borrar',
      recurso: { tipo: 'usuario', id: parseo.data },
      antes: { credencial: antes.credencial },
    });
  });

  revalidatePath('/catalogos/choferes');
  return { ok: true, data: { id: parseo.data } };
}

// === supervisor ====================================================================
// El alta de admin/supervisor se hacia fuera del panel (§ apps/web/src/
// lib/authz/can.ts, comentario historico de `crear_supervisor`). Esta es esa
// pantalla: el admin da de alta un supervisor con nombre y correo
// corporativo. El supervisor puede entrar por Google (con ese mismo correo)
// o con la credencial y contrasena temporal que se muestran una sola vez,
// igual que un chofer nuevo (`crearChofer`, arriba).

async function actorPuedeCrearSupervisores() {
  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'gestionar_usuarios') || !can(actor, 'crear_supervisor')) {
    return null;
  }
  return actor;
}

const SIN_PERMISO_SUPERVISOR: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'Solo un administrador puede crear supervisores.' },
};

export async function listarSupervisores() {
  return db
    .select({
      id: usuario.id,
      credencial: usuario.credencial,
      correo: usuario.correo,
      activo: usuario.activo,
      nombre: perfilPersonal.nombre,
    })
    .from(usuario)
    .leftJoin(perfilPersonal, eq(perfilPersonal.usuarioId, usuario.id))
    .where(and(eq(usuario.rol, 'supervisor'), isNull(usuario.deletedAt)))
    .orderBy(perfilPersonal.nombre);
}

export async function crearSupervisor(
  input: unknown,
): Promise<Resultado<{ id: string; credencial: string; passwordTemporal: string }>> {
  const parseo = supervisorCrearSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion(parseo.error.issues[0]?.message ?? 'Entrada invalida', 'nombre');
  }

  const actor = await actorPuedeCrearSupervisores();
  if (!actor) {
    return SIN_PERMISO_SUPERVISOR;
  }

  const { nombre, correo } = parseo.data;

  // Verificado del lado del servidor, igual que en el callback de OAuth: si
  // el correo no es del dominio permitido, Google jamas va a dejar entrar a
  // este supervisor y la cuenta quedaria invitada para siempre sin poder
  // usarse. Mejor rechazarlo aqui, con un mensaje que explica por que, que
  // dejar que lo descubra el dia que intente entrar.
  // `as string`: igual que en invitacion.ts, esta accion solo se ejecuta
  // tras el paso 3 (§ apps/web/src/lib/env.ts), donde la variable ya es
  // obligatoria y viene validada.
  const dominioPermitido = env.GOOGLE_OAUTH_ALLOWED_DOMAIN as string;
  if (dominioDe(correo) !== dominioPermitido.toLowerCase()) {
    return errorValidacion(`El correo debe ser del dominio @${dominioPermitido}.`, 'correo');
  }

  const credencial = await generarCredencialUnica(nombre);
  // Igual que crearChofer: una contrasena real, mostrada una sola vez. El
  // supervisor puede usarla para entrar por credencial+contrasena, o seguir
  // entrando por Google con este mismo correo — las dos quedan disponibles.
  const passwordTemporal = generarPasswordTemporal();

  const { data: alta, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
    email: correo,
    password: passwordTemporal,
    email_confirm: true,
  });

  if (errorAuth || !alta.user) {
    return errorValidacion(
      `No se pudo crear la cuenta del supervisor: ${errorAuth?.message ?? 'error desconocido'}`,
    );
  }

  const nuevoId = alta.user.id;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(usuario).values({
        id: nuevoId,
        credencial,
        rol: 'supervisor',
        correo,
        activo: true,
        // A diferencia del alta sembrada (que ya trae contrasena elegida a
        // mano), esta contrasena la genero el sistema: se fuerza el cambio
        // en el primer ingreso, misma compuerta que ya usa el chofer.
        debeCambiarPassword: true,
      });
      await tx.insert(perfilPersonal).values({ usuarioId: nuevoId, nombre, correo });
      await registrarAuditoria(tx, {
        actor: actor.id,
        accion: 'crear',
        recurso: { tipo: 'usuario', id: nuevoId },
        despues: { credencial, rol: 'supervisor', nombre, correo },
      });
    });
  } catch (error) {
    // Mismo caso que crearChofer: si Postgres falla, no dejamos un usuario
    // de Auth huerfano sin fila en `usuario`.
    await supabaseAdmin.auth.admin.deleteUser(nuevoId);
    throw error;
  }

  revalidatePath('/catalogos/supervisores');
  return { ok: true, data: { id: nuevoId, credencial, passwordTemporal } };
}

export async function desactivarSupervisor(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return errorValidacion('Id invalido');
  }

  const actor = await actorPuedeCrearSupervisores();
  if (!actor) {
    return SIN_PERMISO_SUPERVISOR;
  }

  const [antes] = await db
    .select({ credencial: usuario.credencial })
    .from(usuario)
    .where(
      and(eq(usuario.id, parseo.data), eq(usuario.rol, 'supervisor'), isNull(usuario.deletedAt)),
    )
    .limit(1);
  if (!antes) {
    return NO_ENCONTRADO;
  }

  await db.transaction(async (tx) => {
    // Borrado logico, igual que borrarChofer: la fila se conserva para el
    // historico de auditoria (quien autorizo que en el pasado).
    await tx
      .update(usuario)
      .set({ activo: false, deletedAt: new Date() })
      .where(eq(usuario.id, parseo.data));
    await registrarAuditoria(tx, {
      actor: actor.id,
      accion: 'borrar',
      recurso: { tipo: 'usuario', id: parseo.data },
      antes: { credencial: antes.credencial },
    });
  });

  revalidatePath('/catalogos/supervisores');
  return { ok: true, data: { id: parseo.data } };
}
