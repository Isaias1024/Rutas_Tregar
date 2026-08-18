-- Custom SQL migration file, put your code below! --

-- Corrige evento_validar_insert_chofer(): fin_ruta_incidente quedo declarado
-- en el enum tipo_evento entre fin_ruta y retorno, y el computo ordinal de
-- "siguiente paso esperado" lo trataba como un paso mas de la secuencia. El
-- resultado: tras un fin_ruta normal, el trigger insistia en que el
-- siguiente evento tenia que ser fin_ruta_incidente y rechazaba TODO
-- retorno normal con "evento fuera de orden" (23514) -- ninguna ruta se
-- podia cerrar sin incidente por este camino. Ver packages/shared/src/db/rls.sql
-- para el detalle completo del cambio.
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