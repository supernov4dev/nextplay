import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchGames, getGameById, resetTokenCache } from '@/lib/igdb'

const TOKEN_RESPONSE = { access_token: 'tok-123', expires_in: 5000 }
const RAW_GAME = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  summary: 'Geralt of Rivia...',
  first_release_date: 1431993600, // 2015-05-19
  total_rating: 93.4,
  cover: { image_id: 'co1wyy' },
  genres: [{ name: 'Role-playing (RPG)' }],
  themes: [{ name: 'Fantasy' }],
  platforms: [{ name: 'PC (Microsoft Windows)' }, { name: 'PlayStation 4' }],
  game_type: { id: 0, type: 'Main Game' },
}

function mockFetch(gameResults: unknown[]) {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    void init // capturé dans mock.calls pour inspecter le body envoyé
    if (String(url).includes('id.twitch.tv')) {
      return new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 })
    }
    return new Response(JSON.stringify(gameResults), { status: 200 })
  })
}

beforeEach(() => resetTokenCache())

describe('searchGames', () => {
  it('mappe la réponse IGDB vers IgdbGame', async () => {
    vi.stubGlobal('fetch', mockFetch([RAW_GAME]))
    const results = await searchGames('witcher')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      igdbId: 1942,
      title: 'The Witcher 3: Wild Hunt',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
      releaseYear: 2015,
      summary: 'Geralt of Rivia...',
      genres: ['Role-playing (RPG)'],
      themes: ['Fantasy'],
      platforms: ['PC (Microsoft Windows)', 'PlayStation 4'],
      igdbRating: 93.4,
      gameType: 'Jeu principal',
    })
  })

  it('traduit les types de jeu connus et laisse les inconnus tels quels', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        { id: 1, name: 'A', game_type: { id: 11, type: 'Port' } },
        { id: 2, name: 'B', game_type: { id: 3, type: 'Bundle' } },
        { id: 3, name: 'C', game_type: { id: 99, type: 'Type Inconnu' } },
      ]),
    )
    const [a, b, c] = await searchGames('x')
    expect(a.gameType).toBe('Portage')
    expect(b.gameType).toBe('Compilation')
    expect(c.gameType).toBe('Type Inconnu')
  })

  it('tolère les champs absents (jaquette, date, genres...)', async () => {
    vi.stubGlobal('fetch', mockFetch([{ id: 7, name: 'Jeu obscur' }]))
    const [game] = await searchGames('obscur')
    expect(game.coverUrl).toBeNull()
    expect(game.releaseYear).toBeNull()
    expect(game.genres).toEqual([])
    expect(game.igdbRating).toBeNull()
    expect(game.gameType).toBeNull()
  })

  it("réutilise le token entre deux appels (une seule requête d'auth)", async () => {
    const fetchMock = mockFetch([RAW_GAME])
    vi.stubGlobal('fetch', fetchMock)
    await searchGames('a')
    await searchGames('b')
    const authCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('id.twitch.tv'),
    )
    expect(authCalls).toHaveLength(1)
  })

  it('assainit la requête (guillemets et antislashs retirés) avant envoi à IGDB', async () => {
    const fetchMock = mockFetch([RAW_GAME])
    vi.stubGlobal('fetch', fetchMock)
    await searchGames('zel"da\\')
    const gameCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/games'))
    const sentBody = String(gameCall?.[1]?.body)
    expect(sentBody).toContain('search "zelda";')
    expect(sentBody).not.toContain('\\')
  })

  it('lève une erreur si IGDB répond en échec', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) =>
      String(url).includes('id.twitch.tv')
        ? new Response(JSON.stringify(TOKEN_RESPONSE), { status: 200 })
        : new Response('oops', { status: 500 }),
    ))
    await expect(searchGames('x')).rejects.toThrow()
  })
})

describe('getGameById', () => {
  it('retourne le jeu si trouvé', async () => {
    vi.stubGlobal('fetch', mockFetch([RAW_GAME]))
    const game = await getGameById(1942)
    expect(game?.title).toBe('The Witcher 3: Wild Hunt')
  })

  it('retourne null si introuvable', async () => {
    vi.stubGlobal('fetch', mockFetch([]))
    expect(await getGameById(999999)).toBeNull()
  })
})
