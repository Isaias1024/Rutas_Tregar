'use server';

// `@/lib/env` importa primero A PROPOSITO (ver catalogos.ts, monitor.ts): su
// carga de `.env` tiene que correr antes de que `@rutas/shared/db` evalue
// `process.env.DATABASE_URL` al importarse.
import '@/lib/env';
import { idSchema, type Resultado } from '@rutas/shared';
import { revalidatePath } from 'next/cache';
import { can } from '@/lib/authz/can';
import { bajaEmpleadoNucleo } from './baja-nucleo';
import { obtenerUsuarioActual } from './sesion';

const SIN_PERMISO: Resultado<never> = {
  ok: false,
  error: { codigo: 'no_autorizado', mensaje: 'No tienes permiso para dar de baja personal.' },
};

/** Solo `admin` (§8): un supervisor puede planear y reasignar, no dar de baja. */
export async function darDeBaja(input: unknown): Promise<Resultado<{ id: string }>> {
  const parseo = idSchema.safeParse(input);
  if (!parseo.success) {
    return { ok: false, error: { codigo: 'validacion', mensaje: 'Id invalido.' } };
  }

  const actor = await obtenerUsuarioActual();
  if (!actor || !can(actor, 'dar_de_baja')) {
    return SIN_PERMISO;
  }

  const resultado = await bajaEmpleadoNucleo(actor.id, parseo.data);
  if (resultado.ok) {
    revalidatePath('/catalogos/choferes');
  }
  return resultado;
}
