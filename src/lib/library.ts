import { prisma } from '@/lib/prisma'
import type { EntryStatus, Game, LibraryEntry, PlayPeriod } from '@prisma/client'
import type { IgdbGame } from '@/lib/igdb'
import type { LibraryFilters } from '@/lib/filters'

export type PlayPeriodInput = {
  startYear: number
  endYear?: number | null // null = année seule
}

export type PersonalInput = {
  status: EntryStatus
  rating?: number | null // note sur 20
  mastered?: boolean // Platiné / 100 %
  review?: string | null
  platformsPlayed?: string[]
  periods?: PlayPeriodInput[]
  estimatedHours?: number | null
}

export type ManualGameInput = {
  title: string
  releaseYear?: number | null
  platforms?: string[]
}

// Règle anti-duplication : si l'utilisateur possède déjà une entrée pour ce
// jeu, on fusionne les plateformes jouées et on ne touche à rien d'autre
// (la note et l'avis existants font foi).
async function upsertEntry(
  userId: string,
  gameId: string,
  personal: PersonalInput,
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const existing = await prisma.libraryEntry.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })
  if (existing) {
    const merged = [
      ...new Set([...existing.platformsPlayed, ...(personal.platformsPlayed ?? [])]),
    ]
    const entry = await prisma.libraryEntry.update({
      where: { id: existing.id },
      data: { platformsPlayed: merged },
    })
    return { entry, created: false }
  }
  const entry = await prisma.libraryEntry.create({
    data: {
      userId,
      gameId,
      status: personal.status,
      rating: personal.rating ?? null,
      mastered: personal.mastered ?? false,
      review: personal.review ?? null,
      platformsPlayed: personal.platformsPlayed ?? [],
      estimatedHours: personal.estimatedHours ?? null,
      periods: {
        create: (personal.periods ?? []).map((p) => ({
          startYear: p.startYear,
          endYear: p.endYear ?? null,
        })),
      },
    },
  })
  return { entry, created: true }
}

export async function addGameFromIgdb(
  userId: string,
  igdb: IgdbGame,
  personal: PersonalInput,
  gameExtras?: { summaryTranslated?: boolean },
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const game = await prisma.game.upsert({
    where: { igdbId: igdb.igdbId },
    update: {}, // fiche existante = source de vérité, pas de rafraîchissement ici
    create: {
      igdbId: igdb.igdbId,
      title: igdb.title,
      coverUrl: igdb.coverUrl,
      releaseYear: igdb.releaseYear,
      summary: igdb.summary,
      summaryTranslated: gameExtras?.summaryTranslated ?? false,
      genres: igdb.genres,
      themes: igdb.themes,
      platforms: igdb.platforms,
      igdbRating: igdb.igdbRating,
    },
  })
  return upsertEntry(userId, game.id, personal)
}

export async function addManualGame(
  userId: string,
  gameInput: ManualGameInput,
  personal: PersonalInput,
): Promise<{ entry: LibraryEntry; created: boolean }> {
  const game = await prisma.game.create({
    data: {
      title: gameInput.title,
      releaseYear: gameInput.releaseYear ?? null,
      platforms: gameInput.platforms ?? [],
    },
  })
  return upsertEntry(userId, game.id, personal)
}

export async function updateEntry(
  entryId: string,
  personal: Partial<PersonalInput>,
): Promise<LibraryEntry> {
  return prisma.libraryEntry.update({
    where: { id: entryId },
    data: {
      ...(personal.status !== undefined && { status: personal.status }),
      ...(personal.rating !== undefined && { rating: personal.rating }),
      ...(personal.mastered !== undefined && { mastered: personal.mastered }),
      ...(personal.review !== undefined && { review: personal.review }),
      ...(personal.platformsPlayed !== undefined && {
        platformsPlayed: personal.platformsPlayed,
      }),
      ...(personal.estimatedHours !== undefined && {
        estimatedHours: personal.estimatedHours,
      }),
      // Périodes fournies = remplacement complet
      ...(personal.periods !== undefined && {
        periods: {
          deleteMany: {},
          create: personal.periods.map((p) => ({
            startYear: p.startYear,
            endYear: p.endYear ?? null,
          })),
        },
      }),
    },
  })
}

export async function deleteEntry(entryId: string): Promise<void> {
  const entry = await prisma.libraryEntry.delete({ where: { id: entryId } })
  // Supprime la fiche Game si plus personne ne la référence
  const remaining = await prisma.libraryEntry.count({ where: { gameId: entry.gameId } })
  if (remaining === 0) await prisma.game.delete({ where: { id: entry.gameId } })
}

export type EntryWithGameAndPeriods = LibraryEntry & { game: Game; periods: PlayPeriod[] }

// Heures « effectives » d'une entrée : les heures estimées saisies à la main
// font foi ; à défaut, le temps Steam réel arrondi en heures.
export function effectiveHours(entry: {
  estimatedHours: number | null
  steamPlaytimeMinutes: number | null
}): number | null {
  if (entry.estimatedHours != null) return entry.estimatedHours
  if (entry.steamPlaytimeMinutes != null) return Math.round(entry.steamPlaytimeMinutes / 60)
  return null
}

export async function getEntryWithGame(
  entryId: string,
): Promise<EntryWithGameAndPeriods | null> {
  return prisma.libraryEntry.findUnique({
    where: { id: entryId },
    include: { game: true, periods: { orderBy: { startYear: 'asc' } } },
  })
}

export async function listLibrary(
  userId: string,
  filters: LibraryFilters,
): Promise<EntryWithGameAndPeriods[]> {
  const gameWhere: Record<string, unknown> = {}
  if (filters.genre) gameWhere.genres = { has: filters.genre }
  if (filters.decade !== undefined)
    gameWhere.releaseYear = { gte: filters.decade, lt: filters.decade + 10 }
  if (filters.search)
    gameWhere.title = { contains: filters.search, mode: 'insensitive' }

  const orderBy =
    filters.sort === 'title'
      ? { game: { title: 'asc' as const } }
      : filters.sort === 'rating'
        ? { rating: { sort: 'desc' as const, nulls: 'last' as const } }
        : filters.sort === 'releaseYear'
          ? { game: { releaseYear: { sort: 'desc' as const, nulls: 'last' as const } } }
          : // 'hours' combine heures estimées et temps Steam (voir plus bas) —
            // Prisma ne sait pas trier sur un coalesce de deux colonnes.
            { createdAt: 'desc' as const }

  const entries = await prisma.libraryEntry.findMany({
    where: {
      userId,
      ...(filters.status
        ? { status: filters.status }
        : filters.qualified
          ? // « Qualifiés seulement » : masque la file de triage et la Collection
            { status: { notIn: ['TO_SORT', 'OWNED'] } }
          : {}),
      ...(filters.platform && { platformsPlayed: { has: filters.platform } }),
      ...(filters.minRating !== undefined && { rating: { gte: filters.minRating } }),
      ...(Object.keys(gameWhere).length > 0 && { game: gameWhere }),
    },
    include: { game: true, periods: { orderBy: { startYear: 'asc' } } },
    orderBy,
  })

  let results = entries
  if (filters.minHours !== undefined)
    results = results.filter((e) => (effectiveHours(e) ?? -1) >= filters.minHours!)
  if (filters.sort === 'hours')
    results = [...results].sort(
      (a, b) => (effectiveHours(b) ?? -1) - (effectiveHours(a) ?? -1),
    )
  return results
}
