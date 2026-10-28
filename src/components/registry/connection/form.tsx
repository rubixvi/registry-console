'use client'

import { useId, useState } from 'react'

import { ErrorMessage } from '@/components/shared/error-message'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useRegistryForm } from '@/hooks/registry/use-form'
import { type Registry, type RegistryProvider } from '@/types/registry'

type Props = {
  registry?: Registry
}

export function RegistryForm({ registry }: Props) {
  const { open, toggle, busy, error, submit } = useRegistryForm(registry?.id)
  const id = useId()
  const [provider, setProvider] = useState(registry?.provider ?? 'distribution')
  const isEditing = Boolean(registry)
  const hosted = provider !== 'distribution'

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!busy && nextOpen !== open) toggle()
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={busy} type="button" variant={isEditing ? 'outline' : 'default'}>
          {isEditing ? 'Edit' : 'Connect'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Registry</DialogTitle>

          <DialogDescription className="text-xs">
            Configure your registry connection and authentication details.
          </DialogDescription>
        </DialogHeader>

        <form aria-busy={busy} className="space-y-5" onSubmit={submit}>
          <div className="grid gap-2">
            <Select
              name="provider"
              onValueChange={(value) => setProvider(value as RegistryProvider)}
              value={provider}
            >
              <SelectTrigger className="w-full" id={`${id}-provider`}>
                <SelectValue />
              </SelectTrigger>

              <SelectContent position="popper">
                <SelectItem value="distribution">Container</SelectItem>
                <SelectItem value="dockerhub">Docker Hub</SelectItem>
                <SelectItem value="github">GitHub Container</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              defaultValue={registry?.name}
              id={`${id}-name`}
              maxLength={64}
              name="name"
              required
            />
          </div>

          <div className="grid gap-2 hidden">
            <Label htmlFor={`${id}-url`}>Registry</Label>
            <Input
              aria-describedby={`${id}-url-help`}
              defaultValue={
                provider === 'dockerhub'
                  ? 'https://registry-1.docker.io'
                  : provider === 'github'
                    ? 'https://ghcr.io'
                    : registry?.url
              }
              id={`${id}-url`}
              key={provider}
              name="url"
              placeholder="https://registry.example.com"
              readOnly={hosted}
              required
              type="url"
            />
          </div>

          {hosted && (
            <div className="grid gap-2">
              <Label htmlFor={`${id}-namespace`}>Namespace</Label>
              <Input
                defaultValue={registry?.namespace}
                id={`${id}-namespace`}
                maxLength={64}
                name="namespace"
                required
              />
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`${id}-username`}>Username</Label>
              <Input
                autoComplete="off"
                defaultValue={registry?.username}
                id={`${id}-username`}
                maxLength={128}
                name="username"
                required={provider === 'github'}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`${id}-password`}>{hosted ? 'Access token' : 'Password'}</Label>
              <Input
                aria-describedby={isEditing ? `${id}-password-help` : undefined}
                autoComplete="new-password"
                id={`${id}-password`}
                maxLength={4096}
                name="password"
                required={provider === 'github'}
                type="password"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${id}-pull-url`}>Pull URL</Label>
            <Input
              aria-describedby={`${id}-pull-url-help`}
              defaultValue={registry?.pullUrl}
              id={`${id}-pull-url`}
              maxLength={2048}
              name="pullUrl"
              type="url"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              className="size-4 accent-primary"
              defaultChecked={registry?.readOnly}
              name="readOnly"
              type="checkbox"
            />
            Read
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
