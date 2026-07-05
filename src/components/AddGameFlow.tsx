'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import type { IgdbGame } from '@/lib/igdb'
import { GameSearch } from '@/components/GameSearch'
import { EntryForm, toPersonalPayload, type EntryFormValues } from '@/components/EntryForm'
import { STATUS_OPTIONS } from '@/lib/status'

type Feedback = { kind: 'created' | 'merged'; title: string } | null

export function AddGameFlow() {
  const router = useRouter()
  const [selected, setSelected] = useState<IgdbGame | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualYear, setManualYear] = useState('')
  const [serieMode, setSerieMode] = useState(false)
  const [defaults, setDefaults] = useState({ platformsPlayed: '', status: 'FINISHED' })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [error, setError] = useState<string | null>(null)
  // Résumé traduit en français, associé à son igdbId pour ignorer les
  // réponses tardives quand l'utilisateur change de jeu.
  const [frSummary, setFrSummary] = useState<{ igdbId: number; text: string } | null>(null)

  function selectGame(g: IgdbGame) {
    setSelected(g)
    setFeedback(null)
    setError(null)
    if (g.summary) {
      fetch(`/api/igdb/summary-fr?igdbId=${g.igdbId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.summary) setFrSummary({ igdbId: g.igdbId, text: data.summary })
        })
        .catch(() => {}) // en cas d'échec, le résumé anglais reste affiché
    }
  }

  async function submit(values: EntryFormValues) {
    setBusy(true)
    setError(null)
    const body = selected
      ? { igdbId: selected.igdbId, personal: toPersonalPayload(values) }
      : {
          manual: {
            title: manualTitle.trim(),
            releaseYear: manualYear === '' ? null : Number(manualYear),
          },
          personal: toPersonalPayload(values),
        }
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur inconnue')
      const title = selected?.title ?? manualTitle
      setFeedback({ kind: data.created ? 'created' : 'merged', title })
      setSelected(null)
      setManualMode(false)
      setManualTitle('')
      setManualYear('')
      if (data.created && !serieMode) router.push(`/jeux/${data.entryId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  const formInitial: Partial<EntryFormValues> = serieMode
    ? { platformsPlayed: defaults.platformsPlayed, status: defaults.status }
    : {}

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={serieMode} onChange={(e) => setSerieMode(e.target.checked)} />
        Mode série (enchaîner les ajouts avec des valeurs par défaut)
      </label>
      {serieMode && (
        <div className="flex gap-3 rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <label className="flex flex-col gap-1">
            Plateforme par défaut
            <input
              value={defaults.platformsPlayed}
              onChange={(e) => setDefaults((d) => ({ ...d, platformsPlayed: e.target.value }))}
              placeholder="PS2"
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1">
            Statut par défaut
            <select
              value={defaults.status}
              onChange={(e) => setDefaults((d) => ({ ...d, status: e.target.value }))}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            >
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {feedback && (
        <p className="rounded bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          {feedback.kind === 'created'
            ? `« ${feedback.title} » ajouté à la bibliothèque.`
            : `« ${feedback.title} » était déjà présent : plateformes fusionnées.`}
        </p>
      )}
      {error && <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* La recherche reste montée (masquée en CSS) pour conserver la requête
          et les résultats quand on sélectionne un jeu puis revient en arrière. */}
      <div className={selected || manualMode ? 'hidden' : 'space-y-4'}>
        <GameSearch onSelect={selectGame} />
        <button type="button" onClick={() => { setManualMode(true); setError(null) }} className="text-sm text-zinc-400 hover:text-white">
          Jeu introuvable ? Créer une fiche manuelle
        </button>
      </div>

      {selected && (
        <div className="space-y-4 rounded border border-zinc-800 p-4">
          <button
            type="button"
            onClick={() => { setSelected(null); setError(null) }}
            className="rounded bg-zinc-800 px-3 py-1.5 text-sm font-medium hover:bg-zinc-700"
          >
            ← Retour à la recherche
          </button>
          <div className="flex gap-4">
            {selected.coverUrl ? (
              <Image
                src={selected.coverUrl}
                alt={selected.title}
                width={120}
                height={170}
                className="h-fit shrink-0 rounded"
              />
            ) : (
              <div className="flex h-[170px] w-[120px] shrink-0 items-center justify-center rounded bg-zinc-800 p-2 text-center text-xs">
                {selected.title}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <h2 className="font-semibold">
                {selected.title}
                {selected.releaseYear && <span className="ml-2 font-normal text-zinc-500">{selected.releaseYear}</span>}
                {selected.gameType && (
                  <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-normal text-zinc-300">
                    {selected.gameType}
                  </span>
                )}
              </h2>
              <p className="text-sm text-zinc-400">
                {selected.genres.join(', ')}
                {selected.igdbRating != null && ` · Note IGDB : ${Math.round(selected.igdbRating)}/100`}
              </p>
              {selected.platforms.length > 0 && (
                <p className="text-sm text-zinc-500">Disponible sur : {selected.platforms.join(', ')}</p>
              )}
              {selected.summary && (
                <p className="line-clamp-4 text-sm text-zinc-300">
                  {frSummary?.igdbId === selected.igdbId ? frSummary.text : selected.summary}
                  {frSummary?.igdbId !== selected.igdbId && (
                    <span className="ml-2 text-xs text-zinc-500">(traduction en cours…)</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <hr className="border-zinc-800" />
          <EntryForm initial={formInitial} submitLabel="Ajouter à ma bibliothèque" onSubmit={submit} busy={busy} />
        </div>
      )}

      {manualMode && (
        <div className="space-y-3 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Fiche manuelle</h2>
            <button type="button" onClick={() => { setManualMode(false); setError(null) }} className="text-sm text-zinc-400 hover:text-white">
              Retour à la recherche
            </button>
          </div>
          <div className="flex gap-3 text-sm">
            <label className="flex flex-1 flex-col gap-1">
              Titre *
              <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
            </label>
            <label className="flex flex-col gap-1">
              Année de sortie
              <input type="number" value={manualYear} onChange={(e) => setManualYear(e.target.value)} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
            </label>
          </div>
          <EntryForm initial={formInitial} submitLabel="Créer et ajouter" onSubmit={submit} busy={busy} />
        </div>
      )}
    </div>
  )
}
