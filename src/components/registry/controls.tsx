'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
  page: number
  pageSize?: number
  hasPrevious: boolean
  hasNext: boolean
  previous: () => void
  next: () => void
}

export function Controls({ page, hasPrevious, hasNext, previous, next, pageSize = 100 }: Props) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-4 border-t px-5 py-4"
    >
      <span aria-atomic="true" aria-live="polite" className="text-xs text-muted-foreground">
        Page {page} - {pageSize} items per page
      </span>

      <div className="flex gap-2">
        <Button
          disabled={!hasPrevious}
          onClick={previous}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowLeft aria-hidden="true" />
          Previous
        </Button>

        <Button disabled={!hasNext} onClick={next} size="sm" type="button" variant="outline">
          Next
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  )
}
