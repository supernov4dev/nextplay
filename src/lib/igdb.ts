// Client IGDB (https://api-docs.igdb.com) — auth Twitch "client credentials".
// Sollicité UNIQUEMENT pour la recherche à l'ajout, le matching d'import et
// l'enrichissement des recos : on ne stocke jamais un miroir d'IGDB.

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_URL = 'https://api.igdb.com/v4'
const GAME_FIELDS =
  'fields name, summary, first_release_date, total_rating, cover.image_id, genres.name, themes.name, platforms.name;'

export type IgdbGame = {
  igdbId: number
  title: string
  coverUrl: string | null
  releaseYear: number | null
  summary: string | null
  genres: string[]
  themes: string[]
  platforms: string[]
  igdbRating: number | null
}

let cachedToken: { value: string; expiresAt: number } | null = null

export function resetTokenCache(): void {
  cachedToken = null
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
  const params = new URLSearchParams({
    client_id: process.env.IGDB_CLIENT_ID ?? '',
    client_secret: process.env.IGDB_CLIENT_SECRET ?? '',
    grant_type: 'client_credentials',
  })
  const res = await fetch(`${TOKEN_URL}?${params}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Auth Twitch échouée (HTTP ${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    // marge de 60 s pour ne jamais utiliser un token expiré
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

type RawGame = {
  id: number
  name: string
  summary?: string
  first_release_date?: number
  total_rating?: number
  cover?: { image_id: string }
  genres?: { name: string }[]
  themes?: { name: string }[]
  platforms?: { name: string }[]
}

function toIgdbGame(raw: RawGame): IgdbGame {
  return {
    igdbId: raw.id,
    title: raw.name,
    coverUrl: raw.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${raw.cover.image_id}.jpg`
      : null,
    releaseYear: raw.first_release_date
      ? new Date(raw.first_release_date * 1000).getUTCFullYear()
      : null,
    summary: raw.summary ?? null,
    genres: (raw.genres ?? []).map((g) => g.name),
    themes: (raw.themes ?? []).map((t) => t.name),
    platforms: (raw.platforms ?? []).map((p) => p.name),
    igdbRating: raw.total_rating ?? null,
  }
}

async function igdbQuery(body: string): Promise<RawGame[]> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/games`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`IGDB a répondu HTTP ${res.status}`)
  return (await res.json()) as RawGame[]
}

export async function searchGames(query: string): Promise<IgdbGame[]> {
  const safe = query.replace(/["\\]/g, '')
  const raw = await igdbQuery(`search "${safe}"; ${GAME_FIELDS} limit 10;`)
  return raw.map(toIgdbGame)
}

export async function getGameById(igdbId: number): Promise<IgdbGame | null> {
  const raw = await igdbQuery(`where id = ${igdbId}; ${GAME_FIELDS} limit 1;`)
  return raw.length > 0 ? toIgdbGame(raw[0]) : null
}
