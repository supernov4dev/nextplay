import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addGameFromIgdb } from '@/lib/library'
import { getDashboard } from '@/lib/dashboard'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'

function fakeGame(igdbId: number, title: string): IgdbGame {
  return {
    igdbId, title, releaseYear: 2020, genres: [],
    coverUrl: null, summary: null, themes: [], platforms: [], igdbRating: null, gameType: null,
  }
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
  await addGameFromIgdb(USER, fakeGame(1, 'A'), { status: 'PLAYING', rating: 7 })
  await addGameFromIgdb(USER, fakeGame(2, 'B'), { status: 'FINISHED', rating: 10 })
  await addGameFromIgdb(USER, fakeGame(3, 'C'), { status: 'TO_SORT' })
})

describe('getDashboard', () => {
  it('agrège total, compteurs par statut et rangées', async () => {
    const d = await getDashboard(USER)
    expect(d.total).toBe(3)
    expect(d.byStatus.PLAYING).toBe(1)
    expect(d.byStatus.FINISHED).toBe(1)
    expect(d.byStatus.TO_SORT).toBe(1)
    expect(d.playing.map((e) => e.game.title)).toEqual(['A'])
    expect(d.toSort.map((e) => e.game.title)).toEqual(['C'])
    expect(d.topRated).toHaveLength(2)
    expect(d.topRated[0].game.title).toBe('B')
    expect(d.recent).toHaveLength(3)
  })
})
