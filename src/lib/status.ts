import { EntryStatus } from '@prisma/client'

export const STATUS_LABELS: Record<EntryStatus, string> = {
  FINISHED: 'Terminé',
  PLAYING: 'En cours',
  DROPPED: 'Abandonné',
  PAUSED: 'En pause',
  WISHLIST: 'Souhaité',
  TO_SORT: 'À trier',
}

export const STATUS_OPTIONS = Object.entries(STATUS_LABELS) as [EntryStatus, string][]

// `x in EntryStatus` est vrai pour 'constructor', 'toString', etc. (pollution
// via le prototype d'objet) : on vérifie une propriété propre à la place.
export function isEntryStatus(x: unknown): x is EntryStatus {
  return typeof x === 'string' && Object.hasOwn(EntryStatus, x)
}
