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
import { type useBulkDelete } from '@/hooks/registry/use-bulk-delete'

type Props = {
  repository: string
  state: ReturnType<typeof useBulkDelete>
}

export function BulkDelete({ repository, state }: Props) {
  const id = useId()

  const canDelete = !state.busy && Boolean(state.plan) && state.confirmation === repository

  return (
    <AlertDialog onOpenChange={state.changeOpen} open={state.open}>
      <AlertDialogTrigger asChild>
        <Button
          disabled={!state.selected.length || state.busy}
          onClick={() => void state.prepare()}
          type="button"
          variant="destructive"
        >
          <Trash2 aria-hidden="true" />
          Delete {state.selected.length > 0 && `(${state.selected.length})`}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent
        aria-busy={state.busy}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{state.result ? 'Deletion results' : 'Delete image'}</AlertDialogTitle>

          <AlertDialogDescription>
            {state.result
              ? `Manifests deleted: ${state.result.deleted}. Failed: ${state.result.failed}.`
              : 'Deleting these manifests will also remove access to any tags that reference them, including unselected tags.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.busy && !state.plan && <p className="text-sm text-muted-foreground">Loading…</p>}

        {state.plan && !state.result && (
          <>
            <ul className="max-h-60 space-y-3 overflow-auto rounded-lg border p-3">
              {state.plan.entries.map((entry) => (
                <li className="space-y-1" key={entry.digest}>
                  <p className="break-all text-sm">{entry.tags.join(', ')}</p>
                  <code className="block break-all text-xs text-muted-foreground">
                    {entry.digest}
                  </code>
                </li>
              ))}
            </ul>

            <div className="grid gap-2">
              <Label htmlFor={id}>Type {repository} to confirm</Label>
              <Input
                autoCapitalize="none"
                autoComplete="off"
                disabled={state.busy}
                id={id}
                onChange={(event) => state.setConfirmation(event.target.value)}
                spellCheck={false}
                value={state.confirmation}
              />
            </div>
          </>
        )}

        {state.result && (
          <ul className="max-h-60 space-y-3 overflow-auto">
            {state.result.results.map((entry) => (
              <li className="rounded-lg border p-3" key={entry.digest}>
                <p className="break-all text-sm font-medium">{entry.tags.join(', ')}</p>
                <p
                  className={
                    entry.success
                      ? 'mt-1 text-xs text-emerald-700'
                      : 'mt-1 text-xs text-destructive'
                  }
                >
                  {entry.success ? 'Deleted' : entry.error}
                </p>
                <code className="mt-1 block break-all text-xs text-muted-foreground">
                  {entry.digest}
                </code>
              </li>
            ))}
          </ul>
        )}

        <ErrorMessage message={state.error} />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={state.busy}>
            {state.result ? 'Close' : 'Cancel'}
          </AlertDialogCancel>

          {!state.result && (
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={!canDelete}
              onClick={state.remove}
            >
              {state.busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
