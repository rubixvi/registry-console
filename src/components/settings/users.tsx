import { UsersIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { type users } from '@/lib/config/users'

type Props = {
  users: ReturnType<typeof users>
}

export function Users({ users }: Props) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <UsersIcon aria-hidden="true" className="size-4 text-primary" />
        Users
      </h2>

      <ul className="divide-y">
        {users.map((user) => (
          <li
            className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
            key={user.username}
          >
            <span className="min-w-0 truncate">
              {user.username}
              {user.authProvider === 'ldap' && (
                <span className="ml-2 text-xs text-muted-foreground">LDAP</span>
              )}
            </span>
            <Badge className="min-w-16 shrink-0 justify-center capitalize">{user.role}</Badge>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        Local and SSO accounts use the configured account list. LDAP accounts are created at sign-in
        and receive roles from directory groups.
      </p>
    </section>
  )
}
