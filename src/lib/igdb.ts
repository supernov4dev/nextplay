// Client IGDB (https://api-docs.igdb.com) — auth Twitch "client credentials".
// Sollicité UNIQUEMENT pour la recherche à l'ajout, le matching d'import et
// l'enrichissement des recos : on ne stocke jamais un miroir d'IGDB.

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_URL = 'https://api.igdb.com/v4'
const GAME_FIELDS =
  'fields name, summary, first_release_date, total_rating, cover.image_id, genres.name, themes.name, platforms.name, game_type.type;'

// Types IGDB (game_type.type) → libellés français. Un type inconnu est
// affiché tel quel plutôt que masqué.
const GAME_TYPE_LABELS: Record<string, string> = {
  'Main Game': 'Jeu principal',
  'DLC Addon': 'DLC',
  Expansion: 'Extension',
  Bundle: 'Compilation',
  'Standalone Expansion': 'Extension autonome',
  Mod: 'Mod',
  Episode: 'Épisode',
  Season: 'Saison',
  Remake: 'Remake',
  Remaster: 'Remaster',
  'Expanded Game': 'Version étendue',
  Port: 'Portage',
  Fork: 'Fork',
  Pack: 'Pack',
  Update: 'Mise à jour',
}

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
  gameType: string | null
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
  game_type?: { type: string }
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
    gameType: raw.game_type?.type
      ? (GAME_TYPE_LABELS[raw.game_type.type] ?? raw.game_type.type)
      : null,
  }
}

async function igdbRequest<T>(path: string, body: string): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID ?? '',
      Authorization: `Bearer ${token}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`IGDB a répondu HTTP ${res.status}`)
  return (await res.json()) as T
}

async function igdbQuery(body: string): Promise<RawGame[]> {
  return igdbRequest<RawGame[]>('games', body)
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

// Deck de découverte : jeux principaux d'une ou plusieurs plateformes,
// du plus connu au plus obscur (nombre de votes IGDB décroissant).
export async function discoverGames(opts: {
  platformIds: number[]
  decade?: number
  offset: number
  limit?: number
}): Promise<IgdbGame[]> {
  const clauses = [
    `platforms = (${opts.platformIds.join(',')})`,
    'game_type = 0', // jeux principaux uniquement (pas de portage/compilation/DLC)
  ]
  if (opts.decade !== undefined) {
    clauses.push(`first_release_date >= ${Date.UTC(opts.decade, 0, 1) / 1000}`)
    clauses.push(`first_release_date < ${Date.UTC(opts.decade + 10, 0, 1) / 1000}`)
  }
  const raw = await igdbQuery(
    `where ${clauses.join(' & ')}; sort total_rating_count desc; ${GAME_FIELDS} limit ${opts.limit ?? 20}; offset ${opts.offset};`,
  )
  return raw.map(toIgdbGame)
}

// Matching de l'import Steam : appids → jeux IGDB, via l'endpoint
// external_games (source 1 = Steam). Par lots, pour tenir dans une seule
// requête IGDB et respecter la limite de 4 req/s entre les lots.
const STEAM_SOURCE = 1
const MATCH_CHUNK_SIZE = 100

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function getGamesBySteamAppIds(
  appIds: number[],
): Promise<Map<number, IgdbGame>> {
  // Ceinture de sécurité : uniquement des entiers dans le corps de requête IGDB.
  const safeIds = appIds.filter((id) => Number.isInteger(id))
  const result = new Map<number, IgdbGame>()
  for (let i = 0; i < safeIds.length; i += MATCH_CHUNK_SIZE) {
    if (i > 0) await sleep(600) // 2 requêtes par lot → reste sous 4 req/s
    const chunk = safeIds.slice(i, i + MATCH_CHUNK_SIZE)
    const uids = chunk.map((id) => `"${id}"`).join(',')
    const links = await igdbRequest<{ uid: string; game: number }[]>(
      'external_games',
      `fields uid, game; where uid = (${uids}) & external_game_source = ${STEAM_SOURCE}; limit 500;`,
    )
    if (links.length === 0) continue
    const gameIds = [...new Set(links.map((l) => l.game))]
    const raw = await igdbQuery(
      `where id = (${gameIds.join(',')}); ${GAME_FIELDS} limit 500;`,
    )
    const byId = new Map(raw.map((r) => [r.id, toIgdbGame(r)]))
    for (const link of links) {
      const game = byId.get(link.game)
      const appId = Number(link.uid)
      if (game && !result.has(appId)) result.set(appId, game)
    }
  }
  return result
}
