import { describe, it, expect } from 'vitest'
import { PLATFORMS, suggestedPlatforms, igdbPlatformIds } from '@/lib/platforms'

describe('PLATFORMS', () => {
  it('contient les plateformes clés, sans doublon', () => {
    expect(PLATFORMS).toContain('PC')
    expect(PLATFORMS).toContain('PlayStation 2')
    expect(PLATFORMS).toContain('Switch')
    expect(new Set(PLATFORMS).size).toBe(PLATFORMS.length)
  })
})

describe('suggestedPlatforms', () => {
  it('mappe les noms IGDB vers notre vocabulaire', () => {
    expect(
      suggestedPlatforms(['PC (Microsoft Windows)', 'Nintendo Switch', 'PlayStation 4']),
    ).toEqual(['PC', 'Switch', 'PlayStation 4'])
  })

  it('déduplique (Super Famicom et SNES → Super Nintendo)', () => {
    expect(
      suggestedPlatforms(['Super Famicom', 'Super Nintendo Entertainment System']),
    ).toEqual(['Super Nintendo'])
  })

  it('ignore les plateformes inconnues du vocabulaire', () => {
    expect(suggestedPlatforms(['Amazing Obscure Console 3000'])).toEqual([])
  })
})

describe('igdbPlatformIds', () => {
  it('mappe chaque plateforme du vocabulaire (sauf « Autre ») vers au moins un ID IGDB', () => {
    for (const platform of PLATFORMS) {
      if (platform === 'Autre') continue
      expect(igdbPlatformIds(platform).length, platform).toBeGreaterThan(0)
    }
  })

  it('PlayStation → 7 ; Super Nintendo couvre SNES et Super Famicom', () => {
    expect(igdbPlatformIds('PlayStation')).toEqual([7])
    expect(igdbPlatformIds('Super Nintendo')).toContain(19)
    expect(igdbPlatformIds('Super Nintendo')).toContain(58)
  })

  it('« Autre » et inconnu → vide', () => {
    expect(igdbPlatformIds('Autre')).toEqual([])
    expect(igdbPlatformIds('Console imaginaire')).toEqual([])
  })
})
