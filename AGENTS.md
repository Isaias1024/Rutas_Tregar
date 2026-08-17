# Rutas — Transporte de Personal — instrucciones para agentes

Panel web (Next.js) para supervisores y app Android (Expo) para choferes de una empresa de transporte
de personal en Monterrey. Monorepo pnpm + Turborepo.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev | `pnpm dev` — panel en http://127.0.0.1:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / formato | `pnpm lint` · `pnpm format` |
| Pruebas | `pnpm test` · un archivo: `pnpm test <ruta>` |
| Pruebas app movil | `pnpm test:mobile` — **falla hoy, ver abajo** |
| E2E | `pnpm test:e2e` · un archivo: `pnpm test:e2e <ruta>` |
| Servicios locales | `pnpm db:up` · `pnpm db:down` · `pnpm db:status` |
| Generar entorno | `pnpm env:write` |
| Migraciones | `pnpm db:generate` → `pnpm db:migrate` · a mano: `pnpm db:generate:custom` · `pnpm db:check` |
| Semilla / reset | `pnpm db:seed` (**vacia la base** antes de sembrar) · `pnpm db:reset` |
| Worker | `pnpm worker:version` · `pnpm worker:dev` |
| Diagnostico Expo | `pnpm mobile:doctor` |
| Sesion local de panel | `pnpm panel:sesion [--rol supervisor]` |
| Restablecer contrasena de un chofer sembrado | `pnpm chofer:prueba [--credencial driver2] [--forzar-cambio]` |

**Compuerta:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar nada hecho.

Dos comandos necesitan el panel levantado en `http://127.0.0.1:3000`: `pnpm test:e2e` (Playwright lo
arranca solo si no lo esta) y, dentro de `pnpm test`, la prueba del PDF del worker — si esa falla con
`ERR_CONNECTION_REFUSED`, falta el servidor, no esta roto el codigo.

**Pendiente conocido:** `pnpm test:mobile` falla en 2 de 3 suites desde la bajada a Expo SDK 54
(`__fbBatchedBridgeConfig is not set` al importar `expo-secure-store` y `expo-sqlite`). No esta en la
compuerta, asi que no bloquea. Detalle en `apps/mobile/README.md`.

## No negociable

1. En `apps/mobile` se instala **siempre** con `npx expo install`, jamas con `pnpm add`.
2. La app del chofer habla directo a Supabase: **RLS es la unica frontera de seguridad**. Toda tabla
   nueva nace con RLS activo y con su prueba de aislamiento.
3. La service role key jamas sale del servidor — ni en `EXPO_PUBLIC_*` ni en `NEXT_PUBLIC_*`.
4. Toda mutacion administrativa pasa por `can()` y escribe en `audit_log` en la misma transaccion.
5. `evento` es append-only: nunca UPDATE, nunca DELETE.
6. El estado del semaforo se deriva en `packages/shared/src/estado.ts`; no se guarda en ninguna columna.
7. Nunca versionar secretos ni editar a mano nada bajo `drizzle/`.
8. Nunca marcar una tarea hecha con una compuerta en rojo.
9. Los colores, radios y sombras salen de `packages/shared/src/tokens.ts`. Ningun componente escribe
   un hex ni un px crudo.

Arquitectura completa, fronteras de import y tokens de diseno: `docs/arquitectura.md`.
Es la fuente de verdad; este archivo es un puente.
