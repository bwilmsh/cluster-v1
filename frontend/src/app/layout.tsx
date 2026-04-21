import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ThemeProvider } from '@/lib/themeContext'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cluster',
  description: 'AI agents for your business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark-mode`}>
      <body
        className="h-screen overflow-hidden antialiased"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-geist-sans)',
        }}
      >
        <ThemeProvider>
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {children}
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
