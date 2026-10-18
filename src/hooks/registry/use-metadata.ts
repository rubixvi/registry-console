'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

import { apiRequest } from '@/lib/http/client'
import { type ImageMetadata } from '@/types/image'

const waiting: (() => void)[] = []

let active = 0

async function fetchMetadata(url: string): Promise<ImageMetadata> {
  await new Promise<void>((resolve) => {
    const start = () => {
      active++
      resolve()
    }

    if (active < 3) {
      start()
    } else {
      waiting.push(start)
    }
  })

  try {
    return await apiRequest<ImageMetadata>(url)
  } finally {
    active--
    waiting.shift()?.()
  }
}

export function useMetadata(id: string, repository: string, reference: string) {
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  const params = new URLSearchParams({ repository, reference })
  const endpoint = `/api/registries/${encodeURIComponent(id)}/metadata?${params}`

  const resource = useSWR<ImageMetadata>(visible ? endpoint : null, fetchMetadata, {
    dedupingInterval: 10_000,
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    keepPreviousData: false,
  })

  useEffect(() => {
    const element = container.current

    if (!element) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return {
    ...resource,
    container,
  }
}
