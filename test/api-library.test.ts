import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/igdb', () => ({
  getGameById: vi.fn(async (id: number) =>
    id === 113112
      ? {
          igdbId: 113112, title: 'Hades', coverUrl: null, releaseYear: 2020,
          summary: null, genres: ['RPG'], themes: [], platforms: [], igdbRating: 92,
        }
      : null,
  ),
  searchGames: vi.fn(async () => []),
}))

import { POST } from '@/app/api/library/route'
import { PATCH, DELETE } from '@/app/api/library/[entryId]/route'

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://test/api/library', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: 'default-user', name: 'Test' } })
})

describe('POST /api/library', () => {
  it('ajoute un jeu depuis IGDB → 201', async () => {
    const res = await POST(
      jsonRequest('POST', {
        igdbId: 113112,
        personal: { status: 'FINISHED', rating: 9, platformsPlayed: ['PC'] },
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.created).toBe(true)
  })

  it('ré-ajout → 200 avec created=false (fusion)', async () => {
    const payload = {
      igdbId: 113112,
      personal: { status: 'FINISHED', platformsPlayed: ['PC'] },
    }
    await POST(jsonRequest('POST', payload))
    const res = await POST(jsonRequest('POST', payload))
    expect(res.status).toBe(200)
    expect((await res.json()).created).toBe(false)
  })

  it('igdbId inconnu → 404 ; payload sans statut → 400 ; note hors bornes → 400', async () => {
    expect(
      (await POST(jsonRequest('POST', { igdbId: 42, personal: { status: 'FINISHED' } }))).status,
    ).toBe(404)
    expect((await POST(jsonRequest('POST', { igdbId: 113112, personal: {} }))).status).toBe(400)
    expect(
      (await POST(
        jsonRequest('POST', { igdbId: 113112, personal: { status: 'FINISHED', rating: 15 } }),
      )).status,
    ).toBe(400)
  })

  it('ajout manuel → 201', async () => {
    const res = await POST(
      jsonRequest('POST', {
        manual: { title: 'Jeu PS1 obscur', releaseYear: 1998 },
        personal: { status: 'FINISHED' },
      }),
    )
    expect(res.status).toBe(201)
  })

  it('igdbId non entier → 400', async () => {
    const res = await POST(
      jsonRequest('POST', { igdbId: 1.5, personal: { status: 'FINISHED' } }),
    )
    expect(res.status).toBe(400)
  })

  it('IGDB indisponible → 502', async () => {
    const { getGameById } = await import('@/lib/igdb')
    vi.mocked(getGameById).mockRejectedValueOnce(new Error('boom'))
    const res = await POST(
      jsonRequest('POST', { igdbId: 113112, personal: { status: 'FINISHED' } }),
    )
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/IGDB/)
  })
})

describe('PATCH & DELETE /api/library/:entryId', () => {
  it('met à jour puis supprime', async () => {
    const created = await POST(
      jsonRequest('POST', { igdbId: 113112, personal: { status: 'TO_SORT' } }),
    )
    const { entryId } = await created.json()
    const params = Promise.resolve({ entryId })

    const patched = await PATCH(
      jsonRequest('PATCH', { personal: { status: 'FINISHED', rating: 8 } }),
      { params },
    )
    expect(patched.status).toBe(200)
    const entry = await prisma.libraryEntry.findUnique({ where: { id: entryId } })
    expect(entry?.rating).toBe(8)

    const deleted = await DELETE(new Request('http://test'), { params })
    expect(deleted.status).toBe(204)
    expect(await prisma.libraryEntry.count()).toBe(0)
  })

  it('PATCH sur un entryId inconnu → 404', async () => {
    const params = Promise.resolve({ entryId: 'inconnu-123' })
    const res = await PATCH(
      jsonRequest('PATCH', { personal: { status: 'FINISHED' } }),
      { params },
    )
    expect(res.status).toBe(404)
  })

  it('DELETE sur un entryId inconnu → 404', async () => {
    const params = Promise.resolve({ entryId: 'inconnu-456' })
    const res = await DELETE(new Request('http://test'), { params })
    expect(res.status).toBe(404)
  })
})
