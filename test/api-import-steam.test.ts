import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/steam', async () => {
  class SteamAuthError extends Error {
    constructor() { super('Clé Steam Web API refusée — vérifiez-la sur steamcommunity.com/dev/apikey.') }
  }
  class SteamPrivateProfileError extends Error {
    constructor() { super("Steam n'a renvoyé aucun jeu : profil privé ou SteamID64 incorrect.") }
  }
  return { getOwnedGames: vi.fn(async () => []), SteamAuthError, SteamPrivateProfileError }
})
vi.mock('@/lib/igdb', () => ({
  getGamesBySteamAppIds: vi.fn(async () => new Map()),
}))

import { getOwnedGames, SteamAuthError } from '@/lib/steam'
import { GET, PUT } from '@/app/api/settings/steam/route'
import { POST as importSteam } from '@/app/api/import/steam/route'
import { POST as testSteam } from '@/app/api/import/steam/test/route'

const STEAM_ID = '76561198000000001'

function putRequest(body: unknown): Request {
  return new Request('http://test/api/settings/steam', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.mocked(getOwnedGames).mockReset().mockResolvedValue([])
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: 'default-user', name: 'Test' } })
})

describe('GET/PUT /api/settings/steam', () => {
  it('GET sans config → configured=false', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ configured: false, accountId: null })
  })

  it('PUT valide → 200 avec la config (sans clé) ; GET la relit', async () => {
    const res = await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ configured: true, accountId: STEAM_ID })
    expect(body).not.toHaveProperty('apiKey')
  })

  it('PUT invalide → 400 avec message', async () => {
    const res = await PUT(putRequest({ apiKey: 'k', accountId: 'abc' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/SteamID64/)
  })

  it('PUT JSON invalide → 400', async () => {
    const res = await PUT(
      new Request('http://test', { method: 'PUT', body: 'pas-du-json' }),
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/import/steam', () => {
  it('sans config → 400 avec message actionnable', async () => {
    const res = await importSteam()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/configuré/)
  })

  it('clé refusée par Steam → 400 avec le message de SteamAuthError', async () => {
    await PUT(putRequest({ apiKey: 'mauvaise', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockRejectedValueOnce(new SteamAuthError())
    const res = await importSteam()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/steamcommunity\.com/)
  })

  it('erreur inattendue → 502 générique', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockRejectedValueOnce(new Error('boom réseau'))
    const res = await importSteam()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/indisponible/)
  })

  it('import OK → 200 avec le rapport', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    const res = await importSteam()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      total: 0,
      added: 0,
      updated: 0,
      unmatched: 0,
      unmatchedTitles: [],
    })
  })
})

describe('POST /api/import/steam/test', () => {
  it('config OK → 200 avec le nombre de jeux', async () => {
    await PUT(putRequest({ apiKey: 'k', accountId: STEAM_ID }))
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1, name: 'A', playtimeMinutes: 0 },
    ])
    const res = await testSteam()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ gameCount: 1 })
  })

  it('sans config → 400', async () => {
    expect((await testSteam()).status).toBe(400)
  })
})
