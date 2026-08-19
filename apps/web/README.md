# `@rutas/web` — Panel de supervision

Next.js 16 (App Router) sobre React 19. Es la pantalla del supervisor: planea las rutas de la
semana, ve en vivo si cada una va a tiempo, y saca los reportes del cliente.

No se corre suelto. Se levanta desde la raiz del monorepo con `pnpm dev`, que arranca tambien la
base local y el worker. Ver la tabla de comandos en `docs/arquitectura.md`.

```bash
pnpm dev          # desde la raiz — panel en http://127.0.0.1:3000
```

## Mapa de rutas

| Grupo | Ruta | Que es |
|---|---|---|
| `(auth)` | `/login` | Entrada con Google. No crea cuentas: exige una fila previa en `usuario` |
| | `/consentimiento` · `/privacidad` | Textos legales, publicos |
| `(panel)` | `/monitor` | Estado en vivo de las rutas de hoy, con captura manual del supervisor y cierre por incidente |
| | `/planeador` | Asignacion semanal de chofer y camion por horario |
| | `/catalogos/clientes` · `/catalogos/camiones` · `/catalogos/choferes` | Altas y bajas |
| | `/rutas` · `/paradas` | Recorridos, sus horarios por turno (editables mientras no haya arrancado el viaje de hoy), y los puntos con ubicacion |
| | `/reportes/{cumplimiento,ocupacion,ejecuciones,cliente}` | Los cuatro reportes por periodo |
| | `/bitacora` | Toda mutacion administrativa, paginada por cursor |
| `(imprimible)` | `/reportes/cliente/[id]/imprimible` | La pagina que el worker imprime a PDF con Chromium |
| `api` | `/api/reportes/ejecuciones.csv` | CSV en streaming, sin acumular en memoria |
| | `/api/reportes/pdf` | Proxy al worker, para no exponer `WORKER_SHARED_SECRET` al navegador |
| | `/api/dispositivos` | Alta del token de push de la app |

`/cuenta` aparece en el menu pero **todavia no existe como ruta**: da 404. Es un pendiente
conocido del proyecto.

## Como esta armado

Una peticion va: `app/(panel)/…/page.tsx` (server component) → `src/server/<dominio>.ts` →
`@rutas/shared/db` → Postgres. Las mutaciones son server actions en `actions.ts` junto a su ruta,
nunca un `fetch` del cliente hacia la propia API.

Todo es server component por defecto. `'use client'` solo donde hay estado, efectos o manejadores,
y siempre en la hoja — nunca en un `page.tsx`.

| Carpeta | Que vive ahi |
|---|---|
| `src/app/` | Rutas, layouts y server actions |
| `src/components/shell/` | El marco: barra lateral, barra superior, encabezado de pagina |
| `src/components/ui/` | Primitivos estilo shadcn (button, card, table, badge, dialog, input, select) |
| `src/server/` | Consultas y mutaciones. No importa React ni `components/` |
| `src/lib/` | Entorno, sesion, permisos (`authz/can.ts`), bitacora (`audit/registrar.ts`) |
| `src/proxy.ts` | Middleware: refresca la sesion y protege todo `(panel)` |

Las fronteras de import y la lista completa de "donde vive cada cosa" estan en
`docs/arquitectura.md`. Cruzarlas al reves rompe el build.

## El marco visual

Barra lateral verde oliva de 256px + barra superior blanca de 64px con la fecha operativa y el menu
de usuario + area de contenido gris claro que es lo unico que se desplaza. Todo bloque va dentro de
una `Card` blanca: los filtros en la suya, la tabla en la suya.

Los colores no se escriben a mano en ningun componente: salen de `packages/shared/src/tokens.ts`,
que `src/app/globals.css` reenvia como variables CSS. La tabla de tokens esta en
`docs/arquitectura.md`.

Bajo 768px las tablas colapsan a tarjetas y la barra lateral se vuelve un cajon. Ninguna pantalla
produce scroll horizontal a 320px — hay una prueba e2e que lo verifica.

**Dialogos con formulario** (rutas, paradas, camiones, choferes) llevan
`onPointerDownOutside={(e) => e.preventDefault()}`: un clic afuera cerraba el dialogo y el
`onOpenChange` reseteaba el form, perdiendo todo lo capturado. Escape y el boton de cerrar siguen
funcionando. Los `DialogoConfirmar` no lo llevan, porque no hay nada que perder.

**El ancho se pide siempre con prefijo `sm:`** (`sm:max-w-2xl`). `DialogContent` ya trae
`sm:max-w-sm` en su clase base, y `tailwind-merge` no considera en conflicto dos clases con
variantes distintas: un `max-w-2xl` pelado convive con la base y pierde en el CSS compilado, asi que
el formulario se queda en 24rem por mas ancho que le pidas.

## Verificar

Desde la raiz del monorepo:

```bash
pnpm typecheck && pnpm lint && pnpm test    # la compuerta
pnpm test:e2e                               # necesita la base local arriba (pnpm db:up)
```

Las pruebas e2e no pueden usar el login real (es OAuth de Google), asi que
`tests/e2e/ayuda-sesion.ts` crea un usuario de prueba y replica la cookie que deja `@supabase/ssr`.

## Notas de despliegue

Vercel, root directory `apps/web`, build `pnpm turbo run build --filter=@rutas/web`, runtime Node 24.
Todo el panel lleva `noindex`: es interno y no hay VPN ni Cloudflare Access delante. Procedimientos
de rollback y rotacion de secretos en `docs/runbook.md`.
