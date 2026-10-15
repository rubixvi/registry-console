'use client'

import { Button } from '@/components/ui/button'

type Props = {
  reset: () => void
}

export default function ErrorPage({ reset }: Props) {
  return (
    <div className="rounded-xl border bg-card p-8" role="alert">
      <h2 className="text-lg font-semibold">Unable to load this page</h2>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Something went wrong. Please try again.
      </p>

      <Button className="mt-6" onClick={reset} type="button">
        Try again
      </Button>
    </div>
  )
}
