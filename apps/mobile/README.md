# `@rutas/mobile` — App del chofer

Expo SDK 54 (React Native, expo-router). Es la pantalla del chofer: ve las rutas que le tocan hoy y
marca cinco hitos por ruta, o la termina por incidente si no puede completarla. Distribucion interna
en Android; no pasa por revision publica.

## Fijada al SDK 54 a proposito

El Expo Go publicado en App Store y Play Store se quedo en esa version. **Un SDK mas nuevo en el
proyecto significa que Expo Go ya no puede correrlo.** No subir de SDK sin confirmar antes que Expo
Go en las tiendas ya soporta la version nueva.

De ahi sale la regla mas importante de esta carpeta:

```bash
npx expo install <paquete>     # SIEMPRE asi
pnpm add <paquete>             # JAMAS
```

`pnpm add` trae el `latest` de npm, y cuatro paquetes nativos tienen un `latest` mas nuevo que el pin
del SDK 54 que rompe el build. La tabla con los cuatro esta en `docs/reglas/movil-expo.md`, junto
con el resto de trampas de este stack (por que `babel-preset-expo` es dependencia directa, por que
`tailwindcss` aqui es 3.4 y no la 4 del panel, por que `react` es 19.1.0 y no la del panel).

## Correr

```bash
pnpm install --frozen-lockfile   # desde la raiz
pnpm --filter @rutas/mobile start
```

Se abre con Expo Go escaneando el QR. Necesita `.env` en la raiz con `EXPO_PUBLIC_SUPABASE_URL` y
`EXPO_PUBLIC_SUPABASE_ANON_KEY` — `pnpm env:write` desde la raiz lo genera. El paso a paso para
probar en un telefono real esta en `docs/pruebas-manuales.md`.

```bash
pnpm mobile:doctor               # diagnostico del stack de Expo
```

## Pantallas

Cuatro pestanas — Hoy, Semana, Historial, Perfil — y el detalle de ruta apilado encima.

| Ruta | Que es |
|---|---|
| `app/login.tsx` | Credencial y contraseña. **El chofer nunca teclea un correo** |
| `app/cambiar-password.tsx` | Obligatorio en el primer ingreso, tras el alta del supervisor |
| `app/(chofer)/hoy.tsx` | Pestana inicial: saludo, resumen del dia y las rutas de hoy |
| `app/(chofer)/semana.tsx` | Siete dias desde hoy. Lo que no es hoy es **solo consulta** |
| `app/(chofer)/historial.tsx` | Los ultimos 30 dias, hasta ayer. Incluye las canceladas |
| `app/(chofer)/perfil.tsx` | Identidad y camion. Lo unico editable es el telefono |
| `app/(chofer)/ruta/[id].tsx` | El detalle donde se marcan los hitos y se termina por incidente |

El correo determinista que exige Supabase Auth se sintetiza en `src/lib/credencial.ts` y no aparece
jamas en la UI. En Perfil tampoco: se muestra la credencial, nunca el correo.

Historial y Perfil no consultan nada nuevo — salen de las mismas politicas RLS que ya existian
(`asignacion_select_chofer` no tiene tope de fecha; `perfil_personal` concede `update` **solo** sobre
`telefono`, y por eso nombre y credencial se ven pero no se editan).

`src/datos/usePerfil.ts` relee al montar **y cada vez que la pantalla recibe foco**
(`useFocusEffect`). El camion lo asigna el supervisor desde el panel, asi que sin ese segundo
disparo un chofer al que le reasignan o le quitan el camion seguia viendo el anterior hasta cerrar
sesion. Cualquier dato de la app que el panel pueda cambiar a media jornada necesita lo mismo.

## Estados de una ruta

Las tarjetas hablan de cuatro estados, pero **no hay una columna de estado en la base**: los cuatro
se derivan de los hitos con `estadoRuta()` de `packages/shared/src/flujo.ts`, igual que el semaforo
del panel se deriva con `derivarEstado()`.

| Hitos marcados | Estado que se ve |
|---|---|
| ninguno, `vio_ruta`, `listo_inicio` | `PENDIENTE` — todavia es preparacion, la ruta no salio |
| `inicio_ruta`, `fin_ruta` | `EN CURSO` |
| `retorno` | `COMPLETADA` |
| `fin_ruta_incidente` | `COMPLETADA` — cerrada sin completarse; la razon queda en el evento |
| `cancelada_en` no nulo | `CANCELADA` — gana sobre cualquier avance previo |

`fin_ruta_incidente` es la salida de emergencia: **no es el sexto paso de la secuencia**, se puede
marcar en cualquier momento desde que el chofer ve la ruta y hasta que esta cierra. `ORDEN_PASOS`
sigue teniendo cinco elementos; el enum `tipo_evento` tiene seis. Esa diferencia es deliberada y
esta explicada en `docs/reglas/datos-y-rls.md`.

El supervisor tambien puede cerrarla por incidente desde el monitor del panel ("Terminar por
incidente"), para cuando el telefono se quedo sin bateria o el chofer esta atendiendo la
emergencia. Queda con `origen = 'supervisor'`, nunca confundido con lo que marco la app.

## Como viaja un toque

```
pantalla → src/outbox/registrar.ts → SQLite local (con su client_event_id)
                                   → la UI avanza YA, sin esperar red
         src/outbox/flusher.ts → Supabase → Postgres, directo
```

El panel no participa en ese camino. **La unica frontera de seguridad es RLS.**

- **La UI nunca espera la red.** Si el toque bloquea hasta que responde Supabase, el chofer deja de
  tocar el boton en cuanto pierde senal y el panel se queda vacio.
- **`client_event_id` es la clave de idempotencia**: uno por toque, generado en el dispositivo. El
  insert usa `on conflict do nothing`, asi que reintentar la cola nunca duplica.
- **El GPS nunca bloquea.** Permiso negado o sin senal guarda el evento igual, con coordenadas nulas
  y su bandera. Solo hay GPS en `listo_inicio` y `fin_ruta`; no se pide ubicacion en segundo plano.
- Cual es el siguiente paso lo decide `packages/shared/src/flujo.ts`, no la pantalla. La pantalla
  solo pinta lo que esa funcion diga.

## Diseno

Fondo blanco y alto contraste: esta pantalla se usa al sol directo en un patio de maniobras. Sin modo
oscuro en v1.

**Un solo objetivo tactil activo por pantalla**, de ancho completo y 72px de alto, texto 20px
semibold (`componentes/BotonPrimario.tsx`). El chofer confirma el siguiente paso; jamas elige entre
cinco. Si crees que necesitan ser dos botones, es que falta un paso en `flujo.ts`.

La unica excepcion es "Terminar ruta por incidente", y se resuelve con jerarquia en vez de con dos
primarios: vive en `componentes/BotonSecundario.tsx` con `destructivo` (56px, contorno rojo), debajo
del hito. Una salida de emergencia tiene que estar a la mano sin competir con la accion normal, que
es lo que el chofer toca casi siempre.

Solo `retorno` — el hito que cierra la ruta — pide confirmacion, porque `evento` es append-only y no
se deshace desde la app. Ningun otro paso pregunta. El incidente tambien interrumpe, pero con otro
proposito: su modal pide **la razon** (`tipo_incidente`), no una confirmacion.

Los colores salen de `@rutas/shared/tokens` como valores planos, que `tailwind.config.js` mete en
NativeWind. Nunca se comparte el archivo de config con el panel: el panel usa Tailwind 4 y aqui es
3.4. El glob de `content` apunta a `./src/componentes/**` — **en espanol**, como se llama la carpeta;
cuando decia `components` las clases usadas solo dentro de un componente no se generaban.

Los iconos son SVG propios en `componentes/Icono.tsx` sobre `react-native-svg`. No se usa
`@expo/vector-icons`: existe en el monorepo solo por hoisting a la raiz, y esta app ya se quemo una
vez con un paquete de Expo resuelto desde la raiz (el incidente de `babel-preset-expo`).

Sin dimensiones fijas de alto: los botones usan `minHeight` para que crezcan si el usuario subio el
tamano de fuente del sistema, y la fila de dias de "Semana" desplaza en horizontal en vez de repartir
siete columnas que se cortarian en un telefono chico.

## Pruebas

```bash
pnpm test:mobile
```

**Estado actual: 2 de 3 suites no arrancan.** `outbox.test.ts` y `asignaciones.test.ts` fallan con
`Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules` al importar
`expo-secure-store` y `expo-sqlite`. Aparecio al bajar de SDK 57 a 54 y apunta a `jest-expo` 54
combinado con el linker `hoisted`: los mocks del preset no alcanzan a los modulos nativos que se
resuelven desde la raiz del monorepo. `src/lib/credencial.test.ts` si pasa.

`test:mobile` **no** forma parte de la compuerta del repo (`pnpm typecheck && pnpm lint && pnpm test`),
por eso esto no bloquea, pero es un pendiente real.

La verificacion que si cubre esta app de punta a punta es un bundle real:

```bash
npx expo export --platform ios
```

## Distribucion

`eas-cli` no es dependencia del repositorio a proposito — solo corre a mano, nunca en CI:

```bash
pnpm dlx eas-cli@21.5.0 build --profile interno --platform android
```

Los dos caminos de instalacion (Managed Google Play y APK firmado), y que un cambio nativo **no** se
puede revertir por OTA, estan en `docs/runbook.md` §5 y §3.
