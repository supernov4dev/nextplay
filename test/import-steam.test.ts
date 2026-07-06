import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/steam', () => ({
  getOwnedGames: vi.fn(async () => []),
  SteamAuthError: class SteamAuthError extends Error {},
  SteamPrivateProfileError: class SteamPrivateProfileError extends Error {},
}))
vi.mock('@/lib/igdb', () => ({
  getGamesBySteamAppIds: vi.fn(async () => new Map()),
}))

import { getSteamConfig, saveSteamConfig } from '@/lib/import-steam'
import { getOwnedGames } from '@/lib/steam'
import { getGamesBySteamAppIds } from '@/lib/igdb'
import type { IgdbGame } from '@/lib/igdb'
import {
  runSteamImport,
  testSteamConnection,
  SteamNotConfiguredError,
} from '@/lib/import-steam'

const USER = 'default-user'
const STEAM_ID = '76561198000000001'

beforeEach(async () => {
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
  vi.mocked(getOwnedGames).mockReset()
  vi.mocked(getGamesBySteamAppIds).mockReset().mockResolvedValue(new Map())
})

describe('getSteamConfig / saveSteamConfig', () => {
  it('non configuré → configured=false', async () => {
    expect(await getSteamConfig(USER)).toEqual({
      configured: false,
      accountId: null,
      lastImportAt: null,
    })
  })

  it('enregistre puis relit la config (sans exposer la clé)', async () => {
    const saved = await saveSteamConfig(USER, { apiKey: 'ma-cle', accountId: STEAM_ID })
    expect(saved).toEqual({ ok: true })
    const config = await getSteamConfig(USER)
    expect(config.configured).toBe(true)
    expect(config.accountId).toBe(STEAM_ID)
    expect(config).not.toHaveProperty('apiKey')
  })

  it('SteamID64 invalide → erreur en français', async () => {
    const result = await saveSteamConfig(USER, { apiKey: 'k', accountId: '1234' })
    expect(result).toEqual({ ok: false, error: 'Le SteamID64 doit comporter 17 chiffres.' })
  })

  it('clé absente à la première configuration → erreur', async () => {
    const result = await saveSteamConfig(USER, { accountId: STEAM_ID })
    expect(result).toEqual({ ok: false, error: 'La clé Web API est requise.' })
  })

  it('mise à jour sans clé → conserve la clé existante', async () => {
    await saveSteamConfig(USER, { apiKey: 'ma-cle', accountId: STEAM_ID })
    const other = '76561198000000002'
    const result = await saveSteamConfig(USER, { accountId: other })
    expect(result).toEqual({ ok: true })
    const row = await prisma.importSource.findUnique({
      where: { userId_provider: { userId: USER, provider: 'STEAM' } },
    })
    expect(row?.apiKey).toBe('ma-cle')
    expect(row?.accountId).toBe(other)
  })
})

const HADES: IgdbGame = {
  igdbId: 113112,
  title: 'Hades',
  coverUrl: null,
  releaseYear: 2020,
  summary: 'A rogue-lite.',
  genres: ['RPG'],
  themes: [],
  platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
  igdbRating: 92,
  gameType: 'Jeu principal',
}

async function configure() {
  await saveSteamConfig(USER, { apiKey: 'k', accountId: STEAM_ID })
}

describe('runSteamImport', () => {
  it('sans configuration → SteamNotConfiguredError', async () => {
    await expect(runSteamImport(USER)).rejects.toThrow(SteamNotConfiguredError)
  })

  it('import initial : matché → entrée À trier ; non-matché → fiche manuelle', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
      { appId: 999999, name: 'Jeu Obscur', playtimeMinutes: 30 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map([[1145360, HADES]]))

    const report = await runSteamImport(USER)
    expect(report).toEqual({
      total: 2,
      added: 2,
      updated: 0,
      unmatched: 1,
      unmatchedTitles: ['Jeu Obscur'],
    })

    const hades = await prisma.game.findUnique({
      where: { igdbId: 113112 },
      include: { entries: true },
    })
    expect(hades?.steamAppId).toBe(1145360)
    expect(hades?.entries[0]).toMatchObject({
      status: 'TO_SORT',
      source: 'STEAM',
      platformsPlayed: ['PC'],
      steamPlaytimeMinutes: 600,
    })

    const obscur = await prisma.game.findUnique({ where: { steamAppId: 999999 } })
    expect(obscur?.igdbId).toBeNull() // fiche manuelle, résolution au fil de l'eau
    expect(obscur?.title).toBe('Jeu Obscur')
  })

  it('relance → aucun doublon, temps de jeu rafraîchis (idempotence)', async () => {
    await configure()
    const owned = [
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
      { appId: 999999, name: 'Jeu Obscur', playtimeMinutes: 30 },
    ]
    vi.mocked(getOwnedGames).mockResolvedValue(owned)
    vi.mocked(getGamesBySteamAppIds).mockResolvedValue(new Map([[1145360, HADES]]))
    await runSteamImport(USER)

    // Relance avec temps de jeu qui ont bougé
    vi.mocked(getOwnedGames).mockResolvedValue([
      { ...owned[0], playtimeMinutes: 700 },
      owned[1],
    ])
    const report = await runSteamImport(USER)
    expect(report.added).toBe(0)
    expect(report.updated).toBe(2)
    expect(report.unmatched).toBe(0)
    expect(await prisma.game.count()).toBe(2)
    expect(await prisma.libraryEntry.count()).toBe(2)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 1145360 } },
    })
    expect(entry?.steamPlaytimeMinutes).toBe(700)
    // La relance ne repasse pas par IGDB : tout est ancré par steamAppId
    expect(vi.mocked(getGamesBySteamAppIds).mock.lastCall?.[0]).toEqual([])
  })

  it('jeu déjà en bibliothèque (ajout manuel) → fusion, vécu intact', async () => {
    await configure()
    // Hades noté sur Switch, ajouté à la main hier
    const game = await prisma.game.create({
      data: { igdbId: 113112, title: 'Hades', platforms: HADES.platforms },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'FINISHED',
        rating: 18,
        review: 'Chef-d’œuvre.',
        platformsPlayed: ['Switch'],
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map([[1145360, HADES]]))

    const report = await runSteamImport(USER)
    expect(report).toMatchObject({ added: 0, updated: 1, unmatched: 0 })
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry).toMatchObject({
      status: 'FINISHED', // intact
      rating: 18, // intact
      review: 'Chef-d’œuvre.', // intact
      platformsPlayed: ['Switch', 'PC'], // fusion
      steamPlaytimeMinutes: 600,
    })
    expect(await prisma.libraryEntry.count()).toBe(1) // pas de doublon
  })

  it('deux appIds Steam → même jeu IGDB : la première ancre gagne, pas de perte de temps de jeu', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
      { appId: 2000000, name: 'Hades (édition Epic->Steam)', playtimeMinutes: 0 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(
      new Map([
        [1145360, HADES],
        [2000000, HADES],
      ]),
    )

    const report = await runSteamImport(USER)
    expect(report.added).toBe(1)
    expect(await prisma.game.count()).toBe(1)
    expect(await prisma.libraryEntry.count()).toBe(1)

    const hades = await prisma.game.findUnique({
      where: { igdbId: 113112 },
      include: { entries: true },
    })
    expect(hades?.steamAppId).toBe(1145360) // première ancre conservée
    expect(hades?.entries[0]?.steamPlaytimeMinutes).toBe(600) // pas écrasé par 0
  })

  it('met à jour lastImportAt', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([])
    // Bibliothèque Steam vide : rapport à zéro, mais l'import a bien eu lieu
    const report = await runSteamImport(USER)
    expect(report.total).toBe(0)
    const config = await getSteamConfig(USER)
    expect(config.lastImportAt).not.toBeNull()
  })

  it('jeu possédé jamais lancé (0 min) → statut Collection', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 620, name: 'Portal 2', playtimeMinutes: 0 },
    ])
    vi.mocked(getGamesBySteamAppIds).mockResolvedValueOnce(new Map())
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 620 } },
    })
    expect(entry?.status).toBe('OWNED')
  })

  it('relance : une entrée Collection qui gagne du temps de jeu est promue À trier', async () => {
    await configure()
    const owned = [{ appId: 620, name: 'Portal 2', playtimeMinutes: 0 }]
    vi.mocked(getOwnedGames).mockResolvedValue(owned)
    await runSteamImport(USER) // arrive en Collection (0 min)

    vi.mocked(getOwnedGames).mockResolvedValue([{ ...owned[0], playtimeMinutes: 90 }])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({
      where: { game: { steamAppId: 620 } },
    })
    expect(entry?.status).toBe('TO_SORT')
    expect(entry?.steamPlaytimeMinutes).toBe(90)
  })

  it("une entrée requalifiée Collection À LA MAIN avec du temps n'est jamais re-promue", async () => {
    await configure()
    // Bêta jouée (500 min) puis rangée en Collection par l'utilisateur
    const game = await prisma.game.create({
      data: { title: 'Bêta quelconque', steamAppId: 777, platforms: [] },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'OWNED',
        source: 'STEAM',
        platformsPlayed: ['PC'],
        steamPlaytimeMinutes: 500,
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 777, name: 'Bêta quelconque', playtimeMinutes: 520 },
    ])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry?.status).toBe('OWNED') // transition 0 → positif absente : intouché
    expect(entry?.steamPlaytimeMinutes).toBe(520)
  })

  it('une entrée déjà qualifiée (ex. FINISHED) reste intouchée par la promotion', async () => {
    await configure()
    const game = await prisma.game.create({
      data: { title: 'Hades', steamAppId: 1145360, platforms: [] },
    })
    await prisma.libraryEntry.create({
      data: {
        userId: USER,
        gameId: game.id,
        status: 'FINISHED',
        rating: 18,
        source: 'MANUAL',
        platformsPlayed: ['Switch'],
        steamPlaytimeMinutes: 0,
      },
    })
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1145360, name: 'Hades', playtimeMinutes: 600 },
    ])
    await runSteamImport(USER)
    const entry = await prisma.libraryEntry.findFirst({ where: { gameId: game.id } })
    expect(entry?.status).toBe('FINISHED') // seule OWNED est promue
    expect(entry?.rating).toBe(18)
  })
})

describe('testSteamConnection', () => {
  it('renvoie le nombre de jeux possédés', async () => {
    await configure()
    vi.mocked(getOwnedGames).mockResolvedValueOnce([
      { appId: 1, name: 'A', playtimeMinutes: 0 },
      { appId: 2, name: 'B', playtimeMinutes: 0 },
    ])
    expect(await testSteamConnection(USER)).toBe(2)
  })

  it('sans configuration → SteamNotConfiguredError', async () => {
    await expect(testSteamConnection(USER)).rejects.toThrow(SteamNotConfiguredError)
  })
})
