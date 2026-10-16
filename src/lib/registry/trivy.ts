import 'server-only'

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { env } from '@/lib/config/env'
import { audit } from '@/lib/database/audit'
import { database } from '@/lib/database/client'
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
import { type ScanStatus } from '@/types/scan'

const MAX_REPORT_BYTES = 16 * 1024 * 1024
const RETENTION = 24 * 60 * 60_000

export type ScanJob = {
  id: string
  registryId: string
  repository: string
  digest: string
  actor: string
  expires: number
}

type ScanRow = {
  status: ScanStatus['status']
  value: string
  expires: number
}

function scanKey(registry: RegistryRecord, repository: string, digest: string): string {
  return keyedFingerprint('trivy-report', [registryIdentity(registry), repository, digest])
}

function scanAllowed(registry: RegistryRecord): boolean {
  validateUrl(registry.url)

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

  const row = database()
    .prepare('SELECT status, value, expires FROM image_scans WHERE id = ?')
    .get(scanKey(registry, repository, digest)) as ScanRow | undefined

  if (!row || (row.expires <= Date.now() && row.status !== 'running')) {
    return { enabled: true, status: 'not-scanned' }
  }

  if (row.status === 'running' && row.expires <= Date.now()) {
    return {
      enabled: true,
      status: 'failed',
      error: 'The scan was interrupted or timed out. Start a new scan.',
    }
  }

  return { enabled: true, status: row.status, ...JSON.parse(row.value) }
}

export function prepareScan(
  registry: RegistryRecord,
  repository: string,
  digest: string,
  actor: string
): ScanJob {
  repositoryName.parse(repository)
  digestName.parse(digest)
  assertDockerHubRepository(registry, repository)

  if (!scanAllowed(registry)) {
    throw new AppError(409, 'Trivy scanning is disabled. Set TRIVY_ENABLED=true to enable it.')
  }

  if (new URL(registry.url).protocol !== 'https:') {
    throw new AppError(409, 'Trivy scanning requires an HTTPS registry with a valid certificate.')
  }

  if (!path.isAbsolute(env().TRIVY_PATH)) {
    throw new AppError(
      503,
      'TRIVY_PATH must point to an installed executable using an absolute path.'
    )
  }

  const db = database()
  const now = Date.now()
  const id = scanKey(registry, repository, digest)
  const expires = now + (env().TRIVY_TIMEOUT_SECONDS + 60) * 1000

  db.exec('BEGIN IMMEDIATE')

  try {
    db.prepare('DELETE FROM image_scans WHERE expires <= ?').run(now)

    const running = db.prepare("SELECT id FROM image_scans WHERE status = 'running'").get()

    if (running) {
      throw new AppError(
        409,
        'A scan is already running. Wait for it to finish before starting another.'
      )
    }

    db.prepare(`
      DELETE FROM image_scans WHERE id IN (
        SELECT id FROM image_scans ORDER BY updated DESC LIMIT -1 OFFSET 49
      )
    `).run()

    db.prepare(`
      INSERT INTO image_scans (id, registry_id, status, value, expires, updated)
      VALUES (?, ?, 'running', '{}', ?, ?)
      ON CONFLICT(id) DO UPDATE SET status = 'running', value = '{}',
        expires = excluded.expires, updated = excluded.updated
    `).run(id, registry.id, expires, now)

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  audit(actor, 'image.scan.started', `${registry.id}/${repository}@${digest}`)

  return { id, registryId: registry.id, repository, digest, actor, expires }
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
  const origin = new URL(validateUrl(registry.url))

  if (origin.protocol !== 'https:') {
    throw new AppError(409, 'Trivy scanning requires an HTTPS registry with a valid certificate.')
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
  const db = database()

  try {
    const registry = getRegistry(job.registryId)

    if (!scanAllowed(registry) || scanKey(registry, job.repository, job.digest) !== job.id) {
      throw new AppError(409, 'The connection changed. Start the scan again.')
    }

    const details = await imageDetails(registry, job.repository, job.digest, true)
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

    report.scannedAt = new Date().toISOString()
    report.vulnerabilities.sort((a, b) => {
      const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']

      return order.indexOf(a.severity) - order.indexOf(b.severity)
    })

    db.prepare(`
      UPDATE image_scans SET status = 'complete', value = ?, expires = ?, updated = ?
      WHERE id = ? AND status = 'running' AND expires = ?
    `).run(JSON.stringify({ report }), Date.now() + RETENTION, Date.now(), job.id, job.expires)

    audit(job.actor, 'image.scan.complete', `${job.registryId}/${job.repository}@${job.digest}`)
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : 'The vulnerability report could not be validated.'

    db.prepare(`
      UPDATE image_scans SET status = 'failed', value = ?, expires = ?, updated = ?
      WHERE id = ? AND status = 'running' AND expires = ?
    `).run(
      JSON.stringify({ error: message }),
      Date.now() + RETENTION,
      Date.now(),
      job.id,
      job.expires
    )

    audit(job.actor, 'image.scan.failed', `${job.registryId}/${job.repository}@${job.digest}`)
  }
}
