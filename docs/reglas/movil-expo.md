---
description: Convenciones de la app Expo del chofer — instalacion de paquetes, outbox, GPS y UI
paths:
  - "apps/mobile/**"
---

# App del chofer (Expo SDK 57)

- **Instala SIEMPRE con `npx expo install`, JAMAS con `pnpm add`.** Cuatro paquetes nativos tienen un
  `latest` en npm mas nuevo que el pin del SDK 57 e instalarlo rompe el build:

  | Paquete | Pin del SDK 57 | `latest` en npm | Que pasa si instalas `latest` |
  |---|---|---|---|
  | `react-native-reanimated` | `4.5.1` | `4.5.3` | desalineacion con worklets |
  | `react-native-worklets` | `0.10.1` | `0.11.3` | desalineacion con reanimated |
  | `react-native-gesture-handler` | `~2.32.0` | `3.1.0` | **API reescrita** — no compila |
  | `@react-native-async-storage/async-storage` | `2.2.0` | `3.1.1` | **salto de major** |

- `tailwindcss` aqui es la linea `~3.4.19`, **no** la 4.x del panel: NativeWind 4 no habla Tailwind 4
  y NativeWind 5 sigue en preview. Nunca eleves `tailwindcss` a la raiz del monorepo. Lo unico que
  se comparte con el panel son los tokens como valores planos desde `@rutas/shared/tokens`, jamas el
  archivo de config.
- `react` aqui es `19.2.3`, distinta de la del panel. Es correcto y es a proposito.
- `targetSdkVersion` y `compileSdkVersion` son **36** (Android 16). Google Play lo exige para apps
  nuevas y para updates a partir del 2026-08-31.
- **Cada toque escribe primero en SQLite local**, con su `client_event_id` (uuid), la hora del
  dispositivo, `monotonic_ms` y el GPS si lo hay. La UI avanza al instante, sin esperar red. El
  flusher sube la cola despues. Nunca hagas que la UI espere una respuesta del servidor.
- **El GPS nunca bloquea.** Permiso negado o sin senal: se guarda el evento igual con coordenadas
  nulas y su bandera. Solo hay GPS en `listo_inicio` y `fin_ruta`; no hay ubicacion en segundo plano
  y no se pide ese permiso.
- **Un solo boton activo por pantalla**, de ancho completo y **72px de alto**, texto 20px semibold.
  El chofer confirma el siguiente paso; jamas elige entre cinco.
- Los contadores viven dentro del paso que los necesita: `fin_ruta` pide "cuantos abordaron",
  `retorno` pide "cuantos regresaron". Textbox numerico simple, sin steppers, obligatorio para
  registrar ese evento.
- El chofer teclea **credencial y contrasena**, nunca un correo. El correo determinista que exige
  Supabase se sintetiza en `apps/mobile/src/lib/credencial.ts` y no aparece jamas en la UI.
- Fondo blanco y alto contraste: esta pantalla se usa al sol directo en un patio de maniobras. Sin
  modo oscuro en v1.
- Los dias futuros de la pantalla "Semana" son **solo lectura**.
