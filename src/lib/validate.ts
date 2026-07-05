import { EntryStatus } from '@prisma/client'
import type { PersonalInput } from '@/lib/library'

type Result =
  | { ok: true; value: PersonalInput }
  | { ok: false; error: string }

export function validatePersonal(input: unknown): Result {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'Données personnelles requises.' }
  const p = input as Record<string, unknown>
  if (typeof p.status !== 'string' || !(p.status in EntryStatus))
    return { ok: false, error: 'Statut invalide.' }
  if (
    p.rating != null &&
    (typeof p.rating !== 'number' || !Number.isInteger(p.rating) || p.rating < 0 || p.rating > 10)
  )
    return { ok: false, error: 'La note doit être un entier entre 0 et 10.' }
  return {
    ok: true,
    value: {
      status: p.status as EntryStatus,
      rating: (p.rating as number | null) ?? null,
      review: typeof p.review === 'string' && p.review !== '' ? p.review : null,
      platformsPlayed: Array.isArray(p.platformsPlayed)
        ? p.platformsPlayed.filter((x): x is string => typeof x === 'string')
        : [],
      playPeriod: typeof p.playPeriod === 'string' && p.playPeriod !== '' ? p.playPeriod : null,
      estimatedHours:
        typeof p.estimatedHours === 'number' ? Math.round(p.estimatedHours) : null,
    },
  }
}
