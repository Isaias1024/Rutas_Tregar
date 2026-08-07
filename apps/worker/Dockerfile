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

RUN corepack enable

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

CMD ["pnpm", "exec", "tsx", "src/index.ts", "serve"]
