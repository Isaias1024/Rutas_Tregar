---
description: Convenciones de la app Expo del chofer — instalacion de paquetes, outbox, GPS y UI
paths:
  - "apps/mobile/**"
---

# App del chofer (Expo SDK 54)

Fijado a SDK 54 porque el Expo Go de App Store / Play Store se quedo en esa version — un SDK mas
nuevo en el proyecto significa que Expo Go ya no puede correrlo (asi se vieron el crash de
`expo-notifications` y el fallo del wasm de `expo-sqlite` en web antes del downgrade). No subir de
SDK sin confirmar antes que Expo Go en las tiendas ya soporta la version nueva.

- **Instala SIEMPRE con `npx expo install`, JAMAS con `pnpm add`.** Cuatro paquetes nativos tienen un
  `latest` en npm mas nuevo que el pin del SDK 54 e instalarlo rompe el build:

  | Paquete | Pin del SDK 54 | `latest` en npm | Que pasa si instalas `latest` |
  |---|---|---|---|
  | `react-native-reanimated` | `4.1.7` | `4.5.3` | desalineacion con worklets |
  | `react-native-worklets` | `0.5.1` | `0.11.4` | desalineacion con reanimated |
  | `react-native-gesture-handler` | `~2.28.0` | `3.1.0` | **API reescrita** — no compila |
  | `@react-native-async-storage/async-storage` | `2.2.0` | `3.1.1` | **salto de major** |

- `tailwindcss` aqui es la linea `~3.4.19`, **no** la 4.x del panel: NativeWind 4 no habla Tailwind 4
  y NativeWind 5 sigue en preview. Nunca eleves `tailwindcss` a la raiz del monorepo. Lo unico que
  se comparte con el panel son los tokens como valores planos desde `@rutas/shared/tokens`, jamas el
  archivo de config.
- `react` aqui es `19.1.0`, distinta de la del panel. Es correcto y es a proposito.
- **`babel-preset-expo` esta fijado a `~54.0.12` como dependencia DIRECTA de esta app, a proposito.**
  No es redundante con `expo`: Babel resuelve el preset desde `apps/mobile/babel.config.js` hacia
  arriba, y con `nodeLinker: hoisted` un `babel-preset-expo` elevado a la raiz del monorepo le gana
  al que `expo` trae anidado en su propio `node_modules`. Al bajar de SDK 57 a 54 quedo un
  `babel-preset-expo@57.0.6` huerfano en la raiz; ese preset inyecta `@expo/ui/babel-plugin`, subpath
  que el `@expo/ui` instalado no exporta, y el bundle moria antes del primer modulo con
  `SyntaxError: Package subpath './babel-plugin' is not defined by "exports"`. Fijarlo aqui lo mete
  en `apps/mobile/node_modules` y hace la resolucion determinista. Si cambias de SDK, reinstala en
  limpio: reescribir los pines no borra lo que ya quedo elevado en la raiz.
- `@expo/ui` **no** es dependencia de esta app. Estuvo como canary (`0.2.0-canary-2026…`) sin que
  ningun archivo de `src/` lo importara, y fue la mitad del fallo de arriba. No lo reagregues sin un
  import real.
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
- **"Terminar ruta por incidente" es la unica excepcion, y por eso es secundario.** Vive en
  `BotonSecundario` con `destructivo` (56px, contorno rojo) — nunca como `BotonPrimario`, ni como un
  `Text` con `onPress` suelto: la jerarquia tiene que verse antes de leerse, porque el hito normal
  sigue siendo lo que el chofer toca el 99% de las veces. Esta disponible **desde que ve la ruta**,
  no desde que la inicia: un choque o una emergencia pueden impedir que la ruta arranque siquiera.
  Deja de ofrecerse cuando la ruta ya cerro. Pide la razon (`tipo_incidente`) en un modal antes de
  registrar; es un evento append-only mas, con su `client_event_id` y su paso por el outbox.
- Los contadores viven dentro del paso que los necesita: `fin_ruta` pide "cuantos abordaron",
  `retorno` pide "cuantos regresaron". Textbox numerico simple, sin steppers, obligatorio para
  registrar ese evento.
- El chofer teclea **credencial y contrasena**, nunca un correo. El correo determinista que exige
  Supabase se sintetiza en `apps/mobile/src/lib/credencial.ts` y no aparece jamas en la UI.
- Fondo blanco y alto contraste: esta pantalla se usa al sol directo en un patio de maniobras. Sin
  modo oscuro en v1.
- Los dias futuros de la pantalla "Semana" son **solo lectura**.
