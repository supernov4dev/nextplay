'use client'

import { useState } from 'react'
import Image from 'next/image'
import type { IgdbGame } from '@/lib/igdb'

export function GameSearch({ onSelect }: { onSelect: (game: IgdbGame) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IgdbGame[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error()
      setResults((await res.json()).results)
    } catch {
      setError('Recherche IGDB indisponible — vous pouvez créer une fiche manuelle ci-dessous.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un jeu (ex. Zelda)…"
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2"
          autoFocus
        />
        <button type="submit" disabled={loading} className="rounded bg-emerald-700 px-4 py-2 font-medium hover:bg-emerald-600 disabled:opacity-50">
          {loading ? 'Recherche…' : 'Chercher'}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="divide-y divide-zinc-800">
        {results.map((game) => (
          <li key={game.igdbId}>
            <button
              type="button"
              onClick={() => onSelect(game)}
              className="flex w-full items-center gap-3 p-2 text-left hover:bg-zinc-900"
            >
              {game.coverUrl ? (
                <Image src={game.coverUrl} alt="" width={40} height={53} className="rounded" />
              ) : (
                <div className="h-[53px] w-[40px] rounded bg-zinc-800" />
              )}
              <span className="min-w-0">
                <span className="font-medium">{game.title}</span>
                {game.releaseYear && <span className="ml-2 text-zinc-500">{game.releaseYear}</span>}
                {game.gameType && (
                  <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-300">
                    {game.gameType}
                  </span>
                )}
                <span className="block truncate text-xs text-zinc-500">{game.genres.join(', ')}</span>
                {game.platforms.length > 0 && (
                  <span className="block truncate text-xs text-zinc-600">
                    {game.platforms.join(' · ')}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
