import { describe, it, expect, vi } from 'vitest'
import {
  getOwnedGames,
  SteamAuthError,
  SteamPrivateProfileError,
} from '@/lib/steam'

const OWNED_RESPONSE = {
  response: {
    game_count: 2,
    games: [
      { appid: 1091500, name: 'Cyberpunk 2077', playtime_forever: 3120 },
      { appid: 620, name: 'Portal 2', playtime_forever: 0 },
    ],
  },
}

function mockFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('getOwnedGames', () => {
  it('mappe la réponse Steam vers OwnedGame[]', async () => {
    const fetchMock = mockFetch(OWNED_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)
    const games = await getOwnedGames('cle-api', '76561198000000000')
    expect(games).toEqual([
      { appId: 1091500, name: 'Cyberpunk 2077', playtimeMinutes: 3120 },
      { appId: 620, name: 'Portal 2', playtimeMinutes: 0 },
    ])
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('GetOwnedGames')
    expect(url).toContain('key=cle-api')
    expect(url).toContain('steamid=76561198000000000')
    expect(url).toContain('include_appinfo=1')
  })

  it('tolère un nom absent (nom de repli avec appid)', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ response: { game_count: 1, games: [{ appid: 42, playtime_forever: 5 }] } }),
    )
    const [game] = await getOwnedGames('k', 's')
    expect(game.name).toBe('App Steam 42')
  })

  it('bibliothèque vide → tableau vide (pas une erreur)', async () => {
    vi.stubGlobal('fetch', mockFetch({ response: { game_count: 0, games: [] } }))
    expect(await getOwnedGames('k', 's')).toEqual([])
  })

  it('réponse sans liste de jeux → SteamPrivateProfileError (profil privé)', async () => {
    // Steam renvoie {"response":{}} pour un profil privé — sans erreur HTTP.
    vi.stubGlobal('fetch', mockFetch({ response: {} }))
    await expect(getOwnedGames('k', 's')).rejects.toThrow(SteamPrivateProfileError)
  })

  it('HTTP 403 → SteamAuthError', async () => {
    vi.stubGlobal('fetch', mockFetch('Forbidden', 403))
    await expect(getOwnedGames('mauvaise-cle', 's')).rejects.toThrow(SteamAuthError)
  })

  it('HTTP 500 → erreur générique', async () => {
    vi.stubGlobal('fetch', mockFetch('oops', 500))
    await expect(getOwnedGames('k', 's')).rejects.toThrow(/HTTP 500/)
  })
})
