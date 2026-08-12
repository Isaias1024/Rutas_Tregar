# `@rutas/mobile` — App del chofer

Expo SDK 54 (React Native, expo-router). Es la pantalla del chofer: ve las rutas que le tocan hoy y
marca cinco hitos por ruta. Distribucion interna en Android; no pasa por revision publica.

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

| Ruta | Que es |
|---|---|
| `app/login.tsx` | Credencial y contrasena. **El chofer nunca teclea un correo** |
| `app/cambiar-password.tsx` | Obligatorio en el primer ingreso, tras el alta del supervisor |
| `app/(chofer)/hoy.tsx` | Las asignaciones de hoy |
| `app/(chofer)/semana.tsx` | La semana. Los dias futuros son **solo lectura** |
| `app/(chofer)/ruta/[id].tsx` | El detalle donde se marcan los cinco hitos |

El correo determinista que exige Supabase Auth se sintetiza en `src/lib/credencial.ts` y no aparece
jamas en la UI.

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
semibold. El chofer confirma el siguiente paso; jamas elige entre cinco. Si crees que necesitan ser
dos botones, es que falta un paso en `flujo.ts`.

Los colores salen de `@rutas/shared/tokens` como valores planos, que `tailwind.config.js` mete en
NativeWind. Nunca se comparte el archivo de config con el panel: el panel usa Tailwind 4 y aqui es
3.4.

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
