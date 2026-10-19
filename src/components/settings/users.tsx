import { Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type users } from '@/lib/config/users'

type Props = {
  users: ReturnType<typeof users>
}

export function SettingsUsers({ users }: Props) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <Users aria-hidden="true" className="size-4 text-primary" />
        Users
      </h2>

      <ul className="divide-y">
        {users.map((user) => (
          <li
            className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
            key={user.username}
          >
            <span className="min-w-0 truncate">{user.username}</span>
            <Badge className="min-w-16 shrink-0 justify-center capitalize">{user.role}</Badge>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        Manage usernames, password hashes, and roles using environment variables. Restart the
        application to apply changes.
      </p>
    </section>
  )
}
