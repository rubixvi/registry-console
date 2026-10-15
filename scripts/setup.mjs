import { randomBytes, scryptSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { appOrigin } from '@/lib/config/origin.ts'
import { readSecret } from './read-secret.mjs'

const USERNAME_PATTERN = /^[a-zA-Z0-9_.@-]{1,64}$/
const MIN_PASSWORD_LENGTH = 14
const MAX_PASSWORD_LENGTH = 1024

const SCRYPT_OPTIONS = {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
}

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
  origin = (
    await terminal.question(
      'App origin (http://localhost:3000 or https://registry-ui.example.com): '
    )
  ).trim()

  username = (await terminal.question('Administrator username: ')).trim()

  registries = (await terminal.question('Allowed registry origins, comma separated: '))
    .split(',')
    .map((registry) => registry.trim())
    .filter(Boolean)
} finally {
  terminal.close()
}

if (appOrigin(origin, true) !== origin) {
  throw new Error('Use an origin without a trailing slash, path, or credentials.')
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

const password = await readSecret(
  `Administrator password (at least ${MIN_PASSWORD_LENGTH} characters): `
)

if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
  throw new Error(`Password must contain ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`)
}

const salt = randomBytes(16)
const hash = scryptSync(password, salt, 32, SCRYPT_OPTIONS)

const encoded = ['scrypt', '32768', '8', '1', salt.toString('hex'), hash.toString('hex')].join('$')

const configuration = [
  `APP_ORIGIN=${origin}`,
  `AUTH_USERNAME=${username}`,
  `AUTH_PASSWORD_HASH='${encoded}'`,
  `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
  `REGISTRY_ALLOWED_ORIGINS=${registries.join(',')}`,
  'ALLOW_HTTP_REGISTRIES=false',
  'DATA_DIR=/app/data',
  '# Set your published image before deploying with Compose.',
  '# REGISTRY_CONSOLE_IMAGE=ghcr.io/your-owner/your-repository:1.0.0',
  '',
].join('\n')

writeFileSync('.env', configuration, {
  flag: 'wx',
  mode: 0o600,
})

console.log('Configuration created. Configure your registry connections after signing in.')
