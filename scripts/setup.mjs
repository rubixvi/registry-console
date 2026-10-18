import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { appOrigin } from '@/lib/config/origin.ts'
import { hashPassword, MIN_PASSWORD_LENGTH } from './helpers/crypto.mjs'
import { readSecret } from './helpers/input.mjs'

const USERNAME_PATTERN = /^[a-zA-Z0-9_.@-]{1,64}$/

if (!process.stdin.isTTY) {
  throw new Error('Run setup interactively in a terminal.')
}

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
})

let origin
let username
let registries

try {
  origin = (await terminal.question('App origin (e.g. http://localhost:3000): ')).trim()

  username = (await terminal.question('Admin username: ')).trim()

  registries = (await terminal.question('Allowed registry origins, comma separated: '))
    .split(',')
    .map((registry) => registry.trim())
    .filter(Boolean)
} finally {
  terminal.close()
}

if (appOrigin(origin, true) !== origin) {
  throw new Error('Origin cannot include a path, credentials, or trailing slash.')
}

if (!USERNAME_PATTERN.test(username)) {
  throw new Error('Invalid username.')
}

for (const registry of registries) {
  const url = new URL(registry)
  const hasAllowedProtocol = url.protocol === 'https:' || url.protocol === 'http:'
  const hasCredentials = Boolean(url.username || url.password)

  if (!hasAllowedProtocol || hasCredentials || url.origin !== registry) {
    throw new Error('Invalid registry origin.')
  }
}

const password = await readSecret(`Admin password (${MIN_PASSWORD_LENGTH}+ characters): `)

const encoded = hashPassword(password)

const configuration = [
  `APP_ORIGIN=${origin}`,
  `AUTH_USERNAME=${username}`,
  `AUTH_PASSWORD_HASH='${encoded}'`,
  `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
  `TRIVY_RUNNER_TOKEN=${randomBytes(32).toString('hex')}`,
  'TRIVY_RUNNER_URL=http://scanner:3001',
  `REGISTRY_ALLOWED_ORIGINS=${registries.join(',')}`,
  'ALLOW_HTTP_REGISTRIES=false',
  'DATA_DIR=/app/data',
  'REGISTRY_CONSOLE_IMAGE=rubixvi/registry-console:edge',
  '',
].join('\n')

writeFileSync('.env', configuration, {
  flag: 'wx',
  mode: 0o600,
})

console.log('Created .env. Sign in to add registries.')
