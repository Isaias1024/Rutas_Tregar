# Runbook — Rutas: Transporte de Personal

Este documento asume **bus factor de uno**: un solo desarrollador construye y opera el sistema. Su
proposito es que esa persona (o quien la reemplace en una ausencia no planeada) pueda operar el
sistema leyendo este archivo una vez, sin tener que reconstruir el conocimiento desde cero.

Todo lo gestionado (Vercel, Supabase, Railway, EAS) se eligio para que la operacion manual sea la
excepcion, no la rutina. Lo que sigue son los procedimientos para esas excepciones.

## 1. Mapa de servicios

| Servicio | Que aloja | Region | Por que |
|---|---|---|---|
| Vercel | Panel (`apps/web`), Next.js | `iad1`, funciones en `gru1`/`sfo1` | Deploy en cada merge a `main`, rollback instantaneo |
| Railway | Worker (`apps/worker`), contenedor Docker | `us-west` | Proceso de larga vida: scheduler + Chromium + CSV en streaming |
| Supabase | Postgres, Auth, respaldos | `us-east-1` | Menor latencia disponible a Monterrey |
| Expo (EAS) | Build y distribucion de la app Android | — | Compilacion nativa gestionada, sin mantener un Mac de build |
| Google Play Console | Distribucion interna (Managed Google Play) | — | Camino principal de instalacion en telefonos de la empresa |

Root directory del panel en Vercel: `apps/web`. Comando de build:
`pnpm turbo run build --filter=@rutas/web`. Runtime Node 24. Healthcheck del worker en Railway:
`GET /salud` — responde 200 solo si el proceso esta vivo **y** `select 1` a Postgres respondio; un
200 que no comprueba la base es un healthcheck que miente.

## 2. Respaldos de Supabase y como verificarlos

- El plan Pro de Supabase hace **respaldos diarios automaticos con retencion de 7 dias**. No hay
  script propio que correr: es una caracteristica de la plataforma.
- **Un respaldo que nunca se restauro es una suposicion, no una garantia.** Antes de dar por
  verificado el respaldo:
  1. Entrar al dashboard de Supabase del proyecto de produccion → **Database → Backups**.
  2. Elegir el respaldo mas reciente y restaurarlo **a un proyecto nuevo** (nunca sobre produccion
     directamente) usando la opcion de restauracion de Supabase.
  3. Contra ese proyecto nuevo, correr:
     ```bash
     DATABASE_URL="<connection string del proyecto restaurado>" pnpm db:check
     ```
     y confirmar que las doce tablas que lista `TABLAS_ESPERADAS` en `scripts/check-schema.ts`
     existen y tienen filas razonables (`select count(*) from asignacion;`,
     `select count(*) from evento;`).
  4. Borrar el proyecto de prueba una vez confirmado — no se deja corriendo, cuesta dinero y expone
     una copia de los datos de produccion.
  5. Repetir esta restauracion de prueba **al menos una vez por trimestre**, y siempre despues de
     cualquier migracion destructiva.
- Esta restauracion de prueba necesita una cuenta de Supabase pagada y datos reales de produccion:
  es un paso de la lista de lanzamiento, no algo que una construccion local pueda ejecutar. Lo que
  si esta verificado: `pnpm db:migrate` y `pnpm db:check` son deterministas y reproducen el esquema
  completo desde cero contra un Postgres local — la mitad reproducible de la garantia. **La otra
  mitad sigue pendiente y solo puede hacerse contra produccion.**

## 3. Rollback

### Panel (Vercel)

Rollback instantaneo desde el dashboard de Vercel: **Deployments → (deployment anterior) → Promote
to Production**. Tarda segundos porque no reconstruye nada, solo cambia a que build apunta el
dominio.

### Worker (Railway)

Railway conserva las imagenes de deploys anteriores. **Deployments → (deployment anterior) →
Redeploy**. Uno o dos minutos porque si vuelve a arrancar el contenedor. El scheduler corre en una
sola instancia a proposito (ver `apps/worker/src/`): nunca hay dos barredores compitiendo por la
misma cola de `notificacion_programada`, ni durante un rollback. **No escales el worker a dos
replicas** sin resolver antes ese punto.

### App movil

`expo-updates` publica un canal OTA para cambios de JavaScript: revertir es publicar el bundle
anterior en el mismo canal (`eas update --branch interno --message "rollback"` apuntando al commit
anterior). **Un cambio nativo (una dependencia nueva, un permiso nuevo) exige un build nuevo y NO se
puede revertir por OTA** — por eso los cambios nativos se agrupan en releases explicitas y se
anuncian antes de subirlas.

### Datos

Restauracion desde el respaldo diario de Supabase (§2 arriba). Es el camino mas lento de los
cuatro y el unico que puede perder datos escritos despues del respaldo — por diseno: es el ultimo
recurso, no el primero.

### Orden de un rollback combinado

Si un deploy rompe algo que ya escribio datos malos (por ejemplo, una migracion con un bug), el
orden importa:

1. Rollback del **panel** primero (deja de escribir datos nuevos con el codigo malo).
2. Rollback del **worker** si tambien cambio en ese deploy.
3. Solo despues, si los datos ya escritos quedaron mal, decidir si hace falta una correccion manual
   (una migracion de datos nueva) o una restauracion completa. Restaurar el respaldo completo es
   el ultimo recurso porque descarta todo lo escrito desde el respaldo, no solo lo que el bug daño.

## 4. Rotacion de secretos

| Secreto | Cuando rotarlo | Donde vive |
|---|---|---|
| `WORKER_SHARED_SECRET` | Cada 6 meses, y ante cualquier salida de personal con acceso a `.env` o a las variables de Vercel/Railway | Variables de entorno de Vercel **y** de Railway (tiene que cambiar en los dos a la vez: el panel lo manda, el worker lo valida) |
| `EXPO_ACCESS_TOKEN` | Cada 6 meses, y ante cualquier salida de personal | Variables de entorno de Railway (solo el worker lo usa, para `expo-server-sdk`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo ante sospecha de compromiso — no en un calendario fijo, porque rotarla sin necesidad invalida sesiones y tokens en curso | Dashboard de Supabase (**Settings → API**) y variables de entorno de Vercel |

Procedimiento general:

1. Generar el valor nuevo (`WORKER_SHARED_SECRET`: `node -e "console.log(crypto.randomUUID())"`;
   `EXPO_ACCESS_TOKEN`: panel de expo.dev → Account settings → Access tokens; la service role key la
   regenera el dashboard de Supabase).
2. Ponerlo en las variables de entorno de la plataforma que corresponda (nunca en el repositorio —
   `.env` esta en `.gitignore` y asi se queda).
3. Redeploy del panel y/o del worker segun cual secreto cambio, para que el proceso en marcha lea el
   valor nuevo (ninguno de los dos relee variables de entorno en caliente).
4. Confirmar con `curl` que `GET {WORKER_BASE_URL}/salud` sigue respondiendo 200 y que
   `POST {WORKER_BASE_URL}/reportes/pdf` con el secreto nuevo responde distinto de 401.

## 5. Distribucion de la app Android

Dos caminos, documentados a proposito porque **Managed Google Play exige que la empresa de de alta
Android Enterprise**, y en telefonos que no son de la empresa el usuario tiene que aceptar un perfil
de trabajo — eso se puede atorar en el piloto. El APK firmado es el camino alterno para altas
urgentes o telefonos que se resistan al perfil de trabajo.

### Build

El mismo build sirve para los dos caminos. `eas-cli` **no es dependencia del repositorio** (evita
fijar una version de una herramienta que cambia rapido y que solo corre a mano, nunca en CI):

```bash
pnpm dlx eas-cli@21.5.0 build --profile interno --platform android
```

Perfil `interno` = distribucion interna, sin pasar por revision publica de Google Play.

### Camino 1 — Managed Google Play (principal)

1. Alta de Android Enterprise en la Google Admin Console de la empresa (una sola vez).
2. Subir el `.aab` que produjo EAS a Google Play Console → **Internal testing** (o al track privado
   de Managed Google Play si la empresa ya administra los telefonos).
3. Los telefonos dados de alta en el programa reciben la app automaticamente, sin que el chofer
   busque nada.

### Camino 2 — APK firmado por EAS (alterno)

1. Descargar el `.apk` que produce el mismo comando de build (EAS genera `.apk` o `.aab` segun el
   perfil; para distribucion directa se usa el `.apk`).
2. Distribuirlo directo al telefono (transferencia por USB, enlace descargable interno, o el propio
   panel de EAS si el telefono tiene la cuenta de Expo vinculada).
3. El chofer tiene que permitir "instalar de origenes desconocidos" una vez — es el costo de este
   camino frente al de Managed Google Play.

Ambos caminos entregan la misma app firmada con la misma llave: no son dos builds distintos, es la
misma salida distribuida por dos vias.

## 6. Observabilidad

- **Logs del worker:** `pino` en JSON estructurado, con `redact` sobre `token`, `password`,
  `authorization`, `expo_push_token`, `telefono`, `correo` y `nombre` — configurado una sola vez en
  `apps/worker/src/index.ts`. Se consultan desde el dashboard de Railway (**Deployments → Logs**).
- **Logs del panel:** los de Vercel (**Deployments → (deployment) → Logs**), sin `redact` propio —
  Next.js no expone ese hook de forma centralizada; por eso ningun dato personal se loguea a mano en
  `apps/web` (ver `docs/reglas/panel-web.md`).
- **Que vigilar primero ante una falla reportada:**
  1. `GET {WORKER_BASE_URL}/salud` — proceso vivo y base alcanzable.
  2. Logs del worker filtrados por `"fallo al enviar notificacion"` (scheduler.ts) — push que no
     salio.
  3. La bitacora (`/bitacora` en el panel) filtrada por el recurso o el actor en cuestion — todo
     `crear`/`editar`/`cancelar`/`reasignar`/`baja` administrativo queda ahi.

## 7. Ante una salida de personal (bus factor)

1. Rotar `WORKER_SHARED_SECRET` y `EXPO_ACCESS_TOKEN` (§4).
2. Revocar el acceso de esa persona en Vercel, Railway, Supabase, Expo y Google Play Console —
   cinco paneles distintos, ninguno centralizado.
3. Si la persona tenia una fila en `usuario` del panel (era supervisor o admin), darla de baja desde
   `/catalogos/choferes` o el equivalente de administradores — borra sus datos personales y revoca
   su sesion (`apps/web/src/server/baja.ts`, paso 16).
4. Leer este runbook completo si quien queda no lo habia hecho antes.
