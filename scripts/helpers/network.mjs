import { createServer } from 'node:net'

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const address = server.address()

  if (!address || typeof address === 'string') {
    await close(server)

    throw new Error('Port unavailable.')
  }

  return address.port
}

export function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

export async function availablePort() {
  const server = createServer()
  const port = await listen(server)

  await close(server)

  return port
}
