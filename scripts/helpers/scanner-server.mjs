import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

import { scanInput } from './scan-input.mjs'
import { scanImage } from './scanner.mjs'

export function createScanner() {
  const token = process.env.TRIVY_RUNNER_TOKEN || ''
  const secret = Buffer.from(`Bearer ${token}`)
  const timeout = Number(process.env.TRIVY_TIMEOUT_SECONDS || 180)
  let busy = false

  if (!/^[a-f0-9]{64}$/i.test(token))
    throw new Error('TRIVY_RUNNER_TOKEN requires 32 random bytes as hex.')
  if (!Number.isInteger(timeout) || timeout < 30 || timeout > 600)
    throw new Error('TRIVY_TIMEOUT_SECONDS must be between 30 and 600.')

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Content-Type', 'application/json')

    if (request.method === 'GET' && request.url === '/health') {
      response.end('{"status":"ok"}')
      return
    }

    const supplied = Buffer.from(request.headers.authorization || '')

    if (
      request.method !== 'POST' ||
      request.url !== '/scan' ||
      supplied.length !== secret.length ||
      !timingSafeEqual(supplied, secret)
    ) {
      response.writeHead(401).end('{"error":"Unauthorized"}')
      return
    }

    if (busy) {
      response.setHeader('Retry-After', '1')
      response.writeHead(503).end('{"error":"Scanner is busy"}')
      return
    }

    busy = true
    const controller = new AbortController()
    let running = false

    response.once('close', () => {
      if (!response.writableEnded) controller.abort()
    })

    try {
      const chunks = []
      let bytes = 0

      for await (const chunk of request) {
        bytes += chunk.length

        if (bytes > 16 * 1024) throw new Error('Scan request is too large.')

        chunks.push(chunk)
      }

      const input = scanInput(JSON.parse(Buffer.concat(chunks).toString('utf8')))

      running = true
      response.end(await scanImage(input, controller.signal))
    } catch {
      if (!response.destroyed) {
        response.writeHead(running ? 502 : 400).end('{"error":"The scan could not be completed"}')
      }
    } finally {
      busy = false
    }
  })

  server.maxConnections = 16
  server.headersTimeout = 10_000
  server.requestTimeout = 15_000
  server.keepAliveTimeout = 5000

  return server
}
