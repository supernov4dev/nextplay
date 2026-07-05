'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IgdbGame } from '@/lib/igdb'
import { GameSearch } from '@/components/GameSearch'
import { EntryForm, toPersonalPayload, type EntryFormValues } from '@/components/EntryForm'

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
      setManualTitle('')
      setManualYear('')
      if (!serieMode) router.push(`/jeux/${data.entryId}`)
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
              <option value="FINISHED">Terminé</option>
              <option value="DROPPED">Abandonné</option>
              <option value="PAUSED">En pause</option>
              <option value="TO_SORT">À trier</option>
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

      {!selected && !manualMode && (
        <>
          <GameSearch onSelect={(g) => { setSelected(g); setFeedback(null) }} />
          <button type="button" onClick={() => setManualMode(true)} className="text-sm text-zinc-400 hover:text-white">
            Jeu introuvable ? Créer une fiche manuelle
          </button>
        </>
      )}

      {selected && (
        <div className="space-y-3 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {selected.title}
              {selected.releaseYear && <span className="ml-2 text-zinc-500">{selected.releaseYear}</span>}
            </h2>
            <button type="button" onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-white">
              Changer de jeu
            </button>
          </div>
          <EntryForm initial={formInitial} submitLabel="Ajouter à ma bibliothèque" onSubmit={submit} busy={busy} />
        </div>
      )}

      {manualMode && (
        <div className="space-y-3 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Fiche manuelle</h2>
            <button type="button" onClick={() => setManualMode(false)} className="text-sm text-zinc-400 hover:text-white">
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
