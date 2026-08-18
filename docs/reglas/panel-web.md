---
description: Convenciones del panel web Next.js — autorizacion, auditoria, responsive y semaforo
paths:
  - "apps/web/**"
  - "tests/e2e/**"
---

# Panel web

- **Server-first.** Todo es server component por defecto. `'use client'` solo para estado, efectos o
  manejadores, y siempre en la hoja — nunca en un `page.tsx`.
- Las mutaciones son server actions en `actions.ts` junto a su ruta. Nada de `fetch` desde el cliente
  hacia la propia API.
- **Toda mutacion administrativa hace exactamente esto, en este orden:** parsear la entrada con su
  esquema zod de `@rutas/shared` → `can(usuario, accion, recurso)` → abrir transaccion → escribir →
  `registrarAuditoria(...)` **dentro de la misma transaccion** → cerrar. Si la bitacora falla, la
  mutacion no se aplica.
- La service role key solo se usa dentro de `apps/web/src/lib/supabase/admin.ts`, y ese archivo
  jamas se importa desde un componente cliente.
- **No existe ninguna ruta que cree una cuenta desde una peticion no autenticada.** El login exige
  que ya exista una fila en `usuario` con ese correo y un rol.
- Todo el panel lleva `noindex`: no hay VPN ni Cloudflare Access delante.
- **Mobile-first de verdad.** El monitor en vivo se disena a 375px y despues se expande. Bajo 768px
  las tablas colapsan a tarjetas — nunca scroll horizontal.
- **El semaforo se pinta con `PastillaEstado`**, que rellena de color pleno y **siempre escribe el
  texto del estado dentro** (`A tiempo`, `Tarde`, `Adelantado`, `En curso`, `Pendiente`). Prohibido
  pintar el estado solo con color de fondo: el texto tiene que estar en el DOM.
- El estado no se consulta de ninguna columna: se calcula con `derivarEstado()` de
  `@rutas/shared/src/estado.ts`.
- Toda hora y todo contador lleva numerales tabulares. Sin eso, una columna de horas baila.
- Filas de tabla de 52px, sin animacion decorativa: alguien mira esta pantalla ocho horas al dia.
- **Cada bloque de contenido va dentro de una `Card`**: filtros en la suya, tabla en la suya (con la
  `Card` en `overflow-hidden` para que la tabla respete la esquina redondeada). El fondo `surface`
  entre tarjetas es lo que separa las secciones — nada de divisores sueltos.
- **El boton primario de la pantalla se pasa como `acciones` a `EncabezadoPagina`.** Cuando ese
  boton abre un dialogo que vive en el componente cliente, el `page.tsx` le pasa `titulo` y
  `descripcion` como props y es el cliente quien renderiza el encabezado.
- **Un dialogo que sostiene un formulario lleva `onPointerDownOutside={(e) => e.preventDefault()}`.**
  Un clic afuera cerraba el dialogo y el `onOpenChange` reseteaba el form: se perdia todo lo
  capturado. Escape y el boton de cerrar siguen funcionando — son intencion explicita, el clic
  accidental no. Los dialogos de confirmacion (`DialogoConfirmar`) NO lo llevan: cerrarlos sin
  querer no pierde nada.
- **El ancho de un dialogo se pide con el prefijo `sm:`** (`sm:max-w-2xl`, no `max-w-2xl`). La clase
  base de `DialogContent` ya trae `sm:max-w-sm`, y `tailwind-merge` no considera en conflicto dos
  clases con variantes distintas: un `max-w-2xl` pelado convive con ella y pierde en el CSS
  compilado, dejando el formulario atrapado en 24rem en cualquier pantalla ≥640px.
- **Lo que ya ocurrio hoy no se edita.** Una ruta o un horario con una asignacion de hoy que ya
  registro `inicio_ruta`, `fin_ruta`, `fin_ruta_incidente` o `retorno` rechaza la edicion desde
  `rutas-nucleo.ts`, y el panel deshabilita el boton con `bloqueadaHoy` para no ofrecer una accion
  que el servidor va a rechazar. Mismo criterio con el que el planeador ya cierra Cancelar y
  Reasignar. La comprobacion del servidor es la que manda; la del cliente solo evita el viaje.
- Toda lista tiene sus tres estados especificados: cargando, vacia y con error. Una lista sin estado
  vacio no esta terminada.
- Los reportes separan `origen = 'app'` de `origen = 'supervisor'`. Nunca los sumes en una sola cifra:
  son dos calidades de dato distintas y esconderlo es el punto que el reporte existe para evitar.
