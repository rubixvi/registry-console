import { type PasskeyRow } from '@/types/security'

export type Filter = Pick<PasskeyRow, 'username' | 'fingerprint'>

export type Remove = Pick<PasskeyRow, 'id' | 'username' | 'fingerprint'>

export type Insert = Pick<PasskeyRow, 'id' | 'username' | 'fingerprint' | 'counter' | 'name'> & {
  userId: string
  publicKey: Uint8Array
  transports: readonly string[]
}

export type Update = Pick<PasskeyRow, 'id' | 'fingerprint' | 'counter'> & {
  previous: PasskeyRow['counter']
}
