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
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
})

describe('addGameFromIgdb', () => {
  it('crée la fiche Game et la LibraryEntry', async () => {
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED',
      rating: 9,
      review: 'Excellent.',
      platformsPlayed: ['Switch'],
    })
    expect(created).toBe(true)
    expect(entry.rating).toBe(9)
    const game = await prisma.game.findUnique({ where: { igdbId: 113112 } })
    expect(game?.title).toBe('Hades')
    expect(game?.genres).toEqual(['Role-playing (RPG)'])
  })

  it("ré-ajout du même jeu : fusionne les plateformes SANS écraser note/avis", async () => {
    await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', rating: 9, review: 'Excellent.', platformsPlayed: ['Switch'],
    })
    const { entry, created } = await addGameFromIgdb(USER, HADES, {
      status: 'PLAYING', rating: 5, review: 'écrasé ?', platformsPlayed: ['PC', 'Switch'],
    })
    expect(created).toBe(false)
    expect(entry.platformsPlayed.sort()).toEqual(['PC', 'Switch'])
    expect(entry.rating).toBe(9)          // conservé
    expect(entry.review).toBe('Excellent.') // conservé
    expect(entry.status).toBe('FINISHED')   // conservé
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
    const updated = await updateEntry(entry.id, { status: 'FINISHED', rating: 8 })
    expect(updated.status).toBe('FINISHED')
    expect(updated.rating).toBe(8)
    expect(updated.platformsPlayed).toEqual(['PC']) // intact
  })

  it("supprime l'entrée et la fiche Game devenue orpheline", async () => {
    const { entry } = await addGameFromIgdb(USER, HADES, {
      status: 'FINISHED', platformsPlayed: [],
    })
    await deleteEntry(entry.id)
    expect(await prisma.libraryEntry.count()).toBe(0)
    expect(await prisma.game.count()).toBe(0)
  })
})
