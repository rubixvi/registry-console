# syntax=docker/dockerfile:1

ARG TRIVY_IMAGE=ghcr.io/aquasecurity/trivy:0.76.0@sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222

FROM ${TRIVY_IMAGE} AS scanner

FROM node:24-alpine AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apk update \
    && apk upgrade --no-cache \
    && apk add --no-cache ca-certificates gcompat \
    && mkdir -p /app/data /usr/share/licenses/trivy \
    && chown node:node /app/data \
    && chmod 700 /app/data

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


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

RUN apk add --no-cache ca-certificates gcompat \
    && mkdir -p /app/data /usr/share/licenses/trivy \
    && chown node:node /app/data \
    && chmod 700 /app/data

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
    ./scripts/

RUN trivy --version

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
