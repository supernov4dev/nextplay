// Client Steam Web API — uniquement GetOwnedGames (import de la bibliothèque).
// API officielle et gratuite : https://steamcommunity.com/dev/apikey

export type OwnedGame = {
  appId: number
  name: string
  playtimeMinutes: number
}

// Clé refusée par Steam (HTTP 401/403) — message actionnable côté UI.
export class SteamAuthError extends Error {
  constructor() {
    super('Clé Steam Web API refusée — vérifiez-la sur steamcommunity.com/dev/apikey.')
  }
}

// Un profil privé (ou un SteamID inconnu) ne provoque PAS d'erreur HTTP :
// Steam renvoie simplement une réponse sans liste de jeux. On le signale
// clairement plutôt que d'annoncer « 0 jeu importé ».
export class SteamPrivateProfileError extends Error {
  constructor() {
    super(
      "Steam n'a renvoyé aucun jeu : profil privé ou SteamID64 incorrect. " +
        "Mettez votre profil en public (Confidentialité → Détails de jeu) le temps de l'import.",
    )
  }
}

const OWNED_GAMES_URL = 'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'

type RawOwnedGames = {
  response?: {
    game_count?: number
    games?: { appid: number; name?: string; playtime_forever?: number }[]
  }
}

export async function getOwnedGames(
  apiKey: string,
  steamId64: string,
): Promise<OwnedGame[]> {
  const params = new URLSearchParams({
    key: apiKey,
    steamid: steamId64,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  })
  const res = await fetch(`${OWNED_GAMES_URL}?${params}`)
  if (res.status === 401 || res.status === 403) throw new SteamAuthError()
  if (!res.ok) throw new Error(`Steam a répondu HTTP ${res.status}`)
  const data = (await res.json()) as RawOwnedGames
  const games = data.response?.games
  if (!games) throw new SteamPrivateProfileError()
  return games.map((g) => ({
    appId: g.appid,
    name: g.name ?? `App Steam ${g.appid}`,
    playtimeMinutes: g.playtime_forever ?? 0,
  }))
}
