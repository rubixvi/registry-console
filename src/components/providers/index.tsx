'use client'

import { type ReactNode } from 'react'

import { ThemeProvider } from '@/components/providers/theme'
import { Toaster } from '@/components/ui/sonner'

type Props = {
  children: ReactNode
  nonce: string
}

export function Providers({ children, nonce }: Props) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange nonce={nonce}>
      {children}
      <Toaster richColors />
    </ThemeProvider>
  )
}
