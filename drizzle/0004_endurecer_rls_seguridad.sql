-- Custom SQL migration file, put your code below! --

-- Auditoria de seguridad (post paso 16). Ver packages/shared/src/db/rls.sql
-- para el detalle de cada cambio; este archivo es solo el delta contra las
-- politicas que ya existian desde 0001/0002/0003.

create or replace function usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from usuario
    where id = auth.uid() and activo and deleted_at is null
  );
$$;

-- === asignacion =================================================================

drop policy if exists asignacion_select_chofer on asignacion;
create policy asignacion_select_chofer on asignacion
  for select
  using (chofer_id = auth.uid() and usuario_activo());

drop policy if exists asignacion_all_supervisor_admin on asignacion;
create policy asignacion_all_supervisor_admin on asignacion
  for all
  using (
    exists (
      select 1 from usuario u
      where u.id = auth.uid() and u.rol in ('supervisor', 'admin')
        and u.activo and u.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from usuario u
      where u.id = auth.uid() and u.rol in ('supervisor', 'admin')
        and u.activo and u.deleted_at is null
    )
  );

-- `security definer` obligatorio, no solo el patron habitual: `evento` tiene
-- su propia RLS que consulta `asignacion` de vuelta, y una version no-definer
-- de esta funcion arma el ciclo asignacion→evento→asignacion que Postgres
-- rechaza con "infinite recursion detected in policy for relation
-- asignacion" — se reprodujo de verdad al aplicar esta migracion la primera
-- vez, antes de este ajuste.
create or replace function evento_existe(p_asignacion_id uuid, p_tipo tipo_evento)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from evento where asignacion_id = p_asignacion_id and tipo = p_tipo
  );
$$;

drop policy if exists asignacion_update_contadores_propios on asignacion;
create policy asignacion_update_contadores_propios on asignacion
  for update
  using (chofer_id = auth.uid() and usuario_activo())
  with check (
    chofer_id = auth.uid()
    and usuario_activo()
    and (cnt_abordaron is null or evento_existe(asignacion.id, 'fin_ruta'))
    and (cnt_retornaron is null or evento_existe(asignacion.id, 'retorno'))
  );

create or replace function asignacion_auditar_contadores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.cnt_abordaron is distinct from old.cnt_abordaron
     or new.cnt_retornaron is distinct from old.cnt_retornaron then
    insert into audit_log (actor_id, accion, recurso_tipo, recurso_id, antes, despues)
    values (
      auth.uid(),
      'corregir_contadores',
      'asignacion',
      new.id::text,
      jsonb_build_object('cntAbordaron', old.cnt_abordaron, 'cntRetornaron', old.cnt_retornaron),
      jsonb_build_object('cntAbordaron', new.cnt_abordaron, 'cntRetornaron', new.cnt_retornaron)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists asignacion_auditar_contadores_trigger on asignacion;
create trigger asignacion_auditar_contadores_trigger
after update on asignacion
for each row execute function asignacion_auditar_contadores();

-- === evento ======================================================================

drop policy if exists evento_insert_chofer on evento;
create policy evento_insert_chofer on evento
  for insert
  with check (
    usuario_activo()
    and exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

drop policy if exists evento_select_chofer on evento;
create policy evento_select_chofer on evento
  for select
  using (
    usuario_activo()
    and exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

-- Un `tipo` que YA existe para esa asignacion se deja pasar SIN validar
-- orden: es el reintento idempotente de apps/mobile/src/outbox/flusher.ts.
-- El UNIQUE evento_asignacion_tipo_key lo rechaza igual (23505, que
-- subirPendiente ya trata como exito) sin que este trigger interfiera con
-- otro codigo de error.
create or replace function evento_validar_insert_chofer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  siguiente tipo_evento;
  ya_existe boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  new.origen := 'app';
  new.capturado_por := auth.uid();

  select exists (
    select 1 from evento where asignacion_id = new.asignacion_id and tipo = new.tipo
  )
  into ya_existe;

  if ya_existe then
    return new;
  end if;

  select t.tipo
  into siguiente
  from unnest(enum_range(null::tipo_evento)) with ordinality as t(tipo, orden)
  where t.tipo not in (select e.tipo from evento e where e.asignacion_id = new.asignacion_id)
  order by t.orden
  limit 1;

  if siguiente is distinct from new.tipo then
    raise exception 'evento fuera de orden para esta asignacion: se esperaba "%", se recibio "%"',
      siguiente, new.tipo
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists evento_validar_insert_chofer_trigger on evento;
create trigger evento_validar_insert_chofer_trigger
before insert on evento
for each row execute function evento_validar_insert_chofer();

-- === perfil_personal =============================================================

drop policy if exists perfil_personal_select_propio on perfil_personal;
create policy perfil_personal_select_propio on perfil_personal
  for select
  using (usuario_id = auth.uid() and usuario_activo());

drop policy if exists perfil_personal_update_propio on perfil_personal;
create policy perfil_personal_update_propio on perfil_personal
  for update
  using (usuario_id = auth.uid() and usuario_activo())
  with check (usuario_id = auth.uid() and usuario_activo());

-- === dispositivo ==================================================================
-- `dispositivo_delete_propio` no cambia: borrar su propio token de push es
-- lo unico que le conviene dejar hacer a una cuenta recien desactivada.

drop policy if exists dispositivo_insert_propio on dispositivo;
create policy dispositivo_insert_propio on dispositivo
  for insert
  with check (usuario_id = auth.uid() and usuario_activo());

drop policy if exists dispositivo_update_propio on dispositivo;
create policy dispositivo_update_propio on dispositivo
  for update
  using (usuario_id = auth.uid() and usuario_activo())
  with check (usuario_id = auth.uid() and usuario_activo());

-- === usuario =======================================================================
-- Comprobacion inline, no `usuario_activo()`: estas politicas ya estan sobre
-- `usuario`, consultar la misma fila directo es mas simple.

drop policy if exists usuario_select_propio on usuario;
create policy usuario_select_propio on usuario
  for select
  using (id = auth.uid() and activo and deleted_at is null);

drop policy if exists usuario_update_debe_cambiar_password on usuario;
create policy usuario_update_debe_cambiar_password on usuario
  for update
  using (id = auth.uid() and activo and deleted_at is null)
  with check (id = auth.uid() and activo and deleted_at is null);

-- === ruta, horario, parada, cliente, camion =======================================

drop policy if exists ruta_select_autenticado on ruta;
create policy ruta_select_autenticado on ruta
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

drop policy if exists horario_select_autenticado on horario;
create policy horario_select_autenticado on horario
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

drop policy if exists parada_select_autenticado on parada;
create policy parada_select_autenticado on parada
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

drop policy if exists cliente_select_autenticado on cliente;
create policy cliente_select_autenticado on cliente
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

drop policy if exists camion_select_autenticado on camion;
create policy camion_select_autenticado on camion
  for select
  using (auth.role() = 'authenticated' and usuario_activo());
