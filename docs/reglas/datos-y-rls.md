---
description: Convenciones de esquema, migraciones Drizzle y politicas RLS
paths:
  - "packages/shared/src/db/**"
  - "drizzle/**"
  - "scripts/**"
---

# Datos, migraciones y RLS

- **Drizzle es el unico sistema de migraciones.** El dashboard de Supabase es solo lectura para este
  proyecto. Cambiar el esquema significa editar `packages/shared/src/db/schema.ts` y correr
  `pnpm db:generate`; nunca tocar la base a mano.
- **Nunca inventes el nombre de un archivo de migracion.** Los nombra `drizzle-kit`. Refierete a
  "la migracion que emite `pnpm db:generate`" — el archivo mas nuevo en `drizzle/`.
- **Nunca edites una migracion que ya corrio.** Agrega una nueva.
- Las politicas RLS se escriben en `packages/shared/src/db/rls.sql` (copia legible) y se aplican
  pegando ese contenido en la migracion vacia que emite `pnpm db:generate:custom`.
- **Toda tabla nace con `enable row level security` y con al menos una prueba de aislamiento** en
  `packages/shared/src/db/rls.test.ts` que intenta leer y escribir datos de otro chofer y **debe
  fallar**. Una tabla sin esa prueba no esta terminada.
- Todo timestamp es `timestamptz`. `fecha` es `date` y se interpreta en `America/Mexico_City` por
  zona IANA. Jamas un offset fijo, jamas `timestamp` sin zona.
- **`evento` es append-only.** Ni UPDATE ni DELETE, ni en codigo ni en una migracion de datos. La
  correccion de un contador se hace en `asignacion` y queda en `audit_log`.
- `evento.client_event_id` es UNIQUE: es la clave de idempotencia del outbox. Todo insert desde la
  app usa `on conflict (client_event_id) do nothing`.
- La baja de un usuario **vacia `perfil_personal` y conserva `usuario`**. Nunca borres la fila de
  `usuario`: es lo que sostiene el historial laboral y las referencias de `asignacion`.
- El borrado logico usa `deleted_at`. Toda consulta de catalogo lo filtra.
- Los scripts de `scripts/` corren con `tsx` y cargan entorno con
  `process.loadEnvFile('.env')` en sus primeras lineas. Nunca asumas que el shell ya lo trae.
- **`scripts/seed.ts` es destructivo y de conjunto fijo.** Vacia las doce tablas con un `truncate` y
  borra las cuentas de Auth antes de sembrar: es idempotente por reconstruccion, no por
  buscar-antes-de-insertar. Siembra 1 admin, 1 supervisor, 3 choferes, 6 paradas, 3 camiones y 3
  rutas con un horario cada una, y **cero `asignacion` y cero `evento`** a proposito: el Planeador
  tiene que poder programarse desde cero. Al final valida los conteos y sale distinto de cero si no
  cuadran. Solo corre contra Supabase local, salvo `--forzar`. Si una prueba necesita datos que la
  semilla no da, ese fixture va **en la prueba**, no en la semilla — es lo que hace
  `tests/e2e/planeador.spec.ts` con su segundo horario.
- `pnpm db:check` verifica que exista cada una de las doce tablas de `TABLAS_ESPERADAS` en
  `scripts/check-schema.ts`, y que `evento` no tenga politica de UPDATE ni de DELETE. Si agregas una
  tabla, agregala a esa lista en el mismo commit.
