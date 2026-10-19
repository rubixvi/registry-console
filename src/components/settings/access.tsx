import { ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export function Access() {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
        Access
      </h2>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-4">
        <dt>
          <Badge className="min-w-16 justify-center">Admin</Badge>
        </dt>
        <dd className="text-xs leading-6 text-muted-foreground">
          Manage connections, branding, and image deletion.
        </dd>

        <dt>
          <Badge className="min-w-16 justify-center">Member</Badge>
        </dt>
        <dd className="text-xs leading-6 text-muted-foreground">
          Restricted public and private repositories access.
        </dd>

        <dt>
          <Badge className="min-w-16 justify-center">Viewer</Badge>
        </dt>
        <dd className="text-xs leading-6 text-muted-foreground">Public repository access.</dd>
      </dl>

      <p className="mt-5 border-t pt-4 text-xs leading-6 text-muted-foreground">
        Mark a connection as read only to disable deletion.
      </p>
    </section>
  )
}
