import { LoaderCircle } from 'lucide-react'

export function Loading() {
  return (
    <div
      className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin" />
      Loading registry data
    </div>
  )
}
