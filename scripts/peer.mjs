import { createHmac, randomBytes } from 'node:crypto'
import { Server } from 'node:http'

const key = randomBytes(32).toString('hex')
const emit = Server.prototype.emit

process.env.REGISTRY_PEER_KEY = key

Server.prototype.emit = function (event, ...args) {
  if (event === 'request') {
    const request = args[0]
    const address = request.socket.remoteAddress ?? ''
    const value = `${address};${Date.now()}`
    const signature = createHmac('sha256', key).update(value).digest('hex')

    request.headers['x-registry-peer'] = `${value};${signature}`
  }

  return emit.call(this, event, ...args)
}
