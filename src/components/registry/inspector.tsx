'use client'

import Link from 'next/link'
import { Layers3, ShieldCheck } from 'lucide-react'

import { Command } from '@/components/registry/command'
import { DeleteDialog } from '@/components/registry/delete-dialog'
import { ImageHistory } from '@/components/registry/history'
import { ErrorMessage } from '@/components/shared/error-message'
import { Loading } from '@/components/shared/loading'
import { useResource } from '@/hooks/shared/use-resource'
import { type ImageDetails } from '@/types/image'
import { type Registry } from '@/types/registry'
import { formatBytes } from '@/utils/format-bytes'
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

  const { data, error, isLoading } = useResource<ImageDetails>(
    `/api${registryPath}/image?${params}`
  )

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage message={error.message} />
  if (!data) return null

  const summary = imageSummary(data)
  const command = pullCommand(registry.url, repository, reference, pullUrl)
  const hasChildren = summary.children.length > 0
  const canDelete = admin && !registry.readOnly

  const digestLabel = data.verified ? 'Digest verified' : 'Digest calculated'
  const digestColour = data.verified ? 'text-emerald-700' : 'text-muted-foreground'

  return (
    <div className="space-y-6">
      <Command command={command} />

      <section className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Layers3 aria-hidden="true" className="size-5 text-primary" />
            Image overview
          </h2>

          <span className={`flex items-center gap-1.5 text-xs ${digestColour}`}>
            {data.verified && <ShieldCheck aria-hidden="true" className="size-4" />}
            {digestLabel}
          </span>
        </div>

        <dl className="grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Compressed size</dt>
            <dd className="mt-2 font-medium">
              {hasChildren ? 'Per platform manifest' : formatBytes(data.size)}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">Platform</dt>
            <dd className="mt-2 break-all font-medium">{summary.platform}</dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd className="mt-2 break-all font-medium">{summary.created}</dd>
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
      </section>

      {hasChildren && (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="mb-4 font-semibold">Platform manifests</h2>

          <ul className="space-y-3">
            {summary.children.map((child) => {
              let platform = 'Manifest'

              if (child.platform) {
                const { os, architecture, variant } = child.platform
                const parts = [os, architecture]

                if (variant) {
                  parts.push(variant)
                }

                platform = parts.join('/')
              }

              return (
                <li key={child.digest}>
                  <Link
                    className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    href={{
                      pathname: registryPath,
                      query: { repository, reference: child.digest },
                    }}
                  >
                    <span className="mb-1 block text-sm font-medium">{platform}</span>
                    <code className="break-all text-xs text-muted-foreground">{child.digest}</code>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
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
            <summary className="cursor-pointer text-sm font-semibold">
              Image configuration and history
            </summary>
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs leading-6">
              {JSON.stringify(data.config, null, 2)}
            </pre>
          </details>
        )}
      </section>

      {canDelete && (
        <div className="flex justify-end">
          <DeleteDialog digest={data.digest} id={registry.id} repository={repository} />
        </div>
      )}
    </div>
  )
}
