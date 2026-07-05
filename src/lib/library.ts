import { prisma } from '@/lib/prisma'
import type { EntryStatus, Game, LibraryEntry } from '@prisma/client'
import type { IgdbGame } from '@/lib/igdb'

export type PersonalInput = {
  status: EntryStatus
  rating?: number | null
  review?: string | null
  platformsPlayed?: string[]
  playPeriod?: string | null
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
      review: personal.review ?? null,
      platformsPlayed: personal.platformsPlayed ?? [],
      playPeriod: personal.playPeriod ?? null,
      estimatedHours: personal.estimatedHours ?? null,
    },
  })
  return { entry, created: true }
}

export async function addGameFromIgdb(
  userId: string,
  igdb: IgdbGame,
  personal: PersonalInput,
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
      ...(personal.review !== undefined && { review: personal.review }),
      ...(personal.platformsPlayed !== undefined && {
        platformsPlayed: personal.platformsPlayed,
      }),
      ...(personal.playPeriod !== undefined && { playPeriod: personal.playPeriod }),
      ...(personal.estimatedHours !== undefined && {
        estimatedHours: personal.estimatedHours,
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

export async function getEntryWithGame(
  entryId: string,
): Promise<(LibraryEntry & { game: Game }) | null> {
  return prisma.libraryEntry.findUnique({
    where: { id: entryId },
    include: { game: true },
  })
}
