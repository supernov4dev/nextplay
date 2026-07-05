import { describe, it, expect } from 'vitest'
import { PLATFORMS, suggestedPlatforms } from '@/lib/platforms'

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
