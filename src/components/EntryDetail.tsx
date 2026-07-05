'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EntryForm, toPersonalPayload, type EntryFormValues } from '@/components/EntryForm'

export function EntryDetail({
  entryId,
  initial,
}: {
  entryId: string
  initial: EntryFormValues
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(values: EntryFormValues) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/library/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personal: toPersonalPayload(values) }),
    })
    setBusy(false)
    if (!res.ok) {
      setError((await res.json()).error ?? 'Erreur lors de l’enregistrement.')
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function remove() {
    if (!confirm('Supprimer ce jeu de la bibliothèque ?')) return
    const res = await fetch(`/api/library/${entryId}`, { method: 'DELETE' })
    if (res.ok) router.push('/jeux')
  }

  if (!editing) {
    return (
      <div className="flex gap-3">
        <button onClick={() => setEditing(true)} className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">
          Modifier
        </button>
        <button onClick={remove} className="rounded bg-red-950 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900">
          Supprimer
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <EntryForm initial={initial} submitLabel="Enregistrer" onSubmit={save} busy={busy} />
      <button onClick={() => setEditing(false)} className="text-sm text-zinc-400 hover:text-white">
        Annuler
      </button>
    </div>
  )
}
