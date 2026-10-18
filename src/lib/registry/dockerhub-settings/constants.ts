import 'server-only'

export const DOCKER_HUB_REGISTRY = 'https://registry-1.docker.io'

export const DOCKER_HUB_API = 'https://hub.docker.com'

export const DOCKER_HUB_AUTH = 'https://auth.docker.io'

export const DOCKER_HUB_BLOBS = new Set([
  'https://production.cloudfront.docker.com',
  'https://production.cloudflare.docker.com',
  'https://docker-images-prod.6aa30f8b08e16409b46e0173d6de2f56.r2.cloudflarestorage.com',
])
