import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Sidebar } from '@/components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cluster',
  description: 'AI agents for your business',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-surface text-white h-screen overflow-hidden antialiased">
        <div className="flex h-full">
          <Sidebar />
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}
