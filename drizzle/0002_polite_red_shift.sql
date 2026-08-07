-- Custom SQL migration file, put your code below! --

-- Paso 8: el cambio forzado de contrasena apaga `debe_cambiar_password`
-- desde la propia app, hablando directo a PostgREST con el JWT del chofer.
-- Igual que perfil_personal: RLS decide la fila, el GRANT de columna decide
-- el campo — un chofer jamas puede tocar su propio `rol` por este camino.
grant update (debe_cambiar_password) on usuario to authenticated;

create policy usuario_update_debe_cambiar_password on usuario
  for update
  using (id = auth.uid())
  with check (id = auth.uid());
