import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function scanImage(input, signal) {
  const root = path.resolve(process.env.SCANNER_DIR || '/app/scanner')

  await mkdir(root, { recursive: true, mode: 0o700 })
  await mkdir(path.join(root, 'cache'), { recursive: true, mode: 0o700 })

  const directory = await mkdtemp(path.join(root, 'scan-'))

  try {
    await mkdir(path.join(directory, 'work'), { mode: 0o700 })
    await writeFile(path.join(directory, 'trivy.yaml'), '{}', { mode: 0o600 })

    const origin = new URL(input.origin)
    const host = input.provider === 'dockerhub' ? 'https://index.docker.io/v1/' : origin.host

    await writeFile(
      path.join(directory, 'config.json'),
      JSON.stringify({
        auths:
          input.username || input.password
            ? {
                [host]: {
                  auth: Buffer.from(`${input.username}:${input.password}`).toString('base64'),
                },
              }
            : {},
      }),
      { mode: 0o600 }
    )

    const args = [
      'image',
      '--config',
      path.join(directory, 'trivy.yaml'),
      '--cache-dir',
      path.join(root, 'cache'),
      '--image-src',
      'remote',
      '--scanners',
      'vuln',
      '--format',
      'json',
      '--list-all-pkgs=false',
      '--no-progress',
      '--quiet',
      '--skip-version-check',
      '--timeout',
      `${Math.max(1, Math.floor(input.timeout / 1000))}s`,
      '--parallel',
      '2',
      '--exit-code',
      '0',
    ]

    if (origin.protocol === 'http:') args.push('--insecure')
    if (input.platform !== 'Not provided') args.push('--platform', input.platform)

    args.push('--', `${origin.host}/${input.repository}@${input.digest}`)

    return await new Promise((resolve, reject) => {
      const child = spawn(process.env.TRIVY_PATH || '/usr/local/bin/trivy', args, {
        cwd: directory,
        shell: false,
        signal,
        killSignal: 'SIGKILL',
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: directory,
          TMPDIR: path.join(directory, 'work'),
          XDG_CONFIG_HOME: directory,
          DOCKER_CONFIG: directory,
          ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
          ...(process.env.SSL_CERT_DIR ? { SSL_CERT_DIR: process.env.SSL_CERT_DIR } : {}),
        },
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const chunks = []
      let bytes = 0
      let failure
      const timer = setTimeout(() => {
        failure = new Error('Scan deadline exceeded.')
        child.kill('SIGKILL')
      }, input.timeout)

      child.stdout.on('data', (chunk) => {
        bytes += chunk.length

        if (bytes > 16 * 1024 * 1024) {
          failure = new Error('Scan output limit exceeded.')
          child.kill('SIGKILL')
        } else {
          chunks.push(chunk)
        }
      })
      child.once('error', (error) => {
        failure = error
      })
      child.once('close', (code) => {
        clearTimeout(timer)

        if (failure || code !== 0) {
          reject(failure || new Error('The scanner exited unsuccessfully.'))
          return
        }

        try {
          const output = Buffer.concat(chunks)

          JSON.parse(output.toString('utf8'))
          resolve(output)
        } catch {
          reject(new Error('The scanner returned an invalid report.'))
        }
      })
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
