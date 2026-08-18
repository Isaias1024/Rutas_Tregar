---
name: agregar-paso-chofer
description: Usar al tocar el flujo de hitos de la app del chofer — agregar o cambiar un tipo de evento, un contador, o la pantalla de detalle de ruta. Cubre la trampa del enum tipo_evento contra ORDEN_PASOS, y mantiene el contrato outbox/idempotencia y la regla de un solo boton activo.
---

# Agregar o cambiar un paso del chofer

## Cuando usarla

- "hay que agregar un evento entre `inicio_ruta` y `fin_ruta`"
- "el contador de abordados tambien debe pedirse en X"
- "cambia el texto del boton de `retorno`"
- "el evento no se esta subiendo cuando vuelve la senal"

## Pasos

1. **Empieza por el tipo, no por la pantalla.** Agrega el valor al enum `tipoEvento` en
   `packages/shared/src/db/schema.ts` y al esquema zod de `packages/shared/src/eventos.ts`. Genera
   migracion con la skill `nueva-migracion`.
2. **Decide de inmediato si el tipo nuevo es un paso o una salida**, porque de eso dependen dos
   lugares que hay que editar a mano y no comparten fuente:
   - **Paso de la secuencia:** va en `ORDEN_PASOS` de `packages/shared/src/flujo.ts` y participa
     del computo ordinal del trigger `evento_validar_insert_chofer()` en `rls.sql`.
   - **Salida (como `fin_ruta_incidente`):** NO va en `ORDEN_PASOS`, se le da su caso propio en
     `puedeRegistrar`, y **hay que excluirlo del computo ordinal del trigger**
     (`and t.tipo <> '<tu_tipo>'`). El trigger recorre `enum_range`, no `ORDEN_PASOS`: un valor
     nuevo se cuela en la secuencia por su posicion en el enum aunque TypeScript no lo liste.
     Asi se rompio `retorno` cuando entro `fin_ruta_incidente` — ver
     `drizzle/0007_worthless_katie_power.sql`.
3. **Actualiza la maquina de pasos** en `packages/shared/src/flujo.ts`, que es la unica que decide
   cual es el siguiente paso activo. La pantalla no decide nada: solo pinta lo que esta funcion diga.
4. **Si el paso necesita un contador**, ponlo dentro de ese paso — no en una pantalla aparte. El
   contador se pide en el momento en que el chofer realmente conoce el numero.
5. **Escribe primero en el outbox local**, nunca directo a la red:
   `apps/mobile/src/outbox/registrar.ts` genera el `client_event_id`, guarda en SQLite y regresa.
   La UI avanza con ese retorno.
6. **Actualiza la derivacion de estado** si el paso nuevo participa en la puntualidad
   (`packages/shared/src/estado.ts`) y su prueba de vitest. `estadoRuta()` tambien vive ahi y ya
   trata `retorno` y `fin_ruta_incidente` como cierre: si tu tipo cierra la ruta, agregalo.
7. **Actualiza la captura manual del supervisor** en el panel para que el mismo evento pueda
   registrarse con `origen = 'supervisor'`. Si el chofer puede marcarlo, el supervisor tambien.

## Verify

```bash
pnpm test packages/shared/src/flujo.test.ts     # expect: exit 0, 0 failed, 0 skipped
pnpm test packages/shared/src/estado.test.ts    # expect: exit 0, 0 failed, 0 skipped
pnpm test packages/shared/src/db/rls.test.ts    # expect: exit 0 — el trigger de orden en Postgres real
pnpm typecheck                                  # expect: exit 0
npx expo export --platform ios                  # expect: exit 0 — el bundle real de la app
```

> `flujo.test.ts` prueba la maquina en TypeScript; `rls.test.ts` prueba el trigger equivalente en
> SQL. **Los dos, siempre**: son dos implementaciones a mano de la misma regla y ya se
> desincronizaron una vez — el caso que lo detecta es "un chofer puede marcar retorno despues de un
> fin_ruta normal".

> `pnpm test:mobile` **no** sirve hoy como compuerta de este cambio: 2 de sus 3 suites no arrancan
> desde la bajada a Expo SDK 54 (`__fbBatchedBridgeConfig is not set` al importar
> `expo-secure-store` y `expo-sqlite`). La que si corre es `src/lib/credencial.test.ts`. Mientras
> siga asi, lo que de verdad verifica que la app no quedo rota es el `expo export` de arriba. Ver
> `apps/mobile/README.md`.

## No hagas

- **No pongas dos botones activos en la pantalla de detalle.** El producto entero descansa en que el
  chofer confirme sin elegir. Si crees que necesitas dos, es que faltaba un paso en `flujo.ts`. La
  unica excepcion viva es "Terminar ruta por incidente", y esta resuelta con jerarquia, no con dos
  primarios: el hito va en `BotonPrimario` (72px, relleno) y el incidente en `BotonSecundario`
  destructivo (56px, contorno). Una salida de emergencia no compite con la accion normal.
- **No asumas que agregar un valor al enum es inocuo para los demas.** El trigger de orden lo
  recoge por posicion en `enum_range` aunque no lo agregues a `ORDEN_PASOS`, y puede empezar a
  exigirlo como paso previo de otro. Corre `pnpm test packages/shared/src/db/rls.test.ts` — ahi
  vive la prueba que cubre el flujo completo hasta `retorno`.
- **No hagas que la UI espere la red.** Si el toque bloquea hasta que responde Supabase, el chofer
  deja de tocar el boton en cuanto pierde senal y el panel se queda vacio.
- **No reuses un `client_event_id`.** Es la clave de idempotencia: uno por toque, generado en el
  dispositivo, nunca en el servidor.
- **No hagas obligatorio el GPS.** Un permiso negado guarda el evento con coordenadas nulas y sigue.
- **No hagas UPDATE sobre `evento`.** Corregir un contador se hace en `asignacion` y queda en
  `audit_log`.
