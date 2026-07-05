import { EntryStatus } from '@prisma/client'
import { isEntryStatus } from '@/lib/status'

export type LibrarySort = 'recent' | 'title' | 'rating' | 'releaseYear' | 'hours'

export type LibraryFilters = {
  status?: EntryStatus
  platform?: string
  genre?: string
  decade?: number
  minRating?: number
  minHours?: number
  search?: string
  sort: LibrarySort
}

const SORTS: LibrarySort[] = ['recent', 'title', 'rating', 'releaseYear', 'hours']

// Traduit les searchParams d'URL (tous optionnels, non fiables) en filtres sûrs.
export function parseFilters(
  params: Record<string, string | undefined>,
): LibraryFilters {
  const filters: LibraryFilters = {
    sort: SORTS.includes(params.sort as LibrarySort)
      ? (params.sort as LibrarySort)
      : 'recent',
  }
  if (isEntryStatus(params.status)) filters.status = params.status
  if (params.platform) filters.platform = params.platform
  if (params.genre) filters.genre = params.genre
  const decade = Number(params.decade)
  if (params.decade && Number.isInteger(decade)) filters.decade = decade
  const minRating = Number(params.minRating)
  if (params.minRating && Number.isInteger(minRating)) filters.minRating = minRating
  const minHours = Number(params.minHours)
  if (params.minHours && Number.isInteger(minHours)) filters.minHours = minHours
  if (params.q) filters.search = params.q
  return filters
}
