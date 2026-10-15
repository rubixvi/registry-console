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
    cache: 'no-store',
  })

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
    throw new Error('Server returned an invalid response.')
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

    throw new Error(message)
  }

  return body as T
}
