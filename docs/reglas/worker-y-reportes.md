---
description: Convenciones del worker Node en contenedor — scheduler, push, CSV en streaming y PDF
paths:
  - "apps/worker/**"
---

# Worker y reportes

- El worker es el **unico proceso de larga vida** del sistema. Nada de trabajo de fondo en el
  serverless del panel: ahi no hay proceso que sobreviva a la respuesta.
- El endpoint HTTP de Hono se protege con el secreto compartido `WORKER_SHARED_SECRET` en el header
  `x-rutas-worker-secret`. Comparacion en tiempo constante, jamas `===` sobre el string.
- **Playwright aqui es solo Chromium.** Se instala con
  `npx playwright install --with-deps chromium`, y `page.pdf()` unicamente funciona en Chromium
  headless. No agregues Firefox ni WebKit: son cientos de MB en la imagen para nada.
- **El PDF del cliente se renderiza imprimiendo una pagina web real del panel**, no maquetando un
  documento aparte. Un solo diseno que mantener: lo que el cliente ve en el PDF es exactamente lo
  que el supervisor ve en pantalla. Si te descubres escribiendo HTML de reporte dentro del worker,
  para: la pagina ya existe en `apps/web`.
- Ese diseno tiene que funcionar **impreso en blanco y negro**. Por eso el semaforo lleva icono y
  texto ademas de color.
- **El CSV grande se transmite, no se acumula.** Cursor de Postgres → `ReadableStream` → respuesta.
  Nunca `await` sobre el arreglo completo de filas: 60 rutas x 3 turnos x un ano no cabe comodo en
  memoria y el contenedor de Railway es chico.
- El scheduler es `croner` en zona `America/Mexico_City`. Toda tarea programada es idempotente: se
  marca `notificacion_programada.enviado_en` **antes** de que el push salga y se filtra por `is null`
  al recoger, para que un reinicio a media tanda no duplique avisos.
- Los tres tipos de push son: asignacion nueva o cambiada (inmediato), recordatorio antes de la hora
  esperada de inicio, y alerta al supervisor cuando una ruta rebasa su hora esperada sin evento.
- Un token de Expo invalido (`DeviceNotRegistered`) borra la fila de `dispositivo`; no se reintenta.
- Los logs son `pino` en JSON estructurado. **Jamas se loguea un token de push, una llave, ni el
  nombre o telefono de un empleado** — son datos personales bajo la LFPDPPP. La instancia de pino se
  crea en `src/index.ts` con `redact` sobre `token`, `password`, `authorization`, `expo_push_token`,
  `telefono`, `correo` y `nombre`, y se pasa a `servidor.ts` y a `scheduler.ts`. **No hay un modulo
  de logger aparte:** son tres lineas de config y un archivo mas solo agrega una ruta que mantener.
- El worker carga entorno con `process.loadEnvFile('.env')` en las primeras lineas de `src/index.ts`,
  antes de cualquier otro import propio. No hay un `lib/env.ts` en el worker; ese archivo existe solo
  en el panel (`apps/web/src/lib/env.ts`), donde la validacion degrada por paso.
