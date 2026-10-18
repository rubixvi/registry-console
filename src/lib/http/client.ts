import { HttpError } from '@/lib/http/error'
import { reloadPage } from '@/utils/reload'

export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)

  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  })
  const retry = response.headers.get('retry-after')
  const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0
  const date = retry ? Date.parse(retry) : NaN
  const delay = seconds || (Number.isFinite(date) ? Math.ceil((date - Date.now()) / 1000) : 0)

  if (
    response.status === 401 &&
    !url.startsWith('/api/auth/') &&
    !url.startsWith('/api/account/security/verify')
  ) {
    reloadPage('/login')
    throw new Error('Session expired. Sign in again.')
  }

  let body: unknown

  try {
    body = await response.json()
  } catch {
    throw new HttpError(
      `Server returned a non-JSON response (HTTP ${response.status}). Check the server or proxy logs.`,
      response.status,
      Math.max(0, delay)
    )
  }

  if (!response.ok) {
    let message = 'Request failed.'

    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
    ) {
      message = body.error
    }

    throw new HttpError(message, response.status, Math.max(0, delay))
  }

  return body as T
}
