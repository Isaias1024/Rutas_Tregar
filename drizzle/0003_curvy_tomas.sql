-- Custom SQL migration file, put your code below! --

-- Corrige el GRANT de tabla completa del paso 7: sin columnas explicitas,
-- un UPDATE queda disponible a CUALQUIER policy que aplique sobre esa fila,
-- y el paso 10 agrega una policy de chofer sobre su propia asignacion. RLS
-- no puede restringir columnas por policy — solo por fila — asi que el
-- grant se queda estrictamente en lo que el chofer de verdad necesita
-- tocar: sus dos contadores.
revoke update on asignacion from authenticated;
grant update (cnt_abordaron, cnt_retornaron) on asignacion to authenticated;

-- Paso 10: el chofer registra "cuantos abordaron"/"cuantos regresaron" al
-- marcar fin_ruta/retorno, hablando directo a PostgREST con su JWT.
create policy asignacion_update_contadores_propios on asignacion
  for update
  using (chofer_id = auth.uid())
  with check (chofer_id = auth.uid());
