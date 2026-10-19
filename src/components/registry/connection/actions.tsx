'use client'

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
import { useConnection } from '@/hooks/registry/use-connection'
import { type Registry } from '@/types/registry'
import { RegistryForm } from './form'

type Props = {
  registry: Registry
  admin: boolean
}

export function Actions({ registry, admin }: Props) {
  const { busy, error, test, remove } = useConnection(registry.id)

  return (
    <section className="mb-7 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <Button disabled={busy} onClick={test} type="button" variant="outline">
          Test
        </Button>

        {admin && (
          <>
            <RegistryForm registry={registry} />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={busy} type="button" variant="destructive">
                  Remove
                </Button>
              </AlertDialogTrigger>

              <AlertDialogContent aria-busy={busy}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes {registry.name} from this workspace. Images in the registry are
                    retained.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    disabled={busy}
                    onClick={remove}
                  >
                    {busy ? 'Removing…' : 'Remove'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>

      <ErrorMessage message={error} />
    </section>
  )
}
