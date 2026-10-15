'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/hooks/settings/use-settings'
import { type Branding } from '@/types/branding'

type Props = {
  branding: Branding
}

export function BrandingForm({ branding }: Props) {
  const { busy, error, submit, remove } = useSettings()
  const [colour, setColour] = useState(branding.accent)

  return (
    <form aria-busy={busy} className="space-y-6" onSubmit={submit}>
      <div className="grid items-center gap-x-8 gap-y-5 sm:grid-cols-[120px_minmax(0,1fr)]">
        <Label htmlFor="brand-name">Name</Label>
        <Input defaultValue={branding.name} id="brand-name" maxLength={64} name="name" required />

        <Label htmlFor="brand-logo">Logo</Label>

        <div className="flex items-center gap-2">
          <Input
            accept="image/png,.png"
            className="min-w-0 flex-1"
            disabled={busy}
            id="brand-logo"
            name="logo"
            type="file"
          />

          {branding.logoPath && (
            <Button
              aria-label="Remove logo"
              className="shrink-0"
              disabled={busy}
              onClick={() => void remove()}
              size="icon-lg"
              type="button"
              variant="outline"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>

        <Label htmlFor="brand-footer">Footer</Label>
        <Input defaultValue={branding.footer} id="brand-footer" maxLength={160} name="footer" />

        <Label htmlFor="brand-accent">Colour</Label>

        <div className="flex items-center gap-3">
          <label className="relative size-8.5 shrink-0 cursor-pointer overflow-hidden rounded-md border">
            <span className="absolute inset-0" style={{ backgroundColor: colour }} />
            <input
              aria-label="Choose brand colour"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              onChange={(event) => setColour(event.target.value)}
              type="color"
              value={/^#[a-f0-9]{6}$/i.test(colour) ? colour : branding.accent}
            />
          </label>

          <Input
            className="w-32 font-mono"
            id="brand-accent"
            maxLength={7}
            name="accent"
            onChange={(event) => setColour(event.target.value)}
            pattern="#[a-fA-F0-9]{6}"
            placeholder="#6366f1"
            required
            value={colour}
          />
        </div>
      </div>

      <ErrorMessage message={error} />

      <div className="flex justify-end border-t pt-5">
        <Button className="min-w-24" disabled={busy} type="submit">
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
