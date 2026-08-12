# Rutas — Transporte de Personal

Panel web para supervisores y app Android para choferes de una empresa de transporte de personal en
Monterrey. El supervisor planea rutas; el chofer marca cinco hitos por ruta; el panel muestra en vivo
si cada ruta va a tiempo, tarde o adelantada.

## Comandos

| Tarea | Comando |
|---|---|
| Instalar | `pnpm install --frozen-lockfile` |
| Dev (todo) | `pnpm dev` — panel en http://127.0.0.1:3000 |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint / formato | `pnpm lint` · `pnpm format` |
| Pruebas | `pnpm test` · un archivo: `pnpm test <ruta>` |
| Pruebas app movil | `pnpm test:mobile` |
| E2E | `pnpm test:e2e` · un archivo: `pnpm test:e2e <ruta>` |
| Servicios locales | `pnpm db:up` · `pnpm db:down` · `pnpm db:status` |
| Generar entorno | `pnpm env:write` |
| Migraciones | `pnpm db:generate` → `pnpm db:migrate` |
| Migracion a mano | `pnpm db:generate:custom` |
| Verificar esquema | `pnpm db:check` |
| Semilla / reset | `pnpm db:seed` · `pnpm db:reset` |
| Worker | `pnpm worker:version` · `pnpm worker:dev` |
| Diagnostico Expo | `pnpm mobile:doctor` |

**Compuerta:** `pnpm typecheck && pnpm lint && pnpm test` pasa antes de marcar cualquier tarea hecha.

La version de Node esta fijada en `.nvmrc`. Las versiones de dependencias viven en `pnpm-lock.yaml`
— leelo, nunca adivines una. La app movil instala **siempre** con `npx expo install`, jamas con
`pnpm add`: `pnpm add` trae el `latest` de npm y cuatro paquetes nativos tienen un `latest` mas nuevo
que el pin del SDK 57 que rompe el build.

## Stack

Turborepo · pnpm · TypeScript · Next.js (panel, Vercel) · Expo / React Native (app, distribucion
interna) · Hono sobre Node en contenedor (worker, Railway) · Supabase Postgres + Supabase Auth ·
Drizzle ORM · Tailwind + shadcn/ui (web) · NativeWind (app) · Biome · Vitest + Playwright.

## Arquitectura

**Ruta de una peticion del panel.** navegador → `apps/web/src/app/(panel)/…/page.tsx` (server
component) → `apps/web/src/server/<dominio>.ts` → `packages/shared/src/db/index.ts` (`@rutas/shared/db`)
→ Postgres. **Ese es el unico cliente Drizzle del proyecto**: el panel no abre uno propio. Las mutaciones
pasan por `apps/web/src/app/(panel)/…/actions.ts`, nunca por un `fetch` del cliente.

**Ruta de un toque del chofer.** pantalla → `apps/mobile/src/outbox/registrar.ts` escribe en SQLite
local con su `client_event_id` → la UI avanza al instante → `apps/mobile/src/outbox/flusher.ts` sube
la cola cuando hay red → `@supabase/supabase-js` → Postgres, **directo**, sin pasar por el panel.
La frontera de seguridad de ese camino es RLS y nada mas.

**Fronteras.** Cruzar una al reves rompe el build:

| Capa | Puede importar de | Jamas |
|---|---|---|
| `apps/web/src/app/**` | `components`, `server`, `lib`, `@rutas/shared` | importar `@rutas/shared/db` directo |
| `apps/web/src/components/**` | `lib`, otros componentes, `@rutas/shared` | importar `server/` o `@rutas/shared/db` |
| `apps/web/src/server/**` | `lib`, `@rutas/shared` | importar React o `components/` |
| `apps/mobile/src/**` | `@rutas/shared`, `lib/supabase`, `outbox` | usar la service role key |
| `apps/worker/src/**` | `@rutas/shared`, `lib` | importar cualquier cosa de `apps/web` |
| `packages/shared/**` | nada interno | importar de `apps/**` |

**Donde vive cada cosa.**

| Asunto | Fuente unica |
|---|---|
| Esquema de datos | `packages/shared/src/db/schema.ts` — se edita ahi y luego `pnpm db:generate` |
| Politicas RLS | `packages/shared/src/db/rls.sql`, aplicadas por una migracion custom |
| Derivacion del semaforo | `packages/shared/src/estado.ts` — funcion pura, probada con vitest |
| Tolerancias del semaforo | `packages/shared/src/estado.ts` — constantes exportadas, jamas literales sueltos |
| Tokens de diseno | `packages/shared/src/tokens.ts` — sin hex ni px crudos en componentes |
| Entorno | `apps/web/src/lib/env.ts` — validado al arranque; nunca `process.env` en otro lado |
| Permisos | `apps/web/src/lib/authz/can.ts` — una sola `can(usuario, accion, recurso)` |
| Bitacora | `apps/web/src/lib/audit/registrar.ts` — se escribe en la MISMA transaccion que la mutacion |
| Sesion | `apps/web/src/lib/supabase/server.ts` (web) · `apps/mobile/src/lib/supabase.ts` (app) |

## Reglas de codigo

1. **Un componente por archivo, maximo 250 lineas.** Mas largo significa que hay que partirlo.
2. **Alias `@/` → `src/` dentro de cada app.** Nada de `../../..`. El paquete compartido se importa
   como `@rutas/shared` y exporta TypeScript fuente, sin paso de build.
3. **Imports internos sin extension.** Los scripts sueltos corren con `tsx` (que honra los `paths`
   del tsconfig), jamas con `node` a secas sobre un `.ts`.
4. **Server-first en el panel.** Todo es server component por defecto; `'use client'` solo para
   estado, efectos o manejadores, y siempre en la hoja, nunca en la pagina.
5. **Validar en el borde.** Toda server action y todo route handler parsea su entrada con un esquema
   zod de `@rutas/shared` antes de tocar logica de negocio.
6. **Los errores regresan resultados tipados**, no strings lanzados: `{ ok: true, data } | { ok: false, error }`.
7. **`evento` es append-only.** Jamas un UPDATE ni un DELETE sobre esa tabla.
8. **El estado del semaforo se deriva, nunca se guarda.** No existe ninguna columna de estado.
9. **Sin barrel files** fuera de `packages/shared/src/index.ts`.
10. **Sin dependencia nueva sin razon en el mensaje de commit.** Revisa antes si ya existe una.

## Sistema de diseno

Los tokens se definen una vez en `packages/shared/src/tokens.ts`. Los componentes usan nombres de
token, jamas literales.

La marca es el **verde oliva Tregar**, el mismo del logo y el mismo que pinta la app del chofer.

| Rol | Valor | Para |
|---|---|---|
| Marca | `#547F37` · hover `#456B2D` · tinte `#EEF4E9` | Boton primario, barra lateral, foco |
| Acento de marca | `#6DAB3C` | Enlace activo de la barra lateral, badge de exito |
| Fondo | `#FFFFFF` | Tarjetas, barra superior |
| Superficie | `#F8FAFC` | Fondo del area de contenido, debajo de las tarjetas |
| Borde | `#E2E8F0` | Divisores, inputs |
| Texto | `#0A0E1A` primario · `#64748B` secundario | Cuerpo, leyendas |
| Alerta | `#DC2626` destructivo · `#D97706` advertencia · `#2563EB` informativo | Badges y confirmaciones |
| Semaforo pendiente | `#0A0E1A` sobre `#F1F5F9` | `Pendiente` |
| Semaforo en curso | `#FFFFFF` sobre `#D97706` | `En curso` |
| Semaforo a tiempo | `#FFFFFF` sobre `#6DAB3C` | `A tiempo` |
| Semaforo tarde | `#FFFFFF` sobre `#DC2626` | `Tarde` |
| Semaforo adelantado | `#FFFFFF` sobre `#2563EB` | `Adelantado` |

- **El semaforo es una pastilla de color pleno con su texto dentro.** El texto siempre esta en el
  DOM, nunca solo el color de fondo. **Contrapartida asumida a proposito:** los cinco rellenos se
  aplanan a grises parecidos impresos en blanco y negro, que es como acaba el reporte del cliente en
  la junta — si eso empieza a estorbar, el arreglo es devolver el icono de `semaforo[estado].icono`
  a `PastillaEstado`, que sigue exportado en los tokens justo para eso.
- **Tipografia:** Inter con stack de sistema de respaldo. Escala 12/14/16/20/24/32.
  **Numerales tabulares obligatorios en toda hora y todo contador** (`font-variant-numeric: tabular-nums`).
- **Espaciado** base 4px · **radio** 10px web / 12px app · borde 1px.
- **Una sola elevacion:** `shadow-tarjeta` (`0 1px 2px 0 rgb(0 0 0 / 0.05)`) sobre tarjetas y botones
  rellenos, y `shadow-menu` para lo que flota (menu de usuario, cajon movil). No hay una tercera.
- **Web:** el marco es barra lateral verde solida de 256px + barra superior blanca de 64px + area de
  contenido `surface` que es lo unico que se desplaza. Todo bloque de contenido va dentro de una
  `Card` blanca: filtros en la suya, tabla en la suya. Filas de tabla de 52px (`h-12` en el
  encabezado, `p-4` en la celda), sin animacion decorativa. El monitor en vivo se disena primero a
  375px y despues se expande; bajo 768px las tablas colapsan a tarjetas.
- **El boton primario de cada pantalla vive en `EncabezadoPagina`**, alineado a la derecha del
  titulo — no en una fila suelta encima de la tabla. La accion destructiva de una fila es `ghost`
  con `text-destructive`; el rojo pleno se reserva para el boton que confirma dentro de un dialogo.
- **App:** fondo blanco, alto contraste (se usa al sol). Boton primario de ancho completo, **72px de
  alto**, texto 20px semibold, **un solo objetivo tactil activo por pantalla**. Sin modo oscuro en v1.

## Entorno

Las variables, su proposito y desde que paso son obligatorias estan en `.env.example` y en la §10 del
blueprint. `.env.example` se versiona (hay una excepcion `!.env.example` en `.gitignore`); cualquier
`.env` con valores reales, jamas.

`apps/web/src/lib/env.ts` valida al arranque y **degrada por paso**: una variable es obligatoria solo
desde el paso que la consume. Esto es lo que impide que el paso 2 rompa la compuerta del paso 1.

Toda herramienta suelta que lee entorno carga `.env` desde su propio config con
`process.loadEnvFile('.env')`: `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts` y cada
script de `scripts/`. Nunca se asume que el entorno viene cargado del shell.

## Reglas por area

Lee el archivo correspondiente antes de editar esa area:

| Archivo | Aplica a |
|---|---|
| `docs/reglas/datos-y-rls.md` | `packages/shared/src/db/**`, `drizzle/**`, `scripts/**` |
| `docs/reglas/panel-web.md` | `apps/web/**` |
| `docs/reglas/movil-expo.md` | `apps/mobile/**` |
| `docs/reglas/worker-y-reportes.md` | `apps/worker/**` |

## No negociable

1. **La app del chofer habla directo a Supabase: un error de politica RLS es una fuga de datos, no un
   bug de UI.** Toda tabla nueva nace con RLS activo y con su prueba de aislamiento.
2. **La service role key jamas sale del servidor.** Nunca en `apps/mobile`, nunca en un bundle de
   cliente, nunca en una variable `NEXT_PUBLIC_` ni `EXPO_PUBLIC_`.
3. **Toda mutacion administrativa pasa por `can()` y escribe en `audit_log` en la misma transaccion.**
   Si una de las dos falla, ninguna se aplica.
4. **El GPS nunca bloquea nada.** Un evento sin permiso o sin senal se guarda igual con coordenadas
   nulas y su bandera.
5. **Todo timestamp es `timestamptz` y toda hora se interpreta en `America/Mexico_City`** por zona
   IANA, jamas por offset fijo.
6. Nunca versionar secretos, `.env`, ni salida de build.
7. Nunca editar a mano un archivo generado (`drizzle/**`, `pnpm-lock.yaml`).
8. Nunca marcar una tarea hecha con una compuerta en rojo.

<!-- Orden de construccion, criterios de aceptacion y comandos de verificacion:
     ../blueprints/rutas-transporte-personal/tasks.json y epics/. No los repitas aqui. -->
