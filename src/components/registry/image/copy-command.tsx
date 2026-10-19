'use client'

import { Check, Copy, Terminal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCopy } from '@/hooks/registry/use-copy'

type Props = {
  command: string
}

export function CopyCommand({ command }: Props) {
  const { copied, copy } = useCopy(command)

  return (
    <section className="rounded-xl border bg-(--brand-background) p-5 text-white hidden sm:block">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-slate-400 uppercase">
        <Terminal aria-hidden="true" className="size-4" />
        Pull command
      </div>

      <div className="flex items-start gap-3">
        <code className="min-w-0 flex-1 break-all text-sm leading-6">{command}</code>

        <Button
          aria-label={copied ? 'Copy pull command again' : 'Copy pull command'}
          className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={copy}
          size="icon"
          type="button"
          variant="ghost"
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        </Button>
      </div>
    </section>
  )
}
