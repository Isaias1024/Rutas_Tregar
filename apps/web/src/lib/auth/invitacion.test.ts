import { randomUUID } from 'node:crypto';
import { db, usuario } from '@rutas/shared/db';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { verificarInvitacion } from './invitacion.ts';

describe('verificarInvitacion', () => {
  const activoId = randomUUID();
  const inactivoId = randomUUID();
  const borradoId = randomUUID();
  const activoCorreo = `activo-${activoId.slice(0, 8)}@example.com`;
  const inactivoCorreo = `inactivo-${inactivoId.slice(0, 8)}@example.com`;
  const borradoCorreo = `borrado-${borradoId.slice(0, 8)}@example.com`;

  beforeAll(async () => {
    await db.execute(
      sql`insert into auth.users (id) values (${activoId}), (${inactivoId}), (${borradoId})`,
    );
    await db.insert(usuario).values([
      {
        id: activoId,
        credencial: `admin-${activoId.slice(0, 8)}`,
        rol: 'admin',
        correo: activoCorreo,
      },
      {
        id: inactivoId,
        credencial: `sup-${inactivoId.slice(0, 8)}`,
        rol: 'supervisor',
        correo: inactivoCorreo,
        activo: false,
      },
      {
        id: borradoId,
        credencial: `sup2-${borradoId.slice(0, 8)}`,
        rol: 'supervisor',
        correo: borradoCorreo,
        deletedAt: new Date(),
      },
    ]);
  });

  afterAll(async () => {
    await db.execute(
      sql`delete from usuario where id in (${activoId}, ${inactivoId}, ${borradoId})`,
    );
    await db.execute(
      sql`delete from auth.users where id in (${activoId}, ${inactivoId}, ${borradoId})`,
    );
  });

  it('un correo con fila activa y rol devuelve el usuario con su rol', async () => {
    const resultado = await verificarInvitacion(activoCorreo);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.data.rol).toBe('admin');
    }
  });

  it('un correo sin fila en usuario se rechaza como no_invitado', async () => {
    const resultado = await verificarInvitacion(`nadie-${randomUUID()}@example.com`);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('no_invitado');
    }
  });

  it('un correo de un dominio distinto se rechaza sin importar si hay fila', async () => {
    const resultado = await verificarInvitacion(`quien-sea@otro-dominio.com`);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('no_invitado');
    }
  });

  it('un usuario con activo=false se rechaza como no_invitado', async () => {
    const resultado = await verificarInvitacion(inactivoCorreo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('no_invitado');
    }
  });

  it('un usuario con deleted_at no nulo se rechaza como no_invitado', async () => {
    const resultado = await verificarInvitacion(borradoCorreo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error.codigo).toBe('no_invitado');
    }
  });
});

describe('apps/web/src/lib/supabase/admin.ts: guarda contra el navegador', () => {
  it('lanza un error nombrado si `window` esta definido al importarse', async () => {
    const globalConWindow = globalThis as unknown as { window?: unknown };
    globalConWindow.window = {};
    vi.resetModules();

    await expect(import('../supabase/admin.ts')).rejects.toThrow(
      /jamas debe importarse desde el navegador/,
    );

    delete globalConWindow.window;
  });
});
