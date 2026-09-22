-- Custom SQL migration file, put your code below! --

-- La migracion 0008 le quito EXECUTE a `anon` sobre las cuatro funciones
-- `security definer`, pero dos de ellas (`usuario_activo` y `evento_existe`)
-- tienen que seguir teniendo EXECUTE para `authenticated`: las politicas de
-- rls.sql las invocan corriendo como el rol que hace la consulta via
-- PostgREST, y sin ese GRANT cualquier select/update de un chofer falla con
-- "permission denied for function". Mientras vivan en `public` ese GRANT
-- necesario tambien las publica como endpoint RPC
-- (`/rest/v1/rpc/usuario_activo`), que es exactamente lo que reporta el
-- linter 0029 — no es un GRANT de mas, es que el esquema es el equivocado.
--
-- La solucion que recomienda el propio linter es sacarlas del esquema
-- expuesto. `supabase/config.toml` expone solo ["public", "graphql_public"],
-- asi que un esquema `seguridad` nuevo queda invisible para PostgREST: las
-- politicas lo siguen resolviendo (la dependencia quedo atada al OID de la
-- funcion, no a su nombre), pero ya no hay ruta HTTP que las alcance.
create schema if not exists seguridad;

-- `authenticated` necesita USAGE sobre el esquema ademas de EXECUTE sobre la
-- funcion; USAGE sobre un esquema no lo lista ni lo expone por si solo.
grant usage on schema seguridad to authenticated;

alter function public.usuario_activo() set schema seguridad;
alter function public.evento_existe(uuid, public.tipo_evento) set schema seguridad;

-- El `search_path` fijo de cada funcion apuntaba a `public` para resolver las
-- tablas que consultan (`usuario`, `evento`); al mudarse el cuerpo sigue
-- necesitando ver `public`, y ademas su propio esquema nuevo.
alter function seguridad.usuario_activo() set search_path = seguridad, public;
alter function seguridad.evento_existe(uuid, public.tipo_evento) set search_path = seguridad, public;

-- El mismo cierre de 0008, ahora sobre las funciones mudadas: el default de
-- Postgres es EXECUTE para PUBLIC, y `set schema` no lo reescribe.
revoke execute on function seguridad.usuario_activo() from public;
revoke execute on function seguridad.evento_existe(uuid, public.tipo_evento) from public;
grant execute on function seguridad.usuario_activo() to authenticated;
grant execute on function seguridad.evento_existe(uuid, public.tipo_evento) to authenticated;

-- Las dos funciones de trigger se mudan tambien. No necesitan ningun GRANT
-- (Postgres dispara un trigger sin comprobar el EXECUTE del rol que hizo el
-- INSERT/UPDATE), y fuera de `public` dejan de existir como endpoint RPC
-- aunque un GRANT futuro se agregue por error.
alter function public.asignacion_auditar_contadores() set schema seguridad;
alter function public.evento_validar_insert_chofer() set schema seguridad;
alter function seguridad.asignacion_auditar_contadores() set search_path = seguridad, public;
alter function seguridad.evento_validar_insert_chofer() set search_path = seguridad, public;
revoke execute on function seguridad.asignacion_auditar_contadores() from public;
revoke execute on function seguridad.evento_validar_insert_chofer() from public;

-- Linter 0008 (rls_enabled_no_policy) sobre `audit_log` y
-- `notificacion_programada`: el estado "RLS encendido y cero politicas" ya
-- niega todo a cualquier rol que no sea el dueno, que es justo lo que
-- rls.sql queria, pero es indistinguible de haberse olvidado de escribir la
-- politica — por eso el linter lo marca. Estas dos politicas dejan el mismo
-- comportamiento por escrito: `using (false)` no abre nada (y sin GRANT
-- sobre las tablas `anon`/`authenticated` no llegan ni a evaluarlas), y el
-- rol `postgres` dueno de las tablas sigue saltandose RLS como antes.
create policy audit_log_sin_acceso_publico on audit_log
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy notificacion_programada_sin_acceso_publico on notificacion_programada
  for all
  to anon, authenticated
  using (false)
  with check (false);
