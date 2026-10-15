'use client'

import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useLogout } from '@/hooks/auth/use-logout'

export function LogoutButton() {
  const { busy, error, logout } = useLogout()

  return (
    <div className="space-y-2">
      <Button
        aria-busy={busy}
        className="w-full justify-start text-white font-normal no-underline hover:no-underline gap-2"
        disabled={busy}
        onClick={logout}
        size="sm"
        type="button"
        variant="link"
      >
        <LogOut aria-hidden="true" />
        {busy ? 'Signing out…' : 'Sign out'}
      </Button>

      {error && (
        <p className="px-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
