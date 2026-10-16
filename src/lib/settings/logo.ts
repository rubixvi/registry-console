import 'server-only'

import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

import { database } from '@/lib/database/client'
import { AppError } from '@/lib/security/error'

export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export function validateLogo(bytes: Buffer): string {
  const invalid = () => new AppError(400, 'Upload a valid PNG, up to 2 MB and 2048 × 2048 pixels.')

  if (
    bytes.length > MAX_LOGO_BYTES ||
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    throw invalid()
  }

  let offset = 8
  let width = 0
  let height = 0
  let ended = false
  const compressed: Buffer[] = []

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > bytes.length) throw invalid()
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(offset + 4, end - 4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(end - 4)) throw invalid()

    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) throw invalid()
      width = bytes.readUInt32BE(offset + 8)
      height = bytes.readUInt32BE(offset + 12)
      if (!width || !height || width > 2048 || height > 2048) throw invalid()
      const depth = bytes[offset + 16]
      const colour = bytes[offset + 17]
      const depths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      }
      if (
        !depths[colour]?.includes(depth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      )
        throw invalid()
    } else if (type === 'IHDR') throw invalid()

    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, end - 4))
    offset = end
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length) throw invalid()
      ended = true
      break
    }
  }

  if (!ended || !compressed.length) throw invalid()
  try {
    const pixels = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: 34 * 1024 * 1024,
    })
    if (!pixels.length) throw invalid()
  } catch {
    throw invalid()
  }

  return createHash('sha256').update(bytes).digest('hex')
}

export function getLogo(): Buffer | null {
  const row = database().prepare("SELECT value FROM settings WHERE id = 'brand-logo'").get() as
    | { value: string }
    | undefined
  return row ? Buffer.from(row.value, 'base64') : null
}
