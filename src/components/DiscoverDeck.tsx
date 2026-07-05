'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { IgdbGame } from '@/lib/igdb'
import { PLATFORMS } from '@/lib/platforms'

const DECADES = [1980, 1990, 2000, 2010, 2020]

type DeckState = {
  platform: string
  cards: IgdbGame[]
  nextOffset: number | null
}

export function DiscoverDeck() {
  const [platform, setPlatform] = useState('PlayStation')
  const [decade, setDecade] = useState('')
  const [deck, setDeck] = useState<DeckState | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const [excluded, setExcluded] = useState(0)
  const fetching = useRef(false)

  async function fetchBatch(p: string, d: string, offset: number): Promise<{ results: IgdbGame[]; nextOffset: number | null }> {
    const params = new URLSearchParams({ platform: p, offset: String(offset) })
    if (d) params.set('decade', d)
    const res = await fetch(`/api/discover?${params}`)
    if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur inconnue')
    return res.json()
  }

  async function launch() {
    setLoading(true)
    setError(null)
    setAdded(0)
    setExcluded(0)
    try {
      const batch = await fetchBatch(platform, decade, 0)
      setDeck({ platform, cards: batch.results, nextOffset: batch.nextOffset })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  // Recharge en tâche de fond quand le deck s'épuise
  useEffect(() => {
    if (!deck || deck.cards.length >= 5 || deck.nextOffset === null || fetching.current) return
    fetching.current = true
    fetchBatch(deck.platform, decade, deck.nextOffset)
      .then((batch) =>
        setDeck((d) =>
          d
            ? {
                ...d,
                cards: [
                  ...d.cards,
                  ...batch.results.filter((g) => !d.cards.some((c) => c.igdbId === g.igdbId)),
                ],
                nextOffset: batch.nextOffset,
              }
            : d,
        ),
      )
      .catch(() => {})
      .finally(() => {
        fetching.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck])

  const advance = useCallback(() => {
    setDeck((d) => (d ? { ...d, cards: d.cards.slice(1) } : d))
  }, [])

  const current = deck?.cards[0]

  const played = useCallback(async () => {
    if (!current || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          igdbId: current.igdbId,
          personal: { status: 'TO_SORT', platformsPlayed: [deck!.platform] },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Erreur inconnue')
      setAdded((n) => n + 1)
      advance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }, [current, busy, deck, advance])

  const notPlayed = useCallback(async () => {
    if (!current || busy) return
    setBusy(true)
    setError(null)
    try {
      await fetch('/api/discover/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igdbId: current.igdbId }),
      })
      setExcluded((n) => n + 1)
      advance()
    } catch {
      // l'exclusion échouée n'est pas bloquante : on avance quand même
      advance()
    } finally {
      setBusy(false)
    }
  }, [current, busy, advance])

  const pass = useCallback(() => {
    if (!current || busy) return
    advance() // non persisté : le jeu reviendra dans un prochain deck
  }, [current, busy, advance])

  // Convention type Tinder : ← = non (pas joué), → = oui (joué), ↓ = plus tard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return
      if (e.key === 'ArrowRight') played()
      else if (e.key === 'ArrowLeft') notPlayed()
      else if (e.key === 'ArrowDown') pass()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, played, pass, notPlayed])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Plateforme
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
            {PLATFORMS.filter((p) => p !== 'Autre').map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Décennie (optionnel)
          <select value={decade} onChange={(e) => setDecade(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
            <option value="">Toutes</option>
            {DECADES.map((d) => (
              <option key={d} value={d}>{d}s</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={launch}
          disabled={loading}
          className="rounded bg-emerald-700 px-4 py-1.5 font-medium hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? 'Chargement…' : deck ? 'Relancer' : 'Lancer'}
        </button>
        {deck && (
          <span className="pb-1.5 text-xs text-zinc-500">
            {added} ajouté(s) · {excluded} écarté(s)
          </span>
        )}
      </div>

      {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {deck && !current && !loading && (
        <p className="py-12 text-center text-zinc-400">
          Deck épuisé pour {deck.platform}{decade && ` (${decade}s)`} — change de
          plateforme ou de décennie, ou relance pour revoir les jeux passés.
        </p>
      )}

      {current && (
        <div className="mx-auto max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex justify-center">
            {current.coverUrl ? (
              <Image
                src={current.coverUrl}
                alt={current.title}
                width={264}
                height={374}
                className="rounded-lg"
                priority
              />
            ) : (
              <div className="flex h-[374px] w-[264px] items-center justify-center rounded-lg bg-zinc-800 p-4 text-center">
                {current.title}
              </div>
            )}
          </div>
          <div className="space-y-1 text-center">
            <h2 className="text-lg font-semibold">
              {current.title}
              {current.releaseYear && <span className="ml-2 font-normal text-zinc-500">{current.releaseYear}</span>}
            </h2>
            <p className="text-sm text-zinc-400">{current.genres.join(', ')}</p>
            {current.summary && (
              <p className="line-clamp-3 text-sm text-zinc-300">{current.summary}</p>
            )}
            <p className="flex justify-center gap-4 pt-1 text-xs">
              <a
                href={`https://www.google.com/search?udm=2&q=${encodeURIComponent(`${current.title} ${deck!.platform} screenshots`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                🔍 Images du jeu
              </a>
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${current.title} ${deck!.platform} gameplay`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                ▶ Gameplay YouTube
              </a>
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={notPlayed}
              disabled={busy}
              className="flex flex-col items-center rounded-lg bg-red-950 px-4 py-2 text-red-300 hover:bg-red-900 disabled:opacity-50"
            >
              <span className="text-sm font-medium">✗ Je n&apos;y ai pas joué</span>
              <span className="text-[10px] opacity-70">touche ← · ne reviendra plus</span>
            </button>
            <button
              type="button"
              onClick={pass}
              disabled={busy}
              className="flex flex-col items-center rounded-lg bg-amber-950 px-4 py-2 text-amber-300 hover:bg-amber-900 disabled:opacity-50"
            >
              <span className="text-sm font-medium">🤔 Je ne sais plus</span>
              <span className="text-[10px] opacity-70">touche ↓ · reviendra plus tard</span>
            </button>
            <button
              type="button"
              onClick={played}
              disabled={busy}
              className="flex flex-col items-center rounded-lg bg-emerald-700 px-4 py-2 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <span className="text-sm font-medium">✓ J&apos;y ai joué</span>
              <span className="text-[10px] opacity-80">touche → · ajout « à trier »</span>
            </button>
          </div>
        </div>
      )}

      {!deck && !loading && (
        <p className="py-12 text-center text-zinc-400">
          Choisis une plateforme et lance le deck : les jeux défilent du plus
          connu au plus obscur. « J&apos;y ai joué » les ajoute en « À trier »,
          à qualifier plus tard.
        </p>
      )}
    </div>
  )
}
