import { type ReactNode } from 'react'

type Props = {
  title: string
  description: string
  children?: ReactNode
}

export function Heading({ title, description, children }: Props) {
  return (
    <header className="mb-8 flex flex-wrap justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere text-foreground">
          {title}
        </h1>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      {children && <div className="flex flex-col items-end shrink-0 gap-3">{children}</div>}
    </header>
  )
}
