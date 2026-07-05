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
