-- Custom SQL migration file, put your code below! --

-- Auditoria de seguridad (linter de Supabase, 0028/0029): Postgres otorga
-- EXECUTE a PUBLIC sobre cualquier funcion nueva por defecto, y `anon`/
-- `authenticated` son miembros de PUBLIC aunque packages/shared/src/db/rls.sql
-- nunca les de GRANT explicito sobre ninguna tabla. Eso es un camino
-- totalmente aparte del modelo de GRANT por tabla que rls.sql controla con
-- cuidado: aunque ninguna tabla le de acceso a `anon`, cada una de estas
-- cuatro funciones `security definer` quedaba expuesta directo como endpoint
-- PostgREST (`/rest/v1/rpc/<nombre>`), sin pasar por RLS ni por ningun GRANT
-- de tabla.
--
-- El caso real es `evento_existe`: es `security definer` a proposito para
-- saltarse RLS (ver el comentario junto a su definicion en rls.sql, evita la
-- recursion asignacion<->evento), y sin este REVOKE cualquiera sin
-- autenticar podia llamarla via RPC con cualquier `asignacion_id` y usarla
-- como oraculo para saber si esa asignacion ya tiene cierto evento —
-- un hueco de datos que nunca fue la intencion; la funcion se escribio para
-- que la llamaran las politicas de abajo, no clientes directos.
-- `usuario_activo` es bajo riesgo (para `anon` siempre da false porque
-- `auth.uid()` es null, para `authenticated` solo refleja el estado activo
-- del propio caller) pero se cierra igual por prolijidad.
revoke execute on function usuario_activo() from public;
revoke execute on function evento_existe(uuid, tipo_evento) from public;

-- Las politicas de arriba (asignacion_select_chofer,
-- asignacion_update_contadores_propios, evento_insert_chofer,
-- evento_select_chofer, perfil_personal_*, ruta/horario/parada/cliente/
-- camion_select_autenticado) llaman estas dos funciones corriendo como el
-- rol que hace la consulta via PostgREST. Sin este GRANT de vuelta, un
-- select/update real de un chofer fallaria con "permission denied for
-- function" — el REVOKE de arriba solo debia cerrar el acceso directo por
-- RPC, no el uso interno desde una politica.
grant execute on function public.usuario_activo() to authenticated;
grant execute on function public.evento_existe(uuid, public.tipo_evento) to authenticated;

-- `asignacion_auditar_contadores` y `evento_validar_insert_chofer` son
-- funciones de trigger (`returns trigger`, disparadas por
-- asignacion_auditar_contadores_trigger y
-- evento_validar_insert_chofer_trigger en rls.sql): Postgres las dispara sin
-- comprobar el EXECUTE del rol que hizo el UPDATE/INSERT, asi que quedan sin
-- ningun GRANT a proposito — ni siquiera `authenticated` puede invocarlas
-- directo via RPC, y el trigger sigue funcionando igual.
revoke execute on function public.asignacion_auditar_contadores() from public;
revoke execute on function public.evento_validar_insert_chofer() from public;
