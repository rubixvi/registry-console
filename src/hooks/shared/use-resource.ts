'use client'

import useSWR from 'swr'

import { apiRequest } from '@/lib/http/client'

const RESOURCE_OPTIONS = {
  dedupingInterval: 10_000,
  revalidateOnFocus: false,
  shouldRetryOnError: false,
  keepPreviousData: false,
}

export function useResource<T>(url: string | null) {
  return useSWR<T>(url, apiRequest<T>, RESOURCE_OPTIONS)
}
