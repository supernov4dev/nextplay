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

const USER = 'default-user'
const STEAM_ID = '76561198000000001'

beforeEach(async () => {
  await prisma.importSource.deleteMany()
  await prisma.libraryEntry.deleteMany()
  await prisma.game.deleteMany()
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { id: USER, name: 'Test' } })
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
