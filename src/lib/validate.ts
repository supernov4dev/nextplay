import type { PersonalInput, PlayPeriodInput } from '@/lib/library'
import { isEntryStatus } from '@/lib/status'

type Result =
  | { ok: true; value: PersonalInput }
  | { ok: false; error: string }

type PartialResult =
  | { ok: true; value: Partial<PersonalInput> }
  | { ok: false; error: string }

const YEAR_MIN = 1950
const YEAR_MAX = 2100

function validateRating(rating: unknown): string | null {
  if (
    rating != null &&
    (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 0 || rating > 20)
  )
    return 'La note doit être un entier entre 0 et 20.'
  return null
}

// Retourne les périodes normalisées, ou un message d'erreur (string).
function parsePeriods(input: unknown): PlayPeriodInput[] | string {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) return 'Les périodes doivent être une liste.'
  const out: PlayPeriodInput[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return 'Période invalide.'
    const { startYear, endYear } = item as Record<string, unknown>
    if (
      typeof startYear !== 'number' ||
      !Number.isInteger(startYear) ||
      startYear < YEAR_MIN ||
      startYear > YEAR_MAX
    )
      return `L'année de début doit être un entier entre ${YEAR_MIN} et ${YEAR_MAX}.`
    if (endYear != null) {
      if (
        typeof endYear !== 'number' ||
        !Number.isInteger(endYear) ||
        endYear < startYear ||
        endYear > YEAR_MAX
      )
        return "L'année de fin doit être un entier supérieur ou égal à l'année de début."
      out.push({ startYear, endYear })
    } else {
      out.push({ startYear, endYear: null })
    }
  }
  return out
}

export function validatePersonal(input: unknown): Result {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'Données personnelles requises.' }
  const p = input as Record<string, unknown>
  if (!isEntryStatus(p.status)) return { ok: false, error: 'Statut invalide.' }
  const ratingError = validateRating(p.rating)
  if (ratingError) return { ok: false, error: ratingError }
  const periods = parsePeriods(p.periods)
  if (typeof periods === 'string') return { ok: false, error: periods }
  return {
    ok: true,
    value: {
      status: p.status,
      rating: (p.rating as number | null) ?? null,
      mastered: p.mastered === true,
      review: typeof p.review === 'string' && p.review !== '' ? p.review : null,
      platformsPlayed: Array.isArray(p.platformsPlayed)
        ? p.platformsPlayed.filter((x): x is string => typeof x === 'string')
        : [],
      periods,
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
  if (p.mastered !== undefined) value.mastered = p.mastered === true
  if (p.review !== undefined) value.review = p.review as string | null
  if (p.platformsPlayed !== undefined)
    value.platformsPlayed = Array.isArray(p.platformsPlayed)
      ? p.platformsPlayed.filter((x): x is string => typeof x === 'string')
      : []
  if (p.periods !== undefined) {
    const periods = parsePeriods(p.periods)
    if (typeof periods === 'string') return { ok: false, error: periods }
    value.periods = periods
  }
  if (p.estimatedHours !== undefined)
    value.estimatedHours = p.estimatedHours as number | null
  return { ok: true, value }
}
