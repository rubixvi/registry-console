import { type ReactNode } from 'react'

type Props = {
  eyebrow?: string
  title: string
  description: string
  children?: ReactNode
}

export function PageHeading({ eyebrow, title, description, children }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-3 text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
            {eyebrow}
          </p>
        )}

        <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere text-foreground">
          {title}
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      {children && <div className="flex shrink-0 items-center gap-3">{children}</div>}
    </header>
  )
}
