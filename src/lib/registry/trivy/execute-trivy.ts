import 'server-only'

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { env } from '@/lib/config/env'
import { validateUrl } from '@/lib/registry/allowlist'
import { assertRepository } from '@/lib/registry/repository'
import { requirePublic } from '@/lib/registry/scan-policy'
import { MAX_REPORT_BYTES } from '@/lib/registry/trivy/constants'
import { remoteTrivy } from '@/lib/registry/trivy/remote-trivy'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'

export async function executeTrivy(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  platform: string,
  timeout: number
): Promise<unknown> {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertRepository(registry, repository)

  await requirePublic(registry, repository)

  const config = env()
  const origin = new URL(validateUrl(registry.url, registry.provider))

  if (config.TRIVY_RUNNER_URL) {
    return remoteTrivy(registry, repository, digest, platform, timeout)
  }

  if (process.env.NODE_ENV === 'production') {
    throw new AppError(503, 'Production scanning requires an isolated scanner worker.')
  }

  const target = `${origin.host}/${repository}@${digest}`
  const directory = await mkdtemp(path.join(tmpdir(), 'registry-trivy-'))

  let workspace: string | undefined

  try {
    const configFile = path.join(directory, 'trivy.yaml')
    const cacheDir = path.resolve(config.DATA_DIR, 'trivy-cache')
    const workspaceRoot = path.resolve(config.DATA_DIR, 'trivy-tmp')

    await mkdir(workspaceRoot, { recursive: true, mode: 0o700 })
    workspace = await mkdtemp(path.join(workspaceRoot, 'scan-'))

    await writeFile(configFile, '{}', { mode: 0o600 })
    await mkdir(cacheDir, { recursive: true, mode: 0o700 })

    const args = [
      'image',
      '--config',
      configFile,
      '--cache-dir',
      cacheDir,
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
      `${Math.max(1, Math.floor(timeout / 1000))}s`,
      '--parallel',
      '2',
      '--exit-code',
      '0',
    ]

    if (origin.protocol === 'http:') {
      args.push('--insecure')
    }

    if (platform !== 'Not provided') {
      if (!/^[a-z0-9_-]+\/[a-z0-9_-]+(?:\/[a-z0-9_.-]+)?$/.test(platform)) {
        throw new AppError(502, 'The image reports an unsupported platform value.')
      }

      args.push('--platform', platform)
    }

    const password = decryptSecret(registry.password)
    const authHost = registry.provider === 'dockerhub' ? 'https://index.docker.io/v1/' : origin.host

    await writeFile(
      path.join(directory, 'config.json'),
      JSON.stringify({
        auths:
          registry.username || password
            ? {
                [authHost]: {
                  auth: Buffer.from(`${registry.username}:${password}`).toString('base64'),
                },
              }
            : {},
      }),
      { mode: 0o600 }
    )

    args.push('--', target)

    return await new Promise((resolve, reject) => {
      const child = spawn(config.TRIVY_PATH, args, {
        shell: false,
        cwd: directory,
        env: {
          NODE_ENV: 'production',
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: directory,
          TMPDIR: workspace,
          XDG_CONFIG_HOME: directory,
          DOCKER_CONFIG: directory,
          ...(process.env.SSL_CERT_FILE ? { SSL_CERT_FILE: process.env.SSL_CERT_FILE } : {}),
          ...(process.env.SSL_CERT_DIR ? { SSL_CERT_DIR: process.env.SSL_CERT_DIR } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const output: Buffer[] = []
      let bytes = 0
      let failure: AppError | undefined

      const timer = setTimeout(() => {
        failure = new AppError(
          504,
          'The vulnerability scan timed out. Try again after updating the Trivy database.'
        )
        child.kill('SIGKILL')
      }, timeout)

      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length

        if (bytes > MAX_REPORT_BYTES) {
          failure = new AppError(413, 'Trivy output exceeded the supported report size.')
          child.kill('SIGKILL')
          return
        }

        output.push(chunk)
      })

      child.stderr.resume()
      child.stdin.on('error', () => undefined)
      child.stdin.end()

      child.once('error', () => {
        failure = new AppError(503, 'Trivy could not be started. Check the installed executable.')
      })

      child.once('close', (code) => {
        clearTimeout(timer)

        if (failure || code !== 0) {
          reject(
            failure ??
              new AppError(
                502,
                'Trivy could not scan this image. Check registry access, database availability, and the installed version.'
              )
          )
          return
        }

        try {
          resolve(JSON.parse(Buffer.concat(output).toString('utf8')))
        } catch {
          reject(new AppError(502, 'Trivy returned an invalid report.'))
        }
      })
    })
  } finally {
    try {
      if (workspace) {
        await rm(workspace, { recursive: true, force: true })
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
