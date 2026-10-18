import { type SyntheticEvent } from 'react'
import Image from 'next/image'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type TotpSetup } from '@/types/security'

type Props = {
  busy: boolean
  setup: TotpSetup
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}

export function Setup({ busy, setup, onSubmit, onCancel }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid items-center gap-6 sm:grid-cols-[240px_minmax(0,1fr)]">
        <Image
          alt="Authenticator setup QR code"
          className="rounded-lg"
          height={240}
          src={setup.qrCode}
          unoptimized
          width={240}
        />

        <div className="min-w-0 space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="totp-secret">Manual</Label>
            <Input className="font-mono" id="totp-secret" readOnly value={setup.secret} />
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="totp-code">Code</Label>
              <Input
                autoComplete="one-time-code"
                disabled={busy}
                id="totp-code"
                inputMode="numeric"
                maxLength={6}
                name="code"
                pattern="[0-9]{6}"
                required
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled={busy} type="submit">
                Enable
              </Button>

              <Button disabled={busy} onClick={onCancel} type="button" variant="outline">
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
