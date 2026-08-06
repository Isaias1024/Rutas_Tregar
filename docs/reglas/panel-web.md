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
- **El semaforo se pinta con la pastilla de `@rutas/shared`**, que siempre lleva icono + texto
  (`● A tiempo`, `▲ Tarde`, `▼ Adelantado`, `■ En curso`, `○ Pendiente`). Prohibido pintar el estado
  solo con color de fondo.
- El estado no se consulta de ninguna columna: se calcula con `derivarEstado()` de
  `@rutas/shared/src/estado.ts`.
- Toda hora y todo contador lleva numerales tabulares. Sin eso, una columna de horas baila.
- Filas de tabla de 40px, sin animacion decorativa: alguien mira esta pantalla ocho horas al dia.
- Toda lista tiene sus tres estados especificados: cargando, vacia y con error. Una lista sin estado
  vacio no esta terminada.
- Los reportes separan `origen = 'app'` de `origen = 'supervisor'`. Nunca los sumes en una sola cifra:
  son dos calidades de dato distintas y esconderlo es el punto que el reporte existe para evitar.
