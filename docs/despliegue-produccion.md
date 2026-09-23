# Despliegue a produccion — paso a paso

Este documento esta escrito para que **alguien sin experiencia tecnica** pueda dejar el sistema
funcionando en produccion siguiendo las instrucciones en orden, sin decidir nada por su cuenta.

Si algo no coincide exactamente con lo que ves en pantalla, **detente y pregunta**. No improvises:
cada paso deja algo escrito en un servicio de pago o en la base de datos real.

Cuando el sistema ya este arriba y haya que operarlo (respaldos, rollback, rotar contraseñas), el
documento es otro: [runbook.md](runbook.md).

---

## Antes de empezar

### Que vamos a levantar

Son cuatro piezas separadas. Cada una vive en un servicio distinto y se sube por separado:

| Pieza | Que es | Donde vive |
|---|---|---|
| Base de datos | Donde se guarda todo (rutas, choferes, eventos) | Supabase |
| Panel web | La pantalla que usan supervisores y administradores | Vercel |
| Worker | Proceso de fondo: manda notificaciones y arma los PDF | Railway |
| App Android | La app que usa el chofer en su telefono | Expo (EAS) + Google Play |

**El orden importa.** La base de datos primero, porque las otras tres necesitan sus datos de
conexion. La app del chofer al final, porque necesita que el panel ya exista.

### Que necesitas tener a la mano

- Una computadora con acceso a internet.
- Una tarjeta de credito de la empresa (Supabase, Vercel y Railway tienen planes de pago; ver §0.3).
- El correo corporativo de la empresa y saber cual es el **dominio** (la parte despues de la `@`,
  por ejemplo `tregar.com.mx`). Se usa en el paso 2.6.
- Una libreta o documento donde ir **pegando valores**. Durante el proceso vas a copiar unas 15
  cadenas de texto largas. Si pierdes una, hay que volver por ella.
- Alrededor de **3 a 4 horas** la primera vez.

### Reglas que no se rompen nunca

1. **Los valores secretos jamas se escriben en el codigo ni se mandan por WhatsApp o correo.** Solo
   se pegan en los formularios de "Environment Variables" de cada servicio, que es donde este
   documento te dice que van.
2. **Nunca ejecutes `pnpm db:seed` apuntando a produccion.** Ese comando **borra toda la base de
   datos** antes de llenarla con datos de prueba. Es exclusivamente para la computadora de un
   desarrollador.
3. Si un paso falla, **no lo repitas tres veces esperando que cambie**. Anota el mensaje de error
   completo y pregunta.

### Glosario minimo

- **Repositorio / repo:** la carpeta con el codigo del proyecto, guardada en GitHub.
- **Deploy / desplegar:** subir el codigo a un servicio para que quede funcionando en internet.
- **Variable de entorno:** un dato de configuracion (una direccion, una contraseña) que se le da al
  servicio por fuera del codigo. Cada servicio tiene una pantalla para capturarlas.
- **Terminal:** la ventana negra donde se escriben comandos. En Windows se llama PowerShell.

---

## Paso 0 — Preparar la computadora y las cuentas

### 0.1 Instalar las herramientas

Estas tres cosas se instalan una sola vez. Si ya estan, saltate el paso.

1. **Node.js version 24 o mayor.** Descargalo de <https://nodejs.org> (opcion "LTS" si ya dice 24 o
   mas; si no, la opcion "Current"). Instalador siguiente-siguiente-terminar.
2. **Git.** Descargalo de <https://git-scm.com/downloads>. Instalador siguiente-siguiente-terminar.
3. **pnpm.** Abre PowerShell y escribe esto tal cual, y presiona Enter:

   ```powershell
   corepack enable
   ```

Para comprobar que quedo, escribe cada linea y confirma que responde un numero de version:

```powershell
node --version    # debe decir v24.algo o mas
git --version
pnpm --version
```

### 0.2 Bajar el codigo

En PowerShell:

```powershell
cd C:\
git clone <URL DEL REPOSITORIO EN GITHUB> Tregar\Rutas_Tregar
cd C:\Tregar\Rutas_Tregar
pnpm install --frozen-lockfile
```

La ultima linea tarda varios minutos y escupe mucho texto. Es normal.

### 0.3 Crear las cuentas

Crea las cinco cuentas con el **correo corporativo**, no con uno personal. Anota en tu libreta con
que correo quedo cada una.

| Servicio | Donde | Plan que se necesita |
|---|---|---|
| GitHub | <https://github.com/signup> | Gratuito |
| Supabase | <https://supabase.com/dashboard/sign-up> | **Pro (de pago)** — el gratuito no tiene respaldos diarios |
| Vercel | <https://vercel.com/signup> | Gratuito para empezar |
| Railway | <https://railway.app> | De pago (el gratuito apaga el proceso) |
| Expo | <https://expo.dev/signup> | Gratuito para empezar |
| Google Play Console | <https://play.google.com/console/signup> | Pago unico de registro |

> **Por que Supabase Pro:** el plan gratuito no hace respaldos automaticos. Sin respaldos, un error
> el dia de mañana significa perder los datos sin vuelta atras.

---

## Paso 1 — Base de datos (Supabase)

### 1.1 Crear el proyecto

1. Entra a <https://supabase.com/dashboard> → **New project**.
2. Nombre: `rutas-tregar-produccion`.
3. **Database Password:** haz clic en **Generate a password** y **guarda ese valor en tu libreta
   ahora mismo**. Supabase no te lo vuelve a mostrar.
4. **Region: `East US (North Virginia)` / `us-east-1`.** Es la mas cercana a Monterrey de las
   disponibles.
5. **Create new project.** Tarda unos 2 minutos en quedar listo.

### 1.2 Copiar los datos de conexion

Cuando el proyecto este verde:

1. Ve a **Project Settings** (el engrane) → **Database** → seccion **Connection string**.
3. Copia a tu libreta, etiquetandolas:
   - La cadena de **Shared pooler** en modo **transaction** (puerto `6543`) → etiqueta: `DATABASE_URL`
   - La cadena de **Shared pooler** en modo **session** (puerto `5432`, mismo host que la anterior,
     algo como `aws-0-<region>.pooler.supabase.com`) → etiqueta: `DIRECT_DATABASE_URL`

   > ⚠️ **No uses la opcion "Direct connection"** (host `db.<ref>.supabase.co`) para
   > `DIRECT_DATABASE_URL` aunque el nombre coincida. Ese host solo tiene registro DNS **IPv6**, y la
   > mayoria de las redes/ISP en Mexico no lo resuelven — la migracion del paso 1.3 falla con
   > `getaddrinfo ENOTFOUND` sin mensaje claro. El **Shared/Session pooler** (puerto `5432`) es
   > compatible con IPv4, es gratis, y sirve igual de bien para migraciones.
   >
   > Las dos cadenas (`DATABASE_URL` y `DIRECT_DATABASE_URL`) deben ser del **mismo proyecto** de
   > Supabase (mismo `<ref>` en el usuario `postgres.<ref>` y mismo host) — solo cambia el puerto.
4. En las dos cadenas, donde diga `[YOUR-PASSWORD]`, **sustituye ese texto** (incluidos los
   corchetes) por la contraseña que guardaste en 1.1. Si la contraseña tiene caracteres especiales
   (`@`, `#`, `/`, espacios, etc.), hay que **percent-encodearlos** antes de pegarlos en la cadena, o
   la conexion falla.

5. Ve a **Project Settings** → **API** y copia tambien:
6. 
   - **Project URL** → etiqueta: `NEXT_PUBLIC_SUPABASE_URL`
   - Llave **anon / public** → etiqueta: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Llave **service_role** → etiqueta: `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ La llave **service_role** es la llave maestra de la base de datos. Solo se pega en Vercel
> (paso 3.3). **Nunca** va en la app del chofer, nunca en un correo, nunca en el codigo.

### 1.3 Crear las tablas

Todavia en tu computadora, en PowerShell dentro de `C:\Tregar\Rutas_Tregar`, ejecuta estas dos
lineas **sustituyendo** lo que va entre comillas por las cadenas de tu libreta:

```powershell
$env:DATABASE_URL = "<tu DATABASE_URL>"
$env:DIRECT_DATABASE_URL = "<tu DIRECT_DATABASE_URL>"
pnpm db:migrate
```

Esto crea las tablas y las reglas de seguridad en el Supabase de produccion. Para verificar:

```powershell
pnpm db:check
```

Debe terminar sin errores y confirmar que las tablas esperadas existen.

> **No corras `pnpm db:seed`.** Ese comando vacia la base. Aqui no aplica.

### 1.4 Configurar el acceso con Google

El panel se entra con la cuenta de Google corporativa. Hay que conectarlo:

1. En Supabase: **Authentication** → **Providers** → **Google** → activarlo.
2. Supabase te muestra una **Callback URL**. Copiala.
3. En otra pestaña, entra a <https://console.cloud.google.com> con el correo corporativo:
   - Crea un proyecto llamado `Rutas Tregar`.
   - **APIs & Services** → **OAuth consent screen** → tipo **Internal** → llena nombre de la app
     (`Rutas`) y correo de contacto → Guardar.
   - **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → tipo
     **Web application**.
   - En **Authorized redirect URIs**, pega la Callback URL que copiaste de Supabase.
   - Crear. Google te muestra un **Client ID** y un **Client Secret**: copialos.
4. Regresa a Supabase y pega el Client ID y el Client Secret en el proveedor de Google. Guardar.

Anota tambien en tu libreta, con la etiqueta `GOOGLE_OAUTH_ALLOWED_DOMAIN`, el dominio de correo de
la empresa **sin la arroba** (ejemplo: `tregar.com.mx`). Solo los correos de ese dominio podran
entrar al panel.

### 1.5 Confirmar los respaldos

**Project Settings** → **Database** → **Backups**. Debe decir que hay respaldos diarios con 7 dias
de retencion. Si no aparece, el proyecto no esta en plan Pro: corrigelo antes de seguir.

---

## Paso 2 — Panel web (Vercel)

### 2.1 Subir el codigo a GitHub

Si el repositorio todavia no esta en GitHub, pidele a quien desarrolla que lo suba. Vercel se
conecta a GitHub, no a tu carpeta local.

### 2.2 Importar el proyecto

1. <https://vercel.com/new> → conectar la cuenta de GitHub → elegir el repositorio.
2. **Root Directory:** haz clic en **Edit** y escribe `apps/web`. Este campo es obligatorio; si lo dejas vacio el deploy falla.
3. **Framework Preset:** Next.js (lo detecta solo).
4. **Build Command:** activa el override y escribe:

   ```
   pnpm turbo run build --filter=@rutas/web
   ```

5. **Install Command:** `pnpm install --frozen-lockfile`
6. **Node.js Version** (en Settings → General, despues de crear el proyecto): **24.x**.

### 2.3 Capturar las variables de entorno

Antes de darle a Deploy, abre **Environment Variables** y captura una por una. Marca las tres
ambientes (Production, Preview, Development) salvo que se indique otra cosa.

| Nombre | Valor |
|---|---|
| `APP_TIMEZONE` | `America/Mexico_City` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | de tu libreta (1.2) |
| `DIRECT_DATABASE_URL` | de tu libreta (1.2) |
| `NEXT_PUBLIC_SUPABASE_URL` | de tu libreta (1.2) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | de tu libreta (1.2) |
| `SUPABASE_SERVICE_ROLE_KEY` | de tu libreta (1.2) — **solo Production** |
| `GOOGLE_OAUTH_ALLOWED_DOMAIN` | el dominio de la empresa (1.4) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ver 2.4 (opcional) |
| `WORKER_BASE_URL` | se llena en el paso 3.5 — dejala pendiente |
| `WORKER_SHARED_SECRET` | ver 2.5 |
| `PANEL_BASE_URL` | se llena en el paso 2.7 — dejala pendiente |

### 2.4 Llave de Google Maps (opcional pero recomendada)

Sin esta llave el sistema **sigue funcionando**: el formulario de paradas pide las coordenadas a
mano en vez de mostrar un mapa. Si la quieres:

1. En el mismo proyecto de Google Cloud del paso 1.4: **APIs & Services** → habilita
   **Maps JavaScript API** y **Geocoding API**.
2. **Credentials** → **Create Credentials** → **API key**.
3. **Restringe la llave** por referente HTTP al dominio del panel. Una llave sin restringir la puede
   usar cualquiera y la factura llega a la empresa.
4. Pega el valor en `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

### 2.5 Generar el secreto compartido

Es la contraseña con la que el panel y el worker se reconocen entre si. Generala en PowerShell:

```powershell
node -e "console.log(crypto.randomUUID())"
```

Copia el resultado a tu libreta con la etiqueta `WORKER_SHARED_SECRET`. **El mismo valor** se captura
en Vercel (aqui) y en Railway (paso 3.3). Si no coinciden, los reportes en PDF no se generan.

### 2.6 Desplegar

**Deploy.** Tarda unos minutos. Cuando termine, Vercel te da una direccion terminada en
`.vercel.app`.

### 2.7 Dominio y ultimos ajustes

1. Si la empresa tiene un dominio propio (`rutas.tregar.com.mx`), agregalo en **Settings** →
   **Domains** y sigue las instrucciones de DNS que Vercel muestre.
2. La direccion definitiva del panel (la de dominio propio, o la `.vercel.app` si no hay dominio) se
   captura en las variables como `PANEL_BASE_URL`.
3. Regresa a Supabase → **Authentication** → **URL Configuration** y agrega esa misma direccion en
   **Site URL** y en **Redirect URLs**, con `/auth/callback` al final. Sin esto, el login con Google
   se queda dando vueltas.
4. Vuelve a desplegar en Vercel (**Deployments** → el mas reciente → **Redeploy**) para que tome las
   variables nuevas.

### 2.8 Dar de alta al primer usuario

Nadie puede entrar al panel si no existe ya su fila en la base de datos: el sistema **no crea
cuentas solo**. Pidele a quien desarrolla que inserte la primera fila de administrador con el correo
corporativo correspondiente. A partir de ahi, ese administrador da de alta a los demas desde el
propio panel.

Prueba el resultado: abre la direccion del panel, entra con Google y confirma que llegas a la
pantalla del monitor.

---

## Paso 3 — Worker (Railway)

El worker es el proceso que manda las notificaciones a los choferes y genera los PDF.

### 3.1 Crear el servicio

1. <https://railway.app> → **New Project** → **Deploy from GitHub repo** → elegir el repositorio.
2. En el servicio creado: **Settings** → **Source** → **Root Directory**: dejalo en la raiz (`/`).
   **No lo pongas en `apps/worker`**: el worker necesita ver todo el proyecto para construirse.
3. **Settings** → **Build** → **Dockerfile Path**: `apps/worker/Dockerfile`.

### 3.2 Region

**Settings** → **Region** → `us-west`.

### 3.3 Variables de entorno

**Variables** → capturar:

| Nombre | Valor |
|---|---|
| `APP_TIMEZONE` | `America/Mexico_City` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | de tu libreta (1.2) |
| `SUPABASE_SERVICE_ROLE_KEY` | de tu libreta (1.2) |
| `NEXT_PUBLIC_SUPABASE_URL` | de tu libreta (1.2) |
| `WORKER_PORT` | `8080` |
| `WORKER_SHARED_SECRET` | **el mismo valor** que pusiste en Vercel (2.5) |
| `PANEL_BASE_URL` | la direccion del panel (2.7) |
| `EXPO_ACCESS_TOKEN` | ver 3.4 |

### 3.4 Token de Expo

1. Entra a <https://expo.dev> → tu foto → **Account settings** → **Access tokens** → **Create
   token**.
2. Copialo a tu libreta y pegalo en Railway como `EXPO_ACCESS_TOKEN`.

Sin este token el worker arranca igual, pero las notificaciones push no salen.

### 3.5 Publicar la direccion del worker

1. **Settings** → **Networking** → **Generate Domain**. Railway te da una direccion terminada en
   `.up.railway.app`.
2. Copiala y capturala en **Vercel** como `WORKER_BASE_URL` (la que quedo pendiente en 2.3).
3. Vuelve a desplegar el panel en Vercel para que la tome.

### 3.6 Comprobar que vive

**Settings** → **Deploy** → **Health Check Path**: `/salud`.

Y desde tu PowerShell, sustituyendo la direccion:

```powershell
curl.exe https://rutasworker-production.up.railway.app/salud
```

Debe responder `{"db":"ok"}` con codigo 200. Si responde `{"db":"caida"}` (503), revisa que
`DATABASE_URL` este bien capturada en Railway. Si Railway devuelve `502 Application failed to
respond` (un error del proxy, no del worker), el proceso no esta escuchando en el puerto que
Railway espera: revisa que la variable `WORKER_PORT` coincida con el puerto configurado en
**Settings → Networking** (por default, `8080`).

> **Nunca escales el worker a mas de una instancia.** Dos copias del mismo proceso mandarian las
> notificaciones por duplicado.

---

## Paso 4 — App Android (Expo + Google Play)

> ⚠️ **Este paso tiene trabajo pendiente de desarrollo antes de poderse ejecutar.** Ver la seccion
> "Pendientes conocidos" al final. No lo intentes hasta que quien desarrolla confirme que ya esta
> resuelto.

### 4.1 Variables de la app

La app se compila con tres valores dentro. Se capturan en Expo:
<https://expo.dev> → el proyecto → **Configuration** → **Environment variables**:

| Nombre | Valor |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | el mismo que `NEXT_PUBLIC_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | el mismo que `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `EXPO_PUBLIC_PANEL_BASE_URL` | la direccion del panel (2.7) |

Estas tres **no son secretas**: quedan dentro de la app instalada, y asi esta diseñado. Lo que
protege los datos son las reglas de seguridad de la base (RLS), no el ocultar estas llaves. Por lo
mismo, la `SUPABASE_SERVICE_ROLE_KEY` **jamas** entra aqui.

### 4.2 Compilar

Desde PowerShell en la carpeta del proyecto:

```powershell
pnpm dlx eas-cli@21.5.0 login
pnpm dlx eas-cli@21.5.0 build --profile interno --platform android
```

El build corre en los servidores de Expo y tarda entre 10 y 25 minutos. Al terminar te da un enlace
de descarga.

### 4.3 Distribuir a los telefonos

**Camino principal — Google Play interno:**

1. Alta de Android Enterprise en la Google Admin Console de la empresa (una sola vez, la hace TI).
2. Subir el archivo `.aab` que produjo el build a Google Play Console → **Internal testing**.
3. Los telefonos dados de alta reciben la app solos.

**Camino alterno — instalar el archivo directo:**

1. Descargar el `.apk` del enlace del build.
2. Pasarlo al telefono (cable USB o enlace interno).
3. El chofer tiene que aceptar una vez "instalar de origenes desconocidos".

Los dos caminos entregan exactamente la misma app.

---

## Paso 5 — Verificacion final

Marca cada casilla antes de anunciar que el sistema esta en produccion:

- [ ] El panel abre en su direccion definitiva.
- [ ] El login con Google funciona con un correo del dominio de la empresa.
- [ ] Un correo de **otro** dominio (por ejemplo un gmail personal) **es rechazado**.
- [ ] El monitor en vivo carga sin error.
- [ ] `GET /salud` del worker responde `ok`.
- [ ] Se genera un PDF de reporte desde el panel sin error.
- [ ] Supabase muestra respaldos diarios activos.
- [ ] Un chofer de prueba instala la app, entra, y marca un hito que aparece en el panel.
- [ ] Todos los valores de la libreta quedaron guardados en el gestor de contraseñas de la empresa,
      y la libreta de papel se destruyo.
- [ ] Al menos dos personas tienen acceso a los cinco paneles (Supabase, Vercel, Railway, Expo,
      Google Play). Un solo dueño es un riesgo.

---

## Pendientes conocidos antes de un lanzamiento real

Esto no lo puede resolver quien sigue este documento; se lo tienes que pedir a quien desarrolla:

1. **No existe `apps/mobile/eas.json`.** El comando de build del paso 4.2 usa el perfil `interno`,
   que se define en ese archivo. Sin el, el build falla.
2. **`apps/mobile/app.json` conserva valores de plantilla:** el nombre y el identificador de la app
   son `mobile`, y el color de la pantalla de arranque es azul (`#208AEF`) en vez del verde de la
   marca. Hay que corregirlos antes de compilar algo que vea un chofer.
3. **Primer usuario administrador:** no hay pantalla para crearlo; la primera fila se inserta a mano
   en la base (paso 2.8).
4. **Restauracion de respaldo nunca probada.** El respaldo existe, pero hasta que no se restaure uno
   de verdad es una suposicion. Ver §2 del [runbook](runbook.md); conviene hacerlo la primera
   semana.

---

## Si algo sale mal

| Sintoma | Causa mas probable | Que hacer |
|---|---|---|
| El deploy de Vercel falla al instalar | Root Directory no quedo en `apps/web` | Settings → General → corregir y redeploy |
| El login con Google da vueltas y regresa | Falta la URL en Supabase → URL Configuration | Paso 2.7.3 |
| El login rechaza un correo valido | `GOOGLE_OAUTH_ALLOWED_DOMAIN` mal escrito, o falta la fila del usuario | Revisar el valor en Vercel; paso 2.8 |
| `pnpm db:migrate` falla con `[ELIFECYCLE] Command failed` y sin ningun mensaje de error visible | Bug conocido de `drizzle-kit`: al fallar, corta el proceso sin imprimir el error real | Corre `pnpm db:migrate:debug` para ver el error de verdad |
| El error real dice `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | `DIRECT_DATABASE_URL` quedo con la cadena de **Direct connection** (IPv6 only) | Usa la del **Shared/Session pooler**, puerto `5432` — ver 1.2 |
| El panel abre pero no muestra datos | `DATABASE_URL` mal capturada (falta sustituir la contraseña) | Paso 1.2.3 |
| `/salud` del worker responde error | `DATABASE_URL` mal capturada en Railway | Paso 3.3 |
| El PDF no se genera | `WORKER_SHARED_SECRET` distinto entre Vercel y Railway | Paso 2.5 |
| Las notificaciones no llegan | Falta o vencio `EXPO_ACCESS_TOKEN` | Paso 3.4 |

**Deshacer un despliegue que rompio algo:** ve al [runbook](runbook.md), seccion 3 — Rollback. En
resumen: en Vercel, **Deployments → el anterior → Promote to Production**; en Railway,
**Deployments → el anterior → Redeploy**. Primero el panel, despues el worker.
