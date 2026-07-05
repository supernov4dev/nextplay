import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'NextPlay',
  description: 'Ma bibliothèque de jeux de toute une vie',
}

const NAV = [
  { href: '/', label: 'Accueil' },
  { href: '/jeux', label: 'Tous les jeux' },
  { href: '/ajouter', label: 'Ajouter' },
  { href: '/decouvrir', label: 'Découvrir' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-emerald-400">
              NextPlay
            </Link>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-zinc-300 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
