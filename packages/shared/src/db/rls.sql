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

-- === usuario_activo() =============================================================
-- Auditoria de seguridad (post paso 16): ninguna politica de abajo
-- comprobaba `usuario.activo`/`deleted_at` — solo `auth.uid()`. Eso
-- significa que un chofer dado de baja (`apps/web/src/server/baja-nucleo.ts`)
-- conservaba acceso de lectura/escritura via PostgREST con su JWT todavia
-- valido (hasta `jwt_expiry`, 1 hora) SIN IMPORTAR si el baneo de Supabase
-- Auth de esa misma funcion tuvo exito — ese baneo es "best effort" (su error
-- se traga a proposito, ver el comentario en baja-nucleo.ts) porque no hay
-- forma de meter una llamada HTTP dentro del rollback de la transaccion de
-- Postgres. RLS es la UNICA frontera real del camino movil (§8), asi que la
-- baja tiene que cerrar el acceso ahi tambien, no solo en `proxy.ts` (que
-- solo protege al panel web, nunca a PostgREST).
--
-- `security definer` a proposito: evalua la fila real de `usuario` sin
-- depender de que la propia politica de `usuario_select_propio` la deje ver
-- (evita cualquier duda de recursion), y sin necesitar un GRANT adicional
-- para las tablas que la llaman. `search_path` fijo por la razon de siempre:
-- una funcion `security definer` sin `search_path` explicito es secuestrable
-- por un rol que cree un objeto con el mismo nombre en un esquema anterior
-- en su propio `search_path`.
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
alter table asignacion enable row level security;
grant select on asignacion to authenticated;

create policy asignacion_select_chofer on asignacion
  for select
  using (chofer_id = auth.uid() and usuario_activo());

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

-- `security definer`: NO es solo el patron habitual de "evita un GRANT
-- extra" — aqui es obligatorio. `evento` tiene su propia RLS
-- (`evento_select_chofer`), que a su vez consulta `asignacion` para
-- confirmar la propiedad. Si esta funcion NO fuera definer, su `select ...
-- from evento` quedaria sujeto a esa politica, y Postgres detecta el ciclo
-- asignacion→evento→asignacion y rechaza la consulta entera con
-- "infinite recursion detected in policy for relation asignacion" — no
-- es teorico, se reprodujo armando esta migracion. Al ser definer, la
-- consulta interna corre como el dueno de las tablas (bypassa RLS por
-- completo en su propio cuerpo), y el ciclo nunca se arma.
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

-- Paso 10: el chofer registra "cuantos abordaron"/"cuantos regresaron" al
-- marcar fin_ruta/retorno, hablando directo a PostgREST con su JWT.
--
-- Auditoria de seguridad: el `with check` original solo comprobaba
-- `chofer_id = auth.uid()`, sin exigir que el evento correspondiente ya
-- existiera. Eso dejaba dos huecos: (1) un chofer podia fijar un contador en
-- CUALQUIER asignacion propia, en cualquier momento, sin haber marcado
-- `fin_ruta`/`retorno` — corrompiendo silenciosamente el reporte de
-- ocupacion sin que ningun evento lo respaldara; y (2) esa escritura nunca
-- pasaba por `registrarAuditoria` (eso solo corre en el camino del panel),
-- asi que quedaba sin rastro en `audit_log`. Lo primero lo cierra el
-- `with check` de abajo: solo se puede fijar `cnt_abordaron` si YA existe un
-- evento `fin_ruta` para esa asignacion (mismo patron para `cnt_retornaron`
-- y `retorno`). El flujo legitimo de dos pasos del outbox
-- (apps/mobile/src/outbox/flusher.ts: primero inserta el evento, despues
-- actualiza el contador en una llamada aparte) sigue funcionando porque para
-- cuando llega la segunda llamada el evento del primer paso ya quedo
-- insertado. Lo segundo lo cierra el trigger `asignacion_auditar_contadores`
-- de abajo.
create policy asignacion_update_contadores_propios on asignacion
  for update
  using (chofer_id = auth.uid() and usuario_activo())
  with check (
    chofer_id = auth.uid()
    and usuario_activo()
    and (cnt_abordaron is null or evento_existe(asignacion.id, 'fin_ruta'))
    and (cnt_retornaron is null or evento_existe(asignacion.id, 'retorno'))
  );

-- Auditoria de seguridad: registra en `audit_log` cualquier cambio a los
-- contadores que llegue por el camino directo del chofer (`auth.uid()` no
-- nulo — la connection string de servicio del panel no trae JWT, asi que ahi
-- `auth.uid()` es null y el trigger no hace nada: esa escritura ya pasa por
-- `registrarAuditoria` en la misma transaccion, desde el codigo de
-- TypeScript). `security definer` porque `authenticated` no tiene, ni debe
-- tener, GRANT directo sobre `audit_log` (queda exclusivo de la connection
-- string de servicio, ver la seccion de abajo) — la funcion es la unica
-- puerta, y solo escribe la fila de auditoria, nunca deja que `authenticated`
-- toque la tabla de ninguna otra forma.
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

create trigger asignacion_auditar_contadores_trigger
after update on asignacion
for each row execute function asignacion_auditar_contadores();

-- === evento ======================================================================
-- Append-only por permiso, no por buena costumbre: NINGUN rol recibe el
-- privilegio de UPDATE ni de DELETE, y en consecuencia tampoco existe
-- politica para ninguno de los dos verbos.
alter table evento enable row level security;
grant select, insert on evento to authenticated;

create policy evento_insert_chofer on evento
  for insert
  with check (
    usuario_activo()
    and exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

create policy evento_select_chofer on evento
  for select
  using (
    usuario_activo()
    and exists (
      select 1 from asignacion a
      where a.id = asignacion_id and a.chofer_id = auth.uid()
    )
  );

-- Auditoria de seguridad: §5 del blueprint dice que el POST de `evento` desde
-- la app tiene dos reglas que la politica de arriba NUNCA implemento —
-- "origen y capturado_por no los manda el cliente: los fija una politica y
-- un default" y "tipo debe ser el siguiente paso segun flujo.ts". La unica
-- comprobacion real era la propiedad de la asignacion; nada impedia que un
-- cliente modificado (o un JWT de chofer robado, usado directo contra
-- PostgREST) mandara `origen: 'supervisor'` o `capturado_por` de otra
-- persona — exactamente la mezcla de calidades de dato que el reporte de
-- cumplimiento existe para evitar (§16, "los reportes mezclan dos calidades
-- de dato") — ni que insertara los cinco pasos fuera de orden.
--
-- Este trigger cierra los dos huecos, y SOLO para el camino de PostgREST
-- (`auth.uid()` no nulo): la captura manual del supervisor
-- (`apps/web/src/server/monitor.ts`) sigue pudiendo fijar `origen =
-- 'supervisor'` y elegir cualquier paso a proposito — es control retroactivo
-- de un evento que la app nunca marco, y el supervisor SI puede rellenar un
-- hueco fuera de orden.
--
-- El orden se calcula contra el orden real de `tipo_evento` en el catalogo
-- (`enum_range`), y ese orden NO es identico a `ORDEN_PASOS` de
-- packages/shared/src/flujo.ts: el enum trae ademas `fin_ruta_incidente`,
-- declarado entre `fin_ruta` y `retorno`, que no pertenece a la secuencia.
-- Por eso el filtro `t.tipo <> 'fin_ruta_incidente'` de la consulta de abajo
-- no es cosmetico — sin el, el computo ordinal anunciaba
-- `fin_ruta_incidente` como el paso siguiente a `fin_ruta` y rechazaba TODO
-- `retorno` normal con este mismo 23514, dejando sin forma de cerrar una
-- ruta por el camino de PostgREST. No hay una fuente unica compartida entre
-- SQL y TypeScript: si agregas un valor al enum, decide explicitamente si
-- entra en la secuencia (y va en `ORDEN_PASOS`) o si es una salida como el
-- incidente (y va excluido aqui).
--
-- Un `tipo` que YA existe para esa asignacion se deja pasar SIN validar
-- orden: es exactamente el reintento idempotente que
-- apps/mobile/src/outbox/flusher.ts produce cuando un cliente honesto
-- reenvia un evento que cree que fallo. Validarlo aqui lo rechazaria con
-- este mismo error (23514) en vez del `unique_violation` (23505) que
-- `subirPendiente` ya sabe tratar como `'conflicto'` = exito — dejarlo pasar
-- no abre ningun hueco de seguridad, porque el UNIQUE
-- `evento_asignacion_tipo_key` de mas abajo lo va a rechazar de todos modos;
-- solo cambia CUAL mecanismo lo rechaza, para que sea el que el cliente ya
-- entiende.
create or replace function evento_validar_insert_chofer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  siguiente tipo_evento;
  ya_existe boolean;
  ruta_cerrada boolean;
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

  -- `fin_ruta_incidente` es la excepcion de `puedeRegistrar` en flujo.ts: se
  -- puede registrar en CUALQUIER momento de la ruta, sin respetar el orden
  -- lineal de ORDEN_PASOS, mientras la ruta no este ya cerrada por `retorno`.
  -- Por eso queda fuera del computo ordinal de abajo en los dos sentidos: ni
  -- se le exige turno a el mismo (este bloque), ni cuenta como el "siguiente
  -- paso" que otro tipo tendria que esperar (el `and t.tipo <> ...` de mas
  -- abajo). Antes de esta correccion, como el enum lo declara entre
  -- `fin_ruta` y `retorno`, el computo ordinal insistia en que el siguiente
  -- paso tras un `fin_ruta` normal era `fin_ruta_incidente` y rechazaba TODO
  -- `retorno` normal con "evento fuera de orden" -- ninguna ruta se podia
  -- cerrar sin incidente por este camino.
  if new.tipo = 'fin_ruta_incidente' then
    select exists (
      select 1 from evento where asignacion_id = new.asignacion_id and tipo = 'retorno'
    )
    into ruta_cerrada;

    if ruta_cerrada then
      raise exception 'la ruta ya esta cerrada, no se puede registrar un incidente'
        using errcode = '23514';
    end if;

    return new;
  end if;

  select t.tipo
  into siguiente
  from unnest(enum_range(null::tipo_evento)) with ordinality as t(tipo, orden)
  where t.tipo not in (select e.tipo from evento e where e.asignacion_id = new.asignacion_id)
    and t.tipo <> 'fin_ruta_incidente'
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

create trigger evento_validar_insert_chofer_trigger
before insert on evento
for each row execute function evento_validar_insert_chofer();

-- === perfil_personal =============================================================
-- Un usuario selecciona y actualiza solo su propia fila, y solo la columna
-- `telefono`. RLS decide la fila; el GRANT de columna decide el campo.
alter table perfil_personal enable row level security;
grant select on perfil_personal to authenticated;
grant update (telefono) on perfil_personal to authenticated;

create policy perfil_personal_select_propio on perfil_personal
  for select
  using (usuario_id = auth.uid() and usuario_activo());

create policy perfil_personal_update_propio on perfil_personal
  for update
  using (usuario_id = auth.uid() and usuario_activo())
  with check (usuario_id = auth.uid() and usuario_activo());

-- === dispositivo ==================================================================
-- "un usuario inserta, actualiza y borra solo usuario_id = auth.uid()" (§8):
-- tres verbos, a proposito sin select.
alter table dispositivo enable row level security;
grant insert, update, delete on dispositivo to authenticated;

create policy dispositivo_insert_propio on dispositivo
  for insert
  with check (usuario_id = auth.uid() and usuario_activo());

create policy dispositivo_update_propio on dispositivo
  for update
  using (usuario_id = auth.uid() and usuario_activo())
  with check (usuario_id = auth.uid() and usuario_activo());

-- Sin `usuario_activo()` a proposito, a diferencia de insert/update de
-- arriba: borrar su propio token de push es lo unico que le conviene dejar
-- hacer a una cuenta recien desactivada camino a expirar — nunca le da
-- acceso a nada nuevo, solo apaga una notificacion que ya no deberia llegar.
create policy dispositivo_delete_propio on dispositivo
  for delete
  using (usuario_id = auth.uid());

-- === usuario =======================================================================
-- Un chofer selecciona unicamente su propia fila. La lista completa es
-- exclusiva del servidor con la connection string de servicio.
--
-- Comprobacion inline (no `usuario_activo()`) a proposito: esta politica YA
-- esta sobre `usuario`, asi que consultar la misma fila directo es mas
-- simple que pasar por una funcion pensada para que OTRAS tablas consulten
-- `usuario` sin depender de esta politica.
alter table usuario enable row level security;
grant select on usuario to authenticated;

create policy usuario_select_propio on usuario
  for select
  using (id = auth.uid() and activo and deleted_at is null);

-- Paso 8: el cambio forzado de contrasena apaga `debe_cambiar_password`
-- desde la propia app, hablando directo a PostgREST con el JWT del chofer.
-- Igual que perfil_personal: RLS decide la fila, el GRANT de columna decide
-- el campo — un chofer jamas puede tocar su propio `rol` por este camino.
grant update (debe_cambiar_password) on usuario to authenticated;

create policy usuario_update_debe_cambiar_password on usuario
  for update
  using (id = auth.uid() and activo and deleted_at is null)
  with check (id = auth.uid() and activo and deleted_at is null);

-- === ruta, horario, parada, cliente, camion =======================================
-- Lectura para cualquier autenticado (el chofer necesita el nombre de la
-- ruta, su horario y las paradas); escritura solo con la connection string
-- de servicio, que no esta sujeta a RLS. Por eso `authenticated` solo recibe
-- SELECT en las cinco, y no hay politica de insert, update ni delete.
alter table ruta enable row level security;
grant select on ruta to authenticated;
create policy ruta_select_autenticado on ruta
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

alter table horario enable row level security;
grant select on horario to authenticated;
create policy horario_select_autenticado on horario
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

alter table parada enable row level security;
grant select on parada to authenticated;
create policy parada_select_autenticado on parada
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

alter table cliente enable row level security;
grant select on cliente to authenticated;
create policy cliente_select_autenticado on cliente
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

alter table camion enable row level security;
grant select on camion to authenticated;
create policy camion_select_autenticado on camion
  for select
  using (auth.role() = 'authenticated' and usuario_activo());

-- === audit_log y notificacion_programada ==========================================
-- Sin ningun GRANT y sin ninguna politica para `anon` ni `authenticated`.
-- Solo la connection string de servicio (el rol `postgres`, dueno de la
-- tabla) las toca. RLS queda habilitado de todos modos, para que un futuro
-- GRANT agregado por error no las abra sin que exista tambien una politica.
alter table audit_log enable row level security;
alter table notificacion_programada enable row level security;
