'use client'

import { ArrowRight, Fingerprint, LoaderCircle } from 'lucide-react'

import { SsoButtons } from '@/components/auth/sso'
import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin } from '@/hooks/auth/use-login'
import { type SsoButton } from '@/types/sso'

type Props = { providers?: SsoButton[]; initialFactor?: boolean; ssoError?: boolean }

export function LoginForm({ providers = [], initialFactor = false, ssoError = false }: Props) {
  const { error, busy, twoFactor, recovery, setRecovery, submit, passkey, restart } =
    useLogin(initialFactor)

  return (
    <form aria-busy={busy} className="space-y-5" onSubmit={submit}>
      {twoFactor ? (
        <div className="grid gap-2">
          <Label htmlFor="code">{recovery ? 'Recovery code' : 'Authenticator code'}</Label>
          <Input
            autoComplete="one-time-code"
            autoFocus
            disabled={busy}
            id="code"
            inputMode={recovery ? 'text' : 'numeric'}
            key={recovery ? 'recovery' : 'totp'}
            maxLength={recovery ? 64 : 6}
            name="code"
            pattern={recovery ? undefined : '[0-9]{6}'}
            required
            type="text"
          />

          <p className="text-sm text-muted-foreground">
            {recovery
              ? 'Enter one of your unused recovery codes.'
              : 'Enter the six-digit code from your authenticator app.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              autoCapitalize="none"
              autoComplete="username webauthn"
              autoFocus
              disabled={busy}
              id="username"
              maxLength={64}
              name="username"
              required
              spellCheck={false}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              autoComplete="current-password"
              disabled={busy}
              id="password"
              maxLength={1024}
              name="password"
              required
              type="password"
            />
          </div>
        </>
      )}

      <ErrorMessage message={error} />

      {ssoError && (
        <ErrorMessage message="SSO sign-in could not be verified. Check your configured email and provider." />
      )}

      <Button className="w-full" disabled={busy} type="submit">
        {busy ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <ArrowRight aria-hidden="true" />
        )}
        {busy ? 'Signing in…' : twoFactor ? 'Verify and sign in' : 'Sign in'}
      </Button>

      {twoFactor ? (
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            disabled={busy}
            onClick={() => setRecovery(!recovery)}
            type="button"
            variant="link"
          >
            {recovery ? 'Use authenticator code' : 'Use recovery code'}
          </Button>

          <Button disabled={busy} onClick={restart} type="button" variant="link">
            Back to sign in
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void passkey()}
          type="button"
          variant="outline"
        >
          <Fingerprint aria-hidden="true" />
          Sign in with a passkey
        </Button>
      )}

      {!twoFactor && <SsoButtons disabled={busy} providers={providers} />}
    </form>
  )
}
