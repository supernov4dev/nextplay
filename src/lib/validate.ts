import type { PersonalInput } from '@/lib/library'
import { isEntryStatus } from '@/lib/status'

type Result =
  | { ok: true; value: PersonalInput }
  | { ok: false; error: string }

type PartialResult =
  | { ok: true; value: Partial<PersonalInput> }
  | { ok: false; error: string }

function validateRating(rating: unknown): string | null {
  if (
    rating != null &&
    (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 0 || rating > 10)
  )
    return 'La note doit être un entier entre 0 et 10.'
  return null
}

export function validatePersonal(input: unknown): Result {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'Données personnelles requises.' }
  const p = input as Record<string, unknown>
  if (!isEntryStatus(p.status)) return { ok: false, error: 'Statut invalide.' }
  const ratingError = validateRating(p.rating)
  if (ratingError) return { ok: false, error: ratingError }
  return {
    ok: true,
    value: {
      status: p.status,
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

// Variante pour PATCH : tous les champs sont optionnels, mais s'ils sont
// présents ils doivent être valides.
export function validatePersonalPartial(input: unknown): PartialResult {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'personal requis.' }
  const p = input as Record<string, unknown>
  if (p.status !== undefined && !isEntryStatus(p.status))
    return { ok: false, error: 'Statut invalide.' }
  const ratingError = validateRating(p.rating)
  if (ratingError) return { ok: false, error: ratingError }
  const value: Partial<PersonalInput> = {}
  if (p.status !== undefined) value.status = p.status as PersonalInput['status']
  if (p.rating !== undefined) value.rating = p.rating as number | null
  if (p.review !== undefined) value.review = p.review as string | null
  if (p.platformsPlayed !== undefined)
    value.platformsPlayed = Array.isArray(p.platformsPlayed)
      ? p.platformsPlayed.filter((x): x is string => typeof x === 'string')
      : []
  if (p.playPeriod !== undefined) value.playPeriod = p.playPeriod as string | null
  if (p.estimatedHours !== undefined)
    value.estimatedHours = p.estimatedHours as number | null
  return { ok: true, value }
}
