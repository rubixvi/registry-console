import 'server-only'

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import {
  adoptScan,
  claimScan,
  discardScan,
  finishScan,
  getScan,
  queueScan,
  scanDelay,
  scanDue,
} from '@/lib/database/scan'
import { validateUrl } from '@/lib/registry/allowlist'
import { assertDockerHubRepository } from '@/lib/registry/dockerhub'
import { registryIdentity } from '@/lib/registry/identity'
import { imageDetails } from '@/lib/registry/image'
import { getRegistry } from '@/lib/registry/store'
import { appendTrivyReport, emptyReport } from '@/lib/registry/trivy-report'
import { decryptSecret } from '@/lib/security/crypto'
import { AppError } from '@/lib/security/error'
import { keyedFingerprint } from '@/lib/security/fingerprint'
import { digestName, repositoryName } from '@/lib/validation/registry'
import { type RegistryRecord } from '@/types/registry'
import { type ScanJob, type ScanStatus, type ScanTarget } from '@/types/scan'

const MAX_REPORT_BYTES = 16 * 1024 * 1024

function scanKey(registry: RegistryRecord, digest: string): string {
  return keyedFingerprint('trivy-image-report', [registryIdentity(registry), digest])
}

function reportKey(registry: RegistryRecord, repository: string, digest: string): string {
  const id = scanKey(registry, digest)

  if (!getScan(id)) {
    const previous = keyedFingerprint('trivy-report', [
      registryIdentity(registry),
      repository,
      digest,
    ])

    adoptScan(id, previous)
  }

  return id
}

function scanAllowed(registry: RegistryRecord): boolean {
  validateUrl(registry.url, registry.provider)

  return env().TRIVY_ENABLED === 'true'
}

export function scanStatus(
  registry: RegistryRecord,
  repository: string,
  digest: string
): ScanStatus {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)

  if (!scanAllowed(registry)) {
    return { enabled: false, status: 'not-scanned' }
  }

  const row = getScan(reportKey(registry, repository, digest))

  if (!row) {
    return { enabled: true, status: 'not-scanned', retryAfter: scanDelay() }
  }

  if (row.status === 'running' && row.expires <= Date.now()) {
    return {
      enabled: true,
      status: 'failed',
      error: 'The scan was interrupted or timed out. Start a new scan.',
      retryAfter: scanDelay(),
    }
  }

  return {
    enabled: true,
    status: row.status,
    ...JSON.parse(row.value),
    ...(row.status === 'failed' ? { retryAfter: scanDelay() } : {}),
  }
}

export function needsScan(registry: RegistryRecord, repository: string, digest: string): boolean {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)

  return scanAllowed(registry) && scanDue(reportKey(registry, repository, digest))
}

export function scheduleScan(
  registry: RegistryRecord,
  repository: string,
  digest: string
): boolean {
  if (env().TRIVY_ENABLED !== 'true') return false

  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)
  scanAllowed(registry)

  return queueScan(scanTarget(registry, repository, digest))
}

export function scanTarget(
  registry: RegistryRecord,
  repository: string,
  digest: string
): ScanTarget {
  return {
    id: reportKey(registry, repository, digest),
    registryId: registry.id,
    repository,
    digest,
  }
}

export function matchesScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  id: string
): boolean {
  return reportKey(registry, repository, digest) === id
}

export function prepareScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string,
  override = false
): ScanJob {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)

  if (!scanAllowed(registry)) {
    throw new AppError(409, 'Trivy scanning is disabled. Set TRIVY_ENABLED=true to enable it.')
  }

  if (!path.isAbsolute(env().TRIVY_PATH)) {
    throw new AppError(
      503,
      'TRIVY_PATH must point to an installed executable using an absolute path.'
    )
  }

  const id = reportKey(registry, repository, digest)
  const expires = Date.now() + (env().TRIVY_TIMEOUT_SECONDS + 60) * 1000

  claimScan({ id, registryId: registry.id, repository, digest, actor, expires, override })

  return { id, registryId: registry.id, repository, digest, actor, expires }
}

export async function startScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string,
  override = false
): Promise<ScanJob | null> {
  if (!scanAllowed(registry)) {
    throw new AppError(409, 'Trivy scanning is disabled. Set TRIVY_ENABLED=true to enable it.')
  }

  const details = await imageDetails(registry, repository, digest)

  if (!details.platformDetails.length) {
    discardScan(reportKey(registry, repository, digest))
    return null
  }

  if (details.platformDetails.length > 8) {
    throw new AppError(413, 'Scanning supports images with one to eight runnable platforms.')
  }

  return prepareScan(registry, repository, digest, actor, override)
}

export async function executeTrivy(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  platform: string,
  timeout: number
): Promise<unknown> {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)

  const config = env()
  const origin = new URL(validateUrl(registry.url, registry.provider))

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

export async function runScan(job: ScanJob): Promise<void> {
  const stored = getScan(job.id)

  if (stored?.status !== 'running' || stored.expires !== job.expires) return

  try {
    const registry = getRegistry(job.registryId)

    if (!scanAllowed(registry) || scanKey(registry, job.digest) !== job.id) {
      discardScan(job.id)
      throw new AppError(409, 'The connection changed. Start the scan again.')
    }

    const details = await imageDetails(registry, job.repository, job.digest)
    const platforms = details.platformDetails

    if (!platforms.length || platforms.length > 8) {
      throw new AppError(413, 'Scanning supports images with one to eight runnable platforms.')
    }

    const report = emptyReport(job.digest)
    const deadline = Math.min(job.expires, Date.now() + env().TRIVY_TIMEOUT_SECONDS * 1000)

    for (const entry of platforms) {
      const remaining = deadline - Date.now()

      if (remaining <= 0) {
        throw new AppError(504, 'The multi-platform vulnerability scan timed out.')
      }

      const output = await executeTrivy(
        registry,
        job.repository,
        entry.digest,
        entry.platform,
        remaining
      )

      appendTrivyReport(report, output, entry.platform)
    }

    const current = getRegistry(job.registryId)

    if (!scanAllowed(current) || scanKey(current, job.digest) !== job.id) {
      discardScan(job.id)
      throw new AppError(409, 'The connection changed. Start the scan again.')
    }

    report.scannedAt = new Date().toISOString()
    report.vulnerabilities.sort((a, b) => {
      const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']

      return order.indexOf(a.severity) - order.indexOf(b.severity)
    })

    if (finishScan(job.id, job.expires, { report })) {
      audit(job.actor, 'image.scan.complete', `${job.registryId}/${job.repository}@${job.digest}`)
    }
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : 'The vulnerability report could not be validated.'

    if (finishScan(job.id, job.expires, { error: message })) {
      audit(job.actor, 'image.scan.failed', `${job.registryId}/${job.repository}@${job.digest}`)
    }
  }
}
