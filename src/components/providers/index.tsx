'use client'

import { type ReactNode } from 'react'
import { Toaster } from 'sonner'

import { ThemeProvider } from '@/components/providers/theme'

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
