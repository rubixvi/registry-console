# syntax=docker/dockerfile:1

ARG TRIVY_IMAGE=ghcr.io/aquasecurity/trivy:canary

FROM ${TRIVY_IMAGE} AS scanner

FROM node:24-alpine AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates gcompat \
    && npm install --global corepack \
    && corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm --version \
    && pnpm install --frozen-lockfile

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN --mount=type=cache,id=registry-console-nextjs,target=/app/.next/cache,sharing=locked \
    mkdir -p public \
    && pnpm run build

FROM node:24-alpine AS runner

WORKDIR /app

ARG VCS_REF=""
ARG VERSION="dev"

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    TRIVY_ENABLED=false \
    TRIVY_PATH=/usr/local/bin/trivy \
    NEXT_TELEMETRY_DISABLED=1

LABEL org.opencontainers.image.title="Registry Console" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${VERSION}"

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates gcompat \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/lib/node_modules/corepack /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx \
        /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /app/data /app/scanner /usr/share/licenses/trivy \
    && chown node:node /app/data \
    && chmod 700 /app/data \
    && chown 1001:1001 /app/scanner \
    && chmod 700 /app/scanner

COPY --from=scanner --chmod=0755 \
    /usr/local/bin/trivy \
    /usr/local/bin/trivy

COPY licenses/trivy/LICENSE /usr/share/licenses/trivy/LICENSE

COPY --from=builder --chown=node:node \
    /app/.next/standalone \
    ./

COPY --from=builder --chown=node:node \
    /app/.next/static \
    ./.next/static

COPY --from=builder --chown=node:node \
    /app/public \
    ./public

COPY --from=builder --chown=node:node \
    /app/LICENSE \
    /app/NOTICE \
    ./

COPY --from=builder --chown=node:node \
    /app/scripts/password-hash.mjs \
    /app/scripts/encrypt-secret.mjs \
    /app/scripts/read-secret.mjs \
    /app/scripts/reset-security.mjs \
    /app/scripts/rotate-key.mjs \
    /app/scripts/peer.mjs \
    /app/scripts/scanner.mjs \
    ./scripts/

COPY --from=builder --chown=node:node \
    /app/scripts/helpers \
    ./scripts/helpers

RUN trivy --version

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--import", "./scripts/peer.mjs", "server.js"]
