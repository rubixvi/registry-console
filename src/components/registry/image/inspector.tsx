'use client'

import Link from 'next/link'
import { Layers3, ShieldCheck } from 'lucide-react'

import { CopyButton } from '@/components/registry/controls/copy-button'
import { DeleteDialog } from '@/components/registry/controls/delete-dialog'
import { ImageHistory } from '@/components/registry/image/history'
import { ImageScan } from '@/components/registry/security/scan'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { useResource } from '@/hooks/shared/use-resource'
import { type ImageDetails } from '@/types/image'
import { type Registry } from '@/types/registry'
import { formatBytes } from '@/utils/format-bytes'
import { isAttestation } from '@/utils/image-metadata'
import { imageSummary } from '@/utils/image-summary'
import { pullCommand } from '@/utils/pull-command'

type Props = {
  registry: Registry
  repository: string
  reference: string
  admin: boolean
  pullUrl: string
}

export function Inspector({ registry, repository, reference, admin, pullUrl }: Props) {
  const registryPath = `/registries/${encodeURIComponent(registry.id)}`
  const params = new URLSearchParams({ repository, reference })
  const endpoint = `/api${registryPath}/image?${params}`

  const { data, error, isLoading } = useResource<ImageDetails>(endpoint)

  if (isLoading) {
    return <Loading />
  }

  if (error) {
    return <ErrorMessage message={error.message} />
  }

  if (!data) {
    return null
  }

  const summary = imageSummary(data)
  const command = pullCommand(registry.url, repository, reference, pullUrl)

  const hasChildren = summary.children.length > 0
  const multiple = data.platformDetails.length > 1
  const canDelete = admin && !registry.readOnly

  const digestLabel = data.verified ? 'Digest verified' : 'Digest calculated'
  const digestColour = data.verified ? 'text-emerald-700' : 'text-muted-foreground'

  return (
    <div className="space-y-6">
      <CopyButton command={command} />

      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Layers3 aria-hidden="true" className="size-5 text-primary" />
            Overview
            {data.isPrivate === true && (
              <span className="text-xs font-normal text-muted-foreground">Private</span>
            )}
          </h2>

          <span className={`flex items-center gap-1.5 text-xs ${digestColour}`}>
            {data.verified && <ShieldCheck aria-hidden="true" className="size-4" />}
            {digestLabel}
          </span>
        </div>

        <dl className="grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              {multiple ? 'Total compressed size' : 'Compressed size'}
            </dt>
            <dd className="mt-2 font-medium">{formatBytes(data.size)}</dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">Platform</dt>
            <dd className="mt-2 break-all font-medium">{summary.platform}</dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">
              {multiple ? 'Latest reported build' : 'Created'}
            </dt>
            <dd className="mt-2 break-all font-medium">
              {data.created ? (
                <time dateTime={data.created}>{summary.created}</time>
              ) : (
                summary.created
              )}
            </dd>
          </div>

          <div className="sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Content digest</dt>
            <dd className="mt-2 break-all font-mono text-xs">{data.digest}</dd>
          </div>

          <div className="sm:col-span-3">
            <dt className="text-xs text-muted-foreground">Media type</dt>
            <dd className="mt-2 break-all font-mono text-xs">{data.mediaType}</dd>
          </div>
        </dl>

        {multiple && (
          <p className="mt-4 text-xs text-muted-foreground">
            Shared blobs are counted once in the total size. Attestations are excluded.
          </p>
        )}
      </section>

      {hasChildren && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Manifests</h2>

          <ul className="space-y-3">
            {summary.children.map((child) => {
              const metadata = data.platformDetails.find((entry) => entry.digest === child.digest)

              let platform = 'Manifest'

              if (child.platform) {
                const { os, architecture, variant } = child.platform
                const parts = [os, architecture]

                if (variant) {
                  parts.push(variant)
                }

                platform = parts.join('/')
              }

              if (isAttestation(child)) {
                platform = 'Build attestation'
              }

              return (
                <li key={child.digest}>
                  <Link
                    className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    href={{
                      pathname: registryPath,
                      query: {
                        repository,
                        reference: child.digest,
                      },
                    }}
                  >
                    <span className="mb-1 block text-sm font-medium">{platform}</span>

                    {metadata && (
                      <span className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Compressed size {formatBytes(metadata.size)}</span>

                        <span>
                          Created{' '}
                          {metadata.created ? (
                            <time dateTime={metadata.created}>{metadata.created}</time>
                          ) : (
                            'not provided'
                          )}
                        </span>
                      </span>
                    )}

                    <code className="break-all text-xs text-muted-foreground">{child.digest}</code>

                    {registry.trivyEnabled && data.isPrivate === false && metadata && (
                      <div className="mt-3">
                        <ImageScan
                          compact
                          digest={child.digest}
                          id={registry.id}
                          repository={repository}
                        />
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {registry.trivyEnabled && data.isPrivate === false && data.platformDetails.length > 0 && (
        <ImageScan admin={admin} digest={data.digest} id={registry.id} repository={repository} />
      )}

      {registry.trivyEnabled && data.isPrivate === true && (
        <p className="text-sm text-muted-foreground">
          Vulnerability scanning is disabled for private Docker Hub repositories.
        </p>
      )}

      {!hasChildren && <ImageHistory entries={data.history} labels={data.labels} />}

      <section className="overflow-hidden rounded-xl border bg-card">
        <details className="p-5">
          <summary className="cursor-pointer text-sm font-semibold">Manifest JSON</summary>

          <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
            {JSON.stringify(data.manifest, null, 2)}
          </pre>
        </details>

        {data.config !== null && (
          <details className="border-t p-5">
            <summary className="cursor-pointer text-sm font-semibold">Image History</summary>

            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
              {JSON.stringify(data.config, null, 2)}
            </pre>
          </details>
        )}
      </section>

      {canDelete && (
        <div className="flex justify-end">
          <DeleteDialog
            digest={data.digest}
            id={registry.id}
            provider={registry.provider}
            repository={repository}
          />
        </div>
      )}
    </div>
  )
}
