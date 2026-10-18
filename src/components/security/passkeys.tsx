import { type SyntheticEvent } from 'react'
import { Fingerprint } from 'lucide-react'

import { Passkey } from '@/components/security/passkey'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type PasskeySummary } from '@/types/security'

type Props = {
  busy: boolean
  verified: boolean
  directoryAccount?: boolean
  passkeys: PasskeySummary[]
  onAdd: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

export function Passkeys({ busy, verified, directoryAccount, passkeys, onAdd, onRemove }: Props) {
  return (
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Fingerprint aria-hidden="true" className="size-4 text-primary" />
        Passkeys
      </h2>

      <p className="text-sm text-muted-foreground">
        {directoryAccount
          ? 'External accounts require provider sign-in. Local passkeys are not supported.'
          : 'Sign in with your fingerprint, facial recognition, device PIN, or security key.'}
      </p>

      {passkeys.length > 0 ? (
        <ul className="divide-y">
          {passkeys.map((passkey) => (
            <Passkey
              disabled={busy || !verified}
              key={passkey.id}
              onRemove={onRemove}
              passkey={passkey}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No passkeys registered.</p>
      )}

      {verified && !directoryAccount && (
        <form className="flex items-end gap-3" onSubmit={onAdd}>
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="passkey-name">Passkey</Label>
            <Input
              disabled={busy}
              id="passkey-name"
              maxLength={64}
              name="name"
              placeholder="My laptop"
              required
            />
          </div>

          <Button disabled={busy || passkeys.length >= 10} type="submit">
            Add passkey
          </Button>
        </form>
      )}
    </section>
  )
}
