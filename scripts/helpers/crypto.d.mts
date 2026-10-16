export const MIN_PASSWORD_LENGTH: number
export const MAX_PASSWORD_LENGTH: number

export function hashPassword(password: string): string
export function encryptionKey(value?: string): Buffer
export function encryptSecret(value: string, key: Buffer): string
export function contentDigest(value: string | Buffer): string
