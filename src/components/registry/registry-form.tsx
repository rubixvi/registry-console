'use client'

import { useId } from 'react'
import { Pencil, Plus } from 'lucide-react'

import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRegistryForm } from '@/hooks/registry/use-form'
import { type Registry } from '@/types/registry'

type Props = {
  registry?: Registry
}

export function RegistryForm({ registry }: Props) {
  const { open, toggle, busy, error, submit } = useRegistryForm(registry?.id)
  const id = useId()
  const isEditing = Boolean(registry)

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!busy && nextOpen !== open) toggle()
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={busy} type="button" variant={isEditing ? 'outline' : 'default'}>
          {isEditing ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isEditing ? 'Edit' : 'Connect'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form aria-busy={busy} className="space-y-5" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Connection</Label>
            <Input
              defaultValue={registry?.name}
              id={`${id}-name`}
              maxLength={64}
              name="name"
              placeholder="Production registry"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-url`}>Registry</Label>
            <Input
              aria-describedby={`${id}-url-help`}
              defaultValue={registry?.url}
              id={`${id}-url`}
              name="url"
              placeholder="https://registry.example.com"
              required
              type="url"
            />
            <p className="text-xs text-muted-foreground" id={`${id}-url-help`}>
              The registry origin must be allowed in the server configuration.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-pull-url`}>Pull URL</Label>
            <Input
              aria-describedby={`${id}-pull-url-help`}
              defaultValue={registry?.pullUrl}
              id={`${id}-pull-url`}
              maxLength={2048}
              name="pullUrl"
              placeholder="https://registry.example.com"
              type="url"
            />
            <p className="text-xs text-muted-foreground" id={`${id}-pull-url-help`}>
              Public registry address for copied pull commands. Leave empty to use the default.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-username`}>Username</Label>
              <Input
                autoComplete="off"
                defaultValue={registry?.username}
                id={`${id}-username`}
                maxLength={128}
                name="username"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${id}-password`}>Password</Label>
              <Input
                aria-describedby={isEditing ? `${id}-password-help` : undefined}
                autoComplete="new-password"
                id={`${id}-password`}
                maxLength={4096}
                name="password"
                type="password"
              />
            </div>
          </div>

          {isEditing && (
            <p className="text-xs text-muted-foreground" id={`${id}-password-help`}>
              Enter the password again to keep or replace it. Leaving it empty removes the stored
              password.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              defaultChecked={registry?.readOnly}
              name="readOnly"
              type="checkbox"
            />
            Read only connection
          </label>

          <ErrorMessage message={error} />

          <DialogFooter className="border-t pt-5">
            <Button
              className="min-w-24"
              disabled={busy}
              onClick={toggle}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button className="min-w-24" disabled={busy} type="submit">
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
