import { type SyntheticEvent } from 'react'
import { UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  busy: boolean
  totpEnabled: boolean
  onVerify: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
}

export function Identity({ busy, totpEnabled, onVerify }: Props) {
  return (
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <UserRound aria-hidden="true" className="size-4 text-primary" />
        Identity
      </h2>

      <p className="text-sm text-muted-foreground">
        Enter your password
        {totpEnabled ? ' and an authenticator or recovery code' : ''} to manage your sign-in
        methods.
      </p>

      <form className="space-y-4" onSubmit={onVerify}>
        <div className="grid gap-2">
          <Label htmlFor="security-password">Password</Label>
          <Input
            autoComplete="current-password"
            disabled={busy}
            id="security-password"
            maxLength={1024}
            name="password"
            required
            type="password"
          />
        </div>

        {totpEnabled && (
          <div className="grid gap-2">
            <Label htmlFor="security-code">Authenticator or recovery code</Label>
            <Input
              autoComplete="one-time-code"
              disabled={busy}
              id="security-code"
              maxLength={64}
              name="code"
              required
            />
          </div>
        )}

        <Button disabled={busy} type="submit">
          {busy ? 'Verifying…' : 'Verify'}
        </Button>
      </form>
    </section>
  )
}
