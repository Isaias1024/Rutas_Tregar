# syntax=docker/dockerfile:1
#
# Contexto del build: la RAIZ del monorepo (`docker build -f apps/worker/Dockerfile .`),
# nunca `apps/worker` solo — el worker depende de `packages/shared` via
# `workspace:*`, y pnpm necesita ver el workspace completo para resolverlo.
#
# Basada en la imagen de Playwright para tener Chromium y sus dependencias
# de sistema ya listas (§ worker-y-reportes.md: solo Chromium, nunca Firefox
# ni WebKit). El tag fija la MISMA version que packages/worker/package.json
# pinea para el paquete `playwright` — el driver y el navegador tienen que
# coincidir.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

# `COREPACK_HOME` compartido: sin esto, `corepack enable` cachea el binario
# de pnpm bajo el home de quien lo active (`root`, aqui, en tiempo de build).
# `pwuser` (el `USER` de mas abajo) no tiene permiso de lectura sobre
# `/root`, asi que en el primer arranque como pwuser Corepack lo intentaba
# volver a DESCARGAR de npm en tiempo de ejecucion — funciona si Railway
# tiene salida a internet en ese instante, pero es un punto de fallo de red
# innecesario en cada arranque de un contenedor que ya trae todo lo que
# necesita. Verificado con un build y arranque reales: sin esto el log decia
# "Corepack is about to download..." al arrancar; con esto, no.
ENV COREPACK_HOME=/app/.corepack
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate && chmod -R a+rX /app/.corepack

# Copia primero los manifiestos de TODO el workspace: es lo que deja que
# `pnpm install --frozen-lockfile` valide contra pnpm-lock.yaml exactamente
# como quedo generado, y que Docker cachee esta capa mientras el codigo
# cambia pero las dependencias no.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

# Ahora si, el codigo real. No hay paso de bundling ni directorio dist/: el
# worker corre TypeScript con tsx en produccion (paso 13) — es lo que
# elimina de raiz cualquier desacuerdo entre una ruta de salida compilada y
# la que el manifiesto declara.
COPY packages/shared packages/shared
COPY apps/worker apps/worker

ENV NODE_ENV=production

WORKDIR /app/apps/worker

EXPOSE 8080

# Auditoria de seguridad: sin esto, el proceso corre como root dentro del
# contenedor por default de Docker, agrandando el radio de una RCE (por
# ejemplo, va un paquete de npm comprometido o un escape del sandbox de
# Chromium) mas de lo necesario. `pwuser` (uid 1001) viene YA CREADO en la
# imagen base de Playwright justo para esto — es el usuario documentado con
# el que Microsoft prueba Chromium en Linux sin `--no-sandbox`, y
# `/ms-playwright` (donde vive el binario) ya le da permiso de lectura.
# Verificado con un build y arranque reales del contenedor: `/salud`
# responde 200 y `POST /reportes/pdf` genera un PDF real como este usuario.
USER pwuser

CMD ["pnpm", "exec", "tsx", "src/index.ts", "serve"]
