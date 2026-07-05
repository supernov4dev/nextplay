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
