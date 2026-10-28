import Image from 'next/image'
import { Boxes } from 'lucide-react'

import { type Branding } from '@/types/branding'

type Props = {
  branding: Branding
}

export function Brand({ branding }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {branding.logoPath ? (
        <Image
          alt=""
          className="size-10 shrink-0 rounded-lg object-contain"
          height={40}
          src={branding.logoPath}
          unoptimized
          width={40}
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Boxes aria-hidden="true" className="size-6" />
        </span>
      )}

      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base leading-tight font-semibold tracking-tight">
          {branding.name}
        </span>

        <span className="truncate text-[9px] leading-none font-semibold tracking-[0.12em] uppercase opacity-50">
          Container Management
        </span>
      </div>
    </div>
  )
}
