import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { type PasskeySummary } from '@/types/security'

type Props = {
  passkey: PasskeySummary
  disabled: boolean
  onRemove: (id: string) => Promise<void>
}

export function Passkey({ passkey, disabled, onRemove }: Props) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{passkey.name}</p>

        <p className="text-xs text-muted-foreground">
          Added {passkey.created.slice(0, 10)}
          {passkey.lastUsed ? ` · Last used ${passkey.lastUsed.slice(0, 10)}` : ''}
        </p>
      </div>

      <Button
        aria-label={`Remove ${passkey.name}`}
        disabled={disabled}
        onClick={() => void onRemove(passkey.id)}
        size="icon"
        type="button"
        variant="outline"
      >
        <X aria-hidden="true" className="size-4" />
      </Button>
    </li>
  )
}
