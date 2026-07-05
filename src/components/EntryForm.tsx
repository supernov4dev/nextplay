'use client'

import { useState } from 'react'
import { STATUS_OPTIONS } from '@/lib/status'
import { PLATFORMS } from '@/lib/platforms'

export type PeriodFormValue = { startYear: string; endYear: string }

export type EntryFormValues = {
  status: string
  rating: string // sur 20
  mastered: boolean
  review: string
  platformsPlayed: string[]
  periods: PeriodFormValue[]
  estimatedHours: string
}

const EMPTY: EntryFormValues = {
  status: 'FINISHED',
  rating: '',
  mastered: false,
  review: '',
  platformsPlayed: [],
  periods: [],
  estimatedHours: '',
}

// Convertit les valeurs brutes du formulaire vers le payload API `personal`.
export function toPersonalPayload(v: EntryFormValues) {
  return {
    status: v.status,
    rating: v.rating === '' ? null : Number(v.rating),
    mastered: v.mastered,
    review: v.review || null,
    platformsPlayed: v.platformsPlayed,
    periods: v.periods
      .filter((p) => p.startYear.trim() !== '')
      .map((p) => ({
        startYear: Number(p.startYear),
        endYear: p.endYear.trim() === '' ? null : Number(p.endYear),
      })),
    estimatedHours: v.estimatedHours === '' ? null : Number(v.estimatedHours),
  }
}

export function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  busy,
  suggestedPlatforms = [],
}: {
  initial?: Partial<EntryFormValues>
  submitLabel: string
  onSubmit: (values: EntryFormValues) => void
  busy?: boolean
  // Plateformes du jeu selon IGDB : affichées en premier dans les puces
  suggestedPlatforms?: string[]
}) {
  const [values, setValues] = useState<EntryFormValues>({ ...EMPTY, ...initial })
  const set = (field: keyof EntryFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setValues((v) => ({ ...v, [field]: e.target.value }))

  function togglePlatform(platform: string) {
    setValues((v) => ({
      ...v,
      platformsPlayed: v.platformsPlayed.includes(platform)
        ? v.platformsPlayed.filter((p) => p !== platform)
        : [...v.platformsPlayed, platform],
    }))
  }

  function setPeriod(index: number, field: keyof PeriodFormValue, value: string) {
    setValues((v) => ({
      ...v,
      periods: v.periods.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }))
  }

  const orderedPlatforms = [
    ...suggestedPlatforms.filter((p) => (PLATFORMS as readonly string[]).includes(p)),
    ...PLATFORMS.filter((p) => !suggestedPlatforms.includes(p)),
  ]

  return (
    <form
      className="space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Statut
          <select value={values.status} onChange={set('status')} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">
            {STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Note (/20)
          <input type="number" min={0} max={20} value={values.rating} onChange={set('rating')} className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input
            type="checkbox"
            checked={values.mastered}
            onChange={(e) => setValues((v) => ({ ...v, mastered: e.target.checked }))}
          />
          🏆 Platiné / 100 %
        </label>
        <label className="flex flex-col gap-1">
          Heures estimées
          <input type="number" min={0} value={values.estimatedHours} onChange={set('estimatedHours')} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1" />
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="mb-1">Plateformes jouées</legend>
        <div className="flex flex-wrap gap-1.5">
          {orderedPlatforms.map((platform) => {
            const selected = values.platformsPlayed.includes(platform)
            const suggested = suggestedPlatforms.includes(platform)
            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  selected
                    ? 'border-emerald-500 bg-emerald-700 text-white'
                    : suggested
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-200'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {platform}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1">Périodes de jeu</legend>
        {values.periods.map((period, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="number"
              min={1950}
              max={2100}
              placeholder="Année"
              value={period.startYear}
              onChange={(e) => setPeriod(index, 'startYear', e.target.value)}
              className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            />
            <span className="text-zinc-500">→</span>
            <input
              type="number"
              min={1950}
              max={2100}
              placeholder="Fin (opt.)"
              value={period.endYear}
              onChange={(e) => setPeriod(index, 'endYear', e.target.value)}
              className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
            />
            <button
              type="button"
              onClick={() =>
                setValues((v) => ({ ...v, periods: v.periods.filter((_, i) => i !== index) }))
              }
              className="text-zinc-500 hover:text-red-400"
              aria-label="Supprimer la période"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setValues((v) => ({ ...v, periods: [...v.periods, { startYear: '', endYear: '' }] }))
          }
          className="text-xs text-emerald-400 hover:underline"
        >
          + Ajouter une période
        </button>
      </fieldset>

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
