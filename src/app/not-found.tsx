import Link from 'next/link'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Page not found</h1>

      <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
        The page, registry, or image you requested could not be found.
      </p>

      <Button asChild className="mt-6">
        <Link href="/">Return to registries</Link>
      </Button>
    </main>
  )
}
