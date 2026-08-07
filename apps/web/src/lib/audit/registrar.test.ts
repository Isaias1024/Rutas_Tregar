import { randomUUID } from 'node:crypto';
import { cliente, db, usuario } from '@rutas/shared/db';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registrarAuditoria } from './registrar.ts';

describe('registrarAuditoria', () => {
  const actorId = randomUUID();

  beforeAll(async () => {
    await db.execute(sql`insert into auth.users (id) values (${actorId})`);
    await db.insert(usuario).values({
      id: actorId,
      credencial: `auditoria-${actorId.slice(0, 8)}`,
      rol: 'admin',
    });
  });

  afterAll(async () => {
    await db.execute(sql`delete from usuario where id = ${actorId}`);
    await db.execute(sql`delete from auth.users where id = ${actorId}`);
  });

  it('caso feliz: la mutacion y la fila de auditoria quedan escritas juntas', async () => {
    const clienteId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.insert(cliente).values({ id: clienteId, nombre: 'Cliente de auditoria (feliz)' });
      await registrarAuditoria(tx, {
        actor: actorId,
        accion: 'crear',
        recurso: { tipo: 'cliente', id: clienteId },
        despues: { nombre: 'Cliente de auditoria (feliz)' },
      });
    });

    const [filaCliente] = await db.select().from(cliente).where(eq(cliente.id, clienteId)).limit(1);
    expect(filaCliente).toBeDefined();

    const filasBitacora = await db.execute<{ recurso_id: string; accion: string }>(
      sql`select recurso_id, accion from audit_log where recurso_tipo = 'cliente' and recurso_id = ${clienteId}`,
    );
    expect(filasBitacora).toHaveLength(1);
    expect(filasBitacora[0]?.accion).toBe('crear');

    await db.delete(cliente).where(eq(cliente.id, clienteId));
    await db.execute(
      sql`delete from audit_log where recurso_tipo = 'cliente' and recurso_id = ${clienteId}`,
    );
  });

  it('caso critico: si falla la escritura en audit_log, la mutacion tambien se revierte', async () => {
    const clienteId = randomUUID();
    const actorInexistente = randomUUID(); // sin fila en `usuario`: viola la FK de actor_id

    await expect(
      db.transaction(async (tx) => {
        await tx
          .insert(cliente)
          .values({ id: clienteId, nombre: 'Cliente de auditoria (fallido)' });
        await registrarAuditoria(tx, {
          actor: actorInexistente,
          accion: 'crear',
          recurso: { tipo: 'cliente', id: clienteId },
        });
      }),
    ).rejects.toThrow();

    const [filaCliente] = await db.select().from(cliente).where(eq(cliente.id, clienteId)).limit(1);
    expect(filaCliente).toBeUndefined();
  });
});
