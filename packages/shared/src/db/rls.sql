-- Copia legible de las politicas RLS descritas en la §8 del blueprint.
-- Se pega en la migracion vacia que emite `pnpm db:generate:custom`.
--
-- RLS es la unica frontera de seguridad del movil: la app del chofer habla
-- DIRECTO a Supabase via PostgREST con su propio JWT, y estas politicas son
-- lo unico que decide que ve y que escribe. El panel no pasa por aqui: su
-- unico cliente Drizzle (packages/shared/src/db/index.ts) se conecta con la
-- connection string de servicio (el rol `postgres`, dueno de las tablas), que
-- no esta sujeta a RLS.
--
-- Una politica sin su GRANT base es letra muerta: Postgres primero comprueba
-- el privilegio de la tabla y solo despues filtra filas con RLS. Las tablas
-- que crea Drizzle no heredan los privilegios por defecto de `anon` /
-- `authenticated` que trae un proyecto de Supabase creado desde el dashboard
-- (esos privilegios estan atados al rol que crea la tabla). Por eso cada
-- seccion de abajo otorga primero el verbo exacto que su politica necesita —
-- ni uno mas — y luego la politica que filtra las filas.

-- === asignacion =================================================================
alter table asignacion enable row level security;
grant select on asignacion to authenticated;

create policy asignacion_select_chofer on asignacion
  for select
  using (chofer_id = auth.uid());

-- "supervisor y admin seleccionan todo; solo ellos escriben" (§8). El panel
-- nunca ejercita esta politica en la practica (usa la connection string de
-- servicio), pero se otorga el privilegio para que quede correcta si algun
-- dia se consulta via PostgREST con el JWT de un supervisor.
grant insert, delete on asignacion to authenticated;

create policy asignacion_all_supervisor_admin on asignacion
  for all
  using (
    exists (
      select 1 from usuario u
      where u.id = auth.uid() and u.rol in ('supervisor', 'admin')
    )
  )
  with check (
    exists (
      select 1 from usuario u
      where u.id = auth.uid() and u.rol in ('supervisor', 'admin')
    )
  );

-- UPDATE es GRANT de columna a proposito, no de tabla completa. `authenticated`
-- es el UNICO rol de Postgres compartido por admin, supervisor y chofer (los
-- distingue `usuario.rol`, no un rol de Postgres distinto) y RLS no puede
-- restringir columnas por policy — solo por fila. Cualquier columna que se
-- otorgue aqui queda alcanzable por la policy de chofer de abajo tambien,
-- sobre su propia fila, asi que el grant se queda estrictamente en lo que
-- el chofer de verdad necesita tocar: sus dos contadores. La reasignacion
-- via PostgREST que sugeria el comentario del paso 7 nunca se implemento —
-- el panel jamas la ejercita — y no se agrega aqui hasta que haga falta de
-- verdad, con un trigger que bloquee las demas columnas si el dia llega.
grant update (cnt_abordaron, cnt_retornaron) on asignacion to authenticated;

-- Paso 10: el chofer registra "cuantos abordaron"/"cuantos regresaron" al
-- marcar fin_ruta/retorno, hablando directo a PostgREST con su JWT.
create policy asignacion_update_contadores_propios on asignacion
  for update
  using (chofer_id = auth.uid())
  with check (chofer_id = auth.uid());

-- === evento ======================================================================
-- Append-only por permiso, no por buena costumbre: NINGUN rol recibe el
-- privilegio de UPDATE ni de DELETE, y en consecuencia tampoco existe
-- politica para ninguno de los dos verbos.
alter table evento enable row level security;
grant select, insert on evento to authenticated;

create policy evento_insert_chofer on evento
  for insert
  with check (
    exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

create policy evento_select_chofer on evento
  for select
  using (
    exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

-- === perfil_personal =============================================================
-- Un usuario selecciona y actualiza solo su propia fila, y solo la columna
-- `telefono`. RLS decide la fila; el GRANT de columna decide el campo.
alter table perfil_personal enable row level security;
grant select on perfil_personal to authenticated;
grant update (telefono) on perfil_personal to authenticated;

create policy perfil_personal_select_propio on perfil_personal
  for select
  using (usuario_id = auth.uid());

create policy perfil_personal_update_propio on perfil_personal
  for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- === dispositivo ==================================================================
-- "un usuario inserta, actualiza y borra solo usuario_id = auth.uid()" (§8):
-- tres verbos, a proposito sin select.
alter table dispositivo enable row level security;
grant insert, update, delete on dispositivo to authenticated;

create policy dispositivo_insert_propio on dispositivo
  for insert
  with check (usuario_id = auth.uid());

create policy dispositivo_update_propio on dispositivo
  for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy dispositivo_delete_propio on dispositivo
  for delete
  using (usuario_id = auth.uid());

-- === usuario =======================================================================
-- Un chofer selecciona unicamente su propia fila. La lista completa es
-- exclusiva del servidor con la connection string de servicio.
alter table usuario enable row level security;
grant select on usuario to authenticated;

create policy usuario_select_propio on usuario
  for select
  using (id = auth.uid());

-- Paso 8: el cambio forzado de contrasena apaga `debe_cambiar_password`
-- desde la propia app, hablando directo a PostgREST con el JWT del chofer.
-- Igual que perfil_personal: RLS decide la fila, el GRANT de columna decide
-- el campo — un chofer jamas puede tocar su propio `rol` por este camino.
grant update (debe_cambiar_password) on usuario to authenticated;

create policy usuario_update_debe_cambiar_password on usuario
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- === ruta, horario, parada, cliente, camion =======================================
-- Lectura para cualquier autenticado (el chofer necesita el nombre de la
-- ruta, su horario y las paradas); escritura solo con la connection string
-- de servicio, que no esta sujeta a RLS. Por eso `authenticated` solo recibe
-- SELECT en las cinco, y no hay politica de insert, update ni delete.
alter table ruta enable row level security;
grant select on ruta to authenticated;
create policy ruta_select_autenticado on ruta
  for select
  using (auth.role() = 'authenticated');

alter table horario enable row level security;
grant select on horario to authenticated;
create policy horario_select_autenticado on horario
  for select
  using (auth.role() = 'authenticated');

alter table parada enable row level security;
grant select on parada to authenticated;
create policy parada_select_autenticado on parada
  for select
  using (auth.role() = 'authenticated');

alter table cliente enable row level security;
grant select on cliente to authenticated;
create policy cliente_select_autenticado on cliente
  for select
  using (auth.role() = 'authenticated');

alter table camion enable row level security;
grant select on camion to authenticated;
create policy camion_select_autenticado on camion
  for select
  using (auth.role() = 'authenticated');

-- === audit_log y notificacion_programada ==========================================
-- Sin ningun GRANT y sin ninguna politica para `anon` ni `authenticated`.
-- Solo la connection string de servicio (el rol `postgres`, dueno de la
-- tabla) las toca. RLS queda habilitado de todos modos, para que un futuro
-- GRANT agregado por error no las abra sin que exista tambien una politica.
alter table audit_log enable row level security;
alter table notificacion_programada enable row level security;
