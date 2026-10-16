# syntax=docker/dockerfile:1

ARG TRIVY_IMAGE=ghcr.io/aquasecurity/trivy:0.76.0@sha256:2416d1f74045b57274df1a340eee6b510cacd73c66a6ccb8da092b117eb7d222

FROM ${TRIVY_IMAGE} AS scanner


FROM node:24-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable


FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


FROM dependencies AS build

COPY . .

RUN mkdir -p public && pnpm run build && rm -rf .next/cache


FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --prod --frozen-lockfile --ignore-scripts


FROM node:24-bookworm-slim AS runtime

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

COPY --from=scanner --chmod=0755 /usr/local/bin/trivy /usr/local/bin/trivy
COPY --from=scanner /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY licenses/trivy/LICENSE /usr/share/licenses/trivy/LICENSE

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

COPY --from=build \
    /app/package.json \
    /app/next.config.ts \
    /app/LICENSE \
    /app/NOTICE \
    ./

COPY --from=build \
    /app/scripts/password-hash.mjs \
    /app/scripts/encrypt-secret.mjs \
    /app/scripts/read-secret.mjs \
    /app/scripts/reset-security.mjs \
    ./scripts/

RUN trivy --version \
    && mkdir -p /app/data \
    && chown node:node /app/data \
    && chmod 700 /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
