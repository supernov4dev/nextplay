// Import Steam : configuration (page Réglages) et orchestration.
// La clé Web API vit en base (app solo auto-hébergée) et ne quitte jamais
// le serveur : getSteamConfig n'expose que l'état, jamais la clé.

import { prisma } from '@/lib/prisma'
import {
  getOwnedGames,
  SteamAuthError,
  SteamPrivateProfileError,
  type OwnedGame,
} from '@/lib/steam'
import { getGamesBySteamAppIds } from '@/lib/igdb'

export type SteamConfigView = {
  configured: boolean
  accountId: string | null
  lastImportAt: Date | null
}

async function findSource(userId: string) {
  return prisma.importSource.findUnique({
    where: { userId_provider: { userId, provider: 'STEAM' } },
  })
}

export async function getSteamConfig(userId: string): Promise<SteamConfigView> {
  const source = await findSource(userId)
  return {
    configured: source !== null,
    accountId: source?.accountId ?? null,
    lastImportAt: source?.lastImportAt ?? null,
  }
}

const STEAM_ID64_RE = /^\d{17}$/

export async function saveSteamConfig(
  userId: string,
  input: { apiKey?: unknown; accountId: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : ''
  if (!STEAM_ID64_RE.test(accountId))
    return { ok: false, error: 'Le SteamID64 doit comporter 17 chiffres.' }
  const newKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : ''
  const existing = await findSource(userId)
  // Clé absente = on conserve l'existante (l'UI ne renvoie jamais la clé stockée)
  const apiKey = newKey || existing?.apiKey
  if (!apiKey) return { ok: false, error: 'La clé Web API est requise.' }
  await prisma.importSource.upsert({
    where: { userId_provider: { userId, provider: 'STEAM' } },
    update: { apiKey, accountId },
    create: { userId, provider: 'STEAM', apiKey, accountId },
  })
  return { ok: true }
}

export class SteamNotConfiguredError extends Error {
  constructor() {
    super("Steam n'est pas configuré — renseignez la clé Web API et le SteamID64.")
  }
}

export type ImportReport = {
  total: number // jeux possédés sur Steam
  added: number // nouvelles entrées créées
  updated: number // entrées existantes rafraîchies (fusion / temps de jeu)
  unmatched: number // fiches manuelles créées (introuvables sur IGDB)
  unmatchedTitles: string[] // pour affichage dans le rapport (plafonné)
}

const UNMATCHED_TITLES_MAX = 50

// Le vocabulaire fermé (src/lib/platforms.ts) désigne Steam par « PC ».
const STEAM_PLATFORM = 'PC'

// Crée l'entrée « à trier » ou fusionne avec l'entrée existante — même
// règle anti-duplication que upsertEntry (library.ts) : le vécu existant
// (statut, note, avis) fait foi, on n'y touche jamais.
async function attachSteamEntry(
  userId: string,
  gameId: string,
  owned: OwnedGame,
): Promise<{ created: boolean }> {
  const existing = await prisma.libraryEntry.findUnique({
    where: { userId_gameId: { userId, gameId } },
  })
  if (existing) {
    // Promotion Collection → À trier : uniquement sur la transition 0 → positif
    // (le jeu a été lancé depuis l'import). Une entrée rangée en Collection
    // À LA MAIN avec du temps de jeu ne re-bascule jamais.
    const promote =
      existing.status === 'OWNED' &&
      (existing.steamPlaytimeMinutes ?? 0) === 0 &&
      owned.playtimeMinutes > 0
    await prisma.libraryEntry.update({
      where: { id: existing.id },
      data: {
        platformsPlayed: [...new Set([...existing.platformsPlayed, STEAM_PLATFORM])],
        // Le temps Steam ne diminue jamais (playtime_forever est monotone)
        steamPlaytimeMinutes: Math.max(
          existing.steamPlaytimeMinutes ?? 0,
          owned.playtimeMinutes,
        ),
        ...(promote && { status: 'TO_SORT' as const }),
      },
    })
    return { created: false }
  }
  await prisma.libraryEntry.create({
    data: {
      userId,
      gameId,
      // Jamais lancé (0 min) = possession → Collection ; sinon file « À trier »
      status: owned.playtimeMinutes > 0 ? 'TO_SORT' : 'OWNED',
      source: 'STEAM',
      platformsPlayed: [STEAM_PLATFORM],
      steamPlaytimeMinutes: owned.playtimeMinutes,
    },
  })
  return { created: true }
}

export async function runSteamImport(userId: string): Promise<ImportReport> {
  const source = await findSource(userId)
  if (!source) throw new SteamNotConfiguredError()
  const owned = await getOwnedGames(source.apiKey, source.accountId)

  const report: ImportReport = {
    total: owned.length,
    added: 0,
    updated: 0,
    unmatched: 0,
    unmatchedTitles: [],
  }

  // 1. Fiches déjà ancrées par steamAppId (imports précédents, y compris les
  //    fiches manuelles créées par un import) → simple rafraîchissement,
  //    sans repasser par IGDB.
  const known = new Map(
    (
      await prisma.game.findMany({
        where: { steamAppId: { in: owned.map((g) => g.appId) } },
        select: { id: true, steamAppId: true },
      })
    ).map((g) => [g.steamAppId as number, g.id]),
  )

  const toMatch: OwnedGame[] = []
  for (const ownedGame of owned) {
    const gameId = known.get(ownedGame.appId)
    if (!gameId) {
      toMatch.push(ownedGame)
      continue
    }
    const { created } = await attachSteamEntry(userId, gameId, ownedGame)
    if (created) report.added++
    else report.updated++
  }

  // 2. Matching IGDB par lots pour les inconnus.
  const matched = await getGamesBySteamAppIds(toMatch.map((g) => g.appId))
  for (const ownedGame of toMatch) {
    const igdb = matched.get(ownedGame.appId)
    if (igdb) {
      // Le jeu peut déjà exister via son igdbId (ajouté à la main, ou déjà
      // ancré par un appId précédent dans ce même run) : on y accroche alors
      // le steamAppId — règle anti-duplication.
      const existingByIgdb = await prisma.game.findUnique({ where: { igdbId: igdb.igdbId } })
      let game
      if (existingByIgdb) {
        // Deux éditions Steam (ex. Epic/Steam) peuvent pointer vers le même
        // jeu IGDB : la première ancre gagne, on ne la vole pas au second
        // appId sous peine de perdre son temps de jeu au profil suivant.
        game = existingByIgdb.steamAppId
          ? existingByIgdb
          : await prisma.game.update({
              where: { id: existingByIgdb.id },
              data: { steamAppId: ownedGame.appId },
            })
      } else {
        game = await prisma.game.create({
          data: {
            igdbId: igdb.igdbId,
            steamAppId: ownedGame.appId,
            title: igdb.title,
            coverUrl: igdb.coverUrl,
            releaseYear: igdb.releaseYear,
            // Résumé en anglais : le batch `npm run translate:fr` rattrapera.
            summary: igdb.summary,
            genres: igdb.genres,
            themes: igdb.themes,
            platforms: igdb.platforms,
            igdbRating: igdb.igdbRating,
          },
        })
      }
      const { created } = await attachSteamEntry(userId, game.id, ownedGame)
      if (created) report.added++
      else report.updated++
    } else {
      // Introuvable sur IGDB → fiche manuelle « à trier », à résoudre ou
      // ignorer au fil de l'eau (jeux de bundles jamais lancés, outils…).
      const game = await prisma.game.create({
        data: {
          title: ownedGame.name,
          steamAppId: ownedGame.appId,
          platforms: ['PC (Microsoft Windows)'],
        },
      })
      await attachSteamEntry(userId, game.id, ownedGame)
      report.added++
      report.unmatched++
      if (report.unmatchedTitles.length < UNMATCHED_TITLES_MAX)
        report.unmatchedTitles.push(ownedGame.name)
    }
  }

  await prisma.importSource.update({
    where: { id: source.id },
    data: { lastImportAt: new Date() },
  })
  return report
}

export async function testSteamConnection(userId: string): Promise<number> {
  const source = await findSource(userId)
  if (!source) throw new SteamNotConfiguredError()
  return (await getOwnedGames(source.apiKey, source.accountId)).length
}

// Erreur → réponse HTTP : 400 quand l'utilisateur peut corriger (config,
// clé, profil privé), 502 quand un service externe est en cause.
export function steamErrorToHttp(err: unknown): { status: number; error: string } {
  if (
    err instanceof SteamNotConfiguredError ||
    err instanceof SteamAuthError ||
    err instanceof SteamPrivateProfileError
  )
    return { status: 400, error: err.message }
  console.error('Import Steam en échec :', err)
  return { status: 502, error: 'Steam ou IGDB est indisponible — réessayez plus tard.' }
}
