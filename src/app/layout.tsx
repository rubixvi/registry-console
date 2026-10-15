import { type CSSProperties, type ReactNode } from 'react'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'

import { Providers } from '@/components/providers'
import { getSettings } from '@/lib/settings'
import { accent } from '@/utils/accent'

import '../styles/globals.css'

type Props = {
  children: ReactNode
}

type BrandingStyles = CSSProperties & {
  '--primary': string
  '--primary-foreground': string
  '--brand-background': string
}

export const dynamic = 'force-dynamic'

export { brandMetadata as generateMetadata } from '@/lib/settings/metadata'

const inter = Inter({
  adjustFontFallback: true,
  display: 'swap',
  preload: true,
  subsets: ['latin'],
  variable: '--font-inter',
})

export default async function RootLayout({ children }: Props) {
  const branding = getSettings()
  const nonce = (await headers()).get('x-nonce')

  const styles: BrandingStyles = {
    '--primary': branding.accent,
    '--primary-foreground': accent(branding.accent),
    '--brand-background': `color-mix(in srgb, ${branding.accent} 25%, black)`,
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} bg-background font-sans text-foreground antialiased`}
        style={styles}
      >
        <Providers nonce={nonce ?? ''}>{children}</Providers>
      </body>
    </html>
  )
}
