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
| Pruebas app movil | `pnpm test:mobile` |
| E2E | `pnpm test:e2e` |
| Servicios locales | `pnpm db:up` · `pnpm db:down` · `pnpm db:status` |
| Migraciones | `pnpm db:generate` → `pnpm db:migrate` · `pnpm db:check` |
| Semilla / reset | `pnpm db:seed` · `pnpm db:reset` |
| Worker | `pnpm worker:version` · `pnpm worker:dev` |

**Compuerta:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar nada hecho.

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

Arquitectura completa, fronteras de import y tokens de diseno: `docs/arquitectura.md`.
Es la fuente de verdad; este archivo es un puente.
