'use client'

import { useId } from 'react'
import { Trash2 } from 'lucide-react'

import { ErrorMessage } from '@/components/shared/error-message'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDelete } from '@/hooks/registry/use-delete'
import { type RegistryProvider } from '@/types/registry'

type Props = {
  id: string
  repository: string
  digest: string
  provider?: RegistryProvider
}

export function DeleteDialog({ id, repository, digest, provider }: Props) {
  const { confirmation, changeConfirmation, error, busy, remove } = useDelete(
    id,
    repository,
    digest
  )

  const confirmationId = useId()
  const canDelete = !busy && confirmation === repository

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent aria-busy={busy}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete</AlertDialogTitle>

          <AlertDialogDescription>
            {provider === 'dockerhub'
              ? 'Docker Hub allows manifest deletion once its tags and other image references have been removed.'
              : 'This permanently deletes the manifest by digest. All tags pointing to it in this repository will stop working.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <code className="break-all rounded-md bg-muted p-3 text-xs">{digest}</code>

        <div className="grid gap-2">
          <Label htmlFor={confirmationId}>Type {repository} to confirm</Label>

          <Input
            autoCapitalize="none"
            autoComplete="off"
            disabled={busy}
            id={confirmationId}
            onChange={changeConfirmation}
            spellCheck={false}
            value={confirmation}
          />
        </div>

        <ErrorMessage message={error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>

          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={!canDelete}
            onClick={remove}
          >
            {busy ? 'Deleting…' : 'Delete manifest'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
