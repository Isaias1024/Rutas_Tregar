# Guia de pruebas manuales — Rutas: Transporte de Personal

Esta guia sirve para levantar **todo el sistema en tu propia computadora** y probarlo a mano, de
punta a punta, sin tocar nada en internet y sin datos reales de la empresa.

Esta escrita para alguien que **nunca ha programado**. No hace falta entender el codigo: hace falta
copiar comandos, pegarlos en una ventana y mirar lo que responde. Cada paso dice que deberias ver
cuando sale bien y que hacer cuando sale mal.

- **Primera vez (instalar + preparar):** entre 40 y 90 minutos, casi todo esperando descargas.
- **Cada vez despues:** unos 5 minutos para encender todo.

> **Nada de lo que hagas aqui toca produccion.** La base de datos vive dentro de tu computadora, en
> Docker. Se puede borrar y volver a crear cuantas veces quieras (§11).

---

## Indice

1. [Que son las tres piezas del sistema](#1-que-son-las-tres-piezas-del-sistema)
2. [Como usar esta guia (terminal, carpetas, copiar y pegar)](#2-como-usar-esta-guia)
3. [Programas que hay que instalar una sola vez](#3-programas-que-hay-que-instalar-una-sola-vez)
4. [Preparar el proyecto (una sola vez)](#4-preparar-el-proyecto-una-sola-vez)
5. [Encender el sistema (cada sesion de pruebas)](#5-encender-el-sistema-cada-sesion-de-pruebas)
6. [Entrar al panel web](#6-entrar-al-panel-web)
7. [Encender la app del chofer](#7-encender-la-app-del-chofer)
8. [Guion de prueba end to end](#8-guion-de-prueba-end-to-end)
9. [Probar el worker por separado](#9-probar-el-worker-por-separado)
10. [Correr las pruebas automaticas](#10-correr-las-pruebas-automaticas)
11. [Apagar todo y volver a cero](#11-apagar-todo-y-volver-a-cero)
12. [Cuando algo falla](#12-cuando-algo-falla)
13. [Limites conocidos del modo local](#13-limites-conocidos-del-modo-local)

---

## 1. Que son las tres piezas del sistema

| Pieza | Que es | Donde la ves | Quien la usa de verdad |
|---|---|---|---|
| **Panel web** | Un sitio web | En tu navegador, en `http://127.0.0.1:3000` | El supervisor y el administrador |
| **App del chofer** | Una app de celular Android | En un telefono o en un emulador | El chofer, en el patio de maniobras |
| **Worker** | Un programa sin pantalla | Solo responde en `http://127.0.0.1:8787` | Nadie: trabaja solo (avisos y reportes PDF) |
| **Base de datos** | Postgres dentro de Docker | Un panel de administracion en `http://127.0.0.1:54323` | Las tres piezas de arriba |

Las cuatro tienen que estar encendidas al mismo tiempo para una prueba completa.

Numeros de puerto que van a aparecer todo el tiempo:

| Direccion | Que es |
|---|---|
| `http://127.0.0.1:3000` | Panel web |
| `http://127.0.0.1:8787` | Worker |
| `http://127.0.0.1:54321` | Supabase (base de datos y sesiones) |
| `http://127.0.0.1:54322` | Postgres directo |
| `http://127.0.0.1:54323` | Supabase Studio — ver y editar tablas a mano |
| `http://127.0.0.1:54324` | Mailpit — bandeja de correos falsos |

> `127.0.0.1` y `localhost` significan lo mismo: **esta computadora**. Por eso un telefono NO puede
> abrir esas direcciones — ver §7.

---

## 2. Como usar esta guia

### 2.1 Abrir una terminal

La "terminal" es una ventana donde se escriben comandos.

1. Presiona la tecla **Windows**.
2. Escribe `powershell` y presiona **Enter**.
3. Se abre una ventana azul o negra. Esa es la terminal.

### 2.2 Ponerte en la carpeta del proyecto

**Todos** los comandos de esta guia se corren desde la carpeta del proyecto. Cada vez que abras una
terminal nueva, lo primero es esto (copia la linea completa y pega con clic derecho o `Ctrl+V`):

```powershell
cd "C:\Users\isaia\OneDrive\Documentos\Tregar\Rutas_Tregar"
```

Para confirmar que estas en el lugar correcto:

```powershell
dir package.json
```

Si responde con una linea que contiene `package.json`, estas bien. Si dice
`No se encuentra la ruta de acceso`, la carpeta no es esa.

### 2.3 Convenciones de esta guia

- Los bloques grises son comandos: se copian **completos** y se pegan tal cual.
- **"Deja esta ventana abierta"** significa exactamente eso: si la cierras, esa pieza se apaga.
- Para **detener** un programa que esta corriendo en una terminal: haz clic en esa ventana y presiona
  `Ctrl+C`.
- Vas a terminar con **tres o cuatro ventanas de terminal abiertas a la vez**. Es normal. Conviene
  ponerles nombre mental: "la de la base", "la del panel", "la de la app".

---

## 3. Programas que hay que instalar una sola vez

Instalalos **en este orden**. Despues de cada uno, **cierra todas las terminales y abre una nueva**
(si no, la terminal vieja no se entera de que instalaste algo).

### 3.1 Git para Windows — obligatorio

Descarga: <https://git-scm.com/download/win> → "64-bit Git for Windows Setup". Instalador siguiente,
siguiente, siguiente (los valores por defecto sirven).

> **Por que es obligatorio aunque no vayas a usar Git:** el proyecto corre varios comandos internos
> con sintaxis de Linux, y Git para Windows es lo que trae ese interprete (`bash`). Sin el,
> `pnpm db:up` falla con un error raro sobre `/dev/null`.

Verificar:

```powershell
git --version
```

Debe responder algo como `git version 2.51.0.windows.1`.

### 3.2 Node.js 24 — obligatorio

Descarga: <https://nodejs.org/> → la version **24 LTS** para Windows (archivo `.msi`). Instalador
siguiente, siguiente, siguiente.

Verificar:

```powershell
node -v
```

Debe responder `v24.` seguido de algo (`v24.11.1`, por ejemplo). **Si responde `v22` o menor, el
proyecto no arranca**: desinstala esa version e instala la 24.

### 3.3 pnpm 11.20.0 — obligatorio

Es el instalador de piezas del proyecto. Con Node ya instalado:

```powershell
npm install -g pnpm@11.20.0
```

Verificar:

```powershell
pnpm -v
```

Debe responder `11.20.0`.

### 3.4 Docker Desktop — obligatorio

Es lo que corre la base de datos dentro de tu computadora.

Descarga: <https://www.docker.com/products/docker-desktop/> → "Download for Windows".

Durante la instalacion te va a pedir habilitar **WSL 2**; acepta. Puede pedir **reiniciar la
computadora**: reinicia.

Despues de instalar:

1. Abre **Docker Desktop** desde el menu de inicio.
2. Espera a que la ballena de la barra de tareas deje de moverse y el programa diga **"Engine
   running"** abajo a la izquierda. Puede tardar uno o dos minutos.

Verificar (con Docker Desktop abierto):

```powershell
docker version
```

Si responde con dos bloques (`Client` y `Server`), esta listo. Si dice
`error during connect` o `Cannot connect to the Docker daemon`, Docker Desktop todavia no termino de
arrancar: espera y vuelve a intentar.

> **Docker Desktop tiene que estar abierto siempre que pruebes.** Si lo cierras, la base de datos se
> apaga y el panel deja de funcionar.

### 3.5 Un navegador — obligatorio

Chrome, Edge o Firefox. Cualquiera sirve.

### 3.6 Para probar la app del chofer — elige uno

| Camino | Que necesitas | Dificultad | Recomendado |
|---|---|---|---|
| **A. Telefono Android real** | Un Android + la app gratis **Expo Go** de Google Play + la misma red WiFi que la computadora | Facil | **Si** |
| **B. Emulador de Android** | **Android Studio** instalado (<https://developer.android.com/studio>, ~10 GB) y un telefono virtual creado | Media | Si no hay telefono a la mano |
| **C. Sin app** | Nada: los cinco hitos del chofer tambien se pueden capturar desde el panel ("Registrar evento a mano"). El **incidente** no: ese solo existe en la app (ver §10) | Facil | Solo si no puedes con A ni B |

Si eliges **B**, despues de instalar Android Studio abrelo una vez y ve a
**More Actions → Virtual Device Manager → Create Device**, elige un "Pixel 7", descarga la imagen de
sistema que te ofrezca y crea el dispositivo. Deja el emulador **abierto** cuando vayas a probar.

---

## 4. Preparar el proyecto (una sola vez)

Abre **una** terminal, ponte en la carpeta del proyecto (§2.2) y corre estos comandos **uno por uno,
en orden**, esperando a que cada uno termine.

### Paso 4.1 — Instalar las piezas del proyecto

```powershell
pnpm install --frozen-lockfile
```

Tarda de 2 a 10 minutos la primera vez. **Que deberias ver al final:** varias lineas con `+` y un
`Done in ...`. Si termina con `ERR_PNPM_...`, ve a §12.

### Paso 4.2 — Encender la base de datos

Con Docker Desktop **abierto**:

```powershell
pnpm db:up
```

La primera vez descarga varias imagenes: **puede tardar de 5 a 20 minutos** segun tu internet. Las
siguientes veces tarda menos de un minuto.

**Que deberias ver al final:** un bloque que empieza con `Started supabase local development setup.`
y una lista de direcciones (`API URL`, `DB URL`, `Studio URL`...). Tambien dice
`Stopped services: [realtime, storage, ...]` — **eso es correcto y esta hecho a proposito**, no es
un error.

Comprobar en cualquier momento:

```powershell
pnpm db:status
```

### Paso 4.3 — Generar el archivo de configuracion

```powershell
pnpm env:write
```

Esto crea un archivo llamado `.env` en la carpeta del proyecto, con las llaves y direcciones que las
tres piezas necesitan. Las saca de la base que acabas de encender.

**Que deberias ver:** `.env escrito a partir de .env.example + supabase status.`

Si ya lo habias corrido antes, responde `.env ya existe — no se toca.` Eso tambien esta bien: **es a
proposito**, para no pisar valores que hayas editado a mano.

> Si en cambio te dice **"No se pudo leer `supabase status`"**, la base no esta encendida: vuelve al
> paso 4.2.

### Paso 4.4 — Crear las tablas

```powershell
pnpm db:migrate
```

**Que deberias ver:** varias lineas `applying migration...` y al final ninguna palabra `error`.

### Paso 4.5 — Verificar que las tablas quedaron bien

```powershell
pnpm db:check
```

**Que deberias ver:** una confirmacion de que existen las doce tablas. Si falta alguna, repite 4.4.

### Paso 4.6 — Meter datos de ejemplo

```powershell
pnpm db:seed
```

> ⚠️ **Este comando BORRA TODOS los datos antes de sembrar**, incluidas las cuentas de acceso. Es a
> proposito: cada corrida deja la base exactamente igual. Solo funciona contra la base local; si lo
> apuntas a un Supabase que no sea `127.0.0.1`, se niega a correr.

**Que deberias ver:** las credenciales de todos los usuarios y un resumen que termina en
`Status: SUCCESS`.

Deja siempre esto, ni mas ni menos:

| Cosa | Cuantas |
|---|---|
| Administrador | 1 |
| Supervisor | 1 |
| Choferes | 3 |
| Paradas | `Stop 1` … `Stop 6` |
| Rutas | `Route 1`, `Route 2`, `Route 3`, cada una con su horario |
| Camiones | `T01`, `T02`, `T03`, uno por chofer |
| **Rutas programadas** | **0** |
| **Asignaciones** | **0** |

**Las credenciales, que no cambian nunca:**

| Quien | Se teclea | Contrasena |
|---|---|---|
| Administrador (panel) | `admin@test.com` | `Admin123!` |
| Supervisor (panel) | `supervisor@test.com` | `Supervisor123!` |
| Chofer 1 (app) | `driver1` | `Driver123!` |
| Chofer 2 (app) | `driver2` | `Driver123!` |
| Chofer 3 (app) | `driver3` | `Driver123!` |

> **Por que el chofer no teclea un correo:** la app pide **credencial**, no correo — el chofer nunca
> ve uno. Por dentro se convierte en `driver1@choferes.rutas.local`, pero eso no se escribe en
> ningun lado de la pantalla.

Las 3 rutas quedan **sin programar a proposito**: existen como plantillas para que puedas ejercitar
el Planeador desde cero (§8, paso 4). Ningun chofer trae rutas asignadas.

### Paso 4.8 — Si a un chofer se le perdio la contrasena

No hace falta al empezar: el paso 4.6 ya deja a los tres choferes con `Driver123!`. Sirve despues,
cuando esa contrasena dejo de servir porque probaste la pantalla de cambio obligatorio:

```powershell
pnpm chofer:prueba
```

Le devuelve `Driver123!` a `driver1` (y lo reactiva si lo diste de baja). **No crea choferes**: si
creara uno, ya no serian tres.

| Bandera | Para que |
|---|---|
| `--credencial driver2` | Trabajar sobre otro chofer sembrado |
| `--forzar-cambio` | Que vuelva a pedir el cambio de contrasena del primer ingreso (§8, paso 6) |

### Paso 4.7 — Instalar el navegador interno que genera los PDF

```powershell
pnpm exec playwright install chromium
```

Descarga unos 150 MB. Lo usan dos cosas: los reportes en PDF del worker y las pruebas automaticas.

**Listo.** La preparacion no se repite: la proxima vez empiezas directo en §5.

---

## 5. Encender el sistema (cada sesion de pruebas)

### Ventana 1 — la base de datos

1. Abre **Docker Desktop** y espera a que diga "Engine running".
2. Abre una terminal, ponte en la carpeta (§2.2) y corre:

```powershell
pnpm db:up
```

Cuando termine, esta ventana queda libre (la base sigue corriendo sola dentro de Docker). Puedes
usar esta misma ventana para los comandos sueltos de mas adelante.

**Comprobacion:** abre <http://127.0.0.1:54323> en el navegador. Debe aparecer Supabase Studio, donde
puedes ver las tablas. Si no carga, la base no esta encendida.

### Ventana 2 — el panel web y el worker, juntos

Abre una terminal **nueva**, ponte en la carpeta (§2.2) y corre:

```powershell
pnpm dev
```

**Deja esta ventana abierta.** Un solo comando enciende las dos piezas a la vez.

**Que deberias ver** (mezclado, porque son dos programas escribiendo en la misma ventana):

```
@rutas/web:dev: ▲ Next.js 16.3.0 (Turbopack)
@rutas/web:dev: - Local:         http://localhost:3000
@rutas/web:dev: ✓ Ready in 1103ms
@rutas/worker:dev: {"level":30,...,"msg":"servidor HTTP escuchando"}
@rutas/worker:dev: {"level":30,...,"msg":"rutas-worker arrancado"}
```

Las lineas del worker se ven feas porque son JSON. Es normal.

**Comprobaciones — hazlas siempre antes de empezar a probar:**

| Abre esto en el navegador | Debe mostrar |
|---|---|
| <http://127.0.0.1:3000/login> | Una pagina con el titulo "Rutas" y un boton "Entrar con Google" |
| <http://127.0.0.1:8787/salud> | El texto `{"db":"ok"}` |

Si `/salud` dice `{"db":"caida"}` o no carga, la base de datos no esta encendida: vuelve a la
ventana 1.

### Ventana 3 — la app del chofer (opcional)

Solo si vas a probar la app. Ver §7.

---

## 6. Entrar al panel web

### 6.1 Por que el boton "Entrar con Google" no funciona aqui

El panel real solo deja entrar con una cuenta de Google de la empresa. En tu computadora ese camino
esta **apagado a proposito**: encenderlo obligaria a dar de alta un cliente de OAuth real en Google
Cloud solo para probar en local.

Si presionas el boton vas a ver un error. **Es lo esperado.** El camino correcto para probar es el
de abajo.

### 6.2 El camino correcto: abrir el panel con una sesion de prueba

Abre una terminal **nueva** (o usa la ventana 1, que quedo libre), ponte en la carpeta (§2.2) y
corre:

```powershell
pnpm panel:sesion
```

**Que hace:** crea (si no existe) un usuario administrador de prueba, inicia sesion por ti y **abre
una ventana de navegador ya con la sesion puesta**, directo en el planeador.

**Que deberias ver en la terminal:**

```
Navegador abierto en http://127.0.0.1:3000/planeador
  usuario: admin (admin)

Cierra la ventana del navegador para terminar este comando.
```

Entra como el administrador sembrado (`admin@test.com`), no como un usuario aparte: asi el panel
sigue teniendo **exactamente un** administrador y un supervisor, como dice el paso 4.6.

Y una ventana de Chrome nueva mostrando el panel.

> **Usa esa ventana de navegador para toda la prueba.** Si abres el panel en otra ventana o en otro
> navegador, ahi no hay sesion y te va a mandar al login.

**Como se ve el panel, para que sepas que estas viendo lo correcto:**

- Una **barra lateral verde oliva** a la izquierda con el logo de Tregar arriba, los enlaces
  agrupados en Operacion / Catalogos / Analisis, y el enlace de la pantalla en la que estas
  resaltado en verde claro.
- Una **barra blanca arriba** con la fecha de hoy a la izquierda (en hora de Monterrey, sin importar
  la zona de tu computadora) y tu usuario a la derecha.
- El contenido sobre fondo gris muy claro, con cada bloque dentro de una **tarjeta blanca**: los
  filtros en una tarjeta, la tabla en otra.

☐ Presiona tu usuario arriba a la derecha. Se abre un menu con tu nombre, tu credencial, tu rol y
**Cerrar sesion**. No lo presiones todavia — al final de la prueba sirve para comprobar que la
sesion se cierra de verdad y te regresa al login.

Para probar con el otro rol:

```powershell
pnpm panel:sesion --rol supervisor
```

| Rol | Que ve en el menu |
|---|---|
| `admin` | Monitor, Planeador, Clientes, Camiones, Choferes, Rutas, Paradas, Reportes, Bitacora |
| `supervisor` | Lo mismo, sin ninguna diferencia |

**Los dos roles ven exactamente el mismo panel.** La unica accion que los distingue es
`crear_supervisor` (en `apps/web/src/lib/authz/can.ts`), que todavia no tiene ninguna pantalla que
la consuma. Si esperabas que el supervisor viera menos y ves lo mismo, esta bien: es el
comportamiento actual, no un defecto de tu instalacion.

El rol `chofer` es el unico que si queda fuera: el middleware le niega toda ruta del panel con
"No tienes permiso para ver esta seccion."

Para terminar: **cierra la ventana del navegador**; el comando termina solo.

---

## 7. Encender la app del chofer

### 7.1 Primero: decirle a la app donde esta el servidor

Este es el punto donde mas gente se atora, asi que leelo completo.

La app guarda la direccion del servidor en el archivo `.env` de la carpeta del proyecto. El valor que
genero `pnpm env:write` es `http://127.0.0.1:54321`, y eso **solo funciona si la app corre en la
misma computadora**. Un telefono o un emulador entienden `127.0.0.1` como *ellos mismos*, no como tu
PC.

Abre el archivo `.env` (esta en la carpeta del proyecto; abrelo con el Bloc de notas) y busca estas
dos lineas:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_PANEL_BASE_URL=http://127.0.0.1:3000
```

Cambia la parte `127.0.0.1` segun donde vayas a correr la app:

| Donde corre la app | `EXPO_PUBLIC_SUPABASE_URL` | `EXPO_PUBLIC_PANEL_BASE_URL` |
|---|---|---|
| Telefono Android real (camino A) | `http://LA-IP-DE-TU-PC:54321` | `http://LA-IP-DE-TU-PC:3000` |
| Emulador de Android Studio (camino B) | `http://10.0.2.2:54321` | `http://10.0.2.2:3000` |
| Navegador de la misma PC | `http://127.0.0.1:54321` | `http://127.0.0.1:3000` |

Para saber **la IP de tu PC** (camino A), corre en una terminal:

```powershell
ipconfig
```

Busca el bloque de tu adaptador WiFi y la linea `Direccion IPv4`. Es algo como `192.168.1.45`. Esa
es. El telefono tiene que estar en **la misma red WiFi**.

Guarda el archivo `.env` despues de editarlo.

> La primera vez que arranques el panel despues del cambio, Windows puede mostrar una alerta del
> **Firewall** preguntando si permites a Node.js aceptar conexiones: marca **Redes privadas** y
> acepta. Si no lo haces, el telefono no va a poder conectarse.

### 7.2 Arrancar la app

Abre una terminal **nueva**, ponte en la carpeta (§2.2) y corre:

```powershell
pnpm --filter @rutas/mobile start --clear
```

**Deja esta ventana abierta.** El `--clear` borra la memoria intermedia; usalo **siempre que hayas
tocado el archivo `.env`**, si no la app sigue usando la direccion vieja.

**Que deberias ver:** un cuadro grande hecho de puntos (un codigo QR) y un menu de teclas:

```
› Press a │ open Android
› Press r │ reload app
› Press ? │ show all commands
```

### 7.3 Camino A — telefono Android real

1. Instala **Expo Go** desde Google Play en el telefono.
2. Conecta el telefono a la **misma red WiFi** que la computadora.
3. Abre Expo Go → **Scan QR code** → apunta al codigo QR de la terminal.
4. La app se descarga y abre sola. La primera vez tarda medio minuto.

### 7.4 Camino B — emulador de Android Studio

1. Abre Android Studio → **Virtual Device Manager** → boton ▶ de tu telefono virtual.
2. Espera a que el telefono virtual termine de arrancar.
3. En la terminal donde corre el comando de §7.2, presiona la tecla **`a`**.
4. Expo instala Expo Go en el emulador y abre la app sola.

### 7.5 Camino C — sin app

Salta este apartado. En §8 se indica como capturar los mismos cinco hitos desde el panel. La prueba
de "terminar por incidente" del paso 6 **no** se puede hacer por este camino: ese evento solo lo
registra la app (§10).

### 7.6 Comprobacion

Cuando la app abra debes ver la pantalla de **inicio de sesion**, con los campos **Credencial** y
**Contrasena** y un boton verde grande **Entrar**.

Si ves una pantalla roja con un error que menciona `EXPO_PUBLIC_SUPABASE_URL`, el archivo `.env` no
se leyo: apaga con `Ctrl+C` y vuelve a arrancar con `--clear`.

---

## 8. Guion de prueba end to end

Este es el recorrido completo, en el mismo orden en que ocurre en la vida real. Marca cada casilla
conforme avances.

**Antes de empezar:** ventana 1 con la base encendida, ventana 2 con `pnpm dev` corriendo, y el panel
abierto con `pnpm panel:sesion` (§6.2).

---

### Paso 1 — Catalogos: dar de alta lo basico

☐ En el menu de la izquierda entra a **Clientes** → boton **Nuevo cliente** → nombre
`Aceros Monterrey` → **Crear**.

**Debe pasar:** la ventana se cierra y el cliente aparece en la tabla.

☐ Entra a **Paradas** → **Nueva parada** → nombre `Planta Oriente`, direccion cualquiera. Si no hay
llave de Google Maps configurada (lo normal en local), el formulario te pide **latitud** y
**longitud** a mano: escribe `25.6800` y `-100.2000`. → **Crear**.

**Debe pasar:** la parada aparece en la tabla. *(Que el mapa no aparezca es correcto en local, ver
§13.)*

☐ Entra a **Camiones** → **Nuevo camion** → codigo `T30`, tipo `Van`, placas `NLE-3001-C` → **Crear**.

---

### Paso 2 — El chofer con el que vas a probar la app

**Camino rapido (recomendado si solo quieres probar la app):** ya lo tienes del paso 4.6. Entra con
`driver1` / `Driver123!`. Salta al paso 3.

**Camino largo (para probar la pantalla de alta del panel):** este es el flujo real, el que usa el
supervisor en la vida diaria, y conviene recorrerlo **al menos una vez**. Ojo: crea un **cuarto**
chofer, asi que despues de probarlo el conteo ya no da tres.

☐ Entra a **Choferes** → **Nuevo chofer** → nombre `Chofer de Prueba`, telefono `8110000009` →
**Crear**.

**Debe pasar:** se abre una ventana titulada **"Chofer creado"** con dos datos:

```
Credencial          <algo como cprueba1>
Contrasena temporal <algo como 7fK2p-QwZa>
```

> ⚠️ **ANOTA LOS DOS AHORA MISMO, EN UN PAPEL O EN EL BLOC DE NOTAS.** Solo se muestran **una vez**:
> es a proposito, y el panel no tiene boton para volver a mostrarlos ni para restablecer la
> contrasena. Si los pierdes, o creas otro chofer, o usas `pnpm chofer:prueba` (§4.8), que si puede
> reimponer una contrasena conocida.

☐ Cierra la ventana. El chofer aparece en la tabla con estado activo.

---

### Paso 3 — Crear la ruta y su horario

☐ Entra a **Rutas** → **Nueva ruta** → nombre `Prueba - Planta Oriente`, cliente `Aceros Monterrey`,
parada de inicio y parada de fin (elige dos distintas) → **Crear**.

☐ En la fila de la ruta recien creada, agrega un **horario**: turno `mañana`, hora de inicio
esperada **una hora antes de la hora actual** (si son las 14:30, pon `13:30`), hora de fin esperada
una hora despues (`15:30`), personas esperadas `18`.

> **Por que una hora antes:** asi la ruta ya deberia haber empezado, y el semaforo del monitor tiene
> algo interesante que decir en vez de quedarse en "Pendiente" toda la prueba.

☐ **Prueba clave — el formulario no se cierra solo.** Abre **Nueva ruta** otra vez, escribe un
nombre y **haz clic fuera de la ventana**, sobre el fondo gris.

**Debe pasar:** la ventana **sigue abierta** y lo que escribiste **sigue ahi**. Antes se cerraba y se
perdia todo lo capturado. Cierra con la **X** o con `Escape` — esas si cierran, porque son
intencion, no un clic accidental.

☐ **Prueba de tamano:** con esa misma ventana abierta, fijate en que **usa el ancho de la pantalla**
y que los campos de hora se leen completos, no recortados a un solo numero. Achica la ventana del
navegador hasta el ancho de un telefono: el formulario se acomoda sin scroll horizontal.

☐ **Editar en vez de recrear.** En la fila del horario que acabas de crear, presiona **Editar**,
cambia `18` personas por `20` y guarda.

**Debe pasar:** el horario queda con `20` y **sigue siendo el mismo horario** — no aparece uno nuevo
ni se duplica la fila. Esto es lo que evita tener que borrar y recrear una ruta por un ajuste menor.

☐ **Desactivar, no borrar.** Fijate en que el boton rojo de la ruta dice **Desactivar**, no
"Borrar". No lo presiones todavia (lo vas a necesitar); solo confirma el texto. Una ruta desactivada
desaparece de las vistas pero **conserva su historico**: nunca se borra de la base.

---

### Paso 4 — Planear: asignar la ruta a un chofer para hoy

☐ Entra a **Planeador**. Vas a ver una cuadricula de la semana (lunes a domingo) con los horarios
como filas.

☐ Busca la columna de **hoy** y la fila de tu horario nuevo. Haz clic en la celda vacia.

☐ En el formulario elige el **chofer** `Chofer de Prueba` y el **camion** `T30` → **Asignar**.

**Debe pasar:** la celda ahora muestra el nombre del chofer y el codigo del camion.

☐ Prueba tambien que **no** se pueda asignar dos veces lo mismo: intenta asignar el mismo chofer a
otro horario que se traslape en hora. **Debe pasar:** aparece un mensaje de error explicando el
choque, y no se guarda nada. En la lista de choferes, el que ya trae una ruta encimada sale apagado
y con la leyenda `(horario encimado)`.

☐ **Un chofer si puede llevar varias rutas el mismo dia**, mientras las horas no se toquen. Asigna al
mismo `Chofer de Prueba` un segundo horario que **no** se encime — por ejemplo, si el primero va de
`13:30` a `15:30`, crea uno de `16:00` a `17:00` y asignaselo.

**Debe pasar:** se guarda sin quejarse, y las dos rutas aparecen con el mismo chofer. La regla no es
"un chofer, una ruta por dia": es "un chofer no puede tener dos rutas cuyos horarios se superpongan".

> **Dos rutas pegadas no son conflicto.** Si una termina a las `15:30` y la siguiente empieza a las
> `15:30` en punto, se permite: una acaba justo donde arranca la otra, no hay superposicion real.

---

### Paso 4b — Quitarle el chofer a una ruta sin borrar nada

☐ En **Planeador**, en la fila de una ruta que ya tenga chofer, presiona **Cancelar** y acepta la
confirmacion.

**Debe pasar, todo esto junto:**

- La linea con el chofer y el camion desaparece de inmediato.
- **La ruta sigue ahi**, con su horario y su boton **Asignar** listo para otro chofer.
- No se borro la ruta, ni el horario, ni la parada, ni se cancelo la ejecucion de la ruta.
- Si vuelves a asignar ese mismo horario, se deja.

> **Que hace por dentro:** no borra la fila, la marca como cancelada. El historico y los eventos que
> el chofer ya hubiera marcado se conservan — es lo que permite que el reporte del mes pasado siga
> cuadrando despues de una desasignacion. Lo unico que se suelta es el vinculo chofer + camion.

☐ Si algo sale mal (por ejemplo, otra pestana ya la cancelo), **debe aparecer el mensaje de error en
rojo debajo del boton**. Un boton que no hace nada y no dice por que es un defecto, no un exito.

---

### Paso 5 — Monitor: el estado antes de que el chofer haga nada

☐ Entra a **Monitor**.

**Debe pasar:** aparece una fila con tu ruta. Como el chofer todavia no marca nada y la hora
esperada de inicio ya paso, la pastilla del estado debe decir **`Tarde`** (relleno rojo) o
**`Pendiente`** (relleno gris claro) si la hora aun no llega.

☐ Fijate en que **la pastilla siempre trae el texto del estado escrito dentro**, no solo un color de
fondo. Eso es a proposito: alguien daltonico tiene que poder leer el estado.

☐ Arriba de la tabla hay una fila de pastillas de filtro con el conteo de cada estado. Presiona una:
la tabla se filtra y la pastilla se rellena de color. Presionala de nuevo para quitar el filtro.

☐ Deja el monitor abierto: **se refresca solo cada 30 segundos**. No hay que recargar la pagina. La
hora de la ultima actualizacion aparece a la derecha del buscador.

---

### Paso 6 — La app del chofer: los cinco hitos

*(Si elegiste el camino C —sin app—, salta al paso 7.)*

☐ En la app, escribe la **credencial** y la **contrasena temporal** que anotaste en el paso 2 →
**Entrar**.

**Debe pasar:** te manda de inmediato a una pantalla de **cambio de contrasena** (es obligatorio la
primera vez). Pon una contrasena nueva que recuerdes y confirmala.

☐ Prueba antes que una contrasena mal escrita da el mensaje generico **"Credencial o contrasena
incorrecta."** — nunca dice cual de las dos fallo. Es a proposito.

☐ Ya adentro, aparece la pantalla **Hoy** con la tarjeta de la ruta que le asignaste.

☐ Toca la tarjeta. Se abre el detalle de la ruta, con **un solo boton grande** abajo.

☐ Toca ese boton cinco veces, una por hito, en este orden:

| # | Boton | Que pide extra |
|---|---|---|
| 1 | Vi la ruta | nada |
| 2 | Estoy listo para iniciar | pide permiso de ubicacion la primera vez |
| 3 | Iniciar ruta | nada |
| 4 | Llegue al destino | **cuantas personas bajaron** (escribe `15`) |
| 5 | Finalizar ruta | **cuantas personas regresaron** (`15`) y **una confirmacion** |

**Debe pasar en cada uno:** la pantalla avanza **al instante** (no se queda "cargando"), el hito
recien marcado aparece arriba con su hora, y el boton cambia al siguiente paso.

El paso 5 es el unico que pregunta "¿seguro?" antes de guardar: cierra la ruta y `evento` es
append-only, asi que no se deshace desde la app. Los otros cuatro no preguntan, a proposito.

☐ **Prueba clave — el GPS nunca bloquea:** cuando pida el permiso de ubicacion, **niegalo**. El
evento se debe registrar igual, sin ningun error. Esa es la regla: sin senal o sin permiso, se guarda
con coordenadas vacias.

☐ **Prueba clave — sin internet:** antes de marcar el hito 4, pon el telefono (o el emulador) en
**modo avion**. Marca el hito. **Debe pasar:** la pantalla avanza igual, y aparece un indicador de
eventos pendientes. Quita el modo avion y espera unos segundos: el indicador se vacia solo y el
evento aparece en el monitor del panel.

☐ Entra a la pantalla **Semana**. Los dias futuros se ven, pero **no dejan marcar nada**: son solo
lectura.

☐ **Prueba clave — terminar por incidente.** Necesita **otra ruta** (asigna una segunda desde el
planeador, o repite en la del dia siguiente). Abre su detalle **sin marcar ningun hito**.

**Debe pasar:** debajo del boton grande aparece **"Terminar ruta por incidente"**, en rojo con
contorno y mas bajo que el boton principal. Tiene que estar visible **desde el primer momento**, sin
haber iniciado la ruta: un choque o una emergencia pueden impedir que la ruta arranque siquiera.

☐ Tocalo. **Debe pasar:** abre un modal que pregunta **la razon** — Emergencia Personal, Choque,
Trafico u Otro. Elige una.

**Debe pasar:** la ruta queda **COMPLETADA** (cerrada sin completarse) y ya no ofrece mas hitos ni
el boton de incidente. En el monitor del panel aparece el evento con su razon.

☐ Vuelve a la ruta que **si** terminaste con los cinco hitos. **Debe pasar:** ahi el boton de
incidente ya **no** aparece — una ruta cerrada no se puede terminar otra vez.

> Esta prueba cubre un bug real que estuvo vivo: el orden de los tipos de evento en la base
> declaraba el incidente entre "Llegue al destino" y "Finalizar ruta", y eso hacia que **ninguna
> ruta se pudiera cerrar normalmente**. Si el paso 5 falla con un error de "evento fuera de orden",
> es esto. Ver `docs/reglas/datos-y-rls.md`.

---

### Paso 7 — Monitor: ver lo que hizo el chofer

☐ Vuelve al panel, pestana **Monitor**. Espera hasta 30 segundos (se refresca solo).

**Debe pasar:** la fila de tu ruta cambio de estado. Segun a que hora marcaste contra la hora
esperada, la pastilla dira **`A tiempo`** (verde), **`Tarde`** (rojo), **`Adelantado`** (azul) o
**`En curso`** (ambar). Los contadores de personas que capturaste aparecen en la fila.

☐ **Captura manual (esto es tambien el camino C):** en la fila, presiona **Registrar**. Se abre
"Registrar evento a mano": elige un tipo de evento y una hora → guardar.

**Debe pasar:** el evento se registra, pero queda marcado con origen **supervisor**, distinto de los
que manda la app. Los reportes nunca suman los dos en una sola cifra — es exactamente el punto que
los reportes existen para mostrar.

☐ **Prueba de tamano:** achica la ventana del navegador hasta que sea angosta como un telefono
(o presiona `F12` y usa el modo de dispositivo movil). **Debe pasar:** la tabla se convierte en
tarjetas apiladas. **Nunca** debe aparecer una barra de desplazamiento horizontal.

☐ **Prueba clave — lo que ya ocurrio hoy no se edita.** Vuelve a **Rutas** y busca la ruta que el
chofer ya inicio.

**Debe pasar:** el boton **Editar** de la ruta y el del horario estan **desactivados**, y aparece la
leyenda *"Ya tiene un viaje iniciado o terminado hoy"*. Cambiar la hora de salida de una ruta que ya
salio dejaria el semaforo comparando contra un horario que nadie respeto.

**Debe seguir disponible:** **Desactivar** — sacar la ruta de circulacion a futuro siempre se puede;
lo que se bloquea es reescribir los datos contra los que ya se midio el viaje de hoy.

☐ Comprueba que una ruta **sin** viaje iniciado hoy si deja editarse. Manana esta misma ruta vuelve
a ser editable: el bloqueo es por dia operativo, no permanente.

---

### Paso 8 — Reportes

☐ Entra a **Reportes**. Hay cuatro pestanas: **Cumplimiento**, **Ocupacion**, **Ejecuciones** y
**Por cliente**.

☐ En cada una, ajusta el rango de fechas para que **incluya hoy** y presiona buscar.

**Debe pasar en las cuatro:** o muestran datos, o muestran un mensaje claro de "no hay datos" —
nunca una pagina en blanco.

☐ En **Ejecuciones**, presiona **Descargar CSV**.

**Debe pasar:** se descarga un archivo `.csv` que puedes abrir con Excel y trae una fila por
ejecucion, con las columnas de app y de supervisor separadas.

☐ En **Por cliente**, en la fila de tu cliente, presiona **Descargar** (columna PDF).

**Debe pasar:** el boton dice "Generando..." unos segundos y despues se descarga un PDF. Abrelo:
debe verse igual que la pantalla del reporte, con las pastillas de estado de color pleno y el nombre
del estado escrito dentro.

> Ese PDF lo genera el **worker**, no el panel: si falla, revisa que la ventana 2 siga corriendo y
> que hayas hecho el paso 4.7. Verificado en esta computadora: el PDF sale de unos 59 KB.

☐ **Prueba de impresion en blanco y negro:** abre el PDF y mandalo a imprimir (o vista previa) en
escala de grises.

**Que debe pasar:** el estado de cada fila **se sigue leyendo**, porque la pastilla trae el nombre
escrito dentro (`A tiempo`, `Tarde`, …), no solo un color.

> **Limitacion conocida y aceptada.** Impresos en gris, los cinco rellenos quedan en tonos
> parecidos: ya **no** se distinguen entre si de un vistazo, solo leyendo la palabra. Hasta el
> rediseno de agosto 2026 cada pastilla traia ademas un icono (`● A tiempo`, `▲ Tarde`) que si los
> separaba en gris; se quito al adoptar el diseno del portal Tregar, con la contrapartida sobre la
> mesa. Si en una junta el cliente se queja de que no distingue los estados en el papel, eso es el
> sintoma esperado, no un defecto de tu instalacion — el arreglo esta descrito en
> `docs/reglas/worker-y-reportes.md`.

---

### Paso 9 — Bitacora

☐ Entra a **Bitacora** (solo visible para el rol admin).

**Debe pasar:** aparecen registradas **todas** las acciones administrativas que hiciste hoy: crear el
cliente, la parada, el camion, el chofer, la ruta, la asignacion, la captura manual. Cada linea dice
quien, que y cuando.

☐ Prueba los filtros por actor y por tipo de recurso.

> Esta es una regla no negociable del proyecto: si la bitacora no se pudo escribir, la accion
> tampoco se aplica. Las dos van juntas o ninguna.

---

### Paso 10 — Baja de un chofer

☐ Entra a **Choferes** → en la fila de `Chofer de Prueba`, presiona la accion de **baja** → confirma.

**Debe pasar:**

- Sus datos personales (nombre, telefono) se borran o se vacian.
- La fila del usuario **no** desaparece: el historial de rutas que ya hizo se conserva.
- El movimiento queda en la **Bitacora**.

☐ Vuelve a la app del chofer y presiona algo. **Debe pasar:** la sesion ya no sirve y regresa al
login.

---

### Paso 11 — Accesibilidad

☐ En el panel, navega **una pantalla completa usando solo el teclado**: `Tab` para avanzar,
`Shift+Tab` para regresar, `Enter` para activar.

**Debe pasar:** siempre se ve claramente **cual elemento esta seleccionado** (un contorno de color
marca), y se puede llegar a todos los botones.

☐ Confirma que ninguna informacion dependa unicamente del color: la pastilla de cada estado trae el
nombre escrito dentro, y las columnas de origen (`app` / `supervisor`) van siempre separadas por
etiqueta, no por tono.

☐ Achica la ventana hasta el ancho de un telefono. **Debe pasar:** la barra lateral verde desaparece
y queda un boton de menu (☰) arriba a la izquierda; al presionarlo se desliza el menu sobre la
pantalla. Ninguna pantalla debe producir barra de desplazamiento horizontal.

---

### Paso 12 — Cerrar sesion

☐ Presiona tu usuario arriba a la derecha → **Cerrar sesion**.

**Debe pasar:** te regresa al login. Si despues escribes a mano una direccion del panel (por ejemplo
<http://127.0.0.1:3000/monitor>), **debe volver a mandarte al login**: la sesion se borro de verdad,
no solo de la pantalla.

---

## 9. Probar el worker por separado

El worker es la pieza sin pantalla. Estas dos comprobaciones se hacen desde el navegador:

| Abre esto | Debe responder |
|---|---|
| <http://127.0.0.1:8787/salud> | `{"db":"ok"}` |
| <http://127.0.0.1:8787/reportes/pdf> | Un error — es correcto: ese camino exige una llave secreta que solo el panel tiene |

`{"db":"ok"}` significa dos cosas a la vez: que el worker esta vivo **y** que pudo hablar con la base
de datos. Si dijera solo "vivo" seria un chequeo que miente.

En la ventana 2, el worker escribe una linea JSON cada vez que hace algo. Cada minuto revisa si hay
avisos que mandar. Los avisos que le tocaba programar quedan en la tabla `notificacion_programada`,
que puedes mirar en Supabase Studio (<http://127.0.0.1:54323>). **El envio real de notificaciones no
funciona en local** — ver §13.

---

## 10. Correr las pruebas automaticas

Esto no reemplaza la prueba manual, pero es rapido y detecta lo que se rompio sin que se note.

| Comando | Que prueba | Cuanto tarda | Que debe salir hoy |
|---|---|---|---|
| `pnpm test` | La logica: semaforo, permisos, aislamiento de datos entre choferes | ~20 s | `Tests 161 passed (161)` |
| `pnpm test:e2e` | El panel entero, manejado por un robot en un navegador | ~10 min | **28 pasan, 8 fallan** — pendiente conocido, ver abajo |
| `pnpm test:mobile` | La app del chofer | ~25 s | **falla — ver abajo** |

Las tres, en una terminal, con la base encendida:

```powershell
pnpm test
```

```powershell
pnpm test:e2e
```

> **8 pruebas e2e fallan hoy, y es un pendiente conocido del panel, no de tu instalacion.** Las
> tres del **Planeador** hacen `getByLabel('Camion')` y la del **Monitor** hace `getByLabel('Paso')`
> (cada una cuenta doble: corren en escritorio y en movil-375). Ninguno de esos dos controles existe
> ya: el camion **se deriva del chofer** y se muestra como texto, y el paso de la captura manual lo
> decide `siguientePaso()`. O sea, la interfaz mejoro y las pruebas se quedaron atras — hay que
> reescribir esas cuatro contra la interfaz actual.

> **Las pruebas ensucian la base a proposito.** `pnpm test:e2e` crea sus propios usuarios
> (`e2e-admin@example.com`, `e2e-supervisor@example.com`), un horario extra en `Route 1` y varias
> rutas `Ruta E2E …`. Es correcto: una suite que dependiera de que nadie toque los datos de ejemplo
> se cae sola. Si despues quieres volver a los conteos exactos del paso 4.6, corre `pnpm db:seed`.

`pnpm test:e2e` necesita el panel levantado en <http://127.0.0.1:3000>; si `pnpm dev` no esta
corriendo, Playwright lo arranca solo. Una prueba de `pnpm test` (la que genera el PDF del cliente)
tambien necesita ese panel arriba: si ves fallar `pdf.test.ts` con `ERR_CONNECTION_REFUSED`, no esta
roto el codigo, te falta la ventana 1.

```powershell
pnpm test:mobile
```

> **Este ultimo falla hoy, y es un pendiente conocido.** De 3 suites, 2 no arrancan
> (`outbox.test.ts` y `asignaciones.test.ts`) con el error
> `Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules`. Aparecio
> al bajar la app de Expo SDK 57 a 54. **No es un problema de tu instalacion y no bloquea nada:**
> `test:mobile` no forma parte de la comprobacion obligatoria del proyecto. Detalle en
> `apps/mobile/README.md`.

**Que deberias ver en las otras dos:** lineas verdes y el resumen de la tabla de arriba. Cualquier
otra cosa en rojo es un fallo real que vale la pena reportar.

Y esta es la comprobacion completa que el proyecto exige antes de dar cualquier cambio por terminado:

```powershell
pnpm typecheck; pnpm lint; pnpm test
```

---

## 11. Apagar todo y volver a cero

### 11.1 Apagar al terminar de probar

1. En la ventana de la app (`§7.2`): `Ctrl+C`.
2. En la ventana 2 (`pnpm dev`): `Ctrl+C`.
3. Cierra la ventana del navegador de prueba.
4. Apagar la base de datos (opcional, se puede dejar prendida):

```powershell
pnpm db:down
```

5. Cerrar Docker Desktop (opcional).

### 11.2 Borrar todos los datos de prueba y empezar limpio

Cuando la base se llene de basura de pruebas y quieras empezar de cero, corre **los tres comandos, en
este orden**:

```powershell
pnpm db:reset
```

```powershell
pnpm db:migrate
```

```powershell
pnpm db:seed
```

> **Los tres, siempre.** `db:reset` deja la base vacia de verdad; `db:migrate` vuelve a crear las
> tablas y `db:seed` vuelve a meter los datos de ejemplo. Si te saltas alguno, el panel arranca pero
> truena al abrir cualquier pantalla.

Las credenciales despues del reset son **las mismas de siempre** (`admin@test.com` / `Admin123!`,
`driver1` / `Driver123!`…): el seed no genera nada al azar, por eso no hay nada que volver a anotar.

> **Si solo quieres limpiar los datos de prueba y nada mas**, `pnpm db:seed` a secas ya vacia la base
> antes de sembrar. Los tres comandos de arriba hacen falta unicamente cuando tambien quieres
> rehacer las **tablas** (por ejemplo despues de cambiar el esquema).

---

## 12. Cuando algo falla

| Lo que ves | Que significa | Que hacer |
|---|---|---|
| `pnpm : El termino 'pnpm' no se reconoce...` | pnpm no esta instalado, o la terminal es vieja | Repite §3.3 y **abre una terminal nueva** |
| `node : El termino 'node' no se reconoce...` | Node no esta instalado | Repite §3.2 y abre una terminal nueva |
| `error during connect` / `Cannot connect to the Docker daemon` | Docker Desktop no esta abierto o no termino de arrancar | Abre Docker Desktop, espera a "Engine running", reintenta |
| `/dev/null: No such file or directory` al correr `pnpm db:up` | Falta Git para Windows | Instalalo (§3.1) y abre una terminal nueva |
| `No se pudo leer 'supabase status'` al correr `pnpm env:write` | La base no esta encendida | `pnpm db:up` y vuelve a intentar |
| `Falta DATABASE_URL` | El archivo `.env` no existe o quedo incompleto | `pnpm db:up`, borra el archivo `.env`, y corre `pnpm env:write` otra vez |
| `Another next dev server is already running` + `- PID: 12345` | Quedo un panel encendido de una sesion anterior | Corre `taskkill /PID 12345 /F` (con **el numero que te muestre a ti**) y vuelve a correr `pnpm dev` |
| `Port 3000 is in use` | Lo mismo de arriba | Igual que arriba |
| El panel abre pero te manda siempre al login | Estas usando una ventana de navegador sin sesion | Cierra todo y usa **la ventana que abre `pnpm panel:sesion`** (§6.2) |
| `pnpm panel:sesion` dice `faltan variables de Supabase` | Falta el `.env` o la base esta apagada | §4.2 y §4.3 |
| La app muestra pantalla roja con `EXPO_PUBLIC_SUPABASE_URL` | La app arranco sin leer el `.env` | `Ctrl+C` y arranca de nuevo **con `--clear`** (§7.2) |
| La app dice `Credencial o contrasena incorrecta.` con `driver1` / `Driver123!` | Ya cambiaste esa contrasena al probar el primer ingreso | `pnpm chofer:prueba` para devolverle `Driver123!` (§4.8) |
| Escribiste `driver1@test.com` en la app y no entra | La app pide **credencial**, no correo | Teclea solo `driver1` (§4.6) |
| `pnpm db:seed` dice `no es local y esta semilla BORRA TODOS los datos` | El `.env` apunta a un Supabase que no es el local | Revisa `NEXT_PUBLIC_SUPABASE_URL` en `.env`; deberia ser `http://127.0.0.1:54321` |
| La app abre pero el login gira para siempre o dice error de red | La app no alcanza al servidor | Revisa la tabla de §7.1: `10.0.2.2` para emulador, la IP de la PC para telefono. Acepta el aviso del Firewall |
| El telefono no lee el QR / no conecta | El telefono esta en otra red WiFi | Ponlos en la misma red. Si la red del trabajo aisla dispositivos, usa el emulador |
| El PDF no se genera | Falta el navegador interno | `pnpm exec playwright install chromium` (§4.7) y asegurate de que `pnpm dev` siga corriendo |
| `pnpm test:e2e` falla al arrancar el navegador | Lo mismo | Igual que arriba |
| El monitor no cambia despues de marcar en la app | El evento sigue en la cola del telefono | Confirma que el telefono tenga internet; el monitor se refresca cada 30 s, dale tiempo |
| Todo va lentisimo la primera vez | Descargas iniciales | Es normal; solo pasa una vez |

Si algo no esta en esta tabla: copia **el mensaje de error completo** de la terminal antes de cerrar
la ventana. Sin el texto exacto no hay forma de saber que paso.

---

## 13. Limites conocidos del modo local

Estas cosas **no funcionan en tu computadora y no es un error**. Se listan para que no pierdas tiempo
persiguiendolas.

| Cosa | Que pasa en local | Por que |
|---|---|---|
| **Entrar con Google al panel** | Da error | El proveedor de Google esta apagado en la configuracion local a proposito. Se usa `pnpm panel:sesion` en su lugar (§6.2) |
| **Notificaciones push al telefono** | Nunca llegan | Requieren una cuenta de Expo con proyecto dado de alta y un token que en local no existe. Lo que **si** puedes verificar es que los avisos se **programen**: mira la tabla `notificacion_programada` en Supabase Studio |
| **Advertencia de notificaciones al entrar a la app** | Aparece un aviso en la consola de Expo | Consecuencia de lo anterior; la app funciona igual |
| **Mapa al crear una parada** | No aparece el mapa | Falta la llave de Google Maps. El formulario **degrada a proposito** a captura manual de latitud y longitud, no se rompe |
| **Correos** | No salen a internet | Quedan atrapados en Mailpit: <http://127.0.0.1:54324> |
| **Opcion "Mi cuenta" del menu** | Da pagina no encontrada (404) | El enlace existe en el menu pero la pantalla todavia no esta construida. Es un pendiente real del proyecto, no un problema de tu instalacion |
| **`pnpm test:mobile`** | 2 de 3 suites no arrancan | Pendiente conocido tras bajar a Expo SDK 54; ver §10 y `apps/mobile/README.md`. No forma parte de la comprobacion obligatoria |
| **El supervisor ve lo mismo que el admin** | No hay diferencia en el menu | Es el comportamiento actual, no un defecto: la unica accion que separa los dos roles todavia no tiene pantalla (§6.2) |
| **Capturar "terminar por incidente" desde el panel** | No aparece entre los eventos que ofrece "Registrar evento a mano" | El dialogo propone unicamente el siguiente paso de la secuencia (`siguientePaso()`), y el incidente no pertenece a ella. Hoy **solo el chofer** puede cerrar una ruta por incidente; si el telefono no esta disponible, el supervisor cancela la ruta desde el planeador. Pendiente real, no un fallo de instalacion |
| **Estados en gris al imprimir el PDF** | Los cinco se ven de tonos parecidos | La pastilla trae el nombre escrito, asi que se lee; el icono que los separaba en gris se quito en el rediseno de agosto 2026 (§8, paso 8) |
| **Instalar la app como APK** | No aplica | La distribucion real se hace con EAS y Google Play; eso vive en `docs/runbook.md` §5 |

---

## Resumen para pegar en la pared

Una vez que ya hiciste la instalacion (§3) y la preparacion (§4), una sesion de pruebas es esto:

```powershell
# Ventana 1 — con Docker Desktop abierto
cd "C:\Users\isaia\OneDrive\Documentos\Tregar\Rutas_Tregar"
pnpm db:up
```

```powershell
# Ventana 2 — dejar abierta
cd "C:\Users\isaia\OneDrive\Documentos\Tregar\Rutas_Tregar"
pnpm dev
```

```powershell
# Ventana 3 — abre el panel con sesion de prueba
cd "C:\Users\isaia\OneDrive\Documentos\Tregar\Rutas_Tregar"
pnpm panel:sesion
```

```powershell
# Ventana 4 — solo si vas a probar la app del chofer
cd "C:\Users\isaia\OneDrive\Documentos\Tregar\Rutas_Tregar"
pnpm --filter @rutas/mobile start --clear
```

Credenciales fijas del seed (§4.6): panel `admin@test.com` / `Admin123!` · app `driver1` /
`Driver123!`.

Y el guion de prueba esta en §8.

---

**Documentos hermanos:** `docs/runbook.md` (operacion del sistema **en produccion**: respaldos,
rollback, rotacion de secretos, distribucion de la app). Esta guia es solo para pruebas locales.
