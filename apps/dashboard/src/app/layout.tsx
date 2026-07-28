import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from './lib/auth-context'

export const metadata: Metadata = {
  title: 'PRISM — Guardian Dashboard',
  description: 'Privacy-first consensual behavioural monitoring for teen well-being.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
