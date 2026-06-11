import { Analytics } from '@vercel/analytics/next'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DSO Exposure Tracker',
  description:
    'Suivi collaboratif des temps de pose en astrophotographie du ciel profond',
  generator: 'v0.app',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className="dark">
      <body className="bg-background font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
