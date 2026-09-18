# Entorno de pruebas en la nube (staging) — paso a paso

Este documento levanta el sistema completo en **servicios reales de internet**, pero con datos de
mentira y proyectos aparte, para probarlo de punta a punta **antes** de tocar nada de produccion.

Se le llama *staging*: un clon de produccion que se puede romper, vaciar y volver a llenar sin
consecuencias. Nadie de la empresa lo usa; sirve para que quien desarrolla y quien va a operar el
sistema vean como se comporta "de verdad" —con dominios, HTTPS, arranques en frio, login real de
Google y notificaciones push— sin arriesgar datos reales.

## Cual documento es cual

| Documento | Para que | Toca dinero / datos reales |
|---|---|---|
| [pruebas-manuales.md](pruebas-manuales.md) | Probar TODO en tu computadora, con Docker. Empieza por aqui siempre. | No |
| **entorno-staging.md** (este) | Probar en la nube lo que la computadora no puede: OAuth real, push real, build de la app, dominios, arranque en frio. | Si, pero con proyectos desechables y planes gratuitos |
| [despliegue-produccion.md](despliegue-produccion.md) | Dejar el sistema funcionando para la empresa, con datos reales. | Si |
| [runbook.md](runbook.md) | Operar produccion ya arriba: respaldos, rollback, rotar secretos. | Si |

**Haz staging solo cuando la prueba local (`pruebas-manuales.md`) ya te quedo verde.** Staging no
reemplaza esa prueba: agrega encima lo que solo se puede ver en la nube.

---

## 1. ¿Necesitas staging, o te alcanza con la prueba local?

La prueba local ([pruebas-manuales.md](pruebas-manuales.md)) ya cubre casi todo: el flujo completo
del supervisor, los cinco hitos del chofer, el cierre por incidente, el monitor en vivo, los
reportes, la bitacora, el aislamiento RLS entre choferes, y hasta el PDF del cliente.

Lo que **solo** se puede probar en un entorno en la nube —y por lo que este documento existe— es:

| Solo en staging | Por que no sale en local |
|---|---|
| **Login con Google real** | El proveedor de Google esta apagado en la config local a proposito (`pruebas-manuales.md` §13). Necesita un cliente OAuth real con una URL publica de redireccion. |
| **Notificaciones push al telefono** | Requieren una cuenta de Expo con proyecto dado de alta y un `EXPO_ACCESS_TOKEN` que en local no existe. |
| **La app instalada de verdad (EAS build)** | En local la app corre bajo Expo Go. El `.apk`/`.aab` firmado que se instala en un telefono se compila en los servidores de Expo. |
| **Dominio propio + HTTPS + DNS** | `127.0.0.1` no tiene dominio ni certificado. |
| **Arranque en frio del worker y de las funciones de Vercel** | En local todo esta siempre caliente. La primera peticion despues de un rato de inactividad se comporta distinto. |
| **RLS contra el Postgres de Supabase hospedado** | Las politicas son las mismas, pero conviene verlas correr una vez contra la infraestructura real. |
| **Ensayo de restauracion de respaldo** | `runbook.md` §2: "un respaldo que nunca se restauro es una suposicion". Staging es donde se ensaya sin riesgo. |

Si nada de la lista de arriba te hace falta todavia, **no montes staging**: sigue con la prueba
local y ahorrate las cuentas.

---

## 2. Qué es igual y qué cambia frente a `despliegue-produccion.md`

**La mecanica es la misma.** Son las mismas cuatro piezas (Supabase, Vercel, Railway, Expo), en el
mismo orden (base de datos → panel → worker → app), con **los mismos nombres de variables de
entorno**, la misma configuracion de build en Vercel (`Root Directory` = `apps/web`, build
`pnpm turbo run build --filter=@rutas/web`, Node 24), el mismo apreton de manos del
`WORKER_SHARED_SECRET` entre panel y worker, el mismo `GET /salud` del worker, y las mismas regiones.

Si ya seguiste `despliegue-produccion.md` una vez, staging se siente igual. Lo que cambia:

| Tema | `despliegue-produccion.md` | En staging |
|---|---|---|
| **Proyectos en cada servicio** | `rutas-tregar-produccion` | Proyectos **nuevos y aparte**, con sufijo `-staging`. Nunca reutilices el proyecto, la base ni las llaves de produccion. |
| **Plan de Supabase** | **Pro obligatorio** (respaldos diarios) | **Free sirve.** Staging es desechable; si se pierde, se resiembra. |
| **Plan de Railway** | De pago | El plan de prueba / hobby alcanza. |
| **`pnpm db:seed`** | **PROHIBIDO** — borra toda la base | **Se usa y se espera.** `pnpm db:seed --forzar` llena staging con 90 rutas, 38 choferes y 15 dias de datos. Es la diferencia mas grande entre los dos documentos. |
| **Primer usuario administrador** | Se inserta una fila a mano en la base (§2.8) | El seed ya deja `admin@test.com` / `Admin123!` y `supervisor@test.com` / `Supervisor123!` usables desde el formulario de correo y contrasena. Sin SQL a mano. |
| **Login con Google** | Obligatorio configurarlo (§1.4) | Opcional. O montas un segundo cliente OAuth con la URL de staging, o entras con el correo/contrasena del seed. |
| **Dominio propio** | Recomendado (§2.7) | Opcional. Usa las URLs `.vercel.app` y `.up.railway.app` que te dan los servicios. |
| **Respaldos** | Confirmar que esten activos (§1.5) | No hacen falta. Staging es donde se **ensaya** la restauracion (`runbook.md` §2), no donde se depende de ella. |
| **Manejo de secretos** | Gestor de contrasenas de la empresa, destruir la libreta de papel (§5) | Menos ceremonia: son secretos de un entorno de mentira. Aun asi, no los pegues en el codigo ni los mandes por chat. |
| **Cuando terminas** | El sistema queda encendido para siempre | Pausa o borra el stack de staging cuando no lo uses, para no pagar de mas (§7). |
| **Redeploy** | Manual, con cuidado | Puede auto-desplegar desde una rama `staging` o desde cada Pull Request (preview de Vercel). |

**La compuerta de codigo no cambia:** `pnpm typecheck && pnpm lint && pnpm test` sigue teniendo que
pasar antes de dar por terminado cualquier cambio, exista o no staging.

---

## 3. Paso a paso

Los pasos remiten a `despliegue-produccion.md` para no repetir 400 lineas. Aqui solo va lo que
cambia.

### 3.0 Preparativos

- Herramientas (`despliegue-produccion.md` §0.1) y codigo bajado (§0.2): **identico**. Si ya lo
  hiciste para la prueba local, ya esta.
- Cuentas (§0.3): **reutiliza las mismas cuentas** de GitHub, Supabase, Vercel, Railway y Expo. No
  necesitas cuentas nuevas, solo **proyectos** nuevos dentro de ellas. No hace falta Google Play
  Console para staging salvo que quieras probar el canal interno de Play.
- **Regla de oro de staging:** ten una sola terminal para esto y **confirma antes de cada comando
  destructivo que las variables de entorno apuntan a staging**, no a produccion. El comando
  `pnpm db:seed --forzar` borra lo que sea que le pongas enfrente.

### 3.1 Base de datos — Supabase staging

Sigue `despliegue-produccion.md` §1.1 y §1.2 con estos cambios:

1. **New project** → nombre `rutas-tregar-staging`. **Plan Free.** Region `East US (North Virginia)`
   igual que produccion.
2. Guarda la `Database Password` en el momento (Supabase no la vuelve a mostrar).
3. Copia los mismos seis valores que pide §1.2 (`DATABASE_URL`, `DIRECT_DATABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`),
   etiquetados como **staging** para no confundirlos nunca con los de produccion.

**Crear las tablas.** En PowerShell dentro de `C:\Tregar\Rutas_Tregar`, define las variables **solo
en esta sesion de terminal** (asi tu `.env` local para desarrollo no se toca):

```powershell
$env:DATABASE_URL = "<DATABASE_URL de staging>"
$env:DIRECT_DATABASE_URL = "<DIRECT_DATABASE_URL de staging>"
$env:NEXT_PUBLIC_SUPABASE_URL = "<NEXT_PUBLIC_SUPABASE_URL de staging>"
$env:SUPABASE_SERVICE_ROLE_KEY = "<SUPABASE_SERVICE_ROLE_KEY de staging>"
pnpm db:migrate
pnpm db:check
```

`db:check` debe confirmar que existen las doce tablas y que `evento` no tiene politicas de UPDATE ni
DELETE.

> **Por que funciona sin tocar `.env`:** los scripts cargan `.env` con `process.loadEnvFile`, que
> **no pisa** una variable que ya exista en la terminal. Lo que pusiste con `$env:` gana. Cierra esa
> terminal cuando termines y las variables de staging desaparecen.

**Llenar staging con datos de prueba** — esto es lo que produccion **no** permite:

```powershell
pnpm db:seed --forzar
```

`scripts/seed.ts` se niega a correr contra una base que no sea local salvo que le pases `--forzar`,
que —cita del propio script— *"existe para un staging desechable y para nada mas"*. El seed:

- **Vacia las doce tablas y borra las cuentas de Auth** antes de sembrar. En staging eso es lo que
  quieres; en produccion seria una fuga de datos.
- Deja 1 admin, 1 supervisor, 38 choferes, 15 paradas, 3 camiones y 90 rutas (30 por turno), mas 3
  dias de historial cerrado, HOY, y 14 dias de planeacion hacia adelante.
- Imprime las credenciales al final. Son fijas: `admin@test.com` / `Admin123!`,
  `supervisor@test.com` / `Supervisor123!`, y los choferes `driver1`..`driver38` con `Driver123!`.

Cada vez que quieras volver staging a cero, vuelve a correr `pnpm db:seed --forzar` con las
variables de staging puestas.

### 3.2 Login con Google (opcional en staging)

Dos caminos:

- **Rapido:** no configures Google. Entra al panel con el formulario de correo y contrasena, usando
  `admin@test.com` / `Admin123!` del seed. Sirve para casi todo.
- **Completo:** si lo que quieres probar es justamente el login con Google, sigue
  `despliegue-produccion.md` §1.4, pero crea un **cliente OAuth aparte** en Google Cloud (o agrega
  una segunda `Authorized redirect URI` con la Callback URL del Supabase de staging). El
  `GOOGLE_OAUTH_ALLOWED_DOMAIN` puede ser el dominio real de la empresa o uno de prueba.

### 3.3 Panel web — Vercel staging

Sigue `despliegue-produccion.md` §2, con estos cambios:

- **Proyecto nuevo** en Vercel, importado del mismo repo, llamado `rutas-tregar-staging`. Alternativa
  sin proyecto nuevo: usa los **Preview Deployments** de una rama `staging` — Vercel le da a cada
  rama su propia URL.
- `Root Directory`, `Build Command`, `Install Command`, `Node.js Version`: **identicos** a §2.2.
- Variables de entorno (§2.3): **mismos nombres**, valores de **staging**:
  - `DATABASE_URL`, `DIRECT_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → los de 3.1.
  - `WORKER_SHARED_SECRET` → genera uno **nuevo para staging** (`node -e "console.log(crypto.randomUUID())"`),
    distinto del de produccion. El mismo valor va en Railway (3.4).
  - `PANEL_BASE_URL` y `WORKER_BASE_URL` → se llenan despues, igual que en produccion.
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` → opcional; si la pones, restringe la llave al dominio de
    staging.
- Deploy. Anota la URL `.vercel.app` como `PANEL_BASE_URL` y capturala en las variables.
- Si configuraste Google (3.2): en Supabase de staging → **Authentication** → **URL Configuration**,
  agrega la URL del panel en **Site URL** y en **Redirect URLs** con `/auth/callback` al final.
  Redeploy.
- **Primer usuario:** no insertes nada a mano. El seed ya dejo el admin. Entra y confirma que llegas
  al monitor.

### 3.4 Worker — Railway staging

Sigue `despliegue-produccion.md` §3, con estos cambios:

- **Servicio nuevo** (o un *environment* `staging` dentro del mismo proyecto de Railway). El plan de
  prueba / hobby alcanza.
- `Root Directory` en la raiz (`/`), `Dockerfile Path` = `apps/worker/Dockerfile`, region `us-west`:
  **identicos** a §3.1–3.2.
- Variables (§3.3): mismos nombres, valores de staging. `WORKER_SHARED_SECRET` = **el mismo** que
  pusiste en Vercel en 3.3. `EXPO_ACCESS_TOKEN` → uno real de expo.dev si vas a probar push; si no,
  el worker arranca igual sin el.
- **Generate Domain** → capta la URL `.up.railway.app` en Vercel como `WORKER_BASE_URL` y redeploy
  del panel.
- Comprueba: `curl.exe https://<worker-staging>.up.railway.app/salud` debe responder con
  `"ok":true` y `"db":"ok"`.
- **No escales el worker a mas de una instancia**, igual que en produccion.

### 3.5 App Android — EAS build contra staging

> ⚠️ Este paso arrastra los mismos **pendientes de desarrollo** que `despliegue-produccion.md` §4
> ("Pendientes conocidos"): no existe `apps/mobile/eas.json`, y `apps/mobile/app.json` conserva
> valores de plantilla. **Staging es el lugar correcto para resolverlos y ensayarlos** antes de
> produccion, pero hasta que existan, el build no corre.

Dos caminos:

- **Solo JavaScript (rapido):** corre la app bajo **Expo Go** apuntando a staging. Edita el `.env`
  (o pasa las variables) para que `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` y
  `EXPO_PUBLIC_PANEL_BASE_URL` sean los de staging, y arranca con
  `pnpm --filter @rutas/mobile start --clear`. Prueba login y los cinco hitos contra la base de
  staging. Lo que **no** ves asi: el icono, el nombre y la pantalla de arranque reales, ni las
  notificaciones push nativas.
- **App instalada de verdad:** cuando ya exista `eas.json` con un perfil (p. ej. `staging` o
  `interno`) que empaquete las URLs de staging, sigue `despliegue-produccion.md` §4.2:
  `pnpm dlx eas-cli@21.5.0 build --profile <perfil> --platform android`. Instala el `.apk` en un
  telefono de prueba y verifica login, hitos, cierre por incidente y **que la push llegue**.

Recuerda: `EXPO_PUBLIC_*` **no son secretas** —quedan dentro de la app— pero la
`SUPABASE_SERVICE_ROLE_KEY` **jamas** entra a la app, ni en staging ni en produccion.

---

## 4. Guion de prueba en staging

1. Corre **primero** el guion completo de [pruebas-manuales.md](pruebas-manuales.md) §8 apuntado a
   las URLs de staging (panel `.vercel.app`, worker `.up.railway.app`). Todo lo que pasa en local
   debe pasar igual aqui.
2. Encima, prueba lo que solo staging da:
   - [ ] **Login con Google** con un correo del dominio permitido: entra. Con un correo de otro
         dominio (gmail personal): **es rechazado**.
   - [ ] **Arranque en frio:** deja el worker sin trafico 15–20 min, luego abre el panel y genera un
         PDF. La primera peticion tarda mas; no debe fallar.
   - [ ] **Notificacion push:** con la app instalada (3.5, camino 2) y `EXPO_ACCESS_TOKEN` puesto en
         Railway, dispara un aviso y confirma que llega al telefono.
   - [ ] **La app instalada:** icono, nombre y pantalla de arranque son los de la marca Tregar, no
         los de plantilla.
   - [ ] **Dominio propio** (si lo configuraste): el panel abre por HTTPS en la URL definitiva y el
         login con Google redirige bien.
   - [ ] **Ensayo de restauracion** (`runbook.md` §2): restaura el respaldo mas reciente de staging a
         **otro** proyecto nuevo y corre `pnpm db:check` contra el. Borra ese proyecto al terminar.
3. Opcional — **carga con el simulador:** con el panel de staging arriba,
   `pnpm sim -- --base-url=https://<staging>.vercel.app --duration=3d` recorre varios dias de
   operacion simulada y verifica que el monitor, los eventos y los reportes aguanten.

---

## 5. Volver staging a cero

Cuando la base se llene de basura de pruebas:

```powershell
# con las variables de staging puestas en la terminal (3.1)
pnpm db:seed --forzar
```

Eso solo re-siembra los **datos**. Si cambiaste el **esquema** (una migracion nueva), primero:

```powershell
pnpm db:migrate
pnpm db:seed --forzar
```

Las credenciales despues de resembrar son siempre las mismas (`admin@test.com` / `Admin123!`,
`driver1` / `Driver123!`…): el seed no genera nada al azar.

---

## 6. Diferencias de seguridad que NO cambian en staging

Aunque los datos sean de mentira, estas reglas siguen aplicando —son las mismas de produccion y del
`CLAUDE.md` del proyecto—:

- La `SUPABASE_SERVICE_ROLE_KEY` **jamas** sale del servidor: nunca en `apps/mobile`, nunca en un
  bundle de cliente, nunca en una variable `NEXT_PUBLIC_` ni `EXPO_PUBLIC_`.
- El `WORKER_SHARED_SECRET` de staging es **distinto** del de produccion. Si se filtra uno, no se
  filtra el otro.
- Toda tabla nueva nace con RLS activo y su prueba de aislamiento. Staging no es excusa para
  probar contra una tabla sin RLS.
- Los secretos van en los formularios de *Environment Variables* de cada servicio, nunca en el
  codigo ni en un chat.

---

## 7. Apagar staging cuando no se usa

Staging cuesta dinero mientras corre. Cuando no lo estes usando:

| Servicio | Como pausarlo | Nota |
|---|---|---|
| Supabase | El proyecto Free se pausa solo tras inactividad; se puede reactivar desde el dashboard | Al reactivar, resiembra con `pnpm db:seed --forzar` si perdio datos |
| Vercel | No cobra por estar quieto; puedes dejar el proyecto | Borra los Preview Deployments viejos si se acumulan |
| Railway | **Detén o borra el servicio** — es lo que mas cuesta quieto | Redeploy desde el repo cuando lo vuelvas a necesitar |
| Expo | El build ya termino; no cobra por estar quieto | — |

Cuando termines de usar staging para siempre (ya lanzaste produccion y no lo necesitas), **borra los
proyectos** de Supabase y Railway: una copia de datos —aunque sean de prueba— y un servicio
encendido sin dueno son riesgo y gasto.

---

## 8. Antes de pasar a producción real

Marca esto antes de abrir `despliegue-produccion.md` con datos reales:

- [ ] El guion de `pruebas-manuales.md` §8 pasa completo contra staging.
- [ ] El login con Google funciona en staging (si produccion lo va a usar).
- [ ] La app instalada por EAS abre, entra y marca un hito que aparece en el panel de staging.
- [ ] Una notificacion push llega a un telefono de prueba.
- [ ] Se ensayo una restauracion de respaldo de staging a un proyecto nuevo (`runbook.md` §2).
- [ ] Los pendientes de `despliegue-produccion.md` §4 (`eas.json`, `app.json`) quedaron resueltos y
      verificados en staging.
- [ ] Los proyectos de staging quedan claramente nombrados con `-staging`, para que nadie los
      confunda con produccion.
