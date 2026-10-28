'use client'

import Link from 'next/link'
import { Cpu, FileCode2 } from 'lucide-react'

import { type ImageLayer, Layers } from '@/components/registry/repository/tree/layers'
import { useResource } from '@/hooks/shared/use-resource'
import { type ImageDetails } from '@/types/image'
import { formatBytes } from '@/utils/format-bytes'
import { isAttestation } from '@/utils/image-metadata'
import { imageSummary } from '@/utils/image-summary'

type Props = {
  id: string
  repository: string
  reference: string
}

export function Manifest({ id, repository, reference }: Props) {
  const params = new URLSearchParams({ repository, reference })
  const registryPath = `/registries/${encodeURIComponent(id)}`
  const endpoint = `/api${registryPath}/image?${params}`
  const state = useResource<ImageDetails>(endpoint)

  if (state.error) {
    return (
      <p className="px-2 py-2 text-xs text-destructive" role="alert">
        Image details unavailable. {state.error.message}
      </p>
    )
  }

  if (!state.data) {
    return (
      <p className="px-2 py-2 text-xs text-muted-foreground" role="status">
        Loading image manifest…
      </p>
    )
  }

  const data = state.data
  const summary = imageSummary(data)
  const children = summary.children
  const images = children.filter((child) => !isAttestation(child))
  const manifest = data.manifest

  const layers =
    manifest &&
    typeof manifest === 'object' &&
    'layers' in manifest &&
    Array.isArray(manifest.layers)
      ? (manifest.layers as ImageLayer[])
      : []

  const entries =
    children.length > 0
      ? images.map((child) => ({
          digest: child.digest,
          label: child.platform
            ? [child.platform.os, child.platform.architecture, child.platform.variant]
                .filter(Boolean)
                .join('/')
            : 'Platform not specified',
        }))
      : [{ digest: data.digest, label: summary.platform }]

  return (
    <ul aria-label={`Manifest details for ${repository}:${reference}`}>
      <li className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
        />

        <Link
          className="group flex min-h-9 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={{ pathname: registryPath, query: { repository, reference } }}
        >
          <FileCode2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-xs font-medium group-hover:text-primary">Manifest</span>

          <code className="min-w-0 truncate text-xs text-muted-foreground" title={data.digest}>
            {data.digest.slice(0, 19)}…
          </code>

          {typeof data.size === 'number' && (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatBytes(data.size)}
            </span>
          )}
        </Link>
      </li>

      {entries.map((entry) => {
        const metadata = data.platformDetails.find((item) => item.digest === entry.digest)

        return (
          <li className="relative" key={entry.digest}>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-3 top-4.75 h-px w-3 bg-border"
            />

            <Link
              aria-label={`Inspect image ${entry.label} (${entry.digest})`}
              className="group flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={{ pathname: registryPath, query: { repository, reference: entry.digest } }}
            >
              <Cpu aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-xs font-medium group-hover:text-primary">Image</span>

              <span className="min-w-0 truncate font-mono text-xs" title={entry.label}>
                {entry.label}
              </span>

              {metadata && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatBytes(metadata.size)}
                </span>
              )}
            </Link>
          </li>
        )
      })}

      <Layers layers={layers} />
    </ul>
  )
}
