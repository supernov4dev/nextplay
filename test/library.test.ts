import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  addGameFromIgdb,
  addManualGame,
  updateEntry,
  deleteEntry,
  getEntryWithGame,
} from '@/lib/library'
import type { IgdbGame } from '@/lib/igdb'

const USER = 'test-user'
const HADES: IgdbGame = {
  igdbId: 113112,
  title: 'Hades',
  coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co39vc.jpg',
  releaseYear: 2020,
  summary: 'Un rogue-lite infernal.',
  genres: ['Role-playing (RPG)'],
  themes: ['Fantasy'],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
  igdbRating: 92.1,
  gameType: null,
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
})

describe('addGameFromIgdb', () => {
  it('crée la fiche Game et la LibraryEntry (note /20, platiné, périodes)', async () => {
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED',
      rating: 18,
      mastered: true,
      review: 'Excellent.',
      platformsPlayed: ['Switch'],
      periods: [{ startYear: 2020, endYear: null }, { startYear: 2023, endYear: 2024 }],
    })
    expect(created).toBe(true)
    expect(entry.rating).toBe(18)
    expect(entry.mastered).toBe(true)
    const periods = await prisma.playPeriod.findMany({
      where: { entryId: entry.id },
      orderBy: { startYear: 'asc' },
    })
    expect(periods.map((p) => [p.startYear, p.endYear])).toEqual([
      [2020, null],
      [2023, 2024],
    ])
    const game = await prisma.game.findUnique({ where: { igdbId: 113112 } })
    expect(game?.title).toBe('Hades')
    expect(game?.genres).toEqual(['Role-playing (RPG)'])
  })

  it("ré-ajout du même jeu : fusionne les plateformes SANS écraser note/avis/périodes", async () => {
    await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', rating: 18, mastered: true, review: 'Excellent.',
      platformsPlayed: ['Switch'], periods: [{ startYear: 2020 }],
    })
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'PLAYING', rating: 5, review: 'écrasé ?', platformsPlayed: ['PC', 'Switch'],
      periods: [{ startYear: 1999 }],
    })
    expect(created).toBe(false)
    expect(entry.platformsPlayed.sort()).toEqual(['PC', 'Switch'])
    expect(entry.rating).toBe(18)           // conservé
    expect(entry.review).toBe('Excellent.') // conservé
    expect(entry.status).toBe('FINISHED')   // conservé
    expect(entry.mastered).toBe(true)       // conservé
    const periods = await prisma.playPeriod.findMany({ where: { entryId: entry.id } })
    expect(periods.map((p) => p.startYear)).toEqual([2020]) // conservées
    expect(await prisma.game.count()).toBe(1) // pas de doublon de fiche
  })
})

describe('addManualGame', () => {
  it('crée une fiche sans igdbId', async () => {
    const { entry, created } = await addManualGame(
      USER,
      { title: 'Jeu homebrew PS1', releaseYear: 1998, platforms: ['PlayStation'] },
      { status: 'FINISHED', platformsPlayed: ['PlayStation'] },
    )
    expect(created).toBe(true)
    const full = await getEntryWithGame(entry.id)
    expect(full?.game.igdbId).toBeNull()
    expect(full?.game.title).toBe('Jeu homebrew PS1')
  })
})

describe('updateEntry / deleteEntry', () => {
  it('met à jour uniquement les champs fournis', async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'TO_SORT', platformsPlayed: ['PC'],
    })
    const updated = await updateEntry(entry.id, { status: 'FINISHED', rating: 16, mastered: true })
    expect(updated.status).toBe('FINISHED')
    expect(updated.rating).toBe(16)
    expect(updated.mastered).toBe(true)
    expect(updated.platformsPlayed).toEqual(['PC']) // intact
  })

  it('remplace les périodes quand elles sont fournies', async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', periods: [{ startYear: 2020 }],
    })
    await updateEntry(entry.id, { periods: [{ startYear: 2021 }, { startYear: 2023, endYear: 2024 }] })
    const periods = await prisma.playPeriod.findMany({
      where: { entryId: entry.id },
      orderBy: { startYear: 'asc' },
    })
    expect(periods.map((p) => [p.startYear, p.endYear])).toEqual([
      [2021, null],
      [2023, 2024],
    ])
  })

  it("supprime l'entrée, ses périodes et la fiche Game devenue orpheline", async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', platformsPlayed: [], periods: [{ startYear: 2020 }],
    })
    await deleteEntry(entry.id)
    expect(await prisma.libraryEntry.count()).toBe(0)
    expect(await prisma.game.count()).toBe(0)
    expect(await prisma.playPeriod.count()).toBe(0)
  })
})
