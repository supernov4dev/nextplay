import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import type { IgdbGame } from '@/lib/igdb'

function fake(igdbId: number, title: string): IgdbGame {
  return {
    igdbId, title, coverUrl: null, releaseYear: 1997, summary: null,
    genres: [], themes: [], platforms: ['PlayStation'], igdbRating: null, gameType: 'Jeu principal',
  }
}

vi.mock('@/lib/igdb', () => ({
  discoverGames: vi.fn(async () => [fake(1, 'FF7'), fake(2, 'MGS'), fake(3, 'Crash')]),
}))

vi.mock('@/lib/translate', () => ({
  translateSummary: vi.fn(async (_id: number, text: string) => ({ text, translated: false })),
}))

import { GET } from '@/app/api/discover/route'
import { POST as EXCLUDE } from '@/app/api/discover/exclude/route'
import { addGameFromIgdb } from '@/lib/library'

beforeEach(async () => {
  await prisma.importSource.deleteMany()
  await prisma.discoveryExclusion.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: 'default-user', name: 'Test' } })
})

describe('GET /api/discover', () => {
  it('retourne le deck en excluant bibliothèque et exclusions', async () => {
    // FF7 (igdbId 1) déjà en bibliothèque
    await addGameFromIgdb('default-user', fake(1, 'FF7'), { status: 'FINISHED' })
    // MGS (igdbId 2) marqué « pas joué »
    await prisma.discoveryExclusion.create({
      data: { userId: 'default-user', igdbId: 2 },
    })
    const res = await GET(
      new Request('http://test/api/discover?platform=PlayStation&offset=0'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results.map((g: IgdbGame) => g.igdbId)).toEqual([3])
    // le mock renvoie moins d'un lot complet → fin de catalogue
    expect(body.nextOffset).toBeNull()
  })

  it('plateforme inconnue ou sans mapping → 400', async () => {
    expect((await GET(new Request('http://test/api/discover?platform=Autre'))).status).toBe(400)
    expect((await GET(new Request('http://test/api/discover'))).status).toBe(400)
  })
})

describe('POST /api/discover/exclude', () => {
  it('enregistre une exclusion, idempotent', async () => {
    const req = () =>
      new Request('http://test/api/discover/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igdbId: 42 }),
      })
    expect((await EXCLUDE(req())).status).toBe(201)
    expect((await EXCLUDE(req())).status).toBe(201) // rejouable sans erreur
    expect(await prisma.discoveryExclusion.count()).toBe(1)
  })

  it('igdbId manquant → 400', async () => {
    const res = await EXCLUDE(
      new Request('http://test/api/discover/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(400)
  })
})
