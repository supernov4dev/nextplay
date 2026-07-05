'use client'

import { useState } from 'react'
import { STATUS_OPTIONS } from '@/lib/status'

export type EntryFormValues = {
  status: string
  rating: string
  review: string
  platformsPlayed: string
  playPeriod: string
  estimatedHours: string
}

const EMPTY: EntryFormValues = {
  status: 'FINISHED', rating: '', review: '',
  platformsPlayed: '', playPeriod: '', estimatedHours: '',
}

// Convertit les valeurs brutes du formulaire vers le payload API `personal`.
export function toPersonalPayload(v: EntryFormValues) {
  return {
    status: v.status,
    rating: v.rating === '' ? null : Number(v.rating),
    review: v.review || null,
    platformsPlayed: v.platformsPlayed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    playPeriod: v.playPeriod || null,
    estimatedHours: v.estimatedHours === '' ? null : Number(v.estimatedHours),
  }
}

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  busy,
}: {
  initial?: Partial<EntryFormValues>
  submitLabel: string
  onSubmit: (values: EntryFormValues) => void
  busy?: boolean
}) {
  const [values, setValues] = useState<EntryFormValues>({ ...EMPTY, ...initial })
  const set = (field: keyof EntryFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }))

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          Statut
          <select value={values.status} onChange={set('status')} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Note (/10)
          <input type="number" min={0} max={10} value={values.rating} onChange={set('rating')} className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Plateformes jouées
          <input value={values.platformsPlayed} onChange={set('platformsPlayed')} placeholder="PC, PS2" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Période
          <input value={values.playPeriod} onChange={set('playPeriod')} placeholder="2003, vers 2010…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Heures estimées
          <input type="number" min={0} value={values.estimatedHours} onChange={set('estimatedHours')} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Avis
        <textarea value={values.review} onChange={set('review')} rows={3} placeholder="Mon avis personnel…" className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
      </label>
      <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-4 py-1.5 font-medium hover:bg-emerald-600 disabled:opacity-50">
        {busy ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  )
}
