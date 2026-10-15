import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'

type CborValue = string | number | Buffer | Map<CborValue, CborValue>

function cbor(value: CborValue): Buffer {
  function header(major: number, size: number): Buffer {
    if (size < 24) {
      return Buffer.from([(major << 5) | size])
    }

    if (size < 256) {
      return Buffer.from([(major << 5) | 24, size])
    }

    const result = Buffer.alloc(3)

    result[0] = (major << 5) | 25
    result.writeUInt16BE(size, 1)

    return result
  }

  if (typeof value === 'number') {
    return header(value < 0 ? 1 : 0, value < 0 ? -value - 1 : value)
  }

  if (typeof value === 'string') {
    const bytes = Buffer.from(value)

    return Buffer.concat([header(3, bytes.length), bytes])
  }

  if (Buffer.isBuffer(value)) {
    return Buffer.concat([header(2, value.length), value])
  }

  return Buffer.concat([
    header(5, value.size),
    ...[...value.entries()].flatMap(([key, item]) => [cbor(key), cbor(item)]),
  ])
}

export function virtualPasskey() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  })

  const jwk = publicKey.export({ format: 'jwk' })
  const id = randomBytes(32)
  const credentialId = id.toString('base64url')

  let counter = 0

  function clientData(type: string, challenge: string, origin: string): Buffer {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin,
        crossOrigin: false,
      })
    )
  }

  function authenticatorData(rpID: string, flags: number): Buffer {
    const data = Buffer.alloc(37)

    createHash('sha256').update(rpID).digest().copy(data)

    data[32] = flags
    data.writeUInt32BE(++counter, 33)

    return data
  }

  return {
    id: credentialId,

    registration(challenge: string, origin: string, verified = true): RegistrationResponseJSON {
      const data = clientData('webauthn.create', challenge, origin)
      const length = Buffer.alloc(2)

      length.writeUInt16BE(id.length)

      const cose = cbor(
        new Map<CborValue, CborValue>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x!, 'base64url')],
          [-3, Buffer.from(jwk.y!, 'base64url')],
        ])
      )

      const auth = Buffer.concat([
        authenticatorData(new URL(origin).hostname, verified ? 0x45 : 0x41),
        Buffer.alloc(16),
        length,
        id,
        cose,
      ])

      const attestation = cbor(
        new Map<CborValue, CborValue>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', auth],
        ])
      )

      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: data.toString('base64url'),
          attestationObject: attestation.toString('base64url'),
          transports: ['internal'],
        },
      }
    },

    authentication(
      challenge: string,
      origin: string,
      userHandle: string,
      verified = true
    ): AuthenticationResponseJSON {
      const data = clientData('webauthn.get', challenge, origin)

      const auth = authenticatorData(new URL(origin).hostname, verified ? 5 : 1)

      const signature = sign(
        'sha256',
        Buffer.concat([auth, createHash('sha256').update(data).digest()]),
        privateKey
      )

      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: data.toString('base64url'),
          authenticatorData: auth.toString('base64url'),
          signature: signature.toString('base64url'),
          userHandle,
        },
      }
    },
  }
}
