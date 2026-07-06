import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addGameFromIgdb, listLibrary } from '@/lib/library'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'

function fakeGame(igdbId: number, title: string, year: number, genres: string[]): IgdbGame {
  return {
    igdbId, title, releaseYear: year, genres,
    coverUrl: null, summary: null, themes: [], platforms: [], igdbRating: null, gameType: null,
  }
}

beforeEach(async () => {
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
  await addGameFromIgdb(USER, fakeGame(1, 'Final Fantasy VII', 1997, ['RPG']), {
    status: 'FINISHED', rating: 20, platformsPlayed: ['PlayStation'], periods: [{ startYear: 1998 }], estimatedHours: 60,
  })
  await addGameFromIgdb(USER, fakeGame(2, 'Hades', 2020, ['RPG', 'Roguelike']), {
    status: 'PLAYING', rating: 9, platformsPlayed: ['PC'], estimatedHours: 120,
  })
  await addGameFromIgdb(USER, fakeGame(3, 'Gran Turismo', 1997, ['Course']), {
    status: 'TO_SORT', platformsPlayed: ['PlayStation'],
  })
})

describe('listLibrary', () => {
  it('sans filtre : tout, trié par ajout récent', async () => {
    const list = await listLibrary(USER, { sort: 'recent' })
    expect(list.map((e) => e.game.title)).toEqual([
      'Gran Turismo', 'Hades', 'Final Fantasy VII',
    ])
  })

  it('filtre par statut', async () => {
    const list = await listLibrary(USER, { sort: 'recent', status: 'PLAYING' })
    expect(list.map((e) => e.game.title)).toEqual(['Hades'])
  })

  it('filtre par plateforme jouée + genre + décennie', async () => {
    const list = await listLibrary(USER, {
      sort: 'recent', platform: 'PlayStation', genre: 'RPG', decade: 1990,
    })
    expect(list.map((e) => e.game.title)).toEqual(['Final Fantasy VII'])
  })

  it('filtre par note minimale et tri par note', async () => {
    const list = await listLibrary(USER, { sort: 'rating', minRating: 9 })
    expect(list.map((e) => e.rating)).toEqual([20, 9])
  })

  it('recherche plein-texte insensible à la casse', async () => {
    const list = await listLibrary(USER, { sort: 'recent', search: 'hades' })
    expect(list.map((e) => e.game.title)).toEqual(['Hades'])
  })

  it('tri par titre', async () => {
    const list = await listLibrary(USER, { sort: 'title' })
    expect(list.map((e) => e.game.title)).toEqual([
      'Final Fantasy VII', 'Gran Turismo', 'Hades',
    ])
  })
})

describe('listLibrary — temps de jeu', () => {
  it('tri par heures décroissantes, sans-heures en dernier', async () => {
    const list = await listLibrary(USER, { sort: 'hours' })
    expect(list.map((e) => e.game.title)).toEqual([
      'Hades', 'Final Fantasy VII', 'Gran Turismo',
    ])
  })

  it('filtre par heures minimales', async () => {
    const list = await listLibrary(USER, { sort: 'recent', minHours: 100 })
    expect(list.map((e) => e.game.title)).toEqual(['Hades'])
  })
})

describe('heures effectives (estimées sinon Steam)', () => {
  // Pas de helper createEntry existant dans ce fichier : on en écrit un local,
  // minimal (Game + LibraryEntry, statut FINISHED).
  async function createEntry(data: {
    title: string
    estimatedHours?: number | null
    steamPlaytimeMinutes?: number | null
  }) {
    const game = await prisma.game.create({ data: { title: data.title } })
    return prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'FINISHED',
        estimatedHours: data.estimatedHours ?? null,
        steamPlaytimeMinutes: data.steamPlaytimeMinutes ?? null,
      },
    })
  }

  // Repart d'une bibliothèque vide (le beforeEach global crée déjà 3 jeux)
  // pour que les assertions ci-dessous ne portent que sur A/B/C.
  beforeEach(async () => {
    await prisma.libraryEntry.deleteMany()
    await prisma.game.deleteMany()
  })

  it('trie par heures en combinant estimées et temps Steam', async () => {
    // A : 10 h estimées ; B : 20 h de Steam (1200 min) ; C : rien
    await createEntry({ title: 'A', estimatedHours: 10 })
    await createEntry({ title: 'B', steamPlaytimeMinutes: 1200 })
    await createEntry({ title: 'C' })
    const entries = await listLibrary(USER, { sort: 'hours' })
    expect(entries.map((e) => e.game.title)).toEqual(['B', 'A', 'C'])
  })

  it('filtre minHours en tenant compte du temps Steam', async () => {
    await createEntry({ title: 'A', estimatedHours: 10 })
    await createEntry({ title: 'B', steamPlaytimeMinutes: 1200 })
    await createEntry({ title: 'C', steamPlaytimeMinutes: 30 })
    const entries = await listLibrary(USER, { sort: 'recent', minHours: 5 })
    expect(entries.map((e) => e.game.title).sort()).toEqual(['A', 'B'])
  })
})
