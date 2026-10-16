import { spawnSync } from 'node:child_process'

export function imageArgument(command) {
  const image = process.argv[2]

  if (!image || image.startsWith('-') || /\s/.test(image)) {
    throw new Error(`Usage: pnpm run ${command} -- registry/owner/image:tag`)
  }

  return image
}

export function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

export function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 60_000,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    const message = result.stderr || result.stdout || result.signal

    throw new Error(`Docker failed: ${message}`)
  }

  return result.stdout.trim()
}
