import { spawnSync } from 'node:child_process'

const image = process.argv[2]

if (!image || image.startsWith('-') || /\s/.test(image)) {
  throw new Error('Usage: pnpm run image:publish -- registry/owner/image:tag')
}

const build = spawnSync(process.execPath, ['scripts/build-image.mjs', image], { stdio: 'inherit' })

if (build.error) {
  throw build.error
}

if (build.status !== 0) {
  process.exit(build.status ?? 1)
}

const push = spawnSync('docker', ['push', image], {
  stdio: 'inherit',
})

if (push.error) {
  throw push.error
}

process.exit(push.status ?? 1)
