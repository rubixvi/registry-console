import { type SyntheticEvent } from 'react'
import { ShieldCheck } from 'lucide-react'

import { Setup } from '@/components/security/setup'
import { Button } from '@/components/ui/button'
import { type TotpSetup } from '@/types/security'

type Props = {
  busy: boolean
  verified: boolean
  enabled: boolean
  remaining: number
  setup: TotpSetup | null
  onToggle: () => Promise<void>
  onEnable: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}

export function Authenticator({
  busy,
  verified,
  enabled,
  remaining,
  setup,
  onToggle,
  onEnable,
  onCancel,
}: Props) {
  return (
    <section className="space-y-5 rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
        Authenticator
      </h2>

      <p className="text-sm text-muted-foreground">
        {enabled
          ? `Enabled for password and SSO sign-in. ${remaining} recovery codes remaining.`
          : 'Require a six-digit code from your authenticator app after password or SSO sign-in.'}
      </p>

      {verified && !setup && (
        <Button disabled={busy} onClick={() => void onToggle()} type="button" variant="outline">
          {enabled ? 'Disable authenticator' : 'Set up authenticator'}
        </Button>
      )}

      {setup && <Setup busy={busy} onCancel={onCancel} onSubmit={onEnable} setup={setup} />}
    </section>
  )
}
