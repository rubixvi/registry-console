'use client'

import Image from 'next/image'
import { Fingerprint, ShieldCheck, UserRound, X } from 'lucide-react'

import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSecurity } from '@/hooks/account/use-security'
import { type SecurityStatus } from '@/types/security'

type Props = {
  status: SecurityStatus
}

export function Security({ status }: Props) {
  const security = useSecurity()
  const { busy, verified, setup, codes } = security

  return (
    <div aria-busy={busy} className="max-w-2xl space-y-6">
      <ErrorMessage message={security.error} />

      {codes.length > 0 && (
        <section className="space-y-4 rounded-xl border bg-card p-6" role="status">
          <h2 className="font-semibold">Save your recovery codes</h2>

          <p className="text-sm text-muted-foreground">
            Store these somewhere safe. Each code works once if you lose access to your
            authenticator. These codes will not be displayed again.
          </p>

          <ul className="grid gap-2 font-mono text-sm sm:grid-cols-2">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>

          <Button onClick={() => security.setCodes([])} type="button" variant="outline">
            I have saved my codes
          </Button>
        </section>
      )}

      {!verified && codes.length === 0 && (
        <section className="space-y-5 rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <UserRound aria-hidden="true" className="size-4 text-primary" />
            Identity
          </h2>

          <p className="text-sm text-muted-foreground">
            Enter your password{status.totpEnabled ? ' and an authenticator or recovery code' : ''}{' '}
            to manage your sign-in methods.
          </p>

          <form className="space-y-4" onSubmit={security.verify}>
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

            {status.totpEnabled && (
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
      )}

      <section className="space-y-5 rounded-xl border bg-card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Fingerprint aria-hidden="true" className="size-4 text-primary" />
          Passkeys
        </h2>

        <p className="text-sm text-muted-foreground">
          Sign in using your device's fingerprint, face recognition, PIN, or a security key.
        </p>

        {status.passkeys.length > 0 ? (
          <ul className="divide-y">
            {status.passkeys.map((key) => (
              <li className="flex items-center justify-between gap-4 py-3" key={key.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>

                  <p className="text-xs text-muted-foreground">
                    Added {key.created.slice(0, 10)}
                    {key.lastUsed ? ` · Last used ${key.lastUsed.slice(0, 10)}` : ''}
                  </p>
                </div>

                <Button
                  aria-label={`Remove ${key.name}`}
                  disabled={busy || !verified}
                  onClick={() => void security.removePasskey(key.id)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No passkeys registered.</p>
        )}

        {verified && (
          <form className="flex items-end gap-3" onSubmit={security.addPasskey}>
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

            <Button disabled={busy || status.passkeys.length >= 10} type="submit">
              Add passkey
            </Button>
          </form>
        )}
      </section>

      <section className="space-y-5 rounded-xl border bg-card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Authenticator
        </h2>

        <p className="text-sm text-muted-foreground">
          {status.totpEnabled
            ? `Enabled for password sign-in. ${status.recoveryRemaining} recovery codes remaining.`
            : 'Add a six-digit code as a second step when signing in with your password.'}
        </p>

        {verified && !setup && (
          <Button
            disabled={busy}
            onClick={() =>
              void (status.totpEnabled ? security.disableTotp() : security.beginTotp())
            }
            type="button"
            variant="outline"
          >
            {status.totpEnabled ? 'Disable authenticator and sign out' : 'Set up authenticator'}
          </Button>
        )}

        {setup && (
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

                <form className="space-y-4" onSubmit={security.enableTotp}>
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

                    <Button
                      disabled={busy}
                      onClick={() => security.setSetup(null)}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
