import { spawnSync } from 'node:child_process'

const image = process.argv[2]

if (!image || image.startsWith('-') || /\s/.test(image)) {
  throw new Error('Usage: pnpm run image:build -- registry/owner/image:tag')
}

const args = ['build', '--pull', '--tag', image, '.']

const result = spawnSync('docker', args, {
  stdio: 'inherit',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
