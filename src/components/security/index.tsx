'use client'

import { Authenticator } from '@/components/security/authenticator'
import { Identity } from '@/components/security/identity'
import { Passkeys } from '@/components/security/passkeys'
import { Recovery } from '@/components/security/recovery'
import { ErrorMessage } from '@/components/shared/error-message'
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

      {codes.length > 0 && <Recovery codes={codes} onConfirm={() => security.setCodes([])} />}

      {!verified && codes.length === 0 && (
        <Identity busy={busy} onVerify={security.verify} totpEnabled={status.totpEnabled} />
      )}

      <Passkeys
        busy={busy}
        directoryAccount={status.directoryAccount}
        onAdd={security.addPasskey}
        onRemove={security.removePasskey}
        passkeys={status.passkeys}
        verified={verified}
      />

      <Authenticator
        busy={busy}
        enabled={status.totpEnabled}
        onCancel={() => security.setSetup(null)}
        onEnable={security.enableTotp}
        onToggle={status.totpEnabled ? security.disableTotp : security.beginTotp}
        remaining={status.recoveryRemaining}
        setup={setup}
        verified={verified}
      />
    </div>
  )
}
