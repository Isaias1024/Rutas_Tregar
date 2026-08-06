---
name: nueva-migracion
description: Usar al agregar, cambiar o quitar una tabla, columna, indice o politica RLS. Cubre el orden correcto (editar schema.ts, generar, migrar, verificar) y evita los dos errores caros de este repo: nombrar a mano un archivo de migracion e inventar una tabla sin prueba de aislamiento RLS.
---

# Nueva migracion

## Cuando usarla

- "agrega una columna a `asignacion`"
- "necesito una tabla nueva para X"
- "hay que cambiar el indice de `evento`"
- "falta una politica RLS para los supervisores"

## Pasos

1. **Levanta la base local si no esta arriba.**
   ```bash
   pnpm db:up
   ```
2. **Edita `packages/shared/src/db/schema.ts`.** Reglas que aplican siempre:
   - timestamps en `timestamptz`, fechas operativas en `date`;
   - borrado logico con `deleted_at`, no `DELETE`;
   - toda tabla nueva lleva `enable row level security`.
3. **Genera la migracion.** No inventes el nombre del archivo: lo elige la herramienta.
   ```bash
   pnpm db:generate
   ```
4. **Si el cambio incluye politicas RLS o SQL que Drizzle no modela**, escribe el SQL en
   `packages/shared/src/db/rls.sql` y pega ese contenido en la migracion vacia que emite:
   ```bash
   pnpm db:generate:custom
   ```
5. **Aplica y verifica.**
   ```bash
   pnpm db:migrate
   pnpm db:check
   ```
6. **Agrega la tabla nueva a la lista de `scripts/check-schema.ts`** en el mismo commit.
7. **Escribe la prueba de aislamiento** en `packages/shared/src/db/rls.test.ts`: un chofer intenta
   leer y escribir filas de otro chofer, y ambas operaciones deben fallar.

## Verify

```bash
pnpm db:migrate                                   # expect: exit 0
pnpm db:check                                     # expect: exit 0, existe cada tabla de la lista
pnpm test packages/shared/src/db/rls.test.ts      # expect: exit 0, 0 failed, 0 skipped
pnpm typecheck                                    # expect: exit 0
```

## No hagas

- **No edites una migracion que ya corrio.** Agrega otra.
- **No escribas a mano el nombre de un archivo bajo `drizzle/`.** `drizzle-kit` lo nombra con un
  codigo aleatorio; el que tu escribas no va a existir en la maquina de quien construya.
- **No cambies el esquema desde el dashboard de Supabase.** Es solo lectura para este proyecto; un
  cambio ahi desaparece en el siguiente `pnpm db:reset` y deja el codigo mintiendo.
- **No agregues una tabla sin RLS y sin su prueba de aislamiento.** La app del chofer habla directo a
  Supabase: una tabla sin politica es una fuga de datos, no un pendiente de UI.
